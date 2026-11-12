# Veredicto Oracle T249 · 2026-11-12 · APTO

Auditor solo lector. HEAD 9af6f0b, cambios sin commit. tasks.md sin tocar (T249 queda [ ] hasta firma de Neo).

## Alcance (git diff separado de T245-T248)
- src/domain/account/account-deletion-guards.ts: `planPetAssignmentsForDeletion` + `AssignmentRef`/`PetDeletionPlan`. Pura (dominio no importa application).
- src/application/use-cases/account-use-cases.ts: solo la fase B (B4 comentario, B5, B6, B9 b/e con borrado explícito de asignaciones). Diff pequeño y confinado.
- tests/unit/account-deletion.spec.ts: 1 guarda unitaria + 8 pruebas del describe T249 = 9; helper `joinBetweenPhases`/`RacingUnitOfWork`.
- tests/unit/use-cases.spec.ts: el título O-2 es "Mis mascotas: propias y visibles por asignación, por nombre, con owner sin color (EDGE-030), edad, alertas y último peso" (línea 288). El cuerpo de ese `it` también difiere de HEAD, pero eso viene de la adaptación C3 de T248, no de T249.

## Contrato y spec
- REQ-ACC-002 (spec.md:198): punto (1) hogar con otros ACTIVE bloquea; único ACTIVE => cascada con asignaciones; punto (2) mascota asignada a hogar con otros ACTIVE bloquea con ERR-ACCOUNT-OWNS-SHARED-PETS. SC-014 (spec.md:352) cubre ambos bloqueos al 100 %.
- STATE-ACCOUNT-DELETE-001: B4 -> B5_CHECK_PETS_BLOCKER ("¿Mascota del usuario asignada a un hogar con otro miembro ACTIVE (distinto del usuario)? Una asignación a un hogar donde el usuario es el único ACTIVE no bloquea") -> B6_SAFETY_ASSERTION (INCONSISTENT -> ROLLED_BACK con ERR-INTERNAL-UNEXPECTED). errorOrder: HOUSEHOLD antes de PETS antes de INTERNAL. El código coincide: B4, B5, B6 en ese orden y mismos errores.
- La regla "hogar donde el usuario es el único ACTIVE no bloquea" SÍ está en spec (REQ-ACC-002 y N-5, spec.md:378) y en la máquina (B5).
- Errores ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD/PETS presentes en el catálogo (409). Sin contradicción spec/contrato.

## Relectura dentro de la transacción
Las lecturas de B4/B5/B6 están dentro del `runInTransaction` de la fase B (la fase A, también en su propia transacción, solo verifica contraseña). `joinBetweenPhases` cuenta las `runInTransaction` tras `arm()`: la 1.ª es la fase A (verifyCurrentPassword) y la 2.ª la fase B; justo antes de la 2.ª inserta/activa la membresía en una transacción propia. Simulación real de alta entre fase A y B. Las dos pruebas de carrera (PETS y HOUSEHOLD) verifican error, estado intacto y token vigente.

## Oráculos
Búsqueda en las líneas añadidas: sin toBeDefined/toBeTruthy/toBeFalsy/any/skip/todo/only/toContain/toHaveLength. La única coincidencia ingenua es la palabra española "todo" en un título. Todas las aserciones son toEqual/toBe con valores literales. verify-oracles: 81 archivos, 0 débiles.

## Salidas literales
- account-deletion.spec: Test Files 1 passed; Tests 26 passed (26)
- use-cases.spec: Tests 36 passed (36)
- tests/unit: Test Files 7 failed | 18 passed (25); Tests 72 failed | 468 passed (540) (base 72, 0 nuevos)
- tsc --noEmit: exit 0
- verify-oracles: oráculos débiles: 0; CUMPLE
- verify-traceability --feature 002 --task T249: IDs trazados 4/4; pureza 0; CUMPLE
- integración account-deletion.api + account.api (árbol actual): Tests 22 failed (22); 22x "CHECK constraint failed: status IN ('ACTIVE', 'LEFT', 'REMOVED')" y 22x "Cannot read properties of undefined (reading 'close')" (SqliteError en sqlite-repositories.ts:476 saveMembership).

## H-T249-1 (línea base de integración): MATIZ IMPORTANTE
En HEAD 9af6f0b (git archive a scratchpad/head-t249, node_modules enlazado) esos dos archivos dan: Test Files 2 passed (2); Tests 22 passed (22). O sea los 22 fallos NO existen en HEAD: son una regresión del árbol sin commit. Causa coincide con lo dicho por Keymaker (CHECK de status en migración 0004 + 'close' de afterEach consecuente), pero el origen no es "preexistente en HEAD" sino el trabajo sin commit T245-T248 (fixtures/harness 002 con membresías o invitaciones y seed SQLite nuevo en tests/fixtures/sqlite-harness.ts y application-harness.ts). T249 no toca repositorios SQLite ni fixtures, y los fallos ocurren al sembrar, antes de ejecutar el caso de uso. No es bloqueo de T249; sí hallazgo de línea base para Morpheus/T252.
Riesgo residual: la ruta SQLite de B5/B6/B9 (listByPet, listByHousehold, deleteForPet/Household existen en sqlite-repositories.ts) no se pudo ejercitar por integración hasta arreglar el sembrado; la compuerta T252 debe cubrirlo.

## Veredicto: APTO
Sin correcciones exigidas a Keymaker (MAX_RETRY=1 sin usar). Menores no bloqueantes: (a) la ruta SQLite de la eliminación con asignaciones carece de prueba de integración hasta resolver H-T249-1; (b) 72 fallos de tests/unit y 75 de integración siguen abiertos fuera de T249.
