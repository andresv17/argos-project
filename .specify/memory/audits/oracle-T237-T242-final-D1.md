# Oracle: veredicto final tras la corrección D1 (T237–T242)

Fecha: 2026-11-11 · Rama: `002-plataforma-v21` · Auditor: Oracle · Destinatario: Neo (Andrés Vallejo — Nivel 2)
Referencias: `.specify/memory/audits/oracle-T237-T242-D1.md` (revalidación previa, FAIL) y `claude/log-keymaker.md` («Corrección D1: 4 defectos tests/»).
Alcance: solo lectura de disco. Sin `git stash`, `checkout`, `reset`, commit ni push. No se tocaron `src/`, `tests/`, `specs/`, contratos, `src/generated/`, `tasks.md` ni la hoja de ruta.

## Veredicto: FAIL

Hay tres defectos de `tests/` sin resolver que no son dependencia de `src/` ni de módulo ausente. Dos son la misma causa raíz en las pruebas de registro (contraseñas fuera de la política 002 y falta de `confirmPassword`). El tercero es un residuo 001 que pasa en verde.

| Punto | Decisión | Clasificación |
|---|---|---|
| A. `household-policies.spec.ts:340-352` | Rojo aceptable. La aserción es correcta frente a REQ-RBAC-001. Falla por `src/` | (d) |
| B. `malicious-input.security.spec.ts:248,252` | **Defecto de la prueba** (contraseña y registro) | (f) |
| C. `openapi-conformance.spec.ts:49,63` | **Defecto de la prueba** (contraseña y registro). El `TypeError` de :63 es consecuencia | (f), confirmado por lectura estática |
| D. `access-control.security.spec.ts:46` | Aceptable hasta T244, con observación | (a) módulo ausente `rbac.ts` |
| Extra. `use-cases.households.spec.ts:78` | **Defecto de la prueba**: residuo 001 (`role: 'MEMBER'`), verde | (e) |

## 1. Estado de disco

| Comprobación | Resultado |
|---|---|
| `git status --short -- src specs/002-plataforma-v21/contracts src/generated specs/002-plataforma-v21/tasks.md` | Solo `M specs/002-plataforma-v21/tasks.md` (H-1, Nivel 2, sigue abierto). `src/`, contratos y `src/generated/` sin cambios |
| `git log -1` | `9af6f0b` |

## 2. Puntos A–D

### A. `tests/unit/household-policies.spec.ts:340-352` → (d), rojo aceptable
- La aserción usa `e.permissions.editPetBasics`, no `canEdit`. Es correcta según la matriz REQ-RBAC-001: ADMIN = S sobre las mascotas de H1 (líneas 343–349, `expected.petOrder.map(... true)`), y READER = S solo en Luna (línea 352, `toEqual(['Luna'])`).
- Referencia de contrato: `specs/002-plataforma-v21/contracts/schemas/pet.schema.json:490` («reemplaza canEdit»).
- Fallo real en vitest: `TypeError: Cannot read properties of undefined (reading 'editPetBasics')` en `:346:84`. Causa: `householdPets` (`src/application/use-cases/household-use-cases.ts:313`) sigue entregando `entry.canEdit` y no `permissions`. Es dependencia de `src/` no implementada.
- Decisión: aceptable. La prueba no se modifica.

### B. `tests/security/exploits/malicious-input.security.spec.ts:248,252` → (f), defecto de la prueba
- Línea 248: `register` con `password: 'Mallory2026x'`. No tiene símbolo. Línea 252 (`roleOnJoin: 'READER'`) ya está añadida.
- `src/domain/auth/password-policy.ts:3-5, 27-35` (INV-AUTH2-001) exige mayúscula, dígito **y símbolo**. `'Mallory2026x'` cumple mayúscula y dígito, no símbolo. El registro se rechaza y no hay cookie de Mallory.
- `specs/.../identity.schema.json:218-222` declara `confirmPassword` como requerido. La prueba no lo envía (línea 248).
- Cadena observada: sin cookie, `accept` (línea 253) responde sin sesión, Mallory no queda ACTIVE (`members` = 1) y la tarjeta no pinta el `<img>` (salida `[1, [], true, false]`, `malicious-input.security.spec.ts:262`).
- El rojo no es de `src/`. Es de la prueba: sus credenciales no cumplen la política que la propia 002 aplica.
- Corrección sugerida: `password: 'Mallory2026x!'` y `confirmPassword` igual, en :248.

