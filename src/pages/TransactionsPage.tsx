import { useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { CategoryMark } from '../components/categoryIcons';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { defaultCategoryColors } from '../theme/palette';
import { compareByDateDesc, formatFriendlyDate, toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { dayFlowTotals, transactionFlowByType, type DayFlowTotals } from '../finance/financeCalculations';
import { dedupeById, loadMoreTransactions, softDeleteTransaction, type LocalSynced } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Transaction } from '../types/contracts';

/**
 * Resumo do dia no cabeçalho do grupo.
 *
 * Mostra **um** fato rotulado, não um líquido: "gasto" na maioria dos dias, "recebido" quando
 * entrou mais do que saiu (dia de salário) — aí a cor verde aparece e significa alguma coisa.
 * O vermelho saiu de propósito: como todo dia tinha gasto, um cabeçalho sempre vermelho não
 * carregava informação nenhuma e ainda competia com o valor de cada linha, no mesmo peso e na
 * mesma cor. Cor que nunca varia é decoração, não dado.
 */
function DayGroupSummary({ totals }: { totals: DayFlowTotals }) {
  const received = totals.receivedCents > totals.spentCents;
  const value = received ? totals.receivedCents : totals.spentCents;

  if (value === 0) return null;

  return (
    <span className={`day-group-total${received ? ' day-group-total--received' : ''}`}>
      <span className="day-group-total-label">{received ? 'recebido' : 'gasto'}</span>
      {formatMoney(value)}
    </span>
  );
}

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
  // Sheet de detalhe: a linha inteira é o alvo de toque; Editar/Excluir vivem aqui dentro.
  const [detailTransaction, setDetailTransaction] = useState<LocalSynced<Transaction> | null>(null);

  const categoryMap = useMemo(() => new Map(finance.categories.map((c) => [c.id, c])), [finance.categories]);
  const accountNameMap = useMemo(() => new Map(finance.accounts.map((a) => [a.id, a.name])), [finance.accounts]);
  const cardNameMap = useMemo(() => new Map(cardsData.cards.map((c) => [c.id, c.name])), [cardsData.cards]);
  const cardOptions = useMemo(
    () => [
      { value: '', label: 'Todos os cartões' },
      ...cardsData.cards.map((card) => ({ value: card.id, label: card.name }))
    ],
    [cardsData.cards]
  );
  // ── paginação "Carregar mais" (Fase 2) ──────────────────────────────────────
  // As 300 do boot continuam ao vivo (onSnapshot); páginas mais antigas entram aqui sob
  // demanda (leitura pontual, ver `loadMoreTransactions`). Ver docs/planning/HISTORICO_TRANSACOES.md.
  const [olderTransactions, setOlderTransactions] = useState<Array<LocalSynced<Transaction>>>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  // Conjunto carregado = 300 do boot ∪ páginas antigas, ordenado por data desc. Inclui
  // excluídas (o cursor de paginação precisa continuar certo); o filtro de exibição tira depois.
  const loadedTransactions = useMemo(
    () =>
      dedupeById(finance.transactions, olderTransactions).sort(compareByDateDesc),
    [finance.transactions, olderTransactions]
  );

  const activeTransactions = useMemo(
    () => loadedTransactions.filter((transaction) => !transaction.deletedAt),
    [loadedTransactions]
  );

  async function handleLoadMore() {
    if (loadingMore || reachedEnd || !workspaceId) return;
    const oldest = loadedTransactions[loadedTransactions.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const page = await loadMoreTransactions(workspaceId, oldest.id, 50);
      const known = new Set(loadedTransactions.map((transaction) => transaction.id));
      const fresh = page.filter((transaction) => !known.has(transaction.id));
      if (fresh.length > 0) setOlderTransactions((prev) => dedupeById(prev, fresh));
      // Página incompleta = fim da coleção — mas só confia nisso online (offline pode ser cache
      // parcial). Offline sem completar vira aviso de reconectar, não "fim".
      if (page.length < 50) {
        if (typeof navigator !== 'undefined' && navigator.onLine) setReachedEnd(true);
        else setLoadMoreFailed(true);
      }
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

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

  // Extrato agrupado por dia (padrão de app financeiro nativo): cabeçalho "Hoje/Ontem/12 jul"
  // com o resumo do dia. A lista já vem ordenada por data; agrupar preserva a ordem.
  //
  // O resumo é rotulado ("gasto"/"recebido") em vez de um líquido cru: um número sozinho não
  // diz se é gasto, saldo ou entrada, e o líquido de um dia só significa algo no dia em que se
  // recebe. Antes, o cálculo ignorava ajuste/estorno/reembolso e o cabeçalho **contradizia as
  // linhas logo abaixo** (dia com +1,44, −1,44, +1,44 exibia "−R$ 1,44"). Ver `dayFlowTotals`.
  const dayGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; transactions: Array<LocalSynced<Transaction>> }> = [];
    let current: (typeof groups)[number] | undefined;
    for (const transaction of visibleTransactions) {
      const key = toDateInputValue(transaction.date);
      if (!current || current.key !== key) {
        current = { key, label: formatFriendlyDate(transaction.date), transactions: [] };
        groups.push(current);
      }
      current.transactions.push(transaction);
    }
    return groups.map((group) => ({ ...group, totals: dayFlowTotals(group.transactions) }));
  }, [visibleTransactions]);

  // Com busca textual ativa o "total do dia" seria o total do subconjunto encontrado —
  // parece bug ("total: R$ 37"). Só mostrar sem busca; filtros de tipo/tag são intencionais.
  const showDayTotals = normalizedQuery.length === 0;

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

    setDetailTransaction(null);
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
        {/* Mobile esconde este CTA (o FAB da bottom nav já é "lançar"); desktop não tem FAB. */}
        <Link className="button button--primary transactions-new-link" to="/app/transactions/new">
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
              placeholder="Buscar transações"
              aria-label="Buscar por nome, categoria, tag ou estabelecimento"
            />
          </div>
          {/* Trilho horizontal (sem quebra) — "Filtros" primeiro porque carrega estado
              (contador de filtros ativos) e não pode sair da viewport rolando. */}
          <div className="chip-row chip-row--scroll">
            <button
              type="button"
              className={`chip${activeSecondaryFilterCount > 0 ? ' chip--active' : ''}`}
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={13} aria-hidden="true" /> Filtros{activeSecondaryFilterCount > 0 ? ` · ${activeSecondaryFilterCount}` : ''}
            </button>
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
        {finance.loading ? (
          <LoadingState compact />
        ) : activeTransactions.length === 0 ? (
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
          <div className="item-list item-list--grouped">
            {dayGroups.map((group) => (
              <section className="day-group" key={group.key} aria-label={group.label}>
                <header className="day-group-header">
                  <span className="day-group-label">{group.label}</span>
                  {showDayTotals ? <DayGroupSummary totals={group.totals} /> : null}
                </header>
                {group.transactions.map((transaction) => {
                  const isIncome = transaction.type === 'income';
                  // Cor e sinal saem da mesma classificação do resumo do dia, então dá pra
                  // somar as linhas coloridas com o dedo e bater com o cabeçalho. Linha neutra
                  // (transferência, pagamento de fatura) é movimento interno e não entra.
                  const flow = transactionFlowByType[transaction.type];
                  const amountClass = flow === 'received' ? 'amount--income' : flow === 'spent' ? 'amount--expense' : '';
                  const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : null;
                  const fallback = isIncome
                    ? { icon: 'money', color: defaultCategoryColors.income_salary }
                    : transaction.type === 'transfer'
                    ? { icon: 'repeat', color: defaultCategoryColors.both_transfer }
                    : undefined;
                  return (
                    <button
                      className="list-row list-row--with-icon list-row--tap"
                      type="button"
                      key={transaction.id}
                      onClick={() => setDetailTransaction(transaction)}
                    >
                      <CategoryMark category={category} fallback={fallback} />
                      <div className="list-row-body">
                        <strong>{transaction.description}</strong>
                        <span className="text-secondary">
                          {transaction.type === 'card_purchase' && transaction.installments && transaction.installments > 1
                            ? `${transaction.installments}x de ${formatMoney(Math.round(transaction.amountCents / transaction.installments))}`
                            : transactionTypeLabels[transaction.type]}
                        </span>
                      </div>
                      <div className="list-row-end">
                        <strong className={amountClass}>
                          {flow === 'received' ? '+' : flow === 'spent' ? '−' : ''}{formatMoney(transaction.amountCents)}
                        </strong>
                        <SyncStatusBadge status={transaction.localSyncStatus} />
                      </div>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {!reachedEnd && loadedTransactions.length > 0 ? (
          <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="button button--subtle button--compact"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </button>
            {loadMoreFailed ? (
              <span className="text-secondary" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                Não foi possível carregar mais. Verifique a conexão e tente de novo.
              </span>
            ) : null}
          </div>
        ) : null}
      </article>

      {detailTransaction ? (() => {
        const t = detailTransaction;
        const isIncome = t.type === 'income';
        const isExpense = t.type === 'expense' || t.type === 'card_purchase';
        const category = t.categoryId ? categoryMap.get(t.categoryId) : null;
        const fallback = isIncome
          ? { icon: 'money', color: defaultCategoryColors.income_salary }
          : t.type === 'transfer'
          ? { icon: 'repeat', color: defaultCategoryColors.both_transfer }
          : undefined;
        const placeName = t.type === 'card_purchase'
          ? (t.cardId ? cardNameMap.get(t.cardId) : undefined)
          : (t.accountId ? accountNameMap.get(t.accountId) : undefined);
        const destinationName = t.destinationAccountId ? accountNameMap.get(t.destinationAccountId) : undefined;
        return (
          <BottomSheet
            open
            onClose={() => setDetailTransaction(null)}
            title={t.description}
            subtitle={`${transactionTypeLabels[t.type]} · ${formatFriendlyDate(t.date)}`}
          >
            <div className="tx-detail">
              <p className={`tx-detail-amount display-number${isIncome ? ' amount--income' : isExpense ? ' amount--expense' : ''}`}>
                {isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(t.amountCents)}
              </p>
              <dl className="tx-detail-facts">
                <div className="tx-detail-fact">
                  <dt>Categoria</dt>
                  <dd className="tx-detail-category">
                    <CategoryMark category={category} fallback={fallback} />
                    {category?.name ?? 'Sem categoria'}
                  </dd>
                </div>
                {placeName ? (
                  <div className="tx-detail-fact">
                    <dt>{t.type === 'card_purchase' ? 'Cartão' : t.type === 'transfer' ? 'De' : 'Conta'}</dt>
                    <dd>{placeName}</dd>
                  </div>
                ) : null}
                {destinationName ? (
                  <div className="tx-detail-fact">
                    <dt>Para</dt>
                    <dd>{destinationName}</dd>
                  </div>
                ) : null}
                {t.merchant ? (
                  <div className="tx-detail-fact">
                    <dt>Estabelecimento</dt>
                    <dd>{t.merchant}</dd>
                  </div>
                ) : null}
                {t.tags.length > 0 ? (
                  <div className="tx-detail-fact">
                    <dt>Tags</dt>
                    <dd>{t.tags.join(', ')}</dd>
                  </div>
                ) : null}
                {t.notes ? (
                  <div className="tx-detail-fact">
                    <dt>Notas</dt>
                    <dd>{t.notes}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="sheet-actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleDelete(t)}
                >
                  <Trash2 size={16} aria-hidden="true" /> Excluir
                </button>
                <Link className="button button--primary" to={`/app/transactions/${t.id}/edit`}>
                  Editar
                </Link>
              </div>
            </div>
          </BottomSheet>
        );
      })() : null}
      {confirmDialog}
    </section>
  );
}
