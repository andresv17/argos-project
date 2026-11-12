# Veredicto Oracle — T252 compuerta de la rebanada 3 (2026-11-12, HEAD 57b2083)

**Veredicto: CONDICIONADO.** Contratos, tipos, oráculos y trazabilidad por tarea están en verde. La suite vitest no está verde y 5 fallos pertenecen a pruebas de la propia rebanada 3 (T237, T242, INV-HOUSE-004, barrido de sesión).

## Salidas
- verify-traceability --feature 002 --task T236..T251: 16/16 CUMPLE (3/3,5/5,9/9,4/4,10/10,2/2,3/3,4/4,4/4,6/6,8/8,4/4,12/12,4/4,3/3,2/2; pureza 0 en todas).
- verify-oracles.sh: 83 archivos, 0 débiles, CUMPLE.
- npx tsc --noEmit: exit 0.
- verify-traceability.sh global (primer paso de test:gate tras compilar): FALLA 88/96. Faltan: ERR-AUTH-USER-NOT-FOUND, ERR-HOUSE-MEMBER-ALREADY-EXISTS, INV-AUTH-002, INV-AUTH-004, INV-HOUSE-001, REQ-AUTH-001, REQ-AUTH-002, REQ-HOUSE-002 (IDs heredados de la 001 sin @implements o sin título it/test; no se ejecuta por tarea en T252).
- npm run test:gate existe (compile-contracts && traceability && oracles && tsc && vitest --coverage && mutation && playwright). Se corrieron los pasos por separado; vitest run: 113 fallos / 1297 verdes (21 archivos). La cadena se corta en trazabilidad global y en vitest; mutation y playwright no se ejecutaron en esta pasada (playwright 16 verdes en T250).

## Clasificación de los 113 fallos
- 72 unitarias: igual a la base (backup-use-cases 49, record-invariants 10, components 8, view-model 2, validation 1, infra 1, backup-import-atomicity 1). Sin regresión.
- 41 no unitarias:
  - GET /pets (base conocida): pets-records.api 3 + web-client colorToken 1 (usa GET /pets) = 4.
  - B2 audit_log (T264): assignments-ownership.api 1.
  - Respaldo / rebanada 5: backup-atomicity 11, sqlite-backup-import 4, access-control (exportar/importar María) 2, credentials 2 (404 en export), malicious-input 2, openapi-conformance 2 = 23.
  - Contratos/fixtures 001 vs 3.0.0: canonical-fixtures 4, generated-contracts 3 = 7 (causa no confirmada; origen en la sustitución de pruebas, no en la rebanada 3).
  - records.property 1 (ERR-REC-INVALID-BOOSTER-DATE da SCHEMA-VALIDATION; zona registros, rebanada 4/T251).
  - PROPIOS DE LA REBANADA 3 (5):
    1. tests/property/households.property.spec.ts (T237): contraejemplo [INVITE]; validateHouseholdMember(result) es false sobre la fila devuelta por inviteMember (usa LegacyHouseholdMember).
    2. access-control.security (T242) "cada celda No responde 403": el arnés falla el contrato en DELETE .../records/vaccinations/... (deleteRecord devuelve application/json, no problem+json; deleteRecord/updateRecord son de la rebanada 4).
    3. access-control.security (T242) "ningún rol edita un hogar ajeno": los tres 404 ERR-HOUSE-NOT-FOUND coinciden; falla solo api.dump() === before (before se toma antes del login; probable defecto de la prueba).
    4. access-control.security INV-HOUSE-004: espera la invitación INVITED en members del dueño; con invitaciones en household_invitations ya no aparece (prueba desactualizada frente a T220/H-T249-1).
    5. session-csrf.security INV-AUTH2-002: NOT_YET_SERVED sigue listando assignPetToHousehold, changeMemberRole, listPetAssignments, transferHouseholdOwnership, transferPetOwnership, unassignPetFromHousehold, que la rebanada 3 ya sirve.

## Criterios (a) a (e)
| Criterio | Evidencia | Estado |
|---|---|---|
| (a) 44 celdas | tests/unit/permissions-matrix.spec.ts (verde, T236 traza 3/3; 44 celdas verificadas contra spec §5.2 en log-oracle) | Cumple |
| (b) 403/404 por celda "No"; sin IDOR | tests/security/exploits idor-matrix 61/61 (T251); pets-records.api 32/35 (3 = GET /pets). T242 con 2 fallos (arriba) | Cumple vía T251; T242 pendiente de corrección |
| (c) Cuidador/Lector | pets-records.api y roles.api verdes (peso y evento sí; perfil y eliminar no; Lector no muta) | Cumple |
| (d) Nunca sin Propietario Legal | tests/unit/ownership-transfer.spec.ts, tests/integration/api/assignments-ownership.api.spec.ts (transferir a ACTIVE, ERR-OWN-TRANSFER-INVALID-TARGET 422, poda), roles.api.spec.ts verdes. Excepción: households.property (invariante de propietario único bajo secuencias aleatorias) en rojo | Cumple en ejemplos; propiedad aleatoria sin verde |
| (e) Kid 2 y 3 navegadores | T250 final: playwright 16 passed (household.spec.ts, household-counter.spec.ts); no re-ejecutado hoy | Cumple (evidencia previa) |

## Estado de tasks.md
T243 a T251 marcadas [x] (T250 y T251 son cambios sin commitear en el árbol). T236 a T242 (pruebas) siguen [ ] y T252 [ ]. Los agentes no cierran COMPLETED; el techo es REVIEW.

## Hallazgos
- H-T252-1 (bloquea): households.property.spec.ts (T237) en rojo.
- H-T252-2 (bloquea): T242 con dos pruebas en rojo (contrato de deleteRecord, defecto de dump).
- H-T252-3 (bloquea): INV-HOUSE-004 desactualizado y NOT_YET_SERVED del barrido de sesión con seis operaciones ya servidas.
- H-T252-4 (condición): marcar T236-T242 solo con vitest verde de esos archivos; reconciliar la línea T252 (cita T237 a T249; el alcance real es T236 a T251).
- H-T252-5 (deuda ajena): trazabilidad global 88/96 (IDs 001), canonical-fixtures/generated-contracts, records.property, respaldo (rebanada 5), GET /pets, B2 (T264). Asignar dueño antes de cerrar la feature; el test:gate completo no puede pasar hasta entonces.

## Condiciones para APTO
Keymaker corrige H-T252-1..3 (archivos de prueba y la lista NOT_YET_SERVED, sin tocar contratos) y Oracle repite vitest sobre esos 4 archivos. El resto es deuda ajena.

DE: Oracle
PARA: Neo (Andrés Vallejo — Nivel 2)
ESTADO: Validación requerida
