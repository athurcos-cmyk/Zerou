import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { createCardPurchase } from '../cards/cardService';

import { CategoryField } from '../components/CategoryField';
import { FormMessage } from '../components/FormMessage';
import { SelectField } from '../components/SelectField';
import { TagInput } from '../components/TagInput';
import { fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { accountTypeLabels, transactionTypeLabels } from '../finance/financeLabels';
import { createCategory, createTransaction, deleteCategory, updateCategory } from '../finance/financeService';
import { type SupportedTransactionType } from '../finance/financeSchemas';
import { parseMoneyToCents } from '../finance/money';

import { getUserFacingErrorMessage } from '../utils/userFacingError';

const CARD_PREFIX = 'card:';

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

export function NewTransactionPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const [type, setType] = useState<SupportedTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [installments, setInstallments] = useState(1);
  const [date, setDate] = useState(todayInputValue());
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const activeCards = cardsData.cards.filter((card) => card.isActive !== false);
  const isCardSelected = accountId.startsWith(CARD_PREFIX);

  const walletOptions = finance.accounts.map((account) => ({
    value: account.id,
    label: account.name,
    description: accountTypeLabels[account.type],
    icon: <Wallet size={17} aria-hidden="true" />
  }));

  // For expenses you can pay with a card; cards become card purchases (with installments).
  const cardOptions = activeCards.map((card) => ({
    value: `${CARD_PREFIX}${card.id}`,
    label: card.name,
    description: `Cartão · ${card.brand}`,
    icon: <CreditCard size={17} aria-hidden="true" />
  }));
  const accountOptions = type === 'expense' ? [...walletOptions, ...cardOptions] : walletOptions;

  const destinationOptions = walletOptions.filter((option) => option.value !== accountId);
  const categoryFilterType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'all';
  const moodClass = type === 'income' ? 'amount-hero--income' : type === 'transfer' ? 'amount-hero--transfer' : 'amount-hero--expense';

  const today = todayInputValue();
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

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de registrar transações.');
      return;
    }

    const payingWithCard = type === 'expense' && accountId.startsWith(CARD_PREFIX);

    if (!payingWithCard && finance.accounts.length === 0) {
      setMessage('Crie uma conta financeira antes de registrar transações.');
      return;
    }

    try {
      if (payingWithCard) {
        const cardId = accountId.slice(CARD_PREFIX.length);
        const write = createCardPurchase(workspaceId, user.uid, {
          cardId,
          description,
          amountCents: parseMoneyToCents(amount),
          purchaseDate: fromDateInputValue(date),
          categoryId: categoryId || undefined,
          installments
        });
        await Promise.race([write, waitForLocalWrite()]);
        void write.catch(() => undefined);
        navigate(`/app/cards/${cardId}`);
        return;
      }

      const write = createTransaction(workspaceId, user.uid, {
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
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar a transação agora.'));
    }
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
                onClick={() => { setType(option); setCategoryId(''); if (option !== 'expense' && accountId.startsWith(CARD_PREFIX)) setAccountId(''); }}
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

        {finance.accounts.length === 0 ? (
          <div className="notice">
            Você ainda não tem conta financeira. <Link className="inline-link" to="/app/accounts">Criar conta</Link>
          </div>
        ) : null}

        <label className="field">
          <span>Título</span>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mercado, salário, aluguel" />
        </label>

        <div className="field">
          <span className="field-label">Data</span>
          <div className="chip-row">
            <button type="button" className={`chip${datePreset === 'today' ? ' chip--active' : ''}`} onClick={() => setDate(today)}>Hoje</button>
            <button type="button" className={`chip${datePreset === 'yesterday' ? ' chip--active' : ''}`} onClick={() => setDate(yesterday)}>Ontem</button>
            <label className={`chip chip--date${datePreset === 'other' ? ' chip--active' : ''}`}>
              {datePreset === 'other' ? date.split('-').reverse().join('/') : 'Outra'}
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
          label={type === 'transfer' ? 'Conta de origem' : type === 'expense' ? 'Conta ou cartão' : 'Conta'}
          value={accountId}
          onChange={setAccountId}
          options={accountOptions}
          placeholder={type === 'expense' ? 'Conta ou cartão' : 'Escolha uma conta'}
        />

        {isCardSelected ? (
          <SelectField
            label="Parcelamento"
            value={String(installments)}
            onChange={(v) => setInstallments(Number(v))}
            options={Array.from({ length: 24 }, (_, i) => i + 1).map((n) => ({
              value: String(n),
              label: n === 1 ? '1x à vista' : `${n}x`
            }))}
          />
        ) : null}

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
              <TagInput value={tags} onChange={setTags} placeholder="casa, essencial" />
            </label>
            <label className="field">
              <span>Notas</span>
              <textarea className="input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        </details>

        <div className="entry-actions">
          <button className="button button--primary button--block" type="submit">
            Salvar transação
          </button>
        </div>
      </form>
    </div>
  );
}
