import { defineString, defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

export const whatsappAccessToken = defineString('WHATSAPP_ACCESS_TOKEN');
export const whatsappPhoneNumberId = defineString('WHATSAPP_PHONE_NUMBER_ID');
export const whatsappVerifyToken = defineString('WHATSAPP_VERIFY_TOKEN');
export const granativaWhatsAppNumber = defineString('GRANATIVA_WHATSAPP_NUMBER');

// App Secret da Meta — usado SÓ pra validar o HMAC (X-Hub-Signature-256) dos webhooks.
// `defineSecret` (Google Secret Manager), nunca em plaintext. Setar com:
//   npx firebase functions:secrets:set WHATSAPP_APP_SECRET --project zerou-26757
export const whatsappAppSecret = defineSecret('WHATSAPP_APP_SECRET');

const META_API_BASE = 'https://graph.facebook.com/v25.0';

function accessToken(): string {
  const token = whatsappAccessToken.value();
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN must be configured.');
  return token;
}

function phoneNumberId(): string {
  const id = whatsappPhoneNumberId.value();
  if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID must be configured.');
  return id;
}

export function getVerifyToken(): string {
  return whatsappVerifyToken.value();
}

export function getWhatsAppNumber(): string {
  return granativaWhatsAppNumber.value();
}

/** Send a WhatsApp text message back to the user via Meta Cloud API. */
export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<void> {
  const token = accessToken();
  const fromId = phoneNumberId();

  try {
    const response = await fetch(`${META_API_BASE}/${fromId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('whatsapp_send_failed', { phoneNumber, status: response.status, body: body.slice(0, 300) });
      throw new Error(`WhatsApp API returned ${response.status}`);
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (!msg.startsWith('WhatsApp API returned')) {
      logger.error('whatsapp_send_network_error', { phoneNumber, message: msg });
    }
    throw err;
  }
}
