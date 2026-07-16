import { useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { CategoryMark } from '../components/categoryIcons';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { defaultCategoryColors } from '../theme/palette';
import { formatFriendlyDate } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { softDeleteTransaction } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Transaction } from '../types/contracts';

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      if (!normalizedQuery) return true;
      const categoryName = t.categoryId ? (categoryMap.get(t.categoryId)?.name ?? '') : '';
      const haystack = [t.description, t.merchant, t.tags?.join(' '), categoryName]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return haystack.includes(normalizedQuery);
    });
  }, [activeTransactions, cardFilter, typeFilter, tagFilter, normalizedQuery, categoryMap]);

  const typeChips: Array<{ key: typeof typeFilter; label: string }> = [
    { key: 'all', label: 'Tudo' },
    { key: 'expense', label: 'Despesas' },
    { key: 'income', label: 'Receitas' },
    { key: 'transfer', label: 'Transferências' }
  ];

  // Filtros secundários (tag, cartão) ficam escondidos atrás de um botão "Filtros" —
  // mostrar os grupos soltos na tela, além do tipo, virava uma parede de chips no
  // celular (7+ chips empilhados, achado real testando em 375px).
  const activeSecondaryFilterCount = (tagFilter.size > 0 ? 1 : 0) + (cardFilter ? 1 : 0);

  function clearSecondaryFilters() {
    setTagFilter(new Set());
    setCardFilter('');
  }

  async function handleDelete(transaction: Transaction) {
    if (!workspaceId || !user) {
      return;
    }

    const isCardPurchase = transaction.type === 'card_purchase';
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

    softDeleteTransaction(workspaceId, user.uid, transaction.id, {
      type: transaction.type,
      amountCents: transaction.amountCents,
      accountId: transaction.accountId,
      destinationAccountId: transaction.destinationAccountId,
      deletedAt: transaction.deletedAt
    });
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
            <button
              type="button"
              className={`chip${activeSecondaryFilterCount > 0 ? ' chip--active' : ''}`}
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={13} aria-hidden="true" /> Filtros{activeSecondaryFilterCount > 0 ? ` · ${activeSecondaryFilterCount}` : ''}
            </button>
          </div>
        </div>
      )}

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        subtitle="Tag e cartão"
      >
        <div className="form-stack">
          {availableTags.length > 0 && (
            <div className="field">
              <span className="field-label">Tags</span>
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
            </div>
          )}

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

          <div className="sheet-actions">
            {activeSecondaryFilterCount > 0 && (
              <button className="button button--ghost" type="button" onClick={clearSecondaryFilters}>
                Limpar filtros
              </button>
            )}
            <button className="button button--primary" type="button" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </button>
          </div>
        </div>
      </BottomSheet>

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
                    {transaction.type !== 'card_purchase' ? (
                      <Link className="button button--subtle button--compact" to={`/app/transactions/${transaction.id}/edit`}>
                        Editar
                      </Link>
                    ) : null}
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Excluir transação"
                      onClick={() => void handleDelete(transaction)}
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
