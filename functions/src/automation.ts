import { type DocumentReference, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { sendPushToUser } from './push.js';

const region = 'southamerica-east1';

function nowInBRT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function currentYearMonth(): string {
  const d = nowInBRT();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// 'YYYY-MM-DD' no fuso de São Paulo (`en-CA` já sai nesse formato). Comparar a CHAVE de dia,
// e não o instante, evita erro de fuso: a function roda em UTC e o app grava em BRT.
function brtDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// '20/07' no fuso de São Paulo.
function brtDayMonth(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ─── closeInvoicesDue ─────────────────────────────────────────────────────────
// Roda todo dia à meia-noite (BRT). Fecha as faturas de cartões cujo
// dia de fechamento é hoje. Sem isso, o fechamento depende do usuário
// abrir o app e clicar manualmente.
export const closeInvoicesDue = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const today = nowInBRT().getDate();
    const currentMonth = currentYearMonth();
    let closed = 0;

    const cardsSnap = await db
      .collectionGroup('cards')
      .where('closingDay', '==', today)
      .where('isActive', '==', true)
      .get();

    for (const cardDoc of cardsSnap.docs) {
      try {
        const card = cardDoc.data() as {
          workspaceId: string;
          ownerUserId?: string;
          name: string;
        };
        const { workspaceId, ownerUserId } = card;
        const cardId = cardDoc.id;

        const invoicesSnap = await db
          .collection(`workspaces/${workspaceId}/cards/${cardId}/invoices`)
          .where('status', '==', 'open')
          .where('referenceMonth', '<=', currentMonth)
          .get();

        for (const invoiceDoc of invoicesSnap.docs) {
          await invoiceDoc.ref.update({
            status: 'closed',
            updatedAt: FieldValue.serverTimestamp(),
          });
          closed++;

          if (ownerUserId) {
            // outstandingBalanceCents e mantido incrementalmente por
            // invoiceLedgerEntryTrigger.ts — não precisa mais resomar o ledger aqui.
            const outstandingCents = (invoiceDoc.data().outstandingBalanceCents as number | undefined) ?? 0;

            await sendPushToUser(
              ownerUserId,
              `Fatura ${card.name} fechada`,
              `Valor a pagar: ${formatBRL(outstandingCents)}`,
              'https://granativa.com.br/app/cards'
            ).catch(() => {});
          }
        }
      } catch (err) {
        logger.error('closeInvoicesDue: erro ao processar card — pulando', err);
      }
    }

    logger.info('close_invoices_finished', { today, currentMonth, closed });
  }
);

// ─── generateRecurrences (hoje é LEMBRETE, não gerador) ───────────────────────
// Roda todo dia às 6h (BRT). NÃO debita e NÃO cria nada: só AVISA que a recorrência
// venceu. Decisão de produto (2026-07-21): dinheiro só se move quando a pessoa confirma
// — o débito automático podia tirar dinheiro de uma assinatura já cancelada que a pessoa
// esqueceu de desativar aqui. Quem registra é a pessoa, pelo botão "Registrar" da tela
// Contas a Pagar (`recordRecurringPayment`), que é quem avança `nextOccurrenceAt`.
//
// Por isso a data NUNCA é tocada aqui: enquanto a ocorrência não for registrada ela
// segue vencida e o botão segue liberado. Como a regra continuaria "vencida" todo dia, o
// push repetiria — então guardamos a última ocorrência avisada num doc à parte
// (`recurringNotifyState/{ruleId}`), no mesmo molde do `budgetAlertState` do
// `sendBudgetAlerts`: coleção escrita só por esta função (Admin SDK), sem regra em
// `firestore.rules` e sem acesso do cliente. Cada ocorrência gera no máximo UM aviso.
//
// O nome `generateRecurrences` ficou por compatibilidade de deploy — renomear apagaria e
// recriaria a function e o job do Cloud Scheduler.
export const generateRecurrences = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    let notified = 0;
    let skipped = 0;

    const rulesSnap = await db
      .collectionGroup('recurring')
      .where('isActive', '==', true)
      .where('nextOccurrenceAt', '<=', now)
      .get();

    for (const ruleDoc of rulesSnap.docs) {
      try {
        const rule = ruleDoc.data() as {
          workspaceId: string;
          createdBy: string;
          description: string;
          amountCents?: number;
          nextOccurrenceAt: Timestamp;
        };

        const stateRef = db.doc(
          `workspaces/${rule.workspaceId}/recurringNotifyState/${ruleDoc.id}`
        );
        const lastNotified = (await stateRef.get()).data()?.lastNotifiedOccurrenceAt as
          | Timestamp
          | undefined;

        // Já avisamos desta MESMA ocorrência — não repete enquanto não for registrada.
        if (lastNotified && lastNotified.isEqual(rule.nextOccurrenceAt)) {
          skipped++;
          continue;
        }

        // Sem valor definido a recorrência ainda merece o aviso (a pessoa informa o valor
        // na hora de registrar) — só não dá pra dizer quanto é.
        const valuePrefix = rule.amountCents ? `${formatBRL(rule.amountCents)} · ` : '';

        // "vence hoje" só quando é hoje de verdade. Se a ocorrência já passou (ex.: a regra foi
        // criada depois das 6h, então o primeiro aviso só sai na manhã seguinte), dizer "vence
        // hoje" seria mentira — nesse caso mostra a data em que venceu.
        const occurrenceDate = rule.nextOccurrenceAt.toDate();
        const venceHoje = brtDateKey(occurrenceDate) === brtDateKey(new Date());
        const titulo = venceHoje
          ? `${rule.description} vence hoje`
          : `${rule.description} venceu em ${brtDayMonth(occurrenceDate)}`;

        await sendPushToUser(
          rule.createdBy,
          titulo,
          `${valuePrefix}nada foi debitado — não se esqueça de registrar`,
          'https://granativa.com.br/app/bills'
        ).catch(() => {});

        await stateRef.set({
          ruleId: ruleDoc.id,
          workspaceId: rule.workspaceId,
          lastNotifiedOccurrenceAt: rule.nextOccurrenceAt,
          updatedAt: FieldValue.serverTimestamp(),
        });
        notified++;
      } catch (err) {
        logger.error('generateRecurrences: erro ao processar regra — pulando', err);
      }
    }

    logger.info('recurrence_reminders_finished', { notified, skipped });
  }
);

