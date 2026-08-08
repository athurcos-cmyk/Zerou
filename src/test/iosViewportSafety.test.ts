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
function ruleBody(css: string, selector: string, mustContain = ''): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Todas as regras com esse seletor, não só a primeira: `.mobile-nav` aparece em mais de uma
  // (uma delas dividida com `.sidebar-nav`), e sem o filtro o teste mede a regra errada.
  // `[ \t]*` no começo porque regra dentro de @media vem indentada (é o caso do `.app-main`).
  const bodies = [...withoutComments.matchAll(new RegExp(`^[ \\t]*${selector}\\s*\\{([^}]*)\\}`, 'gm'))]
    .map((match) => match[1])
    .filter((body) => body.includes(mustContain));
  if (bodies.length === 0) {
    throw new Error(`regra "${selector}"${mustContain ? ` contendo "${mustContain}"` : ''} não encontrada em global.css`);
  }
  return bodies[0];
}

describe('viewport no iOS', () => {
  // Nem o root nem o body podem declarar overflow-x. Qualquer valor ali propaga pra viewport:
  // `hidden` força o overflow-y a `auto`, o body vira scroll container e o Safari do iOS descola
  // os `position: fixed` (a bottom nav congela no meio da tela); `clip` conserta isso mas deixa
  // uma caixa de corte na viewport, e aí o PWA do Android pinta de preto a faixa da navegação
  // por gestos. Os dois erros aconteceram em 08/08/2026, com poucas horas de diferença.
  // Quem corta o transbordo é o contêiner de cada zona (`.app-main`, `.lp`), não a página.
  it.each(['html', 'body'])('%s não declara overflow-x — nem hidden, nem clip', (selector) => {
    expect(ruleBody(globalCss, selector)).not.toMatch(/overflow-x\s*:/);
  });

  it('o corte do transbordo mora no contêiner da zona, não no body', () => {
    expect(ruleBody(globalCss, '\\.app-main', 'overflow-x')).toMatch(/overflow-x:\s*clip/);
  });

  // `viewport-fit=cover` é o que faz o PWA instalado desenhar até as bordas físicas. Quem pede
  // isso assume a conta dos dois lados: sem inset no topo, o conteúdo sobe por baixo do
  // relógio/bateria. O rodapé já era tratado desde sempre; o topo é que faltava.
  it('trata o entalhe de cima se pediu viewport-fit=cover', () => {
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(globalCss).toMatch(/env\(safe-area-inset-top\)/);
  });

  // O entalhe de baixo tem que sair do inset ESTÁTICO. O Chrome 135+ do Android zera o
  // `safe-area-inset-bottom` enquanto a faixa de gestos está visível, então quem reserva espaço
  // ou estende fundo com o valor dinâmico soma zero justo na hora que precisava valer algo —
  // e sobra a tira preta embaixo da nav no PWA. Ver o comentário do :root em global.css.
  it('a folga de baixo sai do inset estático, não do dinâmico', () => {
    const nav = ruleBody(globalCss, '\\.mobile-nav', 'position: fixed');
    expect(nav).toMatch(/padding:[^;]*var\(--safe-area-max-inset-bottom\)/);
    expect(nav).not.toMatch(/padding:[^;]*env\(safe-area-inset-bottom/);
    expect(globalCss).toMatch(/--bottom-nav-space:[^;]*var\(--safe-area-max-inset-bottom\)/);
  });

  // A cadeia de fallback é o que faz a mesma regra servir Android, iOS e desktop. Sem o segundo
  // degrau (`safe-area-inset-bottom`), o iPhone — que não conhece o `max` — cairia direto no 0px
  // e o entalhe de baixo voltaria a ser ignorado lá.
  it('o inset estático cai pro inset do iOS antes de cair pra zero', () => {
    expect(globalCss).toMatch(
      /--safe-area-max-inset-bottom:\s*env\(\s*safe-area-max-inset-bottom\s*,\s*env\(\s*safe-area-inset-bottom\s*,\s*0px\s*\)\s*\)/
    );
  });
});
