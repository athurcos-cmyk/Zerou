export type EmailKind =
  | 'welcome'
  | 'security'
  | 'invite'
  | 'billing_failed'
  | 'cancellation'
  | 'privacy_request';

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
    subject: 'Bem-vindo a Zerou',
    purpose: 'Recepcionar a conta e orientar primeiros passos.'
  },
  security: {
    subject: 'Alerta de seguranca da Zerou',
    purpose: 'Avisar sobre mudancas de acesso, metodos vinculados ou eventos sensiveis.'
  },
  invite: {
    subject: 'Convite para espaco compartilhado na Zerou',
    purpose: 'Enviar convite de espaco compartilhado sem expor informacao financeira pessoal.'
  },
  billing_failed: {
    subject: 'Falha de pagamento na Zerou',
    purpose: 'Fluxo futuro de billing. Nao usado no lancamento gratuito.'
  },
  cancellation: {
    subject: 'Cancelamento registrado na Zerou',
    purpose: 'Fluxo futuro de cancelamento de assinatura.'
  },
  privacy_request: {
    subject: 'Solicitacao de privacidade recebida',
    purpose: 'Confirmar abertura de protocolo LGPD.'
  }
};

export async function sendOperationalEmail(input: EmailInput): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim() || null;

  if (!provider || provider === 'disabled') {
    return {
      sent: false,
      provider,
      reason: `Email provider not configured for ${input.kind}. No fake send was performed.`
    };
  }

  return {
    sent: false,
    provider,
    reason: 'Provider adapter is not implemented yet. Configure a real provider before enabling email sends.'
  };
}
