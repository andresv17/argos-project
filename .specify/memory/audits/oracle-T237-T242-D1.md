# Oracle: revalidación de la sustitución D-1 (T237–T242)

Fecha: 2026-11-11 · Rama: `002-plataforma-v21` · Auditor: Oracle · Destinatario: Neo (Andrés Vallejo — Nivel 2)
Referencia previa: `.specify/memory/audits/oracle-T237-T242-final.md` (FAIL, grupo (e) de 10 pruebas 001 sin sustituir).
Alcance: solo lectura de disco. Sin `git stash`, `checkout`, `reset`, commit ni push. No se tocaron `src/`, `tests/`, `specs/`, contratos, `src/generated/` ni `tasks.md`.

## Veredicto: FAIL

La sustitución D-1 está hecha en disco: las 10 pruebas 001 ya no existen con su redacción original. Quedan tres motivos de FAIL, ninguno de ellos resuelto por D-1:

1. **(e) Prueba 001 que contradice la 002 y no está sustituida**: `tests/unit/household-policies.spec.ts:340-352` sigue afirmando `canEdit`. El contrato 002 lo retira (`specs/002-plataforma-v21/contracts/schemas/pet.schema.json:490`, «reemplaza canEdit»). La prueba pasa, pero contradice el contrato.
2. **(f) Defecto de `tests/` no clasificado**: `tests/security/exploits/malicious-input.security.spec.ts:252` invita sin `roleOnJoin`. El contrato 002 lo exige (`specs/002-plataforma-v21/contracts/schemas/identity.schema.json:517`, `required`). La invitación responde 422 y la prueba XSS de hogar falla por una causa de la propia prueba (`expected [ 1, [], true, false ]`).
3. **(f) Defecto de `tests/` no clasificado, probable**: `tests/integration/contracts/openapi-conformance.spec.ts:49` registra `Nueva.Usuaria`. El patrón del contrato es `^[a-z0-9._-]+$` (`identity.schema.json`, bloque `username`, ~línea 46). Si el registro falla, `lucia` queda sin cookie y el `TypeError` de `:63` es una consecuencia en cascada. El `TypeError` es anterior a este cambio: las líneas 49, 60 y 63 son idénticas a HEAD. No lo he reproducido en ejecución aislada.

Además, un verde que pasa por atajo legado (`access-control.security.spec.ts:46`, ver sección 3) es un defecto (b) que exige corrección.

## 1. Estado de disco

| Comprobación | Resultado |
|---|---|
| `git status --short -- src specs/002-plataforma-v21/contracts src/generated` | Sin cambios |
| `git status --short -- specs/002-plataforma-v21/tasks.md` | `M`. 10 líneas `[ ]`→`[x]` en T226–T235 (rebanada 2), sin commit. T237–T242 siguen `[ ]` (`tasks.md:133-138`). **H-1 sigue abierto** (sección 7) |
| `git diff --stat -- tests` | 12 archivos modificados y 3 nuevos sin seguimiento (lista completa en sección 7, O-1) |
| Archivos fuera de la lista de Keymaker | `tests/unit/access-policy.spec.ts`, `tests/property/access.property.spec.ts`, `tests/integration/api/pets-records.api.spec.ts` (bloque T240 desde línea 379), y los nuevos `tests/unit/permissions-matrix.spec.ts`, `tests/integration/api/assignments-ownership.api.spec.ts`, `tests/integration/persistence/roles-migration.spec.ts`. Son de T239–T241, no de D-1. Hay que declararlos |
| Fecha de los tests | `tests/unit/household-policies.spec.ts`, `use-cases.households.spec.ts` y `malicious-input.security.spec.ts`: mtime 20:19:32, posterior al informe previo (19:16). El disco cambió después de la revisión anterior |

## 2. Las 10 sustituciones D-1

Para cada una: la prueba 001 original ya no está (`git show HEAD:<archivo>` frente a disco), la sustituta cita un ID de `spec.md` o del contrato y su estado en vitest.

