# Rebanada 4 — Validación clínica de Maggie (T268, US5)

- **Fecha:** 2026-11-13. **Despachada por:** Morpheus. Solo documentación; sin cambios en spec, contratos, `src/` ni `tests/`. T268 no se marca `[x]`: solo Neo.
- **Trazabilidad:** STATE-ALERT-001, REQ-REC2-002, REQ-REC2-003, ADR-002-15.

## 1. Alcance
(a) Un registro sin próxima fecha con otro posterior de la misma clave queda `SUPERSEDED` (ADR-002-15, `data-model.md` línea 117). (b) Campos `batchOrClinic`, `veterinarianName`, `veterinarianLicense`. (c) Inmutabilidad del reemplazado (REQ-REC2-003). Código leído: `src/domain/alerts/sanitary-alert-evaluator.ts`, `src/domain/records/superseded-guard.ts`, `src/domain/records/record-invariants.ts`.

## 2. Reglas verificadas
| # | Regla | Fuente | Código | Veredicto |
|---|---|---|---|---|
| R1 | Registro sin próxima fecha y sin posterior de la misma clave: fuera del semáforo (`alert: null`) | spec.md:213 (REQ-REC2-002 «no entra en la evaluación»); spec.md:287; data-model.md:117 | evaluator línea 94 (`target === null && !hasNewer` → `null`) | Conforme |
| R2 | Registro sin próxima fecha CON posterior de la misma clave: `SUPERSEDED`, no `null` | data-model.md:117; spec.md:287, 293 | evaluator línea 94 (`hasNewer` fuerza evaluación; `SUPERSEDED` va primero en el orden) | Conforme en código; **sin prueba directa** (H-1) |
| R3 | Un registro sin próxima fecha sí puede reemplazar a uno anterior | data-model.md:117 | `seen.add(key)` ocurre antes de evaluar el objetivo, sin condicionar a la fecha | Conforme |
| R4 | Clave: `vaccineName` con `trim().toLowerCase()`; en desparasitación, `dewormingType`; misma mascota | data-model.md:117 | `normalizeVaccineKey`, clave `petId + key` | Conforme |
| R5 | `SUPERSEDED` no se edita con ningún rol: 409 `ERR-REC-SUPERSEDED-IMMUTABLE` | spec.md:214 | `assertRecordNotSuperseded` | Conforme |
| R6 | Eliminar el posterior devuelve el anterior a vigente; no hay `supersedesId` | spec.md:214, 293 | Estado calculado en `evaluateByKey` | Conforme |
| R7 | `batchOrClinic` ≤ 120, `veterinarianName` ≤ 120, `veterinarianLicense` ≤ 60, los tres opcionales (nulos por defecto); colegiado sin patrón | spec.md:213; data-model.md:110-111 | Esquema generado vía `validateRecord` (límite exacto válido, +1 rechazado) | Conforme |
| R8 | Próxima fecha opcional; si existe, estrictamente posterior a `appliedAt` (INV-REC-004/005) | spec.md:213 | `record-invariants.ts` líneas 128 y 137 | Conforme |
| R9 | `SUPERSEDED` no cuenta en el resumen de alertas | spec.md:287 | `alertsSummary` ignora `SUPERSEDED` | Conforme |

