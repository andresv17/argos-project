# Acta /architect — Feature 012, Bloque C DRAFT (T1650) + resoluciones H-02/H-03/H-04 — 2026-11-27

Mandato: Morpheus, decisiones de Neo (Nivel 2) del 2026-11-27. Solo local; sin commit, sin push, sin `[x]`, sin `APPROVED` nuevo, sin tocar `src/`, `logos.*`, archivos de `H-01` ni `specs/005/tasks.md`.

## 1. H-04 — `CHIP_DISPUTE_BODY_MAX_BYTES = 15728640` (errata MINOR, `APPROVED` conservado)
- `contracts/schemas/chip-claim.schema.json`: `x-sdd-metadata.version` 0.2.0 → **0.2.1** (status `APPROVED` y `change_type` MINOR intactos); `x-sdd-constants.CHIP_DISPUTE_BODY_MAX_BYTES.value` `null` → `15728640`, regla reescrita; nota 0.2.1 en `change_note`.
- Errata: `contracts/errata-MINOR-CHIP-DISPUTE-BODY-MAX-BYTES.md` (formato de `errata-MINOR-ChipClaimMicrochipId.md`).
- Coherencia: `feature-012-limits.ts:63` ya vale `15_728_640` (sin trabajo de código). `chip-claim.openapi.yaml` solo cita el nombre de la constante.
- Nota: la versión del catálogo `error-catalog.json` (0.2.0) no se tocó; la alineación 0.2.0 de iteraciones previas era entre schema y catálogo, y el schema pasa a 0.2.1 por esta errata (no hay validación que las exija iguales: `compile-contracts` solo exige semver).

## 2. H-02 opción (b) — `quickstart.md`
Nueva sección «Operación inicial de `/admin` para la cola de disputas (`T1637`)»: operación inicial de `SUPER_ADMIN` raíz (`ARGOS_ADMIN_EMAILS` + primer acceso con Google), delegado para el control dual (`inviteAdminDelegate`, 011), `UPDATE admin_identities SET person_id = ...` manual (SQLite local; PostgreSQL por Neo en producción), comprobación y límites (sin ruta ni UI; falla cerrada sin `person_id`). Sin código ni ruta nueva.

## 3. H-03 opción (b) — `claude/deuda-012-admin-stepup-prod.md`
`DEUDA-012-ADMIN-STEPUP-PROD`, bloqueante de release: reautenticación OIDC real + almacén de grants compartido en PostgreSQL antes de habilitar `/admin/disputes` en Cloud Run multi-instancia; lista junto a ClamAV y `DEUDA-012-LEGAL-DISPUTAS-QR` como condiciones conjuntas.

## 4. Bloque C DRAFT (T1650) — contratos nuevos, todos `status: DRAFT` 0.1.0
| Archivo | Contenido |
| --- | --- |
| `contracts/openapi/care.openapi.yaml` | 15 operaciones: rutinas (`listCareRoutines`, `createCareRoutine`, `getCareRoutine`, `updateCareRoutine` con versionado, `deactivateCareRoutine`), pendientes (`getPetCareToday`, `getHouseholdCareToday`), registro (`listCareLog`, `createCareLogEntry` 200 mismo autor / 409 otro autor, `revertCareLogEntry`), niveles (`listCaregiverAccess`, `getMyCareAccess`, `setCaregiverAccess`, `removeCaregiverAccess`) |
| `contracts/schemas/care-routine.schema.json` | `CareKind`, `DoseUnit` (`MG\|MCG\|ML\|TABLET\|DROP`, sin `UNIT`), `CareRoutine` (una fila por versión, `supersedesRoutineId`, `effectiveFrom/To`), `Create/UpdateCareRoutineRequest` (`confirmHighDose`, `expectedVersion`), `RoutineWriteResult`, constantes (`MAX_ROUTINES_PER_PET` 20, `MAX_ROUTINE_ROWS_PER_PET` 100, paso `TABLET` 0,25, umbrales, retenciones, `CARE_TIMEZONE`) |
| `contracts/schemas/care-log-entry.schema.json` | `CareLogEntry` (autor según rol, `late`, dosis al registrar), `CareOccurrence` (sin instrucciones en `OVERDUE`), `CarePendingToday`, `CareHouseholdToday`, `CreateCareLogEntryRequest`, `RevertCareLogEntryRequest`, `CareLogConflict` (409 con autor y hora), `CareLogPage`; constantes `OVERDUE_GRACE_MINUTES` 60, `CARE_LOG_UNDO_MINUTES` 10, `CARE_LOG_BACKFILL_HOURS` 24 |
| `contracts/schemas/caregiver-access.schema.json` | `CaregiverLevel` (`VIEW_ONLY\|BASIC_LOG`), `CaregiverAccess`, `SetCaregiverAccessRequest` (`careUntil`), `MyCareAccess` (`clinicalPermissionsUnchanged` const true) |
- **Sin enmienda a `REQ-RBAC-001`** (`D12-10 = A`, `Neo-B`, `EDGE-012-049`): documentado en el OpenAPI y en `MyCareAccess`.
- `D12-11` (catálogo, paso 0,25, `endDate` o `ongoing`, versionado `effective_from`/`supersedes_routine_id`, `revert_reason`) y `D12-12 = B` (`America/Bogota`, `DEUDA-012-TZ`) trasladados a contrato.
- `ERR-CAR12-ALREADY-LOGGED`, `ERR-CAR12-OUT-OF-WINDOW` y `ERR-CAR12-ROUTINE-LIMIT` **ya existen** en `errors/error-catalog.json` (T1610, aprobado); sus cuerpos (status, detalle, nota) ya cubren el Bloque C y **no se editaron**: el catálogo `APPROVED` queda intacto. El 409 de `ALREADY-LOGGED` lleva `existing` (autor, hora) vía `CareLogConflict`, como anticipa la nota del catálogo.
- `contracts/README.md`: fila de T1650 marcada `DRAFT 0.1.0`.

