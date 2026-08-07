import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  finance: null as unknown,
  cards: null as unknown,
  auth: null as unknown,
  ledger: { entries: [] as unknown[], loading: false, error: null as string | null },
  invoice: null as Record<string, unknown> | null
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
vi.mock('../cards/useInvoiceLedger', () => ({
  useInvoiceLedger: () => state.ledger,
  mergeInvoicesWithLedger: () => (state.invoice ? [state.invoice] : [])
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
  state.ledger = { entries: [], loading: false, error: null };
  state.invoice = invoiceDoc();
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
    state.ledger = { entries: [], loading: true, error: null };
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
