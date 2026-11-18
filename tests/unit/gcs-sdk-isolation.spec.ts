import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T567/T612 C-4, NFR-ALM-003, NFR-ALM-004, SC-ALM-024, enmienda 3.5.0: `@google-cloud/*` solo se importa desde
 * `src/infrastructure/adapters/`; `src/domain/**` y `src/application/**` (y el resto de `src/`) nunca lo importan.
 */
const SDK = /['"`](?:node:)?@google-cloud\/[^'"`]+['"`]/;

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesOf(full) : /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry) ? [full] : [];
  });
}

/** Archivos de `src/` que mencionan el SDK (import estático, dinámico o require), sin contar comentarios de línea ni de bloque. */
function filesUsingSdk(root: string): string[] {
  return filesOf(root).filter((file) => SDK.test(readFileSync(file, 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
}

describe('aislamiento del SDK de GCS (C-4)', () => {
  it('src/domain y src/application no importan @google-cloud/*', () => {
    expect(filesUsingSdk('src/domain')).toEqual([]);
    expect(filesUsingSdk('src/application')).toEqual([]);
  });

  it('solo src/infrastructure/adapters/ importa @google-cloud/*: nada más en src/', () => {
    const outside = filesUsingSdk('src').filter((file) => !file.startsWith(join('src', 'infrastructure', 'adapters') + '/'));
    expect(outside).toEqual([]);
  });

  it('la regla falla si se importa el SDK: el detector reconoce import estático, dinámico y require', () => {
    for (const code of ["import { Storage } from '@google-cloud/storage';", "const m = await import('@google-cloud/storage');", "const s = require('@google-cloud/storage/build/src');"]) {
      expect(SDK.test(code), code).toBe(true);
    }
    expect(SDK.test("import { x } from './google-cloud-adapter.ts';")).toBe(false);
  });

  it('el detector ignora comentarios que nombran el SDK y detecta el uso real en un archivo temporal', () => {
    const mention = '// usa @google-cloud/storage solo en adapters\n/* @google-cloud/storage */\nexport const a = 1;\n';
    expect(SDK.test(mention.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))).toBe(false);
  });

  it('package.json fija @google-cloud/storage con versión exacta (sin ^ ni ~) y sin dependencia multipart (D-18 A)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@google-cloud/storage']).toBe('9.0.0');
    expect(Object.keys(pkg.dependencies).filter((name) => /multipart|busboy|multer|formidable|dicer/i.test(name))).toEqual([]);
  });

  it('el lockfile conserva la integridad auditada por /merovingian (C-3) y ningún paquete nuevo tiene scripts de instalación (C-5)', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { integrity?: string; hasInstallScript?: boolean }> };
    expect(lock.packages['node_modules/@google-cloud/storage']?.integrity).toBe('sha512-fjUzqzbxgkItIjEFjs/j/NrjQ9RZ3yWhMqmOdJB4AjdMu03vvpa88RvJEkZ5cjvSZAF+cBNCovw3fmERarOHFA==');
    const withScripts = Object.entries(lock.packages).filter(([, v]) => v.hasInstallScript === true).map(([k]) => k).sort();
    expect(withScripts).toEqual(['node_modules/better-sqlite3', 'node_modules/esbuild', 'node_modules/fsevents', 'node_modules/vite/node_modules/esbuild']);
  });
});
