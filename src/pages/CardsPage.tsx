import { useState, type FormEvent } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { cardBrandOptions, type CreateCreditCardInput } from '../cards/cardSchemas';
import { createCreditCard } from '../cards/cardService';
import { useCardsData } from '../cards/useCardsData';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';

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
      setMessage('Conclua o onboarding antes de criar cartões.');
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
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar o cartão agora.');
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
              <p className="eyebrow">Novo cartão</p>
              <h2>Cadastrar cartão</h2>
            </div>
            <span className="empty-icon">
              <Plus size={20} aria-hidden="true" />
            </span>
          </div>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Nome</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cartão principal" />
          </label>
          <label className="field">
            <span>Últimos 4 dígitos</span>
            <input className="input" inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value)} />
          </label>
          <label className="field">
            <span>Bandeira</span>
            <select className="select" value={brand} onChange={(event) => setBrand(event.target.value as CreateCreditCardInput['brand'])}>
              {cardBrandOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Limite</span>
            <input className="input" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="0,00" />
          </label>
          <div className="form-grid-2">
            <label className="field">
              <span>Fechamento</span>
              <input className="input" type="number" min={1} max={28} value={closingDay} onChange={(event) => setClosingDay(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Vencimento</span>
              <input className="input" type="number" min={1} max={28} value={dueDay} onChange={(event) => setDueDay(Number(event.target.value))} />
            </label>
          </div>
          <button className="button button--primary" type="submit">
            Criar cartão
          </button>
        </form>

        <article className="surface surface-pad">
          <p className="eyebrow">Cartões ativos</p>
          {cardsData.cards.length > 0 ? (
            <div className="item-list">
              {cardsData.cards.map((card) => (
                <Link className="list-row list-row--link" to={`/app/cards/${card.id}`} key={card.id}>
                  <div>
                    <strong>{card.name}</strong>
                    <span className="text-secondary">
                      {card.brand} final {card.lastFour} · fecha dia {card.closingDay}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(card.limitCents)}</strong>
                    <CreditCard size={20} aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhum cartão criado ainda.</p>
          )}
        </article>
      </div>
    </section>
  );
}
