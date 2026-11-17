# Oracle · Veredicto final de T237–T242 (revalidación D2) · 2026-11-11

**Nota de nombre:** el informe se guarda como `oracle-T237-T242-final-D2.md` y no como `...-FINAL.md`, porque en macOS (sistema de archivos sin distinción de mayúsculas) colisionaría con `oracle-T237-T242-final.md`.

**VEREDICTO: FAIL (defecto único de tests/).** Los puntos 1 y 2 quedan resueltos. El punto 3 es correcto en su decisión, pero reveló un residuo de la 001 sin sustituir en otra aserción de la misma familia de hogares (ver §5).

---

## 1. Puntos de la última ronda

| # | Archivo y línea | Decisión | Evidencia en disco |
|---|---|---|---|
| 1 | `tests/security/exploits/malicious-input.security.spec.ts:248` (registro) | **CUMPLE**. `'Mallory2026x!'` y `confirmPassword` idéntico. | Longitud 13 (rango 10–128). Mayúscula `M`. Dígitos `2026`. Símbolo `!`, incluido en `PASSWORD_SYMBOLS` (`src/domain/auth/password-policy.ts`). Contrato `identity.schema.json:87–105` (`Password`) y `:230–238` (`confirmPassword`). |
| 1b | `malicious-input.security.spec.ts:253` (login) | **CUMPLE**. | El login no aplica la política (REQ-AUTH2-002; `password-policy.ts` cabecera). La contraseña no es un defecto aquí. |
| 2 | `tests/integration/contracts/openapi-conformance.spec.ts:49` (registro de `nueva.usuaria`) | **CUMPLE**. `'Clave2026x!'` y `confirmPassword` idéntico. | Longitud 11, `C` mayúscula, `2026`, `!`. Cumple la política. |
| 2b | Lectura de Keymaker: TypeError de la línea 63 desaparece y el fallo pasa a la 69 | **CORRECTA**. | Línea 63 (invitación `roleOnJoin: 'READER'`) ya no falla. La 69 es `POST /api/backup/export`. Mensaje real: `exportBackup: estado 404 no declarado (200, 401, 403, 429, 500)`. |
| 2c | Clasificación del fallo en 69 | **(d) src**. | `src/infrastructure/http/routes/backup.routes.ts:20` registra `app.get('/api/backup/export')`. El contrato `pet-tracker-api.openapi.yaml:196–197` declara `POST /backup/export`. El `POST` devuelve 404 y el contrato no declara 404. La prueba llama al método correcto. El arnés envía `X-Argos-Request` por defecto (`api-harness.ts:70`), así que la CSRF no es un defecto de la prueba. |
| 3 | `tests/unit/use-cases.households.spec.ts:78–87` (fila INVITED sin `role`) | **DECISIÓN CORRECTA**. La prueba es válida. | `household-membership.machine.json`: INVITED sin atributo `role`. `ADR-002-04`: INVITED vive en la invitación. `ACCEPT` aplica `role = roleOnJoin`. `identity.schema.json:439–446`: `HouseholdInvitation` requiere `roleOnJoin`. Por tanto la membresía INVITED no lleva rol. |
| 3b | Rojo en línea 87 (`['MEMBER', …]` frente a `[undefined, …]`) | **(d) src**. Residuo 001. | `src/domain/households/household-policies.ts:231`: `role: 'MEMBER'` en la fila INVITED. (Keymaker citó `src/household-policies.ts:231`; la ruta real es `src/domain/households/`.) |

## 2. Cifras de vitest

- **15 archivos tocados por T237–T242** (lista de `git status --short -- tests`: 12 modificados y 3 nuevos): **126 pasan / 140 fallan / 266**. Coincide con la conciliación de D1.
- **Última ronda de Keymaker (3 archivos):** 20 pasan / 14 fallan / 34. Coincide.
- Por archivo (fallos): household-policies 12/35 · use-cases.households 9/18 · access-policy 11/19 · access-control.security 7/13 · assignments-ownership.api 11/11 · households.api 8/29 · malicious-input 3/13 · pets-records.api 7/35 · backup-atomicity 11/18 · credentials.security 2/12 · permissions-matrix 44/44 · access.property 4/6 · roles-migration 7/7 · openapi-conformance 2/3 · households.property 2/3.

Nota: backup-atomicity y credentials.security son archivos tocados que no estaban en el detalle de D1. Se clasifican en §4.

## 3. tsc y compuertas

