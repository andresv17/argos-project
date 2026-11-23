#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
#
# Uso:
#   bash scripts/compile-contracts.sh                      feature 002 por defecto (override: ARGOS_FEATURE=NNN), salida en src/generated/
#   bash scripts/compile-contracts.sh --feature 001|002|003|004|005|006|009  elige la feature cuyos contratos se compilan
#   bash scripts/compile-contracts.sh --contracts DIR      (solo 004, pruebas) lee los contratos de DIR en vez de <feature>/contracts
#   bash scripts/compile-contracts.sh --out DIR            escribe en DIR en vez del destino por defecto (pruebas, comparaciones)
#
# Feature 003 (T406/T408): solo compila contracts/openapi/ops.openapi.yaml; destino por defecto src/generated/ops/
# (nunca src/generated/api, errors, machines ni schemas de la 002; H-MERO-003). Tras compilar 003 exige que
# `git diff --stat -- src/generated/api` quede vacío.
#
# Feature 004 (T514/T515): compila schemas/, errors/, state-machines/ y openapi/ 3.1.0 a <out>/v31/ y catalogs/ a <out>/catalogs/
# (destino por defecto src/generated/). Nunca escribe sobre src/generated/{api,errors,machines,schemas,ops} (INV-ARCH-003: la
# deriva de la 002 la verifica contra sus propios contratos) y exige que `git diff --stat -- src/generated/api` quede vacío.
# Compilar la 001 o la 002 conserva los directorios ajenos ops/, catalogs/ y v31/ del destino (cada feature regenera solo los suyos).
#
# Feature 005 (T709): compila contracts/ incremental de la 005 a <out>/v33/ (nunca v31, api, errors, machines, schemas, ops ni
# catalogs). Fusiona su catálogo incremental con el de la 004 en un directorio de ensayo (los contratos de origen no se tocan):
# falla si un código existe en ambos catálogos o si un código `inherited` no existe en el de la 004, valida x-sdd-metadata de
# los esquemas de 005 (version semver, status, traceability no vacía) y compila 004+005 juntos para que resuelvan los $ref a
# common/pet/media de la 004. Salvedad frente a contracts/README.md §6.2: v33/errors/error-codes.ts lleva el catálogo FUSIONADO
# (004 + 4 códigos nuevos), no solo los 4 nuevos, porque codegen.mjs genera un único catálogo por salida.
# El directorio de ensayo normaliza dos rasgos de 005 que codegen.mjs no admite: $id/$ref `contracts/005/schemas/` pasan a
# `contracts/schemas/` y se elimina el `$ref` raíz de los esquemas (los $defs se registran uno a uno); y los $ref del OpenAPI a
# `../../../004-*/contracts/schemas/` pasan a `../schemas/`.
#
# Feature 006 (T804, N2-08): compila contracts/ incremental de la 006 a <out>/v34/ (nunca v31, v33, api, errors, machines, schemas, ops
# ni catalogs). Fusiona los catálogos de errores de 004 + 005 + 006 en un directorio de ensayo: falla si un código existe en más de un
# catálogo (duplicados prohibidos), si un código `inherited` de la 006 no existe en la unión 004+005, o si x-sdd-metadata.added no
# coincide con sus códigos; valida x-sdd-metadata de sus esquemas y compila 004 + 006 juntos (los $ref a common/pet de la 004 resuelven).
# v34/errors/error-codes.ts lleva el catálogo FUSIONADO (004 + 005 + 006), igual que v33 lleva 004 + 005. Los contratos de origen no
# se tocan y nada se escribe a mano en src/generated/. El ensayo normaliza los $ref absolutos `https://argos.local/contracts/schemas/`
# del OpenAPI a `../schemas/` (openapi-typescript no resuelve URL remotas).
#
# Feature 009 (T1217): compila contracts/ incremental de la 009 (errors/, state-machines/, openapi/; sin schemas/, MIF-06) a <out>/v35/
# (nunca v31, v33, v34, api, errors, machines, schemas, ops ni catalogs). Fusiona los catálogos de errores de 004 + 005 + 006 + 009 en un
# directorio de ensayo (duplicados prohibidos; `inherited` debe existir en la unión 004+005+006; `added` debe coincidir con sus códigos) y
# toma los esquemas de la 004 (common.schema.json para ProblemDetails y Uuid) porque la 009 no define esquemas propios. Los contratos de
# origen no se tocan; el $ref absoluto `https://argos.local/contracts/schemas/` del OpenAPI se normaliza a `../schemas/` en el ensayo.
#
# Salida: 0 = compilado; 1 = falta un contrato o falla el generador; 2 = uso inválido o feature desconocida.
set -euo pipefail

