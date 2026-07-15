import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

export const whatsappAccessToken = defineString('WHATSAPP_ACCESS_TOKEN');
export const whatsappPhoneNumberId = defineString('WHATSAPP_PHONE_NUMBER_ID');
export const whatsappVerifyToken = defineString('WHATSAPP_VERIFY_TOKEN');
export const granativaWhatsAppNumber = defineString('GRANATIVA_WHATSAPP_NUMBER');

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
      logger.warn('whatsapp_send_failed', { phoneNumber, status: response.status, body: body.slice(0, 300) });
    }
  } catch (err) {
    logger.warn('whatsapp_send_error', { phoneNumber, message: (err as Error).message });
  }
}
