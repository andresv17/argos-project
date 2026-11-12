# Oracle: verificación final de T237–T242 tras la corrección B1–B9

Fecha: 2026-11-11 · Rama: `002-plataforma-v21` · Auditor: Oracle · Destinatario: Neo (Andrés Vallejo — Nivel 2)
Referencia: `.specify/memory/audits/oracle-T237-T242.md` (informe previo, FAIL con B1–B9).
Alcance: solo lectura de disco. Sin `git stash`, `checkout`, `reset` ni commit. No se modificaron `src/`, `tests/`, `specs/`, contratos ni `tasks.md`.

## Veredicto: FAIL (escalado a Neo; MAX_RETRY consumido)

Las nueve correcciones B1–B9 están aplicadas en `tests/` y `tsc` ya no tiene errores de tipado. Aun así el veredicto es FAIL por una razón que no estaba en B1–B9: quedan 10 pruebas de la 001 que contradicen la 002 y que la tabla C de la hoja de ruta exige sustituir (grupo (e), sección 4). Es un defecto de `tests/` de tipo no clasificado, y en esta última vuelta no puedo devolverlo a Keymaker.

Los demás fallos son de tipo (a) a (d): ausencia de módulos y migración (a), funciones no exportadas (b), rutas o funcionalidad 002 aún no implementadas (c) y defectos de `src/` ya identificados (d).

## 1. Estado de disco y alcance

| Comprobación | Resultado |
|---|---|
| `git status --short -- src specs/002-plataforma-v21/contracts src/generated` | Sin cambios |
| `git status --short -- specs/002-plataforma-v21/tasks.md` | **`M`**: 10 líneas `[ ]`→`[x]` en T226–T235 (rebanada 2), sin commit. T237–T242 siguen `[ ]`. Ver hallazgo H-1 |
| `git diff --stat -- tests` | 8 archivos, 953 inserciones, 15 eliminaciones (la previa era 891/3, por las correcciones) |
| Sin seguimiento en `tests/` | `tests/integration/api/assignments-ownership.api.spec.ts`, `tests/integration/persistence/roles-migration.spec.ts`, `tests/unit/permissions-matrix.spec.ts`. Ningún archivo transitorio (`git status --short -- tests/integration` solo muestra los 4 esperados) |
| `tests/integration/api/pets-records.api.spec.ts` (B6) | Diff únicamente aditivo desde la línea 379 (bloque T240 de 85 líneas). Las líneas 1–376, incluidas 126–140 de B6, son idénticas a HEAD |

**Fuera de la lista de Keymaker (declarados aquí, bajo B9):**
- `tests/property/access.property.spec.ts`: +167 líneas, 4 pruebas nuevas (REQ-RBAC-001, INV-ACC2-001).
- `tests/unit/permissions-matrix.spec.ts`: archivo nuevo, 44 celdas (11 acciones × 4 roles).
- Además, `pets-records.api.spec.ts` recibe el bloque T240 (sección 1 del diff). T240 está en el alcance de la entrega, así que no es un defecto, pero conviene declararlo en el log de Keymaker.

## 2. Tabla de verificación B1–B9

