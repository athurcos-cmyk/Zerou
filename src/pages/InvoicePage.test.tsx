import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  finance: null as unknown,
  cards: null as unknown,
  auth: null as unknown,
  ledger: {
    entries: [] as unknown[],
    loading: false,
    error: null as string | null,
    loadedInvoiceKeys: new Set<string>()
  },
  invoice: null as Record<string, unknown> | null,
  /** Só os testes de navegação de mês precisam de mais de uma fatura. `null` = usa `invoice`. */
  invoices: null as Array<Record<string, unknown>> | null
}));
const payMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ cardId: 'cardA', invoiceId: 'cardA_2026-07' })
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../finance/FinanceDataContext', () => ({
  useFinanceContext: () => state.finance,
  useCardsContext: () => state.cards
}));
vi.mock('../components/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: vi.fn(), dialog: null }) }));
vi.mock('../components/BottomSheet', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BottomSheet: ({ open, children }: any) => (open ? <div data-testid="sheet">{children}</div> : null)
}));
vi.mock('../components/SelectField', () => ({ SelectField: () => null }));
// O ledger é a fonte do saldo em aberto — controlado aqui pra reproduzir "ainda carregando".
// `importOriginal` (e não um objeto do zero) porque `invoiceLedgerKey` tem que ser a função REAL:
// a navegação de mês compara a chave que ela monta com `loadedInvoiceKeys`, e um mock que
// remontasse a chave à mão testaria a si mesmo (CLAUDE.md, "payload de teste que satisfaz a
// invariante que o cliente viola").
vi.mock('../cards/useInvoiceLedger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cards/useInvoiceLedger')>()),
  useInvoiceLedger: () => state.ledger,
  mergeInvoicesWithLedger: () => state.invoices ?? (state.invoice ? [state.invoice] : [])
}));
vi.mock('../cards/cardService', () => ({
  recordInvoicePayment: payMock,
  recordInvoiceCredit: vi.fn(),
  recordInvoiceFee: vi.fn(),
  anticipateInstallments: vi.fn()
}));

import { InvoicePage } from './InvoicePage';

const WORKSPACE = 'ws1';

function invoiceDoc(over: Record<string, unknown> = {}) {
  return {
    id: 'cardA_2026-07',
    cardId: 'cardA',
    workspaceId: WORKSPACE,
    referenceMonth: '2026-07',
    status: 'closed',
    dueDate: { toDate: () => new Date(2026, 6, 15) },
    purchasesTotalCents: 20000,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
    outstandingBalanceCents: 20000,
    overpaidCreditCents: 0,
    ledgerEntries: [{ id: 'e1', type: 'purchase', amountCents: 20000, effectiveAt: { toDate: () => new Date(2026, 6, 2) } }],
    ...over
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoicePage />
    </MemoryRouter>
  );
}

/** Abre o sheet e escolhe a conta, que é o caminho normal. */
function openSheetWithAccount() {
  fireEvent.click(screen.getByRole('button', { name: 'Pagar fatura' }));
  fireEvent.click(screen.getByRole('button', { name: 'Carteira' }));
}

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, profile: { defaultWorkspaceId: WORKSPACE } };
  state.finance = {
    transactions: [],
    accounts: [{ id: 'acc1', name: 'Carteira' }],
    categories: [],
    transactionIndex: undefined
  };
  state.cards = { cards: [{ id: 'cardA', name: 'Nubank', limitCents: 500000 }], invoices: [invoiceDoc()], loading: false };
  state.ledger = { entries: [], loading: false, error: null, loadedInvoiceKeys: new Set() };
  state.invoice = invoiceDoc();
  state.invoices = null;
  payMock.mockResolvedValue('txn_pay');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ⚠️ Todos os casos abaixo eram `return` MUDO antes de 2026-08-07: o clique não escrevia, não
