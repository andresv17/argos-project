#!/usr/bin/env node
/**
 * Bundle de producción del servidor (T432, REQ-CLD-001, H-03-04, D-07 = A de Neo).
 * esbuild empaqueta `src/infrastructure/http/server.ts` en JavaScript ESM (Node 22) con carga por fragmentos:
 * `better-sqlite3` queda `external` (módulo nativo; solo lo importa el fragmento de SQLite, que con
 * ARGOS_DB_DRIVER=postgres nunca se carga) y `pg-native` (opcional de `pg`) tampoco se embebe.
 * Las migraciones SQLite se copian junto al bundle. No lee variables de entorno ni incrusta secretos.
 * Uso: node scripts/build-server.mjs [--outdir <dir>]   (por defecto `dist-server`)
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--outdir');
const outdir = resolve(outFlag === -1 ? `${root}/dist-server` : (process.argv[outFlag + 1] ?? ''));
if (outFlag !== -1 && process.argv[outFlag + 1] === undefined) {
  console.error('--outdir requiere una ruta');
  process.exit(2);
}

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [`${root}/src/infrastructure/http/server.ts`],
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['better-sqlite3', 'pg-native'],
  // Las dependencias CommonJS empaquetadas usan require() de módulos integrados.
  banner: { js: "import { createRequire as __argosCreateRequire } from 'node:module'; const require = __argosCreateRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

cpSync(`${root}/src/infrastructure/persistence/sqlite/migrations`, `${outdir}/migrations`, { recursive: true });
console.log(`bundle generado en ${outdir}`);
