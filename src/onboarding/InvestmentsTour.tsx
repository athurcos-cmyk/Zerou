import { useEffect } from 'react';
import { TrendingUp, ArrowUpRight, AlertCircle } from 'lucide-react';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';
import { useInvestmentsTour } from './investmentsTour.store';

const slides: TourSlide[] = [
  {
    icon: <TrendingUp size={26} aria-hidden="true" />,
    title: 'Seus investimentos, organizados',
    text: 'Cadastre a corretora ou banco onde você investe e, dentro dela, cada investimento — CDB, Tesouro, ações, o que for.'
  },
  {
    icon: <ArrowUpRight size={26} aria-hidden="true" />,
    title: 'Aportar e resgatar de verdade',
    text: 'Mandar dinheiro pra um investimento tira o valor de uma conta bancária de verdade — e aparece no seu Extrato e na sua Análise, como qualquer outro gasto.'
  },
  {
    icon: <AlertCircle size={26} aria-hidden="true" />,
    title: 'A Granativa não se conecta com sua corretora',
    text: 'Ninguém consegue saber quanto seu investimento rendeu sozinho. De vez em quando, digite o valor atual e o app calcula o rendimento pra você.'
  }
];

export function InvestmentsTour() {
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const { open, seen, openTour, closeTour } = useInvestmentsTour();

  useEffect(() => {
    if (!seen && welcomeTourSeen) openTour();
  }, [seen, welcomeTourSeen, openTour]);

  return <SlideTour open={open} slides={slides} ariaLabel="Como funcionam os Investimentos" onClose={closeTour} />;
}