- `node_modules/.bin/tsc --noEmit`: **7 errores**, igual que lo esperado.
  - **5 TS2307** (módulo ausente, `src/domain/access/effective-role.ts` y `src/domain/access/rbac.ts`): `access.property.spec.ts:184,185`, `access-policy.spec.ts:161,162`, `permissions-matrix.spec.ts:49`. Clase: módulo ausente.
  - **2 TS2339** (`permissions` no existe en `HouseholdPetEntry`): `household-policies.spec.ts:346` y `:356`. Clase: src (tipo 001). Ambos se deben a la misma causa aceptada por Neo (canEdit→permissions). La línea 356 queda fuera del rango aceptado 340–352, pero es la misma causa.
- `bash scripts/verify-oracles.sh`: **CUMPLE**. 79 archivos analizados, 0 oráculos débiles.
- Greps sobre los 15 archivos: `expect(true)`, `.skip`, `.todo`, `.only`, `xit`, `xdescribe`, `toBeDefined()`, `toBeTruthy()`, `[403,404,409]`: **0 coincidencias**.
- Aserción condicional: `access.property.spec.ts:237` (`if (can(lower, action)) expect(can(upper, action)).toBe(true);`). Ver §5, observación O-2.

## 4. Hoja de ruta (`.specify/memory/audits/hoja-de-ruta-feature-002.md`)

- «32 celdas»: **0** coincidencias. Resuelto.
- «44 celdas»: líneas **18, 66, 96**. Correcto.
- Tabla C: fila `use-cases.households.spec.ts` (línea 68) y fila `roles-migration.spec.ts` (línea 69). Presentes.
- Nota D-10 (diferimiento de `tests/unit/presentation/` a T284): línea 84. Presente.

## 5. Clasificación de los 140 fallos

Clases: **S1** módulo ausente en src · **S2** función o export ausente en src · **S3** ruta HTTP ausente o con método distinto · **S4** comportamiento o forma de src distinta del contrato · **S5** migración 0004 o tabla `pet_assignments` ausente · **T** defecto de tests/.

| Archivo | Fallos | Clase | Evidencia |
|---|---|---|---|
| `permissions-matrix.spec.ts` | 44 | S1 | `Failed to load rbac.ts` |
| `access-policy.spec.ts` | 11 | S1 | `Failed to load effective-role.ts` |
| `access.property.spec.ts` | 4 | S1 | Mismo error de carga |
| `household-policies.spec.ts` | 12 | S2 (9) · S4 (3) | `applyMembershipEvent is not a function` (líneas 404–514). Líneas 118, 162 y 346 son S4 |
| `use-cases.households.spec.ts` | 9 | S2 (4) · S4 (5) | `ChangeMemberRoleUseCase` y `TransferHouseholdOwnershipUseCase` no exportados (302–326). Línea 87: residuo `MEMBER` de src:231 |
| `households.property.spec.ts` | 2 | S2 · S4 | Línea 165 `applyMembershipEvent`. Línea 59: contraejemplo `[[]]`, owner sin `role: ADMIN`. `createHousehold` devuelve `LegacyHouseholdMember` (`household-policies.ts:179–190`) |
| `roles-migration.spec.ts` | 7 | S5 | `no such table: pet_assignments`, `no such column: role`, `expected [ … ] to include '0004_pendiente.sql'` |
| `assignments-ownership.api.spec.ts` | 11 | S3 | Contrato `PUT /api/pets/…/assignments/…` con estado no declarado |
| `households.api.spec.ts` | 8 | S3 (5) · S4 (3) | `PATCH …/members/…` y `POST …/ownership-transfer` sin ruta. `READER` frente a `ADMIN` (CHANGE_ROLE sin efecto) |
| `pets-records.api.spec.ts` | 7 | S3 (5) · S4 (2) | `PUT …/assignments/…` sin ruta. Dos casos de `permissions` ausente |
| `backup-atomicity.spec.ts` | 11 | S3 (6) · S5 (4) · S4 (1) | `POST /api/backup/export` con 404 (S3). `pet_assignments` y `m.role` (S5). Import v1 devuelve 422 donde se espera migración (S4; el contrato 002 `backup-envelope.schema.json:5,11` declara lectura de 1.0.0 con migración) |
| `credentials.security.spec.ts` | 2 | S3 | Línea 157: export 404 (`expected [201,200,201,200,200,200,200] …` con 404 en la última posición). Línea 170: mismo 404 |
| `malicious-input.security.spec.ts` | 3 | S3 (2) · S4 (1) | Líneas 91 y 113: export 404. Línea 197: registros de la XSS devuelven **500** donde se espera 201 (S4: error del servidor, no de validación) |
| `openapi-conformance.spec.ts` | 2 | S3 | Línea 69 y su aserción de conjunto: export 404 (ver §1, 2c) |
| `access-control.security.spec.ts` | 7 | S4 | Líneas 87–256 dependen de rutas y roles 002 no implementados. La línea 46 verde está aceptada hasta T244 |