// ─── sendDueReminders ─────────────────────────────────────────────────────────
// Roda todo dia às 8h (BRT). Envia push para contas a pagar (bills) com
// vencimento nos próximos 3 dias. O usuário é avisado antes de esquecer.
export const sendDueReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const now = nowInBRT();
    const threeDaysAhead = new Date(now);
    threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);

    const fromTs = Timestamp.fromDate(now);
    const toTs = Timestamp.fromDate(threeDaysAhead);
    let sent = 0;

    const billsSnap = await db
      .collectionGroup('bills')
      .where('status', '==', 'pending')
      .where('dueDate', '>=', fromTs)
      .where('dueDate', '<=', toTs)
      .get();

    for (const billDoc of billsSnap.docs) {
      try {
        const bill = billDoc.data() as {
          createdBy: string;
        description: string;
        amountCents: number;
        dueDate: Timestamp;
      };

      const dayLabel = bill.dueDate.toDate().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });

      await sendPushToUser(
        bill.createdBy,
        'Conta vence em breve',
        `${bill.description}: ${formatBRL(bill.amountCents)} vence em ${dayLabel}`,
        'https://granativa.com.br/app/bills'
      ).catch(() => {});
      sent++;
      } catch (err) {
        logger.error('sendDueReminders: erro ao processar bill — pulando', err);
      }
    }

    logger.info('due_reminders_finished', { sent });
  }
);

