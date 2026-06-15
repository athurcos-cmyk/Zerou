import { useState, type FormEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
import { billStatusLabels } from '../finance/financeLabels';
import { createBill, updateBillStatus } from '../finance/financeService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';
import type { Bill } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function BillsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

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
          <label className="field">
            <span>Categoria</span>
            <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Sem categoria</option>
              {finance.categories
                .filter((category) => category.type !== 'income')
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Conta de pagamento</span>
            <select className="select" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Definir depois</option>
              {finance.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
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
                        <button className="button button--subtle button--compact" type="button" onClick={() => void setStatus(bill.id, 'paid')}>
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
    </section>
  );
}
