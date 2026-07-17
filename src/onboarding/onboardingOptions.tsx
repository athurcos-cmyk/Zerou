import type { ReactNode } from 'react';
import {
  BellRing, CalendarRange, FolderOpen, LineChart, PiggyBank, PieChart, ShieldCheck, TrendingDown
} from 'lucide-react';

export interface OnboardingChoice {
  id: string;
  label: string;
  icon: ReactNode;
}

export const onboardingGoals: OnboardingChoice[] = [
  { id: 'organizar', label: 'Organizar todos os meus gastos em um só lugar', icon: <FolderOpen size={20} /> },
  { id: 'metas', label: 'Definir metas para guardar dinheiro', icon: <PiggyBank size={20} /> },
  { id: 'categorias', label: 'Controlar melhor quanto gasto por categoria', icon: <PieChart size={20} /> },
  { id: 'dividas', label: 'Criar um plano para sair das dívidas', icon: <ShieldCheck size={20} /> },
  { id: 'visao', label: 'Ter uma visão clara do meu mês financeiro', icon: <CalendarRange size={20} /> }
];

export const onboardingChallenges: OnboardingChoice[] = [
  { id: 'para-onde', label: 'Quero entender para onde meu dinheiro está indo', icon: <LineChart size={20} /> },
  { id: 'gastar-menos', label: 'Eu sei com o que gasto, mas quero gastar menos', icon: <TrendingDown size={20} /> },
  { id: 'guardar', label: 'Não consigo criar o hábito de guardar dinheiro', icon: <PiggyBank size={20} /> },
  { id: 'prazos', label: 'Esqueço de pagar contas no prazo', icon: <BellRing size={20} /> }
];
