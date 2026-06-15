import { useState, type FormEvent } from 'react';
import { Repeat } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
import { recurringFrequencyLabels } from '../finance/financeLabels';
import { createRecurringRule } from '../finance/financeService';
import { recurringFrequencies, type CreateRecurringRuleInput } from '../finance/financeSchemas';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';

export function RecurringPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<CreateRecurringRuleInput['frequency']>('monthly');
  const [nextOccurrenceAt, setNextOccurrenceAt] = useState(todayInputValue());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua o onboarding antes de criar recorrências.');
      return;
    }

    try {
      await createRecurringRule(workspaceId, user.uid, {
        description,
        amountCents: amount.trim() ? parseMoneyToCents(amount) : undefined,
        frequency,
        nextOccurrenceAt: fromDateInputValue(nextOccurrenceAt),
        accountId,
        categoryId
      });
      setDescription('');
      setAmount('');
      setFrequency('monthly');
      setNextOccurrenceAt(todayInputValue());
      setAccountId('');
      setCategoryId('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a recorrência agora.');
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Recorrências</p>
          <h1 className="page-title">Regras simples.</h1>
          <p className="page-description">Recorrências ativas entram como previsão no disponível livre v1.</p>
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
          <label className="field">
            <span>Frequência</span>
            <select className="select" value={frequency} onChange={(event) => setFrequency(event.target.value as CreateRecurringRuleInput['frequency'])}>
              {recurringFrequencies.map((item) => (
                <option key={item} value={item}>
                  {recurringFrequencyLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Próxima ocorrência</span>
            <input className="input" type="date" value={nextOccurrenceAt} onChange={(event) => setNextOccurrenceAt(event.target.value)} />
          </label>
          <label className="field">
            <span>Conta</span>
            <select className="select" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Definir depois</option>
              {finance.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Sem categoria</option>
              {finance.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
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
                      {recurringFrequencyLabels[rule.frequency]} · {toDateInputValue(rule.nextOccurrenceAt)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(rule.amountCents ?? 0)}</strong>
                    <SyncStatusBadge status={rule.localSyncStatus} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhuma recorrência criada ainda.</p>
          )}
        </article>
      </div>
    </section>
  );
}