### C. `tests/integration/contracts/openapi-conformance.spec.ts:49,63` → (f), defecto de la prueba
- Línea 49: `register` con `username: 'nueva.usuaria'` (válido, patrón `^[a-z0-9._-]+$`) y `password: 'Clave2026x'` (sin símbolo). No envía `confirmPassword`.
- Mismo mecanismo que B: el registro falla, `lucia` queda sin cookie, `POST /api/households` (línea 60) no crea hogar y `house.household` es `undefined`.
- `TypeError: Cannot read properties of undefined (reading 'id')` en `:63:59`, que es `house.household.id`. Es consecuencia, no causa.
- Confirmación: lectura estática de la política y del contrato. No se ha ejecutado aislado; lo confirmaría un `console.log` del status de la línea 49 en una ejecución `-t`.
- Corrección sugerida: `password: 'Clave2026x!'` y `confirmPassword` igual, en :49. El `roleOnJoin` de :63 ya está.

### D. `tests/security/exploits/access-control.security.spec.ts:46` → aceptable hasta T244, con observación
- El test (línea 46) pide `myRole 'READER'` y `permissions.editPetBasics false` para María. Ambos valores son correctos según REQ-MIG-001 y REQ-RBAC-001, y el test pasa en vitest.
- El comentario de la línea 49–50 lo declara: «Pendiente de T244: sustituir por `can(READER, EDIT_PET_BASICS)` de `src/domain/access/rbac.ts`». El módulo no existe (TS2307, `tsc` línea `access-policy.spec.ts:162`, `permissions-matrix.spec.ts:49`). Es módulo ausente, clase (a).
- Observación O-D1: el verde pasa por `legacyRoleAndPermissions(canEdit)` (`src/application/use-cases/use-case-support.ts:148-152`), no por la matriz 002. Solo discrimina READER frente a OWNER, no la matriz completa.
- Condición de aceptación: T244 debe sustituir la aserción por `can()` y el control positivo ADMIN de la línea 229 debe volver a verde. Si no, se reabre como defecto (b).

### Extra. `tests/unit/use-cases.households.spec.ts:78` → (e), defecto de la prueba
- Línea 78: la fila `INVITED` esperada tiene `role: 'MEMBER'`. `MEMBER` no existe en la 002 (`spec.md:244`, REQ-MIG-001: `MEMBER`→`READER`).
- La prueba (línea 60–90) pasa en verde. Su expectativa codifica el rol 001 que `src/` todavía produce. Es residuo que la hoja de ruta ya reconoce (`hoja-de-ruta-feature-002.md:68`, «residuo `role: 'MEMBER'` … por limpiar»).
- No depende de funcionalidad ausente. Es una aserción 001 mal sustituida. Corrección: alinear el rol de la fila INVITED con la 002, o eliminar la aserción de `role`.

## 3. Compuertas

