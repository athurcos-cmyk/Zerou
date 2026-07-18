import type { TransactionType } from '../types/contracts';

// v2 do antigo `dashboardSummaryCache` (só os 3 números): agora guarda também as listas
// visíveis do Dashboard (gastos por categoria, próximos compromissos, transações recentes)
// pra pintá-las na hora no boot, em vez de deixar as seções em branco por 1-2s enquanto o
// Firestore lê o IndexedDB de volta. É só um acelerador de exibição — a fonte real continua
// sendo o cache do Firestore + os listeners. A chave nova (`dashboardView.v1`) ignora
// entradas do formato antigo sozinha (validação retorna null), sem migração.
const CACHE_KEY_PREFIX = 'zerou.dashboardView.v1.';

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

export interface CachedDashboardView {
  totalBalanceCents: number;
  freeToSpendCents: number;
  committedCents: number;
  /** Legendas já resolvidas do Disponível/Comprometido ("Livre agora.", "≈ R$ X/dia até…",
   * "Considerando…") e a variação % de gastos — pré-computadas na gravação pra não piscarem
   * "Carregando…"/"Contas e fatura." nem trocarem de texto durante o boot. */
  availableCaption: string;
  committedCaption: string;
  spendingVariationPct: number | null;
  spending: CachedSpendingRow[];
  commitments: CachedCommitment[];
  recentTransactions: CachedRecentTransaction[];
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

export function readCachedDashboardView(workspaceId?: string | null): CachedDashboardView | null {
  if (!canUseStorage() || !workspaceId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + workspaceId);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !isFiniteNumber(parsed.totalBalanceCents) ||
      !isFiniteNumber(parsed.freeToSpendCents) ||
      !isFiniteNumber(parsed.committedCents) ||
      typeof parsed.availableCaption !== 'string' ||
      typeof parsed.committedCaption !== 'string' ||
      (parsed.spendingVariationPct !== null && !isFiniteNumber(parsed.spendingVariationPct))
    ) {
      return null;
    }

    const spending = parseList(parsed.spending, parseSpendingRow);
    const commitments = parseList(parsed.commitments, parseCommitment);
    const recentTransactions = parseList(parsed.recentTransactions, parseRecentTransaction);
    if (!spending || !commitments || !recentTransactions) {
      return null;
    }

    return {
      totalBalanceCents: parsed.totalBalanceCents,
      freeToSpendCents: parsed.freeToSpendCents,
      committedCents: parsed.committedCents,
      availableCaption: parsed.availableCaption,
      committedCaption: parsed.committedCaption,
      spendingVariationPct: parsed.spendingVariationPct as number | null,
      spending,
      commitments,
      recentTransactions
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
    // Cache local é apenas um acelerador de exibição. Se falhar, o cálculo real continua sendo a fonte.
  }
}
