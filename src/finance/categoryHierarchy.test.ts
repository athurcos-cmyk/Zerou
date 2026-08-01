import { describe, expect, it } from 'vitest';
import {
  canBeParentOf,
  parentCategoryIds,
  canDeleteCategory,
  childrenOf,
  isParentCategory,
  isSubcategory,
  parentCandidates,
  selectableCategories
} from './categoryHierarchy';

type Cat = { id: string; parentCategoryId?: string; isActive?: boolean };

const cat = (id: string, parentCategoryId?: string, isActive = true): Cat => ({ id, parentCategoryId, isActive });

/**
 *  Casa (pai)              Transporte (folha)      Lazer (pai)
 *   ├── Energia             (sem filhas)            └── Cinema
 *   └── Água
 */
const arvore: Cat[] = [
  cat('casa'),
  cat('energia', 'casa'),
  cat('agua', 'casa'),
  cat('transporte'),
  cat('lazer'),
  cat('cinema', 'lazer')
];

describe('isParentCategory / childrenOf', () => {
  it('reconhece quem agrupa outras', () => {
    expect(isParentCategory('casa', arvore)).toBe(true);
    expect(isParentCategory('transporte', arvore)).toBe(false);
    expect(isParentCategory('energia', arvore)).toBe(false);
  });

  it('lista as filhas de um pai', () => {
    expect(childrenOf('casa', arvore).map((c) => c.id)).toEqual(['energia', 'agua']);
    expect(childrenOf('transporte', arvore)).toEqual([]);
  });

  // Filha excluída não pode continuar segurando o pai: senão um pai cujas filhas todas foram
  // apagadas ficaria não-selecionável pra sempre, sem nada visível explicando por quê.
  it('ignora filha excluída', () => {
    const comFilhaExcluida = [cat('casa'), cat('energia', 'casa', false)];

    expect(isParentCategory('casa', comFilhaExcluida)).toBe(false);
    expect(childrenOf('casa', comFilhaExcluida)).toEqual([]);
  });
});

describe('isSubcategory', () => {
  it('distingue folha de raiz de subcategoria', () => {
    expect(isSubcategory(cat('energia', 'casa'))).toBe(true);
    expect(isSubcategory(cat('transporte'))).toBe(false);
  });
});

describe('selectableCategories', () => {
  // A regra central: pai é só agrupamento, não recebe lançamento.
  it('exclui categorias-pai e mantém as folhas', () => {
    expect(selectableCategories(arvore).map((c) => c.id)).toEqual(['energia', 'agua', 'transporte', 'cinema']);
  });

  it('exclui categoria inativa', () => {
    const comInativa = [cat('transporte'), cat('antiga', undefined, false)];

    expect(selectableCategories(comInativa).map((c) => c.id)).toEqual(['transporte']);
  });

  it('devolve tudo quando não existe hierarquia nenhuma', () => {
    const planas = [cat('a'), cat('b'), cat('c')];

    expect(selectableCategories(planas)).toHaveLength(3);
  });

  // Categoria sintética de uma conta de investimento (`linkedInvestmentAccountId` setado) nunca
  // pode ser oferecida como opção de lançamento comum — bug real de 01/08/2026: `CategoryField`
  // reimplementava esta exclusão na mão e nunca ganhou este campo, deixando "Investimento: XP"
  // selecionável em Nova Transação.
  it('exclui categoria vinculada a uma conta de investimento', () => {
    const comInvestimento = [
      cat('transporte'),
      { id: 'inv-xp', isActive: true, linkedInvestmentAccountId: 'acct-xp' }
    ];

    expect(selectableCategories(comInvestimento).map((c) => c.id)).toEqual(['transporte']);
  });
});

