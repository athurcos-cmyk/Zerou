import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O `script-src` do CSP (vercel.json) libera o script inline do index.html por HASH. Hash é
 * calculado sobre BYTES, então qualquer edição no script — inclusive uma que não muda uma
 * letra sequer, como CRLF virar LF — invalida o hash e o navegador BLOQUEIA o script.
 *
 * Incidente real (07/08/2026): o hash em vercel.json foi gerado a partir da cópia de trabalho
 * no Windows (CRLF, 1242 bytes). O git guarda o arquivo em LF (1219 bytes) e é isso que a
 * Vercel serve. Os dois nunca bateram: o bootstrap de tema ficou bloqueado em produção desde
 * o commit que introduziu o CSP, e nada no build, no typecheck ou nos testes acusou — o único
 * sinal era um erro no console que ninguém estava olhando.
 *
 * Este teste normaliza para LF de propósito: é assim que o arquivo sai do git e chega na
 * Vercel, independente do sistema operacional de quem editou.
 */
const projectRoot = process.cwd();
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

function inlineScriptHashes(html: string) {
  return [...html.matchAll(INLINE_SCRIPT)].map((match) => {
    const asShipped = match[1].replace(/\r\n/g, '\n');
    return `sha256-${createHash('sha256').update(asShipped, 'utf8').digest('base64')}`;
  });
}

describe('CSP inline script hash', () => {
  const html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  const csp: string = JSON.parse(readFileSync(join(projectRoot, 'vercel.json'), 'utf8'))
    .headers.flatMap((entry: { headers: { key: string; value: string }[] }) => entry.headers)
    .find((header: { key: string }) => header.key === 'Content-Security-Policy').value;

  it('libera no script-src todo script inline do index.html', () => {
    const hashes = inlineScriptHashes(html);

    expect(hashes.length).toBeGreaterThan(0);
    expect(hashes.filter((hash) => !csp.includes(hash))).toEqual([]);
  });

  it('não deixa unsafe-inline voltar pro script-src às escondidas', () => {
    const scriptSrc = csp.split(';').find((directive) => directive.trim().startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
