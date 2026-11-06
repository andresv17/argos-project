#!/usr/bin/env bash
# Compuerta de oráculos débiles (constitución §5, "Cero Weak Oracles").
# Rechaza en tests/: toBeDefined(), toBeTruthy(), toBeFalsy(), not.toBeNull() y toThrow()/toThrowError() sin argumento,
# además de it/test/describe con .skip, .todo u .only. Se ignoran las líneas que son solo comentario.
# Criterio estricto: cualquier aparición falla (no se distingue aserción principal de secundaria).
#
# Salida: 0 = cumple; 1 = incumple; 2 = falta tests/.
set -euo pipefail

if [[ ! -d tests ]]; then
  echo "[SDD Oracle Gate] Fuente ausente: tests/" >&2
  exit 2
fi

exec node --input-type=module - <<'JS'
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  ['toBeDefined() como aserción', /\.toBeDefined\s*\(\s*\)/],
  ['toBeTruthy() como aserción', /\.toBeTruthy\s*\(\s*\)/],
  ['toBeFalsy() como aserción', /\.toBeFalsy\s*\(\s*\)/],
  ['not.toBeNull() como aserción', /\.not\s*\.\s*toBeNull\s*\(\s*\)/],
  ['toThrow() sin código ERR-* esperado', /\.toThrow(?:Error)?\s*\(\s*\)/],
  ['test deshabilitado o exclusivo (.skip, .todo, .only)', /(?<![\w.$])(?:it|test|describe)\s*\.\s*(?:skip|todo|only)\b/],
];
const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const walk = (dir) =>
  readdirSync(dir).sort().flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

console.log('[SDD Oracle Gate] Analizando suites en tests/ contra Weak Oracles...');
const files = walk('tests').filter((f) => CODE_EXT.test(f));
let hits = 0;
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
    for (const [label, re] of RULES) {
      if (re.test(line)) {
        console.error(`[ORACLE FAIL] ${label}: ${file}:${i + 1}: ${line.trim()}`);
        hits += 1;
      }
    }
  });
}
console.log(`[SDD Oracle Gate] Archivos analizados: ${files.length}; oráculos débiles: ${hits}`);
if (hits > 0) {
  console.error('[SDD Oracle Gate] Resultado: FALLA');
  process.exit(1);
}
console.log('[SDD Oracle Gate] Resultado: CUMPLE');
JS
