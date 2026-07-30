import { describe, expect, it } from 'vitest';
import { categoryIconKeys } from '../components/categoryIcons';
import { categoryColors } from './palette';
import {
  categoryColors as mirroredColors,
  categoryIconKeys as mirroredIconKeys,
  defaultCategoryColor as mirroredDefaultColor
} from '../../functions/src/whatsapp/categoryPalette';
import { defaultCategoryColor } from './palette';

/**
 * Trava anti-drift do QUARTO ponto de sincronia das categorias.
 *
 * Cloud Functions não importa `src/` do app, então `functions/src/whatsapp/categoryPalette.ts`
 * é uma cópia manual dos ícones e cores. A Vic do WhatsApp usa essa cópia em três lugares —
 * o prompt que lista as chaves válidas (`interpretMessage`), a validação da resposta do modelo,
 * e a gravação (`createCategoryFromMessage`) — então uma cópia velha não quebra nada: só faz a
 * Vic criar categoria com o conjunto antigo, **em silêncio**.
 *
 * Foi exatamente o que aconteceu: o app foi pra 122 ícones e 24 cores em 29/07/2026 e a cópia
 * ficou em 36/12. Mesma família dos incidentes de enum descritos no `CLAUDE.md` — o TypeScript
 * não reclama porque são dois arrays de string independentes.
 */
describe('categoryPalette (espelho das Cloud Functions)', () => {
  it('tem exatamente os mesmos ícones que o app, na mesma ordem', () => {
    expect(mirroredIconKeys).toEqual(categoryIconKeys);
  });

  // A ordem importa de verdade aqui: `createCategoryFromMessage` escolhe a cor por
  // `categoryColors[qtdDeCategorias % length]`, então uma ordem diferente faria a mesma
  // categoria sair de uma cor no app e de outra pela Vic.
  it('tem exatamente as mesmas cores que o app, na mesma ordem', () => {
    expect(mirroredColors).toEqual(categoryColors);
  });

  it('tem a mesma cor padrão', () => {
    expect(mirroredDefaultColor).toBe(defaultCategoryColor);
  });
});