## 3. Pruebas que las cubren
| Regla | Archivo | Prueba |
|---|---|---|
| R2/R4 (con fecha) | `tests/unit/pet-and-alerts.spec.ts` | «[STATE-ALERT-001] el registro antiguo queda SUPERSEDED aunque venza en 7 días…» (EDGE-036); «la clave de vacuna ignora mayúsculas y espacios extremos…»; «con la misma fecha de aplicación, decide createdAt y luego id»; «en desparasitación la clave es dewormingType» |
| R9 | `tests/unit/pet-and-alerts.spec.ts` | «el resumen cuenta OVERDUE, DUE_SOON y UP_TO_DATE, sin SUPERSEDED» |
| R1 | `tests/integration/api/pets-records.api.spec.ts` | «[STATE-ALERT-001][SC-015] semáforo… sin próxima fecha no entra (alert nulo)» |
| R5/R6 | `tests/unit/record-invariants.spec.ts` | «[REQ-REC2-003][ERR-REC-SUPERSEDED-IMMUTABLE] un registro SUPERSEDED lanza DomainError 409…» |
| R5/R6 | `tests/integration/api/pets-records.api.spec.ts` | «[REQ-REC2-003][SC-015]… editar un registro SUPERSEDED da 409 con el dueño, un ADMIN y un CAREGIVER…»; «[REQ-REC2-003] eliminar el registro posterior devuelve el anterior a vigente…» |
| R7 | `tests/unit/record-invariants.spec.ts` | «[REQ-REC2-002] una vacuna con lote, veterinario y colegiado es válida»; «lote ≤ 120, veterinario ≤ 120 y colegiado ≤ 60…» |
| R7 | `tests/integration/api/pets-records.api.spec.ts` | «[REQ-REC2-002] la vacuna acepta lote, veterinario y colegiado opcionales…»; «…61 caracteres… 422; 60, 120 y 120 se aceptan» |
| R8 | `tests/unit/record-invariants.spec.ts`; API | «[REQ-REC2-002] la próxima fecha es opcional…»; «[INV-REC-004][INV-REC-005]… estrictamente posterior» |

## 4. Ejecución
`npx vitest run tests/unit/record-invariants.spec.ts tests/unit/pet-and-alerts.spec.ts tests/integration/api/pets-records.api.spec.ts`: 107 pruebas, 104 pasan, 3 fallan. Las 3 fallas son de listado y filtro de mascotas (`GET /pets`, REQ-PET-005 y REQ-PET2-002; líneas ~302 del archivo de API), no de registros clínicos. Con `-t "REC2|SC-015|STATE-ALERT|INV-REC-004"`: 13/13 pasan. Las 3 fallas no son de T268, pero Oracle debe confirmar si ya existían (H-3).

## 5. Hallazgos
| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| H-1 | Media | No existe prueba que fije R2: registro anterior con `nextBoosterAt = null` y otro posterior de la misma clave debe dar `SUPERSEDED` (y aparecer en `supersededVaccinations`, e inmutable con 409). Las pruebas de `SUPERSEDED` usan solo registros con fecha. Una regresión al reescribir línea 94 pasaría en verde. | Keymaker añade prueba unitaria (vacuna y desparasitación) y una por API; es regla de la spec, no decisión de Neo |
| H-2 | Baja | Un `SUPERSEDED` sin próxima fecha se evalúa con fecha objetivo = hoy, de modo que su `alert.daysRemaining` sale `0`, un valor sin significado clínico (no hay fecha). No cuenta en el resumen y no se muestra como alerta, pero queda en el JSON. Además el comentario «T255 PENDIENTE» de la línea 92 del evaluador quedó obsoleto. | Pasar `daysRemaining` nulo o documentar que se ignora en `SUPERSEDED`; limpiar el comentario |
| H-3 | Baja | 3 pruebas de `GET /pets` fallan en el mismo archivo (ver 4). Fuera del alcance clínico de T268. | Oracle verifica origen antes de la compuerta T270 |
| H-4 | Informativa | La spec no fija umbral para colegiado más allá de ≤ 60 y sin patrón, ni exige que el veterinario o el lote sean obligatorios al declarar «aplicada». Se respeta la spec; no se inventa regla. | Ninguna |

Decisiones abiertas para Neo: ninguna nueva. Siguen vigentes P-1..P-5 de `rebanada-2-maggie.md` (fuera de T268).

## 6. Veredicto
**HALLAZGOS ABIERTOS:** H-1 (media), H-2 (baja), H-3 (baja, ajeno a T268). El comportamiento clínico es conforme a la spec (R1 a R9); falta prueba que fije R2.
