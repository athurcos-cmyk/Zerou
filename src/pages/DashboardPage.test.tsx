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
vi.mock('../workspaces/workspaceService', () => ({
  updateProjectedSalary: vi.fn(),
  updateProjectionIncludesBalance: vi.fn()
}));

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
    receivables: [],
    recurringRules: [],
    categories: [],
    budgets: [],
    accountBalances: [],
    // Recortes de `useFinanceData`: contas que somam no Saldo total e as marcadas como
    // "fora do saldo" (`Account.excludeFromTotals`).
    countedAccounts: [],
    excludedAccountIds: new Set<string>(),
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
  committedCents: 60000,
  committedCaption: 'Suas contas fixas e recorrentes + a fatura do cartão.',
  spendingVariationPct: 12,
  spending: [
    { categoryId: 'food', categoryName: 'Alimentação', amountCents: 42000, mark: { id: 'food', icon: 'utensils', color: defaultCategoryColors.expense_food } }
  ],
  commitments: [
    { id: 'inv-1', kind: 'invoice', cardId: 'card-1', description: 'Cartão Nubank', dueAtISO: '2026-07-25T12:00:00.000Z', amountCents: 30000 }
  ],
  recentTransactions: [
    { id: 'tx-1', type: 'expense', description: 'Mercado da esquina', dateISO: '2026-07-18T12:00:00.000Z', amountCents: 5000, mark: null }
  ],
  nextMonthProjection: null,
  upcomingReceivables: [
    { id: 'rec-1', description: 'Freela do site', fromWho: 'Cliente X', dueAtISO: '2026-07-20T12:00:00.000Z', amountCents: 90000 }
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
    // A legenda do Comprometido e a variação vêm do cache — sem "Contas e fatura." piscando.
    expect(screen.getByText('Suas contas fixas e recorrentes + a fatura do cartão.')).toBeInTheDocument();
    expect(screen.getByText(/vs\. mês passado/)).toBeInTheDocument();
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

  // ── Regressões de 03/08/2026: valor ao vivo no meio de valores cacheados ──

  it('offline/boot: o saldo DENTRO da fórmula da projeção vem do cache, não R$ 0,00', () => {
    // O bug que o dono viu abrindo o app sem internet. Todos os números da carta vinham do cache
    // menos este, que lia `dashboard.totalBalanceCents` ao vivo — zerado enquanto o boot não
    // termina. `loading: true` + arrays vazios + cache = exatamente esse estado.
    saveCachedDashboardView(WORKSPACE_ID, {
      ...cachedView,
      totalBalanceCents: 33221,
      nextMonthProjection: { committedCents: 380043, leftoverCents: 203178 }
    });
    state.auth = {
      user: { uid: 'u1' },
      profile: {
        defaultWorkspaceId: WORKSPACE_ID,
        name: 'Ana',
        projectedSalaryCents: 550000,
        projectionIncludesBalance: true
      }
    };
    state.finance = financeCtx({ loading: true });
    state.cards = cardsCtx({ loading: true });

    const { container } = renderDashboard();

    const termos = [...container.querySelectorAll('.projection-formula-term')].map((t) => t.textContent?.trim());
    // Salário + saldo (do cache!) − comprometido. O saldo NÃO pode ser R$ 0,00.
    expect(termos).toHaveLength(3);
    expect(termos[1]).toContain('332,21');
    // Nenhum termo pode ser o valor zerado. (Comparação exata, não `includes`: "R$ 5.500,00"
    // contém "0,00" como substring — foi o que fez esta asserção falhar na primeira escrita.)
    expect(termos.map((t) => t?.replace(/\s+/g, ' ').trim())).not.toContain('R$ 0,00');
    // E a conta exibida tem que fechar com a sobra mostrada acima.
    expect(container.querySelector('.projection-amount')?.textContent).toContain('2.031,78');
  });

  it('offline/boot: "Próximos a receber" vem do cache em vez de sumir da tela', () => {
    // Essa seção só renderiza com `length > 0` — lendo ao vivo, ela desaparecia inteira durante
    // o boot, sem deixar rastro de que existia.
    saveCachedDashboardView(WORKSPACE_ID, cachedView);
    state.finance = financeCtx({ loading: true, receivables: [] });
    state.cards = cardsCtx({ loading: true });

    renderDashboard();

    expect(screen.getByText('Freela do site')).toBeInTheDocument();
    expect(screen.getByText('Chega nos próximos dias')).toBeInTheDocument();
  });

  it('sem cache, com finanças prontas e cartão ainda carregando, o estado vazio de gastos aparece', () => {
    // O card ficava com o corpo em branco (nem lista nem estado vazio) porque a lista usava o
    // gate de finanças e o estado vazio esperava o cartão também.
    state.finance = financeCtx({ loading: false });
    state.cards = cardsCtx({ loading: true });

    renderDashboard();

    expect(screen.getByText('Sem gastos este mês')).toBeInTheDocument();
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