FEATURE="${ARGOS_FEATURE:-002}"
OUT_DIR=""
CONTRACTS_OVERRIDE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]{3}$ ]]; then
        echo "[SDD Contract Compiler] Uso: --feature NNN (tres dígitos, p. ej. 001, 002, 003, 004, 005, 006 o 009)" >&2
        exit 2
      fi
      FEATURE="$2"
      shift 2
      ;;
    --contracts)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "[SDD Contract Compiler] Uso: --contracts DIR" >&2
        exit 2
      fi
      CONTRACTS_OVERRIDE="$2"
      shift 2
      ;;
    --out)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "[SDD Contract Compiler] Uso: --out DIR" >&2
        exit 2
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "[SDD Contract Compiler] Argumento desconocido: $1" >&2
      exit 2
      ;;
  esac
done

case "$FEATURE" in
  001) FEATURE_DIR="specs/001-pet-health-tracker" ;;
  002) FEATURE_DIR="specs/002-plataforma-v21" ;;
  003) FEATURE_DIR="specs/003-cloud-gcp" ;;
  004) FEATURE_DIR="specs/004-catalogos-registros-archivos" ;;
  005) FEATURE_DIR="specs/005-album-archivos-clinicos" ;;
  006) FEATURE_DIR="specs/006-escena-hogar-pixel-art" ;;
  009) FEATURE_DIR="specs/009-aprobacion-admin-correo" ;;
  *)
    echo "[SDD Contract Compiler] Feature desconocida: $FEATURE (admitidas: 001, 002, 003, 004, 005, 006, 009)" >&2
    exit 2
    ;;
esac
CONTRACTS_DIR="$FEATURE_DIR/contracts"
if [[ -n "$CONTRACTS_OVERRIDE" ]]; then
  if [[ "$FEATURE" != "004" ]]; then
    echo "[SDD Contract Compiler] --contracts solo se admite con --feature 004 (pruebas de fixtures)" >&2
    exit 2
  fi
  CONTRACTS_DIR="$CONTRACTS_OVERRIDE"
fi

echo "[SDD Contract Compiler] Verificando existencia de contratos en $CONTRACTS_DIR/..."

if [[ "$FEATURE" == "003" ]]; then
  CONTRACT_FILES=(
    "openapi/ops.openapi.yaml"
  )
elif [[ "$FEATURE" == "009" ]]; then
  CONTRACT_FILES=(
    "openapi/admin.openapi.yaml"
    "state-machines/account-registration.machine.json"
    "errors/error-catalog.json"
  )
elif [[ "$FEATURE" == "006" ]]; then
  CONTRACT_FILES=(
    "schemas/scene.schema.json"
    "schemas/scene-payload.schema.json"
    "openapi/home-scene.openapi.yaml"
    "state-machines/home-scene.machine.json"
    "errors/error-catalog.json"
  )
elif [[ "$FEATURE" == "005" ]]; then
  CONTRACT_FILES=(
    "schemas/album.schema.json"
    "schemas/clinical-summary.schema.json"
    "schemas/platform-parameter.schema.json"
    "schemas/share-link.schema.json"
    "openapi/share-links.openapi.yaml"
    "state-machines/share-link.machine.json"
    "errors/error-catalog.json"
  )
elif [[ "$FEATURE" == "004" ]]; then
  CONTRACT_FILES=(
    "schemas/common.schema.json"
    "schemas/identity.schema.json"
    "schemas/pet.schema.json"
    "schemas/medical-records.schema.json"
    "schemas/backup-envelope.schema.json"
    "schemas/audit-entry.schema.json"
    "schemas/media.schema.json"
    "openapi/pet-tracker-api.openapi.yaml"
    "state-machines/auth-session.machine.json"
    "state-machines/household-membership.machine.json"
    "state-machines/account-deletion.machine.json"
    "state-machines/sanitary-alert.machine.json"
    "state-machines/backup-import.machine.json"
    "errors/error-catalog.json"
    "catalogs/breeds.catalog.json"
  )