| # | Archivo:línea (disco) | Prueba 001 retirada | Sustituta 002 (ID citado) | Estado | Decisión |
|---|---|---|---|---|---|
| 1 | `tests/unit/household-policies.spec.ts:109` | «crear hogar»: creador como OWNER | `[REQ-HOUSE-001][INV-HOUSE2-001]` único propietario ADMIN, ACTIVE | **Rojo** (`:118`). `createHousehold` asigna `role: 'OWNER'` (`src/domain/households/household-policies.ts:194`) | (c) |
| 2 | `tests/unit/household-policies.spec.ts:159` | «el OWNER invita a Lucía» | `[REQ-HOUSE2-001][INV-HOUSE-003]` invitación con `roleOnJoin: CAREGIVER` | **Rojo** (`:162`). `inviteMember` asigna `role: 'MEMBER'` (`household-policies.ts:231`) | (c) |
| 3 | `tests/unit/household-policies.spec.ts:274` | «OWNER no puede abandonar» | `[INV-HOUSE2-001][ERR-HOUSE-OWNER-CANNOT-LEAVE]` propietario no abandona: 409, `userId` | **Verde** | (a), sección 3 |
| 4 | `tests/unit/use-cases.households.spec.ts:50` | «Lucía crea un hogar» como OWNER | `[REQ-HOUSE-001][INV-ARCH-002]` propietaria ADMIN | **Rojo** (`expected {…(4)} to equal {…(2)}`). La fila del propietario sale como `OWNER` | (c) |
| 5 | `tests/unit/use-cases.households.spec.ts:134` | «Carlos ve su invitación» | `[REQ-HOUSE-003][REQ-HOUSE2-001]` invitación con `roleOnJoin: CAREGIVER`, al aceptar queda CAREGIVER | **Rojo**. El caso de uso fuerza `roleOnJoin: 'READER'` (`src/application/use-cases/household-use-cases.ts:193`, comentario «T237 PENDIENTE») | (c) |
| 6 | `tests/unit/use-cases.households.spec.ts:250` | «Mis hogares» con OWNER | `[REQ-HOUSE-005]` solo ACTIVE, propietario = ADMIN | **Verde** | (a), sección 3 |
| 7 | `tests/unit/use-cases.households.spec.ts:262` | «EDGE-031» re-invitar con OWNER | `[REQ-HOUSE2-001][REQ-HOUSE-005]` fila nueva y `firstJoinedAt` conservado, rol del `roleOnJoin` | **Rojo** (`expected [...3] to equal [...3]`). Probable (c), no verificado línea a línea | (c) probable |
| 8 | `tests/integration/api/households.api.spec.ts:12` | «crear un hogar → 201 OWNER» | `[REQ-HOUSE-001]` 201 con `myRole: ADMIN` | **Verde** | (a), sección 3 |
| 9 | `tests/security/exploits/access-control.security.spec.ts:46` | `canEdit` en la ficha | `[INV-ACC-001][REQ-RBAC-001]` `permissions.editPetBasics` = false para María | **Verde**, pero por atajo legado | (b), sección 3 |
| 10 | `tests/property/households.property.spec.ts:58` | propiedad 001 de INVITE con `OWNER`/`MEMBER` | `[INV-HOUSE2-001][INV-HOUSE-003][STATE-HOUSE-MEMBERSHIP-001]` un único propietario ADMIN | **Rojo**. Contraejemplo `[[]]`: `expected [] to deeply equal [[…]]` en `:104`, porque no hay fila ADMIN ACTIVE (la fila sale `OWNER`) | (c) |

Resultado: **10 de 10 sustituidas en disco**. No queda ninguna de las 10 con la redacción de la 001. Las 6 en rojo fallan por funcionalidad 002 no implementada (`T243–T247`) o por la forma de la fila, no por la prueba.

## 3. Las 4 pruebas en verde

- **#3 `household-policies.spec.ts:274` → (a), aceptada.** La regla existe: `household-policies.ts:298` lanza `ERR-HOUSE-OWNER-CANNOT-LEAVE` para el propietario. La prueba la ejerce: llama `removeOrLeave` con el propietario, aserta código, estado 409, `invariantRef` y campo. Discrimina: un mutante que permita al propietario salir la rompe.
- **#6 `use-cases.households.spec.ts:250` → (a), aceptada con observación O-2.** La regla «propietario = ADMIN» se cumple en la vista (`use-cases.ts:73` y `:92`, `isOwnerRow ? 'ADMIN' : 'READER'`). La prueba ejerce `ListMyHouseholdsUseCase` y aserta ADMIN para los propietarios; un mutante que devuelva READER al propietario la rompe. Observación: la fila persistida sigue siendo `OWNER` y la correspondencia es un atajo de vista; no se comprueba el rol de María.
- **#8 `households.api.spec.ts:12` → (a), aceptada con observación O-2.** Mismo mecanismo que #6, por HTTP. Aserta 201, `myRole: ADMIN`, `ownerUserId` y lista de un elemento.
- **#9 `access-control.security.spec.ts:46` → (b), defecto.** El valor `editPetBasics` sale de `legacyRoleAndPermissions(canEdit)` (`src/application/use-cases/use-case-support.ts:148-152`), es decir, del atajo 001 «es propietario». La matriz 002 (`can(rol, EDIT_PET_BASICS)`, T244) no existe: `src/domain/access/rbac.ts` no existe (TS2307). La prueba pasa porque María no es propietaria, no porque aplique la matriz. El control positivo que sí discrimina (ADMIN puede editar) está en `access-control.security.spec.ts:229` y está en rojo.
  **Corrección**: fijar en la fixture 002 el rol de María (READER o CAREGIVER) y añadir una aserción `can(ADMIN, EDIT_PET_BASICS) = true` sobre la matriz, o referenciar el resultado de `can()` cuando exista (T244). Hasta entonces, el verde depende del atajo.

