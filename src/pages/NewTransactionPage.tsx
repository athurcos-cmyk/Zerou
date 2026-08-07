import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { createCardPurchase } from '../cards/cardService';

import { CategoryField } from '../components/CategoryField';
import { FormMessage } from '../components/FormMessage';
import { SelectField } from '../components/SelectField';
import { TagInput } from '../components/TagInput';
import { fromDateInputValueForWrite, todayInputValue } from '../finance/financeDates';
import { accountTypeLabels, transactionTypeLabels } from '../finance/financeLabels';
import { createTransaction } from '../finance/financeService';
import { useCategoryActions } from '../finance/useCategoryActions';
import { type SupportedTransactionType } from '../finance/financeSchemas';
import { parseMoneyToCents } from '../finance/money';
import { CARD_PREFIX, MAX_CARD_PURCHASE_INSTALLMENTS, buildAccountOrCardOptions, installmentOptions, parseAccountOrCard } from '../finance/accountOrCardOptions';

import { getUserFacingErrorMessage } from '../utils/userFacingError';

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
  // `setCategoryId` é estável (setter de useState), então o objeto de handlers não é recriado a
  // cada render — importante porque `CategoryField` é memo.
  const categoryActions = useCategoryActions(setCategoryId);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [installments, setInstallments] = useState(1);
  const [date, setDate] = useState(todayInputValue());
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);

  const isCardSelected = accountId.startsWith(CARD_PREFIX);

  const { accountOptions: rawAccountOptions, cardOptions: rawCardOptions } = buildAccountOrCardOptions(finance.accounts, cardsData.cards);
  const walletOptions = rawAccountOptions.map((option) => ({
    ...option,
    description: accountTypeLabels[finance.accounts.find((a) => a.id === option.value)!.type],
    icon: <Wallet size={17} aria-hidden="true" />
  }));
  // For expenses you can pay with a card; cards become card purchases (with installments).
  const cardOptions = rawCardOptions.map((option) => ({ ...option, icon: <CreditCard size={17} aria-hidden="true" /> }));
  const accountOptions = type === 'expense' ? [...walletOptions, ...cardOptions] : walletOptions;

  const destinationOptions = walletOptions.filter((option) => option.value !== accountId);
  const categoryFilterType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'all';
  const moodClass = type === 'income' ? 'amount-hero--income' : type === 'transfer' ? 'amount-hero--transfer' : '';

  const today = todayInputValue();
  const yesterday = yesterdayInputValue();
  const datePreset = date === today ? 'today' : date === yesterday ? 'yesterday' : 'other';

  /**
   * Título é opcional: vazio herda o nome da categoria escolhida (pedido do dono, 03/08/2026).
   * Sem categoria também, cai no rótulo do tipo ("Despesa"/"Receita"/"Transferência") — o schema
   * exige 2+ caracteres, e um título genérico é melhor que uma gravação recusada. **Nunca devolve
   * string vazia**, então este é o único lugar que precisa saber dessa cadeia de fallback.
   */
  function resolveDescription() {
    const typed = description.trim();
    if (typed) return typed;
    const fromCategory = finance.categories.find((c) => c.id === categoryId)?.name.trim();
    return fromCategory || transactionTypeLabels[type];
  }

  /**
   * Mensagem de erro + rolagem até ela. O `FormMessage` mora no topo do formulário e o botão
   * "Salvar transação" é fixo no rodapé (`.entry-actions`): sem a rolagem, quem apertasse Salvar
   * com a tela rolada pra baixo veria *nada acontecer* — trocaria um erro silencioso por outro.
   */
  function fail(text: string) {
    setMessage(text);
    requestAnimationFrame(() => messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      fail('Conclua seu cadastro inicial antes de registrar transações.');
      return;
    }

    const payingWithCard = type === 'expense' && accountId.startsWith(CARD_PREFIX);

    if (!payingWithCard && finance.accounts.length === 0) {
      fail('Crie uma conta financeira antes de registrar transações.');
      return;
    }

    // ── Validação SÍNCRONA, antes de qualquer escrita ──
    // `createTransaction`/`createCardPurchase` são `async` e rodam o `schema.parse` lá dentro, então
    // o erro delas nasce como PROMISE REJEITADA — o `try/catch` que existia aqui nunca a pegava, e o
    // `navigate` rodava logo depois de qualquer jeito. Era exatamente isso que fazia "Salvar
    // transação" sem conta escolhida *parecer* que salvou: a regra já existia no schema
    // (`accountId: min(1)`, `description: min(2)`), reprovava, e a pessoa era mandada pro Extrato
    // sem lançamento nenhum e sem aviso (relatado pelo dono, 03/08/2026).
    //
    // Regra que fica: toda condição que a pessoa consegue corrigir na tela é conferida AQUI, em
    // português, antes de sair do formulário. O schema segue sendo a rede de segurança do dado —
    // não pode ser o primeiro lugar onde um erro previsível aparece, porque lá ele é invisível.
    const amountCents = parseMoneyToCents(amount);

    if (amountCents <= 0) {
      // `moneyCentsSchema` aceita zero, então sem esta trava um valor em branco gravaria um
      // lançamento de R$ 0,00 — e agora que o título se resolve sozinho, era o último campo que
      // ainda barrava esse registro vazio por acidente.
      fail('Informe o valor da transação.');
      return;
    }

    if (!accountId) {
      fail(
        type === 'expense' ? 'Escolha a conta ou o cartão dessa despesa.'
          : type === 'transfer' ? 'Escolha a conta de origem da transferência.'
            : 'Escolha a conta onde o dinheiro entrou.'
      );
      return;
    }

    if (type === 'transfer' && !destinationAccountId) {
      fail('Escolha a conta de destino da transferência.');
      return;
    }

    if (description.trim().length === 1) {
      // O único caso que o fallback NÃO cobre (ele só age em campo vazio) e que o schema reprova
      // (`description: min(2)`) — sem esta trava, um título de 1 letra voltaria a sumir em silêncio.
      fail('O título precisa de pelo menos 2 letras — ou deixe em branco pra usar o nome da categoria.');
      return;
    }

    const resolvedDescription = resolveDescription();

    if (payingWithCard) {
      const { cardId } = parseAccountOrCard(accountId);
      createCardPurchase(workspaceId, user.uid, {
        cardId: cardId!,
        description: resolvedDescription,
        amountCents,
        purchaseDate: fromDateInputValueForWrite(date),
        categoryId: categoryId || undefined,
        installments
      }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível criar a compra no cartão agora.')));
      navigate(`/app/cards/${cardId}`);
      return;
    }

    // O `.catch` faltava aqui (a compra no cartão já tinha o dela): qualquer falha inesperada da
    // escrita virava rejeição não tratada, sem rastro nenhum.
    createTransaction(workspaceId, user.uid, {
      type,
      amountCents,
      description: resolvedDescription,
      merchant,
      categoryId,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      date: fromDateInputValueForWrite(date),
      tags,
      notes
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível registrar a transação agora.')));

    navigate('/app/transactions');
  }

  return (
    <div className="entry-screen">
      <header className={`amount-hero ${moodClass}`}>
        <div className="amount-hero-top">
          <Link className="amount-hero-back" to="/app/transactions" aria-label="Voltar">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <div className="type-switch" role="radiogroup" aria-label="Tipo de transação">
            {primaryTypes.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
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
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              aria-label="Valor da transação"
            />
          </span>
        </label>
      </header>

      <form className="entry-form" onSubmit={handleSubmit}>
        <div ref={messageRef}>
          <FormMessage>{message}</FormMessage>
        </div>

        {finance.accounts.length === 0 ? (
          <div className="notice">
            Você ainda não tem conta financeira. <Link className="inline-link" to="/app/accounts">Criar conta</Link>
          </div>
        ) : null}

        {/* O fallback é anunciado antes de acontecer: título preenchido sozinho no Extrato, sem
            aviso nenhum aqui, pareceria dado inventado pelo app. */}
        <label className="field">
          <span>Título <span className="text-secondary">(opcional)</span></span>
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mercado, salário, aluguel" />
          <span className="field-hint">
            {description.trim()
              ? 'Como esse lançamento vai aparecer no Extrato.'
              : `Em branco, usamos ${finance.categories.find((c) => c.id === categoryId)?.name.trim() || 'o nome da categoria'}.`}
          </span>
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
          {...categoryActions}
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
            options={installmentOptions(MAX_CARD_PURCHASE_INSTALLMENTS)}
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
