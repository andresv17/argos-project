#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
set -euo pipefail

echo "[SDD Contract Compiler] Verificando existencia de contratos en contracts/..."

REQUIRED_CONTRACTS=(
  "contracts/schemas/common.schema.json"
  "contracts/schemas/identity.schema.json"
  "contracts/schemas/pet.schema.json"
  "contracts/schemas/medical-records.schema.json"
  "contracts/schemas/backup-envelope.schema.json"
  "contracts/openapi/pet-tracker-api.openapi.yaml"
  "contracts/state-machines/auth-session.machine.json"
  "contracts/state-machines/household-membership.machine.json"
  "contracts/state-machines/sanitary-alert.machine.json"
  "contracts/state-machines/backup-import.machine.json"
  "contracts/errors/error-catalog.json"
  "contracts/examples/canonical-fixtures.json"
)

for contract in "${REQUIRED_CONTRACTS[@]}"; do
  if [[ ! -f "$contract" ]]; then
    echo "[ERROR] Contrato obligatorio faltante: $contract" >&2
    exit 1
  fi
done

echo "[SDD Contract Compiler] ${#REQUIRED_CONTRACTS[@]} contratos presentes (se verifica existencia; el estado de cada uno se imprime al generar)."
echo "[SDD Contract Compiler] Regenerando src/generated/..."
node scripts/codegen.mjs