## 4. Efecto colateral: exportación de respaldo GET → POST

- **Cero GET** a `/api/backup/export` en `tests/` (grep de `'GET'` y `get(...)` sin resultados).
- **POST con cabecera CSRF**: el harness añade `x-argos-request: 1` por defecto (`tests/integration/api/api-harness.ts:70`, salvo `csrf: false`). `access-control.security.spec.ts:84,97` lo pasa explícito. Llamadas POST a export:
  - `backup-atomicity.spec.ts:24,39,49` (3 llamadas, no 4 como indicó Keymaker; el diff tiene 3 cambios de llamada y 1 de título).
  - `malicious-input.security.spec.ts:91,113`.
  - `credentials.security.spec.ts:151,169`.
  - `openapi-conformance.spec.ts:69`.
- **Causa común de los fallos**: `src/infrastructure/http/routes/backup.routes.ts:20` registra solo `app.get('/api/backup/export')`. El POST devuelve 404 y el chequeo de contrato del harness lo marca (`api-harness.ts:91`, `expected [Array(1)] to deeply equal []`). Es **D-3 (d)**, pendiente de T279.

### Clasificación de los fallos por archivo

Los fallos de `openapi-conformance` y `backup-atomicity` se clasifican así:

- **backup-atomicity** (11 fallos): 3 son `contrato OpenAPI de POST /api/backup/export` → **(d) D-3**. Los 8 restantes: `EDGE-023` (importar 1.0.0, responde 422 en vez de 200) y 7 de `INV-BACKUP-001` (422 en vez de 409/500). `backup-migration.ts:70,109` declara «T233 PENDIENTE… llega con T276» y `:13` que el sobre 3.0.0 completo es T276. La importación rechaza antes de las comprobaciones referenciales → **(c)**. Probable, el detalle del campo `problem` no está verificado.
- **openapi-conformance** (2 fallos): `:63` `TypeError` (ver motivo 3 del veredicto) → **(f)**. `cada una de las operaciones` (`expected [40, […exportBackup…]] to equal [27, []]`): las operaciones no alcanzadas incluyen `exportBackup`, que es D-3 → **(d)**.
- **credentials** (2 fallos): `expected […2] to equal […2]` y `[201,201,200,404]` → el 404 es la ruta POST ausente → **(d) D-3**.
- **malicious-input** (4 fallos): 2 de export → **(d) D-3**. «XSS almacenado en mascota y 6 módulos» (`statuses` con 500) → **(d) B6** probable, las filas de vacunas y desparasitaciones no llevan los campos veterinarios exigidos (`records` en `:192-193`). «XSS en hogar» → **(f)**, motivo 2 del veredicto.

## 5. Vitest: 15 archivos tocados

Comando: `node_modules/.bin/vitest run --reporter=json` (suite completa, filtrada a los archivos tocados). Salida: `/tmp/oracle-d1-vitest.json`. (`vitest run <archivos>` con varios argumentos devuelve «No test files found», por eso se filtró a posteriori.)

