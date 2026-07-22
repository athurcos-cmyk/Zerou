import { useEffect } from 'react';
import { BarChart2, EllipsisVertical, PieChart, TrendingUp } from 'lucide-react';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';
import { useAnalysisTour } from './analysisTour.store';

const slides: TourSlide[] = [
  {
    icon: <BarChart2 size={26} aria-hidden="true" />,
    title: 'Pra onde foi seu dinheiro',
    text: 'Navegue pelos meses com as setas e compare o gasto total com o mês anterior ou com o mesmo mês do ano passado.'
  },
  {
    icon: <PieChart size={26} aria-hidden="true" />,
    title: 'Gasto por categoria',
    text: 'O gráfico mostra o peso de cada categoria no mês. Dá pra travar um limite mensal por categoria em Orçamentos, no menu de ações.'
  },
  {
    icon: <TrendingUp size={26} aria-hidden="true" />,
    title: 'Histórico mensal',
    text: 'Entradas e saídas dos últimos 6 meses, lado a lado — bom pra enxergar se o gasto está subindo ou caindo.'
  },
  {
    icon: <EllipsisVertical size={26} aria-hidden="true" />,
    title: 'Mais ações',
    text: 'O botão no topo reúne Orçamentos, Tendência por categoria, Resumo anual, Exportar CSV e Busca — tudo num só lugar.'
  }
];

/**
 * Tour de boas-vindas da tela de Análise — mesmo padrão do `WelcomeTour` (global), só que
 * escopado a esta tela. Abre sozinho na primeira visita, depois de fechado o tour global
 * (evita empilhar dois modais quando a pessoa entra em Análise antes de ver o tour geral).
 * Reabrível pelo item "Como funciona a Análise" no sheet "Mais ações" (`SearchPage.tsx`).
 */
export function AnalysisTour() {
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const { open, seen, openTour, closeTour } = useAnalysisTour();

  useEffect(() => {
    if (!seen && welcomeTourSeen) openTour();
  }, [seen, welcomeTourSeen, openTour]);

  return <SlideTour open={open} slides={slides} ariaLabel="Como funciona a Análise" onClose={closeTour} />;
}
