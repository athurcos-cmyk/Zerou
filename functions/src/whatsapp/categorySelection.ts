import type { CategoryOption } from './interpretMessage.js';

/** Categoria como ela vem do Firestore, reduzida ao que esta regra precisa. */
export interface CategoryRow {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  parentCategoryId?: string;
}

/**
 * As categorias que a Vic pode oferecer e gravar: as **folhas**.
 *
 * Categoria que ganhou subcategoria vira agrupamento e para de receber lancamento — decisao do
 * dono (`[D10]` em docs/planning/SUBCATEGORIAS.md). O app aplica isso em
 * `selectableCategories` (src/finance/categoryHierarchy.ts); aqui e uma copia, porque Cloud
 * Functions nao importa `src/`.
 *
 * Se os dois discordarem, da pra gravar por mensagem numa categoria que o app nao deixa
 * escolher — e o gasto some dentro da linha "· geral" do pai sem ninguem ter pedido.
 *
 * **Passe so as categorias ATIVAS**: filha excluida nao pode segurar o pai como agrupamento,
 * senao um pai que perdeu todas as filhas ficaria inalcancavel pra sempre.
 */
export function selectableCategoryOptions(rows: readonly CategoryRow[]): CategoryOption[] {
  const parentIds = new Set(
    rows.map((row) => row.parentCategoryId).filter((id): id is string => Boolean(id)),
  );
  const nameById = new Map(rows.map((row) => [row.id, row.name]));

  return rows
    .filter((row) => !parentIds.has(row.id))
    .map((row) => {
      // O nome do pai vai junto pro modelo (a lista mostra "Casa > Agua"). Sem isso, duas
      // subcategorias com o mesmo nome em ramos diferentes — "Agua" em Casa e em Mercado, que a
      // hierarquia torna LEGITIMO — ficam indistinguiveis, e "paguei a agua de casa" viraria
      // sorteio entre as duas.
      const parentName = row.parentCategoryId ? nameById.get(row.parentCategoryId) : undefined;
      return { id: row.id, name: row.name, type: row.type, ...(parentName ? { parentName } : {}) };
    });
}

/**
 * Quem pode virar pai de uma categoria: as **raizes** (quem ja e subcategoria nao pode, senao
 * viraria neta — a hierarquia e travada em 1 nivel, `[D2]`).
 *
 * Espelha `parentCandidates` do app (`src/finance/categoryHierarchy.ts`) no caso de uma categoria
 * NOVA: a trava "quem ja tem filhas nao pode virar subcategoria" nao se aplica, porque quem
 * acabou de nascer nao tem filha. `excludeId` tira a propria categoria da lista (nada e pai de si
 * mesmo).
 *
 * **Passe so as categorias ATIVAS.**
 */
export function parentCandidateRows<T extends CategoryRow>(
  rows: readonly T[],
  excludeId?: string,
): T[] {
  return rows.filter((row) => !row.parentCategoryId && row.id !== excludeId);
}
