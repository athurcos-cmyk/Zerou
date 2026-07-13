import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
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
import { billStatusLabels } from '../finance/financeLabels';
import { createBill, createCategory, deleteCategory, payBill, updateBillStatus, updateCategory } from '../finance/financeService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Bill } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function BillsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');

  const statusChips: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'overdue', label: 'Vencidos' },
    { key: 'paid', label: 'Pagos' }
  ];

  const visibleBills = useMemo(() => {
    if (statusFilter === 'all') return finance.bills;
    return finance.bills.filter((bill) => bill.status === statusFilter);
  }, [finance.bills, statusFilter]);

  const serviceSuggestions = searchSubscriptionServices(description);

  // Preenche o nome canônico e sugere a categoria, sem sobrescrever uma escolhida à mão.
  function selectService(service: SubscriptionService) {
    setDescription(service.name);
    if (!categoryId && service.suggestedCategoryId) {
      setCategoryId(service.suggestedCategoryId);
    }
  }

  function handleOpenPay(bill: Bill) {
    setPayingBill(bill);
    setPayAccountId(bill.accountId ?? '');
    setPayAmount('');
  }

  function handleConfirmPay() {
    if (!workspaceId || !user || !payingBill) return;
    const amount = payAmount.trim() ? parseMoneyToCents(payAmount) : payingBill.amountCents;
    payBill(workspaceId, user.uid, payingBill, { accountId: payAccountId || undefined, amountCents: amount });
    setPayingBill(null);
    setPayAccountId('');
    setPayAmount('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar compromissos.');
      return;
    }

    createBill(workspaceId, user.uid, {
      description,
      amountCents: parseMoneyToCents(amount),
      dueDate: fromDateInputValue(dueDate),
      categoryId,
      accountId
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o compromisso agora.')));
    setDescription('');
    setAmount('');
    setDueDate(todayInputValue());
    setCategoryId('');
    setAccountId('');
  }

  function setStatus(billId: string, status: Bill['status']) {
    if (!workspaceId) {
      return;
    }

    updateBillStatus(workspaceId, billId, status).catch((error) =>
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar o compromisso agora.'))
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Compromissos</h1>
        </div>
        <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <button
            type="button"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <div>
              <p className="eyebrow">Novo compromisso</p>
              <h2 style={{ margin: 0 }}>Adicionar compromisso</h2>
            </div>
            <ChevronDown
              size={20}
              aria-hidden="true"
              style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, color: 'var(--text-secondary)' }}
            />
          </button>
          {formOpen && (<>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Descrição</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Energia, Aluguel, Internet"
            />
          </label>
          {serviceSuggestions.length > 0 && (
            <div className="service-picker" aria-label="Sugestões de contas e assinaturas">
              <span className="field-label">{description.trim() ? 'Encontramos estas opções' : 'Sugestões rápidas'}</span>
              <div className="service-suggestion-grid">
                {serviceSuggestions.map((service) => (
                  <button className="service-suggestion" type="button" key={service.id} onClick={() => selectService(service)}>
                    <ServiceMark service={service} />
                    <span>{service.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field">
            <span>Valor</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
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
            Criar compromisso
          </button>
          </>)}
        </form>

        <article className="surface surface-pad">
          <p className="eyebrow">Lista</p>
          {finance.bills.length > 0 && (
            <div className="chip-row">
              {statusChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={`chip${statusFilter === chip.key ? ' chip--active' : ''}`}
                  onClick={() => setStatusFilter(chip.key)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          {finance.bills.length > 0 ? (
            visibleBills.length > 0 ? (
            <div className="item-list">
              {visibleBills.map((bill) => (
                <div className="list-row list-row--with-icon" key={bill.id}>
                  <ServiceMark service={findSubscriptionService(bill.description)} />
                  <div className="list-row-body">
                    <strong>{bill.description}</strong>
                    <span className="text-secondary">
                      {billStatusLabels[bill.status]} · {formatFriendlyDate(bill.dueDate)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(bill.amountCents)}</strong>
                    <SyncStatusBadge status={bill.localSyncStatus} />
                    {bill.status === 'pending' || bill.status === 'overdue' ? (
                      <>
                        <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay(bill)}>
                          Pago
                        </button>
                        <button className="button button--ghost button--compact" type="button" onClick={() => setStatus(bill.id, 'cancelled')}>
                          Cancelar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <EmptyState
                illustration="bills"
                compact
                title="Nenhum resultado"
                description="Nenhum compromisso nesse filtro."
              />
            )
          ) : (
            <EmptyState
              illustration="bills"
              title="Nenhum compromisso ainda"
              description="Cadastre contas a pagar para lembrar dos vencimentos antes que eles cheguem."
            />
          )}
        </article>
      </div>

      <BottomSheet open={Boolean(payingBill)} onClose={() => setPayingBill(null)} title="Confirmar pagamento" subtitle={payingBill?.description}>
        <div className="form-stack">
          <label className="field">
            <span>Valor pago</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={payingBill ? formatMoney(payingBill.amountCents) : '0,00'}
              autoFocus
            />
            <span className="field-hint">Deixe em branco para usar o valor do compromisso.</span>
          </label>
          <div className="field">
            <span className="field-label">De qual conta saiu?</span>
            <div className="chip-row">
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>Sem débito</button>
              {finance.accounts.map((a) => (
                <button key={a.id} type="button" className={`chip${payAccountId === a.id ? ' chip--active' : ''}`} onClick={() => setPayAccountId(a.id)}>{a.name}</button>
              ))}
            </div>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" onClick={handleConfirmPay}>Confirmar pagamento</button>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}
