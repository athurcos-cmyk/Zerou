import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CreditCard, Minus, Pencil, PiggyBank, Plus, Scale, Target, Telescope, TrendingDown, TrendingUp, Wallet, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { NextMonthProjectionSheet } from '../finance/NextMonthProjectionSheet';
import { updateProjectedSalary, updateProjectionIncludesBalance } from '../workspaces/workspaceService';
import type { TransactionType } from '../types/contracts';

import { calculateDashboardSummary, calculateNextMonthProjection, buildUpcomingReceivables, hasPendingCardLedgerActivity } from '../finance/financeCalculations';
import { useCompleteCurrentMonth } from '../finance/useMonthlyTransactions';
import { rollUpByParent, spendingByCategoryForMonth } from '../finance/spendingAnalysis';
import { invoicesForSpendingFromTransactions } from '../cards/installmentSchedule';
import {
  readCachedDashboardView,
  resolveProjectionView,
  saveCachedDashboardView,
  type CachedCategoryMark,
  type CachedNextMonthProjection,
  type CachedSpendingRow
} from '../finance/dashboardViewCache';
import { formatFriendlyDate, toDate, type DateLike } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';
import { InstallPromptSheet } from '../pwa/InstallPromptSheet';

import { EmptyState } from '../components/EmptyState';

// Forma comum que o render das listas consome, venha o dado do cálculo ao vivo ou do cache
// local (que guarda datas como ISO). `DateLike` cobre os dois: Date ao vivo, `new Date(iso)`
// do cache — ambos aceitos por `formatFriendlyDate`.
interface RecentTransactionView {
  id: string;
  type: TransactionType;
  description: string;
  date: DateLike;
  amountCents: number;
  mark: CachedCategoryMark | null;
}

interface CommitmentView {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  cardId?: string;
  description: string;
  dueAt: DateLike;
  amountCents: number;
}

interface UpcomingReceivableView {
  id: string;
  description: string;
  fromWho?: string;
  dueAt: DateLike;
  amountCents: number;
}

type CategoryLike = { id: string; name?: string; icon?: string; color?: string };

/** Guarda só o que o `CategoryMark` precisa (id/ícone/cor). Props opcionais de propósito:
 * `finance.categories` é uma união (categorias reais + defaults inline) e um dos membros
 * não expõe `color`/`icon` no tipo — o opcional aceita os dois sem erro. */
function markForCategory(category: CategoryLike | null | undefined): CachedCategoryMark | null {
  return category ? { id: category.id, icon: category.icon, color: category.color } : null;
}

/** Reproduz a marca (ícone+cor) exatamente como o render ao vivo: categoria da transação
 * quando existe; senão o fallback por tipo (receita/transferência); senão o padrão. Usado
 * tanto no render ao vivo quanto ao gravar o cache, pra os dois baterem visualmente. */
function markForTransaction(
  transaction: { type: TransactionType; categoryId?: string },
  categoryMap: ReadonlyMap<string, CategoryLike>
): CachedCategoryMark | null {
  const categoryMark = markForCategory(transaction.categoryId ? categoryMap.get(transaction.categoryId) : null);
  if (categoryMark) return categoryMark;
  if (transaction.type === 'income') return { id: '', icon: 'money', color: defaultCategoryColors.income_salary };
  if (transaction.type === 'transfer') return { id: '', icon: 'repeat', color: defaultCategoryColors.both_transfer };
  return null;
}

