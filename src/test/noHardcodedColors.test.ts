import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const srcRoot = join(projectRoot, 'src');
const allowedFiles = new Set([join(srcRoot, 'styles', 'themes.css')]);
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
      if (allowedFiles.has(file)) {
        return false;
      }

      return colorPattern.test(readFileSync(file, 'utf8'));
    });

    expect(offenders.map((file) => relative(projectRoot, file))).toEqual([]);
  });
});
