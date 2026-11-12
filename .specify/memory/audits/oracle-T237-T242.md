# Oracle: auditoría de T237–T242 (entrega de Keymaker)

Fecha: 2026-11-11 · Rama: `002-plataforma-v21` · Auditor: Oracle · Destinatario: Neo (Andrés Vallejo — Nivel 2)

## Veredicto: FAIL (devolver a Keymaker, MAX_RETRY = 1)

La entrega es solo de tests (sin `src/`, contratos ni `src/generated/`), y es coherente con que T237–T244 sean TDD. Pero hay defectos concretos que invalidan parte del oráculo: una tabla de transiciones incompleta con un conteo aritméticamente imposible, un oráculo débil, pruebas de 001 que cambian de método HTTP sin actualizarse, un 500 sin explicar en un camino de propietario y un error de tipado en `tsc`. Hay además archivos fuera de la lista declarada.

## 1. Estado de disco y alcance

- `git status --short -- tests src specs/002-plataforma-v21/contracts src/generated`: sin cambios en `src/`, `specs/002-plataforma-v21/contracts/` ni `src/generated/`.
- `git diff --stat -- tests`: 8 archivos modificados, +891 / −3. Nuevos (sin seguimiento): `tests/integration/api/assignments-ownership.api.spec.ts`, `tests/integration/persistence/roles-migration.spec.ts`, `tests/unit/permissions-matrix.spec.ts`.
- Las 3 líneas eliminadas son exactamente las declaradas:
  - `tests/unit/access-policy.spec.ts:57` `INV-ACC-001` → `INV-ACC2-001`.
  - `tests/unit/access-policy.spec.ts:88` `INV-ACC-002` → `INV-ACC2-002`.
  - `tests/security/exploits/access-control.security.spec.ts`: la importación de `api-fixtures` se reemplaza por otra que añade `NEW_PET` y `USERS_BY_NAME`.
- **Fuera de la lista de Keymaker (no declarados):**
  - `tests/property/access.property.spec.ts`: +167 líneas, 4 pruebas nuevas REQ-RBAC-001 / INV-ACC2-001.
  - `tests/unit/permissions-matrix.spec.ts`: nuevo, 44 celdas (11 acciones × 4 roles).

## 2. Oráculos

- `bash scripts/verify-oracles.sh`: "Archivos analizados: 79; oráculos débiles: 0; Resultado: CUMPLE". El script no detecta el defecto B2 de abajo.
- Revisión manual de las 11 suites con `grep`:
  - `expect(true)`, `.skip`, `.todo`, `.only`, `xit`, `xdescribe`: 0 ocurrencias.
  - `toBeDefined` / `toBeTruthy` como única aserción: 0.
  - `it.each` no vacíos: `pets-records.api.spec.ts:126` (6 filas), `permissions-matrix.spec.ts:48` (44 casos).
  - Aserciones débiles o condicionales:
    - `households.property.spec.ts:50` `expect([403, 404, 409]).toContain(error.status)`: **oráculo débil** (B2).
    - `household-policies.spec.ts:83-92`: rama `if/else` con contadores; la aserción final está en la línea 95 (B1).
    - `access.property.spec.ts:220`: `if (role === null || role === 'OWNER') return;` salta la aserción en esos casos. Aceptable si otra prueba cubre el caso nulo (la cubre `access-policy.spec.ts`). Observación.
    - `roles-migration.spec.ts:19` y `:152`: el nombre de la migración 0004 cae a un valor por defecto `0004_pendiente.sql` si no existe el archivo. La prueba puede pasar o fallar según el nombre, no según la migración. Observación (O-1).

## 3. Cobertura de IDs y valores frente a spec y contratos

| ID | Presente en spec.md (líneas) | Observación |
|---|---|---|
| REQ-HOUSE2-001 / 002 / 003 | 3 / 6 / 3 | Valores de roles (`roleOnJoin`, ADMIN/CAREGIVER/READER) según spec y OpenAPI |
| INV-HOUSE2-001 | 4 | Propietario único |
| INV-OWN2-001 | 2 | Solo el Propietario Legal lista asignaciones (OpenAPI línea 10 de `GET /pets/{petId}/assignments`) |
| REQ-MIG-001 | 3 | Ver item 6 y O-1 |
| SC-011 / SC-016 / SC-017 | 1 cada uno | SC-017 fija 403 implícito «se rechaza» sin código; OpenAPI fija `403 ERR-ACC-FORBIDDEN` |
| INV-ACC2-001 / 002 | 3 / 3 | Matriz de la prueba coincide con la de spec.md líneas 219-237 |
| EDGE-008 / EDGE-009 | 0 | Son IDs de la 001 (decisión de Neo registrada en `oracle-T236-fila6.md`) |

