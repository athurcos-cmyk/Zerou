import { useMemo, useState } from 'react';
import { Check, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { EmptyState } from '../components/EmptyState';
import { CategoryMark } from '../components/categoryIcons';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { defaultCategoryColors } from '../theme/palette';
import { formatFriendlyDate } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { softDeleteTransaction, toggleTransactionReconciled } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';

export function TransactionsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [cardFilter, setCardFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [showUnreconciledOnly, setShowUnreconciledOnly] = useState(false);

  const categoryMap = useMemo(() => new Map(finance.categories.map((c) => [c.id, c])), [finance.categories]);
  const cardOptions = useMemo(
    () => [
      { value: '', label: 'Todos os cartões' },
      ...cardsData.cards.map((card) => ({ value: card.id, label: card.name }))
    ],
    [cardsData.cards]
  );
  const activeTransactions = useMemo(
    () => finance.transactions.filter((transaction) => !transaction.deletedAt),
    [finance.transactions]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const t of activeTransactions) {
      for (const tag of t.tags ?? []) {
        if (tag) tags.add(tag);
      }
    }
    return [...tags].sort();
  }, [activeTransactions]);

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  // Busca por nome, estabelecimento, tag e categoria — os campos que a pessoa lembra.
  const visibleTransactions = useMemo(() => {
    return activeTransactions.filter((t) => {
      // Filtro por cartão: só as compras daquele cartão.
      if (cardFilter && (t.type !== 'card_purchase' || t.cardId !== cardFilter)) return false;
      if (typeFilter === 'income' && t.type !== 'income') return false;
      if (typeFilter === 'expense' && t.type !== 'expense' && t.type !== 'card_purchase') return false;
      if (typeFilter === 'transfer' && t.type !== 'transfer') return false;
      if (tagFilter.size > 0) {
        const txTags = t.tags ?? [];
        if (!txTags.some((tag) => tagFilter.has(tag))) return false;
      }
      if (showUnreconciledOnly && t.reconciledAt) return false;
      if (!normalizedQuery) return true;
      const categoryName = t.categoryId ? (categoryMap.get(t.categoryId)?.name ?? '') : '';
      const haystack = [t.description, t.merchant, t.tags?.join(' '), categoryName]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return haystack.includes(normalizedQuery);
    });
  }, [activeTransactions, cardFilter, typeFilter, tagFilter, showUnreconciledOnly, normalizedQuery, categoryMap]);

  const typeChips: Array<{ key: typeof typeFilter; label: string }> = [
    { key: 'all', label: 'Tudo' },
    { key: 'expense', label: 'Despesas' },
    { key: 'income', label: 'Receitas' },
    { key: 'transfer', label: 'Transferências' }
  ];

  async function handleDelete(transactionId: string, isCardPurchase: boolean) {
    if (!workspaceId || !user) {
      return;
    }

    const ok = await confirm({
      title: 'Excluir transação?',
      message: isCardPurchase
        ? 'A compra some do extrato e o valor sai da fatura do cartão.'
        : 'Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true
    });

    if (!ok) {
      return;
    }

    softDeleteTransaction(workspaceId, user.uid, transactionId);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Transações</h1>
        </div>
        <Link className="button button--primary" to="/app/transactions/new">
          <Plus size={16} aria-hidden="true" /> Nova
        </Link>
      </div>

      {activeTransactions.length > 0 && (
        <div className="transactions-filter">
          <div className="input-with-icon">
            <Search size={17} aria-hidden="true" />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, categoria, tag, estabelecimento…"
              aria-label="Buscar transações"
            />
          </div>
          <div className="chip-row">
            {typeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`chip${typeFilter === chip.key ? ' chip--active' : ''}`}
                onClick={() => setTypeFilter(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {availableTags.length > 0 && (
            <div className="chip-row">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`chip${tagFilter.has(tag) ? ' chip--active' : ''}`}
                  onClick={() => toggleTagFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          <div className="chip-row">
            <button
              type="button"
              className={`chip${showUnreconciledOnly ? ' chip--active' : ''}`}
              onClick={() => setShowUnreconciledOnly((v) => !v)}
            >
              <Check size={13} aria-hidden="true" /> Não conferidos
            </button>
          </div>
          {cardsData.cards.length > 0 && (
            <SelectField
              label="Cartão"
              value={cardFilter}
              onChange={setCardFilter}
              options={cardOptions}
              sheetTitle="Filtrar por cartão"
              sheetSubtitle="Ver só as compras de um cartão"
            />
          )}
        </div>
      )}

      <article className="surface surface-pad">
        {activeTransactions.length === 0 ? (
          <EmptyState
            illustration="transactions"
            title="Nenhuma transação registrada"
            description="Seus lançamentos de entradas, gastos e transferências aparecem aqui."
            action={
              <Link className="button button--primary button--compact" to="/app/transactions/new">
                <Plus size={16} aria-hidden="true" /> Cadastrar primeira
              </Link>
            }
          />
        ) : visibleTransactions.length === 0 ? (
          <EmptyState
            illustration="transactions"
            compact
            title="Nenhum resultado"
            description={normalizedQuery ? `Nada encontrado para "${query.trim()}".` : 'Nenhuma transação nesse filtro.'}
          />
        ) : (
          <div className="item-list">
            {visibleTransactions.map((transaction) => {
              const isIncome = transaction.type === 'income';
              const isExpense = transaction.type === 'expense' || transaction.type === 'card_purchase';
              const amountClass = isIncome ? 'amount--income' : isExpense ? 'amount--expense' : '';
              const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : null;
              const fallback = isIncome
                ? { icon: 'money', color: defaultCategoryColors.income_salary }
                : transaction.type === 'transfer'
                ? { icon: 'repeat', color: defaultCategoryColors.both_transfer }
                : undefined;
              return (
                <div className="list-row list-row--with-icon" key={transaction.id}>
                  <CategoryMark category={category} fallback={fallback} />
                  <div className="list-row-body">
                    <strong>{transaction.description}</strong>
                    <span className="text-secondary">
                      {transactionTypeLabels[transaction.type]} · {formatFriendlyDate(transaction.date)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong className={amountClass}>
                      {isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(transaction.amountCents)}
                    </strong>
                    <SyncStatusBadge status={transaction.localSyncStatus} />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={transaction.reconciledAt ? 'Desmarcar como conferido' : 'Marcar como conferido'}
                      title={transaction.reconciledAt ? 'Conferido' : 'Marcar como conferido'}
                      style={transaction.reconciledAt ? { color: 'var(--success)' } : undefined}
                      onClick={() => {
                        if (!workspaceId) return;
                        toggleTransactionReconciled(workspaceId, transaction.id, !transaction.reconciledAt);
                      }}
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                    {transaction.type !== 'card_purchase' ? (
                      <Link className="button button--subtle button--compact" to={`/app/transactions/${transaction.id}/edit`}>
                        Editar
                      </Link>
                    ) : null}
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Excluir transação"
                      onClick={() => void handleDelete(transaction.id, transaction.type === 'card_purchase')}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {confirmDialog}
    </section>
  );
}
