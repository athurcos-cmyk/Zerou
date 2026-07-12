import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarClock, PieChart, ReceiptText, Sparkles, WalletCards, Wallet
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useWelcomeTour } from './welcomeTour.store';

interface Slide {
  icon: ReactNode;
  title: string;
  text: string;
}

const slides: Slide[] = [
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
    text: 'Compromissos são contas com uma data (o IPTU, uma conta pontual). Recorrências se repetem sozinhas (aluguel, Netflix). O app lembra das duas.'
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
  const [index, setIndex] = useState(0);

  // Abre sozinho uma vez quando o espaço já está pronto (onboarding concluído).
  useEffect(() => {
    if (!seen && profile?.defaultWorkspaceId) openTour();
  }, [seen, profile?.defaultWorkspaceId, openTour]);

  // Sempre começa do primeiro slide ao (re)abrir.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open) return null;

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div className="welcome-tour" role="dialog" aria-modal="true" aria-label="Boas-vindas à Granativa">
      <div className="welcome-tour-card">
        <button className="welcome-tour-skip" type="button" onClick={closeTour}>
          Pular
        </button>

        <div className="welcome-tour-icon" aria-hidden="true">{slide.icon}</div>
        <h2 className="welcome-tour-title">{slide.title}</h2>
        <p className="welcome-tour-text">{slide.text}</p>

        <div className="welcome-tour-dots" aria-hidden="true">
          {slides.map((item, i) => (
            <span key={item.title} className={`welcome-tour-dot${i === index ? ' welcome-tour-dot--active' : ''}`} />
          ))}
        </div>

        <div className="welcome-tour-nav">
          {index > 0 ? (
            <button className="button button--subtle" type="button" onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft size={18} aria-hidden="true" /> Voltar
            </button>
          ) : (
            <span />
          )}
          {isLast ? (
            <button className="button button--primary" type="button" onClick={closeTour}>
              Começar
            </button>
          ) : (
            <button className="button button--primary" type="button" onClick={() => setIndex((i) => i + 1)}>
              Próximo <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
