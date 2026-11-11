#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
#
# Uso:
#   bash scripts/compile-contracts.sh                      feature 001 (valor por defecto), salida en src/generated/
#   bash scripts/compile-contracts.sh --feature 001|002    elige la feature cuyos contratos se compilan
#   bash scripts/compile-contracts.sh --out DIR            escribe en DIR en vez de src/generated/ (pruebas, comparaciones)
#
# Salida: 0 = compilado; 1 = falta un contrato o falla el generador; 2 = uso inválido o feature desconocida.
set -euo pipefail

FEATURE="001"
OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]{3}$ ]]; then
        echo "[SDD Contract Compiler] Uso: --feature NNN (tres dígitos, p. ej. 001 o 002)" >&2
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
  *)
    echo "[SDD Contract Compiler] Feature desconocida: $FEATURE (admitidas: 001, 002)" >&2
    exit 2
    ;;
esac
CONTRACTS_DIR="$FEATURE_DIR/contracts"

echo "[SDD Contract Compiler] Verificando existencia de contratos en $CONTRACTS_DIR/..."

if [[ "$FEATURE" == "001" ]]; then
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

CODEGEN_ARGS=(--contracts "$CONTRACTS_DIR")
if [[ -n "$OUT_DIR" ]]; then
  CODEGEN_ARGS+=(--out "$OUT_DIR")
  echo "[SDD Contract Compiler] Regenerando en $OUT_DIR..."
else
  echo "[SDD Contract Compiler] Regenerando src/generated/..."
fi
node scripts/codegen.mjs "${CODEGEN_ARGS[@]}"
