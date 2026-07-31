import { describe, expect, it } from 'vitest';
import { parentCandidateRows, selectableCategoryOptions, type CategoryRow } from './categorySelection.js';

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

    expect(energia).toEqual({ id: 'energia', name: 'Energia', type: 'both', parentName: 'Casa' });
  });

  it('lista vazia nao quebra', () => {
    expect(selectableCategoryOptions([])).toEqual([]);
  });
});

describe('parentCandidateRows', () => {
  it('oferece as raizes como pai — inclusive quem ja e pai de outra', () => {
    expect(parentCandidateRows(arvore).map((c) => c.id)).toEqual(['casa', 'transporte']);
  });

  // Trava de 1 nivel: subcategoria virando pai criaria neta.
  it('nunca oferece uma subcategoria como pai', () => {
    const ids = parentCandidateRows(arvore).map((c) => c.id);
    expect(ids).not.toContain('energia');
    expect(ids).not.toContain('agua');
  });

  it('nao oferece a propria categoria como pai dela mesma', () => {
    expect(parentCandidateRows(arvore, 'transporte').map((c) => c.id)).toEqual(['casa']);
  });

  it('workspace so com subcategorias nao oferece pai nenhum', () => {
    expect(parentCandidateRows([row('energia', 'casa')])).toEqual([]);
  });

  it('lista vazia nao quebra', () => {
    expect(parentCandidateRows([])).toEqual([]);
  });
});

/**
 * Hierarquia visivel pro modelo: a lista que vai no prompt mostra "Casa > Agua". Sem isso, duas
 * subcategorias de mesmo nome em ramos diferentes (legitimo desde as subcategorias) ficam
 * indistinguiveis.
 */
describe('selectableCategoryOptions — nome do pai junto', () => {
  const doisRamos: CategoryRow[] = [
    { id: 'casa', name: 'Casa', type: 'expense' },
    { id: 'agua_casa', name: 'Água', type: 'expense', parentCategoryId: 'casa' },
    { id: 'mercado', name: 'Mercado', type: 'expense' },
    { id: 'agua_mercado', name: 'Água', type: 'expense', parentCategoryId: 'mercado' },
  ];

  it('marca cada subcategoria com o nome da principal', () => {
    const options = selectableCategoryOptions(doisRamos);

    expect(options.find((o) => o.id === 'agua_casa')?.parentName).toBe('Casa');
    expect(options.find((o) => o.id === 'agua_mercado')?.parentName).toBe('Mercado');
  });

  it('categoria principal nao ganha parentName', () => {
    const [transporte] = selectableCategoryOptions([row('transporte')]);

    expect(transporte.parentName).toBeUndefined();
  });

  it('pai que sumiu do mapa nao inventa nome', () => {
    const [orfa] = selectableCategoryOptions([row('energia', 'casa')]);

    expect(orfa.parentName).toBeUndefined();
  });
});