elif [[ "$FEATURE" == "001" ]]; then
  CONTRACT_FILES=(
    "schemas/common.schema.json"
    "schemas/identity.schema.json"
    "schemas/pet.schema.json"
    "schemas/medical-records.schema.json"
    "schemas/backup-envelope.schema.json"
    "openapi/pet-tracker-api.openapi.yaml"
    "state-machines/auth-session.machine.json"
    "state-machines/household-membership.machine.json"
    "state-machines/sanitary-alert.machine.json"
    "state-machines/backup-import.machine.json"
    "errors/error-catalog.json"
    "examples/canonical-fixtures.json"
  )
else
  CONTRACT_FILES=(
    "schemas/common.schema.json"
    "schemas/identity.schema.json"
    "schemas/pet.schema.json"
    "schemas/medical-records.schema.json"
    "schemas/backup-envelope.schema.json"
    "schemas/audit-entry.schema.json"
    "openapi/pet-tracker-api.openapi.yaml"
    "state-machines/auth-session.machine.json"
    "state-machines/household-membership.machine.json"
    "state-machines/account-deletion.machine.json"
    "state-machines/sanitary-alert.machine.json"
    "state-machines/backup-import.machine.json"
    "errors/error-catalog.json"
  )
fi

for contract in "${CONTRACT_FILES[@]}"; do
  if [[ ! -f "$CONTRACTS_DIR/$contract" ]]; then
    echo "[ERROR] Contrato obligatorio faltante: $CONTRACTS_DIR/$contract" >&2
    exit 1
  fi
done

echo "[SDD Contract Compiler] ${#CONTRACT_FILES[@]} contratos presentes (se verifica existencia; el estado de cada uno se imprime al generar)."

if [[ "$FEATURE" == "003" ]]; then
  OUT_DIR="${OUT_DIR:-src/generated/ops}"
  case "${OUT_DIR%/}" in
    src/generated|src/generated/api|src/generated/errors|src/generated/machines|src/generated/schemas|"$PWD/src/generated"|"$PWD/src/generated/api"|"$PWD/src/generated/errors"|"$PWD/src/generated/machines"|"$PWD/src/generated/schemas")
      echo "[ERROR] La 003 no puede escribir sobre artefactos de la 002 ($OUT_DIR); destino admitido: src/generated/ops/ o un directorio ajeno" >&2
      exit 2
      ;;
  esac
  echo "[SDD Contract Compiler] Regenerando $OUT_DIR (ops, feature 003)..."
  node scripts/codegen-ops.mjs --contracts "$CONTRACTS_DIR" --out "$OUT_DIR"
  if [[ -n "$(git diff --stat -- src/generated/api 2>/dev/null)" ]]; then
    echo "[ERROR] La compilación de la 003 modificó src/generated/api (H-MERO-003)" >&2
    exit 1
  fi
  echo "[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK"
  exit 0
fi

if [[ "$FEATURE" == "004" ]]; then
  OUT_DIR="${OUT_DIR:-src/generated}"
  case "${OUT_DIR%/}" in
    src/generated/api|src/generated/errors|src/generated/machines|src/generated/schemas|src/generated/ops|"$PWD/src/generated/api"|"$PWD/src/generated/errors"|"$PWD/src/generated/machines"|"$PWD/src/generated/schemas"|"$PWD/src/generated/ops")
      echo "[ERROR] La 004 no puede escribir sobre artefactos de la 002 o la 003 ($OUT_DIR); destino admitido: src/generated/ (raíz) o un directorio ajeno" >&2
      exit 2
      ;;
  esac
  echo "[SDD Contract Compiler] Regenerando $OUT_DIR/v31 y $OUT_DIR/catalogs (feature 004)..."
  # El catálogo se valida primero (T517, SC-CAT-032): un catálogo inválido detiene la compilación sin generar nada.
  node scripts/codegen-catalogs.mjs --contracts "$CONTRACTS_DIR" --out "${OUT_DIR%/}/catalogs"
  node scripts/codegen.mjs --contracts "$CONTRACTS_DIR" --out "${OUT_DIR%/}/v31"
  if [[ -n "$(git diff --stat -- src/generated/api 2>/dev/null)" ]]; then
    echo "[ERROR] La compilación de la 004 modificó src/generated/api (INV-ARCH-003)" >&2
    exit 1
  fi
  echo "[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK"
  exit 0
