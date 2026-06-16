import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, CreditCard, ReceiptText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { CategoryField } from '../components/CategoryField';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels } from '../cards/cardLabels';
import { createCardPurchase } from '../cards/cardService';
import { useCardsData } from '../cards/useCardsData';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
import { createCategory, deleteCategory } from '../finance/financeService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { useFinanceData } from '../finance/useFinanceData';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function CardDetailPage() {
  const { cardId } = useParams();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsData(workspaceId);
  const finance = useFinanceData(workspaceId, user?.uid);
  const card = cardsData.cards.find((item) => item.id === cardId);
  const invoices = cardsData.invoices.filter((invoice) => invoice.cardId === cardId);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [installments, setInstallments] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  async function handlePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user || !cardId) {
      setMessage('Não foi possível localizar o cartão.');
      return;
    }

    try {
      await createCardPurchase(workspaceId, user.uid, {
        cardId,
        description,
        amountCents: parseMoneyToCents(amount),
        purchaseDate: fromDateInputValue(purchaseDate),
        categoryId,
        installments
      });
      setDescription('');
      setAmount('');
      setPurchaseDate(todayInputValue());
      setCategoryId('');
      setInstallments(1);
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar a compra agora.'));
    }
  }

  if (!card && !cardsData.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Cartão</p>
        <h1 className="page-title">Cartão não encontrado.</h1>
        <Link className="button button--secondary" to="/app/cards">
          Voltar para cartões
        </Link>
      </section>
    );
  }

  const usedCents = card
    ? cardsData.invoices
        .filter((invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed'))
        .reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0)
    : 0;
  const availableCents = card ? Math.max(0, card.limitCents - usedCents) : 0;
  const usedPercent = card && card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
  const barClass =
    usedPercent >= 90 ? 'card-limit-bar-fill--danger' :
    usedPercent >= 70 ? 'card-limit-bar-fill--warning' : '';

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Cartão</p>
          <h1 className="page-title">{card?.name ?? 'Carregando cartão'}</h1>
          <p className="page-description">
            {card ? `${card.brand} ···· ${card.lastFour} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}` : 'Carregando dados.'}
          </p>
        </div>
        <Link className="button button--secondary" to="/app/cards">
          Todos os cartões
        </Link>
      </div>

      {card ? (
        <div className="surface surface-pad card-limit-block">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Limite disponível</p>
              <span className="card-limit-available">{formatMoney(availableCents)}</span>
              <span className="text-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.86rem' }}>de {formatMoney(card.limitCents)}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Fatura em aberto</p>
              <span className="card-limit-available amount--expense">{formatMoney(usedCents)}</span>
            </div>
          </div>
          <div className="card-limit-bar-track" aria-label={`${usedPercent}% do limite usado`}>
            <div className={`card-limit-bar-fill ${barClass}`} style={{ width: `${Math.max(2, usedPercent)}%` }} />
          </div>
          {usedPercent >= 70 && (
            <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
              {usedPercent >= 90 ? 'Limite quase esgotado.' : 'Mais de 70% do limite em uso.'}
            </p>
          )}
        </div>
      ) : null}

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handlePurchase}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nova compra</p>
              <h2>Registrar no cartão</h2>
            </div>
            <ReceiptText size={22} aria-hidden="true" />
          </div>
          <p className="text-secondary" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.55 }}>
            Para parcelado, informe o valor total e o número de parcelas.
          </p>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex: Supermercado, Cinema..." />
          </label>
          <label className="field">
            <span>Valor total da compra</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Data da compra</span>
            <input className="input" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
          </label>
          <CategoryField
            value={categoryId}
            onChange={setCategoryId}
            categories={finance.categories}
            filterType="expense"
            onCreateCategory={async (name, icon, type, color) => {
              if (!workspaceId || !user) return;
              const id = await createCategory(workspaceId, user.uid, { name, icon, type, color });
              setCategoryId(id);
            }}
            onDeleteCategory={async (id) => {
              if (!workspaceId) return;
              await deleteCategory(workspaceId, id);
            }}
          />
          <SelectField
            label="Parcelamento"
            value={String(installments)}
            onChange={(v) => setInstallments(Number(v))}
            options={Array.from({ length: 24 }, (_, i) => i + 1).map((n) => ({
              value: String(n),
              label: n === 1 ? '1x à vista' : `${n}x`
            }))}
          />
          <button className="button button--primary" type="submit">
            Registrar compra
          </button>
        </form>

        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Faturas</p>
              <h2>Histórico de faturas</h2>
            </div>
            <CalendarClock size={22} aria-hidden="true" />
          </div>
          {invoices.length > 0 ? (
            <div className="item-list">
              {invoices.map((invoice) => {
                const isPaid = invoice.status === 'paid' || invoice.status === 'overpaid';
                return (
                  <Link className="list-row list-row--link" key={invoice.id} to={`/app/cards/${invoice.cardId}/invoices/${invoice.id}`}>
                    <div>
                      <strong>Fatura {invoice.referenceMonth}</strong>
                      <span className="text-secondary">
                        {invoiceStatusLabels[invoice.status]} · vence {toDateInputValue(invoice.dueDate)}
                      </span>
                    </div>
                    <div className="list-row-end">
                      <strong className={isPaid ? 'amount--income' : invoice.outstandingBalanceCents > 0 ? 'amount--expense' : ''}>
                        {formatMoney(invoice.outstandingBalanceCents)}
                      </strong>
                      {isPaid && (
                        <span className="sync-badge sync-badge--synced">Paga</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty-copy">
              <span className="empty-icon">
                <CreditCard size={24} aria-hidden="true" />
              </span>
              <p className="text-secondary">Nenhuma fatura ainda. Registre a primeira compra ao lado.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
