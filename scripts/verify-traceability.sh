#!/usr/bin/env bash
# Compuerta de trazabilidad (Lineage IDs) y pureza de capas.
# Constitución, principio II (INV-ARCH-001, INV-ARCH-002, INV-ARCH-006), principio III (IDs vigentes y retirados)
# y principio IV (compuerta por tarea).
#
# Uso:
#   bash scripts/verify-traceability.sh              compuerta final: todos los IDs vigentes
#   bash scripts/verify-traceability.sh --task T###  compuerta por tarea: IDs citados en la línea "- [ ] T### ..." de tasks.md
#   bash scripts/verify-traceability.sh --feature NNN [--task T###]  feature a verificar (001 por defecto; 002 lee specs/002-*)
#
# Un ID cuenta como trazado solo si aparece en un @implements de src/ fuera de src/generated/
# y en el título de un it/test de tests/. Los comentarios sueltos y los títulos de describe no cuentan.
# En la compuerta por tarea se listan todos los archivos que declaran cada ID (primera línea de cada archivo);
# basta con que aparezca en al menos uno de src/ y en al menos uno de tests/.
# IDs vigentes = spec + contracts/ de la feature (REQ/INV/STATE) + constitución, principios II y III + códigos de
# error-catalog.json, menos los retirados del principio III.
# Feature 002 (T204): spec, contratos y tasks.md de specs/002-*; los IDs admiten dígitos en el segmento (REQ-AUTH2-001);
# quedan fuera de los vigentes los que la tabla «Trazabilidad con la Feature 001» marca como reemplazados o absorbidos
# y los retirados de la constitución; los rangos del principio III (001) no se toman hasta la enmienda 3.2.0.
# IDs retirados: fallan la compuerta final; en la compuerta por tarea se avisan (RETIRED WARN) sin fallar.
#
# Salida: 0 = cumple; 1 = incumple; 2 = uso inválido o fuente ausente.
set -euo pipefail

