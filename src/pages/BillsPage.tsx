import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronDown, Pencil, Repeat, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { ServiceMark } from '../components/ServiceMark';
import { findSubscriptionService, searchSubscriptionServices, type SubscriptionService } from '../finance/subscriptionServices';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { formatFriendlyDate, fromDateInputValue, toDateInputValue, todayInputValue } from '../finance/financeDates';
import { billStatusLabels, recurringFrequencyLabels } from '../finance/financeLabels';
import { CARD_PREFIX, buildAccountOrCardOptions, installmentOptions, parseAccountOrCard } from '../finance/accountOrCardOptions';
import {
  canRegisterRecurrence,
  createBill,
  createCategory,
  createRecurringRule,
  deleteCategory,
  deleteRecurringRule,
  isRecurrenceDue,
  nextOccurrenceDate,
  payBill,
  recordRecurringPayment,
  updateBill,
  updateBillStatus,
  updateCategory,
  updateRecurringRule,
} from '../finance/financeService';
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

  // ── form state (nova conta) ──
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
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
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payCategoryId, setPayCategoryId] = useState('');

  // ── edit recorrência sheet state ──
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editFrequency, setEditFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editNextOccurrenceAt, setEditNextOccurrenceAt] = useState(todayInputValue());

  // ── edit conta avulsa sheet state ──
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editBillDescription, setEditBillDescription] = useState('');
  const [editBillAmount, setEditBillAmount] = useState('');
  const [editBillCategoryId, setEditBillCategoryId] = useState('');
  const [editBillAccountId, setEditBillAccountId] = useState('');
  const [editBillInstallments, setEditBillInstallments] = useState(1);
  const [editBillDueDate, setEditBillDueDate] = useState(todayInputValue());

  // ── filtro de compromissos ──
  const [billFilter, setBillFilter] = useState<BillFilterKey>('open');

  // ── opções mescladas conta+cartão (reaproveitadas nos 3 selects + chip-row de pagamento) ──
  const { accountOptions, cardOptions } = buildAccountOrCardOptions(finance.accounts, cardsData.cards);
  const accountOrCardOptions = [...accountOptions, ...cardOptions];

  const recurringItems = useMemo(
    () =>
      finance.recurringRules
        .filter((r) => r.isActive)
        .slice()
        .sort((a, b) => a.nextOccurrenceAt.toMillis() - b.nextOccurrenceAt.toMillis()),
    [finance.recurringRules]
  );

  const visibleBills = useMemo(() => {
    const sorted = finance.bills.slice().sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis());
    if (billFilter === 'all') return sorted;
    if (billFilter === 'open') return sorted.filter((b) => b.status === 'pending' || b.status === 'overdue');
    return sorted.filter((b) => b.status === billFilter);
  }, [finance.bills, billFilter]);

  const serviceSuggestions = searchSubscriptionServices(description);

  function selectService(service: SubscriptionService) {
    setDescription(service.name);
    if (!categoryId && service.suggestedCategoryId) {
      setCategoryId(service.suggestedCategoryId);
    }
  }

  // ── open pay sheet ──
  function handleOpenPay(target: PayTarget) {
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
    if (!workspaceId || !user || !payTarget) return;
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
          <p className="eyebrow">O que você tem pra pagar</p>
          <h1 className="page-title page-title--compact">Contas a Pagar</h1>
        </div>
        <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
      </div>

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
              onCreateCategory={async (name, icon, type, color) => {
                if (!workspaceId || !user) return;
                const id = await createCategory(workspaceId, user.uid, { name, icon, type, color });
                setCategoryId(id);
              }}
              onUpdateCategory={async (id, patch) => {
                if (!workspaceId) return;
                await updateCategory(workspaceId, id, patch);
              }}
              onDeleteCategory={async (id) => {
                if (!workspaceId) return;
                await deleteCategory(workspaceId, id);
              }}
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
              <h2>Recorrentes{hasRecurring ? ` · ${recurringItems.length}` : ''}</h2>
            </div>
            <Repeat size={22} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          </div>

          {hasRecurring ? (
            <div className="item-list">
              {recurringItems.map((rule) => {
                const due = isRecurrenceDue(rule.nextOccurrenceAt.toDate());
                const canPayEarly = canRegisterRecurrence(rule.nextOccurrenceAt.toDate());
                const actionLabel = due ? 'Registrar' : canPayEarly ? 'Pagar adiantado' : null;
                const dateClassName = due ? 'amount--expense' : 'text-secondary';

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
                    </div>
                    <div className="list-row-end">
                      <strong>{rule.amountCents ? formatMoney(rule.amountCents) : 'valor variável'}</strong>
                      <SyncStatusBadge status={rule.localSyncStatus} />
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {actionLabel ? (
                          <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'recurring', item: rule })}>
                            {actionLabel}
                          </button>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.78rem', alignSelf: 'center' }}>Em dia</span>
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
              title="Nenhuma assinatura ou conta fixa"
              description="Aluguel, internet, streaming — cadastre como recorrente e o Granativa lembra sozinho todo ciclo."
            />
          )}
        </article>

        {/* ── Compromissos ── */}
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contas avulsas</p>
              <h2>Compromissos{hasBills ? ` · ${visibleBills.length}` : ''}</h2>
            </div>
            <CalendarClock size={22} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          </div>

          {hasBills && (
            <div className="chip-row">
              {billFilterChips.map((chip) => (
                <button key={chip.key} type="button" className={`chip${billFilter === chip.key ? ' chip--active' : ''}`} onClick={() => setBillFilter(chip.key)}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {hasBills ? (
            visibleBills.length > 0 ? (
              <div className="item-list">
                {visibleBills.map((bill) => {
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
                            <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'bill', item: bill })}>Pago</button>
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
        </article>
      </div>

      {/* ── Pay BottomSheet ── */}
      <BottomSheet
        open={Boolean(payTarget)}
        onClose={() => { setPayTarget(null); setPayDescription(''); setPayCategoryId(''); }}
        title={payTarget?.kind === 'bill' ? 'Confirmar pagamento' : 'Registrar pagamento'}
        subtitle={payTarget?.item.description}
      >
        <div className="form-stack">
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
                onCreateCategory={async (name, icon, type, color) => {
                  if (!workspaceId || !user) return;
                  const id = await createCategory(workspaceId, user.uid, { name, icon, type, color });
                  setPayCategoryId(id);
                }}
                onUpdateCategory={async (id, patch) => { if (!workspaceId) return; await updateCategory(workspaceId, id, patch); }}
                onDeleteCategory={async (id) => { if (!workspaceId) return; await deleteCategory(workspaceId, id); }}
              />
            </>
          )}

          <div className="field">
            <span className="field-label">Como foi pago?</span>
            <div className="chip-row">
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>Sem débito</button>
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
            <button className="button button--primary" type="button" disabled={payTarget?.kind === 'recurring' && !payAmount.trim() && !payTarget?.item.amountCents} onClick={handleConfirmPay}>
              Confirmar pagamento
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
            onCreateCategory={async (name, icon, type, color) => {
              if (!workspaceId || !user) return;
              const id = await createCategory(workspaceId, user.uid, { name, icon, type, color });
              setEditCategoryId(id);
            }}
            onUpdateCategory={async (id, patch) => { if (!workspaceId) return; await updateCategory(workspaceId, id, patch); }}
            onDeleteCategory={async (id) => { if (!workspaceId) return; await deleteCategory(workspaceId, id); }}
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
            onCreateCategory={async (name, icon, type, color) => {
              if (!workspaceId || !user) return;
              const id = await createCategory(workspaceId, user.uid, { name, icon, type, color });
              setEditBillCategoryId(id);
            }}
            onUpdateCategory={async (id, patch) => { if (!workspaceId) return; await updateCategory(workspaceId, id, patch); }}
            onDeleteCategory={async (id) => { if (!workspaceId) return; await deleteCategory(workspaceId, id); }}
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

      {confirmDialog}
    </section>
  );
}
