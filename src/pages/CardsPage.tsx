import { useState, type FormEvent } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { cardBrandOptions, type CreateCreditCardInput } from '../cards/cardSchemas';
import { createCreditCard } from '../cards/cardService';
import { useCardsData } from '../cards/useCardsData';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function CardsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsData(workspaceId);
  const [name, setName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [brand, setBrand] = useState<CreateCreditCardInput['brand']>('Visa');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState(10);
  const [dueDay, setDueDay] = useState(20);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar cartões.');
      return;
    }

    try {
      await createCreditCard(workspaceId, user.uid, {
        name,
        lastFour,
        brand,
        limitCents: parseMoneyToCents(limit),
        closingDay,
        dueDay,
        colorToken: 'chart-1'
      });
      setName('');
      setLastFour('');
      setBrand('Visa');
      setLimit('');
      setClosingDay(10);
      setDueDay(20);
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o cartão agora.'));
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Cartões</p>
          <h1 className="page-title">Cartões e faturas sem dupla contagem.</h1>
          <p className="page-description">Compras reconhecem despesa. Pagamentos quitam passivo sem virar outra despesa.</p>
        </div>
        <SyncStatusBadge status={cardsData.pendingWrites ? 'pending' : 'synced'} />
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Adicionar cartão</p>
              <h2>Cadastrar novo cartão</h2>
            </div>
            <span className="empty-icon">
              <Plus size={20} aria-hidden="true" />
            </span>
          </div>
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
        </form>

        <article className="surface surface-pad">
          <p className="eyebrow">Seus cartões</p>
          <h2 style={{ margin: '0.25rem 0 1rem' }}>Cartões ativos</h2>
          {cardsData.cards.length > 0 ? (
            <div className="item-list">
              {cardsData.cards.map((card) => {
                const usedCents = cardsData.invoices
                  .filter((invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed'))
                  .reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
                const availableCents = Math.max(0, card.limitCents - usedCents);
                const usedPercent = card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
                const barClass =
                  usedPercent >= 90 ? 'card-limit-bar-fill--danger' :
                  usedPercent >= 70 ? 'card-limit-bar-fill--warning' : '';

                return (
                  <Link className="list-row list-row--link" to={`/app/cards/${card.id}`} key={card.id}>
                    <div className="card-list-item" style={{ flex: 1 }}>
                      <div className="card-list-item-top">
                        <div>
                          <strong>{card.name}</strong>
                          <span className="text-secondary">
                            {card.brand} ···· {card.lastFour} · fecha dia {card.closingDay}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CreditCard size={20} aria-hidden="true" />
                        </div>
                      </div>
                      <div className="card-limit-block" style={{ marginBottom: 0 }}>
                        <div className="card-limit-bar-track" aria-hidden="true">
                          <div className={`card-limit-bar-fill ${barClass}`} style={{ width: `${usedPercent}%` }} />
                        </div>
                        <div className="card-limit-row">
                          <span className="text-secondary">
                            Disponível: <strong className="card-limit-available">{formatMoney(availableCents)}</strong>
                          </span>
                          <span className="text-secondary">de {formatMoney(card.limitCents)}</span>
                        </div>
                      </div>
                    </div>
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
      </div>
    </section>
  );
}
