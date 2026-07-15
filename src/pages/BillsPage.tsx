import { useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { ServiceMark } from '../components/ServiceMark';
import { findSubscriptionService, searchSubscriptionServices, type SubscriptionService } from '../finance/subscriptionServices';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { formatFriendlyDate, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { billStatusLabels, recurringFrequencyLabels } from '../finance/financeLabels';
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
  updateBillStatus,
  updateCategory,
} from '../finance/financeService';
import { recurringFrequencies, type CreateRecurringRuleInput } from '../finance/financeSchemas';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Bill, RecurringRule } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

type PayTarget = { kind: 'bill'; item: Bill } | { kind: 'recurring'; item: RecurringRule };

type FilterKey = 'all' | 'pending' | 'overdue' | 'paid';

interface UnifiedItem {
  id: string;
  kind: 'bill' | 'recurring';
  description: string;
  amountCents: number;
  dueDisplay: string;
  dueDate: Date;
  status: string;
  raw: Bill | RecurringRule;
}

function statusOf(bill: Bill) { return bill.status; }
function statusOfRule() { return 'active' as const; }

export function BillsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();

  // ── form state ──
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');

  // ── pay sheet state ──
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payCategoryId, setPayCategoryId] = useState('');

  // ── filter ──
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all');

  const filterChips: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'overdue', label: 'Vencidas' },
    { key: 'paid', label: 'Pagas' },
  ];

  // ── unified list ──
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const bills: UnifiedItem[] = finance.bills.map((b) => ({
      id: b.id,
      kind: 'bill' as const,
      description: b.description,
      amountCents: b.amountCents,
      dueDisplay: formatFriendlyDate(b.dueDate),
      dueDate: b.dueDate.toDate(),
      status: b.status,
      raw: b,
    }));

    const recurring: UnifiedItem[] = finance.recurringRules
      .filter((r) => r.isActive)
      .map((r) => ({
        id: r.id,
        kind: 'recurring' as const,
        description: r.description,
        amountCents: r.amountCents ?? 0,
        dueDisplay: r.amountCents ? formatMoney(r.amountCents) : 'a preencher',
        dueDate: r.nextOccurrenceAt.toDate(),
        status: 'active',
        raw: r,
      }));

    const all = [...bills, ...recurring];
    all.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return all;
  }, [finance.bills, finance.recurringRules]);

  const visibleItems = useMemo(() => {
    if (statusFilter === 'all') return unifiedItems;
    if (statusFilter === 'paid') return unifiedItems.filter((item) => item.kind === 'bill' && (item.raw as Bill).status === 'paid');
    return unifiedItems.filter((item) => {
      if (item.kind === 'recurring') return statusFilter === 'pending';
      return (item.raw as Bill).status === statusFilter;
    });
  }, [unifiedItems, statusFilter]);

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
    if (target.kind === 'bill') {
      setPayAccountId(target.item.accountId ?? '');
      setPayAmount('');
      setPayDescription(target.item.description);
      setPayCategoryId(target.item.categoryId ?? '');
    } else {
      setPayAccountId(target.item.accountId ?? '');
      setPayAmount(target.item.amountCents ? centsToInputValue(target.item.amountCents) : '');
      setPayDescription('');
      setPayCategoryId(target.item.categoryId ?? '');
    }
  }

  function handleConfirmPay() {
    if (!workspaceId || !user || !payTarget) return;
    if (payTarget.kind === 'bill') {
      const bill = payTarget.item as Bill;
      const amt = payAmount.trim() ? parseMoneyToCents(payAmount) : bill.amountCents;
      payBill(workspaceId, user.uid, bill, {
        accountId: payAccountId || undefined,
        amountCents: amt,
        description: payDescription !== bill.description ? payDescription : undefined,
        categoryId: payCategoryId !== bill.categoryId ? payCategoryId : undefined,
      });
    } else {
      const rule = payTarget.item as RecurringRule;
      const amt = payAmount.trim() ? parseMoneyToCents(payAmount) : rule.amountCents;
      if (!amt) return;
      recordRecurringPayment(workspaceId, user.uid, rule, { accountId: payAccountId || undefined, amountCents: amt });
    }
    setPayTarget(null);
    setPayAccountId('');
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

  function handleDeleteRecurring(ruleId: string) {
    if (!workspaceId) return;
    deleteRecurringRule(workspaceId, ruleId);
  }

  // ── submit form ──
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar contas.');
      return;
    }

    const amountCents = amount.trim() ? parseMoneyToCents(amount) : undefined;
    const baseData = {
      description,
      amountCents: amountCents ?? 0,
      dueDate: fromDateInputValue(dueDate),
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
    };

    if (isRecurring) {
      createRecurringRule(workspaceId, user.uid, {
        description,
        amountCents,
        frequency,
        nextOccurrenceAt: fromDateInputValue(dueDate),
        accountId: accountId || undefined,
        categoryId: categoryId || undefined,
      }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta recorrente.')));

      // Also create the first bill immediately if it has an amount
      if (amountCents && amountCents > 0) {
        createBill(workspaceId, user.uid, {
          description,
          amountCents,
          dueDate: fromDateInputValue(dueDate),
          categoryId: categoryId || undefined,
          accountId: accountId || undefined,
        }).catch(() => {});
      }
    } else {
      createBill(workspaceId, user.uid, baseData).catch((error) =>
        setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta.')),
      );
    }

    setDescription('');
    setAmount('');
    setDueDate(todayInputValue());
    setCategoryId('');
    setAccountId('');
    setIsRecurring(false);
    setFrequency('monthly');
  }

  const hasItems = unifiedItems.length > 0;

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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <div>
              <p className="eyebrow">Nova conta</p>
              <h2 style={{ margin: 0 }}>Adicionar conta</h2>
            </div>
            <ChevronDown size={20} aria-hidden="true" style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, color: 'var(--text-secondary)' }} />
          </button>
          {formOpen && (<>
            <FormMessage>{message}</FormMessage>

            <label className="field">
              <span>Descrição</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Energia, Aluguel, Internet" />
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
                <button type="button" className={`chip${!isRecurring ? ' chip--active' : ''}`} onClick={() => setIsRecurring(false)}>Não</button>
                <button type="button" className={`chip${isRecurring ? ' chip--active' : ''}`} onClick={() => setIsRecurring(true)}>Sim</button>
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
              label="Conta de pagamento"
              value={accountId}
              onChange={setAccountId}
              options={finance.accounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Definir depois"
            />

            <button className="button button--primary" type="submit">
              {isRecurring ? 'Criar conta recorrente' : 'Criar conta'}
            </button>
          </>)}
        </form>

        {/* ── List ── */}
        <article className="surface surface-pad">
          <p className="eyebrow">Lista</p>
          {hasItems && (
            <div className="chip-row">
              {filterChips.map((chip) => (
                <button key={chip.key} type="button" className={`chip${statusFilter === chip.key ? ' chip--active' : ''}`} onClick={() => setStatusFilter(chip.key)}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          {hasItems ? (
            visibleItems.length > 0 ? (
              <div className="item-list">
                {visibleItems.map((item) => {
                  const isBill = item.kind === 'bill';
                  const billStatus = isBill ? (item.raw as Bill).status : 'active';
                  const isPending = billStatus === 'pending' || billStatus === 'overdue' || billStatus === 'active';
                  const dueLabel = isBill
                    ? `${billStatusLabels[billStatus as keyof typeof billStatusLabels]} · ${item.dueDisplay}`
                    : `${recurringFrequencyLabels[(item.raw as RecurringRule).frequency]} · próx. ${item.dueDisplay}`;

                  // Recurring action button
                  let actionLabel: string | null = null;
                  if (item.kind === 'recurring') {
                    const rule = item.raw as RecurringRule;
                    const due = isRecurrenceDue(rule.nextOccurrenceAt.toDate());
                    const can = canRegisterRecurrence(rule.nextOccurrenceAt.toDate());
                    if (due) actionLabel = 'Registrar';
                    else if (can) actionLabel = 'Pagar adiantado';
                  }

                  return (
                    <div className="list-row list-row--with-icon" key={`${item.kind}-${item.id}`}>
                      <ServiceMark service={findSubscriptionService(item.description)} />
                      <div className="list-row-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <strong>{item.description}</strong>
                          {item.kind === 'recurring' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--action-primary)', background: 'var(--action-primary-soft)', borderRadius: '999px', padding: '0.1rem 0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Recorrente
                            </span>
                          )}
                        </div>
                        <span className="text-secondary">{dueLabel}</span>
                      </div>
                      <div className="list-row-end">
                        <strong>{item.kind === 'recurring' && !(item.raw as RecurringRule).amountCents ? 'a preencher' : formatMoney(item.amountCents)}</strong>
                        <SyncStatusBadge status={(item.raw as any).localSyncStatus} />
                        {isBill && isPending ? (
                          <>
                            <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'bill', item: item.raw as Bill })}>Pago</button>
                            <button className="button button--ghost button--compact" type="button" onClick={() => handleCancelBill(item.id)}>Cancelar</button>
                          </>
                        ) : null}
                        {item.kind === 'recurring' && isPending && actionLabel ? (
                          <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay({ kind: 'recurring', item: item.raw as RecurringRule })}>
                            {actionLabel}
                          </button>
                        ) : null}
                        {item.kind === 'recurring' && isPending && !actionLabel ? (
                          <>
                            <span className="text-muted" style={{ fontSize: '0.78rem' }}>Em dia</span>
                            <button className="button button--ghost button--compact" type="button" onClick={() => handleDeleteRecurring(item.id)} style={{ fontSize: '0.72rem' }}>Desativar</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState illustration="bills" compact title="Nenhum resultado" description="Nenhuma conta nesse filtro." />
            )
          ) : (
            <EmptyState
              illustration="bills"
              title="Nenhuma conta ainda"
              description="Cadastre contas a pagar — avulsas ou recorrentes — e seja lembrado antes do vencimento."
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
            <span className="field-label">De qual conta saiu?</span>
            <div className="chip-row">
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>Sem débito</button>
              {finance.accounts.map((a) => (
                <button key={a.id} type="button" className={`chip${payAccountId === a.id ? ' chip--active' : ''}`} onClick={() => setPayAccountId(a.id)}>{a.name}</button>
              ))}
            </div>
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
    </section>
  );
}
