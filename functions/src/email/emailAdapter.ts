export type EmailKind =
  | 'welcome'
  | 'security'
  | 'invite'
  | 'billing_failed'
  | 'cancellation'
  | 'privacy_request'
  | 'follow_up'
  | 'activation_checkin'
  | 'admin_message';

export interface EmailInput {
  kind: EmailKind;
  to: string;
  subject?: string;
  data?: Record<string, string>;
}

export interface EmailResult {
  sent: boolean;
  provider: string | null;
  reason?: string;
}

export const emailTemplates: Record<EmailKind, { subject: string; purpose: string }> = {
  welcome: {
    subject: 'Bem-vindo à Granativa',
    purpose: 'Recepcionar a conta e orientar primeiros passos.'
  },
  security: {
    subject: 'Alerta de seguranca da Granativa',
    purpose: 'Avisar sobre mudancas de acesso, metodos vinculados ou eventos sensiveis.'
  },
  invite: {
    subject: 'Convite para espaco compartilhado na Granativa',
    purpose: 'Enviar convite de espaco compartilhado sem expor informacao financeira pessoal.'
  },
  billing_failed: {
    subject: 'Falha de pagamento na Granativa',
    purpose: 'Fluxo futuro de billing. Nao usado no lancamento gratuito.'
  },
  cancellation: {
    subject: 'Cancelamento registrado na Granativa',
    purpose: 'Fluxo futuro de cancelamento de assinatura.'
  },
  privacy_request: {
    subject: 'Solicitacao de privacidade recebida',
    purpose: 'Confirmar abertura de protocolo LGPD.'
  },
  follow_up: {
    subject: 'Já deu uma olhada na Granativa?',
    purpose: 'Lembrete 3 dias após cadastro para incentivar o uso do app.'
  },
  activation_checkin: {
    subject: 'Como está indo na Granativa?',
    purpose: 'Checkpoint 7 dias após cadastro — muda a mensagem conforme a pessoa já lançou algo ou não.'
  },
  admin_message: {
    subject: 'Mensagem da Granativa',
    purpose: 'Mensagem avulsa enviada pelo admin (individual ou broadcast) — texto livre, sem propósito fixo.'
  }
};

export async function sendOperationalEmail(input: EmailInput): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim() || 'resend';

  if (provider === 'disabled') {
    return {
      sent: false,
      provider: null,
      reason: `Email provider is disabled. ${input.kind} email to ${input.to} was not sent.`
    };
  }

  if (provider === 'resend') {
    const { sendWithResend } = await import('./resendProvider.js');
    return sendWithResend(input);
  }

  return {
    sent: false,
    provider,
    reason: `Unknown email provider: ${provider}`
  };
}
