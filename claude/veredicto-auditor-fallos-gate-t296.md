# Veredicto Oracle — Fallos de test:gate T296 (línea base vs estado actual)

Fecha: 2026-11-14. Modo auditoría (solo lectura; sin commits).

## Método
- Worktree limpio de `ff0fe62` en el scratchpad, `node_modules` enlazado, `.env` copiado (sin imprimir valores). Comando: `npx vitest run tests/unit/presentation tests/integration/presentation`.
- Mismo comando en el proyecto actual (con trabajo sin commit). Comparación por archivo + título completo del test (JSON reporter).
- Worktree eliminado y podado; `git status --short` idéntico al previo (91 líneas).

## Resultados
- Línea base (ff0fe62): 12 fallos de 63 tests (8 suites con fallos).
- Estado actual: 12 fallos de 78 tests (8 suites con fallos).
- HEREDADO: 12 de 12. NUEVO: 0. Ningún fallo de la línea base desapareció.
- El test web-client [REQ-UI-007] (web-client.spec.ts:53) existe en la línea base y falla igual: HEREDADO.
- El trabajo sin commit añadió 15 tests de presentación y los 15 pasan; no introdujo ningún fallo.

## Los 12 fallos de presentación (subconjunto de los 26)
1. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-001] las tarjetas forman un listbox con una sola opción enfocable y la activa marcada
2. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-001] cada tarjeta muestra especie, nombre, edad, dueño y contador de alertas
3. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-007] en hogar la tarjeta ajena lleva insignia de color con texto y "Solo lectura"; la propia fuera de hogar, sin color
4. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-002][REQ-UI-007] la ficha ajena (canEdit false) no tiene Editar, Eliminar ni formularios de alta
5. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-002] la ficha propia tiene 6 pestañas, un panel aislado para el módulo activo y su formulario de alta
6. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-002] la pestaña de peso muestra el gráfico SVG y la tabla con la variación de la API
7. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-003][STATE-ALERT-001] la pestaña de vacunas muestra la insignia del semáforo con color y texto
8. HEREDADO | unit/presentation/components.spec.ts :: componentes de la SPA (render estático) [REQ-UI-006] el OWNER ve miembros con estado, INVITED incluidos, y las acciones de retirar, cancelar y eliminar
9. HEREDADO | unit/presentation/validation.spec.ts :: validación en cliente derivada de los contratos [REQ-UI-002][ERR-REC-WEIGHT-OUT-OF-RANGE][ERR-REC-MEASUREMENT-OUT-OF-RANGE] los rangos de peso y medidas usan su código x-sdd-error
10. HEREDADO | unit/presentation/view-model.spec.ts :: modelo de presentación puro [REQ-UI-002] la tabla de peso muestra variación absoluta y porcentual de la API con signo, y — sin medición anterior
11. HEREDADO | unit/presentation/view-model.spec.ts :: modelo de presentación puro [REQ-UI-006] el OWNER puede cancelar invitaciones, retirar miembros y eliminar; el MEMBER solo abandonar
12. HEREDADO | integration/presentation/web-client.spec.ts :: cliente generado de la SPA contra la API real [REQ-UI-007] en "Mis mascotas" colorToken es null y en el hogar cada tarjeta trae su colorToken

## Alcance y límites
- Los 26 fallos de `test:gate` incluyen 14 fuera de estos directorios; no se ejecutaron aquí (Keymaker ya corrió el gate). Esta auditoría demuestra que los 12 de presentación NO los introdujo el trabajo sin commit de la 002.
- Importante: la línea base ff0fe62 ya contiene la presentación de la 002 (commits d8beed8, ff0fe62), así que "HEREDADO" significa "ya fallaban en el último commit", no necesariamente "originados en la 001". La atribución a B-11/001 no queda demostrada por esta prueba; solo que son preexistentes al trabajo sin commit. Que sean deuda B-11 sigue siendo decisión de Neo.
- Los 14 restantes no fueron comparados contra la línea base.

## Causas de NUEVOS
Ninguno.

## Veredicto
CUMPLE con excepción B-11 para el alcance verificado: 0 fallos nuevos atribuibles al trabajo sin commit en presentación (12/12 heredados). Reserva: los otros 14 fallos del gate sin comparar.


## Los 14 restantes

Método: worktree limpio de ff0fe62 (node_modules enlazado, .env copiado), `npx vitest run tests/integration/api/pets-records.api.spec.ts tests/integration/contracts tests/unit/infrastructure-adapters.spec.ts` en línea base y en el estado actual (524 tests, 8 archivos en ambos). Comparación por archivo y título completo. Worktree eliminado y `git status --short` idéntico al inicial.

Línea base ff0fe62 en estos archivos: 14 fallos. Estado actual: 14 fallos. Coinciden 14/14.