| Compuerta | Resultado |
|---|---|
| `npx vitest run` (15 archivos T237–T242) | **126 pasan / 140 fallan / 266**. Coincide con Keymaker. Mi informe previo (127/139) era de otro estado de disco |
| `vitest` suite global | 1087 pasan / 224 fallan / 1311. Coincide con Keymaker |
| `node_modules/.bin/tsc --noEmit` | **7 errores**: 5 TS2307 y 2 TS2339 |
| TS2307 (5) | `tests/property/access.property.spec.ts:184,185`; `tests/unit/access-policy.spec.ts:161,162`; `tests/unit/permissions-matrix.spec.ts:49`. Módulos `effective-role.ts` y `rbac.ts` ausentes: clase (a), esperado |
| TS2339 (2) | `tests/unit/household-policies.spec.ts:346,356`: `permissions` no existe en `HouseholdPetEntry`. Dependencia de `src/`: clase (d), punto A |
| `bash scripts/verify-oracles.sh` | Archivos 79; oráculos débiles 0; **CUMPLE** |
| Greps `expect(true)`, `.skip(`, `.todo(`, `.only(`, `xit(`, `expect([403,404,409])` en `tests/` | Sin coincidencias. Exento: `tests/integration/gates/verify-gates.spec.ts` (cadenas de texto de la compuerta) |

Recuento de los 140 fallos (15 archivos), por fallo: no se ha reclasificado el total de los 140. Los fallos de tests/ que bloquean el PASS son los de los puntos B, C y el extra; el resto son clase (a), (c) o (d) ya clasificados en el informe previo.

## 4. Hoja de ruta (`.specify/memory/audits/hoja-de-ruta-feature-002.md`)

| Comprobación | Resultado |
|---|---|
| Tabla C: fila `tests/unit/permissions-matrix.spec.ts` (44 celdas) | Línea 66. **Correcta**: dice 44 celdas |
| Tabla C: fila `use-cases.households.spec.ts` | Línea 68. **Presente** (antes ausente) |
| Tabla C: fila `roles-migration.spec.ts` | Línea 69. **Presente** (antes ausente). H-MOR-02 resuelto en disco |
| Nota D-10 (`tests/unit/presentation/` diferido a T284) | Línea 84. **Presente** |
| Residuo «32 celdas» en sección A | **Línea 18**. Sigue sin corregir: dice «8 acciones x 4 roles = 32 celdas». Frente a 44 celdas de la línea 66 |
| Residuo «32 celdas» en sección D, rebanada 3 | **Línea 96** (no 92; la 92 es la cabecera). Dice «Prueba de las 32 celdas de §5.2». Sin corregir |

## 5. Residuos pendientes de decisión de Neo

**PARA: Neo (Andrés Vallejo — Nivel 2)**

1. **Hoja de ruta, líneas 18 y 96**: corregir «32 celdas» a 44, o confirmar que la sección A y D.3 se refieren a §5.2 (32 celdas de otra definición). Decisión de Neo.
2. **`tasks.md` (H-1)**: 10 `[x]` en T226–T235 siguen sin revertir ni confirmar. Solo Neo puede marcar `COMPLETED`.
3. **Aceptación de D (T244)**: confirmar que `access-control.security.spec.ts:46` queda aceptable hasta T244, con reapertura si T244 no sustituye la aserción.

## 6. Veredicto por criterio

| Criterio | Resultado |
|---|---|
| Defectos de `tests/` resueltos o clasificados (a–d) | **No cumple**: B (`malicious-input:248,252`), C (`openapi-conformance:49`) y el extra (`use-cases.households:78`) |
| tsc solo con TS2307 esperados | **No cumple**: 2 TS2339 (punto A, clase d). El punto A es aceptable como d; el criterio estricto pide solo TS2307, por lo que se anota |
| Hoja de ruta correcta | **Parcial**: filas y D-10 correctos; residuos «32 celdas» en líneas 18 y 96 |

## Veredicto final: FAIL (escalado a Neo)

Keymaker debe corregir las contraseñas de `malicious-input.security.spec.ts:248` y `openapi-conformance.spec.ts:49` (símbolo, y `confirmPassword`), y el residuo `use-cases.households.spec.ts:78`. Con eso, B y C quedan en clase (d) o verde y el veredicto pasa a PASS CON OBSERVACIONES.
