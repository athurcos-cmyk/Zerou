import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { siMercadopago, siModal, siNeon, siNomad, siNubank, siPicpay, siWise } from 'simple-icons';

const outputDir = new URL('../public/bank-logos/', import.meta.url);

const logos = [
  { id: 'nubank', icon: siNubank },
  { id: 'picpay', icon: siPicpay },
  { id: 'mercado-pago', icon: siMercadopago },
  { id: 'neon', icon: siNeon },
  { id: 'modal', icon: siModal },
  { id: 'wise', icon: siWise },
  { id: 'nomad', icon: siNomad }
];

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

function renderSources() {
  const rows = logos
    .map(({ id, icon }) => `| ${id}.svg | ${icon.title} | ${icon.slug} | #${icon.hex} |`)
    .join('\n');

  return [
    '# Bank Logo Sources',
    '',
    'Generated from `simple-icons@16.23.0` with `npm run generate:bank-logos`.',
    '',
    'These SVGs are used only to identify financial institutions selected by the user inside Zerou. Brand names and logos remain trademarks of their respective owners.',
    '',
    '| File | Brand | Simple Icons slug | Brand color |',
    '|---|---|---|---|',
    rows,
    ''
  ].join('\n');
}

await mkdir(outputDir, { recursive: true });

for (const { id, icon } of logos) {
  await writeFile(new URL(`${id}.svg`, outputDir), renderSvg(id, icon), 'utf8');
}

await writeFile(new URL('SOURCES.md', outputDir), renderSources(), 'utf8');
