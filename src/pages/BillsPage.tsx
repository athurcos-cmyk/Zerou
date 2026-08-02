import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronDown, HelpCircle, Pencil, Repeat, Search, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { ServiceMark } from '../components/ServiceMark';
import { findSubscriptionService, searchSubscriptionServices, type SubscriptionService } from '../finance/subscriptionServices';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { formatFriendlyDate, fromDateInputValue, toDateInputValue, todayInputValue } from '../finance/financeDates';
import { billStatusLabels, recurringFrequencyLabels } from '../finance/financeLabels';
import { CARD_PREFIX, buildAccountOrCardOptions, installmentOptions, parseAccountOrCard } from '../finance/accountOrCardOptions';
import {
  canRegisterRecurrence,
  createBill,
  createRecurringRule,
  deleteRecurringRule,
  isRecurrenceDue,
  nextOccurrenceDate,
  payBill,
  recordRecurringPayment,
  releaseDateForRecurrence,
  updateBill,
  updateBillStatus,
  updateRecurringRule,
} from '../finance/financeService';
import { useCategoryActions } from '../finance/useCategoryActions';
import { BillsTour } from '../onboarding/BillsTour';
import { useBillsTour } from '../onboarding/billsTour.store';
import { recurringFrequencies, type CreateRecurringRuleInput } from '../finance/financeSchemas';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Bill, RecurringRule } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

type PayTarget = { kind: 'bill'; item: Bill } | { kind: 'recurring'; item: RecurringRule };

type BillFilterKey = 'open' | 'overdue' | 'paid' | 'all';

const billFilterChips: Array<{ key: BillFilterKey; label: string }> = [
  { key: 'open', label: 'Em aberto' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'paid', label: 'Pagas' },
  { key: 'all', label: 'Todas' },
];