// ─── sendDailyLogReminder ─────────────────────────────────────────────────────
// Roda todo dia às 20h (BRT). Envia push personalizado com o nome do usuário,
// usando um pool de mensagens variadas pra não ficar repetitivo. Stale tokens
// são limpos por usuário (mesmo padrão do sendPushToUser).
const DAILY_REMINDER_MESSAGES: string[] = [
  'Como foi o dia, {name}? Não esquece de registrar seus gastos.',
  '{name}, passou um café hoje? Registra aí!',
  'Boa noite, {name}! Dá 2 minutinhos pro seu dinheiro?',
  '{name}, todo centavo registrado é um centavo sob controle.',
  'Fechou as contas do dia, {name}? Passa a régua aí.',
  'Seu futuro eu agradece, {name}. Registra os gastos de hoje!',
  '{name}, o pix, o docinho, o busão… deu pra anotar tudo?',
  'Antes de dormir, {name}: já registrou o que gastou hoje?',
  '{name}, 2 minutinhos agora = zero surpresa no fim do mês.',
  'O dinheiro some se você não der nome pra ele, {name}. Bora registrar!',
  'Não deixa pra amanhã o registro que você pode fazer hoje, {name}.',
  '{name}, seu Granativa tá te esperando. Registra os gastos de hoje?',
];

function pickDailyMessage(name: string): string {
  const template = DAILY_REMINDER_MESSAGES[Math.floor(Math.random() * DAILY_REMINDER_MESSAGES.length)];
  return template.replace('{name}', name);
}

function extractUserIdFromTokenPath(docPath: string): string | null {
  const parts = docPath.split('/');
  return parts[1] ?? null;
}

export const sendDailyLogReminder = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();

    // Agrupa tokens por usuário em vez de mandar tudo num multicast cego.
    const tokensSnap = await db.collectionGroup('fcmTokens').get();
    if (tokensSnap.empty) return;

    const byUser = new Map<string, { token: string; ref: DocumentReference }[]>();
    const userIds = new Set<string>();

    for (const doc of tokensSnap.docs) {
      const userId = extractUserIdFromTokenPath(doc.ref.path);
      const token = doc.data().token as string | undefined;
      if (!userId || !token) continue;

      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId)!.push({ token, ref: doc.ref });
      userIds.add(userId);
    }

    if (userIds.size === 0) return;

    // Lê nomes de perfil em batch (até 1 leitura por usuário).
    const profileSnaps = await db.getAll(
      ...[...userIds].map((uid) => db.doc(`users/${uid}`))
    );
    const nameByUser = new Map<string, string>();
    for (const snap of profileSnaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { name?: string; displayName?: string };
      nameByUser.set(snap.id, data?.name || data?.displayName || '');
    }

    const DEFAULT_NAME = '';
    const messaging = getMessaging();
    let sentUsers = 0;
    let staleRemoved = 0;

    for (const [userId, entries] of byUser) {
      try {
        const displayName = nameByUser.get(userId) ?? DEFAULT_NAME;
      const name = displayName || 'você';
      const body = pickDailyMessage(name);

      const tokens = entries.map((e) => e.token);

      const response = await messaging.sendEachForMulticast({
        tokens,
        webpush: {
          notification: {
            title: 'Hora de registrar!',
            body,
            icon: '/brand/granativa-app-icon-192.png',
            badge: '/brand/granativa-app-icon-192.png',
          },
          fcmOptions: { link: 'https://granativa.com.br/app/transactions/new' },
        },
      });

      // Limpa tokens stale (dispositivo desinstalado/revogado) — mesmo padrão do push.ts.
      const staleRefs = response.responses
        .map((r, i) => ({ ok: r.success, entry: entries[i] }))
        .filter(({ ok }) => !ok)
        .map(({ entry }) => entry.ref);

      if (staleRefs.length > 0) {
        await Promise.all(staleRefs.map((ref) => ref.delete()));
        staleRemoved += staleRefs.length;
      }

      sentUsers++;
      } catch (err) {
        logger.error('sendDailyLogReminder: erro — pulando', err);
      }
    }

    logger.info('daily_log_reminder_finished', { sentUsers, staleRemoved });
  }
);