**Matriz REQ-RBAC-001 (spec.md:219-237) frente a `permissions-matrix.spec.ts:18-38`:** las 11 filas y 44 celdas coinciden. Notas:
- La hoja de ruta (`hoja-de-ruta-feature-002.md:66`) dice «32 celdas»: texto desactualizado; la spec tiene 44.
- Las columnas Admin de «invitar, expulsar, cambiar rol» (M08) y «exportar/importar» (M11) tienen matices de la spec (ADMIN no propietario no expulsa ni elimina; el respaldo solo sobre mascotas propias) que `can(rol, acción)` no puede expresar. La prueba fija solo la columna de rol. Observación.

**Valores no derivados de spec ni contrato:**
- `household-policies.spec.ts:67-75` (MEMBERSHIP_TABLE): tabla escrita a mano con 9 transiciones válidas.
- `household-policies.spec.ts:95`: `expect([valid, invalid]).toEqual([9, 27])`. La máquina `household-membership.machine.json` declara 11 transiciones válidas (INVITED: ACCEPT, DECLINE, CANCEL; ACTIVE: LEAVE, REMOVE, CHANGE_ROLE, TRANSFER_OWNERSHIP; DECLINED/CANCELLED/LEFT/REMOVED: INVITE). El bucle recorre 6 estados × 8 eventos = 48 celdas (`src/generated/machines/household-membership.machine.ts:144,148`). La suma valid + invalid siempre es 48, así que `[9, 27]` no puede cumplirse. Además la tabla omite CHANGE_ROLE y TRANSFER_OWNERSHIP, que son eventos nuevos de la 002.
- `assignments-ownership.api.spec.ts:161`: consulta la tabla `audit_entries`. La spec y `data-model.md:21,195` usan `audit_log`.
- `roles-migration.spec.ts:19`: nombre `0004_pendiente.sql` como valor por defecto (O-1).

## 4. Ejecución (vitest, 9 archivos pedidos + 2 adicionales)

| Archivo | Pasan | Fallan | Total |
|---|---|---|---|
| tests/unit/access-policy.spec.ts | 8 | 11 | 19 |
| tests/unit/household-policies.spec.ts | 22 | 13 | 35 |
| tests/unit/use-cases.households.spec.ts | 9 | 9 | 18 |
| tests/property/households.property.spec.ts | 1 | 2 | 3 |
| tests/integration/api/households.api.spec.ts | 21 | 8 | 29 |
| tests/integration/api/assignments-ownership.api.spec.ts | 0 | 11 | 11 |
| tests/integration/api/pets-records.api.spec.ts | 28 | 7 | 35 |
| tests/integration/persistence/roles-migration.spec.ts | 0 | 7 | 7 |
| tests/security/exploits/access-control.security.spec.ts | 5 | 8 | 13 |
| **Subtotal (9 archivos)** | **94** | **76** | **170** |
| tests/property/access.property.spec.ts (adicional) | 2 | 4 | 6 |
| tests/unit/permissions-matrix.spec.ts (adicional) | 0 | 44 | 44 |

Causas de los 76 fallos (por mensaje de error): 11 por módulo ausente (`effective-role.ts`, `rbac.ts`, `ChangeMemberRoleUseCase` no exportado, etc.), 46 aserciones, 19 otros (contrato OpenAPI del harness: `PUT .../assignments` devuelve `application/json` en vez de `application/problem+json` porque la ruta no existe, y errores de SQLite por tablas o columnas de la migración 0004 todavía no creada). Las pruebas de propiedades fallan con contraejemplos reales (ver item 6).

## 5. Las cinco pruebas que ya pasan

