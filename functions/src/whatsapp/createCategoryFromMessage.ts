import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { categoryColors, categoryIconKeys, defaultCategoryColor } from './categoryPalette.js';

/**
 * Cria categoria via Admin SDK com o MESMO payload que `financeService.createCategory`
 * gera no client. Admin SDK ignora firestore.rules — a responsabilidade de gerar o
 * payload correto é 100% desta função.
 *
 * Mantenha em sincronia com `src/finance/financeService.ts:createCategory()`.
 */

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export interface CreateCategoryFromMessageInput {
  workspaceId: string;
  userId: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon?: string | null;
  /**
   * Categoria principal que vai receber esta como subcategoria. Quando presente, a filha **herda
   * a cor e o tipo** do pai — mesma regra do app (`CategoryForm`/`createCategory`), onde a filha
   * de tipo divergente já causou um bug real (pai voltava a ser selecionável).
   */
  parent?: { id: string; color?: string | null; type: 'income' | 'expense' | 'both' } | null;
}

export interface CreatedCategory {
  id: string;
  name: string;
  created: boolean;
  /**
   * `true` quando a categoria que já existia com esse nome virou **agrupamento** (tem
   * subcategoria ativa). Quem chama **não pode lançar nela** — é a regra `[D10]`.
   *
   * Sem esta flag existia um furo real: o filtro de categorias-pai tira o pai da lista que vai
   * pro modelo, mas quem pede "coloca na categoria Casa" cai por OUTRO caminho — o modelo não
   * acha "Casa" na lista, devolve `newCategoryName: "Casa"`, e esta função, ao encontrar a Casa
   * existente pelo nome, devolvia o id dela. O lançamento ia parar no pai pela porta dos fundos.
   */
  isGroup: boolean;
}

export async function createCategoryFromMessage(
  input: CreateCategoryFromMessageInput,
): Promise<CreatedCategory> {
  const db = getFirestore();
  const name = input.name.trim().slice(0, 80);

  const activeSnap = await db
    .collection(`workspaces/${input.workspaceId}/categories`)
    .where('isActive', '==', true)
    .get();

  const existing = activeSnap.docs.find(
    (d) => (d.data().name as string)?.trim().toLowerCase() === name.toLowerCase(),
  );

  if (existing) {
    const isGroup = activeSnap.docs.some((d) => d.data().parentCategoryId === existing.id);
    return { id: existing.id, name: existing.data().name as string, created: false, isGroup };
  }

  const icon = input.icon && categoryIconKeys.includes(input.icon) ? input.icon : 'sliders';
  const color = input.parent
    ? (input.parent.color || defaultCategoryColor)
    : (categoryColors[activeSnap.size % categoryColors.length] ?? defaultCategoryColor);

  const id = createId('cat');
  const now = FieldValue.serverTimestamp();

  await db.doc(`workspaces/${input.workspaceId}/categories/${id}`).set({
    id,
    workspaceId: input.workspaceId,
    name,
    type: input.parent ? input.parent.type : input.type,
    icon,
    color,
    // `parentCategoryId` só entra quando existe — categoria principal não grava o campo
    // (é o que mantém "zero migração": documento sem o campo continua sendo o que sempre foi).
    ...(input.parent ? { parentCategoryId: input.parent.id } : {}),
    isDefault: false,
    isActive: true,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });

  // Recém-criada nunca tem filha — então nunca é agrupamento.
  return { id, name, created: true, isGroup: false };
}

/**
 * Move uma categoria recém-criada pra dentro de uma principal — o "sim" da oferta que a Vic faz
 * depois de criar ("quer ela dentro de alguma?"). Herda cor e tipo, igual à criação direta.
 *
 * Não valida a hierarquia: quem chama já escolheu o pai de uma lista montada por
 * `parentCandidateRows`, que é onde a trava de 1 nível mora.
 */
export async function moveCategoryUnderParent(input: {
  workspaceId: string;
  categoryId: string;
  parent: { id: string; color?: string | null; type: 'income' | 'expense' | 'both' };
}): Promise<void> {
  await getFirestore().doc(`workspaces/${input.workspaceId}/categories/${input.categoryId}`).update({
    parentCategoryId: input.parent.id,
    color: input.parent.color || defaultCategoryColor,
    type: input.parent.type,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
