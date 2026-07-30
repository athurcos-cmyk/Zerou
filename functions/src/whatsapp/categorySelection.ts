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

  return rows
    .filter((row) => !parentIds.has(row.id))
    .map((row) => ({ id: row.id, name: row.name, type: row.type }));
}