export function BillsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const openBillsTour = useBillsTour((state) => state.openTour);

  // ── form state (nova conta) ──
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
  // Quatro instâncias de CategoryField nesta tela, cada uma preenchendo um campo diferente.
  const categoryActions = useCategoryActions(setCategoryId);
  const [accountId, setAccountId] = useState('');
  const [installments, setInstallments] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');

  // ── pay sheet state ──
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payInstallments, setPayInstallments] = useState(1);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payCategoryId, setPayCategoryId] = useState('');
  const payCategoryActions = useCategoryActions(setPayCategoryId);

  // ── edit recorrência sheet state ──
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editFrequency, setEditFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const editCategoryActions = useCategoryActions(setEditCategoryId);
  const [editNextOccurrenceAt, setEditNextOccurrenceAt] = useState(todayInputValue());

  // ── edit conta avulsa sheet state ──
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editBillDescription, setEditBillDescription] = useState('');
  const [editBillAmount, setEditBillAmount] = useState('');
  const [editBillCategoryId, setEditBillCategoryId] = useState('');
  const editBillCategoryActions = useCategoryActions(setEditBillCategoryId);
  const [editBillAccountId, setEditBillAccountId] = useState('');
  const [editBillInstallments, setEditBillInstallments] = useState(1);
  const [editBillDueDate, setEditBillDueDate] = useState(todayInputValue());

  // ── filtro de compromissos ──
  const [billFilter, setBillFilter] = useState<BillFilterKey>('open');

  // ── colapso das listas (3 por padrão, "Ver todas" expande) ──
  const [showAllRecurring, setShowAllRecurring] = useState(false);
  const [showAllBills, setShowAllBills] = useState(false);
  const BILLS_PAGE_SIZE = 3;

  // ── busca nas recorrências (lista cresce rápido — assinatura, conta fixa, etc.) ──
  const [recurringQuery, setRecurringQuery] = useState('');

  // ── opções mescladas conta+cartão (reaproveitadas nos 3 selects + chip-row de pagamento) ──
  const { accountOptions, cardOptions } = buildAccountOrCardOptions(finance.accounts, cardsData.cards);
  const accountOrCardOptions = [...accountOptions, ...cardOptions];

  /**
   * Frase que aparece no topo da sheet de confirmação, descrevendo exatamente o que o app vai
   * fazer — valor real, destino real. Nasceu do relato de usuários que liam "Pagar" como se o
   * Granativa fosse pagar a conta por eles (2026-08-02); dizer o efeito antes de confirmar é o
   * que desfaz isso no momento exato da dúvida.
   *
   * Reflete o que `handleConfirmPay` realmente faz: valor digitado ou o cadastrado; cartão vira
   * lançamento na fatura, conta desconta do saldo, e nenhum dos dois só registra a despesa.
   */
  const payPreview = useMemo(() => {
    if (!payTarget) return '';

    const fallbackCents = payTarget.kind === 'bill'
      ? (payTarget.item as Bill).amountCents
      : (payTarget.item as RecurringRule).amountCents ?? 0;
    const cents = payAmount.trim() ? parseMoneyToCents(payAmount) : fallbackCents;
    const valueLabel = cents ? formatMoney(cents) : 'o valor informado';
    const destination = accountOrCardOptions.find((option) => option.value === payAccountId);

    if (!payAccountId) {
      return `Vamos criar a despesa de ${valueLabel} no seu Extrato, sem descontar de nenhuma conta.`;
    }
    if (payAccountId.startsWith(CARD_PREFIX)) {
      return `Vamos lançar ${valueLabel} na fatura do ${destination?.label ?? 'cartão'}. Seu saldo em conta não muda agora — muda quando você pagar a fatura.`;
    }
    return `Vamos criar a despesa de ${valueLabel} e descontar do saldo de ${destination?.label ?? 'sua conta'}.`;
  }, [payTarget, payAmount, payAccountId, accountOrCardOptions]);

  const recurringItems = useMemo(
    () =>
      finance.recurringRules
        .filter((r) => r.isActive)
        .slice()
        .sort((a, b) => a.nextOccurrenceAt.toMillis() - b.nextOccurrenceAt.toMillis()),
    [finance.recurringRules]
  );

  const normalizedRecurringQuery = recurringQuery.trim().toLocaleLowerCase('pt-BR');
  const filteredRecurringItems = useMemo(
    () =>
      normalizedRecurringQuery
        ? recurringItems.filter((r) => r.description.toLocaleLowerCase('pt-BR').includes(normalizedRecurringQuery))
        : recurringItems,
    [recurringItems, normalizedRecurringQuery]
  );
  // Buscando, mostra todos os resultados (sem cap de 3) — senão a pessoa digita e o item que
  // procura pode nem estar entre as 3 primeiras exibidas.
  const displayedRecurringItems = normalizedRecurringQuery
    ? filteredRecurringItems
    : showAllRecurring
    ? recurringItems
    : recurringItems.slice(0, BILLS_PAGE_SIZE);

  const recurringTotalCents = useMemo(
    () => recurringItems.reduce((sum, r) => sum + (r.amountCents ?? 0), 0),
    [recurringItems]
  );

  const visibleBills = useMemo(() => {
    const sorted = finance.bills.slice().sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis());
    if (billFilter === 'all') return sorted;
    if (billFilter === 'open') return sorted.filter((b) => b.status === 'pending' || b.status === 'overdue');
    return sorted.filter((b) => b.status === billFilter);
  }, [finance.bills, billFilter]);

  const billsTotalCents = useMemo(() => visibleBills.reduce((sum, b) => sum + b.amountCents, 0), [visibleBills]);

  const serviceSuggestions = searchSubscriptionServices(description);

  function selectService(service: SubscriptionService) {
    setDescription(service.name);
    if (!categoryId && service.suggestedCategoryId) {
      setCategoryId(service.suggestedCategoryId);
    }
  }

  // ── open pay sheet ──
  function handleOpenPay(target: PayTarget) {
    setPaySubmitting(false);
    setPayTarget(target);
    const item = target.item;
    setPayAccountId(item.cardId ? `${CARD_PREFIX}${item.cardId}` : item.accountId ?? '');
    setPayInstallments(target.kind === 'bill' ? target.item.installments ?? 1 : 1);
    if (target.kind === 'bill') {
      setPayAmount('');
      setPayDescription(target.item.description);
      setPayCategoryId(target.item.categoryId ?? '');
    } else {
      setPayAmount(target.item.amountCents ? centsToInputValue(target.item.amountCents) : '');
      setPayDescription('');
      setPayCategoryId(target.item.categoryId ?? '');
    }
  }

  function handleConfirmPay() {
    if (!workspaceId || !user || !payTarget || paySubmitting) return;
    setPaySubmitting(true);
    const { accountId: payAcct, cardId: payCard } = parseAccountOrCard(payAccountId);
    if (payTarget.kind === 'bill') {
      const bill = payTarget.item as Bill;
      const amt = payAmount.trim() ? parseMoneyToCents(payAmount) : bill.amountCents;
      payBill(workspaceId, user.uid, bill, {
        accountId: payAcct,
        cardId: payCard,
        installments: payCard ? payInstallments : undefined,
        amountCents: amt,
        description: payDescription !== bill.description ? payDescription : undefined,
        categoryId: payCategoryId !== bill.categoryId ? payCategoryId : undefined,
      }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar o pagamento.')));
    } else {
      const rule = payTarget.item as RecurringRule;
      const amt = payAmount.trim() ? parseMoneyToCents(payAmount) : rule.amountCents;
      if (!amt) return;
      recordRecurringPayment(workspaceId, user.uid, rule, { accountId: payAcct, cardId: payCard, amountCents: amt }).catch(
        (error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar o pagamento.')),
      );
    }
    setPayTarget(null);
    setPayAccountId('');
    setPayInstallments(1);
    setPayAmount('');
    setPayDescription('');
    setPayCategoryId('');
  }

  function handleCancelBill(billId: string) {
    if (!workspaceId) return;
    updateBillStatus(workspaceId, billId, 'cancelled').catch((error) =>
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível cancelar.')),
    );
  }

  async function handleDeleteRecurring(rule: RecurringRule) {
    if (!workspaceId) return;
    const ok = await confirm({
      title: 'Desativar recorrência?',
      message: `"${rule.description}" para de gerar novas cobranças. O histórico já lançado continua no Extrato.`,
      confirmLabel: 'Desativar',
      danger: true,
    });
    if (!ok) return;
    deleteRecurringRule(workspaceId, rule.id);
  }

  // ── editar recorrência ──
  function handleOpenEditRule(rule: RecurringRule) {
    setEditingRule(rule);
    setEditDescription(rule.description);
    setEditAmount(rule.amountCents ? centsToInputValue(rule.amountCents) : '');
    setEditFrequency(rule.frequency);
    setEditAccountId(rule.cardId ? `${CARD_PREFIX}${rule.cardId}` : rule.accountId ?? '');
    setEditCategoryId(rule.categoryId ?? '');
    setEditNextOccurrenceAt(toDateInputValue(rule.nextOccurrenceAt));
  }

  function handleSaveEditRule() {
    if (!workspaceId || !editingRule) return;

    const editedDate = fromDateInputValue(editNextOccurrenceAt);
    const dateChanged = editedDate.getTime() !== editingRule.nextOccurrenceAt.toDate().getTime();
    const isMonthBased = editFrequency === 'monthly' || editFrequency === 'yearly';

    // Semanal e quinzenal andam em dias corridos, então a data vai derivando e o `anchorDay`
    // gravado na criação perde relação com o cronograma atual. Ao mudar pra mensal/anual é
    // preciso reancorar no dia da PRÓXIMA ocorrência — senão a recorrência saltaria de volta
    // pro dia em que foi criada (ex.: criada semanal no dia 21, já andou pro dia 11, virar
    // mensal a jogava pro dia 21 de novo). Nos demais casos o âncora original é mantido: é
    // ele que faz a data "voltar" pro dia 31 depois de passar por um mês curto.
    const wasDayBased = editingRule.frequency === 'weekly' || editingRule.frequency === 'biweekly';
    const becomesMonthBased = editFrequency === 'monthly' || editFrequency === 'yearly';
    const anchorDay = wasDayBased && becomesMonthBased
      ? editingRule.nextOccurrenceAt.toDate().getDate()
      // Correção manual da data numa recorrência mensal/anual reancora no dia corrigido —
      // senão o próximo ciclo voltaria a saltar pro dia antigo (mesma razão do caso acima).
      : isMonthBased && dateChanged
      ? editedDate.getDate()
      : undefined;

    const editedMethod = parseAccountOrCard(editAccountId);

    updateRecurringRule(workspaceId, editingRule.id, {
      description: editDescription.trim() || editingRule.description,
      // `null` (e não `undefined`) pra LIMPAR: campo vazio aqui significa "valor varia" /
      // "sem conta" / "sem categoria". Com `undefined` a gravação era pulada e o valor
      // antigo permanecia — ver updateRecurringRule.
      amountCents: editAmount.trim() ? parseMoneyToCents(editAmount) : null,
      frequency: editFrequency,
      nextOccurrenceAt: editedDate,
      anchorDay,
      // Sempre os dois explícitos (nunca `undefined`): trocar de conta pra cartão (ou
      // vice-versa) precisa limpar o outro campo, senão os dois ficariam gravados juntos.
      accountId: editedMethod.accountId ?? null,
      cardId: editedMethod.cardId ?? null,
      categoryId: editCategoryId || null,
    });
    setEditingRule(null);
  }

  // ── editar conta avulsa ──
  function handleOpenEditBill(bill: Bill) {
    setEditingBill(bill);
    setEditBillDescription(bill.description);
    setEditBillAmount(centsToInputValue(bill.amountCents));
    setEditBillCategoryId(bill.categoryId ?? '');
    setEditBillAccountId(bill.cardId ? `${CARD_PREFIX}${bill.cardId}` : bill.accountId ?? '');
    setEditBillInstallments(bill.installments ?? 1);
    setEditBillDueDate(toDateInputValue(bill.dueDate));
  }

  function handleSaveEditBill() {
    if (!workspaceId || !editingBill) return;
    const editedMethod = parseAccountOrCard(editBillAccountId);
    updateBill(workspaceId, editingBill.id, {
      description: editBillDescription.trim() || editingBill.description,
      amountCents: editBillAmount.trim() ? parseMoneyToCents(editBillAmount) : editingBill.amountCents,
      dueDate: fromDateInputValue(editBillDueDate),
      categoryId: editBillCategoryId || null,
      // Sempre os dois explícitos: trocar de conta pra cartão (ou vice-versa) precisa
      // limpar o outro campo.
      accountId: editedMethod.accountId ?? null,
      cardId: editedMethod.cardId ?? null,
      installments: editedMethod.cardId ? editBillInstallments : null,
    });
    setEditingBill(null);
  }

  // ── submit form (nova conta) ──
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar contas.');
      return;
    }

    const amountCents = amount.trim() ? parseMoneyToCents(amount) : undefined;
    const method = parseAccountOrCard(accountId);

    if (isRecurring) {
      createRecurringRule(workspaceId, user.uid, {
        description,
        amountCents,
        frequency,
        nextOccurrenceAt: fromDateInputValue(dueDate),
        accountId: method.accountId,
        cardId: method.cardId,
        categoryId: categoryId || undefined,
      }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta recorrente.')));
      // NÃO cria um compromisso avulso aqui: a recorrente vive só na seção "Recorrentes".
      // As ocorrências viram compromissos quando vencem, materializadas pela Cloud Function
      // `generateRecurrences` — criar um bill agora duplicava a conta na lista de avulsas.
    } else {
      createBill(workspaceId, user.uid, {
        description,
        amountCents: amountCents ?? 0,
        dueDate: fromDateInputValue(dueDate),
        categoryId: categoryId || undefined,
        accountId: method.accountId,
        cardId: method.cardId,
        installments: method.cardId ? installments : undefined,
      }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta.')));
    }

    setDescription('');
    setAmount('');
    setDueDate(todayInputValue());
    setCategoryId('');
    setAccountId('');
    setInstallments(1);
    setIsRecurring(false);
    setFrequency('monthly');
    setFormOpen(false);
  }

  const hasBills = finance.bills.length > 0;
  const hasRecurring = recurringItems.length > 0;

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">O que você já sabe que vai pagar</p>
          <h1 className="page-title page-title--compact">Contas e assinaturas</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            className="icon-button"
            type="button"
            aria-label="Como funciona Contas e assinaturas"
            title="Como funciona"
            onClick={openBillsTour}
          >
            <HelpCircle size={17} aria-hidden="true" />
          </button>
          <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
        </div>
      </div>

      {/* Linha fixa: a tela era lida como "onde eu pago minhas contas", e várias pessoas
          concluíram que só servia pra registrar a fatura do cartão. Dizer o que ela faz — e o
          que ela NÃO faz — logo no topo é a defesa mais barata contra isso. */}
      <p className="settings-hint">
        Cadastre aqui suas assinaturas e contas fixas. O Granativa lembra você antes de vencer e
        já conta esses valores no seu Comprometido — <strong>ele não paga nada por você</strong>.
        Quando a cobrança acontecer, é só confirmar que já foi.
      </p>

      <div className="finance-grid">
        {/* ── Form ── */}
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <button
            type="button"
            className="form-accordion-toggle"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <div>
              <p className="eyebrow">Nova conta</p>
              <h2 style={{ margin: 0 }}>Adicionar conta</h2>
            </div>
            <ChevronDown size={20} aria-hidden="true" style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-normal)', flexShrink: 0, color: 'var(--text-secondary)' }} />
          </button>
          {formOpen && (<>
            <FormMessage>{message}</FormMessage>

            <label className="field">
              <span>Descrição</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Energia, Aluguel, Internet" autoFocus />
            </label>

            {serviceSuggestions.length > 0 && (
              <div className="service-picker" aria-label="Sugestões">
                <span className="field-label">{description.trim() ? 'Encontramos estas opções' : 'Sugestões rápidas'}</span>
                <div className="service-suggestion-grid">
                  {serviceSuggestions.map((svc) => (
                    <button className="service-suggestion" type="button" key={svc.id} onClick={() => selectService(svc)}>
                      <ServiceMark service={svc} />
                      <span>{svc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="field">
              <span>Valor</span>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              <span className="field-hint">Deixe em branco se o valor varia todo mês.</span>
            </label>

            {/* ── Recurring toggle ── */}
            <div className="field">
              <span className="field-label">Se repete?</span>
              <div className="chip-row">
                <button type="button" className={`chip${!isRecurring ? ' chip--active' : ''}`} onClick={() => setIsRecurring(false)}>Não, é avulsa</button>
                <button type="button" className={`chip${isRecurring ? ' chip--active' : ''}`} onClick={() => setIsRecurring(true)}>Sim, recorrente</button>
              </div>
            </div>

            {isRecurring && (
              <SelectField
                label="Frequência"
                value={frequency}
                onChange={(v) => setFrequency(v as CreateRecurringRuleInput['frequency'])}
                options={recurringFrequencies.map((f) => ({ value: f, label: recurringFrequencyLabels[f] }))}
              />
            )}

            <label className="field">
              <span>{isRecurring ? 'Primeiro vencimento' : 'Vencimento'}</span>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <CategoryField
              value={categoryId}
              onChange={setCategoryId}
              categories={finance.categories}
              filterType="expense"
              {...categoryActions}
            />

            <SelectField
              label="Conta ou cartão"
              value={accountId}
              onChange={setAccountId}
              options={accountOrCardOptions}
              placeholder="Definir depois"
            />

            {!isRecurring && accountId.startsWith(CARD_PREFIX) ? (
              <SelectField
                label="Parcelamento"
                value={String(installments)}
                onChange={(v) => setInstallments(Number(v))}
                options={installmentOptions()}
              />
            ) : null}

            <button className="button button--primary" type="submit">
              {isRecurring ? 'Criar conta recorrente' : 'Criar conta'}
            </button>
          </>)}
        </form>

        {/* ── Recorrentes ── */}
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assinaturas e contas fixas</p>
              <h2>Recorrentes{hasRecurring ? ` · ${recurringItems.length} · ${formatMoney(recurringTotalCents)}` : ''}</h2>
            </div>
            <Repeat size={22} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          </div>

          {hasRecurring && (
            <div className="input-with-icon" style={{ marginBottom: '0.85rem' }}>
              <Search size={17} aria-hidden="true" />
              <input
                className="input"
                value={recurringQuery}
                onChange={(e) => setRecurringQuery(e.target.value)}
                placeholder="Buscar recorrência"
                aria-label="Buscar recorrência por nome"
              />
            </div>
          )}

          {finance.loading ? (
            <LoadingState compact />
          ) : hasRecurring ? (
            displayedRecurringItems.length > 0 ? (
            <div className="item-list">
              {displayedRecurringItems.map((rule) => {
                const due = isRecurrenceDue(rule.nextOccurrenceAt.toDate());
                const canPayEarly = canRegisterRecurrence(rule.nextOccurrenceAt.toDate());
                // Um rótulo só pros dois estados. "Pagar adiantado" sugeria uma AÇÃO diferente
                // (quitar antes do vencimento) quando é a mesma confirmação de sempre — a linha
                // da data logo acima já diz se venceu ou não. Voz passiva porque cobre os dois
                // casos reais: a conta que VOCÊ pagou e a assinatura que o cartão foi cobrado.
                const canRegister = due || canPayEarly;
                const dateClassName = due ? 'amount--expense' : 'text-secondary';
                // Fora da janela de 7 dias não há ação — antes isso virava um "Em dia" mudo, e a
                // tela inteira parecia inerte pra quem abria longe do vencimento.
                const opensAt = releaseDateForRecurrence(rule.nextOccurrenceAt.toDate());

                return (
                  <div className="list-row list-row--with-icon" key={rule.id}>
                    <ServiceMark service={findSubscriptionService(rule.description)} />
                    <div className="list-row-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <strong>{rule.description}</strong>
                        <span className="pill pill--accent">{recurringFrequencyLabels[rule.frequency]}</span>
                      </div>
                      <span className={dateClassName}>
                        {due ? 'Vence' : 'Próximo vencimento'}: {formatFriendlyDate(rule.nextOccurrenceAt)}
                      </span>
                      {/* Fora da janela não há botão nenhum, e antes isso virava um "Em dia"
                          mudo — a tela parecia inerte pra quem abria longe do vencimento. Vive
                          no corpo da linha, não no slot da direita: lá o texto quebrava em duas
                          linhas no mobile e colidia com os ícones de editar/desativar. */}
                      {!canRegister && (
                        <span className="text-muted" style={{ fontSize: '0.76rem' }}>
                          Você confirma a partir de {formatFriendlyDate(opensAt)}
                        </span>
                      )}
                    </div>
                    <div className="list-row-end">
                      <strong>{rule.amountCents ? formatMoney(rule.amountCents) : 'valor variável'}</strong>
                      <SyncStatusBadge status={rule.localSyncStatus} />
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {canRegister && (
                          <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'recurring', item: rule })}>
                            Já foi paga
                          </button>
                        )}
                        <button className="icon-button" type="button" aria-label={`Editar ${rule.description}`} onClick={() => handleOpenEditRule(rule)}>
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button className="icon-button" type="button" aria-label={`Desativar ${rule.description}`} onClick={() => void handleDeleteRecurring(rule)}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            ) : (
              <EmptyState
                illustration="bills"
                compact
                title="Nenhum resultado"
                description={`Nada encontrado para "${recurringQuery.trim()}".`}
              />
            )
          ) : (
            <EmptyState
              illustration="bills"
              compact
              title="Nenhuma assinatura ou conta fixa"
              description="Aluguel, internet, streaming — cadastre como recorrente e o Granativa lembra sozinho todo ciclo."
            />
          )}
          {!normalizedRecurringQuery && recurringItems.length > BILLS_PAGE_SIZE && (
            <button type="button" className="list-toggle" onClick={() => setShowAllRecurring((v) => !v)}>
              {showAllRecurring ? (
                <>Ver menos <ChevronDown size={14} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} /></>
              ) : (
                <>Ver todas as {recurringItems.length} recorrentes <ChevronDown size={14} aria-hidden="true" /></>
              )}
            </button>
          )}
        </article>

        {/* ── Compromissos ── */}
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contas avulsas</p>
              <h2>Compromissos{hasBills ? ` · ${visibleBills.length} · ${formatMoney(billsTotalCents)}` : ''}</h2>
            </div>
            <CalendarClock size={22} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          </div>

          {hasBills && (
            <div className="chip-row">
              {billFilterChips.map((chip) => (
                <button key={chip.key} type="button" className={`chip${billFilter === chip.key ? ' chip--active' : ''}`} onClick={() => { setBillFilter(chip.key); setShowAllBills(false); }}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {finance.loading ? (
            <LoadingState compact />
          ) : hasBills ? (
            visibleBills.length > 0 ? (
              <div className="item-list">
                {(showAllBills ? visibleBills : visibleBills.slice(0, BILLS_PAGE_SIZE)).map((bill) => {
                  const isPending = bill.status === 'pending' || bill.status === 'overdue';
                  const dateClassName = bill.status === 'overdue' ? 'amount--expense' : bill.status === 'paid' ? 'text-muted' : 'text-secondary';

                  return (
                    <div className="list-row list-row--with-icon" key={bill.id}>
                      <ServiceMark service={findSubscriptionService(bill.description)} />
                      <div className="list-row-body">
                        <strong>{bill.description}</strong>
                        <span className={dateClassName}>
                          {billStatusLabels[bill.status]} · {formatFriendlyDate(bill.dueDate)}
                        </span>
                      </div>
                      <div className="list-row-end">
                        <strong>{formatMoney(bill.amountCents)}</strong>
                        <SyncStatusBadge status={bill.localSyncStatus} />
                        {isPending ? (
                          <>
                            <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'bill', item: bill })}>Já foi paga</button>
                            <button className="button button--ghost button--compact" type="button" onClick={() => handleCancelBill(bill.id)}>Cancelar</button>
                            <button className="icon-button" type="button" aria-label={`Editar ${bill.description}`} onClick={() => handleOpenEditBill(bill)}>
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState illustration="bills" compact title="Nada por aqui" description="Nenhuma conta nesse filtro." />
            )
          ) : (
            <EmptyState
              illustration="bills"
              title="Nenhuma conta avulsa ainda"
              description="Cadastre uma conta pontual — sem repetição — e seja lembrado antes do vencimento."
            />
          )}
          {visibleBills.length > BILLS_PAGE_SIZE && (
            <button type="button" className="list-toggle" onClick={() => setShowAllBills((v) => !v)}>
              {showAllBills ? (
                <>Ver menos <ChevronDown size={14} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} /></>
              ) : (
                <>Ver todas as {visibleBills.length} contas <ChevronDown size={14} aria-hidden="true" /></>
              )}
            </button>
          )}
        </article>
      </div>

      {/* ── Pay BottomSheet ── */}
      <BottomSheet
        open={Boolean(payTarget)}
        onClose={() => { setPayTarget(null); setPayDescription(''); setPayCategoryId(''); }}
        title="Confirmar que já foi paga"
        subtitle={payTarget?.item.description}
      >
        <div className="form-stack">
          {/* A frase que desfaz o mal-entendido, no exato momento da dúvida: dizer o que o app
              vai fazer, com o valor e o destino reais, ANTES de a pessoa confirmar. Sem isso ela
              só descobre o efeito depois, no Extrato. */}
          <p className="pay-preview">{payPreview}</p>
          <label className="field">
            <span>Valor pago</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={payTarget?.kind === 'bill' && payTarget.item.amountCents > 0 ? formatMoney((payTarget.item as Bill).amountCents) : '0,00'}
              autoFocus
            />
            {payTarget?.kind === 'bill' && <span className="field-hint">Deixe em branco para usar o valor da conta.</span>}
          </label>

          {payTarget?.kind === 'bill' && (
            <>
              <label className="field">
                <span>Descrição</span>
                <input className="input" value={payDescription} onChange={(e) => setPayDescription(e.target.value)} placeholder="Nome do gasto no extrato" />
              </label>
              <CategoryField
                value={payCategoryId}
                onChange={setPayCategoryId}
                categories={finance.categories}
                filterType="expense"
                {...payCategoryActions}
              />
            </>
          )}

          <div className="field">
            <span className="field-label">De onde saiu o dinheiro?</span>
            <div className="chip-row">
              {/* "Sem débito" era jargão — ninguém sabia se aquilo significava "não paguei" ou
                  "não registra". O rótulo agora diz o efeito. */}
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>Não descontar</button>
              {accountOptions.map((option) => (
                <button key={option.value} type="button" className={`chip${payAccountId === option.value ? ' chip--active' : ''}`} onClick={() => setPayAccountId(option.value)}>{option.label}</button>
              ))}
              {cardOptions.map((option) => (
                <button key={option.value} type="button" className={`chip${payAccountId === option.value ? ' chip--active' : ''}`} onClick={() => setPayAccountId(option.value)}>{option.label}</button>
              ))}
            </div>
            {payTarget?.kind === 'bill' && payAccountId.startsWith(CARD_PREFIX) ? (
              <SelectField
                label="Parcelamento"
                value={String(payInstallments)}
                onChange={(v) => setPayInstallments(Number(v))}
                options={installmentOptions()}
              />
            ) : null}
            {payTarget?.kind === 'recurring' && (
              <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
                Próxima ocorrência avança para {formatFriendlyDate(
                  nextOccurrenceDate(payTarget.item.nextOccurrenceAt.toDate(), payTarget.item.frequency, payTarget.item.anchorDay)
                )}.
              </p>
            )}
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={paySubmitting || (payTarget?.kind === 'recurring' && !payAmount.trim() && !payTarget?.item.amountCents)} onClick={handleConfirmPay}>
              Confirmar
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Editar recorrência BottomSheet ── */}
      <BottomSheet
        open={Boolean(editingRule)}
        onClose={() => setEditingRule(null)}
        title="Editar recorrência"
        subtitle={editingRule?.description}
      >
        <div className="form-stack">
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </label>
          <label className="field">
            <span>Valor</span>
            <input className="input input--money" inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="0,00" />
            <span className="field-hint">Deixe em branco se o valor varia todo mês.</span>
          </label>
          <SelectField
            label="Frequência"
            value={editFrequency}
            onChange={(v) => setEditFrequency(v as CreateRecurringRuleInput['frequency'])}
            options={recurringFrequencies.map((f) => ({ value: f, label: recurringFrequencyLabels[f] }))}
          />
          <label className="field">
            <span>Próximo vencimento</span>
            <input className="input" type="date" value={editNextOccurrenceAt} onChange={(e) => setEditNextOccurrenceAt(e.target.value)} />
          </label>
          <CategoryField
            value={editCategoryId}
            onChange={setEditCategoryId}
            categories={finance.categories}
            filterType="expense"
            {...editCategoryActions}
          />
          <SelectField
            label="Conta ou cartão"
            value={editAccountId}
            onChange={setEditAccountId}
            // A opção vazia deixa o placeholder honesto: sem ela dava pra escolher uma conta
            // mas nunca voltar atrás.
            options={[{ value: '', label: 'Definir depois' }, ...accountOrCardOptions]}
            placeholder="Definir depois"
          />
          <div className="sheet-actions">
            <button className="button button--primary" type="button" onClick={handleSaveEditRule}>
              Salvar alterações
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Editar conta avulsa BottomSheet ── */}
      <BottomSheet
        open={Boolean(editingBill)}
        onClose={() => setEditingBill(null)}
        title="Editar conta"
        subtitle={editingBill?.description}
      >
        <div className="form-stack">
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={editBillDescription} onChange={(e) => setEditBillDescription(e.target.value)} />
          </label>
          <label className="field">
            <span>Valor</span>
            <input className="input input--money" inputMode="decimal" value={editBillAmount} onChange={(e) => setEditBillAmount(e.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input className="input" type="date" value={editBillDueDate} onChange={(e) => setEditBillDueDate(e.target.value)} />
          </label>
          <CategoryField
            value={editBillCategoryId}
            onChange={setEditBillCategoryId}
            categories={finance.categories}
            filterType="expense"
            {...editBillCategoryActions}
          />
          <SelectField
            label="Conta ou cartão"
            value={editBillAccountId}
            onChange={setEditBillAccountId}
            options={[{ value: '', label: 'Definir depois' }, ...accountOrCardOptions]}
            placeholder="Definir depois"
          />
          {editBillAccountId.startsWith(CARD_PREFIX) ? (
            <SelectField
              label="Parcelamento"
              value={String(editBillInstallments)}
              onChange={(v) => setEditBillInstallments(Number(v))}
              options={installmentOptions()}
            />
          ) : null}
          <div className="sheet-actions">
            <button className="button button--primary" type="button" onClick={handleSaveEditBill}>
              Salvar alterações
            </button>
          </div>
        </div>
      </BottomSheet>

      <BillsTour />

      {confirmDialog}
    </section>
  );
}
