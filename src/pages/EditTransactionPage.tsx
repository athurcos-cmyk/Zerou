import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { FormMessage } from '../components/FormMessage';
import { SelectField } from '../components/SelectField';
import { TagInput } from '../components/TagInput';
import { fromDateInputValue, toDateInputValue } from '../finance/financeDates';
import { accountTypeLabels, transactionTypeLabels } from '../finance/financeLabels';
import { createCategory, deleteCategory, updateCategory, updateTransaction } from '../finance/financeService';
import { type SupportedTransactionType } from '../finance/financeSchemas';
import { centsToInputValue, parseMoneyToCents } from '../finance/money';

import { getUserFacingErrorMessage } from '../utils/userFacingError';

function waitForLocalWrite() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 350);
  });
}

const primaryTypes: SupportedTransactionType[] = ['income', 'expense', 'transfer'];

function yesterdayInputValue() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function EditTransactionPage() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const transaction = finance.transactions.find((item) => item.id === transactionId);
  const [type, setType] = useState<SupportedTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [date, setDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction) {
      return;
    }

    setType(transaction.type as SupportedTransactionType);
    setAmount(centsToInputValue(transaction.amountCents));
    setDescription(transaction.description);
    setCategoryId(transaction.categoryId ?? '');
    setAccountId(transaction.accountId ?? '');
    setDestinationAccountId(transaction.destinationAccountId ?? '');
    setDate(toDateInputValue(transaction.date));
    setMerchant(transaction.merchant ?? '');
    setNotes(transaction.notes ?? '');
    setTags(transaction.tags);
  }, [transaction]);

  const accountOptions = finance.accounts.map((account) => ({
    value: account.id,
    label: account.name,
    description: accountTypeLabels[account.type],
    icon: <Wallet size={17} aria-hidden="true" />
  }));
  const destinationOptions = accountOptions.filter((option) => option.value !== accountId);
  const categoryFilterType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'all';
  const moodClass = type === 'income' ? 'amount-hero--income' : type === 'transfer' ? 'amount-hero--transfer' : 'amount-hero--expense';

  const today = toDateInputValue(new Date());
  const yesterday = yesterdayInputValue();
  const datePreset = date === today ? 'today' : date === yesterday ? 'yesterday' : 'other';

  async function handleCreateCategory(name: string, icon: string, catType: 'income' | 'expense' | 'both', color: string) {
    if (!workspaceId || !user) return;
    const id = await createCategory(workspaceId, user.uid, { name, icon, type: catType, color });
    setCategoryId(id);
  }

  async function handleDeleteCategory(id: string) {
    if (!workspaceId) return;
    await deleteCategory(workspaceId, id);
  }

  async function handleUpdateCategory(id: string, patch: { name?: string; icon?: string; color?: string }) {
    if (!workspaceId) return;
    await updateCategory(workspaceId, id, patch);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user || !transactionId) {
      setMessage('Não foi possível localizar a transação.');
      return;
    }

    try {
      const write = updateTransaction(workspaceId, user.uid, transactionId, {
        type,
        amountCents: parseMoneyToCents(amount),
        description,
        merchant,
        categoryId,
        accountId,
        destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
        date: fromDateInputValue(date),
        tags,
        notes
      });

      await Promise.race([write, waitForLocalWrite()]);
      void write.catch(() => undefined);
      navigate('/app/transactions');
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a transação agora.'));
    }
  }

  if (!transaction && !finance.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Editar transação</p>
        <h1 className="page-title">Transação não encontrada.</h1>
        <Link className="button button--secondary" to="/app/transactions">
          Voltar
        </Link>
      </section>
    );
  }

  if (transaction?.type === 'card_purchase') {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Editar transação</p>
        <h1 className="page-title">Compras no cartão ainda não podem ser editadas.</h1>
        <p className="text-secondary">Para corrigir, exclua a compra no Extrato e lance de novo.</p>
        <Link className="button button--secondary" to="/app/transactions">
          Voltar
        </Link>
      </section>
    );
  }

  return (
    <div className="entry-screen">
      <header className={`amount-hero ${moodClass}`}>
        <div className="amount-hero-top">
          <Link className="amount-hero-back" to="/app/transactions" aria-label="Voltar">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <div className="type-switch" role="tablist" aria-label="Tipo de transação">
            {primaryTypes.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={type === option}
                className={`type-switch-btn${type === option ? ' type-switch-btn--active' : ''}`}
                onClick={() => { setType(option); }}
              >
                {transactionTypeLabels[option]}
              </button>
            ))}
          </div>
        </div>
        <label className="amount-hero-field">
          <span className="amount-hero-label">Valor</span>
          <span className="amount-hero-input-wrap">
            <span className="amount-hero-currency">R$</span>
            <input
              className="amount-hero-input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              aria-label="Valor da transação"
            />
          </span>
        </label>
      </header>

      <form className="entry-form" onSubmit={handleSubmit}>
        <FormMessage>{message}</FormMessage>

        <label className="field">
          <span>Título</span>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        <div className="field">
          <span className="field-label">Data</span>
          <div className="chip-row">
            <button type="button" className={`chip${datePreset === 'today' ? ' chip--active' : ''}`} onClick={() => setDate(today)}>Hoje</button>
            <button type="button" className={`chip${datePreset === 'yesterday' ? ' chip--active' : ''}`} onClick={() => setDate(yesterday)}>Ontem</button>
            <label className={`chip chip--date${datePreset === 'other' ? ' chip--active' : ''}`}>
              {datePreset === 'other' && date ? date.split('-').reverse().join('/') : 'Outra'}
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
        </div>

        <CategoryField
          value={categoryId}
          onChange={setCategoryId}
          categories={finance.categories}
          filterType={categoryFilterType as 'income' | 'expense' | 'all'}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
        />

        <SelectField
          label={type === 'transfer' ? 'Conta de origem' : 'Conta'}
          value={accountId}
          onChange={setAccountId}
          options={accountOptions}
          placeholder="Escolha uma conta"
        />

        {type === 'transfer' ? (
          <SelectField
            label="Conta de destino"
            value={destinationAccountId}
            onChange={setDestinationAccountId}
            options={destinationOptions}
            placeholder="Escolha o destino"
          />
        ) : null}

        <details className="advanced-panel">
          <summary>Mais detalhes</summary>
          <div className="form-stack">
            <label className="field">
              <span>Estabelecimento</span>
              <input className="input" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
            </label>
            <label className="field">
              <span>Tags</span>
              <TagInput value={tags} onChange={setTags} />
            </label>
            <label className="field">
              <span>Notas</span>
              <textarea className="input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        </details>

        <div className="entry-actions">
          <button className="button button--primary button--block" type="submit">
            Salvar edição
          </button>
        </div>
      </form>
    </div>
  );
}
