import type { TransactionType } from '../types/contracts';

// v2 do antigo `dashboardSummaryCache` (só os 3 números): agora guarda também as listas
// visíveis do Dashboard (gastos por categoria, próximos compromissos, transações recentes)
// pra pintá-las na hora no boot, em vez de deixar as seções em branco por 1-2s enquanto o
// Firestore lê o IndexedDB de volta. É só um acelerador de exibição — a fonte real continua
// sendo o cache do Firestore + os listeners. A chave nova (`dashboardView.v1`) ignora
// entradas do formato antigo sozinha (validação retorna null), sem migração.
const CACHE_KEY_PREFIX = 'zerou.dashboardView.v2.';

/** O suficiente pra reproduzir o `CategoryMark` sem depender das categorias já terem
 * carregado: cor/ícone são resolvidos no render a partir daqui (ver DashboardPage). */
export interface CachedCategoryMark {
  id: string;
  icon?: string;
  color?: string;
}

export interface CachedSpendingRow {
  categoryId: string;
  categoryName: string;
  amountCents: number;
  mark: CachedCategoryMark | null;
}

export interface CachedCommitment {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  cardId?: string;
  description: string;
  /** Serializado (localStorage não guarda Date/Timestamp) — vira Date de novo no read. */
  dueAtISO: string;
  amountCents: number;
}

export interface CachedRecentTransaction {
  id: string;
  type: TransactionType;
  description: string;
  dateISO: string;
  amountCents: number;
  mark: CachedCategoryMark | null;
}

export interface CachedNextMonthProjection {
  committedCents: number;
  leftoverCents: number;
}

/** "Próximos a receber" (o que vence em ≤5 dias). Entrou no cache em 03/08/2026, na varredura
 * que o dono pediu depois do bug do saldo zerado: era a última seção do Dashboard que lia dado
 * ao vivo sem cobertura de cache nenhuma. Diferente dos outros achados, ela não mostrava número
 * errado — **sumia da tela inteira** durante o boot (a seção só renderiza com `length > 0`), o
 * que é pior de perceber: some sem deixar rastro, e é justamente um lembrete de dinheiro que
 * alguém te deve. */
export interface CachedUpcomingReceivable {
  id: string;
  description: string;
  fromWho?: string;
  /** Serializado (localStorage não guarda Date/Timestamp) — vira Date de novo no read. */
  dueAtISO: string;
  amountCents: number;
}

export interface CachedDashboardView {
  totalBalanceCents: number;
  committedCents: number;
  /** Legenda já resolvida do Comprometido e a variação % de gastos — pré-computadas na
   * gravação pra não piscarem "Carregando…" nem trocarem de texto durante o boot. */
  committedCaption: string;
  spendingVariationPct: number | null;
  spending: CachedSpendingRow[];
  commitments: CachedCommitment[];
  recentTransactions: CachedRecentTransaction[];
  /** `null` = sem salário previsto configurado (card mostra o convite, não um valor). Ao
   * contrário do Comprometido/Saldo, esse número nunca tinha cache — reabrir o app sempre
   * recalculava do zero com `bills`/`recurringRules`/`invoices` ainda vazios (boot), mostrando
   * por um instante "sobra = salário inteiro" antes de cair pro valor real quando os
   * compromissos chegavam. */
  nextMonthProjection: CachedNextMonthProjection | null;
  /** Chave ausente (cache gravado antes de 03/08/2026) lê como `[]`, não invalida o resto —
   * mesmo tratamento tolerante de `nextMonthProjection`. */
  upcomingReceivables: CachedUpcomingReceivable[];
}

/** O que a carta "Projeção do próximo mês" exibe: a projeção e o saldo que entra na fórmula.
 *
 * Existe como função separada por causa de um bug real (03/08/2026): a carta pegava a projeção do
 * cache mas lia o saldo AO VIVO, e offline isso não era um piscar — era permanente. Com o Firestore
 * em `unavailable` o listener fica vivo e `loading` nunca vira false (ver `useFinanceData.ts`), o
 * app mostra o cache indefinidamente, e aquela linha mostrava R$ 0,00 indefinidamente junto. Pior:
 * a "Sobra prevista" (do cache) já tinha somado o saldo, então a fórmula exibida não fechava.
 *
 * **A regra é "tudo do mesmo lado do `if`"** — nunca metade do cache e metade ao vivo. Manter isso
 * numa função com teste é o que impede a mistura de voltar despercebida no meio de um JSX grande. */
