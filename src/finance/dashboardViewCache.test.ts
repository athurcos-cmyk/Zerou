import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readCachedDashboardView,
  resolveProjectionView,
  saveCachedDashboardView,
  type CachedDashboardView
} from './dashboardViewCache';
import { defaultCategoryColors } from '../theme/palette';

const workspaceId = 'ws-test';

const sampleView: CachedDashboardView = {
  totalBalanceCents: 150000,
  committedCents: 60000,
  committedCaption: 'Suas contas fixas e recorrentes + a fatura do cartão.',
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
  ],
  nextMonthProjection: { committedCents: 60000, leftoverCents: 440000 },
  upcomingReceivables: [
    { id: 'rec-1', description: 'Freela', fromWho: 'Cliente X', dueAtISO: '2026-07-22T12:00:00.000Z', amountCents: 90000 }
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

  it('nextMonthProjection: aceita null (sem salário previsto configurado)', () => {
    saveCachedDashboardView(workspaceId, { ...sampleView, nextMonthProjection: null });
    expect(readCachedDashboardView(workspaceId)?.nextMonthProjection).toBeNull();
  });

  it('nextMonthProjection: cache de formato antigo (sem a chave) lê como null, não invalida o resto', () => {
    // Simula uma entrada gravada antes desse campo existir — regressão pro bug real de
    // 2026-08-01: a Projeção do próximo mês nunca tinha cache e recalculava do zero no boot
    // (ver DashboardPage.tsx). Chave nova ausente não pode derrubar o cache inteiro.
    const { nextMonthProjection: _omit, ...oldFormat } = sampleView;
    window.localStorage.setItem('zerou.dashboardView.v2.' + workspaceId, JSON.stringify(oldFormat));
    const view = readCachedDashboardView(workspaceId);
    expect(view).not.toBeNull();
    expect(view!.nextMonthProjection).toBeNull();
    expect(view!.totalBalanceCents).toBe(sampleView.totalBalanceCents);
  });

  it('upcomingReceivables: cache de formato antigo (sem a chave) lê como [], não invalida o resto', () => {
    // Regressão da varredura de 03/08/2026: "Próximos a receber" era a última seção sem cache.
    // Adicionar a chave não pode derrubar o cache já gravado na máquina de quem atualizar o app —
    // senão o primeiro boot depois do deploy volta a piscar a tela inteira.
    const { upcomingReceivables: _omit, ...oldFormat } = sampleView;
    window.localStorage.setItem('zerou.dashboardView.v2.' + workspaceId, JSON.stringify(oldFormat));
    const view = readCachedDashboardView(workspaceId);
    expect(view).not.toBeNull();
    expect(view!.upcomingReceivables).toEqual([]);
    expect(view!.totalBalanceCents).toBe(sampleView.totalBalanceCents);
    expect(view!.spending).toEqual(sampleView.spending);
  });

  it('upcomingReceivables: presente mas corrompido invalida (não renderiza lixo)', () => {
    window.localStorage.setItem(
      'zerou.dashboardView.v2.' + workspaceId,
      JSON.stringify({ ...sampleView, upcomingReceivables: [{ id: 'rec-1', description: 'Freela' }] })
    );
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
      committedCaption: 'Suas contas fixas e recorrentes + a fatura do cartão.',
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

/** Regressão do bug de 03/08/2026 (achado pelo dono abrindo o app sem internet): a carta
 * "Projeção do próximo mês" pegava a projeção do cache mas lia o saldo AO VIVO. Offline isso não
 * era um piscar — o Firestore devolve `unavailable`, `loading` nunca vira false, o app mostra o
 * cache indefinidamente, e a linha do saldo mostrava R$ 0,00 indefinidamente junto. */
describe('resolveProjectionView — nunca mistura cache com ao vivo', () => {
  const cache = { totalBalanceCents: 33221, nextMonthProjection: { committedCents: 380043, leftoverCents: 203178 } };
  const live = { totalBalanceCents: 99999, projection: { committedCents: 111, leftoverCents: 222 } };

  it('com cache: os DOIS valores saem do cache (o saldo junto, não só a projeção)', () => {
    const view = resolveProjectionView(cache, live);
    expect(view.projection).toEqual(cache.nextMonthProjection);
    expect(view.balanceCents).toBe(cache.totalBalanceCents);
  });

  it('offline no boot (cache existe, dados ao vivo ainda zerados) não mostra saldo R$ 0,00', () => {
    // Exatamente o estado reportado: `loading` preso em true, live tudo zerado.
    const view = resolveProjectionView(cache, { totalBalanceCents: 0, projection: null });
    expect(view.balanceCents).toBe(cache.totalBalanceCents);
    expect(view.projection).toEqual(cache.nextMonthProjection);
  });

  it('sem cache: os dois valores saem do ao vivo', () => {
    const view = resolveProjectionView(null, live);
    expect(view.projection).toEqual(live.projection);
    expect(view.balanceCents).toBe(live.totalBalanceCents);
  });

  it('a fórmula fecha: salário + saldo − comprometido == sobra prevista', () => {
    // O que o descasamento quebrava na tela: a sobra vinha do cache tendo somado o saldo, mas a
    // fórmula logo abaixo exibia esse saldo como zero, e a conta não batia à vista.
    const salarioCents = 550000;
    const view = resolveProjectionView(cache, live);
    expect(salarioCents + view.balanceCents - view.projection!.committedCents).toBe(view.projection!.leftoverCents);
  });
});
