#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
#
# Uso:
#   bash scripts/compile-contracts.sh                      feature 002 por defecto (override: ARGOS_FEATURE=NNN), salida en src/generated/
#   bash scripts/compile-contracts.sh --feature 001|002|003  elige la feature cuyos contratos se compilan
#   bash scripts/compile-contracts.sh --out DIR            escribe en DIR en vez del destino por defecto (pruebas, comparaciones)
#
# Feature 003 (T406/T408): solo compila contracts/openapi/ops.openapi.yaml; destino por defecto src/generated/ops/
# (nunca src/generated/api, errors, machines ni schemas de la 002; H-MERO-003). Tras compilar 003 exige que
# `git diff --stat -- src/generated/api` quede vacío.
#
# Salida: 0 = compilado; 1 = falta un contrato o falla el generador; 2 = uso inválido o feature desconocida.
set -euo pipefail

FEATURE="${ARGOS_FEATURE:-002}"
OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]{3}$ ]]; then
        echo "[SDD Contract Compiler] Uso: --feature NNN (tres dígitos, p. ej. 001, 002 o 003)" >&2
        exit 2
      fi
      FEATURE="$2"
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
  *)
    echo "[SDD Contract Compiler] Feature desconocida: $FEATURE (admitidas: 001, 002, 003)" >&2
    exit 2
    ;;
esac
CONTRACTS_DIR="$FEATURE_DIR/contracts"

echo "[SDD Contract Compiler] Verificando existencia de contratos en $CONTRACTS_DIR/..."

if [[ "$FEATURE" == "003" ]]; then
  CONTRACT_FILES=(
    "openapi/ops.openapi.yaml"
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

CODEGEN_ARGS=(--contracts "$CONTRACTS_DIR")
if [[ -n "$OUT_DIR" ]]; then
  CODEGEN_ARGS+=(--out "$OUT_DIR")
  echo "[SDD Contract Compiler] Regenerando en $OUT_DIR..."
else
  echo "[SDD Contract Compiler] Regenerando src/generated/..."
fi
node scripts/codegen.mjs "${CODEGEN_ARGS[@]}"