export function resolveProjectionView(
  cache: Pick<CachedDashboardView, 'totalBalanceCents' | 'nextMonthProjection'> | null,
  live: { projection: CachedNextMonthProjection | null; totalBalanceCents: number }
): { projection: CachedNextMonthProjection | null; balanceCents: number } {
  if (cache) return { projection: cache.nextMonthProjection, balanceCents: cache.totalBalanceCents };
  return { projection: live.projection, balanceCents: live.totalBalanceCents };
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/** `null` = sem categoria (cai no ícone/cor padrão do CategoryMark). Qualquer coisa que não
 * seja `null` nem uma marca válida invalida o cache inteiro — melhor um flash uma vez que
 * renderizar lixo. */
function parseMark(value: unknown): CachedCategoryMark | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const mark = value as Record<string, unknown>;
  if (typeof mark.id !== 'string' || !isOptionalString(mark.icon) || !isOptionalString(mark.color)) {
    return undefined;
  }
  return { id: mark.id, icon: mark.icon, color: mark.color };
}

function parseSpendingRow(value: unknown): CachedSpendingRow | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const mark = parseMark(row.mark);
  if (
    typeof row.categoryId !== 'string' ||
    typeof row.categoryName !== 'string' ||
    !isFiniteNumber(row.amountCents) ||
    mark === undefined
  ) {
    return null;
  }
  return { categoryId: row.categoryId, categoryName: row.categoryName, amountCents: row.amountCents, mark };
}

function parseCommitment(value: unknown): CachedCommitment | null {
  if (typeof value !== 'object' || value === null) return null;
  const commitment = value as Record<string, unknown>;
  if (
    typeof commitment.id !== 'string' ||
    (commitment.kind !== 'bill' && commitment.kind !== 'recurring' && commitment.kind !== 'invoice') ||
    !isOptionalString(commitment.cardId) ||
    typeof commitment.description !== 'string' ||
    typeof commitment.dueAtISO !== 'string' ||
    !isFiniteNumber(commitment.amountCents)
  ) {
    return null;
  }
  return {
    id: commitment.id,
    kind: commitment.kind,
    cardId: commitment.cardId,
    description: commitment.description,
    dueAtISO: commitment.dueAtISO,
    amountCents: commitment.amountCents
  };
}

function parseRecentTransaction(value: unknown): CachedRecentTransaction | null {
  if (typeof value !== 'object' || value === null) return null;
  const transaction = value as Record<string, unknown>;
  const mark = parseMark(transaction.mark);
  if (
    typeof transaction.id !== 'string' ||
    typeof transaction.type !== 'string' ||
    typeof transaction.description !== 'string' ||
    typeof transaction.dateISO !== 'string' ||
    !isFiniteNumber(transaction.amountCents) ||
    mark === undefined
  ) {
    return null;
  }
  return {
    id: transaction.id,
    type: transaction.type as TransactionType,
    description: transaction.description,
    dateISO: transaction.dateISO,
    amountCents: transaction.amountCents,
    mark
  };
}

/** `undefined` = valor inválido (invalida o cache inteiro); `null` é um valor válido (sem
 * salário previsto configurado). */
function parseProjection(value: unknown): CachedNextMonthProjection | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const projection = value as Record<string, unknown>;
  if (!isFiniteNumber(projection.committedCents) || !isFiniteNumber(projection.leftoverCents)) {
    return undefined;
  }
  return { committedCents: projection.committedCents, leftoverCents: projection.leftoverCents };
}

function parseReceivable(value: unknown): CachedUpcomingReceivable | null {
  if (typeof value !== 'object' || value === null) return null;
  const receivable = value as Record<string, unknown>;
  if (
    typeof receivable.id !== 'string' ||
    typeof receivable.description !== 'string' ||
    !isOptionalString(receivable.fromWho) ||
    typeof receivable.dueAtISO !== 'string' ||
    !isFiniteNumber(receivable.amountCents)
  ) {
    return null;
  }
  return {
    id: receivable.id,
    description: receivable.description,
    fromWho: receivable.fromWho,
    dueAtISO: receivable.dueAtISO,
    amountCents: receivable.amountCents
  };
}