TASK_ID=""
FEATURE="001"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]{3}$ ]]; then
        echo "[SDD Traceability Gate] Uso: --feature NNN (tres dígitos, p. ej. 001 o 002)" >&2
        exit 2
      fi
      FEATURE="$2"
      shift 2
      ;;
    --task)
      if [[ $# -lt 2 || ! "$2" =~ ^T[0-9]{3}$ ]]; then
        echo "[SDD Traceability Gate] Uso: --task T###" >&2
        exit 2
      fi
      TASK_ID="$2"
      shift 2
      ;;
    *)
      echo "[SDD Traceability Gate] Argumento desconocido: $1" >&2
      exit 2
      ;;
  esac
done

FEATURE_DIR=""
for candidate in specs/"$FEATURE"-*/; do
  if [[ -d "$candidate" ]]; then
    FEATURE_DIR="${candidate%/}"
    break
  fi
done
if [[ -z "$FEATURE_DIR" ]]; then
  echo "[SDD Traceability Gate] Feature desconocida: $FEATURE (no existe specs/$FEATURE-*/)" >&2
  exit 2
fi

export SDD_TASK_ID="$TASK_ID"
export SDD_FEATURE="$FEATURE"
export SDD_FEATURE_DIR="$FEATURE_DIR"
exec node --input-type=module - <<'JS'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const feature = process.env.SDD_FEATURE ?? '001';
const featureDir = process.env.SDD_FEATURE_DIR ?? 'specs/001-pet-health-tracker';
const SPEC = `${featureDir}/spec.md`;
const CONSTITUTION = '.specify/memory/constitution.md';
const TASKS = `${featureDir}/tasks.md`;
const CONTRACTS = `${featureDir}/contracts`;
const CATALOG = `${featureDir}/contracts/errors/error-catalog.json`;
const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const NUM_ID = /\b(?:REQ|INV|STATE)-[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{3}\b/g;
const ERR_ID = /\bERR-[A-Z]+(?:-[A-Z0-9]+)+\b/g;
const taskId = process.env.SDD_TASK_ID ?? '';

const out = (line) => console.log(line);
const err = (line) => console.error(line);
const usage = (message) => {
  err(`[SDD Traceability Gate] ${message}`);
  process.exit(2);
};

for (const path of [SPEC, CONSTITUTION, TASKS, CONTRACTS, CATALOG]) {
  if (!existsSync(path)) usage(`Fuente ausente: ${path}`);
}

const idsIn = (text) => [...(text.match(NUM_ID) ?? []), ...(text.match(ERR_ID) ?? [])];
const walk = (dir, skip = () => false) => {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (skip(full)) continue;
    if (statSync(full).isDirectory()) files.push(...walk(full, skip));
    else files.push(full);
  }
  return files;
};
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const isCommentLine = (line) => /^\s*(?:\/\/|\/\*|\*)/.test(line);
// Cuerpo de un principio de la constitución: desde "### <romano>. " hasta el siguiente encabezado "###" o "##".
const section = (lines, roman) => {
  const start = lines.findIndex((l) => l.startsWith(`### ${roman}. `));
  if (start === -1) return [];
  const end = lines.findIndex((l, i) => i > start && (l.startsWith('### ') || l.startsWith('## ')));
  return lines.slice(start, end === -1 ? undefined : end);
};

// ---------------------------------------------------------------------------
// 1. IDs vigentes y retirados
// ---------------------------------------------------------------------------
const constitutionLines = readFileSync(CONSTITUTION, 'utf8').split('\n');
const retiredLine = constitutionLines.find((l) => l.includes('IDs retirados'));
if (!retiredLine) usage(`No se encontró la línea "IDs retirados" en ${CONSTITUTION} (principio III)`);
const retired = new Set(idsIn(retiredLine));

const candidates = new Set();
for (const id of readFileSync(SPEC, 'utf8').match(NUM_ID) ?? []) candidates.add(id);
for (const file of walk(CONTRACTS)) {
  for (const id of readFileSync(file, 'utf8').match(NUM_ID) ?? []) candidates.add(id);
}
for (const line of section(constitutionLines, 'II')) {
  for (const id of line.match(NUM_ID) ?? []) candidates.add(id);
}
// Tabla «Trazabilidad con la Feature 001» de la spec (features posteriores): los IDs de la primera columna cuya
// segunda columna dice «Reemplazad...» o «...absorbid...» dejan de ser vigentes (siguen existiendo en la 001).
const superseded = new Set();
if (feature !== '001') {
  const specLines = readFileSync(SPEC, 'utf8').split('\n');
  const head = specLines.findIndex((l) => /^#{2,4}\s+Trazabilidad con la Feature 001\b/.test(l));
  if (head !== -1) {
    for (const row of specLines.slice(head + 1)) {
      if (/^#{1,4}\s/.test(row)) break;
      const cells = row.split('|').map((c) => c.trim());
      if (cells.length < 4 || !/^(?:Reemplazad|.*absorbid)/i.test(cells[2])) continue;
      for (const id of cells[1].match(NUM_ID) ?? []) superseded.add(id);
    }
  }
}

// Los rangos del principio III describen los IDs de la 001; la 002 los toma de su spec y de sus contratos (T204a).
for (const line of feature === '001' ? section(constitutionLines, 'III') : []) {
  if (line === retiredLine) continue;
  for (const id of line.match(NUM_ID) ?? []) candidates.add(id);
  for (const m of line.matchAll(/`((?:REQ|INV|STATE)-[A-Z]+(?:-[A-Z]+)*-)(\d{3})`\.\.`(\d{3})`/g)) {
    for (let n = Number(m[2]); n <= Number(m[3]); n += 1) candidates.add(`${m[1]}${String(n).padStart(3, '0')}`);
  }
}
let catalogCodes;
try {
  catalogCodes = Object.keys(JSON.parse(readFileSync(CATALOG, 'utf8')).errors ?? {});
} catch (e) {
  usage(`No se pudo leer ${CATALOG}: ${e.message}`);
}
// Errores que el catálogo de una feature posterior retira (x-sdd-metadata.removed) cuentan como retirados.
if (feature !== '001') {
  try {
    for (const code of JSON.parse(readFileSync(CATALOG, 'utf8'))['x-sdd-metadata']?.removed ?? []) retired.add(code);
  } catch {
    // el error de lectura ya se informó arriba
  }
}
for (const code of catalogCodes) candidates.add(code);
const current = new Set([...candidates].filter((id) => !retired.has(id) && !superseded.has(id)).sort());

// ---------------------------------------------------------------------------
// 2. IDs exigidos (compuerta final o por tarea)
// ---------------------------------------------------------------------------
let required;
let failed = false;
if (taskId === '') {
  required = [...current];
  out(
    superseded.size === 0 && feature === '001'
      ? `[SDD Traceability Gate] Modo: compuerta final (${required.length} IDs vigentes; ${retired.size} retirados excluidos)`
      : `[SDD Traceability Gate] Modo: compuerta final, feature ${feature} (${required.length} IDs vigentes; ${retired.size} retirados y ${superseded.size} reemplazados excluidos)`,
  );
} else {
  const rows = readFileSync(TASKS, 'utf8').split('\n');
  const row = rows.find((l) => new RegExp(`^- \\[[ xX]\\] ${taskId} `).test(l));
  if (!row) usage(`${taskId} no existe en ${TASKS}`);
  if (/todos los IDs vigentes/i.test(row)) {
    required = [...current];
  } else {
    required = [...new Set(idsIn(row))];
    for (const id of required) {
      if (!current.has(id)) {
        err(`[TRACEABILITY FAIL] ${id}: citado en ${taskId} pero no es un ID vigente (${retired.has(id) ? 'retirado' : superseded.has(id) ? 'reemplazado' : 'desconocido'})`);
        failed = true;
      }
    }
  }
  out(`[SDD Traceability Gate] Modo: compuerta por tarea ${taskId} (${required.length} IDs)`);
}

// ---------------------------------------------------------------------------
// 3. Evidencia en src/ y tests/
// ---------------------------------------------------------------------------
const isGenerated = (path) => path === join('src', 'generated') || path.startsWith(join('src', 'generated') + '/');
// Primera aparición de cada ID por archivo: Map<id, Map<archivo, "archivo:línea">>.
const record = (map, id, file, line) => {
  if (!map.has(id)) map.set(id, new Map());
  const byFile = map.get(id);
  if (!byFile.has(file)) byFile.set(file, `${file}:${line}`);
};
const first = (map, id) => map.get(id)?.values().next().value;
const all = (map, id) => [...(map.get(id)?.values() ?? [])].join(', ');
const implemented = new Map();
const looseInSrc = new Map();
const inGenerated = new Map();
const srcFiles = walk('src').filter((f) => CODE_EXT.test(f));
for (const file of srcFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const ids = idsIn(line);
    if (ids.length === 0) return;
    const target = isGenerated(file) ? inGenerated : /@implements\b/.test(line) ? implemented : looseInSrc;
    const scope = target === implemented ? idsIn(line.slice(line.indexOf('@implements'))) : ids;
    for (const id of scope) record(target, id, file, i + 1);
  });
}

const TITLE = (fn) => new RegExp(`(?<![\\w.$])(?:${fn})(?:\\.[A-Za-z]+(?:\\([^)]*\\))?)*\\s*\\(\\s*(['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`, 'g');
const tested = new Map();
const inDescribe = new Map();
const testFiles = walk('tests').filter((f) => CODE_EXT.test(f));
for (const file of testFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(TITLE('it|test'))) {
    for (const id of idsIn(m[2])) record(tested, id, file, lineOf(text, m.index));
  }
  for (const m of text.matchAll(TITLE('describe'))) {
    for (const id of idsIn(m[2])) record(inDescribe, id, file, lineOf(text, m.index));
  }
}

