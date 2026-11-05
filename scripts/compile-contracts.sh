#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "[SDD Contract Compiler] Verificando existencia de contratos formales en contracts/..."

REQUIRED_CONTRACTS=(
  "contracts/schemas/pet.schema.json"
  "contracts/schemas/medical-records.schema.json"
  "contracts/schemas/backup-envelope.schema.json"
  "contracts/openapi/pet-tracker-api.openapi.yaml"
  "contracts/state-machines/sanitary-alert.machine.json"
  "contracts/errors/error-catalog.json"
  "contracts/examples/canonical-fixtures.json"
)

for contract in "${REQUIRED_CONTRACTS[@]}"; do
  if [[ ! -f "$contract" ]]; then
    echo "[ERROR] Contrato obligatorio faltante: $contract" >&2
    exit 1
  fi
done

echo "[SDD Contract Compiler] Todos los contratos en estado LOCKED han sido verificados."
echo "[SDD Contract Compiler] Sincronizando artefactos en src/generated/..."
mkdir -p src/generated
node scripts/codegen.mjs