fi

if [[ "$FEATURE" == "005" ]]; then
  OUT_DIR="${OUT_DIR:-src/generated}"
  case "${OUT_DIR%/}" in
    src/generated/api|src/generated/errors|src/generated/machines|src/generated/schemas|src/generated/ops|src/generated/v31|src/generated/v34|src/generated/catalogs|"$PWD/src/generated/api"|"$PWD/src/generated/errors"|"$PWD/src/generated/machines"|"$PWD/src/generated/schemas"|"$PWD/src/generated/ops"|"$PWD/src/generated/v31"|"$PWD/src/generated/v34"|"$PWD/src/generated/catalogs")
      echo "[ERROR] La 005 no puede escribir sobre artefactos de la 002, 003 o 004 ($OUT_DIR); destino admitido: src/generated/ (raíz) o un directorio ajeno" >&2
      exit 2
      ;;
  esac
  C4_DIR="specs/004-catalogos-registros-archivos/contracts"
  if [[ ! -d "$C4_DIR" ]]; then
    echo "[ERROR] La 005 hereda de la 004 y falta $C4_DIR" >&2
    exit 1
  fi
  STAGE_DIR="$(mktemp -d)"
  trap 'rm -rf "$STAGE_DIR"' EXIT
  echo "[SDD Contract Compiler] Fusionando catálogo incremental 005 con 004 y preparando ensayo (feature 005)..."
  SDD_C4="$C4_DIR" SDD_C5="$CONTRACTS_DIR" SDD_STAGE="$STAGE_DIR" node --input-type=module - <<'JS'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { SDD_C4: c4, SDD_C5: c5, SDD_STAGE: stage } = process.env;
const die = (message) => {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
};
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return die(`no se pudo leer ${path}: ${e.message}`);
  }
};

// Catálogos: el de la 005 es incremental; se fusiona con el de la 004 sin pisar ningún código.
const cat4 = readJson(join(c4, 'errors/error-catalog.json'));
const cat5 = readJson(join(c5, 'errors/error-catalog.json'));
const e4 = cat4.errors ?? die('el catálogo de la 004 no declara "errors"');
const e5 = cat5.errors ?? die('el catálogo de la 005 no declara "errors"');
for (const code of Object.keys(e5)) {
  if (code in e4) die(`código de error duplicado en los catálogos de 004 y 005: ${code}`);
}
const meta5 = cat5['x-sdd-metadata'] ?? die('el catálogo de la 005 no declara x-sdd-metadata');
for (const code of meta5.inherited ?? []) {
  if (!(code in e4)) die(`el catálogo de la 005 hereda ${code}, que no existe en el catálogo de la 004`);
}
const added = [...(meta5.added ?? [])].sort().join(',');
if (added !== Object.keys(e5).sort().join(',')) die('x-sdd-metadata.added del catálogo de la 005 no coincide con sus códigos');
mkdirSync(join(stage, 'errors'), { recursive: true });
writeFileSync(join(stage, 'errors/error-catalog.json'), JSON.stringify({ ...cat5, errors: { ...e4, ...e5 } }, null, 2));

