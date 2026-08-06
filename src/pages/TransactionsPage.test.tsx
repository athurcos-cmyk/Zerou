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
  const accounts = [{ id: 'acc1', name: 'Carteira' }];
  // `countedAccounts` é o que alimenta o saldo por dia (conta "fora do saldo" fica de fora);
  // aqui nenhuma conta está marcada, então é a mesma lista.
  return { transactions, categories: [], accounts, countedAccounts: accounts, excludedAccountIds: new Set<string>(), budgets: [] };
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

// Atalho do "Resumo de gastos" do Dashboard: tocar numa das 5 maiores categorias do mês abre o
// Extrato já filtrado (`?categoria=<id>`). Os dois casos com armadilha estão travados aqui.
describe('TransactionsPage — filtro de categoria vindo da URL', () => {
  function categorized(id: string, dateISO: string, description: string, categoryId?: string) {
    return { ...tx(id, dateISO, description), categoryId };
  }

  function financeWithCategories(transactions: unknown[]) {
    const accounts = [{ id: 'acc1', name: 'Carteira' }];
    return {
      transactions,
      // "Lazer" agrupa "Jogos" e "Cinema" — pela regra [D10], o gasto vive todo nas filhas.
      categories: [
        { id: 'lazer', name: 'Lazer', isActive: true },
        { id: 'jogos', name: 'Jogos', isActive: true, parentCategoryId: 'lazer' },
        { id: 'cinema', name: 'Cinema', isActive: true, parentCategoryId: 'lazer' },
        { id: 'mercado', name: 'Mercado', isActive: true }
      ],
      accounts,
      countedAccounts: accounts,
      excludedAccountIds: new Set<string>(),
      budgets: []
    };
  }

  function renderAt(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <TransactionsPage />
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    state.finance = financeWithCategories([
      categorized('t1', '2026-08-04', 'Arc raides game', 'jogos'),
      categorized('t2', '2026-08-03', 'Ingresso cinema', 'cinema'),
      categorized('t3', '2026-08-02', 'Feira', 'mercado'),
      categorized('t4', '2026-08-01', 'Sem categoria nenhuma', undefined)
    ]);
  });

  it('filtra pela categoria pedida na URL', () => {
    renderAt('/?categoria=mercado');

    expect(screen.getByText('Feira')).toBeInTheDocument();
    expect(screen.queryByText('Arc raides game')).not.toBeInTheDocument();
  });

  it('categoria-mãe inclui as subcategorias — senão a lista vinha VAZIA', () => {
    renderAt('/?categoria=lazer');

    // O gasto de Lazer é todo das filhas; sem o roll-up do filtro, nenhuma destas apareceria.
    expect(screen.getByText('Arc raides game')).toBeInTheDocument();
    expect(screen.getByText('Ingresso cinema')).toBeInTheDocument();
    expect(screen.queryByText('Feira')).not.toBeInTheDocument();
  });

  it('`__none__` mostra só o que não tem categoria', () => {
    renderAt('/?categoria=__none__');

    expect(screen.getByText('Sem categoria nenhuma')).toBeInTheDocument();
    expect(screen.queryByText('Feira')).not.toBeInTheDocument();
    expect(screen.queryByText('Arc raides game')).not.toBeInTheDocument();
  });

  it('sem o parâmetro, mostra tudo', () => {
    renderAt('/');

    expect(screen.getByText('Arc raides game')).toBeInTheDocument();
    expect(screen.getByText('Feira')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria nenhuma')).toBeInTheDocument();
  });
});
