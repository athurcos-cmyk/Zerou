import { useEffect } from 'react';
import { ArrowLeftRight, HandCoins, ShieldCheck, Wallet } from 'lucide-react';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';
import { useReceivablesTour } from './receivablesTour.store';

// Espelho do `BillsTour`. A regra que esta tela precisa ensinar é a INVERSA da outra: lá o app
// não paga por você, aqui o app não recebe por você — e, principalmente, anotar não coloca
// dinheiro nenhum no saldo. O slide 4 existe porque as duas telas são um par e foram
// confundidas entre si (relato de usuários em 2026-08-02).
const slides: TourSlide[] = [
  {
    icon: <HandCoins size={26} aria-hidden="true" />,
    title: 'Dinheiro que ainda não é seu',
    text: 'O freela que o cliente vai pagar, o dinheiro que você emprestou pra um amigo, o racha do jantar. Anote aqui pra não esquecer de cobrar — e pra saber quanto ainda tem pra entrar.'
  },
  {
    icon: <ShieldCheck size={26} aria-hidden="true" />,
    title: 'Anotar não mexe no seu saldo',
    text: 'Enquanto o dinheiro não cair de verdade, ele não conta em lugar nenhum: nem no Saldo total, nem na Análise. É de propósito — dinheiro prometido não é dinheiro na mão, e o app nunca vai inflar seu saldo com uma promessa.'
  },
  {
    icon: <Wallet size={26} aria-hidden="true" />,
    title: 'Caiu na conta? Toque em "Recebi"',
    text: 'Aí sim o Granativa cria a receita na conta que você escolher e o valor entra no seu saldo. Se ninguém pagar, é só cancelar — some da lista sem virar receita nenhuma.'
  },
  {
    icon: <ArrowLeftRight size={26} aria-hidden="true" />,
    title: 'O oposto de Contas e assinaturas',
    text: 'São duas telas irmãs: em Contas e assinaturas fica o que VOCÊ deve; aqui fica o que devem A VOCÊ. Nenhuma das duas move dinheiro sozinha — as duas esperam você confirmar que aconteceu.'
  }
];

/**
 * Tour da tela de Dinheiro a receber — mesmo padrão de `BillsTour`/`AnalysisTour`. Abre sozinho
 * na primeira visita, depois de fechado o tour global (evita empilhar dois modais), e é
 * reabrível pelo botão "Como funciona" no topo da tela (`ReceivablesPage.tsx`).
 */
export function ReceivablesTour() {
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const { open, seen, openTour, closeTour } = useReceivablesTour();

  useEffect(() => {
    if (!seen && welcomeTourSeen) openTour();
  }, [seen, welcomeTourSeen, openTour]);

  return <SlideTour open={open} slides={slides} ariaLabel="Como funciona Dinheiro a receber" onClose={closeTour} />;
}
