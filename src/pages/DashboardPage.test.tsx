import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCachedDashboardView, type CachedDashboardView } from '../finance/dashboardViewCache';
import { defaultCategoryColors } from '../theme/palette';

// Estado mutável injetado nos contextos mockados — cada teste ajusta antes de renderizar.
const state = vi.hoisted(() => ({
  finance: null as unknown,
  cards: null as unknown,
  auth: null as unknown
}));

vi.mock('../finance/FinanceDataContext', () => ({
  useFinanceContext: () => state.finance,
  useCardsContext: () => state.cards,
  useGoalsContext: () => ({})
}));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../onboarding/welcomeTour.store', () => ({
  useWelcomeTour: (selector: (s: { seen: boolean }) => unknown) => selector({ seen: true })
}));
// Filhos que tocam Firebase/PWA/portais — irrelevantes pro que este teste verifica.
vi.mock('../pwa/InstallPromptSheet', () => ({ InstallPromptSheet: () => null }));
vi.mock('../components/BudgetAlertBanner', () => ({ BudgetAlertBanner: () => null }));
vi.mock('../finance/SyncStatusBadge', () => ({ SyncStatusBadge: () => null }));
vi.mock('../finance/AvailableModeSheet', () => ({ AvailableModeSheet: () => null }));
vi.mock('../workspaces/workspaceService', () => ({ updateAvailableMode: vi.fn() }));

// Importado depois dos mocks (vi.mock é hoisted, mas deixa explícito).
import { DashboardPage } from './DashboardPage';

const WORKSPACE_ID = 'ws1';

function financeCtx(overrides: Record<string, unknown> = {}) {
  return {
    loading: true,
    error: null,
    accounts: [],
    transactions: [],
    bills: [],
    recurringRules: [],
    categories: [],
    budgets: [],
    accountBalances: [],
    transactionIndex: { knownIds: new Set(), deletedIds: new Set() },
    pendingWrites: false,
    ...overrides
  };
}

function cardsCtx(overrides: Record<string, unknown> = {}) {
  return { loading: true, error: null, invoices: [], cards: [], pendingWrites: false, ...overrides };
}

const cachedView: CachedDashboardView = {
  totalBalanceCents: 150000,
  freeToSpendCents: 90000,
  committedCents: 60000,
  availableCaption: 'Livre agora.',
  committedCaption: 'Considerando os próximos 30 dias',
  spendingVariationPct: 12,
  spending: [
    { categoryId: 'food', categoryName: 'Alimentação', amountCents: 42000, mark: { id: 'food', icon: 'utensils', color: defaultCategoryColors.expense_food } }
  ],
  commitments: [
    { id: 'inv-1', kind: 'invoice', cardId: 'card-1', description: 'Cartão Nubank', dueAtISO: '2026-07-25T12:00:00.000Z', amountCents: 30000 }
  ],
  recentTransactions: [
    { id: 'tx-1', type: 'expense', description: 'Mercado da esquina', dateISO: '2026-07-18T12:00:00.000Z', amountCents: 5000, mark: null }
  ]
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  state.auth = { user: { uid: 'u1' }, profile: { defaultWorkspaceId: WORKSPACE_ID, availableMode: 'conservative', name: 'Ana' } };
  state.finance = financeCtx();
  state.cards = cardsCtx();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage — listas do cache no boot', () => {
  it('pinta gastos, compromissos e transações do cache local enquanto ainda carrega (não pisca em branco)', () => {
    // Loading em andamento (dados reais ainda vazios) mas com cache da última sessão.
    saveCachedDashboardView(WORKSPACE_ID, cachedView);
    state.finance = financeCtx({ loading: true, transactions: [], categories: [] });
    state.cards = cardsCtx({ loading: true });

    renderDashboard();

    // As três seções aparecem já no primeiro render, vindas do cache — sem esperar o Firestore.
    expect(screen.getByText('Alimentação')).toBeInTheDocument();
    expect(screen.getByText('Cartão Nubank')).toBeInTheDocument();
    expect(screen.getByText('Mercado da esquina')).toBeInTheDocument();
    // E não cai nos estados vazios enquanto tem cache pra mostrar.
    expect(screen.queryByText('Sem gastos este mês')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma transação ainda')).not.toBeInTheDocument();
    // Legendas do Disponível/Comprometido e a variação vêm do cache — sem "Carregando…"
    // nem "Contas e fatura." piscando.
    expect(screen.getByText('Livre agora.')).toBeInTheDocument();
    expect(screen.getByText('Considerando os próximos 30 dias')).toBeInTheDocument();
    expect(screen.getByText(/vs\. mês passado/)).toBeInTheDocument();
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Contas e fatura.')).not.toBeInTheDocument();
  });

  it('sem cache e já carregado, mostra os estados vazios (não fica em branco nem inventa dado)', () => {
    state.finance = financeCtx({ loading: false });
    state.cards = cardsCtx({ loading: false });

    renderDashboard();

    expect(screen.getByText('Sem gastos este mês')).toBeInTheDocument();
    expect(screen.getByText('Nenhum compromisso pendente')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma transação ainda')).toBeInTheDocument();
    // Conta genuinamente nova/vazia, já carregada, É o único caso que mostra o guia inicial.
    expect(screen.getByText('Comece em poucos minutos')).toBeInTheDocument();
  });

  it('não mostra o guia "Comece em poucos minutos" enquanto uma conta já usada recarrega', () => {
    // Boot de uma conta established: os arrays ao vivo ainda estão vazios, mas isso não pode
    // disparar o guia de conta nova (bug de "pisca no refresh" achado pelo dono).
    saveCachedDashboardView(WORKSPACE_ID, cachedView);
    state.finance = financeCtx({ loading: true });
    state.cards = cardsCtx({ loading: true });

    renderDashboard();

    expect(screen.queryByText('Comece em poucos minutos')).not.toBeInTheDocument();
  });
});
