# Acta /architect — Bloque B v0.8 (feature 012, #23), decisiones de Neo (Nivel 2, 2026-11-27) sobre `v0.7`

- Solo DRAFT; sin commits, sin `[x]`, sin `APPROVED`. No se tocó `src/`, `tests/`, `scripts/`, specs 001/004/005, H-01 ni logos. No se ejecutó compile-contracts.

| Decisión de Neo | Cambio aplicado | Archivos |
| --- | --- | --- |
| 1. N-A `person_id` | Identificador opaco de persona física verificada, asignado por SUPER_ADMIN; no colisión por correo verificado y revisión manual; si falta o coincide con el resolutor, falla cerrada con `ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`. Marcador PENDIENTE retirado | data-model.md, admin-disputes-annex.md §7.1, admin-disputes.schema.json (`PersonId`), admin-disputes.openapi.yaml |
| 2. N-C aviso | Desenlace `RESOLVED_APPROVED` / `RESOLVED_REJECTED` / `EXPIRED`; fecha = `closed_at` (también EXPIRED); sin identidad de la otra parte ni del árbitro | annex §9, spec REQ-CHP12-010, schema (`DisputeResolutionNotice` enum), OpenAPI |
| 3. N-D actors | Nuevo `AdminActorView` (alias y rol); `AdminDisputeFile.actors` lo usa; adminId/personId solo SUPER_ADMIN; `AdminActorColumns` queda como forma de BD | annex §4, schema, OpenAPI, spec REQ-CHP12-007 |
| 4. N-E ancla | `ARBITER_AUDIT_RETENTION_DAYS` desde `closed_at`; motivo libre (≤ 500) purgado con la auditoría | annex §8, spec REQ-CHP12-007, data-model (matriz), schema |
| 5. SC-012-120 | CONFIRMADA; marcador de propuesta retirado; mapeo en T1641 (frase) | spec.md, tasks.md (T1641), annex §5.1 |
| 6. Constantes | `ADMIN_STEPUP_WINDOW_MINUTES = 5` y `DECISION_REASON_MAX_CHARS = 500` FIJADAS (value en x-sdd-constants de admin-disputes) | spec.md l.202, admin-disputes.schema.json, OpenAPI, annex §7.3/§10 |
| 7. Falta de step-up | 403 genérico de /admin, sin código de catálogo nuevo (catálogo intacto) | OpenAPI (descripción y respuesta 403), annex §7.3/§10 |
| 8. Píxeles y antimalware | `DISPUTE_EVIDENCE_MAX_PIXELS = 16000000`; ClamAV tras `MalwareScannerPort` (sidecar, sin npm nueva); aprovisionamiento = condición bloqueante de release en producción; adaptador determinista en dev/CI | chip-claim.schema.json, chip-claim.openapi.yaml, annex §5.1, spec l.202, tasks.md T1641 |

Gates: JSON y YAML válidos; `bash scripts/verify-traceability.sh --feature 012` rc=0; `bash scripts/verify-oracles.sh` rc=0.
