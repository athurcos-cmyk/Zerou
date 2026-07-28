import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readCachedDashboardView,
  saveCachedDashboardView,
  type CachedDashboardView
} from './dashboardViewCache';
import { defaultCategoryColors } from '../theme/palette';

const workspaceId = 'ws-test';

const sampleView: CachedDashboardView = {
  totalBalanceCents: 150000,
  committedCents: 60000,
  committedCaption: 'Contas fixas e recorrentes + faturas de cartão em aberto.',
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
    window.localStorage.setItem('zerou.dashboardView.v2.' + workspaceId, JSON.stringify(corrupted));
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('rejeita quando os números do topo não são números', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v2.' + workspaceId,
      JSON.stringify({ ...sampleView, totalBalanceCents: 'x' })
    );
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('rejeita quando a legenda do Comprometido não é string', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v2.' + workspaceId,
      JSON.stringify({ ...sampleView, committedCaption: 42 })
    );
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  // --- Mini cache (fallback quando o cache completo não coube no localStorage) ---

  it('mini cache: salva e recupera números + legenda com listas vazias', () => {
    const mini = {
      totalBalanceCents: 150000,
      committedCents: 60000,
      committedCaption: 'Contas fixas e recorrentes + faturas de cartão em aberto.',
      spendingVariationPct: 12
    };
    window.localStorage.setItem('zerou.dashboardView.v2.' + workspaceId + '.mini', JSON.stringify(mini));
    const view = readCachedDashboardView(workspaceId);
    expect(view).not.toBeNull();
    expect(view!.totalBalanceCents).toBe(150000);
    expect(view!.committedCents).toBe(60000);
    expect(view!.spending).toEqual([]);
    expect(view!.commitments).toEqual([]);
    expect(view!.recentTransactions).toEqual([]);
  });

  it('mini cache: é ignorado se o cache completo existe (versão completa tem precedência)', () => {
    // Grava mini primeiro
    const mini = { totalBalanceCents: 1, committedCents: 1, committedCaption: 'mini', spendingVariationPct: null };
    window.localStorage.setItem('zerou.dashboardView.v2.' + workspaceId + '.mini', JSON.stringify(mini));
    // Depois grava completo
    saveCachedDashboardView(workspaceId, sampleView);
    // Deve retornar o completo, não o mini
    expect(readCachedDashboardView(workspaceId)).toEqual(sampleView);
  });

  it('mini cache: rejeita se números forem inválidos', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v2.' + workspaceId + '.mini',
      JSON.stringify({ totalBalanceCents: 'x', committedCents: 1, committedCaption: 'b', spendingVariationPct: null })
    );
    expect(readCachedDashboardView(workspaceId)).toBeNull();
  });

  it('salvar cache: grava mini quando o cache completo não coube (simula QuotaExceededError)', () => {
    // Storage.prototype.setItem funciona independente de como window.localStorage é acessado
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // Primeira chamada (cache completo) → QuotaExceededError
    setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    saveCachedDashboardView(workspaceId, sampleView);
    // Deve ter tentado gravar o cache completo (que falhou) + o mini (que passou)
    expect(setItem).toHaveBeenCalledTimes(2);
    const view = readCachedDashboardView(workspaceId);
    expect(view).not.toBeNull();
    expect(view!.totalBalanceCents).toBe(sampleView.totalBalanceCents);
    expect(view!.committedCents).toBe(sampleView.committedCents);
    expect(view!.spending).toEqual([]);
    setItem.mockRestore();
  });
});