| ID | Archivo:línea | Evidencia en disco | Veredicto |
|---|---|---|---|
| B1 | `tests/unit/household-policies.spec.ts:67-75` y `:100` | La tabla tiene 11 transiciones válidas (INVITED×3, ACTIVE×4 con CHANGE_ROLE y TRANSFER_OWNERSHIP, DECLINED/CANCELLED/LEFT/REMOVED×1 cada una). La aserción es `[11, 37]` (48 celdas − 11 = 37). La prueba «las 11 transiciones» **pasa** | **Corregido** |
| B2 | `tests/property/households.property.spec.ts:21` (ERROR_STATUS), `:35-46` (modelo), `:87-88` | Se sustituye el `expect([403,404,409])` por `expectedErrorCode` y `expect(thrown?.code/status)`. No queda ninguna aserción laxa. La prueba sigue en rojo: 001 por (e) y 002 por (b) | **Corregido** |
| B3 | `tests/integration/api/households.api.spec.ts:351` (abandonar: `ownerView` = ADMIN) y `:385` (precondición `myRoleOf(mariaBefore)` = `'ADMIN'`) | Ambas aserciones están. «eliminar el hogar» falla ahora con `expected 'READER' to be 'ADMIN'`, es decir, en rojo por la razón correcta (`roleOnJoin` ignorado, `src/application/use-cases/household-use-cases.ts:101,193`; efecto pendiente de T247) | **Corregido** |
| B4 | `tests/security/exploits/access-control.security.spec.ts:84` y `:97` | Ahora es `POST /api/backup/export` con cabecera `x-argos-request` (= `CSRF_HEADER`, `src/infrastructure/http/plugins/csrf-guard.ts:12`). **Pero** `src/infrastructure/http/routes/backup.routes.ts:20` registra `app.get('/api/backup/export')`. La prueba falla por contrato (`expected [Array(1)] to deeply equal []`) | **Parcial**: test corregido; defecto de `src/` (d) pendiente |
| B5 | `tests/security/exploits/access-control.security.spec.ts:150-151` | Siembra explícita: `POST /api/households/${H1}/invitations` para carlos_88 antes de la aserción | **Corregido**. La prueba falla ahora por regresión D-01 (d), que es lo esperado |
| B6 | `tests/integration/api/pets-records.api.spec.ts:126-140` | Sin cambios respecto a HEAD (diff solo en 379+). Sigue en rojo: `expected [500, …] to deeply equal [201, …]` | **No tocado** (verificado). Defecto de `src/` (d), ver sección 5 |
| B7 | `tests/integration/api/assignments-ownership.api.spec.ts:161` | `SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'OWNERSHIP_TRANSFER' AND entity_type = 'PET' …` | **Corregido** (por lectura). No se puede ejecutar: la prueba cae antes por la ruta `PUT .../assignments` (c) |
| B8 | `tests/unit/use-cases.households.spec.ts:282` (firma de `execute(actor, householdId, input)`) y `tests/security/exploits/access-control.security.spec.ts:163-181` (`type ForbiddenCell = readonly [label, method, url, body]`) | `tsc --noEmit` ya no reporta TS2554 ni TS2345 | **Corregido** |
| B9 | `tests/property/access.property.spec.ts` y `tests/unit/permissions-matrix.spec.ts` | Declarados en este informe (sección 1). Su rojo es (a) por módulos ausentes | **Declarado** |

Nota sobre B4: el enunciado de Keymaker dice que la corrección está en la prueba. Eso es cierto, pero la prueba solo puede pasar cuando `src/` implemente POST con CSRF. Es una decisión de Nivel 2 o de implementación (sección 6, D-2).

## 3. Verificaciones de compuerta

- **`bash scripts/verify-oracles.sh`**: `Archivos analizados: 79; oráculos débiles: 0; Resultado: CUMPLE`.
- **Grep en los 11 archivos** (`expect(true)`, `.skip`, `.todo`, `.only`, `xit`, `xdescribe`, `expect([403,404,409])`, `toBeDefined()`, `toBeTruthy()`): **0 coincidencias**.
- **Aserciones condicionales** (observación O-2, no bloqueante):
  - `tests/property/access.property.spec.ts:220`: `if (role === null || role === 'OWNER') return;` salta la aserción en esos casos. Aceptable si otra prueba cubre el caso nulo.
  - `tests/property/access.property.spec.ts:237`: `if (can(lower, action)) expect(can(upper, action)).toBe(true);` es una implicación válida de monotonía, no una aserción vacía.
  - `tests/unit/household-policies.spec.ts:87-100` y `tests/property/households.property.spec.ts:86-91`: ramas `if/else` que aseveran en ambas ramas.
- **`node_modules/.bin/tsc --noEmit`** (exit 2, 5 errores, todos TS2307):

| Archivo:línea | Código | Clasificación |
|---|---|---|
| `tests/property/access.property.spec.ts:184` y `:185` | TS2307 `effective-role.ts`, `rbac.ts` | (a) módulo ausente, esperado hasta T244 |
| `tests/unit/access-policy.spec.ts:161` y `:162` | TS2307 `effective-role.ts`, `rbac.ts` | (a) |
| `tests/unit/permissions-matrix.spec.ts:49` | TS2307 `rbac.ts` | (a) |

Los errores TS2554 (B8, antes en `use-cases.households.spec.ts:303-327`) y TS2345 (B8, antes en `access-control.security.spec.ts:214`) ya no aparecen.

## 4. Vitest: 11 archivos

Comando: `node_modules/.bin/vitest run` sobre los 11 archivos (salida en `/tmp/oracle-vitest-final.txt`).

**Totales: 124 fallan | 96 pasan | 220.** Coinciden exactamente con la cifra de Keymaker (96 / 124 / 220).

