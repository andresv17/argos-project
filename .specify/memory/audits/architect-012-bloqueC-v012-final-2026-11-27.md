# Acta Architect — Feature 012, Bloque C (T1650/T1651/T1660), contratos 0.1.2 (DRAFT, NO APPROVED)

Fecha 2026-11-27. Base: bc91f63 (0.1.1). Resoluciones de Neo aprobadas por Logos. Sin APPROVED, sin `[x]`, sin commit, sin tocar `src/` ni logos.

## Archivos y versiones
| Archivo | Versión |
|---|---|
| `contracts/openapi/care.openapi.yaml` | 0.1.1 → 0.1.2 DRAFT |
| `contracts/schemas/care-routine.schema.json`, `care-log-entry.schema.json`, `caregiver-access.schema.json` | 0.1.1 → 0.1.2 DRAFT |
| `contracts/errors/error-catalog.json` | 0.2.0 → 0.3.0 (`status` APPROVED solo para lo existente; `ERR-CAR12-ROUTINE-STALE` DRAFT, marcada para Neo) |
| `contracts/errata-MINOR-ERR-CAR12-ROUTINE-STALE.md` | nuevo, DRAFT |
| `contracts/README.md`, `data-model.md`, `tasks.md` (solo la mención de ERR-CAR12-ROUTINE-STALE en T1650; sin `[x]`) | texto |
| `claude/deuda-012-validacion-vet-umbrales.md` | nuevo (T1660) |

## Cambios por resolución
1. **H-C1**: tres cubos por usuario y hora: `CARE_LOG_WRITES_PER_USER_PER_HOUR = 120` (registros), `CARE_ROUTINE_WRITES_PER_USER_PER_HOUR = 60` (rutinas y niveles, un solo cubo), `CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR = 30` (reversión, propio). 429 con `Retry-After` (`components.headers.RetryAfter`, `components.responses.RateLimited`) en todas las escrituras.
2. **H-C2**: `ERR-CAR12-ROUTINE-STALE` (409, cuerpo sin datos de la fila sustituida) en `updateCareRoutine`, `deactivateCareRoutine` y `setCaregiverAccess`; catálogo 0.3.0 MINOR, entrada DRAFT pendiente de Neo.
3. **H-C3/M-01/M-03**: solo titulares definen rutinas (incluida medicación) y conceden, cambian o retiran niveles (auditados); ADMIN del hogar excluido. Corregidas la matriz, `createCareRoutine`, `updateCareRoutine`, `deactivate`, `setCaregiverAccess`, `removeCaregiverAccess`, reversión (plazo y `reason`), `includeReverted`, autor visible, `revertedBy`, `SKIPPED`, `MyCareAccess`.
4. **T-C5**: MEMBER, READER y ADMIN sin acceso: 403 `ERR-ACC-FORBIDDEN` en lecturas de rutinas, hoy por mascota e historial (mismo cuerpo exista o no rutina); `/households/{id}/care/today` devuelve 200 con grupos vacíos. Leen titulares y cuidadores VIEW_ONLY/BASIC_LOG vigentes.
5. **T-C3**: `careUntil` inclusivo hasta 23:59:59 de America/Bogota del día indicado; deja de aplicar a las 00:00:00 del siguiente.
6. **R-1**: `data-model.md` ahora dice que `admin_audit_entries` (incluida `metadata`) se purga a 24 meses (migraciones 0038/0034, ya corregidas por keymaker en 8fa69f2). Barrido de 1095 en `research.md`, `data-model.md`, `spec.md`, `admin-disputes-annex.md`, `tasks.md`: los 1095 restantes son `ARBITER_AUDIT_RETENTION_DAYS` (expediente de disputa, `closed_at`, `person_id`) y retención de registros de medicación (1095 días): se quedan. Ningún texto atribuía 1095 a `admin_audit_entries` por nombre.
7. **T1660**: `claude/deuda-012-validacion-vet-umbrales.md` (IU, umbrales por especie, 15 min, TABLET; dictamen SKIPPED de Maggie ya emitido).
8. **H-C5**: `CareHouseholdToday.criticalAllergies` sigue nullable y `null` mientras REQ-QR12-002 (Bloque D) no exista; no se rompe nada.

## Gates
`verify-traceability.sh --feature 012` rc=0 (primero falló por huérfano ERR-CAR12-ROUTINE-STALE; resuelto citándolo en T1650); `verify-oracles.sh` rc=0; `compile-contracts.sh --feature 012` a directorio de ensayo rc=0.

## Interpretaciones y tensiones para Neo / Morpheus
- **ADMIN sin acceso de cuidado**: lectura estricta de T-C5 (solo titulares y cuidadores ven); por eso ADMIN tampoco define rutinas no médicas. Si Neo quiere que ADMIN defina MEAL/WALK/OTHER, es enmienda 0.1.3.
- **Cuidador con `careUntil` vencido** conserva lectura VIEW_ONLY por defecto (REQ-CAR12-006, sin cambio); confirmar que es lo deseado.
- **Tensión R-1 vs 1095**: `spec.md` REQ-CHP12-007, `admin-disputes-annex.md` y `data-model.md` (fila «Auditoría 012») dicen que el motivo libre de la decisión se purga junto con la auditoría a 1095 días, pero el motivo vive en `admin_audit_entries.metadata`, purgada a 24 meses. Decidir si el motivo se purga a 24 meses (efectivo) o se requiere otra tabla; no lo cambié (norma de Neo).
- **spec.md desactualizada** respecto de los contratos: REQ-CAR12-001/003 y SC-012-033 dicen «propietario o ADMIN». Pendiente de enmienda de spec (fuera de esta misión).
- ERR-CAR12-ROUTINE-STALE y los contratos 0.1.2: aprobación de Neo pendiente.
