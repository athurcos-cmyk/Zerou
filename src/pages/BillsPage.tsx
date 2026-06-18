import { useState, type FormEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { FormMessage } from '../components/FormMessage';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar compromissos.');
      return;
    }

    try {
      await createBill(workspaceId, user.uid, {
        description,
        amountCents: parseMoneyToCents(amount),
        dueDate: fromDateInputValue(dueDate),
        categoryId,
        accountId
      });
      setDescription('');
      setAmount('');
      setDueDate(todayInputValue());
      setCategoryId('');
      setAccountId('');
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o compromisso agora.'));
    }
  }

  async function setStatus(billId: string, status: Bill['status']) {
    if (!workspaceId) {
      return;
    }

    await updateBillStatus(workspaceId, billId, status);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Contas a pagar</p>
          <h1 className="page-title">Contas que já têm data.</h1>
          <p className="page-description">Anote aluguel, internet, mensalidades e outros compromissos para não se perder no mês.</p>
        </div>
        <CalendarClock size={28} aria-hidden="true" />
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <p className="eyebrow">Novo compromisso</p>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
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
        </form>

        <article className="surface surface-pad">
          <p className="eyebrow">Lista</p>
          {finance.bills.length > 0 ? (
            <div className="item-list">
              {finance.bills.map((bill) => (
                <div className="list-row" key={bill.id}>
                  <div>
                    <strong>{bill.description}</strong>
                    <span className="text-secondary">
                      {billStatusLabels[bill.status]} · {toDateInputValue(bill.dueDate)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(bill.amountCents)}</strong>
                    <SyncStatusBadge status={bill.localSyncStatus} />
                    {bill.status === 'pending' ? (
                      <>
                        <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay(bill)}>
                          Pago
                        </button>
                        <button className="button button--ghost button--compact" type="button" onClick={() => void setStatus(bill.id, 'cancelled')}>
                          Cancelar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhum compromisso criado ainda.</p>
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