| Archivo | Pasan | Fallan | Total |
|---|---|---|---|
| tests/unit/access-policy.spec.ts | 8 | 11 | 19 |
| tests/unit/household-policies.spec.ts | 23 | 12 | 35 |
| tests/unit/use-cases.households.spec.ts | 9 | 9 | 18 |
| tests/property/households.property.spec.ts | 1 | 2 | 3 |
| tests/integration/api/households.api.spec.ts | 20 | 9 | 29 |
| tests/integration/api/assignments-ownership.api.spec.ts | 0 | 11 | 11 |
| tests/integration/api/pets-records.api.spec.ts | 28 | 7 | 35 |
| tests/integration/persistence/roles-migration.spec.ts | 0 | 7 | 7 |
| tests/security/exploits/access-control.security.spec.ts | 5 | 8 | 13 |
| tests/property/access.property.spec.ts | 2 | 4 | 6 |
| tests/unit/permissions-matrix.spec.ts | 0 | 44 | 44 |
| **Total** | **96** | **124** | **220** |

## 5. Clasificación de los 124 fallos

Cada grupo corresponde a una causa comprobada en el mensaje de error, el archivo o el código fuente.

| Grupo | Causa | Fallos | Desglose por archivo |
|---|---|---|---|
| **(a)** módulo o migración ausente, esperado | `Failed to load url .../domain/access/effective-role.ts` y `rbac.ts`; `no such table: pet_assignments`; `no such column: role` / `m.role`; `0004_pendiente.sql` (la migración 0004 no existe) | **66** | access-policy 11; access.property 4; permissions-matrix 44; roles-migration 7 |
| **(b)** función no exportada, esperada hasta T243–T249 | `mod.applyMembershipEvent is not a function`; `ChangeMemberRoleUseCase no está exportado`; `TransferHouseholdOwnershipUseCase no está exportado` | **14** | household-policies 9 (bloque T237); use-cases 4 (bloque 002); households.property 002 1 |
| **(c)** ruta HTTP o funcionalidad 002 no implementada | `contrato OpenAPI de PUT /api/pets/.../assignments/...` (ruta inexistente); `POST .../ownership-transfer` y `PATCH /api/households/.../members/...` (inexistentes); `READER` en lugar de `CAREGIVER` y `READER` en lugar de `ADMIN` (`roleOnJoin` ignorado hasta T247) | **27** | assignments-ownership 11; pets-records T240 5; households.api 7; access-control T242 4 |
| **(d)** defecto de `src/` ya identificado | B4 (`backup.routes.ts:20` GET frente a POST): 2. B6 (`record-use-cases.ts:30,57`): 2. Regresión D-01 (la invitación INVITED se revela a miembros, `household-use-cases.ts:89`): 3 | **7** | access-control 2+1; pets-records 2; households.api 1; use-cases 1 |
| **(e)** prueba de la 001 que contradice la 002 y no ha sido sustituida (tabla C) | `expected [true,false] to deeply equal [true,true]` (OWNER → ADMIN); `expected false to be true` (invitar); OWNER no puede abandonar; `Lucía crea un hogar` (forma); `Carlos ve su invitación` (forma); `Mis hogares` (ADMIN frente a OWNER); `EDGE-031` (11 claves frente a 10); `201 ADMIN frente a OWNER` en la API; `canEdit` retirado por la 002 (`specs/002-plataforma-v21/contracts/schemas/pet.schema.json:490` sustituye `canEdit` por `permissions`), `expected 200 … undefined` frente a `false`; propiedad 001 con contraejemplo `[INVITE]` | **10** | household-policies 3; use-cases 4; households.api 1; access-control 1; households.property 001 1 |

Suma: 66 + 14 + 27 + 7 + 10 = **124**.

### Clasificación del grupo (e): motivo del FAIL

Estas 10 pruebas siguen en la 001 con su texto original (`git diff` de `household-policies.spec.ts` no toca `crear hogar`, ni los demás casos). La tabla C de `.specify/memory/audits/hoja-de-ruta-feature-002.md:58-62` exige sustituirlas por sus versiones 002 («Mismos, con roles…»), y la regla de la tabla C dice «ninguna prueba se borra sin su sustituta». Esta entrega no las sustituye, y B1–B9 no las menciona. Como el grupo no encaja en (a)–(d) y además es un defecto de `tests/`, el veredicto es FAIL.

Dos de estas 10 pruebas tienen causa exacta sin resolver: «invitar a Lucía» (`expected false to be true`) y la propiedad 001 con contraejemplo `[{"kind":"INVITE"}]`. Siguen clasificadas como (e) porque el texto de la 001 contradice la 002 en ambos casos, pero la causa no está confirmada.

## 6. Hallazgos y decisiones pendientes para Neo

**PARA: Neo (Andrés Vallejo — Nivel 2)**

