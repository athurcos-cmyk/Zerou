import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import crypto from 'crypto';
import { sendWhatsAppMessage, getVerifyToken, whatsappAccessToken } from './metaClient.js';
import { extractExpense } from './extractExpense.js';
import { createTransactionFromMessage } from './createTransactionFromMessage.js';
import { processLinkCode } from './linkAccount.js';

const region = 'southamerica-east1';

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Webhook público da Meta Cloud API para WhatsApp.
 *
 * GET: verificação do webhook (hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx)
 * POST: mensagem recebida
 *
 * Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo com WHATSAPP_APP_SECRET).
 */
export const whatsappWebhook = onRequest(
  { region, maxInstances: 10 },
  async (req, res) => {
    // ── GET: webhook verification ───────────────────────────────────────
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;

      if (mode === 'subscribe' && token === getVerifyToken()) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    // ── POST: incoming message ──────────────────────────────────────────
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Signature validation disabled until WHATSAPP_APP_SECRET is configured.
    // Using the access token (wrong secret) causes HMAC mismatch and Meta stops delivery.
    // TODO: add WHATSAPP_APP_SECRET secret, then uncomment validation below.
    //
    // const appSecret = whatsappAccessToken.value();
    // const signature = req.headers['x-hub-signature-256'] as string;
    // if (appSecret && signature) {
    //   const rawBody = JSON.stringify(req.body);
    //   const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    //   if (signature !== expected) {
    //     res.status(401).json({ error: 'Invalid signature' });
    //     return;
    //   }
    // }

    // Respond 200 immediately — Meta expects fast response
    res.status(200).json({ ok: true });

    try {
      const body = req.body as Record<string, unknown>;
      if (!body || body.object !== 'whatsapp_business_account') return;

      const entries = body.entry as Array<Record<string, unknown>> | undefined;
      if (!entries?.[0]) return;

      const changes = entries[0].changes as Array<Record<string, unknown>> | undefined;
      if (!changes?.[0]) return;

      const value = changes[0].value as Record<string, unknown> | undefined;
      const messages = value?.messages as Array<Record<string, unknown>> | undefined;
      if (!messages?.[0]) return;

      const msg = messages[0];
      const phone = (msg.from as string)?.trim();
      const text = (msg.text as Record<string, unknown>)?.body as string | undefined;
      if (!phone || !text) return;

      const cleanText = text.trim();
      if (!cleanText) return;

      logger.info('whatsapp_message_received', { phone, text: cleanText.slice(0, 100) });

      // ── Check if it's a linking code ────────────────────────────────
      if (/vincular\s+\d{6}/i.test(cleanText)) {
        const reply = await processLinkCode(phone, cleanText);
        if (reply) {
          await sendWhatsAppMessage(phone, reply);
        }
        return;
      }

      // ── Look up workspace by phone number ───────────────────────────
      const db = getFirestore();
      const indexDoc = await db.doc(`whatsappPhoneIndex/${phone}`).get();
      if (!indexDoc.exists) {
        await sendWhatsAppMessage(
          phone,
          'Seu WhatsApp ainda não está vinculado ao Granativa. Vá em Configurações > WhatsApp no app para conectar.',
        );
        return;
      }

      const link = indexDoc.data() as {
        workspaceId: string;
        linkedByUid: string;
      };
      const { workspaceId, linkedByUid } = link;
      if (!workspaceId || !linkedByUid) return;

      // ── Load categories ─────────────────────────────────────────────
      const catsSnap = await db
        .collection(`workspaces/${workspaceId}/categories`)
        .where('isActive', '==', true)
        .where('type', 'in', ['expense', 'both'])
        .get();

      const categories = catsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
      }));

      // ── Get default account ─────────────────────────────────────────
      const accountsSnap = await db
        .collection(`workspaces/${workspaceId}/accounts`)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      const defaultAccountId = accountsSnap.docs[0]?.id;
      if (!defaultAccountId) {
        await sendWhatsAppMessage(
          phone,
          'Você ainda não tem uma conta cadastrada no Granativa. Crie uma conta primeiro pelo app.',
        );
        return;
      }

      // ── Extract expense with DeepSeek ───────────────────────────────
      const extraction = await extractExpense(cleanText, categories);

      if (!extraction || extraction.confidence === 'low') {
        await sendWhatsAppMessage(
          phone,
          'Não consegui entender o valor. Pode reformular? Ex: "gastei 15 reais no mercado"',
        );
        return;
      }

      // ── Create transaction ──────────────────────────────────────────
      const result = await createTransactionFromMessage({
        workspaceId,
        userId: linkedByUid,
        amountCents: extraction.amountCents,
        description: extraction.description,
        categoryId: extraction.categoryId,
        accountId: defaultAccountId,
        date: new Date(),
        source: 'whatsapp',
      });

      // ── Confirm ─────────────────────────────────────────────────────
      const catSuffix = result.categoryName ? ` (${result.categoryName})` : '';
      await sendWhatsAppMessage(
        phone,
        `✅ Registrado: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`,
      );

      logger.info('whatsapp_transaction_created', {
        phone,
        workspaceId,
        transactionId: result.id,
        amountCents: result.amountCents,
      });
    } catch (err) {
      logger.error('whatsapp_webhook_error', { message: (err as Error).message });
    }
  },
);