// fechava o sheet e não dizia nada. Foi o "cliquei pra pagar a fatura e simplesmente não vai".
describe('InvoicePage — pagar fatura não pode falhar em silêncio', () => {
  it('saldo em aberto ZERO com valor em branco: explica e mantém o sheet aberto', () => {
    state.invoice = invoiceDoc({ outstandingBalanceCents: 0, status: 'closed' });
    renderPage();
    openSheetWithAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(screen.getByText(/não tem saldo em aberto/i)).toBeInTheDocument();
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(payMock).not.toHaveBeenCalled();
  });

  it('ledger ainda carregando: explica em vez de pagar contra um total que ainda é 0', () => {
    state.ledger = { entries: [], loading: true, error: null, loadedInvoiceKeys: new Set() };
    renderPage();
    openSheetWithAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(screen.getByText(/carregando os lançamentos/i)).toBeInTheDocument();
    expect(payMock).not.toHaveBeenCalled();
  });

  it('sem conta escolhida: explica, em vez de deixar o botão morto sem motivo', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar fatura' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(screen.getByText(/escolha a conta/i)).toBeInTheDocument();
    expect(payMock).not.toHaveBeenCalled();
  });

  // `parseMoneyToCents` LANÇA com texto não-numérico (`money.ts:51`) — e exceção dentro de handler
  // de clique não mostra nada. Era mais um caminho de falha muda deste fluxo, achado por este teste.
  it('valor com texto não-numérico: explica em vez de estourar uma exceção muda', () => {
    renderPage();
    openSheetWithAccount();
    // O campo de valor, achado pelo placeholder (o total sugerido) — a tela tem outro textbox,
    // a busca da lista de Compras.
    fireEvent.change(screen.getByPlaceholderText(/200/), { target: { value: 'abc' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(screen.getByText(/valor em reais válido/i)).toBeInTheDocument();
    expect(payMock).not.toHaveBeenCalled();
  });

  it('valor zero digitado: explica', () => {
    renderPage();
    openSheetWithAccount();
    fireEvent.change(screen.getByPlaceholderText(/200/), { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(screen.getByText(/valor maior que zero/i)).toBeInTheDocument();
    expect(payMock).not.toHaveBeenCalled();
  });
});

describe('InvoicePage — pagamento com retorno visível', () => {
  it('sucesso confirma na tela (antes só fechava o sheet, e a pessoa achava que não foi)', async () => {
    renderPage();
    openSheetWithAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(payMock).toHaveBeenCalledTimes(1);
    expect(payMock.mock.calls[0][2]).toMatchObject({ amountCents: 20000, accountId: 'acc1', invoiceId: 'cardA_2026-07' });
    expect(await screen.findByText(/Pagamento de R\$\s*200[,.]00 registrado/i)).toBeInTheDocument();
  });

  it('rejeição da escrita aparece pro usuário', async () => {
    // Antes isto era impossível: `recordInvoicePayment` usava `fireWrite` (catch vazio em produção)
    // e resolvia sem esperar o commit, então o `.catch` da página era código morto.
    payMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    renderPage();
    openSheetWithAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('depois de uma falha, o botão volta a funcionar (paySubmitting resetado)', async () => {
    payMock.mockRejectedValueOnce(new Error('falhou'));
    renderPage();
    openSheetWithAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    payMock.mockResolvedValue('txn_pay');
    openSheetWithAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(payMock).toHaveBeenCalledTimes(2);
  });

  // O id idempotente do FIN-03 é derivado de `paidAt`. Com `fromDateInputValue` ele era meio-dia
  // com 0 ms — id byte-idêntico a cada tentativa no mesmo dia, recusado pelo ledger e engolido.
  it('paidAt carrega o instante real (não o meio-dia determinístico)', () => {
    renderPage();
    openSheetWithAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    const paidAt = payMock.mock.calls[0][2].paidAt as Date;
    const isNoonSentinel = paidAt.getHours() === 12 && paidAt.getMinutes() === 0 && paidAt.getSeconds() === 0 && paidAt.getMilliseconds() === 0;
    expect(isNoonSentinel).toBe(false);
  });

  it('reabrir o sheet gera um paidAt novo — é o que destrava a retentativa', async () => {
    renderPage();
    openSheetWithAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    const first = (payMock.mock.calls[0][2].paidAt as Date).getTime();

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    vi.setSystemTime(new Date(Date.now() + 5000));
    openSheetWithAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    const second = (payMock.mock.calls[1][2].paidAt as Date).getTime();

    expect(second).not.toBe(first);
    vi.useRealTimers();
  });
});

// A tela abre sempre em `cardA_2026-07` (o `useParams` mockado lá em cima). A faixa de colunas do
// topo é o seletor de mês, então o que estes casos protegem é (1) a REGRA DE VISIBILIDADE — coluna
// não pode ser atalho pra fatura que a lista do Cartão esconde, nem sumir quando o ledger ainda não
// chegou (o "só aparece a fatura atual" de 07/08/2026) — e (2) a MÉTRICA da altura.
describe('InvoicePage — faixa de faturas (seletor de mês)', () => {
  const july = 'cardA_2026-07';
  const col = (mes: RegExp) => screen.queryByRole('link', { name: mes });
  /** Altura da coluna, como o CSS a recebe. */
  const height = (link: HTMLElement | null) =>
    link?.querySelector<HTMLElement>('.invoice-strip-bar > span')?.style.height;

  it('uma coluna por fatura, cada uma linkando pro seu mês', () => {
    state.invoices = [
      invoiceDoc({ id: 'cardA_2026-06', referenceMonth: '2026-06' }),
      invoiceDoc(),
      invoiceDoc({ id: 'cardA_2026-08', referenceMonth: '2026-08' })
    ];
    renderPage();

    expect(col(/Fatura de jun/i)).toHaveAttribute('href', '/app/cards/cardA/invoices/cardA_2026-06');
    expect(col(/Fatura de ago/i)).toHaveAttribute('href', '/app/cards/cardA/invoices/cardA_2026-08');
  });

  it('a coluna do mês aberto é a marcada (aria-current)', () => {
    state.invoices = [invoiceDoc(), invoiceDoc({ id: 'cardA_2026-08', referenceMonth: '2026-08' })];
    renderPage();

    expect(col(/Fatura de jul/i)).toHaveAttribute('aria-current', 'page');
    expect(col(/Fatura de ago/i)).not.toHaveAttribute('aria-current');
  });

  /**
   * ⚠️ O caso que separa "gráfico certo" de "gráfico que mente sobre o passado": a coluna mede o
   * VALOR da fatura (compras + tarifas − créditos), não o saldo em aberto. Com
   * `outstandingBalanceCents` puro, todo mês já pago viraria coluna zerada — o histórico inteiro
   * achatado, justo o que a pessoa abre o gráfico pra comparar. Aqui jun está PAGA e gastou o dobro
   * de jul: tem que ser a coluna mais alta, não a menor.
   */
  it('fatura paga continua alta: a altura é o gasto, não o saldo', () => {
    state.invoices = [
      invoiceDoc({
        id: 'cardA_2026-06',
        referenceMonth: '2026-06',
        purchasesTotalCents: 40000,
        outstandingBalanceCents: 0,
        paymentsTotalCents: 40000
      }),
      invoiceDoc({ purchasesTotalCents: 20000, outstandingBalanceCents: 20000, paymentsTotalCents: 0 })
    ];
    renderPage();

    expect(height(col(/Fatura de jun/i))).toBe('100%');
    expect(height(col(/Fatura de jul/i))).toBe('50%');
  });

  /**
   * ⚠️ O caso que derrubou a primeira fórmula (`outstanding + payments`, 08/08/2026): pagando MAIS
   * que a fatura, `outstanding` trava em 0 e o excedente vai pra `overpaidCreditCents` — a soma
   * devolvia o que foi PAGO (150), não o que foi GASTO (100), e a coluna saía mais alta do que o
   * mês realmente foi. Aqui jun gastou o mesmo que jul e as duas colunas têm que empatar.
   */
  it('fatura paga a maior não infla a coluna', () => {
    state.invoices = [
      invoiceDoc({
        id: 'cardA_2026-06',
        referenceMonth: '2026-06',
        purchasesTotalCents: 10000,
        paymentsTotalCents: 15000,
        outstandingBalanceCents: 0,
        overpaidCreditCents: 5000
      }),
      invoiceDoc({ purchasesTotalCents: 10000, outstandingBalanceCents: 10000, paymentsTotalCents: 0 })
    ];
    renderPage();

    expect(height(col(/Fatura de jun/i))).toBe('100%');
    expect(height(col(/Fatura de jul/i))).toBe('100%');
  });

  it('fatura com crédito maior que a compra não vira coluna negativa', () => {
    state.invoices = [
      invoiceDoc({
        id: 'cardA_2026-06',
        referenceMonth: '2026-06',
        purchasesTotalCents: 5000,
        creditsTotalCents: 25000,
        outstandingBalanceCents: 0
      }),
      invoiceDoc({ purchasesTotalCents: 20000, outstandingBalanceCents: 20000 })
    ];
    renderPage();

    // 4% é o piso: alvo de toque mínimo, nunca um traço de 1px nem altura negativa.
    expect(height(col(/Fatura de jun/i))).toBe('4%');
  });

  // Fatura futura que ficou vazia (a única parcela foi antecipada pra outro mês) some da lista do
  // Cartão — a coluna tem que sumir junto, senão vira porta dos fundos pra uma tela sem nada.
  it('pula a fatura vazia cujo ledger JÁ chegou', () => {
    state.invoices = [
      invoiceDoc(),
      invoiceDoc({ id: 'cardA_2026-08', referenceMonth: '2026-08', ledgerEntries: [] }),
      invoiceDoc({ id: 'cardA_2026-09', referenceMonth: '2026-09' })
    ];
    state.ledger = { ...state.ledger, loadedInvoiceKeys: new Set(['cardA:cardA_2026-08']) };
    renderPage();

    expect(col(/Fatura de ago/i)).toBeNull();
    expect(col(/Fatura de set/i)).toHaveAttribute('href', '/app/cards/cardA/invoices/cardA_2026-09');
  });

  // Espelho do caso acima: MESMA fatura vazia, só que o ledger ainda não respondeu. Aqui ela
  // continua na faixa — tratar "não carregada" como "vazia" foi o que apagou 13 das 14 faturas.
  it('mantém a fatura vazia cujo ledger ainda não chegou', () => {
    state.invoices = [
      invoiceDoc(),
      invoiceDoc({ id: 'cardA_2026-08', referenceMonth: '2026-08', ledgerEntries: [] })
    ];
    renderPage();

    expect(col(/Fatura de ago/i)).toHaveAttribute('href', '/app/cards/cardA/invoices/cardA_2026-08');
  });

  // Faixa de uma coluna só não é seletor nem comparação — é um enfeite ocupando o topo da tela.
  it('cartão com uma fatura só não desenha faixa', () => {
    state.invoices = [invoiceDoc({ id: july })];
    renderPage();

    expect(screen.queryByRole('navigation', { name: 'Faturas do cartão' })).toBeNull();
  });
});

// Pedido do dono (08/08/2026): *"clico em agosto e quero ver de cara quanto gastei"*. Fatura paga
// mostrava "R$ 0,00" no maior número da tela, com o valor real escondido na linha "Compras".
describe('InvoicePage — hero de fatura paga mostra o gasto', () => {
  const paga = (over: Record<string, unknown> = {}) =>
    invoiceDoc({
      status: 'paid',
      purchasesTotalCents: 91488,
      paymentsTotalCents: 91488,
      outstandingBalanceCents: 0,
      ...over
    });

  // Lê o hero pela classe, não por `getByText`: o mesmo valor aparece de novo na linha "Compras"
  // logo abaixo — e é justamente essa coincidência que prova que os dois fecham a conta.
  const heroAmount = () => document.querySelector('.invoice-hero-amount')?.textContent;

  it('fatura quitada: o hero traz o total gasto, não o saldo zerado', () => {
    state.invoice = paga();
    renderPage();

    expect(screen.getByText('Total gasto')).toBeInTheDocument();
    expect(heroAmount()).toMatch(/914[,.]88/);
  });

  it('crédito abate o total gasto — o hero fecha a conta com a lista de Compras', () => {
    state.invoice = paga({ purchasesTotalCents: 100000, creditsTotalCents: 10000, paymentsTotalCents: 90000 });
    renderPage();

    expect(heroAmount()).toMatch(/900[,.]00/);
  });

  // A fatura em aberto NÃO muda: ali "quanto ainda devo" é a pergunta certa, e trocar pelo gasto
  // esconderia o efeito de um pagamento parcial no número que a pessoa veio conferir.
  it('fatura em aberto continua mostrando o valor a pagar', () => {
    state.invoice = invoiceDoc({ status: 'open', purchasesTotalCents: 50000, outstandingBalanceCents: 20000, paymentsTotalCents: 30000 });
    renderPage();

    expect(screen.getByText('Valor a pagar')).toBeInTheDocument();
    expect(heroAmount()).toMatch(/200[,.]00/);
  });
});