- **D-1 (bloquea el PASS)**: las 10 pruebas del grupo (e) deben sustituirse según la tabla C, o Neo debe decidir aplazar esa sustitución a T243 por escrito. Como MAX_RETRY ya está consumido, la vía es una decisión de Neo, no un nuevo ciclo automático. Lista exacta: household-policies (crear hogar, invitar a Lucía, OWNER no puede abandonar); use-cases (Lucía crea, Carlos ve su invitación, Mis hogares, EDGE-031); households.api (crear hogar 201); access-control (María lee la ficha, `canEdit`); households.property 001 (propiedad de INVITE).
- **D-2 (B6, fuente de `category` y datos veterinarios)**: Keymaker (`claude/log-keymaker.md:202`) indica que `VaccinationRecord` y `DewormingRecord` exigen `category`, `veterinarianName` y `veterinarianLicense`, que `NULLABLE_DEFAULTS` (`src/application/use-cases/record-use-cases.ts:30`, aplicado en `:57`) no los aporta y que `encode` lanza `ERR-INTERNAL-UNEXPECTED`, de modo que el HTTP responde 500. Hay que decidir qué fuente de datos es válida. Si el contrato 001 los exige, la entrada de la API debe rechazarse con 400, no producir 500, y la prueba `RECORD_INPUTS.vaccinations` debe incluirlos. Si no los exige, el dominio debe aceptar nulos. La decisión sobre datos veterinarios corresponde a Maggie (`/maggie`) y la de contrato a Architect. **No se resuelve cambiando la prueba.**
- **D-3 (B4, GET frente a POST en `src/`)**: el contrato 3.0.0 exige `POST /api/backup/export` con CSRF (`pet-tracker-api.openapi.yaml:196-197`), pero `src/infrastructure/http/routes/backup.routes.ts:20` registra `GET`. Hay que cambiar la ruta en `src/` (tarea de Link o Keymaker). Además, `tests/integration/api/backup-atomicity.spec.ts` usa GET y está fuera de esta auditoría; conviene revisarlo.
- **D-4 (N-1, tabla C)**: pendiente, ver D-1.
- **D-5 (N-2, firma de `effectiveRole` y vocabulario de `RbacAction`)**: sigue abierta. Bloquea T244. Los tests de `access-policy`, `access.property` y `permissions-matrix` importan `effective-role.ts` y `rbac.ts` sin firma aprobada.
- **D-6 (N-3, nombres de `applyMembershipEvent`, `ChangeMemberRoleUseCase`, `TransferHouseholdOwnershipUseCase`)**: sigue abierta, para T243 y T244.

**Hallazgos (no bloquean esta verificación, pero requieren atención de Neo):**

- **H-1 (Nivel 2, fuera de alcance)**: `specs/002-plataforma-v21/tasks.md` tiene `M` sin commit con 10 líneas `[ ]`→`[x]` en T226–T235. El CLAUDE.md (sección 1) reserva a Neo el estado `COMPLETED` y restringe a los agentes al techo `REVIEW`. Si Neo no hizo ese cambio, hay que revertirlo. Oracle no lo ha tocado.
- **H-2 (O-1)**: `tests/integration/persistence/roles-migration.spec.ts:19` usa `0004_pendiente.sql` como nombre por defecto. La prueba no pasa ni falla por la migración real hasta que exista un archivo `0004_*.sql`. Observación, no bloqueante.
- **H-3 (O-2)**: aserciones condicionales en `access.property.spec.ts:220` y `:237`. Justificadas como implicación o salida anticipada, no bloqueantes.
- **H-4**: `roleOnJoin` se guarda (`household-use-cases.ts:157-169`) pero su efecto llega en T247 (`household-use-cases.ts:143` lo declara). Explica (c) en las pruebas de rol.
- **H-5**: el bloque T240 añadido a `pets-records.api.spec.ts` (+85 líneas, desde la línea 379) está en alcance y no toca B6. Keymaker debería declararlo en su log.

## 7. Resumen de estado por corrección

| Corrección | Estado |
|---|---|
| B1 | Corregido, pasa |
| B2 | Corregido (test en rojo por (e) y (b)) |
| B3 | Corregido (test en rojo por (c), razón correcta) |
| B4 | Parcial: test corregido; `src/` GET (d) pendiente, D-3 |
| B5 | Corregido (test en rojo por (d), razón correcta) |
| B6 | No tocado (verificado); defecto de `src/` (d), D-2 |
| B7 | Corregido por lectura; no ejecutable hasta T244 (c) |
| B8 | Corregido (`tsc` limpio salvo TS2307 esperados) |
| B9 | Declarado |

## Próximo paso

Neo decide D-1 (sustituir el grupo (e) según la tabla C, o aplazarlo por escrito). Después, D-2 (fuente de `category` y datos veterinarios, con Maggie y Architect) y D-3 (ruta `POST` de backup en `src/`).