function parseList<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const next = parseItem(item);
    if (next === null) return null;
    parsed.push(next);
  }
  return parsed;
}

function readMiniCache(workspaceId: string): CachedDashboardView | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + workspaceId + '.mini');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !isFiniteNumber(parsed.totalBalanceCents) ||
      !isFiniteNumber(parsed.committedCents) ||
      typeof parsed.committedCaption !== 'string' ||
      (parsed.spendingVariationPct !== null && !isFiniteNumber(parsed.spendingVariationPct))
    ) {
      return null;
    }
    const nextMonthProjection = parseProjection(parsed.nextMonthProjection);
    if (nextMonthProjection === undefined) return null;
    return {
      totalBalanceCents: parsed.totalBalanceCents,
      committedCents: parsed.committedCents,
      committedCaption: parsed.committedCaption,
      spendingVariationPct: parsed.spendingVariationPct as number | null,
      spending: [],
      commitments: [],
      recentTransactions: [],
      nextMonthProjection,
      upcomingReceivables: []
    };
  } catch {
    return null;
  }
}

export function readCachedDashboardView(workspaceId?: string | null): CachedDashboardView | null {
  if (!canUseStorage() || !workspaceId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + workspaceId);
    if (!raw) {
      return readMiniCache(workspaceId);
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !isFiniteNumber(parsed.totalBalanceCents) ||
      !isFiniteNumber(parsed.committedCents) ||
      typeof parsed.committedCaption !== 'string' ||
      (parsed.spendingVariationPct !== null && !isFiniteNumber(parsed.spendingVariationPct))
    ) {
      return null;
    }

    const spending = parseList(parsed.spending, parseSpendingRow);
    const commitments = parseList(parsed.commitments, parseCommitment);
    const recentTransactions = parseList(parsed.recentTransactions, parseRecentTransaction);
    const nextMonthProjection = parseProjection(parsed.nextMonthProjection);
    // Chave ausente = cache anterior a 03/08/2026 → `[]`, sem derrubar o resto (mesma tolerância
    // de `nextMonthProjection`). Presente mas corrompida ainda invalida, como as outras listas.
    const upcomingReceivables =
      parsed.upcomingReceivables === undefined ? [] : parseList(parsed.upcomingReceivables, parseReceivable);
    if (!spending || !commitments || !recentTransactions || !upcomingReceivables || nextMonthProjection === undefined) {
      return readMiniCache(workspaceId);
    }

    return {
      totalBalanceCents: parsed.totalBalanceCents,
      committedCents: parsed.committedCents,
      committedCaption: parsed.committedCaption,
      spendingVariationPct: parsed.spendingVariationPct as number | null,
      spending,
      commitments,
      recentTransactions,
      nextMonthProjection,
      upcomingReceivables
    };
  } catch {
    return null;
  }
}

export function saveCachedDashboardView(workspaceId: string | undefined | null, view: CachedDashboardView) {
  if (!canUseStorage() || !workspaceId) {
    return;
  }

  try {
    window.localStorage.setItem(CACHE_KEY_PREFIX + workspaceId, JSON.stringify(view));
  } catch {
    // Cache completo não coube (QuotaExceededError, comum em storage cheio ou modo
    // privado). Tenta salvar pelo menos os números e legendas — ~150 bytes, cabe em
    // qualquer lugar e já evita o flash de "—" no boot.
    try {
      const mini = {
        totalBalanceCents: view.totalBalanceCents,
        committedCents: view.committedCents,
        committedCaption: view.committedCaption,
        spendingVariationPct: view.spendingVariationPct,
        nextMonthProjection: view.nextMonthProjection
      };
      window.localStorage.setItem(CACHE_KEY_PREFIX + workspaceId + '.mini', JSON.stringify(mini));
    } catch { /* sem recuperação possível */ }
  }
}
