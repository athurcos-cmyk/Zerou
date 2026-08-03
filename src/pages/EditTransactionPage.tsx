import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { CategoryField } from '../components/CategoryField';
import { FormMessage } from '../components/FormMessage';
import { SelectField } from '../components/SelectField';
import { TagInput } from '../components/TagInput';
import { resolveEditedDate, toDateInputValue } from '../finance/financeDates';
import { accountTypeLabels, transactionTypeLabels } from '../finance/financeLabels';
import { updateTransaction } from '../finance/financeService';
import { useCategoryActions } from '../finance/useCategoryActions';
import { updateCardPurchase } from '../cards/cardService';
import { type SupportedTransactionType } from '../finance/financeSchemas';
import { centsToInputValue, parseMoneyToCents } from '../finance/money';

import { getUserFacingErrorMessage } from '../utils/userFacingError';

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
  const isCardPurchase = transaction?.type === 'card_purchase';
  const [type, setType] = useState<SupportedTransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categoryActions = useCategoryActions(setCategoryId);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [date, setDate] = useState('');
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!transaction) {
      return;
    }

    setType(transaction.type === 'card_purchase' ? 'expense' : (transaction.type as SupportedTransactionType));
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
  const categoryFilterType = isCardPurchase ? 'expense' : type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'all';
  const moodClass = type === 'income' ? 'amount-hero--income' : type === 'transfer' ? 'amount-hero--transfer' : '';

  const today = toDateInputValue(new Date());
  const yesterday = yesterdayInputValue();
  const datePreset = date === today ? 'today' : date === yesterday ? 'yesterday' : 'other';

  /** Mesma cadeia de `NewTransactionPage`: digitado → nome da categoria → rótulo do tipo. Aqui ela
   * vale pra quem **apaga** o título de um lançamento que já existia — sem isso, limpar o campo
   * reprovaria no `min(2)` do schema e a edição sumiria em silêncio, que é justamente o bug que
   * esta tela tinha. Nunca devolve string vazia. */
  function resolveDescription() {
    const typed = description.trim();
    if (typed) return typed;
    const fromCategory = finance.categories.find((c) => c.id === categoryId)?.name.trim();
    return fromCategory || transactionTypeLabels[type];
  }

  /** Erro + rolagem até ele: a mensagem fica no topo do form e o botão Salvar é fixo no rodapé. */
  function fail(text: string) {
    setMessage(text);
    requestAnimationFrame(() => messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user || !transactionId || !transaction) {
      fail('Não foi possível localizar a transação.');
      return;
    }

    // ── Validação SÍNCRONA, antes de qualquer escrita ──
    // Mesma armadilha que `NewTransactionPage` tinha (corrigida em 03/08/2026): `updateTransaction`
    // é `async` e roda `schema.parse` lá dentro, então o erro dela nasce como PROMISE REJEITADA —
    // o `try/catch` daqui nunca a pegava e o `navigate` rodava em seguida de qualquer jeito.
    // Apagar o título de uma transação existente saía da tela como se tivesse salvo.
    const typedTitle = description.trim();
    if (typedTitle.length === 1) {
      // Título de 1 letra é o único caso que o fallback NÃO cobre (ele só age em campo vazio) e que
      // o schema reprova (`min(2)`) — sem esta trava, voltaria a sumir em silêncio.
      fail('O título precisa de pelo menos 2 letras — ou deixe em branco pra usar o nome da categoria.');
      return;
    }

    const resolvedDescription = resolveDescription();

    if (isCardPurchase) {
      // Fire-and-forget (era `await`, que trava a UI esperando a rede e quebra a regra
      // offline-first do projeto). Só é seguro soltar porque a validação acima já rodou.
      updateCardPurchase(workspaceId, user.uid, transactionId, {
        description: resolvedDescription,
        categoryId: categoryId || undefined
      }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a compra agora.')));
      navigate('/app/transactions');
      return;
    }

    const amountCents = parseMoneyToCents(amount);

    if (amountCents <= 0) {
      fail('Informe o valor da transação.');
      return;
    }

    if (!accountId) {
      fail(type === 'transfer' ? 'Escolha a conta de origem da transferência.' : 'Escolha a conta da transação.');
      return;
    }

    if (type === 'transfer' && !destinationAccountId) {
      fail('Escolha a conta de destino da transferência.');
      return;
    }

    updateTransaction(workspaceId, user.uid, transactionId, {
      type: transaction.type,
      amountCents: transaction.amountCents,
      accountId: transaction.accountId,
      destinationAccountId: transaction.destinationAccountId
    }, {
      type,
      amountCents,
      description: resolvedDescription,
      merchant,
      categoryId,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      date: resolveEditedDate(date, transaction.date),
      tags,
      notes
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a transação agora.')));

    navigate('/app/transactions');
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

  return (
    <div className="entry-screen">
      <header className={`amount-hero ${moodClass}`}>
        <div className="amount-hero-top">
          <Link className="amount-hero-back" to="/app/transactions" aria-label="Voltar">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          {!isCardPurchase && (
            <div className="type-switch" role="radiogroup" aria-label="Tipo de transação">
              {primaryTypes.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={type === option}
                  className={`type-switch-btn${type === option ? ' type-switch-btn--active' : ''}`}
                  onClick={() => { setType(option); }}
                >
                  {transactionTypeLabels[option]}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="amount-hero-field">
          <span className="amount-hero-label">Valor</span>
          {isCardPurchase ? (
            <span className="amount-hero-input-wrap" aria-label="Valor da compra (não editável)">
              <span className="amount-hero-currency">R$</span>
              <span className="amount-hero-input">{centsToInputValue(transaction?.amountCents ?? 0)}</span>
            </span>
          ) : (
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
          )}
        </label>
      </header>

      <form className="entry-form" onSubmit={handleSubmit}>
        <div ref={messageRef}>
          <FormMessage>{message}</FormMessage>
        </div>

        {isCardPurchase && (
          <p className="text-secondary" style={{ margin: '-0.5rem 0 0', fontSize: '0.86rem' }}>
            Compra no cartão — só descrição e categoria podem ser editadas aqui. Valor errado, data, parcelas ou cartão errado exigem excluir e lançar de novo.
          </p>
        )}

        <label className="field">
          <span>Título <span className="text-secondary">(opcional)</span></span>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
          <span className="field-hint">
            {description.trim()
              ? 'Como esse lançamento aparece no Extrato.'
              : `Em branco, usamos ${finance.categories.find((c) => c.id === categoryId)?.name.trim() || 'o nome da categoria'}.`}
          </span>
        </label>

        {!isCardPurchase && (
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
        )}

        <CategoryField
          value={categoryId}
          onChange={setCategoryId}
          categories={finance.categories}
          filterType={categoryFilterType as 'income' | 'expense' | 'all'}
          {...categoryActions}
        />

        {!isCardPurchase && (
          <SelectField
            label={type === 'transfer' ? 'Conta de origem' : 'Conta'}
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            placeholder="Escolha uma conta"
          />
        )}

        {!isCardPurchase && type === 'transfer' ? (
          <SelectField
            label="Conta de destino"
            value={destinationAccountId}
            onChange={setDestinationAccountId}
            options={destinationOptions}
            placeholder="Escolha o destino"
          />
        ) : null}

        {!isCardPurchase && (
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
        )}

        <div className="entry-actions">
          <button className="button button--primary button--block" type="submit">
            Salvar edição
          </button>
        </div>
      </form>
    </div>
  );
}