// Esquemas: los de la 004 (de los que dependen los $ref) más los de la 005, con x-sdd-metadata validado.
mkdirSync(join(stage, 'schemas'), { recursive: true });
cpSync(join(c4, 'schemas'), join(stage, 'schemas'), { recursive: true });
const SEMVER = /^\d+\.\d+\.\d+$/;
const STATUS = new Set(['DRAFT', 'REVIEW', 'APPROVED', 'LOCKED']);
for (const file of readdirSync(join(c5, 'schemas')).filter((f) => f.endsWith('.schema.json')).sort()) {
  const doc = readJson(join(c5, 'schemas', file));
  const meta = doc['x-sdd-metadata'];
  if (!meta || !SEMVER.test(meta.version ?? '') || !STATUS.has(meta.status) || !Array.isArray(meta.traceability) || meta.traceability.length === 0) {
    die(`${file}: x-sdd-metadata inválido (se exige version semver, status y traceability no vacía)`);
  }
  delete doc.$ref;
  const text = JSON.stringify(doc, null, 2).replaceAll('argos.local/contracts/005/schemas/', 'argos.local/contracts/schemas/');
  writeFileSync(join(stage, 'schemas', file), text);
}

// Máquinas y OpenAPI: solo los de la 005.
cpSync(join(c5, 'state-machines'), join(stage, 'state-machines'), { recursive: true });
mkdirSync(join(stage, 'openapi'), { recursive: true });
for (const file of readdirSync(join(c5, 'openapi')).filter((f) => f.endsWith('.openapi.yaml'))) {
  const text = readFileSync(join(c5, 'openapi', file), 'utf8').replaceAll('../../../004-catalogos-registros-archivos/contracts/schemas/', '../schemas/');
  writeFileSync(join(stage, 'openapi', file), text);
}
console.log(`[SDD Contract Compiler] Catálogos fusionados: ${Object.keys(e4).length} (004) + ${Object.keys(e5).length} (005) = ${Object.keys(e4).length + Object.keys(e5).length} códigos`);
JS
  echo "[SDD Contract Compiler] Regenerando $OUT_DIR/v33 (feature 005)..."
  node scripts/codegen.mjs --contracts "$STAGE_DIR" --out "${OUT_DIR%/}/v33"
  if [[ -n "$(git diff --stat -- src/generated/api 2>/dev/null)" ]]; then
    echo "[ERROR] La compilación de la 005 modificó src/generated/api (INV-ARCH-003)" >&2
    exit 1
  fi
  echo "[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK"
  exit 0
fi

if [[ "$FEATURE" == "006" ]]; then
  OUT_DIR="${OUT_DIR:-src/generated}"
  case "${OUT_DIR%/}" in
    src/generated/api|src/generated/errors|src/generated/machines|src/generated/schemas|src/generated/ops|src/generated/v31|src/generated/v33|src/generated/catalogs|"$PWD/src/generated/api"|"$PWD/src/generated/errors"|"$PWD/src/generated/machines"|"$PWD/src/generated/schemas"|"$PWD/src/generated/ops"|"$PWD/src/generated/v31"|"$PWD/src/generated/v33"|"$PWD/src/generated/catalogs")
      echo "[ERROR] La 006 no puede escribir sobre artefactos de la 002, 003, 004 o 005 ($OUT_DIR); destino admitido: src/generated/ (raíz) o un directorio ajeno" >&2
      exit 2
      ;;
  esac
  C4_DIR="specs/004-catalogos-registros-archivos/contracts"
  C5_DIR="specs/005-album-archivos-clinicos/contracts"
  for inherited_dir in "$C4_DIR" "$C5_DIR"; do
    if [[ ! -d "$inherited_dir" ]]; then
      echo "[ERROR] La 006 hereda de la 004 y la 005 y falta $inherited_dir" >&2
      exit 1
    fi
  done
  STAGE_DIR="$(mktemp -d)"
  trap 'rm -rf "$STAGE_DIR"' EXIT
  echo "[SDD Contract Compiler] Fusionando catálogos 004 + 005 + 006 y preparando ensayo (feature 006)..."
  SDD_C4="$C4_DIR" SDD_C5="$C5_DIR" SDD_C6="$CONTRACTS_DIR" SDD_STAGE="$STAGE_DIR" node --input-type=module - <<'JS'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { SDD_C4: c4, SDD_C5: c5, SDD_C6: c6, SDD_STAGE: stage } = process.env;
const die = (message) => {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
};
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return die(`no se pudo leer ${path}: ${e.message}`);
  }
};

