#!/usr/bin/env bash
# Auditor determinista de trazabilidad (Lineage IDs) y pureza de dominio [INV-ARCH-001, INV-ARCH-002]
set -euo pipefail

echo "[SDD Traceability Gate] Verificando IDs de trazabilidad obligatorios..."

REQUIRED_IDS=(
  "REQ-PET-001" "REQ-PET-002" "REQ-PET-003"
  "REQ-REC-001" "REQ-REC-002" "REQ-REC-003" "REQ-REC-004" "REQ-REC-005" "REQ-REC-006"
  "REQ-UI-001" "REQ-UI-002" "REQ-UI-003" "REQ-UI-004"
  "REQ-BACKUP-001" "REQ-BACKUP-002"
  "INV-PET-001" "INV-PET-002" "INV-PET-003" "INV-PET-004"
  "INV-REC-001" "INV-REC-002" "INV-REC-003" "INV-REC-004" "INV-REC-005" "INV-REC-006"
  "INV-SORT-001" "INV-BACKUP-001"
  "STATE-ALERT-001" "STATE-BACKUP-001" "STATE-PET-QUOTA-001"
  "ERR-SCHEMA-VALIDATION-FAILED" "ERR-PET-QUOTA-EXCEEDED" "ERR-PET-NOT-FOUND"
  "ERR-PET-FUTURE-BIRTHDATE" "ERR-REC-DATE-BEFORE-BIRTH" "ERR-REC-FUTURE-EVENT-DATE"
  "ERR-REC-WEIGHT-OUT-OF-RANGE" "ERR-REC-MEASUREMENT-OUT-OF-RANGE"
  "ERR-REC-INVALID-BOOSTER-DATE" "ERR-REC-INVALID-NEXT-DOSE-DATE"
  "ERR-BACKUP-MALFORMED-JSON" "ERR-BACKUP-VERSION-UNSUPPORTED"
  "ERR-BACKUP-SCHEMA-INVALID" "ERR-BACKUP-REFERENTIAL-INTEGRITY"
)

MISSING=0
for id in "${REQUIRED_IDS[@]}"; do
  if ! grep -rq "$id" src/ 2>/dev/null; then
    echo "[TRACEABILITY FAIL] ID $id no referenciado en src/" >&2
    MISSING=1
  fi
  if ! grep -rq "$id" tests/ 2>/dev/null; then
    echo "[TRACEABILITY FAIL] ID $id no verificado en tests/" >&2
    MISSING=1
  fi
done

echo "[SDD Purity Gate] Verificando ausencia de entropía directa en src/domain/ y src/application/..."
if grep -rnE "Date\.now\(|new Date\(|Math\.random\(|crypto\.randomUUID\(" src/domain/ src/application/ 2>/dev/null; then
  echo "[PURITY FAIL] Violación de INV-ARCH-001 / INV-ARCH-002: Uso directo de reloj o generador aleatorio detectado." >&2
  exit 1
fi

if [[ "$MISSING" -ne 0 ]]; then
  echo "[SDD Traceability Gate] Fallo: Existen IDs de especificación sin cobertura en src/ o tests/." >&2
  exit 1
fi

echo "[SDD Traceability Gate] 100% de los IDs trazados y pureza de dominio verificada."
