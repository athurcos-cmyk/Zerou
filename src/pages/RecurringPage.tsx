import { useState, type FormEvent } from 'react';
import { Repeat } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { formatFriendlyDate, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { recurringFrequencyLabels } from '../finance/financeLabels';
import {
  createCategory,
  createRecurringRule,
  deleteCategory,
  nextOccurrenceDate,
  recordRecurringPayment,
  updateCategory
} from '../finance/financeService';
import { recurringFrequencies, type CreateRecurringRuleInput } from '../finance/financeSchemas';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import type { RecurringRule } from '../types/contracts';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function RecurringPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');
  const [nextOccurrenceAt, setNextOccurrenceAt] = useState(todayInputValue());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const [payingRule, setPayingRule] = useState<RecurringRule | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');

  function handleOpenPay(rule: RecurringRule) {
    setPayingRule(rule);
    setPayAccountId(rule.accountId ?? '');
    setPayAmount(rule.amountCents ? formatMoney(rule.amountCents) : '');
  }

  function handleConfirmPay() {
    if (!workspaceId || !user || !payingRule) return;
    const amount = payAmount.trim() ? parseMoneyToCents(payAmount) : payingRule.amountCents;
    if (!amount) return;
    recordRecurringPayment(workspaceId, user.uid, payingRule, { accountId: payAccountId || undefined, amountCents: amount });
    setPayingRule(null);
    setPayAccountId('');
    setPayAmount('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar recorrências.');
      return;
    }

    createRecurringRule(workspaceId, user.uid, {
      description,
      amountCents: amount.trim() ? parseMoneyToCents(amount) : undefined,
      frequency,
      nextOccurrenceAt: fromDateInputValue(nextOccurrenceAt),
      accountId,
      categoryId
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a recorrência agora.')));
    setDescription('');
    setAmount('');
    setFrequency('monthly');
    setNextOccurrenceAt(todayInputValue());
    setAccountId('');
    setCategoryId('');
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Recorrências</p>
          <h1 className="page-title">Gastos que se repetem.</h1>
          <p className="page-description">Salve assinaturas, mensalidades e contas fixas para lembrar antes do vencimento.</p>
        </div>
        <Repeat size={28} aria-hidden="true" />
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <p className="eyebrow">Nova regra</p>
          <FormMessage>{message}</FormMessage>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="field">
            <span>Valor previsto</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          <SelectField
            label="Frequência"
            value={frequency}
            onChange={(v) => setFrequency(v as CreateRecurringRuleInput['frequency'])}
            options={recurringFrequencies.map((f) => ({ value: f, label: recurringFrequencyLabels[f] }))}
          />
          <label className="field">
            <span>Próxima ocorrência</span>
            <input className="input" type="date" value={nextOccurrenceAt} onChange={(event) => setNextOccurrenceAt(event.target.value)} />
          </label>
          <SelectField
            label="Conta"
            value={accountId}
            onChange={setAccountId}
            options={finance.accounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Definir depois"
          />
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
          <button className="button button--primary" type="submit">
            Criar recorrência
          </button>
        </form>

        <article className="surface surface-pad">
          <p className="eyebrow">Ativas</p>
          {finance.recurringRules.length > 0 ? (
            <div className="item-list">
              {finance.recurringRules.map((rule) => (
                <div className="list-row" key={rule.id}>
                  <div>
                    <strong>{rule.description}</strong>
                    <span className="text-secondary">
                      {recurringFrequencyLabels[rule.frequency]} · {formatFriendlyDate(rule.nextOccurrenceAt)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(rule.amountCents ?? 0)}</strong>
                    <SyncStatusBadge status={rule.localSyncStatus} />
                    <button className="button button--subtle button--compact" type="button" onClick={() => handleOpenPay(rule)}>
                      Registrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              illustration="transactions"
              title="Nenhuma recorrência ainda"
              description="Cadastre assinaturas e contas fixas para acompanhar quando vencem de novo."
            />
          )}
        </article>
      </div>

      <BottomSheet open={Boolean(payingRule)} onClose={() => setPayingRule(null)} title="Registrar pagamento" subtitle={payingRule?.description}>
        <div className="form-stack">
          <label className="field">
            <span>Valor pago</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </label>
          <div className="field">
            <span className="field-label">De qual conta saiu?</span>
            <div className="chip-row">
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>Sem débito</button>
              {finance.accounts.map((a) => (
                <button key={a.id} type="button" className={`chip${payAccountId === a.id ? ' chip--active' : ''}`} onClick={() => setPayAccountId(a.id)}>{a.name}</button>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {payingRule
                ? `A próxima ocorrência avança para ${formatFriendlyDate(
                    nextOccurrenceDate(payingRule.nextOccurrenceAt.toDate(), payingRule.frequency, payingRule.anchorDay)
                  )}.`
                : null}
            </p>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={!payAmount.trim()} onClick={handleConfirmPay}>Confirmar</button>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}
