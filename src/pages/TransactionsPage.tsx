import { useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { CategoryMark } from '../components/categoryIcons';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { defaultCategoryColors } from '../theme/palette';
import { compareByDateDesc, formatFriendlyDate, fullMonthLabel, toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { balanceByDayEnd, transactionFlowByType } from '../finance/financeCalculations';
import { dedupeById, loadMoreTransactions, softDeleteTransaction, type LocalSynced } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { NO_CATEGORY } from '../finance/spendingAnalysis';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Transaction } from '../types/contracts';

/**
 * Saldo no fim daquele dia, no cabeçalho do grupo — o mesmo número do "Saldo total" do
 * Dashboard, voltando no tempo. Lendo a lista de cima pra baixo vira a trajetória do dinheiro
 * ("nesse dia eu tinha tanto; depois desse gasto, tanto").
 *
 * O rótulo é **"saldo do dia", único pra todos os dias** (decisão do dono, 29/07/2026): a
 * versão anterior alternava "saldo agora" (hoje) com "no fim do dia" (passado), e dois rótulos
 * pro mesmo número confundiam mais do que o rótulo genérico resolvia. O texto "saldo no fim do
 * dia" chegou a ser tentado, mas foi medido no cabeçalho real e **não cabe**: com data de outro
 * ano ("8 jul 2025") e valor de 6 dígitos faltavam 6px a 375px.
 *
 * Fica em `--text-secondary` peso 700: é referência, não o dado da linha. Vermelho só quando o
 * saldo fica negativo — a única vez em que a cor diz algo aqui.
 */
function DayGroupBalance({ balanceCents }: { balanceCents: number | undefined }) {
  if (balanceCents === undefined) return null;

  return (
    <span className={`day-group-total${balanceCents < 0 ? ' day-group-total--negative' : ''}`}>
      <span className="day-group-total-label">saldo do dia</span>
      {formatMoney(balanceCents)}
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
  // `?categoria=<id>` é o atalho do "Resumo de gastos" do Dashboard: tocar numa das 5 maiores
  // categorias do mês cai aqui já filtrado. Só semeia o estado inicial (a página monta nova a
  // cada navegação); depois quem manda é o filtro da tela, e limpá-lo também limpa a URL — senão
  // um F5 ressuscitaria um filtro que a pessoa acabou de tirar.
  const [searchParams, setSearchParams] = useSearchParams();
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('categoria') ?? '');
  // `?mes=yyyy-MM` acompanha o atalho: o número que a pessoa tocou no Dashboard é do MÊS, então
  // abrir o histórico inteiro da categoria respondia mais do que ela perguntou (pedido do dono,
  // 06/08/2026: "eu cliquei em lazer, mostrou todos de lazer, nesse mês, do mês passado").
  const [monthFilter, setMonthFilter] = useState(() => searchParams.get('mes') ?? '');
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
  // Filtro de categoria descobrível: antes só dava pra achar digitando o nome na busca de
  // texto, sem nenhum indício visual de que isso funcionava. `searchable` no SelectField
  // porque a lista cresce rápido com subcategorias.
  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Todas as categorias' },
      // Precisa existir como opção pra o atalho do Dashboard ter o que exibir quando a linha
      // clicada é a "Sem categoria" — sem ela o seletor abriria com valor desconhecido.
      { value: NO_CATEGORY, label: 'Sem categoria' },
      ...finance.categories
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((c) => ({ value: c.id, label: c.name }))
    ],
    [finance.categories]
  );
  /**
   * Ids que o filtro de categoria aceita: a escolhida **e as subcategorias dela**.
   *
   * Sem isso, filtrar por uma categoria que virou agrupamento devolve lista VAZIA — o gasto vive
   * todo nas filhas (regra `[D10]`: categoria com filha ativa para de receber lançamento). Ficava
   * evidente com o atalho novo do Dashboard, que mostra `Lazer R$ 197,33` (roll-up de Jogos e
   * Cinema, zero direto em Lazer): tocar na linha abriria um extrato vazio.
   *
   * ⚠️ Isto é filtro de EXIBIÇÃO de uma lista, não agregação. Não confundir com o roll-up de
   * `spendingByCategoryForMonth`, que segue proibido de somar filha no pai (`[D9]`).
   */
  const categoryFilterIds = useMemo(() => {
    if (!categoryFilter || categoryFilter === NO_CATEGORY) return null;
    const ids = new Set([categoryFilter]);
    for (const category of finance.categories) {
      if (category.parentCategoryId === categoryFilter) ids.add(category.id);
    }
    return ids;
  }, [categoryFilter, finance.categories]);

  /** Remove um parâmetro da URL depois de o filtro mudar pela tela. Sem isso um F5 ressuscitaria
   *  o filtro que a pessoa acabou de tirar. */
  function dropSearchParam(key: string) {
    if (!searchParams.has(key)) return;
    const params = new URLSearchParams(searchParams);
    params.delete(key);
    setSearchParams(params, { replace: true });
  }

  function changeCategoryFilter(next: string) {
    setCategoryFilter(next);
    dropSearchParam('categoria');
  }

  function changeMonthFilter(next: string) {
    setMonthFilter(next);
    dropSearchParam('mes');
  }
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

  /** Meses presentes no que já foi carregado, do mais novo pro mais antigo. Mesmo campo que a
   *  Análise e o Resumo de gastos usam (`cashMonth ?? competenceMonth`), não o dia do lançamento:
   *  é o que faz o filtro devolver o mesmo conjunto que gerou o número tocado no Dashboard. */
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const transaction of activeTransactions) {
      const month = transaction.cashMonth ?? transaction.competenceMonth;
      if (month) months.add(month);
    }
    return [
      { value: '', label: 'Todos os meses' },
      ...[...months]
        .sort((a, b) => b.localeCompare(a))
        .map((month) => ({ value: month, label: fullMonthLabel(month) }))
    ];
  }, [activeTransactions]);

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
      // Compra no cartão sem categoria grava `categoryId: ''`, então "sem categoria" é a ausência
      // do campo — não dá pra expressar isso com o valor vazio, que significa "sem filtro".
      if (categoryFilter === NO_CATEGORY && t.categoryId) return false;
      if (categoryFilterIds && !(t.categoryId && categoryFilterIds.has(t.categoryId))) return false;
      // Mesmo campo que a Análise/Resumo de gastos usam pra decidir de que mês é o gasto — não o
      // dia do lançamento. ⚠️ Compra parcelada é a exceção conhecida: ela mora no mês da COMPRA,
      // então a parcela que pesa em agosto vindo de uma compra de março não aparece filtrando
      // agosto. O estado vazio oferece "ver todos os meses" justamente por causa disso.
      if (monthFilter && (t.cashMonth ?? t.competenceMonth) !== monthFilter) return false;
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
  }, [activeTransactions, cardFilter, categoryFilter, categoryFilterIds, monthFilter, typeFilter, tagFilter, normalizedQuery, categoryMap]);

  // Extrato agrupado por dia (padrão de app financeiro nativo): cabeçalho "Hoje/Ontem/12 jul"
  // com o saldo no fim daquele dia. A lista já vem ordenada por data; agrupar preserva a ordem.
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
    return groups;
  }, [visibleTransactions]);

  // Saldo por dia sai de `activeTransactions` (SEM filtro), nunca das visíveis: quanto a pessoa
  // tinha naquele dia é um fato do dia, não do filtro — escolher "Despesas" não pode mudar o
  // saldo. Ver `balanceByDayEnd`.
  const balanceByDay = useMemo(
    // `countedAccounts`: o saldo do dia é o mesmo número do "Saldo total" do Dashboard, então
    // conta "fora do saldo" fica de fora dos dois. O lançamento dela continua na lista (o
    // passeio pra trás já ignora efeito em conta fora do conjunto) — só não move o saldo.
    () => balanceByDayEnd(finance.countedAccounts, activeTransactions),
    [finance.countedAccounts, activeTransactions]
  );

  // Nota: o saldo do dia aparece mesmo com busca/filtro ativo. Isso era proibido enquanto o
  // cabeçalho mostrava um TOTAL (o total do subconjunto encontrado parecia bug), mas saldo não
  // depende do que está na tela — continua verdadeiro com qualquer filtro.

  const typeChips: Array<{ key: typeof typeFilter; label: string }> = [
    { key: 'all', label: 'Tudo' },
    { key: 'expense', label: 'Despesas' },
    { key: 'income', label: 'Receitas' },
    { key: 'transfer', label: 'Transferências' }
  ];

  // Filtros secundários (tag, cartão) ficam escondidos atrás de um botão "Filtros" —
  // mostrar os grupos soltos na tela, além do tipo, virava uma parede de chips no
  // celular (7+ chips empilhados, achado real testando em 375px).
  const activeSecondaryFilterCount =
    (tagFilter.size > 0 ? 1 : 0) + (cardFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (monthFilter ? 1 : 0);

  function clearSecondaryFilters() {
    setTagFilter(new Set());
    setCardFilter('');
    changeCategoryFilter('');
    changeMonthFilter('');
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
            {/* O mês é o único filtro que esconde um PERÍODO inteiro, então não pode viver só no
                contador dentro do sheet: fica como chip nomeado, e tocar nele limpa. Mesma regra
                que fez a prévia do "fora do saldo" existir — efeito que some dado tem que estar
                visível na tela, não atrás de um toque. */}
            {monthFilter && (
              <button
                type="button"
                className="chip chip--active"
                onClick={() => changeMonthFilter('')}
                aria-label={`Remover filtro de ${fullMonthLabel(monthFilter)}`}
              >
                {fullMonthLabel(monthFilter)} <X size={13} aria-hidden="true" />
              </button>
            )}
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
        subtitle="Mês, categoria, tag e cartão"
      >
        <div className="form-stack">
          {monthOptions.length > 1 && (
            <SelectField
              label="Mês"
              value={monthFilter}
              onChange={changeMonthFilter}
              options={monthOptions}
              sheetTitle="Filtrar por mês"
            />
          )}

          {finance.categories.length > 0 && (
            <SelectField
              label="Categoria"
              value={categoryFilter}
              onChange={changeCategoryFilter}
              options={categoryOptions}
              sheetTitle="Filtrar por categoria"
              searchable
            />
          )}

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
            description={
              normalizedQuery
                ? `Nada encontrado para "${query.trim()}".`
                : monthFilter
                  ? `Nada em ${fullMonthLabel(monthFilter)} com esse filtro.`
                  : 'Nenhuma transação nesse filtro.'
            }
            // Saída de emergência do recorte por mês. Existe por um caso real: a parcela que pesa
            // no mês vem de uma compra de meses atrás, e a transação dela mora no mês da COMPRA —
            // filtrando o mês corrente ela não aparece. Sem este botão, seria um beco sem saída.
            action={
              monthFilter && !normalizedQuery ? (
                <button type="button" className="button button--ghost button--compact" onClick={() => changeMonthFilter('')}>
                  Ver todos os meses
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="item-list item-list--grouped">
            {dayGroups.map((group) => (
              <section className="day-group" key={group.key} aria-label={group.label}>
                <header className="day-group-header">
                  <span className="day-group-label">{group.label}</span>
                  <DayGroupBalance balanceCents={balanceByDay.get(group.key)} />
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
                {t.tags?.includes('investimento') ? (
                  <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                    Pra desfazer, resgate pela tela de Investimentos.
                  </p>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </BottomSheet>
        );
      })() : null}
      {confirmDialog}
    </section>
  );
}
