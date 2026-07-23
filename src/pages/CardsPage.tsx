import { useState, type FormEvent } from 'react';
import { ChevronDown, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext } from '../finance/FinanceDataContext';
import { EmptyState } from '../components/EmptyState';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { cardBrandOptions, type CreateCreditCardInput } from '../cards/cardSchemas';
import { createCreditCard } from '../cards/cardService';
import { pickCurrentInvoice } from '../cards/cardDates';

import { formatFriendlyDate, formatFriendlyMonth } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function CardsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsContext();
  const [name, setName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [brand, setBrand] = useState<CreateCreditCardInput['brand']>('Visa');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState(10);
  const [dueDay, setDueDay] = useState(20);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar cartões.');
      return;
    }

    // Vai direto pra página do cartão recém-criado: é lá que a pessoa traz as compras que
    // já existem (parcelas em andamento / compras futuras). A maioria já chega com parcelas
    // no cartão, então esconder isso num segundo passo confundia. `createCreditCard` devolve
    // o id na hora (o write é fire-and-forget), então dá pra navegar imediatamente.
    createCreditCard(workspaceId, user.uid, {
      name,
      lastFour,
      brand,
      limitCents: parseMoneyToCents(limit),
      closingDay,
      dueDay,
      colorToken: 'chart-1'
    })
      .then((id) => navigate(`/app/cards/${id}?novo=1`))
      .catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o cartão agora.')));
    setName('');
    setLastFour('');
    setBrand('Visa');
    setLimit('');
    setClosingDay(10);
    setDueDay(20);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Cartões</h1>
        </div>
        <SyncStatusBadge status={cardsData.pendingWrites ? 'pending' : 'synced'} />
      </div>

      <div className="finance-grid">
        <article className="surface surface-pad">
          <p className="eyebrow">Seus cartões</p>
          <h2 style={{ margin: '0.25rem 0 1rem' }}>Cartões ativos</h2>
          {cardsData.cards.length > 0 ? (
            <div className="card-list-hero-list">
              {cardsData.cards.map((card) => {
                const activeInvoices = cardsData.invoices.filter(
                  (invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed')
                );
                const openInvoice = pickCurrentInvoice(activeInvoices);
                const usedCents = activeInvoices.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
                const availableCents = Math.max(0, card.limitCents - usedCents);
                const usedPercent = card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
                const barClass =
                  usedPercent >= 90 ? 'card-list-hero-fill--danger' :
                  usedPercent >= 70 ? 'card-list-hero-fill--warning' : '';

                return (
                  <Link className="card-list-hero" to={`/app/cards/${card.id}`} key={card.id}>
                    <div className="card-list-hero-inner">
                      <div className="card-list-hero-header">
                        <div>
                          <span className="card-list-hero-eyebrow">
                            {card.brand} ···· {card.lastFour} · fecha dia {card.closingDay}
                          </span>
                          <strong className="card-list-hero-name">{card.name}</strong>
                        </div>
                        <CreditCard size={20} aria-hidden="true" className="card-list-hero-icon" />
                      </div>
                      <div>
                        <span className="card-list-hero-label">Disponível</span>
                        <strong className="card-list-hero-balance">{formatMoney(availableCents)}</strong>
                        <span className="card-list-hero-of">de {formatMoney(card.limitCents)}</span>
                      </div>
                      <div className="card-list-hero-track" aria-label={`${usedPercent}% do limite usado`}>
                        <div className={`card-list-hero-fill ${barClass}`} style={{ width: `${Math.max(2, usedPercent)}%` }} />
                      </div>
                    </div>
                    {openInvoice && openInvoice.outstandingBalanceCents > 0 && (
                      <div className="card-list-hero-footer">
                        <span className="card-list-hero-meta">
                          Fatura {formatFriendlyMonth(openInvoice.referenceMonth)} · vence {formatFriendlyDate(openInvoice.dueDate)}
                        </span>
                        <strong className="amount--expense">{formatMoney(openInvoice.outstandingBalanceCents)}</strong>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              illustration="cards"
              title="Nenhum cartão cadastrado"
              description="Adicione seu primeiro cartão para acompanhar compras, parcelas e faturas sem misturar com o saldo das contas."
            />
          )}
        </article>

        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <button
            type="button"
            className="form-accordion-toggle"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <div>
              <p className="eyebrow">Adicionar cartão</p>
              <h2 style={{ margin: 0 }}>Cadastrar novo cartão</h2>
            </div>
            <ChevronDown
              size={20}
              aria-hidden="true"
              style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-normal)', flexShrink: 0, color: 'var(--text-secondary)' }}
            />
          </button>
          {formOpen && (
            <>
              <FormMessage>{message}</FormMessage>
              <div className="card-limit-hero">
                <span className="card-limit-hero-label">Limite do cartão</span>
                <span className="card-limit-hero-wrap">
                  <span className="card-limit-hero-currency">R$</span>
                  <input
                    className="card-limit-hero-input"
                    inputMode="decimal"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    placeholder="0,00"
                    aria-label="Limite do cartão"
                  />
                </span>
              </div>
              <label className="field">
                <span>Nome do cartão</span>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cartão principal" />
              </label>
              <label className="field">
                <span>Últimos 4 dígitos</span>
                <input className="input" inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value)} placeholder="0000" />
              </label>
              <SelectField
                label="Bandeira"
                value={brand}
                onChange={(v) => setBrand(v as CreateCreditCardInput['brand'])}
                options={cardBrandOptions.map((b) => ({ value: b, label: b }))}
              />
              <div className="form-grid-2">
                <label className="field">
                  <span>Dia de fechamento</span>
                  <input className="input" type="number" min={1} max={28} value={closingDay} onChange={(event) => setClosingDay(Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Dia de vencimento</span>
                  <input className="input" type="number" min={1} max={28} value={dueDay} onChange={(event) => setDueDay(Number(event.target.value))} />
                </label>
              </div>
              <button className="button button--primary" type="submit">
                Adicionar cartão
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
