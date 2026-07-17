// Espelha src/onboarding/onboardingOptions.tsx (onboardingGoals/onboardingChallenges,
// so os labels — sem icone). Cloud Functions nao importa src/ do app cliente (pacotes
// separados); mantenha em sincronia manualmente se o app mudar esses valores.
export const onboardingGoalLabels: Record<string, string> = {
  organizar: 'organizar todos os gastos em um só lugar',
  metas: 'definir metas para guardar dinheiro',
  categorias: 'controlar melhor quanto gasta por categoria',
  dividas: 'criar um plano para sair das dívidas',
  visao: 'ter uma visão clara do mês financeiro'
};

export const onboardingChallengeLabels: Record<string, string> = {
  'para-onde': 'entender para onde o dinheiro está indo',
  'gastar-menos': 'gastar menos (já sabe com o que gasta)',
  guardar: 'não conseguir criar o hábito de guardar dinheiro',
  prazos: 'esquecer de pagar contas no prazo'
};
