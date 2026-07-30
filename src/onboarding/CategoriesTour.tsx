import { useEffect } from 'react';
import { FolderTree, IndentIncrease, Layers, PieChart, Plus } from 'lucide-react';
import { SlideTour, type TourSlide } from './SlideTour';
import { useWelcomeTour } from './welcomeTour.store';
import { useCategoriesTour } from './categoriesTour.store';

/**
 * Ordem pensada como uma pergunta puxando a próxima: o que é isso → como detalho → o que muda
 * quando eu detalho → onde isso aparece → como faço. O slide 3 é o que mais importa: virar
 * agrupamento é a única coisa da tela que muda o comportamento de OUTRA tela (a categoria some
 * da lista do lançamento), e ninguém adivinha isso sozinho.
 */
const slides: TourSlide[] = [
  {
    icon: <FolderTree size={26} aria-hidden="true" />,
    title: 'Categoria é o rótulo do gasto',
    text: 'É ela que faz a Análise conseguir dizer pra onde seu dinheiro foi. Aqui você cria, renomeia, troca a cor e o ícone das suas — com calma, fora da hora do lançamento.'
  },
  {
    icon: <IndentIncrease size={26} aria-hidden="true" />,
    title: 'Subcategoria detalha uma principal',
    text: 'Dentro de Casa você pode ter Energia e Água. A subcategoria herda a cor da principal: mudou a cor de Casa, as duas mudam junto.'
  },
  {
    icon: <Layers size={26} aria-hidden="true" />,
    title: 'Quem ganha subcategoria vira agrupamento',
    text: 'A partir da primeira subcategoria, o lançamento passa a ser feito direto nela — Casa sai da lista na hora de lançar e fica só como guarda-chuva. Enquanto não tiver nenhuma, ela funciona normalmente.'
  },
  {
    icon: <PieChart size={26} aria-hidden="true" />,
    title: 'Na Análise, o gasto sobe pra principal',
    text: 'O gráfico mostra Casa já com Energia e Água somadas. Toque na linha da lista pra abrir a divisão e ver quanto cada subcategoria pesa dentro dela.'
  },
  {
    icon: <Plus size={26} aria-hidden="true" />,
    title: 'Pra criar',
    text: 'O botão "Nova", aqui em cima, cria uma categoria principal. O "+" na linha de uma principal já cria a subcategoria dentro dela. Você também continua criando categoria na hora de lançar.'
  }
];

/**
 * Tutorial da tela de Categorias — mesmo padrão do `AnalysisTour`. Abre sozinho na primeira
 * visita, depois de fechado o tour global (evita empilhar dois modais em quem chega aqui antes
 * de ver o tour geral). Reabrível pelo botão "Como funciona" da própria tela.
 */
export function CategoriesTour() {
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const { open, seen, openTour, closeTour } = useCategoriesTour();

  useEffect(() => {
    if (!seen && welcomeTourSeen) openTour();
  }, [seen, welcomeTourSeen, openTour]);

  return <SlideTour open={open} slides={slides} ariaLabel="Como funcionam as categorias" onClose={closeTour} />;
}
