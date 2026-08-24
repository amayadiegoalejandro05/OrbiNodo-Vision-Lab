import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const legacyPath = resolve(sourceRoot, 'persistence/demo-operations-store.ts');
const importPattern = /(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g;

async function productionGraph(entry: string): Promise<Set<string>> {
  const visited = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const candidate = resolve(dirname(file), match[1]!);
      if (candidate.endsWith('.css')) continue;
      await visit(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
  }
  await visit(entry);
  return visited;
}

describe('persistencia del flujo productivo', () => {
  it('no alcanza el legado ni almacenamiento web desde main.ts', async () => {
    const files = await productionGraph(resolve(sourceRoot, 'main.ts'));
    expect(files.has(legacyPath)).toBe(false);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);
    }
    const legacySource = await readFile(legacyPath, 'utf8');
    expect(legacySource).toContain('localStorage');
  });
});
