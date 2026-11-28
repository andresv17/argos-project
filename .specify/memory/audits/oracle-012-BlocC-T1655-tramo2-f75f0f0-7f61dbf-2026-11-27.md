# Acta Oracle — 012 Bloque C, T1655 tramo 2 (f75f0f0..7f61dbf) — 2026-11-27
Solo lectura. Veredicto: **CUMPLE CON RESERVAS** (0 bloqueantes de seguridad; 1 desviación de contrato a corregir o enmendar; 3 decisiones para Neo).

## 1. Gates (rc reales, PG17 real en 127.0.0.1:55432)
| Gate | rc | Resultado |
| --- | --- | --- |
| vitest care-domain + care-parity + care-species-group + use-cases.memory-repositories, SIN TEST_DATABASE_URL | 0 | 163 ok, 20 omitidas (PG) |
| mismo set CON TEST_DATABASE_URL | 0 | 183/183, 0 omitidas (PG real) |
| sqlite-repositories + postgres-repositories con TEST_DATABASE_URL | 0 | 142/142 |
| npx tsc --noEmit | 0 | limpio |
| verify-oracles.sh | 0 | 663 archivos, 0 débiles |
| verify-traceability.sh --feature 012 | 0 | CUMPLE, pureza 0 |

## 2. Alcance (punto 8)
15 archivos en el rango: ports (care.port, repositories.port), 3 casos de uso/soporte, repos memoria/SQLite/PG (+UoW memoria, sqlite/postgres-repositories), dominio care-species-group, 3 archivos de tests/fixtures. Ningún commit toca app.ts, server.ts, app-config.ts, origin-verify*, .env.example, deploy-argos.yml, terraform/*, specs/005, specs/009-*, logos.*, claude/*.md. Sin rutas HTTP ni UI. Sin limitador en casos de uso (R-3 conforme; grep limiter/rate: 0).

## 3. Interpretación 1 — GetHouseholdCareToday omite mascotas sin rutinas
Contrato (care.openapi.yaml `getHouseholdCareToday`; schema `CareHouseholdToday`): el criterio de inclusión es el acceso de cuidado del solicitante ("solo las mascotas asignadas ... sobre las que el solicitante tiene acceso"). No menciona rutinas; `items` no tiene minItems (lista vacía válida). Spec REQ-CAR12-005: vista por hogar con nombre, pendientes y botón; no exige ni excluye mascotas sin rutinas. La línea `care-routine-use-cases.ts` (`if (listByPet(...).length === 0) continue`) es un filtro adicional no pedido por el contrato; ninguna prueba lo cubre (R-8 línea 133 usa una mascota CON rutina). Texto literal: aparecen las mascotas con acceso; el filtro las oculta.
Clasificación: **ACEPTABLE CON RESERVA (no bloqueante)**: no expone datos ni afecta autorización; es divergencia de contenido. Pero no está amparada. Recomendación: eliminar la línea (mascota con acceso y sin rutinas = grupo con `items: []`) o, si Neo prefiere ocultarlas, enmendar el contrato con: "Solo se incluyen mascotas con al menos una rutina; una mascota sin rutinas no aparece". Decide Neo/Architect; añadir prueba en cualquier caso.

## 4. Interpretación 2 — tope de 100 filas antes de validar la captura (update)
`UpdateCareRoutineUseCase`: si el parche versionaría (dosis, unidad u horarios distintos) y totalRows >= 100, devuelve ERR-CAR12-ROUTINE-LIMIT (409) antes de `planRoutineUpdate` (que valida y daría 422). Spec SC-012-037 y data-model (m-1) fijan el tope pero NO el orden frente a 422; care.openapi.yaml da "orden de comprobación" explícito para log, revert y niveles pero NO para POST/PATCH de rutinas. Además hay inconsistencia interna: en Create el orden es validar (422) y luego capacidad (409); en Update es capacidad (409) y luego validar (422). La prueba parity:80-89 (versionar con 100 filas = LIMIT) es válida con ambos órdenes (el parche es válido).
Clasificación: **DECISIÓN PENDIENTE (Neo/Architect), no bloqueante**. Pedir: fijar en el contrato un orden único para rutinas (propuesta: potestad 403 -> existencia 404 -> esquema/dominio 422 -> STALE/LIMIT 409, uniforme en create y update) y alinear código. Hoy el 409 revela solo un conteo propio del titular (sin fuga).

## 5. Cambios en pruebas (T1654)
(a) Regex SC-012-039 `/care(Routine|Log)|caregiverAccess|pet_caregiver/i` (antes `caregiver`): **ACEPTABLE CON RESERVA**. El cambio es necesario (el literal CAREGIVER_REPORTED_NOT_VERIFIED, dataProvenance preexistente, hacía falso positivo). El oráculo sigue sostenido por las centinelas RUTINA-SECRETA-ZZ y NOTA-SECRETA-ZZ y el control positivo 'Argos' (R-6); la regex sola detecta menos nombres de campo (no `careUntil`, `routines`, `occurrenceDate`, `doseAmount`). Sugerencia de refuerzo no bloqueante: añadir `careUntil|occurrenceDate|"routines"`.
(b) SC-012-076 desasigna las mascotas de MARIA antes de borrar su cuenta: **ACEPTABLE**. La regla de bloqueo (ERR-ACCOUNT-OWNS-SHARED-PETS, account-use-cases.ts:149) es de 002/004, preexistente y ajena al Bloque C; SC-012-076 prueba que la supresión pone performed_by en NULL, retira filas de acceso y el titular ve «Usuario eliminado». La prueba conserva esos tres asertos. El bloqueo mismo no es objeto de 012. Brecha BAJA arrastrada: created_by/granted_by a NULL al borrar al TITULAR sigue sin prueba (R-8 previo).
(c) R-7 cursor con otra mascota de ANDRES (ANDRES_PETS distinta de PET): **ACEPTABLE y más correcto**. Con LUNA (de MARIA) ANDRES recibe 403/404 antes de decodificar el cursor, por contrato (potestad precede), así que el aserto original no probaba el atado; ahora sí prueba que el checksum ata petId (422 uniforme).

## 6. Mapeo de especie (punto 4)
`care-species-group.ts` lleva cabecera "PENDIENTE APROBACIÓN NEO" con la propuesta (CANINE, FELINE -> CANINE_FELINE; resto -> OTHER_SPECIES). Único uso en src: `care-routine-use-cases.ts` líneas 46 y 88, ambas para `validateCareRoutine`/`planRoutineUpdate` (guarda de umbrales de dosis). Nada más depende. Sigue siendo decisión de Neo (y escritura del contrato por Architect).

## 7. Persistencia (punto 5)
SQLite y PG: `care_log_entries` sin pet_id ni dosis; ENTRY_SELECT hace JOIN a `care_routines` por `routine_id` y toma pet_id/dose_amount/dose_unit; el caso de uso guarda `routineId = covering.id` (versión que cubre la ocurrencia, A-04), por lo que la dosis histórica es la de esa versión. UNIQUE parcial `care_log_entries_occurrence (series_id, occurrence_date, occurrence_time) WHERE reverted_at IS NULL` presente en migraciones 0039 (SQLite) y 0035 (PG); la memoria lo imita con el mismo mensaje y `isUniqueViolationOf` lo traduce a ERR-CAR12-ALREADY-LOGGED en los 3 motores. Paridad verificada en PG real (183/183).

## 8. Autoría, servidor, bloqueo, acceso (punto 6)
- Autor, performedAt y late salen de actor/reloj/`assertLogWindow`; la prueba parity:108-112 envía performedAt/performedByUserId/late forjados y no afectan. Rutinas: `validateCareRoutine` es lista blanca (id, seriesId, createdBy, version, active no se toman del cliente).
- `lockPet` precede a toda escritura (create/update/deactivate rutina, set/remove nivel, log, revert).
- Acceso recalculado desde BD por petición (`careAccessOf`: coOwners, memberships, assignments, accessRows), sin caché.
- Orden de comprobación de log/revert/niveles coincide con el contrato (403 -> 404 -> 422 -> 409; destino 404 antes de 422/409).
Observaciones menores: `CareHouseholdToday.pets` maxItems 50 no se aplica (el hogar tendría que superar 50 mascotas); la lectura (`ListCareRoutines`, `today`) no usa lockPet (correcto, solo lectura).

## 9. Decisiones que son de Neo
1. Interpretación 1: quitar el filtro (recomendado) o enmendar el contrato.
2. Interpretación 2: fijar el orden 409/422 de rutinas (y alinear create con update).
3. Mapeo especie -> grupo de dosis (PENDIENTE desde c439f73).
No se marca [x] ni APPROVED; T1655 sigue `[ ]` (T1656/T1659 pendientes).
