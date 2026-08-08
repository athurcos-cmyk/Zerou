import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { invoiceValueCents } from '../domain/invoices/calculateInvoice';
import { formatFriendlyMonth } from '../finance/financeDates';
import { formatMoney } from '../finance/money';

/**
 * Faixa de faturas — **o gráfico É o seletor de mês**.
 *
 * Uma coluna por fatura do cartão, altura pelo valor da fatura, tocável. Vive em duas telas
 * (`InvoicePage` e `CardDetailPage`) e por isso saiu de dentro da primeira: as duas precisam da
 * MESMA escala e da MESMA métrica, senão o mesmo mês teria alturas diferentes dependendo de onde a
 * pessoa está olhando — que é o jeito mais rápido de um gráfico perder a confiança de quem lê.
 *
 * Quem chama decide QUAIS faturas entram (a regra de visibilidade é da tela, não daqui) e em que
 * ordem — a faixa desenha o que recebe, sem reordenar.
 */
export interface InvoiceStripInvoice {
  id: string;
  cardId: string;
  referenceMonth: string;
  purchasesTotalCents: number;
  feesTotalCents: number;
  creditsTotalCents: number;
}

interface InvoiceStripProps {
  /** Já filtradas pela tela e em ordem cronológica (`referenceMonth asc`). */
  invoices: InvoiceStripInvoice[];
  /** Fatura em destaque (coluna opaca). Sem ela, todas ficam em silhueta. */
  activeInvoiceId?: string;
  cardId: string;
}

export function InvoiceStrip({ invoices, activeInvoiceId, cardId }: InvoiceStripProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // A coluna ativa entra centralizada. Sem isso, abrir a fatura de out/2027 mostraria a faixa
  // parada em 2026 e a coluna selecionada fora da tela — o seletor não diria onde você está.
  // Mexe só no `scrollLeft` da faixa (e não em `scrollIntoView`, que subiria a PÁGINA junto).
  useEffect(() => {
    const track = trackRef.current;
    const active = activeRef.current;
    if (!track || !active) return;
    track.scrollLeft = active.offsetLeft - (track.clientWidth - active.clientWidth) / 2;
  }, [activeInvoiceId, invoices.length]);

  // Faixa de uma coluna só não é seletor nem comparação — é enfeite ocupando o topo da tela.
  if (invoices.length < 2) return null;

  // Escala vem de TODAS as colunas, não das visíveis na rolagem — mesma regra do `.invoice-row-bar`
  // (DESIGN.md): escala que muda conforme se rola faria o mesmo mês parecer ter valores diferentes.
  const maxCents = Math.max(0, ...invoices.map(invoiceValueCents));

  return (
    <nav className="invoice-strip" aria-label="Faturas do cartão">
      <div className="invoice-strip-track" ref={trackRef}>
        {invoices.map((invoice) => {
          const isActive = invoice.id === activeInvoiceId;
          const valueCents = invoiceValueCents(invoice);
          // Mínimo de 4% pra fatura vazia/pequena continuar sendo um alvo de toque visível em vez
          // de virar um traço de 1px que não dá pra acertar com o dedo.
          const heightPercent = maxCents > 0 ? Math.max(4, Math.round((valueCents / maxCents) * 100)) : 4;
          const [monthLabel, yearLabel] = formatFriendlyMonth(invoice.referenceMonth).split(' ');
          return (
            <Link
              key={invoice.id}
              ref={isActive ? activeRef : undefined}
              className="invoice-strip-col"
              to={`/app/cards/${cardId}/invoices/${invoice.id}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Fatura de ${formatFriendlyMonth(invoice.referenceMonth)} · ${formatMoney(valueCents)}`}
            >
              <span className="invoice-strip-bar" aria-hidden="true">
                <span style={{ height: `${heightPercent}%` }} />
              </span>
              <span className="invoice-strip-month" aria-hidden="true">
                {monthLabel} {yearLabel?.slice(2)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
