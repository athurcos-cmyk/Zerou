import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, ReceiptText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels } from '../cards/cardLabels';
import { createCardPurchase } from '../cards/cardService';
import { useCardsData } from '../cards/useCardsData';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { useFinanceData } from '../finance/useFinanceData';

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
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a compra agora.');
    }
  }

  if (!card && !cardsData.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Cartão</p>
        <h1 className="page-title">Cartão não encontrado.</h1>
        <Link className="button button--secondary" to="/app/cards">
          Voltar
        </Link>
      </section>
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Cartão</p>
          <h1 className="page-title">{card?.name ?? 'Carregando cartão'}</h1>
          <p className="page-description">
            {card ? `${card.brand} final ${card.lastFour}. Fecha dia ${card.closingDay}, vence dia ${card.dueDay}.` : 'Carregando dados.'}
          </p>
        </div>
        <Link className="button button--secondary" to="/app/cards">
          Todos os cartões
        </Link>
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handlePurchase}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Compra</p>
              <h2>Registrar compra no cartão</h2>
            </div>
            <ReceiptText size={22} aria-hidden="true" />
          </div>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="field">
            <span>Valor total</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Data</span>
            <input className="input" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Categoria</span>
            <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Sem categoria</option>
              {finance.categories
                .filter((category) => category.type !== 'income')
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Parcelas</span>
            <input className="input" type="number" min={1} max={24} value={installments} onChange={(event) => setInstallments(Number(event.target.value))} />
          </label>
          <button className="button button--primary" type="submit">
            Registrar compra
          </button>
        </form>

        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Faturas</p>
              <h2>Ciclos do cartão</h2>
            </div>
            <CalendarClock size={22} aria-hidden="true" />
          </div>
          {invoices.length > 0 ? (
            <div className="item-list">
              {invoices.map((invoice) => (
                <Link className="list-row list-row--link" key={invoice.id} to={`/app/cards/${invoice.cardId}/invoices/${invoice.id}`}>
                  <div>
                    <strong>Fatura {invoice.referenceMonth}</strong>
                    <span className="text-secondary">
                      {invoiceStatusLabels[invoice.status]} · vence {toDateInputValue(invoice.dueDate)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(invoice.outstandingBalanceCents)}</strong>
                    <span className="text-secondary">pendente</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhuma fatura criada. Registre a primeira compra.</p>
          )}
        </article>
      </div>
    </section>
  );
}