// Catálogos: el de la 006 es incremental; se fusiona con la unión 004 + 005 sin pisar ningún código (duplicados prohibidos).
const cat4 = readJson(join(c4, 'errors/error-catalog.json'));
const cat5 = readJson(join(c5, 'errors/error-catalog.json'));
const cat6 = readJson(join(c6, 'errors/error-catalog.json'));
const e4 = cat4.errors ?? die('el catálogo de la 004 no declara "errors"');
const e5 = cat5.errors ?? die('el catálogo de la 005 no declara "errors"');
const e6 = cat6.errors ?? die('el catálogo de la 006 no declara "errors"');
for (const code of Object.keys(e5)) {
  if (code in e4) die(`código de error duplicado en los catálogos de 004 y 005: ${code}`);
}
const union = { ...e4, ...e5 };
for (const code of Object.keys(e6)) {
  if (code in e4) die(`código de error duplicado en los catálogos de 004 y 006: ${code}`);
  if (code in e5) die(`código de error duplicado en los catálogos de 005 y 006: ${code}`);
}
const meta6 = cat6['x-sdd-metadata'] ?? die('el catálogo de la 006 no declara x-sdd-metadata');
for (const code of meta6.inherited ?? []) {
  if (!(code in union)) die(`el catálogo de la 006 hereda ${code}, que no existe en los catálogos de la 004 ni de la 005`);
}
const added = [...(meta6.added ?? [])].sort().join(',');
if (added !== Object.keys(e6).sort().join(',')) die('x-sdd-metadata.added del catálogo de la 006 no coincide con sus códigos');
mkdirSync(join(stage, 'errors'), { recursive: true });
writeFileSync(join(stage, 'errors/error-catalog.json'), JSON.stringify({ ...cat6, errors: { ...union, ...e6 } }, null, 2));

// Esquemas: los de la 004 (de los que dependen los $ref a common, pet e identidad) más los de la 006, con x-sdd-metadata validado.
mkdirSync(join(stage, 'schemas'), { recursive: true });
cpSync(join(c4, 'schemas'), join(stage, 'schemas'), { recursive: true });
const SEMVER = /^\d+\.\d+\.\d+$/;
const STATUS = new Set(['DRAFT', 'REVIEW', 'APPROVED', 'LOCKED']);
for (const file of readdirSync(join(c6, 'schemas')).filter((f) => f.endsWith('.schema.json')).sort()) {
  const doc = readJson(join(c6, 'schemas', file));
  const meta = doc['x-sdd-metadata'];
  if (!meta || !SEMVER.test(meta.version ?? '') || !STATUS.has(meta.status) || !Array.isArray(meta.traceability) || meta.traceability.length === 0) {
    die(`${file}: x-sdd-metadata inválido (se exige version semver, status y traceability no vacía)`);
  }
  delete doc.$ref;
  const text = JSON.stringify(doc, null, 2).replaceAll('argos.local/contracts/006/schemas/', 'argos.local/contracts/schemas/');
  writeFileSync(join(stage, 'schemas', file), text);
}

// Máquinas y OpenAPI: solo los de la 006.
cpSync(join(c6, 'state-machines'), join(stage, 'state-machines'), { recursive: true });
mkdirSync(join(stage, 'openapi'), { recursive: true });
for (const file of readdirSync(join(c6, 'openapi')).filter((f) => f.endsWith('.openapi.yaml'))) {
  const text = readFileSync(join(c6, 'openapi', file), 'utf8')
    .replaceAll('../../../004-catalogos-registros-archivos/contracts/schemas/', '../schemas/')
    .replaceAll('https://argos.local/contracts/schemas/', '../schemas/'); // los $ref absolutos a common.schema se resuelven en el ensayo
  writeFileSync(join(stage, 'openapi', file), text);
}
console.log(`[SDD Contract Compiler] Catálogos fusionados: ${Object.keys(e4).length} (004) + ${Object.keys(e5).length} (005) + ${Object.keys(e6).length} (006) = ${Object.keys(union).length + Object.keys(e6).length} códigos`);
JS
  echo "[SDD Contract Compiler] Regenerando $OUT_DIR/v34 (feature 006)..."
  node scripts/codegen.mjs --contracts "$STAGE_DIR" --out "${OUT_DIR%/}/v34"
  if [[ -n "$(git diff --stat -- src/generated/api 2>/dev/null)" ]]; then
    echo "[ERROR] La compilación de la 006 modificó src/generated/api (INV-ARCH-003)" >&2
    exit 1
  fi
  echo "[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK"
  exit 0
