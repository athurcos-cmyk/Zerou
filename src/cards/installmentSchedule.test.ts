import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { installmentAmounts, invoicesForSpendingFromTransactions } from './installmentSchedule';
import { NO_CATEGORY, spendingByCategoryForMonth } from '../finance/spendingAnalysis';
import type { Transaction } from '../types/contracts';

const noExclusions: ReadonlySet<string> = new Set();

function txn(over: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amountCents'>): Transaction {
  return {
    workspaceId: 'ws',
    createdBy: 'u1',
    updatedBy: 'u1',
    description: 'x',
    categoryId: 'cat',
    date: Timestamp.fromDate(new Date(2026, 7, 4, 12, 0, 0)),
    competenceMonth: '2026-08',
    cashMonth: '2026-08',
    tags: [],
    isRecurring: false,
    clientMutationId: over.id,
    syncStatus: 'synced',
    version: 1,
    ...over
  } as Transaction;
}

/** Compra parcelada no cartão como o app grava: valor CHEIO na transação + nº de parcelas +
 *  `invoiceId` da PRIMEIRA fatura (é dali que sai o mês de início da série). */
function parcelada(over: {
  id: string;
  amountCents: number;
  installments: number;
  firstInvoiceMonth: string;
  purchaseMonth: string;
  categoryId?: string;
  deletedAt?: Timestamp;
  installmentStart?: number;
  anticipatedInstallments?: Record<string, string>;
}): Transaction {
  const [year, month] = over.purchaseMonth.split('-').map(Number);
  return txn({
    id: over.id,
    type: 'card_purchase',
    amountCents: over.amountCents,
    categoryId: over.categoryId ?? 'presente',
    cardId: 'card_nubank',
    invoiceId: `card_nubank_${over.firstInvoiceMonth}`,
    installments: over.installments,
    date: Timestamp.fromDate(new Date(year, month - 1, 4, 12, 0, 0)),
    competenceMonth: over.purchaseMonth,
    cashMonth: over.purchaseMonth,
    ...(over.deletedAt ? { deletedAt: over.deletedAt } : {}),
    ...(over.installmentStart ? { installmentStart: over.installmentStart } : {}),
    ...(over.anticipatedInstallments ? { anticipatedInstallments: over.anticipatedInstallments } : {})
  });
}

/** O mesmo pipeline que o "Resumo de gastos" do Dashboard usa. */
function dashboardSpending(month: string, transactions: Transaction[], excluded: ReadonlySet<string> = noExclusions) {
  const byId = new Map(transactions.map((t) => [t.id, t.categoryId]));
  const purchaseMonthById = new Map(
    transactions.filter((t) => t.type === 'card_purchase').map((t) => [t.id, t.cashMonth ?? t.competenceMonth])
  );
  return spendingByCategoryForMonth(
    month,
    transactions,
    invoicesForSpendingFromTransactions(transactions),
    (id) => (id ? byId.get(id) : undefined),
    excluded,
    (id) => purchaseMonthById.get(id)
  );
}

