import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const projectRoot = process.cwd();
const srcRoot = join(projectRoot, 'src');
const allowedFiles = new Set([
  join(srcRoot, 'styles', 'themes.css'),
  // Sanctioned color-data registry: persisted category/goal palette + on-accent foreground.
  join(srcRoot, 'theme', 'palette.ts')
]);
// Marketing/art zone: the public landing is a decorative surface (3D, gradients, mockups)
// and is exempt from the central-registry rule. The actual app UI stays covered.
const allowedDirs = [join(srcRoot, 'landing')];
const colorPattern = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\()/;

function readSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSourceFiles(path);
    }

    return /\.(ts|tsx|css)$/.test(entry) ? [path] : [];
  });
}

describe('central color registry', () => {
  it('keeps literal interface colors out of core components', () => {
    const offenders = readSourceFiles(srcRoot).filter((file) => {
      if (allowedFiles.has(file) || allowedDirs.some((dir) => file.startsWith(dir + sep))) {
        return false;
      }

      return colorPattern.test(readFileSync(file, 'utf8'));
    });

    expect(offenders.map((file) => relative(projectRoot, file))).toEqual([]);
  });
});
