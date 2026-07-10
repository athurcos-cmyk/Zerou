import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import * as simpleIcons from 'simple-icons';

/**
 * Gera `public/service-logos/*.svg` a partir do `simple-icons`.
 *
 * Só entram marcas que o pacote realmente publica. Prime Video, Disney+, Wellhub
 * (Gympass), Xbox, Microsoft 365, Adobe, Canva, ChatGPT e Globoplay **não estão lá** —
 * o `DISCLAIMER.md` do simple-icons tem um processo formal de remoção a pedido da marca,
 * e a ausência se concentra justamente nas empresas de política de marca mais rígida.
 * Essas caem no tile de iniciais do `ServiceMark`, igual aos bancos sem SVG.
 *
 * O catálogo de serviços vive em `src/finance/subscriptionServices.ts`; o `id` daqui é o
 * `id` de lá, e o `logoPath` aponta pro arquivo gerado.
 */

const outputDir = new URL('../public/service-logos/', import.meta.url);
const packageJsonUrl = new URL('../node_modules/simple-icons/package.json', import.meta.url);

// id no catálogo -> slug no simple-icons
const logos = [
  ['netflix', 'netflix'],
  ['max', 'hbomax'],
  ['paramount-plus', 'paramountplus'],
  ['apple-tv', 'appletv'],
  ['crunchyroll', 'crunchyroll'],
  ['youtube-premium', 'youtube'],
  ['spotify', 'spotify'],
  ['youtube-music', 'youtubemusic'],
  ['apple-music', 'applemusic'],
  ['deezer', 'deezer'],
  ['tidal', 'tidal'],
  ['playstation-plus', 'playstation'],
  ['steam', 'steam'],
  ['twitch', 'twitch'],
  ['ifood', 'ifood'],
  ['uber-eats', 'ubereats'],
  ['uber-one', 'uber'],
  ['strava', 'strava'],
  ['icloud', 'icloud'],
  ['dropbox', 'dropbox'],
  ['notion', 'notion'],
  ['claude', 'claude'],
  ['duolingo', 'duolingo'],
  ['coursera', 'coursera'],
  ['udemy', 'udemy'],
  ['audible', 'audible']
];

const iconsBySlug = new Map(
  Object.values(simpleIcons)
    .filter((icon) => icon && typeof icon === 'object' && 'slug' in icon)
    .map((icon) => [icon.slug, icon])
);

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderSvg(id, icon) {
  const titleId = `${id}-title`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${titleId}" viewBox="0 0 24 24">`,
    `<title id="${titleId}">${escapeXml(icon.title)}</title>`,
    `<path fill="#${icon.hex}" d="${icon.path}"/>`,
    '</svg>',
    ''
  ].join('\n');
}

function renderSources(version, resolved) {
  const rows = resolved
    .map(([id, icon]) => `| ${id}.svg | ${icon.title} | \`${icon.slug}\` | #${icon.hex} | ${icon.source} |`)
    .join('\n');

  return [
    '# Service Logo Sources',
    '',
    `Gerado por \`npm run generate:service-logos\` a partir de \`simple-icons@${version}\`.`,
    '**Não editar à mão** — rode o script.',
    '',
    'O pacote `simple-icons` é CC0, mas isso **não** se estende às marcas: nenhum destes ícones',
    'traz dado de licença própria, e o `DISCLAIMER.md` do pacote pede que cada projeto busque',
    'a permissão relevante. Aqui os logos servem só para **identificar** o serviço que a própria',
    'pessoa escolheu dentro do app (uso nominativo). Nomes e logos seguem sendo marcas de seus donos.',
    '',
    'Marcas ausentes do simple-icons (caem no tile de iniciais do `ServiceMark`, sem SVG):',
    'Prime Video, Disney+, Wellhub/Gympass, Smart Fit, Xbox Game Pass, Nintendo Switch Online,',
    'Microsoft 365, Adobe, Canva, ChatGPT, Google One, Kindle, Globoplay, Rappi, 99, Claro, Vivo, TIM, Oi, Sky.',
    '',
    '| Arquivo | Marca | Slug | Cor | Fonte declarada pelo simple-icons |',
    '|---|---|---|---|---|',
    rows,
    ''
  ].join('\n');
}

const { version } = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
const resolved = [];
const missing = [];

for (const [id, slug] of logos) {
  const icon = iconsBySlug.get(slug);
  if (!icon) {
    missing.push(`${id} (slug "${slug}")`);
    continue;
  }
  resolved.push([id, icon]);
}

if (missing.length > 0) {
  // Falhar alto: um slug que sumiu numa atualização do simple-icons significa que a marca
  // foi removida do pacote, e o app passaria a servir um 404 silencioso no lugar do logo.
  console.error(`Slugs não encontrados em simple-icons@${version}:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });

for (const [id, icon] of resolved) {
  await writeFile(new URL(`${id}.svg`, outputDir), renderSvg(id, icon), 'utf8');
}

await writeFile(new URL('SOURCES.md', outputDir), renderSources(version, resolved), 'utf8');

console.log(`${resolved.length} logos gerados em public/service-logos/ (simple-icons@${version})`);
