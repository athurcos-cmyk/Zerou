import { useEffect } from 'react';
import { CalendarClock, CheckCircle2, CreditCard, Repeat } from 'lucide-react';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';
import { useBillsTour } from './billsTour.store';

// O mal-entendido que este tour existe pra desfazer (relatado por usuários reais em 2026-08-02):
// as pessoas liam a tela como "onde eu vou pagar minhas contas" e achavam que só servia pra
// registrar o pagamento da fatura do cartão. O slide 3 é o mais importante — é ele que diz, com
// todas as letras, que confirmar NÃO paga nada, só registra o que já aconteceu.
const slides: TourSlide[] = [
  {
    icon: <CalendarClock size={26} aria-hidden="true" />,
    title: 'Tudo que você já sabe que vai pagar',
    text: 'Assinaturas, aluguel, internet, escola, o boleto que chega uma vez só. Cadastre aqui e o Granativa lembra você antes de cada vencimento — e já conta esse valor no seu Comprometido.'
  },
  {
    icon: <Repeat size={26} aria-hidden="true" />,
    title: 'Recorrente ou avulsa',
    text: 'Recorrente é o que se repete sozinho todo ciclo (Netflix, aluguel) — cadastra uma vez e ele reaparece. Avulsa é o compromisso único, que some da lista depois de confirmado.'
  },
  {
    icon: <CheckCircle2 size={26} aria-hidden="true" />,
    title: 'O Granativa não paga nada por você',
    text: 'Quando a cobrança acontecer de verdade, toque em "Já foi paga". Isso não paga a conta — só avisa o Granativa que aconteceu, pra ele criar a despesa e atualizar seu saldo. Você paga onde sempre pagou: no banco, no app, no débito automático.'
  },
  {
    icon: <CreditCard size={26} aria-hidden="true" />,
    title: 'Cobrado no cartão? Vai pra fatura',
    text: 'Ao confirmar, você escolhe de onde saiu o dinheiro. Se escolher um cartão, a despesa entra na fatura dele em vez de descontar do saldo da conta — é assim que assinatura no cartão vira lançamento na fatura certa.'
  }
];

/**
 * Tour da tela de Contas e assinaturas — mesmo padrão de `AnalysisTour`/`CategoriesTour`. Abre sozinho
 * na primeira visita, depois de fechado o tour global (evita empilhar dois modais), e é
 * reabrível pelo botão "Como funciona" no topo da tela (`BillsPage.tsx`).
 */
export function BillsTour() {
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const { open, seen, openTour, closeTour } = useBillsTour();

  useEffect(() => {
    if (!seen && welcomeTourSeen) openTour();
  }, [seen, welcomeTourSeen, openTour]);

  return <SlideTour open={open} slides={slides} ariaLabel="Como funciona Contas e assinaturas" onClose={closeTour} />;
}