describe('installmentAmounts', () => {
  it('põe o centavo sobrando nas PRIMEIRAS parcelas', () => {
    expect(installmentAmounts(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('divisão exata não sobra centavo', () => {
    expect(installmentAmounts(58800, 4)).toEqual([14700, 14700, 14700, 14700]);
  });
});

describe('invoicesForSpendingFromTransactions', () => {
  it('à vista (1x) NÃO vira cronograma — é contada pela transação', () => {
    const aVista = txn({
      id: 't1',
      type: 'card_purchase',
      amountCents: 13558,
      cardId: 'card_nubank',
      invoiceId: 'card_nubank_2026-09',
      installments: 1
    });

    expect(invoicesForSpendingFromTransactions([aVista])).toEqual([]);
  });

  it('parcelada vira uma parcela por mês consecutivo a partir da primeira fatura', () => {
    const derived = invoicesForSpendingFromTransactions([
      parcelada({ id: 't1', amountCents: 58800, installments: 4, firstInvoiceMonth: '2026-09', purchaseMonth: '2026-08' })
    ]);

    expect(derived.map((i) => i.referenceMonth).sort()).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(derived.flatMap((i) => i.ledgerEntries).map((e) => e.amountCents)).toEqual([14700, 14700, 14700, 14700]);
    expect(derived.flatMap((i) => i.ledgerEntries).map((e) => e.installmentNumber).sort()).toEqual([1, 2, 3, 4]);
  });

  it('compra excluída não gera cronograma nenhum', () => {
    const derived = invoicesForSpendingFromTransactions([
      parcelada({
        id: 't1',
        amountCents: 58800,
        installments: 4,
        firstInvoiceMonth: '2026-09',
        purchaseMonth: '2026-08',
        deletedAt: Timestamp.fromDate(new Date(2026, 7, 6))
      })
    ]);

    expect(derived).toEqual([]);
  });

  it('sem mês válido no `invoiceId` a compra fica de fora (cai no comportamento antigo)', () => {
    const semMes = txn({
      id: 't1',
      type: 'card_purchase',
      amountCents: 58800,
      cardId: 'card_nubank',
      invoiceId: 'card_nubank_lixo',
      installments: 4
    });

    expect(invoicesForSpendingFromTransactions([semMes])).toEqual([]);
  });
});

// O caso real que motivou a correção: Airbnb R$ 588,00 em 4x, comprado em 04/08/2026 num cartão
// que fecha dia 2 — a parcela 1 cai na fatura de SETEMBRO e, pela ancoragem de 2026-08-05, conta
// no mês da COMPRA (agosto). Antes disso o Dashboard contava R$ 588,00 em agosto e R$ 0 depois.
describe('Resumo de gastos do Dashboard bate com a Análise [parcelada]', () => {
  const airbnb = parcelada({
    id: 'txn_airbnb',
    amountCents: 58800,
    installments: 4,
    firstInvoiceMonth: '2026-09',
    purchaseMonth: '2026-08'
  });

  it('mês da compra conta só a PARCELA, não o valor cheio', () => {
    expect(dashboardSpending('2026-08', [airbnb]).get('presente')).toBe(14700);
  });

  it('os três meses seguintes contam uma parcela cada', () => {
    expect(dashboardSpending('2026-09', [airbnb]).get('presente')).toBe(14700);
    expect(dashboardSpending('2026-10', [airbnb]).get('presente')).toBe(14700);
    expect(dashboardSpending('2026-11', [airbnb]).get('presente')).toBe(14700);
  });

  it('o mês depois da última parcela não conta nada', () => {
    expect(dashboardSpending('2026-12', [airbnb]).get('presente')).toBeUndefined();
  });

  it('conserva o valor cheio da compra somando os 4 meses', () => {
    const total = ['2026-08', '2026-09', '2026-10', '2026-11']
      .map((m) => dashboardSpending(m, [airbnb]).get('presente') ?? 0)
      .reduce((a, b) => a + b, 0);

    expect(total).toBe(58800);
  });

  it('compra parcelada de um mês ANTERIOR ainda pesa no mês corrente', () => {
    // 12x comprado em março, fatura 1 em abril (cartão fechado): a parcela de agosto é a 6ª.
    const antiga = parcelada({
      id: 'txn_antiga',
      amountCents: 120000,
      installments: 12,
      firstInvoiceMonth: '2026-04',
      purchaseMonth: '2026-03',
      categoryId: 'casa'
    });

    expect(dashboardSpending('2026-08', [antiga]).get('casa')).toBe(10000);
  });
});

describe('Resumo de gastos do Dashboard bate com a Análise [demais casos]', () => {
  it('compra à vista no cartão conta o valor cheio no mês da compra', () => {
    const jogo = txn({
      id: 'txn_jogo',
      type: 'card_purchase',
      amountCents: 13558,
      categoryId: 'jogos',
      cardId: 'card_nubank',
      invoiceId: 'card_nubank_2026-09',
      installments: 1
    });

    expect(dashboardSpending('2026-08', [jogo]).get('jogos')).toBe(13558);
    expect(dashboardSpending('2026-09', [jogo]).get('jogos')).toBeUndefined();
  });

  it('gasto em conta "fora do saldo" (vale-refeição) não conta', () => {
    const vale = txn({
      id: 'txn_vr',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'alimentacao',
      accountId: 'acc_vr'
    });

    expect(dashboardSpending('2026-08', [vale], new Set(['acc_vr'])).get('alimentacao')).toBeUndefined();
    expect(dashboardSpending('2026-08', [vale]).get('alimentacao')).toBe(5000);
  });

  it('estorno subtrai da própria categoria (o inline antigo simplesmente ignorava)', () => {
    const gasto = txn({ id: 'g', type: 'expense', amountCents: 10000, categoryId: 'mercado' });
    const estorno = txn({ id: 'e', type: 'refund', amountCents: 3000, categoryId: 'mercado' });

    expect(dashboardSpending('2026-08', [gasto, estorno]).get('mercado')).toBe(7000);
  });

  it('aporte a meta/cofrinho não é gasto', () => {
    const aporte = txn({ id: 'a', type: 'expense', amountCents: 10000, categoryId: 'cofrinho', tags: ['cofrinho'] });

    expect(dashboardSpending('2026-08', [aporte]).get('cofrinho')).toBeUndefined();
  });

  it('compra no cartão sem categoria cai numa única chave `NO_CATEGORY`', () => {
    // O inline antigo usava a chave `'uncategorized'`, diferente da Análise.
    const semCategoria = txn({
      id: 's',
      type: 'card_purchase',
      amountCents: 4000,
      categoryId: '',
      cardId: 'card_nubank',
      invoiceId: 'card_nubank_2026-09',
      installments: 1
    });

    const totals = dashboardSpending('2026-08', [semCategoria]);
    expect(totals.get(NO_CATEGORY)).toBe(4000);
    expect(totals.get('uncategorized')).toBeUndefined();
  });

  it('compra excluída some do mês inteiro, inclusive das parcelas futuras', () => {
    const excluida = parcelada({
      id: 'txn_del',
      amountCents: 58800,
      installments: 4,
      firstInvoiceMonth: '2026-09',
      purchaseMonth: '2026-08',
      deletedAt: Timestamp.fromDate(new Date(2026, 7, 6))
    });

    expect(dashboardSpending('2026-08', [excluida]).get('presente')).toBeUndefined();
    expect(dashboardSpending('2026-10', [excluida]).get('presente')).toBeUndefined();
  });

  // Trava contra o modo de falha #4 documentado em `invoicesForSpendingFromTransactions`:
  // compra JÁ EM ANDAMENTO (`registerOngoingInstallments`) guarda o que FALTA, e a série começa
  // no mês que a pessoa informou — muitos meses depois da compra. Não pode deslocar.
  it('compra "já em andamento" não desloca a série', () => {
    const ongoing = parcelada({
      id: 'txn_ongoing',
      amountCents: 61912, // 4 parcelas restantes de R$ 154,78
      installments: 4,
      firstInvoiceMonth: '2026-08',
      purchaseMonth: '2026-01',
      categoryId: 'limite'
    });

    // Começa em agosto (o mês informado), não em julho: `monthDiff(2026-08, 2026-01) === 7`,
    // então nenhum deslocamento é aplicado.
    expect(dashboardSpending('2026-07', [ongoing]).get('limite')).toBeUndefined();
    expect(dashboardSpending('2026-08', [ongoing]).get('limite')).toBe(15478);
    expect(dashboardSpending('2026-11', [ongoing]).get('limite')).toBe(15478);
  });
});

// `installmentStart` (2026-08-06): o número REAL da primeira parcela recriada numa compra que já
// estava em andamento. Sem ele, numerar de 1 inventava uma "parcela 1" que disparava o
// deslocamento — e a Análise, lendo o ledger real (sem parcela 1), nunca desloca.
describe('installmentStart — compra já em andamento não desloca', () => {
  // O caso exato da divergência: a próxima parcela cai 1 mês depois da data da compra, que é o
  // gatilho do deslocamento. Faltam 4 de 10, começando na 7ª.
  const ongoing = {
    id: 'txn_ongoing',
    amountCents: 61912,
    installments: 4,
    firstInvoiceMonth: '2026-08',
    purchaseMonth: '2026-07',
    categoryId: 'limite'
  };

  it('com installmentStart, a série começa no mês da fatura informada', () => {
    const txn = parcelada({ ...ongoing, installmentStart: 7 });

    expect(dashboardSpending('2026-07', [txn]).get('limite')).toBeUndefined();
    expect(dashboardSpending('2026-08', [txn]).get('limite')).toBe(15478);
    expect(dashboardSpending('2026-11', [txn]).get('limite')).toBe(15478);
  });

  it('dado ANTIGO (sem o campo) segue 1 mês adiantado — divergência residual documentada', () => {
    const legado = parcelada(ongoing);

    // Isto não é o comportamento desejado: é o registro honesto do que acontece com transação
    // gravada antes de 06/08/2026. Se algum dia migrarmos o dado antigo, este teste muda junto.
    expect(dashboardSpending('2026-07', [legado]).get('limite')).toBe(15478);
  });
});

// Antecipar parcela (`anticipatedInstallments`, 2026-08-06): espelho na transação do que só
// existia no ledger. Decisão do dono em 05/08: "se eu antecipei, gastei naquele mês".
describe('antecipação de parcela — Dashboard passa a mover o gasto igual à Análise', () => {
  // A tabela literal que o dono escreveu: 5x de R$ 100, antecipando as duas últimas em março.
  const cincoVezes = {
    id: 'txn_5x',
    amountCents: 50000,
    installments: 5,
    firstInvoiceMonth: '2026-01',
    purchaseMonth: '2026-01',
    categoryId: 'compras'
  };

  it('reproduz a tabela: 100 / 100 / 300 / 0 / 0', () => {
    const txn = parcelada({
      ...cincoVezes,
      anticipatedInstallments: { '2026-04': '2026-03', '2026-05': '2026-03' }
    });

    expect(dashboardSpending('2026-01', [txn]).get('compras')).toBe(10000);
    expect(dashboardSpending('2026-02', [txn]).get('compras')).toBe(10000);
    expect(dashboardSpending('2026-03', [txn]).get('compras')).toBe(30000);
    expect(dashboardSpending('2026-04', [txn]).get('compras') ?? 0).toBe(0);
    expect(dashboardSpending('2026-05', [txn]).get('compras') ?? 0).toBe(0);
  });

  it('conserva o valor cheio da compra', () => {
    const txn = parcelada({
      ...cincoVezes,
      anticipatedInstallments: { '2026-04': '2026-03', '2026-05': '2026-03' }
    });
    const total = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
      .map((m) => dashboardSpending(m, [txn]).get('compras') ?? 0)
      .reduce((a, b) => a + b, 0);

    expect(total).toBe(50000);
  });

  it('sem antecipação, nada muda (o cronograma original vale)', () => {
    const txn = parcelada(cincoVezes);

    expect(dashboardSpending('2026-03', [txn]).get('compras')).toBe(10000);
    expect(dashboardSpending('2026-05', [txn]).get('compras')).toBe(10000);
  });

  // ⚠️ Trava do desenho: a parcela 1 PODE ser antecipada (a fatura dela é futura enquanto a atual
  // ainda está aberta). A primeira versão MOVIA a parcela de mês, o que fazia
  // `installmentShiftBySource` perder a âncora e a série INTEIRA escorregar um mês. Reproduzir o
  // par crédito+débito do ledger mantém o lançamento `purchase` onde estava. Falha se alguém
  // "simplificar" isso de volta.
  it('antecipar a parcela 1 não desloca as outras parcelas', () => {
    const airbnb = parcelada({
      id: 'txn_airbnb',
      amountCents: 58800,
      installments: 4,
      firstInvoiceMonth: '2026-09',
      purchaseMonth: '2026-08',
      anticipatedInstallments: { '2026-09': '2026-08' }
    });

    // Parcela 1 já contava em agosto (mês da compra), então antecipá-la em agosto não muda o mês.
    expect(dashboardSpending('2026-08', [airbnb]).get('presente')).toBe(14700);
    // E as outras três continuam ancoradas em set/out/nov — não escorregaram pra out/nov/dez.
    expect(dashboardSpending('2026-09', [airbnb]).get('presente')).toBe(14700);
    expect(dashboardSpending('2026-10', [airbnb]).get('presente')).toBe(14700);
    expect(dashboardSpending('2026-11', [airbnb]).get('presente')).toBe(14700);
    expect(dashboardSpending('2026-12', [airbnb]).get('presente') ?? 0).toBe(0);
  });
});
