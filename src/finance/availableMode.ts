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
  conservative: 'Conta tudo que você já deve, inclusive parcelas de meses futuros. Nunca assume que o salário vai cair.',
  until_payday: 'Conta só o que vence antes do seu próximo recebimento. O resto aparece quando chegar mais perto.'
};
