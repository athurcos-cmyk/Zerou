import { Resend } from 'resend';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { render } from '@react-email/render';
import type { EmailInput, EmailResult, EmailKind } from './emailAdapter.js';
import { emailTemplates } from './emailAdapter.js';
import { WelcomeEmail } from './templates/WelcomeEmail.js';
import { GoodbyeEmail } from './templates/GoodbyeEmail.js';
import { FollowUpEmail } from './templates/FollowUpEmail.js';

export const resendApiKey = defineSecret('RESEND_API_KEY');

function getApiKey(): string {
  return process.env.RESEND_API_KEY || resendApiKey.value();
}

const FROM = 'Granativa <suporte@granativa.com.br>';

function pickTemplate(input: EmailInput): React.ReactElement | null {
  const name = input.data?.name || 'usuário';

  // Follow-up de 3 dias: detecta pelo subject override
  if (input.kind === 'welcome' && input.subject?.includes('deu uma olhada')) {
    return FollowUpEmail({ name });
  }

  switch (input.kind) {
    case 'welcome':
      return WelcomeEmail({ name });
    case 'cancellation':
      return GoodbyeEmail({ name });
    default:
      return null;
  }
}

export async function sendWithResend(input: EmailInput): Promise<EmailResult> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { sent: false, provider: 'resend', reason: 'RESEND_API_KEY not configured.' };
    }

    const resend = new Resend(apiKey);
    const template = emailTemplates[input.kind];
    const component = pickTemplate(input);

    if (!component) {
      return { sent: false, provider: 'resend', reason: `No template component for email kind: ${input.kind}` };
    }

    const html = await render(component);

    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject || template.subject,
      html,
    });

    if (error) {
      logger.error(`Resend send failed for ${input.kind} to ${input.to}`, error);
      return { sent: false, provider: 'resend', reason: error.message };
    }

    logger.info(`Resend sent ${input.kind} to ${input.to}`);
    return { sent: true, provider: 'resend' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Resend error';
    logger.error(`Resend error for ${input.kind}`, err);
    return { sent: false, provider: 'resend', reason: message };
  }
}