| Archivo | Pasan | Fallan | Total |
|---|---|---|---|
| tests/unit/access-policy.spec.ts | 8 | 11 | 19 |
| tests/unit/household-policies.spec.ts | 24 | 11 | 35 |
| tests/unit/permissions-matrix.spec.ts | 0 | 44 | 44 |
| tests/unit/use-cases.households.spec.ts | 10 | 8 | 18 |
| tests/property/access.property.spec.ts | 2 | 4 | 6 |
| tests/property/households.property.spec.ts | 1 | 2 | 3 |
| tests/integration/api/assignments-ownership.api.spec.ts | 0 | 11 | 11 |
| tests/integration/api/backup-atomicity.spec.ts | 7 | 11 | 18 |
| tests/integration/api/households.api.spec.ts | 21 | 8 | 29 |
| tests/integration/api/pets-records.api.spec.ts | 28 | 7 | 35 |
| tests/integration/contracts/openapi-conformance.spec.ts | 1 | 2 | 3 |
| tests/integration/persistence/roles-migration.spec.ts | 0 | 7 | 7 |
| tests/security/exploits/access-control.security.spec.ts | 6 | 7 | 13 |
| tests/security/exploits/credentials.security.spec.ts | 10 | 2 | 12 |
| tests/security/exploits/malicious-input.security.spec.ts | 9 | 4 | 13 |
| **Total (15 archivos)** | **127** | **139** | **266** |

Global (toda la suite): 1088 pasan / 223 fallan / 1311.

**Las cifras no coinciden con Keymaker** (55 / 89 / 144 en 9 archivos) ni con el informe previo (96 / 124 / 220 en 11 archivos). La diferencia se explica por el cambio de disco posterior (mtime 20:19), y por el número de archivos. Keymaker debe declarar los números que da por válidos.

### Clasificación de los 139 fallos

| Grupo | Causa | Fallos |
|---|---|---|
| **(a)** módulo o migración ausente | `effective-role.ts` y `rbac.ts` (access-policy 11, access.property 4, permissions-matrix 44); `no such table/column`, `0004_pendiente.sql` (roles-migration 7) | **66** |
| **(b)** función no exportada | `applyMembershipEvent` (household-policies 9, households.property 1); `ChangeMemberRoleUseCase`, `TransferHouseholdOwnershipUseCase` (use-cases 4) | **14** |
| **(c)** ruta HTTP o funcionalidad 002 no implementada | PUT `…/assignments` y POST `…/ownership-transfer` ausentes (assignments 11, pets-records 5, access-control 4); PATCH `…/members` y `ownership-transfer` (households.api 7); `roleOnJoin` ignorado y `OWNER` en vez de ADMIN (household-policies 2, use-cases 3, households.property 1); importación 1.0.0 y 2.0.0 no migrada (backup-atomicity 8, probable) | **41** |
| **(d)** defecto de `src/` ya conocido | D-3 export GET (backup-atomicity 3, credentials 2, malicious 2, openapi 1); B6 500 vacunas (pets-records 2, malicious 1 probable); D-01 vista (households.api 1, use-cases 1, access-control 1) | **16** |
| **(e)** prueba 001 sin sustituir que falla | ninguna en rojo. El `canEdit` de `household-policies:340-352` pasa (ver veredicto, motivo 1) | **0** |
| **(f)** otro | `malicious-input:252` sin `roleOnJoin` (1); `openapi-conformance:49` username inválido (1) | **2** |

Suma: 66 + 14 + 41 + 16 + 0 + 2 = **139**.

El sub-recuento de (d) incluye D-01: `src/application/use-cases/household-use-cases.ts:94-95` (`viewOf`) devuelve `members` solo ACTIVE para todos los actores y lleva los INVITED a `pendingInvitations`. Las pruebas 001 que quedan (EDGE-037/038, `INV-HOUSE-004`) esperan que el propietario vea los INVITED en `members`. `specs/002-plataforma-v21/spec.md:283` marca `INV-HOUSE-004` como «vigente sin cambio», así que el comportamiento es un defecto de src, no de prueba.

## 6. Compuertas

- **`node_modules/.bin/tsc --noEmit`**: exit 2, 5 errores. Todos TS2307, esperados: `tests/property/access.property.spec.ts:184,185`, `tests/unit/access-policy.spec.ts:161,162`, `tests/unit/permissions-matrix.spec.ts:49`. **Cero TS2554 y cero TS2345.**
- **`bash scripts/verify-oracles.sh`**: `Archivos analizados: 79; oráculos débiles: 0; Resultado: CUMPLE`.
- **Greps en `tests/`**: `expect(true)`, `.skip(`, `.todo(`, `.only(`, `xit(`, `xdescribe(`, `expect([403,404,409])`, `toBeDefined()` y `toBeTruthy()` como única aserción: **sin coincidencias reales**. Las coincidencias en `tests/integration/gates/verify-gates.spec.ts:240-248` son cadenas de texto dentro del propio test de la compuerta; no son oráculos.
- **Aserciones condicionales** del informe previo (`access.property.spec.ts:220,237`; `household-policies.spec.ts:87-100`; `households.property.spec.ts:86-91`): sin cambios, siguen siendo aceptables.