**Matiz de rigor:** las clases se asignaron por familia de mensaje y se trazaron a su origen en src o contrato. No se reclasificó cada línea de forma individual; la clase de cada familia es la que consta en la tabla.

## 6. Defecto de tests/ que bloquea el PASS

**T-1 · `tests/unit/household-policies.spec.ts:323`** (bloque 001 «visibilidad, color y vista de hogar», líneas 309–387, fuera de la sustitución de T237)

```ts
expect([forOwner.myRole, forMember.myRole]).toEqual(['OWNER', 'MEMBER']);
```

- **Contrato:** `pet-tracker-api.openapi.yaml:1160–1163` define la vista de hogar con `myRole: identity.schema.json#/$defs/HouseholdRole`. Ese enum es `ADMIN | CAREGIVER | READER` (`identity.schema.json:325–331`). Ni `OWNER` ni `MEMBER` son valores válidos. `OWNER` solo existe como `PetEffectiveRole` (`pet.schema.json:437–440`), que se usa para mascotas.
- **Por qué es T y no S4:** la aserción es correcta para la 001 pero contradice el contrato 002. Está en verde porque src todavía devuelve el valor legado. Cuando src se corrija, esta prueba fallará, así que no es un fallo que dependa de src: es una expectativa obsoleta.
- **Criterio de Neo:** item 9 del encargo («si hay uno sin sustituir, es defecto (e)»). Este residuo no estaba en la aceptación de 340–352 (canEdit), que es un rojo por src.
- **Corrección sugerida (no aplicada):** sustituir por los valores 002 (ADMIN para el propietario y el rol de la fila para el miembro, p. ej. READER) y mover la aserción al bloque 002.

## 7. Observaciones (no bloqueantes)

- **O-1** `tests/unit/use-cases.households.spec.ts:206`: el título dice «canEdit solo para el dueño». La aserción usa `p.permissions.editPetBasics` (vocabulario 002, correcto). Solo es un residuo de título.
- **O-2** `tests/property/access.property.spec.ts:237`: la escalera está escrita como implicación condicional (`if (can(lower, action)) expect(can(upper, action)).toBe(true)`). Es una propiedad válida, pero puede pasar en vacío si `can(lower, …)` nunca es verdadero. Hoy el archivo no carga (S1). Conviene añadir un contador de casos verdaderos cuando exista `rbac.ts`.
- **O-3** `tests/property/households.property.spec.ts:125`: `role: 'MEMBER'` en una fixture del bloque 001 (líneas 113–141). No se asevera sobre él, así que no contradice nada; tolerable como fixture.
- **O-4** `use-cases.households.spec.ts:104`: `role: 'OWNER'` en la entrada de invitar. La prueba espera `ERR-SCHEMA-VALIDATION-FAILED@role` (línea 116). Correcto.
- **O-5** Otros usos de `OWNER` en los 15 archivos (roles de mascota, `PetEffectiveRole`, `permissions-matrix`, `roles-migration` como origen 001) son legítimos. `roleOnJoin: 'OWNER'` en `households.api.spec.ts:128` es un caso negativo.
- **O-6** `src/infrastructure/http/routes/backup.routes.ts:20`: la ruta está como `GET`, y el contrato la declara `POST`. Es un defecto de src de alto impacto (exportación de respaldo) que bloquea seis fallos de backup y CSRF.

## 8. Aceptaciones de Neo (respetadas, no reabiertas)

- `household-policies.spec.ts:340–352` rojo por src (canEdit→permissions): aceptado hasta T244. Verificado: sigue siendo S4 de src.
- `access-control.security.spec.ts:46` verde por atajo legado: aceptado hasta T244. Verificado.

## 9. Decisiones pendientes de Neo

1. **T-1** (`household-policies.spec.ts:323`) bloquea el PASS. Con MAX_RETRY agotado, Neo debe decidir: (a) autorizar una corrección puntual de una línea (Keymaker, sin cambiar la intención), o (b) aceptar T-1 como deuda con fecha de corrección en T244.
2. **Riesgo de src (no decidido):** `POST /api/backup/export` (O-6) y las rutas de asignación, transferencia y PATCH de miembros faltan. Se tratan en T243+; no bloquean la clasificación.

**Veredicto:** FAIL por T-1. Los puntos 1 y 2 cumplen. El punto 3 es correcto. Todo lo demás es S1–S5 de src o módulo ausente, clasificado.
