# Acta Oracle — Contraste en disco de T1217 (contratos nuevos de 009 y entradas de script)

Fecha: 2026-11-23 · Rama: 009-aprobacion-admin-correo (HEAD f3e4a1e) · Solo lectura; nada corregido, nada marcado `[x]`.
Artefactos: contracts/errors/error-catalog.json, contracts/state-machines/account-registration.machine.json, contracts/openapi/admin.openapi.yaml, contracts/README.md, scripts/compile-contracts.sh (--feature 009), scripts/verify-traceability.sh (EXCLUDED_BY_DECISION 009).

## Veredicto: PASS CON OBSERVACIONES

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1a | Catálogo no redefine códigos vigentes (solo hereda) | PASS | Los 7 códigos propios solo aparecen en el catálogo 009 (grep en 001..008: 0 coincidencias). Los 7 heredados (ERR-ACC-FORBIDDEN, -ACCOUNT-CONFIRMATION-MISMATCH, -AUTH-CSRF-REJECTED, -AUTH-UNAUTHENTICATED, -INTERNAL-UNEXPECTED, -RATE-LIMITED, -SCHEMA-VALIDATION-FAILED) existen en 001/002/004 y van en `inherited`, no en `errors`. El compilador además falla por duplicados (compila OK). |
| 1b | 7 códigos propios en plan.md (tabla de 12 códigos) | PASS | Tabla "Códigos de error": 11 filas = 12 códigos (una fila agrupa PENDING/REJECTED); los 7 propios figuran con tarea (T1217 x2, T1226, T1241, T1256 x3). |
| 1c | Los 7 códigos en spec.md | OBSERVACION | Solo ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE aparece por nombre (EDGE-009-049). Los otros 6 no se nombran en spec.md; sí sus EDGE/REQ de origen (EDGE-009-031, -035, -039, -016, -036, -023). Los nombres viven en plan.md ("propuestos por el Architect"). Decisión de Neo si basta con plan.md. |
| 2 | STATE-ACCT9-001 = REQ-APR9 y D9-04 = A | PASS | Estados PENDING/ACTIVE/REJECTED (REQ-APR9-001); solo PENDING->ACTIVE y PENDING->REJECTED con compare-and-set; REJECTED->PENDING/ACTIVE prohibidas (reintento tras purga 30 d, REQ-APR9-007/D9-04); purga a 30 d (PENDING desde creación, REJECTED desde decisión) y supresión manual REQ-APR9-008 declaradas en `nonTransitions`, no como transiciones. |
| 3 | admin.openapi.yaml: solo 2 operaciones, cerrado, sin tocar 004 ni /api/admin | PASS | Solo paths `/account/deletion/reauth` (startAccountDeletionReauth) y `/account/deletion/google` (deleteAccountWithGoogleReauth). `/api/admin` aparece solo en texto descriptivo (2 líneas), ningún path. deleteAccount de 004 no se edita. Esquemas DeletionReauthStarted, DeleteAccountWithGoogleInput, HouseholdsActiveProblem y los ítems de households: `additionalProperties: false`; el cuerpo vacío de reauth también. |
| 4 | 6 EXCLUDED_BY_DECISION justificadas | PASS CON OBS. | Ver detalle abajo. |
| 5 | compile-contracts --feature 009 --out <scratchpad>/oracle-out009 | PASS | exit 0; salida en v35/ (api, errors, machines, schemas, index.ts); última línea: `[SDD Contract Compiler] git diff --stat -- src/generated/api vacío: OK`. src/generated no tocado. |
| 6 | verify-traceability 008 / 006 / 007 | PASS | exit 0 / 0 / 0; todas terminan `Resultado: CUMPLE`, 0 violaciones de pureza. |

### Detalle 4 (exclusiones de verify-traceability --feature 009)
| ID | Justificación en script | Respaldo en spec.md/plan.md |
|---|---|---|
| REQ-APR9-006 | D9-01 = A | spec REQ-APR9-006 "DIFERIDO sin fase por D9-01 = A"; tabla D9-01. Respaldado. |
| REQ-SSO8-002 | fuera de alcance | spec línea 34 "Fuera de alcance" lo nombra. Respaldado. |
| REQ-SSO8-006 | fuera de alcance | spec línea 34. Respaldado. |
| REQ-VIN8-005 | fuera de alcance | spec línea 34 (T1130 acotada a borrado). Respaldado. |
| REQ-APR8-001 | reemplazado por REQ-APR9-001 | spec REQ-APR9-001 lo traza como "(008, diferido)". Respaldo implícito, no hay frase literal de "reemplazo". |
| STATE-ACCT8-001 | reemplazado por STATE-ACCT9-001 | spec fila #18 lo cita como diferido por 008; el reemplazo está materializado en el contrato (STATE-ACCT9-001). Sin frase explícita de "reemplazo" en spec. |

Ninguna exclusión carece de base; las dos últimas descansan en respaldo implícito. La aprobación de las exclusiones es decisión de Neo; no se da por aprobada.

## Observaciones (no bloqueantes, sin corregir)
- O1: 6 de los 7 códigos propios no se nombran en spec.md (ver 1c).
- O2: spec REQ-APR9-006 dice que "el verificador lo exige por mención", pero verify-traceability lo EXCLUYE (no exige evidencia). Contradicción menor spec vs script.
- O3: contracts/README.md fecha el trabajo de T1217 como 2026-11-24; el calendario del repo/sesión es 2026-11-23.
- O4: openapi deja DECISIÓN ABIERTA para Neo: si la vía Google exige `backupConfirmationToken` (hoy opcional en esquema, como 004).
- O5: ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE solapa con ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD/-PETS de 004 (el propio catálogo lo señala; T1284 lo verifica en src/).
- O6: los scripts (Nivel 2) y los 3 contratos están sin commitear (working tree); el diff de compile-contracts (+115) y verify-traceability (+13) se limita a la rama 009, el mensaje de uso/lista de features y el listado `foreign` para v35. Autorización Nivel 2 de Neo sobre esas entradas no verificada por este contraste.
