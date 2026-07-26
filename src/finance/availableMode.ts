import type { AvailableMode } from '../types/contracts';

/**
 * Perfil sem `availableMode` (nunca escolheu explicitamente) usa este default. Mudado
 * de 'until_payday' pra 'conservative' em 2026-07-26 — o mini tutorial que forçava essa
 * escolha no primeiro acesso foi removido ("nenhum usuário está entendendo" os dois
 * modos, pedido da dona) e 'conservative' é o lado seguro (nunca conta com dinheiro que
 * ainda não entrou — mesma leitura que a Projeção do próximo mês já usa sempre). Quem já
 * tinha escolhido um modo explicitamente (`profile.availableMode` já preenchido) não é
 * afetado — só o fallback pra quem nunca escolheu nada muda.
 */
export const defaultAvailableMode: AvailableMode = 'conservative';

export const availableModeLabels: Record<AvailableMode, string> = {
  conservative: 'Conservador',
  until_payday: 'Até o próximo recebimento'
};

export const availableModeSummaries: Record<AvailableMode, string> = {
  conservative: 'Nunca conta com o salário chegando. Olha uma janela fixa de dias à frente — cada parcela de cartão entra só quando o vencimento dela chega perto, não todas de uma vez.',
  until_payday: 'Conta com o seu próximo recebimento: só o que vence antes dele pesa. O resto aparece quando chegar mais perto.'
};
