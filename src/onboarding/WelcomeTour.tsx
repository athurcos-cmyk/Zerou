import {
  Bot, CalendarClock, FolderTree, PieChart, ReceiptText, Sparkles, Telescope, TrendingUp, WalletCards
} from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';

const slides: TourSlide[] = [
  {
    icon: <Sparkles size={26} aria-hidden="true" />,
    title: 'Bem-vindo à Granativa',
    text: 'Seu controle financeiro pessoal — e, quando quiser, organização a dois. Um tour rápido pra você saber onde fica cada coisa.'
  },
  {
    icon: <ReceiptText size={26} aria-hidden="true" />,
    title: 'Lance tudo num lugar só',
    text: 'Receitas, gastos e transferências entram pelo botão + no centro. O Extrato guarda o histórico completo, com busca por nome, categoria ou tag.'
  },
  {
    icon: <WalletCards size={26} aria-hidden="true" />,
    title: 'Cartões sem susto',
    text: 'Uma compra parcelada vira uma parcela por mês na fatura — nada de um valor gigante de uma vez. Dá até pra antecipar as parcelas quando sobrar.'
  },
  {
    icon: <CalendarClock size={26} aria-hidden="true" />,
    title: 'O que você deve e o que vão te pagar',
    text: 'Contas a Pagar reúne o que você deve — avulsas (IPTU) e recorrentes (aluguel, Netflix). Contas a Receber anota o que ainda não é seu: só entra no saldo quando você marcar como recebido.'
  },
  {
    icon: <Telescope size={26} aria-hidden="true" />,
    title: 'Saldo, Comprometido e Projeção',
    text: 'Três números que importam: quanto você tem agora, o quanto já está prometido (contas fixas, recorrentes e fatura do cartão) — e, se quiser simular, quanto sobraria mês que vem com o salário que você prevê.'
  },
  {
    icon: <FolderTree size={26} aria-hidden="true" />,
    title: 'Categorias que se organizam',
    text: 'Cada categoria pode virar um grupo com subcategorias — Água e Energia dentro de Casa, por exemplo. Veja como funciona em Configurações > Categorias.'
  },
  {
    icon: <TrendingUp size={26} aria-hidden="true" />,
    title: 'Seus investimentos, no mesmo lugar',
    text: 'Acompanhe o quanto sua reserva rendeu — por conta e por investimento individual, com aporte e resgate registrados como transação de verdade.'
  },
  {
    icon: <PieChart size={26} aria-hidden="true" />,
    title: 'Metas, a dois e Análise',
    text: 'Guarde com objetivo no cofrinho, organize as contas do casal, e veja pra onde seu dinheiro vai — por categoria e por mês — na Análise.'
  },
  {
    icon: <Bot size={26} aria-hidden="true" />,
    title: 'Vic, sua assistente',
    text: 'Converse com a Vic no app pra tirar dúvidas com seus dados reais, ou lance um gasto direto pelo WhatsApp, sem nem abrir o app.'
  }
];

/**
 * Tour de boas-vindas em slides. Abre sozinho uma vez, depois do onboarding (quando o
 * usuário já tem workspace e ainda não viu), e é reabrível pelo menu ("Como funciona").
 * Fica montado no `AppShell`.
 */
export function WelcomeTour() {
  const { profile } = useAuth();
  const { open, seen, openTour, closeTour } = useWelcomeTour();

  // Abre sozinho uma vez quando o espaço já está pronto (onboarding concluído).
  useEffect(() => {
    if (!seen && profile?.defaultWorkspaceId) openTour();
  }, [seen, profile?.defaultWorkspaceId, openTour]);

  return (
    <SlideTour open={open} slides={slides} ariaLabel="Boas-vindas à Granativa" onClose={closeTour} lastLabel="Começar" />
  );
}
