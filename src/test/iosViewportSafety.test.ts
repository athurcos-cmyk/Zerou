import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Duas invariantes que só quebram no iPhone, e em silêncio: build, typecheck e todo o resto
// passam iguais. As duas vieram do print de uma usuária (iPhone 16, PWA instalado) em
// 08/08/2026 — a bottom nav congelada no meio da tela e o conteúdo por baixo da status bar.
const projectRoot = process.cwd();
const globalCss = readFileSync(join(projectRoot, 'src', 'styles', 'global.css'), 'utf8');
const indexHtml = readFileSync(join(projectRoot, 'index.html'), 'utf8');

/**
 * Corpo da primeira regra `<seletor> { ... }` de nível raiz com esse nome exato, SEM os
 * comentários — senão a asserção casa com a prosa que explica o bug em vez das declarações
 * de verdade (o comentário do `html` cita `overflow-x: hidden` justamente pra dizer por que
 * não usar).
 */
function ruleBody(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = new RegExp(`^${selector}\\s*\\{([^}]*)\\}`, 'm').exec(withoutComments);
  if (!match) throw new Error(`regra "${selector}" não encontrada em global.css`);
  return match[1];
}

describe('viewport no iOS', () => {
  // O corte do transbordo mora SÓ no body e propaga pra viewport. `hidden` está proibido nos
  // dois: força o overflow-y a computar `auto`, o body vira scroll container e o Safari do
  // iOS descola os `position: fixed` — a bottom nav congela no meio da tela.
  it('body corta o transbordo com clip, nunca com hidden', () => {
    const body = ruleBody(globalCss, 'body');
    expect(body).toMatch(/overflow-x:\s*clip/);
    expect(body).not.toMatch(/overflow-x:\s*hidden/);
  });

  // E o root não pode ter overflow-x NENHUM. `hidden` quebra o position:fixed do iOS (acima),
  // e `clip` cria caixa de corte no próprio root: o fundo da página para de pintar fora dela
  // e as barras do sistema caem na cor padrão do SO (preta no Android, branca no iPhone).
  // Deixando o root `visible`, o overflow do body propaga pra viewport e resolve os dois.
  it('html não declara overflow-x — nem hidden, nem clip', () => {
    expect(ruleBody(globalCss, 'html')).not.toMatch(/overflow-x\s*:/);
  });

  // `viewport-fit=cover` é o que faz o PWA instalado desenhar até as bordas físicas. Quem pede
  // isso assume a conta dos dois lados: sem inset no topo, o conteúdo sobe por baixo do
  // relógio/bateria. O rodapé já era tratado desde sempre; o topo é que faltava.
  it('trata o entalhe de cima se pediu viewport-fit=cover', () => {
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(globalCss).toMatch(/env\(safe-area-inset-top\)/);
  });

  it('continua tratando o entalhe de baixo', () => {
    expect(globalCss).toMatch(/env\(safe-area-inset-bottom\)/);
  });
});
