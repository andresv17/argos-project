// Rutas del repo que tests/ referencia y que el arbol limpio de CI no tendria (scripts/verify-ci-ready.sh, comprobacion ii).
// Se ejecuta con cwd = raiz del repo; imprime una linea por hallazgo.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean));
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(p) ? [p] : []; });
// Literales completos (sin interpolacion) que son rutas del repositorio, con o sin prefijo ../ de la prueba.
const LITERAL = /(['"`])((?:\.\.\/)*)((?:claude|specs|\.specify|scripts|terraform|docs|src|\.github)\/[\w@.\-/]+\.[A-Za-z0-9]+)\1/g;
const found = new Set();
for (const file of walk('tests')) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(LITERAL)) {
    const path = m[3];
    const line = text.slice(0, m.index).split('\n').length;
    const where = `${file}:${line} ${path}`;
    if (path.startsWith('claude/') && !tracked.has(path)) found.add(`${where} (lee claude/ sin seguimiento: en CI no existe)`);
    else if (!path.startsWith('claude/') && existsSync(path) && !tracked.has(path) && !path.startsWith('src/generated/')) found.add(`${where} (archivo sin seguimiento de git)`);
  }
}
console.log([...found].join('\n'));
