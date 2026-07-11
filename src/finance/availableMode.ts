import type { AvailableMode } from '../types/contracts';

/**
 * Perfil sem `availableMode` (conta criada antes do mini tutorial existir, ou pessoa
 * que ainda não passou por ele) mantém o comportamento histórico do app — trocar esse
 * default muda o número do Dashboard de todo mundo de uma vez.
 */
export const defaultAvailableMode: AvailableMode = 'until_payday';

export const availableModeLabels: Record<AvailableMode, string> = {
  conservative: 'Conservador',
  until_payday: 'Até o próximo recebimento'
};

export const availableModeSummaries: Record<AvailableMode, string> = {
  conservative: 'Nunca conta com o salário chegando. Olha uma janela fixa de dias à frente — cada parcela de cartão entra só quando o vencimento dela chega perto, não todas de uma vez.',
  until_payday: 'Conta com o seu próximo recebimento: só o que vence antes dele pesa. O resto aparece quando chegar mais perto.'
};