let traced = 0;
for (const id of required) {
  const src = implemented.has(id);
  const test = tested.has(id);
  if (src && test) {
    traced += 1;
    if (taskId !== '') {
      out(`  OK    ${id}`);
      out(`          src (${implemented.get(id).size}): ${all(implemented, id)}`);
      out(`          tests (${tested.get(id).size}): ${all(tested, id)}`);
    }
    continue;
  }
  failed = true;
  const reasons = [];
  if (!src) {
    const hint = looseInSrc.has(id)
      ? ` (solo fuera de @implements: ${first(looseInSrc, id)})`
      : inGenerated.has(id)
        ? ` (solo en src/generated, excluido: ${first(inGenerated, id)})`
        : '';
    reasons.push(`sin @implements en src/${hint}`);
  }
  if (!test) {
    const hint = inDescribe.has(id) ? ` (solo en título de describe: ${first(inDescribe, id)})` : '';
    reasons.push(`sin título it/test en tests/${hint}`);
  }
  err(`  FAIL  ${id}  ${reasons.join('; ')}`);
}
out(`[SDD Traceability Gate] IDs trazados: ${traced}/${required.length}`);

// ---------------------------------------------------------------------------
// 4. IDs retirados (constitución, principio III)
// ---------------------------------------------------------------------------
const retiredHits = [];
for (const file of srcFiles) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const id of idsIn(line)) if (retired.has(id)) retiredHits.push(`${file}:${i + 1}: ${id}`);
  });
}
for (const file of testFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(TITLE('it|test|describe'))) {
    for (const id of idsIn(m[2])) if (retired.has(id)) retiredHits.push(`${file}:${lineOf(text, m.index)}: ${id} (título)`);
  }
}
if (taskId === '') {
  for (const hit of retiredHits) err(`[RETIRED FAIL] ${hit}`);
} else {
  const byFile = new Map();
  for (const hit of retiredHits) {
    const [file, , id] = hit.match(/^(.*?):(\d+): (\S+)/).slice(1);
    const entry = byFile.get(file) ?? { count: 0, ids: new Set() };
    entry.count += 1;
    entry.ids.add(id);
    byFile.set(file, entry);
  }
  for (const [file, { count, ids }] of byFile) err(`[RETIRED WARN] ${file}: ${count} (${[...ids].join(', ')})`);
}
if (retiredHits.length > 0) {
  out(`[SDD Traceability Gate] IDs retirados encontrados: ${retiredHits.length} (${taskId === '' ? 'bloquea la compuerta final' : 'aviso; bloquea solo la compuerta final'})`);
  if (taskId === '') failed = true;
}

