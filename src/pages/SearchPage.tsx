import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { toDateInputValue } from '../finance/financeDates';
import { billStatusLabels, transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';

export function SearchPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const transactions = finance.transactions
      .filter((transaction) => !transaction.deletedAt)
      .filter((transaction) =>
        [transaction.description, transaction.merchant, transaction.notes, transaction.tags.join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(normalizedQuery)
      )
      .map((transaction) => ({
        id: transaction.id,
        kind: 'Transação',
        title: transaction.description,
        detail: `${transactionTypeLabels[transaction.type]} · ${toDateInputValue(transaction.date)}`,
        amountCents: transaction.amountCents
      }));

    const bills = finance.bills
      .filter((bill) => bill.description.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((bill) => ({
        id: bill.id,
        kind: 'Conta a pagar',
        title: bill.description,
        detail: `${billStatusLabels[bill.status]} · ${toDateInputValue(bill.dueDate)}`,
        amountCents: bill.amountCents
      }));

    const accounts = finance.accounts
      .filter((account) => account.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((account) => ({
        id: account.id,
        kind: 'Conta',
        title: account.name,
        detail: 'Conta financeira',
        amountCents: account.openingBalanceCents
      }));

    return [...transactions, ...bills, ...accounts].slice(0, 25);
  }, [finance.accounts, finance.bills, finance.transactions, normalizedQuery]);

  return (
    <section className="page-content page-content--narrow">
      <p className="eyebrow">Busca</p>
      <h1 className="page-title">Encontrar no Zerou.</h1>
      <p className="page-description">Busca simples em contas, transações e compromissos já carregados neste dispositivo.</p>

      <label className="field search-field">
        <span>Termo</span>
        <div className="input-with-icon">
          <Search size={18} aria-hidden="true" />
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mercado, aluguel, salário" />
        </div>
      </label>

      <article className="surface surface-pad">
        {results.length > 0 ? (
          <div className="item-list">
            {results.map((result) => (
              <div className="list-row" key={`${result.kind}-${result.id}`}>
                <div>
                  <strong>{result.title}</strong>
                  <span className="text-secondary">
                    {result.kind} · {result.detail}
                  </span>
                </div>
                <strong>{formatMoney(result.amountCents)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-secondary">{normalizedQuery ? 'Nenhum resultado encontrado.' : 'Digite algo para buscar.'}</p>
        )}
      </article>
    </section>
  );
}