fi

if [[ "$FEATURE" == "009" ]]; then
  OUT_DIR="${OUT_DIR:-src/generated}"
  case "${OUT_DIR%/}" in
    src/generated/api|src/generated/errors|src/generated/machines|src/generated/schemas|src/generated/ops|src/generated/v31|src/generated/v33|src/generated/v34|src/generated/catalogs|"$PWD/src/generated/api"|"$PWD/src/generated/errors"|"$PWD/src/generated/machines"|"$PWD/src/generated/schemas"|"$PWD/src/generated/ops"|"$PWD/src/generated/v31"|"$PWD/src/generated/v33"|"$PWD/src/generated/v34"|"$PWD/src/generated/catalogs")
      echo "[ERROR] La 009 no puede escribir sobre artefactos de la 002, 003, 004, 005 o 006 ($OUT_DIR); destino admitido: src/generated/ (raíz) o un directorio ajeno" >&2
      exit 2
      ;;
  esac
  C4_DIR="specs/004-catalogos-registros-archivos/contracts"
  C5_DIR="specs/005-album-archivos-clinicos/contracts"
  C6_DIR="specs/006-escena-hogar-pixel-art/contracts"
  for inherited_dir in "$C4_DIR" "$C5_DIR" "$C6_DIR"; do
    if [[ ! -d "$inherited_dir" ]]; then
      echo "[ERROR] La 009 hereda de la 004, la 005 y la 006 y falta $inherited_dir" >&2
      exit 1
    fi
  done
  STAGE_DIR="$(mktemp -d)"
  trap 'rm -rf "$STAGE_DIR"' EXIT
  echo "[SDD Contract Compiler] Fusionando catálogos 004 + 005 + 006 + 009 y preparando ensayo (feature 009)..."
  SDD_C4="$C4_DIR" SDD_C5="$C5_DIR" SDD_C6="$C6_DIR" SDD_C9="$CONTRACTS_DIR" SDD_STAGE="$STAGE_DIR" node --input-type=module - <<'JS'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { SDD_C4: c4, SDD_C5: c5, SDD_C6: c6, SDD_C9: c9, SDD_STAGE: stage } = process.env;
const die = (message) => {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
};
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return die(`no se pudo leer ${path}: ${e.message}`);
  }
};

// Catálogos: el de la 009 es incremental; se fusiona con la unión 004 + 005 + 006 sin pisar ningún código (duplicados prohibidos).
const errorsOf = (dir, label) => (readJson(join(dir, 'errors/error-catalog.json')).errors ?? die(`el catálogo de la ${label} no declara "errors"`));
const e4 = errorsOf(c4, '004');
const e5 = errorsOf(c5, '005');
const e6 = errorsOf(c6, '006');
const cat9 = readJson(join(c9, 'errors/error-catalog.json'));
const e9 = cat9.errors ?? die('el catálogo de la 009 no declara "errors"');
const union = {};
for (const [label, entries] of [['004', e4], ['005', e5], ['006', e6]]) {
  for (const code of Object.keys(entries)) {
    if (code in union) die(`código de error duplicado en los catálogos de ${label} y uno anterior: ${code}`);
    union[code] = entries[code];
  }
}
for (const code of Object.keys(e9)) {
  if (code in union) die(`código de error duplicado en los catálogos de 009 y uno de 004/005/006: ${code}`);
}
const meta9 = cat9['x-sdd-metadata'] ?? die('el catálogo de la 009 no declara x-sdd-metadata');
for (const code of meta9.inherited ?? []) {
  if (!(code in union)) die(`el catálogo de la 009 hereda ${code}, que no existe en los catálogos de la 004, la 005 ni la 006`);
}
const added = [...(meta9.added ?? [])].sort().join(',');
if (added !== Object.keys(e9).sort().join(',')) die('x-sdd-metadata.added del catálogo de la 009 no coincide con sus códigos');
mkdirSync(join(stage, 'errors'), { recursive: true });
writeFileSync(join(stage, 'errors/error-catalog.json'), JSON.stringify({ ...cat9, errors: { ...union, ...e9 } }, null, 2));