| Prueba (households.api.spec.ts) | Decisión | Motivo |
|---|---|---|
| `expulsar` (línea 324) | (a) se queda | `removeOrLeave` → REMOVE (`household-policies.ts:288-311`). La prueba ejerce `DELETE /members/:userId` de verdad. Limitación: `roleOnJoin` se ignora (ver B3), así que no prueba el rol. |
| `propietario no puede abandonar` (334) | (a) se queda | `ERR-HOUSE-OWNER-CANNOT-LEAVE` en `household-policies.ts:297-299`. La parte «sigue como ADMIN» depende del adaptador provisional OWNER→ADMIN de `household-use-cases.ts:73,92` (T237 PENDIENTE). Válida mientras el adaptador exista; hay que revisarla al retirarlo. |
| `abandonar` (343) | (a) con defecto de título (B3) | LEAVE existe (`household-policies.ts:300-303`). El título promete «el propietario sigue como ADMIN» y no lo asevera. |
| `eliminar el hogar` (378) | **(b) oráculo débil (B3)** | El invitado `maria.v` con `roleOnJoin: 'ADMIN'` queda como **READER**, porque `household-use-cases.ts:101,193` fija `roleOnJoin: 'READER'`. El 403 lo produce «no es propietaria» (`requireOwner`, `household-policies.ts:314-321`), no la regla ADMIN. La prueba pasaría igual con CAREGIVER o READER. Hace falta una precondición que falle hoy (ver B3). |
| `responder dos veces` (393) | (a) se queda | Segunda aceptación → `requireInvitation` → `ERR-HOUSE-INVITATION-NOT-FOUND` (`household-policies.ts:242-245`). Ejerce la ruta real. |

## 6. Las 18 pruebas de la 001 que fallan

Recuento confirmado: 18 (titles de HEAD: 4 en household-policies, 5 en use-cases, 1 en households.property 001, 2 en households.api, 2 en pets-records, 4 en access-control). Cada una clasificada según la tabla C de `hoja-de-ruta-feature-002.md` (líneas 56-80):

| # | Prueba 001 | Causa observada | Clasificación |
|---|---|---|---|
| 1 | household-policies: máquina STATE (tabla 9 + conteo 9/27) | Tabla incompleta y conteo imposible (sección 3) | Sustituible por fila 67, pero **el reemplazo es defectuoso** (B1) |
| 2 | household-policies: crear hogar, único OWNER | `[true,false]` vs `[true,true]`: rol inicial ADMIN | Sustituible (fila 67; spec REQ-HOUSE-001) |
| 3 | household-policies: invitar a Lucía | `expected false to be true` (línea 168) | Sustituible (fila 67). Causa exacta no determinada en esta auditoría |
| 4 | household-policies: OWNER no puede abandonar (EDGE-015) | Cambio de etiqueta | Sustituible; la regla se mantiene |
| 5 | use-cases: Lucía crea un hogar | Cambio de forma (rol) | Sustituible. **Hueco:** `use-cases.households.spec.ts` no aparece en la tabla C |
| 6 | use-cases: Carlos acepta (3 claves vs 2) | Forma de la fila | Sustituible; hueco igual que #5 |
| 7 | use-cases: detalle del hogar (3 miembros esperados, 2 recibidos) | El propietario no ve la invitación INVITED de Carlos | **No sustituible: regresión D-01 probable** (`household-use-cases.ts:89` lee INVITED de la vista; la invitación vive en la tabla nueva) |
| 8 | use-cases: Mis hogares (ADMIN vs OWNER) | Rol | Sustituible |
| 9 | use-cases: EDGE-031 (membresía de 11 claves vs 10) | Forma nueva (`roleOnJoin`) | Sustituible; hueco igual que #5 |
| 10 | households.property 001 (INV-HOUSE-001/003) | Contraejemplo mínimo: una sola operación INVITE | **No determinado:** un INVITE solo debe ser válido en 002. Revisar antes de sustituir |
| 11 | households.api: crear hogar (`ADMIN` vs `OWNER`) | Rol | Sustituible (fila 68) |
| 12 | households.api: D-01 EDGE-037/038 (propietario ve INVITED en members) | Mismo síntoma que #7 | **No sustituible: regresión D-01 probable** (B5 y #7) |
| 13 | pets-records: POST vacunas, dueño → 201, recibe **500** | No es un tema de roles. El 500 no lo explica ninguna tabla de C | **No sustituible: defecto** (B6) |
| 14 | pets-records: POST desparasitaciones, dueño → **500** | Igual que #13 | **No sustituible: defecto** (B6) |
| 15 | access-control: María lee la ficha (200, canEdit false) | Falla una comparación de `profile.id` o `canEdit`; el diff no se extrajo | No determinado. La fila 72 de C solo cubre IDOR |
| 16 | access-control: exportación de María (`GET /api/backup/export`) | El contrato 3.0.0 define **POST** con CSRF (`pet-tracker-api.openapi.yaml:196-197`) | **No sustituible: prueba desactualizada** (B4) |
| 17 | access-control: importar respaldo de María con la cuenta de Lucía | Mismo problema de método | **No sustituible** (B4) |
| 18 | access-control: INV-HOUSE-004 (INVITED de Carlos visible al propietario) | La prueba no siembra ninguna invitación en H1 (`tests/fixtures/application-harness.ts` no tiene invitaciones; `identity-fixtures.ts:54` siembra Carla en otro hogar) | **No sustituible: defecto de siembra** (B5) |

