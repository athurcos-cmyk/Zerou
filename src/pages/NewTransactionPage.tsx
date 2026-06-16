import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CategoryPicker } from '../components/CategoryPicker';
import { CustomSelect } from '../components/CustomSelect';
import { FormMessage } from '../components/FormMessage';
import { fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { accountTypeLabels, transactionTypeLabels } from '../finance/financeLabels';
import { createCategory, createTransaction, deleteCategory } from '../finance/financeService';
import { transactionTypes, type SupportedTransactionType } from '../finance/financeSchemas';
import { parseMoneyToCents } from '../finance/money';
import { useFinanceData } from '../finance/useFinanceData';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

function waitForLocalWrite() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 350);
  });
}

export function NewTransactionPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const [type, setType] = useState<SupportedTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const typeOptions = transactionTypes.map((t) => ({
    value: t,
    label: transactionTypeLabels[t]
  }));

  const accountOptions = finance.accounts.map((account) => ({
    value: account.id,
    label: account.name,
    description: accountTypeLabels[account.type]
  }));

  const destinationOptions = finance.accounts
    .filter((account) => account.id !== accountId)
    .map((account) => ({
      value: account.id,
      label: account.name,
      description: accountTypeLabels[account.type]
    }));

  const categoryFilterType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'all';

  async function handleCreateCategory(name: string, icon: string, catType: 'income' | 'expense' | 'both') {
    if (!workspaceId || !user) return;
    const id = await createCategory(workspaceId, user.uid, { name, icon, type: catType });
    setCategoryId(id);
  }

  async function handleDeleteCategory(id: string) {
    if (!workspaceId) return;
    await deleteCategory(workspaceId, id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de registrar transações.');
      return;
    }

    if (finance.accounts.length === 0) {
      setMessage('Crie uma conta financeira antes de registrar transações.');
      return;
    }

    try {
      const write = createTransaction(workspaceId, user.uid, {
        type,
        amountCents: parseMoneyToCents(amount),
        description,
        merchant,
        categoryId,
        accountId,
        destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
        date: fromDateInputValue(date),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes
      });

      await Promise.race([write, waitForLocalWrite()]);
      void write.catch(() => undefined);
      navigate('/app/transactions');
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar a transação agora.'));
    }
  }

  return (
    <section className="page-content page-content--narrow">
      <p className="eyebrow">Cadastro rápido</p>
      <h1 className="page-title">Nova transação.</h1>
      <p className="page-description">Registre uma entrada, gasto ou transferência. Se a internet oscilar, a Zerou tenta enviar depois.</p>

      <form className="surface surface-pad form-stack finance-form" onSubmit={handleSubmit}>
        <FormMessage>{message}</FormMessage>

        {finance.accounts.length === 0 ? (
          <div className="notice">
            Você ainda não tem conta financeira. <Link className="inline-link" to="/app/accounts">Criar conta</Link>
          </div>
        ) : null}

        <label className="field">
          <span>Valor</span>
          <input className="input input--money" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
        </label>

        <div className="field">
          <span className="field-label">Tipo</span>
          <CustomSelect
            value={type}
            onChange={(v) => { setType(v as SupportedTransactionType); setCategoryId(''); }}
            options={typeOptions}
          />
        </div>

        <label className="field">
          <span>Descrição</span>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mercado, salário, aluguel" />
        </label>

        <div className="field">
          <span className="field-label">Categoria</span>
          <CategoryPicker
            value={categoryId}
            onChange={setCategoryId}
            categories={finance.categories}
            filterType={categoryFilterType as 'income' | 'expense' | 'all'}
            onCreateCategory={handleCreateCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        </div>

        <div className="field">
          <span className="field-label">Conta</span>
          <CustomSelect
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            placeholder="Escolha uma conta"
          />
        </div>

        {type === 'transfer' ? (
          <div className="field">
            <span className="field-label">Conta de destino</span>
            <CustomSelect
              value={destinationAccountId}
              onChange={setDestinationAccountId}
              options={destinationOptions}
              placeholder="Escolha o destino"
            />
          </div>
        ) : null}

        <label className="field">
          <span>Data</span>
          <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <details className="advanced-panel">
          <summary>Avançado</summary>
          <div className="form-stack">
            <label className="field">
              <span>Estabelecimento</span>
              <input className="input" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
            </label>
            <label className="field">
              <span>Tags</span>
              <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="casa, essencial" />
            </label>
            <label className="field">
              <span>Notas</span>
              <textarea className="input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        </details>

        <div className="button-row">
          <button className="button button--primary" type="submit">
            Salvar transação
          </button>
          <Link className="button button--ghost" to="/app/transactions">
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