// Esquemas: la 009 no tiene schemas/ propios (MIF-06); se toman los de la 004 (ProblemDetails y Uuid de common.schema.json).
mkdirSync(join(stage, 'schemas'), { recursive: true });
cpSync(join(c4, 'schemas'), join(stage, 'schemas'), { recursive: true });

// Máquinas y OpenAPI: solo los de la 009 (x-sdd-metadata válida).
const SEMVER = /^\d+\.\d+\.\d+$/;
const STATUS = new Set(['DRAFT', 'REVIEW', 'APPROVED', 'LOCKED']);
const metaOk = (meta) => meta && SEMVER.test(meta.version ?? '') && STATUS.has(meta.status) && Array.isArray(meta.traceability) && meta.traceability.length > 0;
cpSync(join(c9, 'state-machines'), join(stage, 'state-machines'), { recursive: true });
for (const file of readdirSync(join(c9, 'state-machines')).filter((f) => f.endsWith('.machine.json')).sort()) {
  if (!metaOk(readJson(join(c9, 'state-machines', file))['x-sdd-metadata'])) die(`${file}: x-sdd-metadata inválido (se exige version semver, status y traceability no vacía)`);
}
mkdirSync(join(stage, 'openapi'), { recursive: true });
for (const file of readdirSync(join(c9, 'openapi')).filter((f) => f.endsWith('.openapi.yaml'))) {
  const text = readFileSync(join(c9, 'openapi', file), 'utf8').replaceAll('https://argos.local/contracts/schemas/', '../schemas/');
  writeFileSync(join(stage, 'openapi', file), text);
}
console.log(`[SDD Contract Compiler] Catálogos fusionados: ${Object.keys(e4).length} (004) + ${Object.keys(e5).length} (005) + ${Object.keys(e6).length} (006) + ${Object.keys(e9).length} (009) = ${Object.keys(union).length + Object.keys(e9).length} códigos`);
JS
  echo "[SDD Contract Compiler] Regenerando $OUT_DIR/v35 (feature 009)..."
  node scripts/codegen.mjs --contracts "$STAGE_DIR" --out "${OUT_DIR%/}/v35"
  if [[ -n "$(git diff --stat -- src/generated/api 2>/dev/null)" ]]; then
    echo "[ERROR] La compilación de la 009 modificó src/generated/api (INV-ARCH-003)" >&2
    exit 1
  fi
  echo "[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK"
  exit 0
fi

CODEGEN_ARGS=(--contracts "$CONTRACTS_DIR")
if [[ -n "$OUT_DIR" ]]; then
  CODEGEN_ARGS+=(--out "$OUT_DIR")
  echo "[SDD Contract Compiler] Regenerando en $OUT_DIR..."
else
  echo "[SDD Contract Compiler] Regenerando src/generated/..."
fi
# 001 y 002 regeneran la raíz del destino: se apartan los directorios que compilan otras features y se restauran después.
TARGET_DIR="${OUT_DIR:-src/generated}"
KEEP_DIR="$(mktemp -d)"
trap 'rm -rf "$KEEP_DIR"' EXIT
for foreign in ops catalogs v31 v33 v34 v35; do
  if [[ -d "$TARGET_DIR/$foreign" ]]; then
    mv "$TARGET_DIR/$foreign" "$KEEP_DIR/$foreign"
  fi
done
restore_foreign() {
  mkdir -p "$TARGET_DIR"
  for foreign in ops catalogs v31 v33 v34 v35; do
    if [[ -d "$KEEP_DIR/$foreign" ]]; then
      rm -rf "${TARGET_DIR:?}/$foreign"
      mv "$KEEP_DIR/$foreign" "$TARGET_DIR/$foreign"
    fi
  done
}
if ! node scripts/codegen.mjs "${CODEGEN_ARGS[@]}"; then
  restore_foreign
  exit 1
fi
restore_foreign
