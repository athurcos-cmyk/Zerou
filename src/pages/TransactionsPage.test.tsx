import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ finance: null as unknown, cards: null as unknown, auth: null as unknown }));
const loadMoreMock = vi.hoisted(() => vi.fn());

vi.mock('../auth/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../finance/FinanceDataContext', () => ({
  useFinanceContext: () => state.finance,
  useCardsContext: () => state.cards
}));
vi.mock('../components/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: vi.fn(), dialog: null }) }));
vi.mock('../components/BottomSheet', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BottomSheet: ({ open, children }: any) => (open ? <div>{children}</div> : null)
}));
vi.mock('../components/SelectField', () => ({ SelectField: () => null }));
// Mantém dedupeById e o resto reais; só troca loadMoreTransactions.
vi.mock('../finance/financeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finance/financeService')>()),
  loadMoreTransactions: loadMoreMock
}));

import { TransactionsPage } from './TransactionsPage';

const WORKSPACE = 'ws1';

function tx(id: string, dateISO: string, description: string) {
  return {
    id,
    type: 'expense' as const,
    amountCents: 1000,
    description,
    date: new Date(dateISO),
    categoryId: undefined,
    accountId: 'acc1',
    tags: [] as string[],
    cashMonth: dateISO.slice(0, 7),
    competenceMonth: dateISO.slice(0, 7),
    localSyncStatus: 'synced' as const
  };
}

function financeCtx(transactions: unknown[]) {
  return { transactions, categories: [], accounts: [{ id: 'acc1', name: 'Carteira' }], budgets: [] };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TransactionsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.auth = { user: { uid: 'u1' }, profile: { defaultWorkspaceId: WORKSPACE } };
  state.finance = financeCtx([tx('t3', '2026-07-10', 'Recente C'), tx('t2', '2026-07-05', 'Recente B'), tx('t1', '2026-07-01', 'Recente A')]);
  state.cards = { cards: [] };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TransactionsPage — Carregar mais', () => {
  it('carrega e anexa transações mais antigas, usando a mais antiga como cursor', async () => {
    loadMoreMock.mockResolvedValue([tx('old1', '2026-06-20', 'Antiga X')]);

    renderPage();

    // A antiga ainda não está na tela.
    expect(screen.queryByText('Antiga X')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    // Chamou com o id da transação mais antiga já carregada (t1, de 01/07).
    expect(loadMoreMock).toHaveBeenCalledWith(WORKSPACE, 't1', 50);
    // E a antiga aparece na lista.
    expect(await screen.findByText('Antiga X')).toBeInTheDocument();
  });

  it('some o botão quando a página volta incompleta (fim do histórico)', async () => {
    loadMoreMock.mockResolvedValue([tx('old1', '2026-06-20', 'Antiga X')]); // 1 < 50 → fim

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await screen.findByText('Antiga X');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Carregar mais|Carregando/ })).not.toBeInTheDocument());
  });
});