describe('canBeParentOf — trava de 1 nível', () => {
  it('nada é pai de si mesmo', () => {
    expect(canBeParentOf('casa', 'casa', arvore)).toBe(false);
  });

  // Sem isto, Casa → Energia → Geladeira: a agregação viraria recursão.
  it('quem já é subcategoria não pode ser pai', () => {
    expect(canBeParentOf('energia', 'transporte', arvore)).toBe(false);
  });

  // O caso que passa desapercebido: mover Casa (que TEM filhas) pra dentro de Lazer faria
  // Energia e Água virarem netas.
  it('quem já tem filhas não pode virar subcategoria', () => {
    expect(canBeParentOf('lazer', 'casa', arvore)).toBe(false);
  });

  it('permite uma raiz sem filhas ser pai de uma folha', () => {
    expect(canBeParentOf('transporte', 'cinema', arvore)).toBe(true);
  });

  it('permite pai existente receber mais uma filha', () => {
    expect(canBeParentOf('casa', 'cinema', arvore)).toBe(true);
  });

  it('recusa categoria inexistente ou inativa como pai', () => {
    expect(canBeParentOf('fantasma', 'cinema', arvore)).toBe(false);
    expect(canBeParentOf('morta', 'cinema', [...arvore, cat('morta', undefined, false)])).toBe(false);
  });
});

describe('parentCandidates', () => {
  it('ao criar categoria nova, oferece só raízes que não são subcategoria', () => {
    expect(parentCandidates(arvore, null).map((c) => c.id)).toEqual(['casa', 'transporte', 'lazer']);
  });

  it('ao editar uma folha, não oferece ela mesma', () => {
    expect(parentCandidates(arvore, 'cinema').map((c) => c.id)).toEqual(['casa', 'transporte', 'lazer']);
  });

  it('ao editar uma categoria que TEM filhas, não oferece pai nenhum', () => {
    expect(parentCandidates(arvore, 'casa')).toEqual([]);
  });
});

describe('canDeleteCategory', () => {
  it('bloqueia excluir pai com filhas e diz quantas', () => {
    expect(canDeleteCategory('casa', arvore)).toEqual({ ok: false, blockedByChildren: 2 });
  });

  it('permite excluir folha', () => {
    expect(canDeleteCategory('transporte', arvore)).toEqual({ ok: true, blockedByChildren: 0 });
    expect(canDeleteCategory('energia', arvore)).toEqual({ ok: true, blockedByChildren: 0 });
  });

  it('permite excluir pai depois de as filhas saírem', () => {
    const semFilhas = [cat('casa'), cat('energia', 'casa', false), cat('agua', 'casa', false)];

    expect(canDeleteCategory('casa', semFilhas)).toEqual({ ok: true, blockedByChildren: 0 });
  });
});

/**
 * Regressão do bug achado em produção pelo dono (29/07/2026): o seletor filtrava por TIPO antes
 * de perguntar quem era pai. Com pai `both` e filha `expense`, a filha sumia do recorte de uma
 * transação de receita, o pai deixava de parecer pai e voltava a ser SELECIONÁVEL — furando a
 * regra [D10] ("pai é só agrupamento") justamente onde ela mais importa.
 */
describe('parentCategoryIds — parentesco se decide na lista COMPLETA', () => {
  type ComTipo = Cat & { type: 'income' | 'expense' | 'both' };

  const paiBoth: ComTipo = { id: 'casa', type: 'both', isActive: true };
  const filhaExpense: ComTipo = { id: 'energia', parentCategoryId: 'casa', type: 'expense', isActive: true };
  const todas = [paiBoth, filhaExpense];

  it('reconhece o pai mesmo quando a filha tem tipo diferente', () => {
    expect(parentCategoryIds(todas).has('casa')).toBe(true);
  });

  it('CRÍTICO: pai NÃO volta a ser selecionável num recorte por tipo que esconde a filha', () => {
    // O recorte de uma transação de RECEITA não inclui a filha (expense).
    const recorteReceita = todas.filter((c) => c.type === 'income' || c.type === 'both');
    const paiIds = parentCategoryIds(todas); // <- lista COMPLETA, não o recorte

    expect(recorteReceita.map((c) => c.id)).toContain('casa'); // o pai está no recorte...
    expect(recorteReceita.filter((c) => !paiIds.has(c.id)).map((c) => c.id)).toEqual([]); // ...mas não é selecionável
  });

  it('o jeito ERRADO (calcular no recorte) deixaria o pai selecionável — este é o bug', () => {
    const recorteReceita = todas.filter((c) => c.type === 'income' || c.type === 'both');
    const paiIdsErrado = parentCategoryIds(recorteReceita);

    expect(paiIdsErrado.has('casa')).toBe(false);
  });

  it('ignora categoria inativa ao decidir parentesco', () => {
    expect(parentCategoryIds([cat('casa'), cat('energia', 'casa', false)]).has('casa')).toBe(false);
  });
});
