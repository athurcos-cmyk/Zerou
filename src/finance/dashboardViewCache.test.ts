import { afterEach, describe, expect, it } from 'vitest';
import {
  readCachedDashboardView,
  saveCachedDashboardView,
  type CachedDashboardView
} from './dashboardViewCache';
import { defaultCategoryColors } from '../theme/palette';

const workspaceId = 'ws-test';

const sampleView: CachedDashboardView = {
  totalBalanceCents: 150000,
  freeToSpendCents: 90000,
  committedCents: 60000,
  availableCaption: 'Livre agora.',
  committedCaption: 'Considerando os próximos 30 dias',
  spendingVariationPct: 12,
  spending: [
    { categoryId: 'food', categoryName: 'Alimentação', amountCents: 42000, mark: { id: 'food', icon: 'utensils', color: defaultCategoryColors.expense_food } },
    { categoryId: 'uncategorized', categoryName: 'Sem categoria', amountCents: 8000, mark: null }
  ],
  commitments: [
    { id: 'inv-1', kind: 'invoice', cardId: 'card-1', description: 'Cartão Nubank', dueAtISO: '2026-07-25T12:00:00.000Z', amountCents: 30000 }
  ],
  recentTransactions: [
    { id: 'tx-1', type: 'expense', description: 'Mercado', dateISO: '2026-07-18T12:00:00.000Z', amountCents: 5000, mark: { id: 'food', icon: 'utensils', color: defaultCategoryColors.expense_food } },
    { id: 'tx-2', type: 'income', description: 'Salário', dateISO: '2026-07-05T12:00:00.000Z', amountCents: 300000, mark: { id: '', icon: 'money', color: defaultCategoryColors.income_salary } }
  ]
};

afterEach(() => {
  window.localStorage.clear();
});

describe('dashboardViewCache', () => {
  it('round-trips the full view (numbers + as três listas) preservando datas e marcas', () => {
    saveCachedDashboardView(workspaceId, sampleView);
    expect(readCachedDashboardView(workspaceId)).toEqual(sampleView);
  });

  it('isola por workspace — não devolve o cache de outro workspace', () => {
    saveCachedDashboardView(workspaceId, sampleView);
    expect(readCachedDashboardView('outro-ws')).toBeNull();
  });

  it('devolve null quando não há nada salvo', () => {
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('rejeita o cache inteiro (não renderiza lixo) se qualquer item de lista estiver corrompido', () => {
    // Simula uma entrada de formato antigo/corrompido: número ok, mas uma transação sem `dateISO`.
    const corrupted = {
      ...sampleView,
      recentTransactions: [{ id: 'tx-1', type: 'expense', description: 'Mercado', amountCents: 5000, mark: null }]
    };
    window.localStorage.setItem('zerou.dashboardView.v1.' + workspaceId, JSON.stringify(corrupted));
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('rejeita quando os números do topo não são números', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v1.' + workspaceId,
      JSON.stringify({ ...sampleView, totalBalanceCents: 'x' })
    );
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('rejeita quando uma legenda (Comprometido/Disponível) não é string', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v1.' + workspaceId,
      JSON.stringify({ ...sampleView, committedCaption: 42 })
    );
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });
});