## 7. Hallazgos

- **H-MOR-02 CONFIRMADO**. `grep -n "use-cases.households\|roles-migration" .specify/memory/audits/hoja-de-ruta-feature-002.md` no devuelve nada (exit 1). La tabla C (`hoja-de-ruta-feature-002.md:60-75`) tiene filas para `household-policies` y `households.property` (línea 67), pero no para `use-cases.households.spec.ts` ni `roles-migration.spec.ts`. El único registro de la ratificación es `claude/log-morpheus.md:554` (el propio hallazgo) y `claude/registro-proceso-argos.md:255`. **La ratificación no está en disco con la firma de Neo.** Hay que añadir las filas antes de cerrar.
- **H-1 sigue abierto (Nivel 2)**. `tasks.md` tiene `M` con 10 `[x]` en T226–T235. El CLAUDE.md reserva `COMPLETED` a Neo. Oracle no lo ha tocado.
- **O-1 (alcance)**. El diff incluye 6 archivos fuera de la lista de D-1 (sección 1). Son de T239–T241 y no son defectos en sí, pero deben declararse en el log de Keymaker.
- **O-2 (verdes por vista)**. `use-cases:250` y `households.api:12` pasan por el mapeo `OWNER → ADMIN` de la vista. Esto debe revisarse en T247.
- **O-3 (presentación diferida)**. `tests/unit/presentation/presentation-fixtures.ts:5` declara «T284 PENDIENTE: forma 001 (canEdit, OWNER/MEMBER, INVITED en members, DOG/CAT)». Esas pruebas de presentación no están en esta revisión. Si Neo acepta el diferimiento a T284 por escrito, no bloquea; si no, son (e) y bloquean el PASS.
- **O-4 (`use-cases:262`)**. Se clasifica como (c) probable sin verificación línea a línea.

## 8. Decisiones para Neo

**PARA: Neo (Andrés Vallejo — Nivel 2)**

- **D-7 (nuevo, bloquea el PASS)**: sustituir o corregir `tests/unit/household-policies.spec.ts:340-352` (`canEdit` → `permissions.editPetBasics`, según `pet.schema.json:490`), o decidir por escrito que se difiere a T248.
- **D-8 (nuevo, bloquea el PASS)**: corregir `tests/security/exploits/malicious-input.security.spec.ts:252` añadiendo `roleOnJoin` a la invitación (requisito de `identity.schema.json:517`), y `tests/integration/contracts/openapi-conformance.spec.ts:49,63` cambiando `Nueva.Usuaria` por un username del patrón `^[a-z0-9._-]+$` y añadiendo `roleOnJoin` en `:63`.
- **D-9 (nuevo, bloquea el PASS)**: corregir `tests/security/exploits/access-control.security.spec.ts:46` (sección 3, motivo b).
- **D-10 (nuevo, decisión)**: confirmar el diferimiento de `tests/unit/presentation/` a T284 (O-3).
- **H-1 (Nivel 2)**: revertir o confirmar los 10 `[x]` de T226–T235 en `tasks.md`.
- **H-MOR-02**: añadir a la tabla C las filas `tests/unit/use-cases.households.spec.ts` y `tests/integration/persistence/roles-migration.spec.ts`, con la firma de Neo.
- **D-1, D-2, D-3 de la revisión previa**: siguen abiertos (sin cambios en disco): `category`/veterinarios (B6), ruta POST de export en `src/`, y firma de `effectiveRole` (N-2).

## 9. Veredicto por criterio

| Criterio | Resultado |
|---|---|
| 10 sustituciones correctas | **Cumple** (10/10 en disco, sin la 001 original) |
| Sin 001 contradictoria sin sustituir | **No cumple** (`household-policies.spec.ts:340-352`, D-7) |
| Efecto colateral en (c) o (d) | **Cumple** para export GET→POST (d). **No cumple** para `malicious-input:252` y `openapi-conformance:49,63` (f) |
| tsc limpio | **Cumple** (solo TS2307 esperados) |
| Sin oráculos débiles | **No cumple** (`access-control.security.spec.ts:46`, defecto b) |

## Veredicto final: FAIL
