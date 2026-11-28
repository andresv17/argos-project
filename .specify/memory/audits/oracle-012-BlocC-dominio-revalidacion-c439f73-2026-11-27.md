# Acta Oracle — Feature 012, Bloque C: revalidación del dominio y las rojas (3e9aae5..c439f73, 2026-11-27)

Solo lectura sobre `src/` y `specs/`. MAX_RETRY=1. Base: acta `oracle-012-BlocC-rojas-T1653-T1654-2026-11-27.md`.

**Veredicto: CUMPLE CON RESERVAS.** Todos los hallazgos exigidos están cerrados. Reservas: el mapeo especie a grupo de dosis no está definido en el contrato (decisión pendiente) y quedan huecos menores de cobertura (R-8 parcial, F6 sin hacer, R-5 y R-3 pendientes de T1656 por diseño).

## 1. Cierre por hallazgo
| ID | Estado | Evidencia |
| --- | --- | --- |
| F1 | CERRADO | `src/domain/care/care-routine.ts:25-34` (`DOSE_CONFIRM_THRESHOLDS` por grupo; OTHER_SPECIES `{}`; IU sin umbral), `:68` `validateDose(..., speciesGroup)`, `:84` y `:131` firmas con `speciesGroup`; prueba `tests/unit/care-domain-012.spec.ts:118-125` |
| F2 | CERRADO | `care-routine.ts:131` `newId` parámetro, `:151` `id: newId`; prueba `care-domain-012.spec.ts:183-185` (`next.id === NEW_ID`), `:30` |
| F3 | CERRADO | `rc` de `verify-traceability.sh --feature 012` = 0, pureza 0; grep de `new Date(`/`Date.now`/`randomUUID`/`Math.random`/`process.env` en `src/domain/care` y `feature-012-limits.ts` = sin coincidencias; aritmética civil en `care-time.ts:14-26` |
| F4 | CERRADO (en pruebas) | `tests/fixtures/care-012.ts:5` (`{ entry, created }`, `{ access, created }`); `tests/integration/care-parity-012.spec.ts:172-173` (201/200 registro), `:249-253` (concesión/reemplazo) |
| F5 | CERRADO | `src/domain/care/care-log.ts:65` `parseCareLogLimit`; prueba `care-domain-012.spec.ts:429-434` |
| F6 | NO HECHO (BAJA, opcional) | sigue previsto `care-routine-use-cases.ts` agrupado; sin efecto en gates |
| F7 | CERRADO | `tests/fixtures/care-repository-contract-suite.ts` (121 líneas, 5 casos: rutinas, 3 decimales/100000, UNIQUE parcial, performed_by NULL, caregiverAccess); enganchada en `tests/unit/use-cases.memory-repositories.spec.ts:12`, `tests/integration/persistence/sqlite-repositories.spec.ts:58`, `postgres-repositories.spec.ts:95` (3 motores) |
| R-1 | CERRADO | `care-parity-012.spec.ts:34,46` (`setNow(EARLY)` al arrancar) y reloj siempre avanza (`:104,116,118,158..221,236,238`) |
| R-4 | CERRADO | `tests/fixtures/care-012.ts:67-68` (`deps.sharing` con `SequentialShareTokenGenerator`, `SHARE_IP_SECRET`, `SharedAccessLimiter`) |
| R-6 | CERRADO | `care-parity-012.spec.ts:289` `expect(text).toContain('Argos')` |
| R-7 | CERRADO | `care-parity-012.spec.ts:261-277` (orden INV-SORT-001, cursor de otra mascota 422, filtros) |
| R-8 | CERRADO PARCIAL | cubiertos: DoseAmount 100000/100000,001 (`care-domain-012.spec.ts:127-131`), `careUntil` pasado 422 (`parity:254`), revertir revertido 200 (`:218`), cuidador ve su mascota (`:130`), `ERR-HOUSE-NOT-FOUND` (`:299`), fronteras en segundos (`unit:348`). Siguen sin prueba (BAJA): `created_by`/`granted_by` a NULL (SC-012-076; solo `performed_by` en la suite de repos), carrera real de doble registro con `ConcurrentEngine`, rol MEMBER en integración |
| R-2 | CERRADO | `care-occurrences.ts:78`: `if (r.supersedesRoutineId && ms < Date.parse(r.effectiveFrom)) continue;` (v1 rige desde `startDate` 00:00 Bogotá por `startDate > date` en `:68`; v2+ desde `effectiveFrom`; cierre `effectiveTo` exclusivo en `:77`). Prueba `care-domain-012.spec.ts:268-273` |
| R-3 | CONFORME | sin limitador en `src/domain/care/` ni casos de uso (aún inexistentes); la prueba de 100 filas (`parity:78-86`) hace 99 escrituras del mismo usuario sin avanzar reloj, por lo que **T1655 NO debe poner limitador en casos de uso**; los 429 de los tres cubos (120/60/30) quedan para T1656 |
| R-5 | PENDIENTE T1656 | prueba HTTP 422 de campos forjados (`additionalProperties:false`) |

## 2. Pureza
- `src/domain/care/*` y `feature-012-limits.ts`: 0 violaciones (gate: "Violaciones de pureza: 0").
- `care-time.ts` y `care-routine.ts`: sin `new Date()`, `Date.now`, `randomUUID` ni `Math.random` (grep rc=1, sin coincidencias; también sin `process.env`). Solo `Date.parse(iso)` (determinista, sin reloj) en `care-time.ts:30`, `care-occurrences.ts`, `care-log.ts`.

## 3. Mapeo de especies a grupo de dosis: FALTA (no decidido)
`care-routine.schema.json` (`DOSE_CONFIRM_THRESHOLDS`, `rule`, líneas 40-60) define los dos grupos y describe `OTHER_SPECIES` en prosa ("conejo, hurón, ave, reptil, pequeño mamífero, otras"); `CANINE_FELINE` queda implícito (canino y felino). No hay tabla ni función normativa en el contrato, `data-model` ni `care.openapi.yaml`. El enum de código es `SPECIES = CANINE, FELINE, RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER` (`src/domain/pet/species.ts:14`), así que la lectura natural es CANINE/FELINE a CANINE_FELINE y el resto a OTHER_SPECIES, pero no está escrito. El dominio recibe `speciesGroup` ya resuelto: la función `speciesToDoseGroup` aún no existe. Se reporta sin decidir: necesita una línea en el contrato (Architect) antes de T1655 tramo 2.

## 4. Gates (rc reales)
| Gate | rc | Resultado |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run tests/unit/care-domain-012.spec.ts` | 0 | 57/57 |
| `bash scripts/verify-traceability.sh --feature 012` | 0 | CUMPLE; 299/299 mapeados; 115/340 trazados; pureza 0 |
| `bash scripts/verify-oracles.sh` | 0 | 662 archivos, 0 oráculos débiles |
| `npx tsc --noEmit` | 2 | 5 errores, todos en `tests/fixtures/care-012.ts` (22, 23: módulos `care-routine-use-cases.ts` y `care-log-use-cases.ts`; 123-125: `careRoutines`, `careLog`, `caregiverAccess` ausentes en `RepositorySet`). Todos son T1655 pendiente; 0 fuera de ese archivo |

## 5. Observaciones menores (sin bloqueo)
- `computeCareOccurrences` anula `instructions` si el estado es OVERDUE (`care-occurrences.ts:91`); confirmar con el contrato `care.openapi.yaml` al implementar HTTP (no verificado aquí).
- El ancla de retención de rutinas inactivas (T1661) sigue distinta entre data-model y `x-sdd-constants` (nota previa, abierta).
