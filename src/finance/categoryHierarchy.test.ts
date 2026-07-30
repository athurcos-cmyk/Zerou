import { describe, expect, it } from 'vitest';
import {
  canBeParentOf,
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