| # | Clasificación | Archivo | Test |
|---|---|---|---|
| 1 | HEREDADO | integration/api/pets-records.api.spec.ts | especies, edad estimada y microchip por HTTP (REQ-PET2-001, INV-PET2-001) [REQ-PET2-002] GET /pets?filter= separa Todos, Perros (CANINE), Gatos (FELINE) y Otros (las otras seis especies) y se combina con q |
| 2 | HEREDADO | integration/api/pets-records.api.spec.ts | mascotas por HTTP (src/infrastructure/http/routes/pets.routes.ts) [REQ-PET-005] D-03 y EDGE-039: q no distingue mayúsculas ni tildes ("lucia" encuentra "Lucía" y no "Lucas"); species y filter filtran |
| 3 | HEREDADO | integration/api/pets-records.api.spec.ts | mascotas por HTTP (src/infrastructure/http/routes/pets.routes.ts) [REQ-PET-005] GET /pets lista solo las mascotas propias, ordenadas, con colorToken nulo fuera de hogar (EDGE-030) |
| 4 | HEREDADO | integration/contracts/canonical-fixtures.spec.ts | contracts/examples/canonical-fixtures.json -> src/generated/ [ERR-INTERNAL-UNEXPECTED] ERROR_CATALOG generado coincide con error-catalog.json: los 30 códigos vigentes y ninguno más |
| 5 | HEREDADO | integration/contracts/canonical-fixtures.spec.ts | contracts/examples/canonical-fixtures.json -> src/generated/ [REQ-PET-001] rechaza propiedades no autorizadas (additionalProperties: false) y textos con espacios laterales o vacíos |
| 6 | HEREDADO | integration/contracts/canonical-fixtures.spec.ts | contracts/examples/canonical-fixtures.json -> src/generated/ [REQ-PET-001][REQ-HOUSE-001] usuarios, hogar, membresías y mascotas de otro usuario del fixture cumplen sus esquemas |
| 7 | HEREDADO | integration/contracts/canonical-fixtures.spec.ts | contracts/examples/canonical-fixtures.json -> src/generated/ [REQ-REC-001][REQ-REC-002][REQ-REC-003][REQ-REC-004][REQ-REC-005][REQ-REC-006] cada registro de los 6 módulos del sobre canónico cumple su esquema |
| 8 | HEREDADO | integration/contracts/codegen-drift.spec.ts | T201: contratos multi-feature (compile-contracts.sh --feature y codegen.mjs --contracts) INV-ARCH-003: --feature 001 equivale al valor por defecto |
| 9 | HEREDADO | integration/contracts/generated-contracts.spec.ts | contratos generados INV-ARCH-003: cada máquina se genera desde su propio archivo y no existe máquina de cupo |
| 10 | HEREDADO | integration/contracts/generated-contracts.spec.ts | contratos generados INV-ARCH-003: el catálogo generado coincide con error-catalog.json y cada ProblemDetails generado es válido |
| 11 | HEREDADO | integration/contracts/generated-contracts.spec.ts | contratos generados INV-ARCH-003: los fixtures canónicos válidos pasan sus validadores generados |
| 12 | HEREDADO | integration/contracts/openapi-conformance.spec.ts | conformidad de la API con contracts/openapi/pet-tracker-api.openapi.yaml [REQ-AUTH-001][REQ-PET-001][REQ-HOUSE-001][REQ-BACKUP-001] cada una de las 27 operaciones del OpenAPI tiene su ruta en Fastify |
| 13 | HEREDADO | integration/contracts/openapi-conformance.spec.ts | conformidad de la API con contracts/openapi/pet-tracker-api.openapi.yaml [REQ-AUTH-002][REQ-PET-003][REQ-REC-001][REQ-HOUSE-005][REQ-BACKUP-002] recorrido feliz por las 27 operaciones: todas responden lo que declara el OpenAPI |
| 14 | HEREDADO | unit/infrastructure-adapters.spec.ts | ScryptPasswordHasherAdapter (src/infrastructure/adapters/scrypt-password-hasher.adapter.ts) [INV-AUTH-003] verify devuelve false, sin lanzar, ante un hash con formato inválido (N excesivo para la memoria) |

Conteo: 14 HEREDADO, 0 NUEVO.

### Causas de NUEVOS
Ninguno.

### Veredicto de conjunto
CUMPLE con excepción B-11: los 26 fallos de `test:gate` (12 de presentación + 14 de este bloque) ya fallan en ff0fe62; 0 nuevos atribuibles al trabajo sin commit. Reserva: HEREDADO significa preexistente en el último commit; que sean deuda B-11 sigue siendo decisión de Neo. Nota: ff0fe62 ya contiene la 002 (d8beed8, ff0fe62), así que no se demuestra origen en la 001.
