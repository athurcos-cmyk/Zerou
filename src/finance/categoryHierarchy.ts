import type { Category } from '../types/contracts';

/**
 * Regras da hierarquia de categorias — tudo função pura, sem Firestore.
 *
 * ```
 *  Casa  (pai — NÃO selecionável, é só agrupamento)
 *   ├── Energia   (folha — selecionável)
 *   ├── Água      (folha — selecionável)
 *   └── Casa·geral (pseudo-linha: lançamentos feitos em Casa ANTES dela virar pai)
 *
 *  Transporte  (sem filhas — selecionável, é uma folha)
 * ```
 *
 * **Profundidade travada em 1 nível** (decisão do dono): subcategoria não pode ter
 * subcategoria. Sem essa trava a agregação vira recursão e um ciclo (`A→B→A`) trava a tela.
 * As travas são client-side: `firestore.rules` não consegue contar filhas sem uma query.
 */

type CategoryLike = Pick<Category, 'id' | 'parentCategoryId'> & Partial<Pick<Category, 'isActive'>>;

/** Só categorias que ainda existem contam como filha — excluída não segura o pai. */
function activeChildren<T extends CategoryLike>(categoryId: string, all: readonly T[]): T[] {
  return all.filter((cat) => cat.parentCategoryId === categoryId && cat.isActive !== false);
}

/** Filhas de uma categoria, na ordem em que vieram. */
export function childrenOf<T extends CategoryLike>(categoryId: string, all: readonly T[]): T[] {
  return activeChildren(categoryId, all);
}

/** `true` se a categoria agrupa outras — e portanto **deixa de ser selecionável**. */
export function isParentCategory(categoryId: string, all: readonly CategoryLike[]): boolean {
  return activeChildren(categoryId, all).length > 0;
}

/** `true` se a categoria é subcategoria de alguém. */
export function isSubcategory(category: CategoryLike): boolean {
  return Boolean(category.parentCategoryId);
}

/**
 * As categorias que podem receber um lançamento: as folhas.
 *
 * Exclui quem tem filhas (virou agrupamento) e quem está inativa. É isto que o seletor mostra
 * e o que a Vic no WhatsApp precisa espelhar — se os dois discordarem, dá pra gravar por
 * mensagem numa categoria que o app não deixa escolher.
 */
export function selectableCategories<T extends CategoryLike>(all: readonly T[]): T[] {
  return all.filter((cat) => cat.isActive !== false && !isParentCategory(cat.id, all));
}

/**
 * `true` se `candidateId` pode ser pai de `targetId`.
 *
 * Três travas, todas necessárias:
 * 1. **Auto-referência**: nada é pai de si mesmo.
 * 2. **1 nível (candidato)**: quem já é subcategoria não pode ser pai — senão vira neta.
 * 3. **1 nível (alvo)**: quem já tem filhas não pode virar subcategoria — senão as filhas dela
 *    viram netas. Este é o caso que passa desapercebido.
 */
export function canBeParentOf(
  candidateId: string,
  targetId: string | null,
  all: readonly CategoryLike[]
): boolean {
  if (candidateId === targetId) return false;

  const candidate = all.find((cat) => cat.id === candidateId);
  if (!candidate || candidate.isActive === false) return false;
  if (isSubcategory(candidate)) return false;

  if (targetId && isParentCategory(targetId, all)) return false;

  return true;
}

/** Candidatos a pai para um formulário. `targetId` null = criando categoria nova. */
export function parentCandidates<T extends CategoryLike>(
  all: readonly T[],
  targetId: string | null
): T[] {
  return all.filter((cat) => canBeParentOf(cat.id, targetId, all));
}

export interface DeleteCheck {
  ok: boolean;
  /** Quantas filhas seguram a exclusão (0 quando `ok`). */
  blockedByChildren: number;
}

/**
 * Excluir um pai com filhas é **bloqueado** (decisão do dono): as filhas ficariam apontando pra
 * um pai que não existe e perderiam a cor herdada, voltando pro cinza, sem a pessoa entender
 * por quê. O app manda excluir ou mover as filhas primeiro.
 */
export function canDeleteCategory(categoryId: string, all: readonly CategoryLike[]): DeleteCheck {
  const children = activeChildren(categoryId, all).length;
  return { ok: children === 0, blockedByChildren: children };
}
