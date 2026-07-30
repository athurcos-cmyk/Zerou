import { describe, expect, it } from 'vitest';
import { selectableCategoryOptions, type CategoryRow } from './categorySelection.js';

const row = (id: string, parentCategoryId?: string): CategoryRow => ({
  id,
  name: id,
  type: 'expense',
  parentCategoryId,
});

/**
 *  Casa (pai)          Transporte (folha)
 *   ├── Energia
 *   └── Agua
 */
const arvore: CategoryRow[] = [
  row('casa'),
  row('energia', 'casa'),
  row('agua', 'casa'),
  row('transporte'),
];

describe('selectableCategoryOptions', () => {
  it('tira a categoria-pai da lista que a Vic pode gravar', () => {
    expect(selectableCategoryOptions(arvore).map((c) => c.id)).toEqual(['energia', 'agua', 'transporte']);
  });

  it('mantem categoria sem subcategoria — ninguem e obrigado a criar hierarquia', () => {
    expect(selectableCategoryOptions([row('transporte')]).map((c) => c.id)).toEqual(['transporte']);
  });

  it('devolve tudo quando nao existe hierarquia nenhuma', () => {
    expect(selectableCategoryOptions([row('a'), row('b')])).toHaveLength(2);
  });

  // O app e a Vic precisam enxergar a MESMA lista: se discordarem, da pra gravar por mensagem
  // numa categoria que o app nao deixa escolher, e o gasto some na linha "· geral" do pai.
  it('preserva id, nome e tipo de quem sobra', () => {
    const [energia] = selectableCategoryOptions([
      { id: 'energia', name: 'Energia', type: 'both', parentCategoryId: 'casa' },
      { id: 'casa', name: 'Casa', type: 'expense' },
    ]);

    expect(energia).toEqual({ id: 'energia', name: 'Energia', type: 'both' });
  });

  it('lista vazia nao quebra', () => {
    expect(selectableCategoryOptions([])).toEqual([]);
  });
});
