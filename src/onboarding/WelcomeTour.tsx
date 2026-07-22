import {
  CalendarClock, PieChart, ReceiptText, Sparkles, WalletCards, Wallet
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
    title: 'Nunca perca um vencimento',
    text: 'Contas a Pagar reune o que voce deve: contas avulsas (IPTU, uma conta pontual) e recorrentes (aluguel, Netflix) — tudo na mesma tela.'
  },
  {
    icon: <Wallet size={26} aria-hidden="true" />,
    title: 'Disponível × Comprometido',
    text: 'O número que importa: quanto você tem, menos o que já está prometido (faturas, contas, recorrências). Você escolhe como ele é calculado.'
  },
  {
    icon: <PieChart size={26} aria-hidden="true" />,
    title: 'Metas, a dois e Análise',
    text: 'Guarde com objetivo no cofrinho, organize as contas do casal, e veja pra onde seu dinheiro vai — por categoria e por mês — na Análise.'
  }
];

/**
 * Tour de boas-vindas em slides. Abre sozinho uma vez, depois do onboarding (quando o
 * usuário já tem workspace e ainda não viu), e é reabrível pelo menu ("Como funciona").
 * Fica montado no `AppShell`. O mini-tutorial do "Disponível" no Dashboard espera este
 * fechar (via `useWelcomeTour().seen`) pra não empilhar dois modais.
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
