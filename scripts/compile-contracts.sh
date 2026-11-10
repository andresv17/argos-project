#!/usr/bin/env bash
# Compilador determinista de contratos formales hacia src/generated/ [INV-ARCH-003]
set -euo pipefail

echo "[SDD Contract Compiler] Verificando existencia de contratos en specs/001-pet-health-tracker/contracts/..."

REQUIRED_CONTRACTS=(
  "specs/001-pet-health-tracker/contracts/schemas/common.schema.json"
  "specs/001-pet-health-tracker/contracts/schemas/identity.schema.json"
  "specs/001-pet-health-tracker/contracts/schemas/pet.schema.json"
  "specs/001-pet-health-tracker/contracts/schemas/medical-records.schema.json"
  "specs/001-pet-health-tracker/contracts/schemas/backup-envelope.schema.json"
  "specs/001-pet-health-tracker/contracts/openapi/pet-tracker-api.openapi.yaml"
  "specs/001-pet-health-tracker/contracts/state-machines/auth-session.machine.json"
  "specs/001-pet-health-tracker/contracts/state-machines/household-membership.machine.json"
  "specs/001-pet-health-tracker/contracts/state-machines/sanitary-alert.machine.json"
  "specs/001-pet-health-tracker/contracts/state-machines/backup-import.machine.json"
  "specs/001-pet-health-tracker/contracts/errors/error-catalog.json"
  "specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json"
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