## 5. Hallazgos y puntos abiertos (para Neo / `/maggie` / `/trinity` en T1651)
- **H-C1 (Neo, Nivel 2)**: constantes de límite de escritura PROPUESTAS en el OpenAPI (`CARE_LOG_WRITES_PER_USER_PER_HOUR = 120`, `CARE_ROUTINE_WRITES_PER_USER_PER_HOUR = 60`); hay que decidir si existen y sus valores; no están en `spec.md`.
- **H-C2 (Neo)**: conflicto de versión de rutina/nivel usa `ERR-PET-VERSION-CONFLICT` (heredado de 004) para no reabrir el catálogo aprobado. Alternativa: `ERR-CAR12-ROUTINE-STALE` con enmienda MINOR del catálogo (nueva versión DRAFT) y traza en `tasks.md`. Se recomienda mantener la herencia salvo que `/trinity` objete.
- **H-C3 (Neo / `/zion`)**: quién administra los niveles: el contrato dice solo propietario principal y co-propietario ACTIVE (`data-model.md` §retención: «Propietarios»); `REQ-CAR12-001` admite también `ADMIN` del hogar para rutinas. Decidir si `ADMIN` concede niveles.
- **H-C4 (`/maggie`)**: `SKIPPED` para `BASIC_LOG` (`EDGE-012-048`, dictamen pendiente) está contratado como permitido, tal como dice `REQ-CAR12-003`; y propietarios/ADMIN no tienen límite inferior de fecha (solo futuras se rechazan para todos); la spec limita explícitamente a cuidadores.
- **H-C5 (`/sati`/`/keymaker`)**: `CareHouseholdToday.criticalAllergies` depende de `REQ-QR12-002` (Bloque D); queda `null` hasta que exista el campo.
- **H-C6 (tooling)**: `scripts/codegen.mjs` toma solo el primer `*.openapi.yaml` por directorio (`find`); `care.openapi.yaml` no genera tipos de rutas aunque sus `$defs` sí entran a `types.ts` (19 coincidencias). Mismo límite preexistente de `co-ownership`/`chip-claim`; no bloquea el DRAFT. Aviso para `/keymaker` al implementar T1652+.

## 6. Gates y verificación
- JSON de los 4 schemas parsea; `care.openapi.yaml` parsea con `yaml` y todos sus `$ref` entre archivos resuelven (0 rotos).
- `bash scripts/compile-contracts.sh --feature 012 --out <scratchpad>`: rc=0 (no escribe en `src/generated/`).
- `bash scripts/verify-traceability.sh --feature 012`: rc=0 (CUMPLE; 298/298 IDs propios mapeados).
- `bash scripts/verify-oracles.sh`: rc=1 por **2 oráculos débiles ajenos** en `tests/integration/persistence/h01-admin-audit-metadata-012.spec.ts:41,79` (archivo sin seguimiento del trabajo H-01 de `/keymaker`; no lo toqué ni lo toco). Sin relación con estos contratos.

## 7. Archivos tocados (lista exacta para el commit selectivo de `/keymaker`)
Modificados: `specs/012-multiduenio-microchip-cuidador/contracts/schemas/chip-claim.schema.json`, `specs/012-multiduenio-microchip-cuidador/quickstart.md`, `specs/012-multiduenio-microchip-cuidador/contracts/README.md`.
Nuevos: `specs/012-multiduenio-microchip-cuidador/contracts/errata-MINOR-CHIP-DISPUTE-BODY-MAX-BYTES.md`, `specs/012-multiduenio-microchip-cuidador/contracts/openapi/care.openapi.yaml`, `specs/012-multiduenio-microchip-cuidador/contracts/schemas/care-routine.schema.json`, `specs/012-multiduenio-microchip-cuidador/contracts/schemas/care-log-entry.schema.json`, `specs/012-multiduenio-microchip-cuidador/contracts/schemas/caregiver-access.schema.json`, `claude/deuda-012-admin-stepup-prod.md`, `.specify/memory/audits/architect-012-bloqueC-draft-2026-11-27.md`, más bitácoras `claude/log-architect.md` y `claude/registro-proceso-argos.md`.
**No incluir** `specs/012-multiduenio-microchip-cuidador/tasks.md` (modificado por otros; yo no lo toqué).