Resumen: 9 sustituibles (una de ellas con reemplazo defectuoso), 7 no sustituibles (regresiones o defectos), 2 no determinadas (#10 y #15).

## 7. Desajuste de fixtures

Hay tres juegos de usuarios distintos:
- **Arneses de API y seguridad**: `andres`, `maria.v`, `carlos_88`, `lucia.r` (`tests/fixtures/application-harness.ts`).
- **Ejemplos canónicos 002**: `ana.duena`, `bruno.admin`, `carla.cuida`, `diego.lector`, `elena.solo` (`specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json`; 20, 12, 9, 7 y 18 apariciones).
- **Identidad 001**: `ANA`, `BRUNO`, `CARLA`, `ELENA` (`tests/fixtures/identity-fixtures.ts`).

**Evaluación:** es un problema de organización, no de validez, para los archivos de Keymaker: las pruebas nuevas usan el arnés de forma coherente y las aserciones de roles salen de la spec, no de los nombres. Sí es un defecto cuando la siembra falta (B5). **Corrección mínima propuesta (no escrita):** una tabla de correspondencia en un único módulo de fixtures (p. ej. `tests/integration/api/api-fixtures.ts`) que mapee cada nombre canónico al usuario del arnés, sin renombrar nada, y añadir a `tests/integration/api/api-harness.ts` un comentario que indique la fuente de verdad.

## 8. `tsc --noEmit`

Diez errores (`node_modules/.bin/tsc --noEmit`, salida en `/tmp/oracle-tsc.txt`):

| Código | Archivo:línea | Clasificación |
|---|---|---|
| TS2307 (×5) | `access.property.spec.ts:184,185`; `access-policy.spec.ts:161,162`; `permissions-matrix.spec.ts:49` | Esperados hasta T244 (`effective-role.ts`, `rbac.ts` no existen) |
| TS2554 (×4) | `use-cases.households.spec.ts:303,312,319,327` | **Defecto de tipado en el test** (B8): `UseCaseCtor` declara `execute` con 2 argumentos y la llamada pasa 3 (actor, householdId, cuerpo). La firma no está en contrato (item 9) |
| TS2345 (×1) | `access-control.security.spec.ts:214` | **Defecto de tipado en el test** (B8): la tupla `[label, method, url, body]` se infiere como unión que incluye `undefined` |

`tsc` no está limpio. Los 5 TS2307 bloquean la compuerta hasta T244; los 5 restantes son defectos.

## 9. Suposiciones de firma y de contrato

| Suposición | Spec o contrato | Decisión |
|---|---|---|
| `effectiveRole(usuario, mascota, membresías, asignaciones)` | No hay firma en spec ni en contrato. `plan.md:59` y `tasks.md:143` nombran el módulo `effective-role.ts`. `canonical-fixtures.json` tiene `effectiveRole` como rótulo de fixtures de permisos, no como función | **Decisión pendiente de Neo** (ya registrada en `log-oracle.md:95`) |
| `can(rol, acción)` con acciones de 11 nombres | `PetPermissions` (fixtures) tiene 9 claves; los nombres `WRITE_HEALTH_EVENTS` etc. vienen de `x-sdd-rbac-action` (OpenAPI). `MANAGE_HOUSEHOLD_MEMBERS` y `EXPORT_IMPORT_BACKUP` no están en `PetPermissions` | Pendiente para T244: fijar el vocabulario de `RbacAction` antes de implementar |
| `applyMembershipEvent` (`household-policies.spec.ts:393`) | No está en spec ni en contrato. La máquina tiene eventos, no nombre de función | **Decisión pendiente para T244/Architect**; hoy no existe en `src/` |
| `ChangeMemberRoleUseCase`, `TransferHouseholdOwnershipUseCase` | No hay nombres de clase en spec. OpenAPI tiene `operationId` `changeMemberRole` y `transferHouseholdOwnership` | **Decisión pendiente para T243/T244:** derivar el nombre del `operationId` |
| `execute(actor, householdId, cuerpo)` (TS2554) | No está en contrato | **Decisión pendiente** (Architect/Keymaker); es la causa de B8 |
| `audit_entries` (`assignments-ownership.api.spec.ts:161`) | La spec y `data-model.md` dicen `audit_log` | **Defecto** (B7): no es suposición, la tabla está nombrada |
| `data.revokedAt` (`roles-migration.spec.ts:67-68`) | `auth-session.machine.json:40` define `revokedAt: IsoTimestamp \| null` | Respaldado por la máquina; ok |

## 10. Discrepancia: asignar mascota a hogar sin dueño ACTIVE

- OpenAPI, `PUT /pets/{petId}/assignments/{householdId}` (`pet-tracker-api.openapi.yaml:~680-700`): «si el Propietario Legal ... no es miembro ACTIVE ... la asignación se rechaza con **403 ERR-ACC-FORBIDDEN**».
- `household-membership.machine.json` (`rules.unauthorizedActor`, línea 160): «ERR-HOUSE-NOT-FOUND si el actor no es miembro ACTIVE». Pero esa regla describe acciones de hogar. La máquina no tiene evento `ASSIGN` (los 8 eventos son ACCEPT, DECLINE, CANCEL, LEAVE, REMOVE, CHANGE_ROLE, TRANSFER_OWNERSHIP, INVITE).
- `spec.md:355` (SC-017): «se rechaza el 100 % de las veces», sin código.
- **Prevalece el OpenAPI** para el código HTTP de esa operación: es el único artefacto que fija la respuesta de ese endpoint, la máquina no modela esa acción y la spec no fija el código. `assignments-ownership.api.spec.ts` ya espera 403, y el arnés valida cada respuesta contra OpenAPI.
- **No es Caso B bloqueante** (no exige cambiar contrato). Recomendación no bloqueante para Architect: añadir una nota en `rules.unauthorizedActor` que excluya explícitamente las operaciones de asignación, para que la máquina no contradiga al OpenAPI.

## Defectos para devolver a Keymaker (MAX_RETRY = 1)

| ID | Archivo:línea | Defecto | Corrección mínima |
|---|---|---|---|
| B1 | `tests/unit/household-policies.spec.ts:67-75` y `:95` | Tabla con 9 transiciones (faltan CHANGE_ROLE y TRANSFER_OWNERSHIP de ACTIVE). Conteo `[9,27]` imposible con 48 celdas. La máquina declara 11 | Completar la tabla con las 11 transiciones de `household-membership.machine.json`. Aserción `[11, 37]` |
| B2 | `tests/property/households.property.spec.ts:50` | `expect([403,404,409]).toContain(error.status)` acepta cualquier código | Mapear cada operación a su código (REMOVE de no propietario → 403; LEAVE de propietario → 409; destino inexistente → 404) |
| B3 | `tests/integration/api/households.api.spec.ts:343-349` y `:378-386` | «abandonar» no asevera «el propietario sigue como ADMIN». «eliminar el hogar» pasa sin ADMIN real porque `roleOnJoin` se ignora (`household-use-cases.ts:101,193`) | En «abandonar», añadir la aserción del propietario. En «eliminar», comprobar antes del DELETE que `maria.v` tiene `myRole === 'ADMIN'`; hoy falla, y así la prueba queda en rojo por la razón correcta |
| B4 | `tests/security/exploits/access-control.security.spec.ts:84` y `:97` | Llama `GET /api/backup/export`; el contrato 3.0.0 es `POST` con CSRF (`pet-tracker-api.openapi.yaml:196-197`) | Cambiar a `POST` y enviar la cabecera CSRF. Además, `tests/integration/api/backup-atomicity.spec.ts` usa GET (fuera de la auditoría; avisar) |
| B5 | `tests/security/exploits/access-control.security.spec.ts:148-153` | INV-HOUSE-004 espera una invitación de Carlos en H1 que el arnés no siembra | Sembrar la invitación en el test (`inviteAndAccept` u otra forma) |
| B6 | `tests/integration/api/pets-records.api.spec.ts:126-140` (vacunas y desparasitaciones, dueño) | 500 no explicado en un camino de propietario. No es de roles. Sospecha: `present()` en `src/application/use-cases/record-use-cases.ts:98-99` y `:110-111` (`existing.vaccinations` / `existing.dewormings` o `evaluateByKey`) | Capturar el error (stack) y corregir o documentar la regresión. **No se resuelve cambiando la prueba** |
| B7 | `tests/integration/api/assignments-ownership.api.spec.ts:161` | `audit_entries` no coincide con `audit_log` (`data-model.md:21,195`) | Usar `audit_log` |
| B8 | `tests/unit/use-cases.households.spec.ts:303,312,319,327` y `tests/security/exploits/access-control.security.spec.ts:214` | Errores TS2554 y TS2345 en la compuerta de `tsc` | Ajustar el tipo `UseCaseCtor` y la tupla de `forbiddenCells` (sin cambiar valores) |
| B9 | `tests/property/access.property.spec.ts` (+167) y `tests/unit/permissions-matrix.spec.ts` (nuevo) | Cambios no declarados en la lista de Keymaker | Declararlos en el log y en la entrega. El conteo de la matriz (44) es el correcto; corregir la hoja de ruta («32 celdas») en su momento |

Observaciones (no bloquean): O-1 `roles-migration.spec.ts:19` nombre por defecto `0004_pendiente.sql`: exigir el archivo real. Hueco de la tabla C: `use-cases.households.spec.ts`, `roles-migration.spec.ts`, backup export (B4) e INV-HOUSE-004 no tienen fila explícita (ver decisión N-1).

## Decisiones pendientes de Neo (Nivel 2)

- **N-1:** ratificar la tabla C de `hoja-de-ruta-feature-002.md` con dos filas nuevas: `use-cases.households.spec.ts` (sustituible por la fila 67) y `roles-migration.spec.ts` (migración 0004, nueva). Y decidir si las pruebas de backup export se corrigen en sitio (B4) o se sustituyen.
- **N-2:** firma de `effectiveRole` y vocabulario de `RbacAction` (ya abierta en `log-oracle.md:95`). Bloquea T244.
- **N-3:** para T243/T244: nombres de `applyMembershipEvent`, `ChangeMemberRoleUseCase`, `TransferHouseholdOwnershipUseCase` y firma `execute(actor, householdId, cuerpo)`. Son decisiones de implementación, no de contrato. Puede delegarlas a Architect.

## Próximo paso

Devolver a Keymaker la lista B1–B9 (MAX_RETRY = 1). Tras la corrección, Oracle repite la verificación de los 11 archivos y de `tsc`. Los errores TS2307 esperan a T244.

---

DE: Oracle
PARA: Neo (Andrés Vallejo — Nivel 2)
ESTADO: Bloqueado
DETALLE: FAIL en T237–T242. Sin cambios en src/, contratos ni src/generated. 170 pruebas en 9 archivos (94 pasan, 76 fallan); 6 adicionales en access.property (2/4) y 44 en permissions-matrix (0/44). Defectos B1–B9 con archivo y línea en este informe. Dos pruebas de 001 (pets-records vacunas y desparasitaciones) devuelven 500 para el dueño, sin explicación en el contrato ni en la tabla C; no son sustituibles.
SIGUIENTE PASO RECOMENDADO: Devolver B1–B9 a Keymaker con MAX_RETRY = 1 y decidir N-1 (tabla C) y N-2 (firma de effectiveRole) antes de T244.