// ---------------------------------------------------------------------------
// 5. Pureza (constitución, principio II)
// ---------------------------------------------------------------------------
out('[SDD Purity Gate] Verificando entropía en src/domain/ y src/application/, y process.env fuera de src/infrastructure/config/...');
const PURE = [
  ['INV-ARCH-001', 'Date.now()', /\bDate\.now\s*\(/],
  ['INV-ARCH-001', 'new Date()', /\bnew\s+Date\s*\(/],
  ['INV-ARCH-001', 'Date()', /(?<![\w.$])(?<!new\s+)Date\s*\(/],
  ['INV-ARCH-001', 'performance.now()', /\bperformance\.now\s*\(/],
  ['INV-ARCH-002', 'Math.random()', /\bMath\.random\s*\(/],
  ['INV-ARCH-002', 'randomUUID()', /\brandomUUID\s*\(/],
  ['INV-ARCH-002', 'randomBytes()', /\brandomBytes\s*\(/],
  ['INV-ARCH-002', 'getRandomValues()', /\bgetRandomValues\s*\(/],
];
const ENV = /\bprocess\s*(?:\.\s*env\b|\[\s*['"]env['"]\s*\])/;
let purityHits = 0;
for (const file of srcFiles) {
  const pureLayer = /^src\/(?:domain|application)\//.test(file);
  const configLayer = file.startsWith('src/infrastructure/config/');
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (pureLayer) {
      for (const [id, label, re] of PURE) {
        if (re.test(line)) {
          err(`[PURITY FAIL] ${id}: ${label} en ${file}:${i + 1}: ${line.trim()}`);
          purityHits += 1;
        }
      }
    }
    if (!configLayer && ENV.test(line)) {
      err(`[PURITY FAIL] INV-ARCH-006: process.env fuera de src/infrastructure/config/ en ${file}:${i + 1}: ${line.trim()}`);
      purityHits += 1;
    }
  });
}
if (purityHits > 0) failed = true;
out(`[SDD Purity Gate] Violaciones de pureza: ${purityHits}`);

if (failed) {
  err('[SDD Traceability Gate] Resultado: FALLA');
  process.exit(1);
}
out('[SDD Traceability Gate] Resultado: CUMPLE');
JS
