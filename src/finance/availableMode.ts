import type { AvailableMode } from '../types/contracts';

/**
 * Perfil sem `availableMode` (nunca escolheu explicitamente) usa este default.
 *
 * Mudou pra 'conservative' mais cedo em 2026-07-26 (junto com a remoção do mini tutorial
 * forçado), voltou pra 'until_payday' horas depois, na mesma sessão, por um motivo
 * técnico concreto encontrado numa conversa de design (`/office-hours`): 'conservative'
 * usa uma JANELA ROLANTE (`now + N dias`) — ela nunca esvazia de verdade, porque no
 * instante em que uma conta fixa mensal é paga, a ocorrência do mês seguinte já está
 * dentro da janela e reabastece o Comprometido imediatamente. Isso faz o "Disponível"
 * ficar preso perto de zero/negativo pra qualquer pessoa que não acumula reserva acima
 * de ~1 mês de custo fixo — não é um cálculo errado, é a mecânica da janela rolante não
 * combinando com a forma como as pessoas sentem alívio depois de pagar as contas.
 * 'until_payday' usa uma data FIXA (o próximo recebimento) — o Comprometido dela drena
 * de verdade conforme as contas são pagas ao longo do ciclo, só voltando a subir quando
 * o corte pula pro pagamento seguinte. É esse comportamento que combina com o modelo
 * mental das pessoas.
 *
 * A rede de segurança que 'conservative' como default tentava dar (nunca contar com
 * salário que ainda não caiu) não se perde: `calculateNextMonthProjection` já força
 * 'conservative' internamente, sempre, independente deste default — é ali que vive a
 * visão pessimista/completa, isolada, não no número do dia a dia.
 *
 * Pra quem nunca configurou recebimento (nem `payday`, nem receita futura lançada),
 * 'until_payday' cai automaticamente na mesma janela de `committedWindowDays` que
 * 'conservative' usaria (`resolveCommittedCutoff`) — ou seja, esse default não muda nada
 * pra usuário novo, só corrige o comportamento de quem já tem recebimento configurado.
 * Quem já tinha escolhido um modo explicitamente (`profile.availableMode` já preenchido)
 * não é afetado — só o fallback pra quem nunca escolheu nada muda.
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