export function DashboardPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const isLoading = finance.loading;
  // O Comprometido depende das faturas de cartão (cardsData) além de contas/transações —
  // sem isso, mostraria um valor errado por um instante antes das faturas sincronizarem.
  const isCommittedLoading = finance.loading || cardsData.loading;
  const [projectionSheetOpen, setProjectionSheetOpen] = useState(false);
  // O Comprometido soma o total da fatura que só a Cloud Function atualiza — ela não roda
  // offline. Ver comentário completo em hasPendingCardLedgerActivity.
  const hasPendingCardActivity = hasPendingCardLedgerActivity(finance.transactions);
  // `countedAccounts`, não `accounts`: conta marcada como "fora do saldo" (vale-refeição etc.)
  // não entra no Saldo total. As transações dela seguem vindo inteiras — "Transações recentes"
  // mostra o histórico todo; quem as tira dos agregados é `excludedAccountIds`.
  const dashboard = calculateDashboardSummary({
    accounts: finance.countedAccounts,
    transactions: finance.transactions,
    bills: finance.bills,
    recurringRules: finance.recurringRules,
    invoices: cardsData.invoices,
    cards: cardsData.cards,
    excludedAccountIds: finance.excludedAccountIds
  });
  // Card "Projeção do próximo mês" — isolado do saldo real de propósito (ver comentário em
  // calculateNextMonthProjection). `null` quando ainda não configurado. `totalBalanceCents`
  // só entra na conta se a pessoa ligou `projectionIncludesBalance`.
  const nextMonthProjection = calculateNextMonthProjection({
    projectedSalaryCents: profile?.projectedSalaryCents,
    includeCurrentBalance: profile?.projectionIncludesBalance,
    totalBalanceCents: dashboard.totalBalanceCents,
    transactions: finance.transactions,
    bills: finance.bills,
    recurringRules: finance.recurringRules,
    invoices: cardsData.invoices,
    cards: cardsData.cards,
    excludedAccountIds: finance.excludedAccountIds
  });
  function handleSaveProjectedSalary(cents: number) {
    if (user) updateProjectedSalary(user.uid, cents);
  }
  function handleRemoveProjectedSalary() {
    if (user) updateProjectedSalary(user.uid, null);
  }
  function handleToggleIncludeBalance(include: boolean) {
    if (user) updateProjectionIncludesBalance(user.uid, include);
  }
  // Legenda fixa: contas fixas/recorrentes + a fatura do ciclo atual do cartão (a aberta +
  // a que está pra pagar, não as parcelas de meses futuros). "a fatura" no singular sinaliza
  // "a atual", não todas — reflete `selectCurrentCycleInvoices`.
  const committedCaption = 'Suas contas fixas e recorrentes + a fatura do cartão.';

  // Mostra a última tela conhecida (cache local) enquanto os listeners do Firestore ainda
  // não entregaram o primeiro snapshot — evita os números piscando "—" e as listas piscando
  // em branco por 1-2s a cada abertura, sem mexer na lógica de loading em si. A gravação
  // desse cache fica mais abaixo, depois que `spendingRows`/`categoryMap` já existem.
  const cachedView = useMemo(() => readCachedDashboardView(workspaceId), [workspaceId]);
  // O cache de exibição cobre duas situações: (a) durante o boot normal, enquanto
  // os listeners do Firestore ainda não dispararam; (b) depois que o boot timeout
  // de 2.5s disparou mas os dados ainda não chegaram (ex.: IndexedDB lento no
  // celular ou rede oscilando). Sem essa segunda perna, o Dashboard zerava os
  // números e mostrava "Comece em poucos minutos" por vários segundos até o
  // Firestore responder — exatamente o "pisca" que o dono reportou.
  const hasStarted = finance.accounts.length > 0 || finance.transactions.length > 0 || cardsData.cards.length > 0;
  // cache != null → mostra os dados cacheados. Cobre: (a) boot normal (loading=true),
  // (b) depois do boot timeout sem dados (loading=false, arrays vazios, mas cache existe).
  const cache = (cachedView && (isCommittedLoading || !hasStarted)) ? cachedView : null;
  // Saldo total/Resumo de gastos/Transações recentes não dependem de cartão nenhum
  // (`calculateDashboardSummary` calcula os três só a partir de accounts/transactions) —
  // mas antes ficavam presos no cache até `cardsData` TAMBÉM resolver, mesmo sem precisar
  // dela. Isso prendia a tela inteira (inclusive o Saldo total) na versão em cache por mais
  // tempo do que o necessário sempre que os cartões/faturas demoravam mais que as finanças
  // pra sincronizar (ex.: lançamento feito pela Vic no WhatsApp com o app fechado — as
  // transações chegam rápido, os cartões podem levar mais um instante). Gate próprio, só
  // com `isLoading` (finanças), pra essas três seções trocarem pro dado ao vivo assim que
  // finanças sincronizarem, sem esperar cartão.
  const financeCache = (cachedView && (isLoading || !hasStarted)) ? cachedView : null;

  const totalBalanceDisplay = financeCache
    ? formatMoney(financeCache.totalBalanceCents)
    : isLoading
      ? '—'
      : formatMoney(dashboard.totalBalanceCents);
  const committedDisplay = cache
    ? formatMoney(cache.committedCents)
    : isCommittedLoading
      ? '—'
      : formatMoney(dashboard.committedCents);
  // Mesmo acelerador do Comprometido (depende de invoices/cards, mesmo gate `cache`): sem
  // isso, reabrir o app recalculava do zero com `bills`/`invoices` ainda vazios no boot,
  // mostrando por um instante "sobra = salário inteiro" antes de cair pro valor real.
  //
  // ⚠️ Os DOIS números da carta saem daqui, do MESMO lado do `if`, de propósito. Antes só a
  // projeção vinha do cache e o saldo da fórmula era lido ao vivo (`dashboard.totalBalanceCents`)
  // — a única linha da carta que ignorava o cache. **Offline isso não era um piscar, era
  // permanente**: com o Firestore devolvendo `unavailable`, o listener fica vivo e `loading`
  // permanece `true` indefinidamente (decisão de 24/07, ver `useFinanceData.ts`), então o app
  // mostra o cache pra sempre — e essa linha mostrava R$ 0,00 pra sempre junto. Achado pelo dono
  // abrindo o app sem internet (03/08/2026). Além de errado, quebrava a conta: a "Sobra prevista"
  // vinha do cache tendo somado o saldo, e a fórmula logo abaixo exibia esse saldo como zero.
  // Manter os dois no mesmo objeto torna esse descasamento impossível de reintroduzir sem
  // desmontar a estrutura de propósito.
  const projectionView = resolveProjectionView(cache, {
    projection: nextMonthProjection,
    totalBalanceCents: dashboard.totalBalanceCents
  });
  const effectiveNextMonthProjection = projectionView.projection;
  const syncStatus = finance.pendingWrites || cardsData.pendingWrites ? 'pending' : 'synced';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  // Fase 3: o "Resumo de gastos" (mês atual) e a variação vs. mês passado calculam das 300 do
  // boot. Se o mês atual transbordou a janela (>300 lançamentos no mês), carrega mês atual +
  // anterior completos sob demanda — senão, custo ZERO (as 300 já cobrem). Bate com a Análise.
  const spendingSource = useCompleteCurrentMonth(workspaceId, finance.transactions, [currentMonth, previousMonth]);
  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  // O "Resumo de gastos" usa a MESMA função da Análise (`spendingByCategoryForMonth`), não mais
  // uma cópia inline simplificada. Até 2026-08-06 havia aqui um espelho de `isCountableExpense`
  // que contava compra parcelada no cartão pelo VALOR CHEIO no mês da compra: `Presente
  // R$ 588,00` aqui contra `R$ 147,00` na Análise, no mesmo mês. Também divergia em estorno
  // (não subtraía), no mês (`||` em vez do fallback `cashMonth ?? competenceMonth`), na chave de
  // sem-categoria e no agrupamento de subcategoria.
  //
  // O cronograma das parcelas é reconstruído das próprias transações
  // (`invoicesForSpendingFromTransactions`) — sem assinar o ledger da fatura, que custa leitura
  // por abertura e é carregado só sob demanda (ver `docs/COSTS.md`). Nenhuma regra de gasto é
  // recalculada aqui; as divergências que sobram estão enumeradas na doc daquela função.
  const derivedInvoices = useMemo(
    () => invoicesForSpendingFromTransactions(spendingSource),
    [spendingSource]
  );
  const spendingCategoryOf = useMemo(() => {
    const byId = new Map(spendingSource.map((t) => [t.id, t.categoryId]));
    return (transactionId: string | undefined) => (transactionId ? byId.get(transactionId) : undefined);
  }, [spendingSource]);
  const purchaseMonthOf = useMemo(() => {
    const byId = new Map(
      spendingSource
        .filter((t) => t.type === 'card_purchase')
        .map((t) => [t.id, t.cashMonth ?? t.competenceMonth])
    );
    return (transactionId: string) => byId.get(transactionId);
  }, [spendingSource]);
  // Subcategoria soma no pai, igual à Análise: sem isso o Dashboard mostrava `Jogos` e `Cinema`
  // separados onde a Análise mostra `Lazer` — a soma batia, a leitura não.
  //
  // Os DOIS meses (atual e anterior) passam por aqui de propósito: a variação "vs. mês passado"
  // comparava duas réguas diferentes até 2026-08-06 (Dashboard dizia -48%, Análise -63%).
  const rowsForMonth = useCallback(
    (month: string) =>
      [...rollUpByParent(
        spendingByCategoryForMonth(
          month,
          spendingSource,
          derivedInvoices,
          spendingCategoryOf,
          finance.excludedAccountIds,
          purchaseMonthOf
        ),
        categoryMap
      ).entries()]
        // Mês só de estorno pode zerar/inverter uma categoria — mesmo filtro da Análise.
        .filter(([, rollUp]) => rollUp.totalCents > 0)
        .map(([categoryId, rollUp]) => [categoryId, rollUp.totalCents] as const)
        .sort((left, right) => right[1] - left[1]),
    // `categoryMap` é recriado a cada render (Map novo de `finance.categories`), então a
    // dependência real é a lista, não o Map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spendingSource, derivedInvoices, spendingCategoryOf, purchaseMonthOf, finance.excludedAccountIds, finance.categories]
  );
  const spendingRows = useMemo(() => rowsForMonth(currentMonth), [rowsForMonth, currentMonth]);
  const topSpendingRows = spendingRows.slice(0, 5);
  // Denormaliza as listas do jeito que o render consome — a mesma forma serve pra gravar no
  // cache e pra reler depois sem depender de `finance.categories` já ter chegado.
  const liveSpending: CachedSpendingRow[] = topSpendingRows.map(([categoryId, amount]) => {
    const category = categoryMap.get(categoryId);
    return {
      categoryId,
      categoryName: category?.name ?? 'Sem categoria',
      amountCents: amount,
      mark: markForCategory(category)
    };
  });
  const liveRecent: RecentTransactionView[] = dashboard.recentTransactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    date: transaction.date,
    amountCents: transaction.amountCents,
    mark: markForTransaction(transaction, categoryMap)
  }));

  // Enquanto ainda carrega, renderiza o que o cache guardou; quando o dado real chega, troca
  // sem piscar (na imensa maioria das aberturas os dois são idênticos, então é imperceptível).
  // Spending/recent usam `financeCache` (só finanças) — não dependem de cartão, não devem
  // esperar por ele. Commitments usa `cache` (combinado) — inclui fatura de cartão.
  const effectiveSpending: CachedSpendingRow[] = financeCache ? financeCache.spending : liveSpending;
  const effectiveCommitments: CommitmentView[] = cache
    ? cache.commitments.map((commitment) => ({ ...commitment, dueAt: new Date(commitment.dueAtISO) }))
    : dashboard.upcomingCommitments;
  // "Próximos a receber": só o que vence em ≤5 dias, no fim da tela e SEM entrar em nenhum total —
  // dinheiro a receber não é dinheiro que se tem (ver docs/planning/CONTAS_A_RECEBER.md).
  //
  // Passou pelo cache em 03/08/2026 (varredura pedida pelo dono): era a última seção que lia dado
  // ao vivo sem cobertura nenhuma. Não mostrava número errado — **sumia inteira** durante o boot,
  // porque só renderiza com `length > 0`. Some sem deixar rastro, e é justamente o lembrete de que
  // alguém te deve. Gate `financeCache` (só finanças): recebível não depende de cartão.
  const liveUpcomingReceivables = buildUpcomingReceivables(finance.receivables);
  const effectiveUpcomingReceivables: UpcomingReceivableView[] = financeCache
    ? financeCache.upcomingReceivables.map((receivable) => ({
        id: receivable.id,
        description: receivable.description,
        fromWho: receivable.fromWho,
        amountCents: receivable.amountCents,
        dueAt: new Date(receivable.dueAtISO)
      }))
    : liveUpcomingReceivables;
  const effectiveRecent: RecentTransactionView[] = financeCache
    ? financeCache.recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        date: new Date(transaction.dateISO),
        amountCents: transaction.amountCents,
        mark: transaction.mark
      }))
    : liveRecent;
  const maxSpendingCents = Math.max(...effectiveSpending.map((row) => row.amountCents), 1);

  // A legenda do Comprometido e a variação de gastos também entram no cache, pra não
  // piscarem "Carregando…"/"Contas e fatura." nem trocar de texto durante o boot.
  // Total do mês = soma de TODAS as categorias (não só as 5 exibidas), igual ao "Gasto no mês"
  // da Análise.
  const currentMonthSpendCents = spendingRows.reduce((sum, [, amount]) => sum + amount, 0);
  const previousMonthSpendCents = useMemo(
    () => rowsForMonth(previousMonth).reduce((sum, [, amount]) => sum + amount, 0),
    [rowsForMonth, previousMonth]
  );
  // Variação de gasto usa só transações — `isLoading` (finanças), não o combinado com cartão.
  const spendingVariationPct =
    !isLoading && previousMonthSpendCents > 0
      ? Math.round(((currentMonthSpendCents - previousMonthSpendCents) / previousMonthSpendCents) * 100)
      : null;

  useEffect(() => {
    // Só grava depois que cartões e faturas resolveram (senão poderia persistir um
    // "Comprometido" inflado). Nesse ponto `isLoading` (finanças) também já é false, então
    // todas as listas estão finais e consistentes entre si.
    if (isCommittedLoading || !workspaceId) return;
    saveCachedDashboardView(workspaceId, {
      totalBalanceCents: dashboard.totalBalanceCents,
      committedCents: dashboard.committedCents,
      committedCaption,
      spendingVariationPct,
      spending: liveSpending,
      commitments: dashboard.upcomingCommitments.map((commitment) => ({
        id: commitment.id,
        kind: commitment.kind,
        cardId: commitment.cardId,
        description: commitment.description,
        dueAtISO: toDate(commitment.dueAt).toISOString(),
        amountCents: commitment.amountCents
      })),
      recentTransactions: dashboard.recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        dateISO: toDate(transaction.date).toISOString(),
        amountCents: transaction.amountCents,
        mark: markForTransaction(transaction, categoryMap)
      })),
      nextMonthProjection,
      upcomingReceivables: liveUpcomingReceivables.map((receivable) => ({
        id: receivable.id,
        description: receivable.description,
        fromWho: receivable.fromWho,
        dueAtISO: toDate(receivable.dueAt).toISOString(),
        amountCents: receivable.amountCents
      }))
    });
    // Deps = as fontes estáveis do dashboard (os arrays do contexto só trocam de referência
    // quando chega snapshot novo), não os objetos recomputados a cada render — senão isto
    // regravaria o cache em toda renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCommittedLoading,
    workspaceId,
    finance.accounts,
    finance.transactions,
    spendingSource,
    finance.receivables,
    finance.bills,
    finance.recurringRules,
    finance.categories,
    cardsData.invoices,
    cardsData.cards,
    profile?.projectedSalaryCents,
    profile?.projectionIncludesBalance
  ]);
  // Se existe cache de exibição, o app NÃO está vazio — a pessoa já usou antes.
  // Só decide "conta nova" depois que finanças E cartões resolveram E não há cache
  // de nenhum tipo (dashboard + IndexedDB).
  const showStartGuide = !hasStarted && !isCommittedLoading && !cachedView;

  // Durante o boot: cache se tiver, senão o placeholder antigo. Depois de carregar: dado ao vivo.
  const effectiveCommittedCaption = cache
    ? cache.committedCaption
    : isCommittedLoading
      ? 'Contas e fatura.'
      : committedCaption;
  const effectiveVariationPct = financeCache ? financeCache.spendingVariationPct : spendingVariationPct;


  return (
    <section className="page-content">
      <InstallPromptSheet />
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Olá{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</p>
          <h1 className="page-title page-title--compact">Seu resumo</h1>
        </div>
        <SyncStatusBadge status={syncStatus} />
      </div>

      {finance.error || cardsData.error ? <div className="notice notice--danger" role="alert">{finance.error ?? cardsData.error}</div> : null}

      {hasPendingCardActivity && (
        <div className="notice" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <WifiOff size={16} style={{ flexShrink: 0, marginTop: '0.15rem' }} aria-hidden="true" />
          <span>Uma compra no cartão ainda não sincronizou — conecte-se à internet para atualizar o Comprometido.</span>
        </div>
      )}

      <div className="dash-summary">
        <article className="surface surface-pad dash-balance dash-hero">
          <p className="eyebrow" style={{ color: 'var(--on-accent-85)' }}>Saldo total</p>
          <strong className="display-number" style={{ color: 'var(--on-accent-95)' }}>
            {totalBalanceDisplay}
          </strong>
          <span style={{ color: 'var(--on-accent-55)', fontSize: '0.84rem' }}>Soma das contas ativas.</span>
        </article>
        <article className="surface surface-pad dash-metric dash-metric--committed">
          <div className="dash-metric-head">
            <p className="eyebrow">Comprometido</p>
            <span className="dash-metric-caption">{effectiveCommittedCaption}</span>
          </div>
          <strong className="display-number">{committedDisplay}</strong>
        </article>
      </div>

      <article className="projection-card">
        <div className="projection-card-header">
          <span className={`projection-icon${effectiveNextMonthProjection && effectiveNextMonthProjection.leftoverCents < 0 ? ' projection-icon--negative' : ''}`}>
            <Telescope size={19} aria-hidden="true" />
          </span>
          <div className="projection-card-title">
            <p className="eyebrow">Projeção do próximo mês</p>
            <h2>{effectiveNextMonthProjection ? (effectiveNextMonthProjection.leftoverCents >= 0 ? 'Sobra prevista' : 'Rombo previsto') : 'Quanto sobraria mês que vem?'}</h2>
          </div>
          {effectiveNextMonthProjection ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => setProjectionSheetOpen(true)}
              aria-label="Editar salário previsto"
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {effectiveNextMonthProjection ? (
          <>
            <strong className={`projection-amount ${effectiveNextMonthProjection.leftoverCents >= 0 ? 'projection-amount--positive' : 'projection-amount--negative'}`}>
              {formatMoney(effectiveNextMonthProjection.leftoverCents)}
            </strong>
            <div className="projection-formula">
              {/* `?? 0` em vez de `profile!...!`: o `if` acima aceita projeção vinda do CACHE, que
                  sobrevive à remoção do salário por um render (o cache só é regravado quando o
                  boot termina). Com as asserções, essa janela rendia `formatMoney(null)` — "R$ NaN"
                  na tela. Janela estreita, mas o custo de fechar é um operador. */}
              <span className="projection-formula-term">
                <Wallet size={13} aria-hidden="true" /> {formatMoney(profile?.projectedSalaryCents ?? 0)}
              </span>
              {profile?.projectionIncludesBalance ? (
                <>
                  <span className="projection-formula-operator" aria-hidden="true">+</span>
                  <span className="projection-formula-term">
                    <PiggyBank size={13} aria-hidden="true" /> {formatMoney(projectionView.balanceCents)}
                  </span>
                </>
              ) : null}
              <span className="projection-formula-operator" aria-hidden="true">−</span>
              <span className="projection-formula-term">
                <Scale size={13} aria-hidden="true" /> {formatMoney(effectiveNextMonthProjection.committedCents)}
              </span>
            </div>
            <p className="projection-disclaimer">Simulação com o que você informou — não é saldo garantido.</p>
          </>
        ) : (
          <button className="projection-empty" type="button" onClick={() => setProjectionSheetOpen(true)}>
            <span className="projection-empty-icon">
              <Plus size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="projection-empty-title">Adicionar salário previsto</span>
              <span className="text-secondary projection-empty-desc">
                Veja quanto sobraria depois de pagar tudo que já está comprometido.
              </span>
            </span>
          </button>
        )}
      </article>

      {/* Mesma fonte da carta (ver `projectionView`): a sheet mostra a prévia ao vivo do efeito de
          ligar "contar meu saldo atual" — offline, lendo o valor cru, ela prometeria somar
          R$ 0,00 e a pessoa desligaria o toggle achando que a opção não funciona. */}
      <NextMonthProjectionSheet
        open={projectionSheetOpen}
        currentProjectedSalaryCents={profile?.projectedSalaryCents}
        committedCents={effectiveNextMonthProjection?.committedCents}
        totalBalanceCents={projectionView.balanceCents}
        includeCurrentBalance={profile?.projectionIncludesBalance ?? false}
        onSave={handleSaveProjectedSalary}
        onRemove={handleRemoveProjectedSalary}
        onToggleIncludeBalance={handleToggleIncludeBalance}
        onClose={() => setProjectionSheetOpen(false)}
      />

      <div className="quick-actions">
        <Link className="button button--primary" to="/app/transactions/new">
          <Plus size={18} aria-hidden="true" /> Lançar agora
        </Link>
        <Link className="button button--subtle" to="/app/accounts">
          <Wallet size={17} aria-hidden="true" /> Contas
        </Link>
        <Link className="button button--subtle" to="/app/cards">
          <CreditCard size={17} aria-hidden="true" /> Cartões
        </Link>
        <Link className="button button--subtle" to="/app/bills">
          <CalendarClock size={17} aria-hidden="true" /> A pagar
        </Link>
        <Link className="button button--subtle" to="/app/goals">
          <Target size={17} aria-hidden="true" /> Metas
        </Link>
      </div>

      {/* Mobile: o grid acima some ("Lançar agora" some pois o FAB já cobre), mas
          Contas/Cartões/A pagar/Metas continuam com atalho aqui. Visibilidade
          controlada em global.css. */}
      <div className="dash-shortcut-row">
        <Link className="button button--subtle" to="/app/accounts">
          <Wallet size={17} aria-hidden="true" /> Contas
        </Link>
        <Link className="button button--subtle" to="/app/cards">
          <CreditCard size={17} aria-hidden="true" /> Cartões
        </Link>
        <Link className="button button--subtle" to="/app/bills">
          <CalendarClock size={17} aria-hidden="true" /> A pagar
        </Link>
        <Link className="button button--subtle" to="/app/goals">
          <Target size={17} aria-hidden="true" /> Metas
        </Link>
      </div>

      {showStartGuide ? (
        <article className="surface surface-pad start-guide">
          <div>
            <p className="eyebrow">Comece em poucos minutos</p>
            <h2>Monte seu primeiro resumo antes de explorar o resto.</h2>
          </div>
          <div className="start-guide-steps" aria-label="Primeiros passos">
            <Link to="/app/accounts">
              <strong>1. Criar conta</strong>
              <span>Carteira, banco ou conta digital.</span>
            </Link>
            <Link to="/app/transactions/new">
              <strong>2. Lançar entrada ou gasto</strong>
              <span>Registre o primeiro movimento.</span>
            </Link>
            <Link to="/app/cards">
              <strong>3. Adicionar cartão</strong>
              <span>Faturas entram sem duplicar saldo.</span>
            </Link>
          </div>
        </article>
      ) : null}

      <article className="surface surface-pad spending-summary-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resumo de gastos</p>
            <h2>Para onde foi o dinheiro este mês</h2>
            {effectiveVariationPct !== null && (
              <p className="text-secondary spending-variation">
                {effectiveVariationPct > 0 ? (
                  <TrendingUp size={14} aria-hidden="true" />
                ) : effectiveVariationPct < 0 ? (
                  <TrendingDown size={14} aria-hidden="true" />
                ) : (
                  <Minus size={14} aria-hidden="true" />
                )}
                {effectiveVariationPct > 0 ? '+' : ''}
                {effectiveVariationPct}% vs. mês passado
              </p>
            )}
          </div>
          <Link className="inline-link" to="/app/search" state={{ autoOpenSearch: true }}>
            Buscar
          </Link>
        </div>
        {effectiveSpending.length > 0 ? (
          <div className="spending-bars">
            {effectiveSpending.map((row) => (
              <div className="spending-row" key={row.categoryId}>
                <div className="spending-row-label">
                  <span className="spending-row-name">
                    <CategoryMark category={row.mark} />
                    <strong>{row.categoryName}</strong>
                  </span>
                  <span>{formatMoney(row.amountCents)}</span>
                </div>
                <div className="spending-bar-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, Math.round((row.amountCents / maxSpendingCents) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : !isLoading ? (
          // `isLoading` (finanças), não `isCommittedLoading` (finanças + cartão): a lista acima
          // usa o gate `financeCache`, que não espera cartão. Com os dois desalinhados, quem
          // realmente não tem gasto no mês ficava com o corpo do card VAZIO — sem lista e sem
          // estado vazio — até as faturas resolverem. Achado na varredura de 03/08/2026.
          <EmptyState
            illustration="wallet"
            compact
            title="Sem gastos este mês"
            description="Quando você lançar gastos, as maiores categorias do mês aparecem aqui."
          />
        ) : null}
      </article>

      <div className="finance-grid">
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Próximos compromissos</p>
              <h2>O que vence primeiro</h2>
            </div>
          </div>
          {effectiveCommitments.length > 0 ? (
            <div className="item-list">
              {effectiveCommitments.map((commitment) => {
                // Fatura leva pra fatura do cartao; conta (avulsa ou recorrente) vai pra Contas e assinaturas.
                const href =
                  commitment.kind === 'invoice' && commitment.cardId
                    ? `/app/cards/${commitment.cardId}/invoices/${commitment.id}`
                    : '/app/bills';
                return (
                  <Link className="list-row list-row--link" to={href} key={`${commitment.kind}-${commitment.id}`}>
                    <div>
                      <strong>{commitment.description}</strong>
                      <span className="text-secondary">
                        {commitment.kind === 'bill' || commitment.kind === 'recurring' ? 'Conta' : 'Fatura'} ·{' '}
                        {formatFriendlyDate(commitment.dueAt)}
                      </span>
                    </div>
                    <strong className="amount--expense">{formatMoney(commitment.amountCents)}</strong>
                  </Link>
                );
              })}
            </div>
          ) : !isCommittedLoading ? (
            <EmptyState
              illustration="bills"
              compact
              title="Nenhum compromisso pendente"
              description="Contas a pagar, faturas e recorrências futuras aparecem aqui."
            />
          ) : null}
        </article>

        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Transações recentes</p>
              <h2>Últimos movimentos</h2>
            </div>
            <Link className="inline-link" to="/app/transactions">
              Ver todas
            </Link>
          </div>
          {effectiveRecent.length > 0 ? (
            <div className="item-list">
              {effectiveRecent.map((transaction) => {
                const isIncome = transaction.type === 'income';
                const isExpense = transaction.type === 'expense' || transaction.type === 'card_purchase';
                const amountClass = isIncome ? 'amount--income' : isExpense ? 'amount--expense' : 'amount--neutral';
                return (
                  <div className="list-row list-row--with-icon" key={transaction.id}>
                    <CategoryMark category={transaction.mark} />
                    <div className="list-row-body">
                      <strong>{transaction.description}</strong>
                      <span className="text-secondary">
                        {transactionTypeLabels[transaction.type]} · {formatFriendlyDate(transaction.date)}
                      </span>
                    </div>
                    <strong className={amountClass}>
                      {isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(transaction.amountCents)}
                    </strong>
                  </div>
                );
              })}
            </div>
          ) : !isLoading ? (
            <EmptyState
              illustration="transactions"
              compact
              title="Nenhuma transação ainda"
              description="Registre sua primeira entrada ou gasto para ver os movimentos aqui."
              action={
                <Link className="button button--subtle button--compact" to="/app/transactions/new">
                  <Plus size={16} aria-hidden="true" /> Lançar agora
                </Link>
              }
            />
          ) : null}
        </article>
      </div>

      {/* Próximos a receber — no FIM da tela de propósito, e fora de qualquer total de saldo:
          é lembrete, não dinheiro em mãos. Só aparece se houver algo vencendo em ≤5 dias. */}
      {effectiveUpcomingReceivables.length > 0 ? (
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Próximos a receber</p>
              <h2>Chega nos próximos dias</h2>
            </div>
            <Link className="inline-link" to="/app/receivables">
              Ver todos
            </Link>
          </div>
          <div className="item-list">
            {effectiveUpcomingReceivables.map((receivable) => (
              <Link className="list-row list-row--link" to="/app/receivables" key={receivable.id}>
                <div>
                  <strong>{receivable.description}</strong>
                  <span className="text-secondary">
                    {receivable.fromWho ? `${receivable.fromWho} · ` : ''}A receber · {formatFriendlyDate(receivable.dueAt)}
                  </span>
                </div>
                <strong className="amount--income">+{formatMoney(receivable.amountCents)}</strong>
              </Link>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
