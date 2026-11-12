# Oracle · Veredicto final T1 de T237–T242 · 2026-11-11

**PARA: Neo (Andrés Vallejo — Nivel 2)**

**VEREDICTO: FAIL.** Un defecto de `tests/` clasificado **(f)**: la prueba depende de una fixture 001 para la entrada y de la expectativa 002 para la salida. La última edición de T-1 la pasó de verde a rojo. Cifras: 141 fallos / 266 pruebas en los 15 archivos (D2: 140).

Este informe sustituye a la lectura de T-1 como (d) del registro de Keymaker (`claude/log-keymaker.md:224`).

---

## A. Clasificación de `tests/unit/household-policies.spec.ts:323` → (f), defecto de tests/

Hechos en disco:

1. **Entrada 001.** `casa` y `members` vienen de `fixtures.householdMembers`, leído de `specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json` (`tests/unit/household-policies.spec.ts:36–43`). Las filas tienen `role: "OWNER"` (membershipId `…cccc01`) y `role: "MEMBER"` (`…cccc02`).
2. **src devuelve el rol crudo.** `householdView` (`src/domain/households/household-policies.ts:385–400`) hace `return { household, myRole: me.role, members }`. No mapea ni migra.
3. **Expectativa 002 correcta.** `specs/002-plataforma-v21/contracts/schemas/identity.schema.json` (`HouseholdRole` = `ADMIN | CAREGIVER | READER`) y `openapi/pet-tracker-api.openapi.yaml:1163` (`myRole: HouseholdRole`).
4. **No hay fixture 002 de miembros.** `specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json` no tiene `householdMembers` ni `expectedHouseholdView`. La prueba no puede apuntar a una fixture 002 que no existe.
5. **La migración es de persistencia.** REQ-MIG-001 (OWNER→ADMIN, MEMBER→READER) se prueba en `tests/integration/persistence/roles-migration.spec.ts:82`. Mapear el rol dentro de `householdView` ocultaría esa migración y no es un cambio legítimo de src.

Conclusión: la prueba mezcla vocabularios. Entrada en 001, salida en 002. Ninguna src 002 honesta la satisface sin un parche de lectura, así que **no es (d)**. Es **(f)**: depende de la fixture 001 para la entrada. El rojo es correcto frente a la 002, pero la prueba no está bien construida.

Por qué empeoró: en D2 la línea 323 esperaba `['OWNER','MEMBER']` y pasaba (es el residuo 001). Al cambiar la expectativa sin cambiar la entrada, la prueba pasa a fallar. Así se explica el +1 (140 → 141) sin que cambie ningún otro archivo.

Corrección que haría falta (no aplicada, no es de src): dentro del bloque 309–387 de `household-policies.spec.ts`, construir las filas de entrada con roles 002 (OWNER→ADMIN, MEMBER→READER, según REQ-MIG-001) y mantener `['ADMIN','READER']`. Más de una línea. Requiere autorización de Neo. No verificado en esta revisión.

---

## B. ¿Cubre la aceptación de Neo hasta T244 este rojo?

**No.** Lo que Neo aceptó:
- `household-policies.spec.ts:340–352` (canEdit → `permissions`): rojo por src. Sigue en rojo, por TypeError en la línea 346, dentro de «mascotas por dueño».
- `access-control.security.spec.ts:46` (verde por atajo legado): pasa en esta ejecución.

Este rojo es nuevo y es un defecto de test, no de src. Oracle no recomienda aceptarlo implícitamente. Son dos opciones explícitas para Neo:
- **(a) Recomendada.** Autorizar una corrección solo en `tests/` (bloque 309–387). Es un cambio de test, no de src, y deja T-1 cerrado sin deuda.
- **(b)** Aceptar el rojo como deuda hasta T244, por escrito. Dejaría una prueba roja que src no va a arreglar.

---

## Cifras verificadas en disco (2026-11-11)

**Estado de git** (solo lectura):
- `git status --short -- src specs/002-plataforma-v21/contracts src/generated`: sin cambios.
- `specs/002-plataforma-v21/tasks.md`: M (H-1, ya ratificado por Neo según `claude/log-morpheus.md:583`).
- `tests/`: muchos archivos M. Es trabajo de T237–T242 sin commit, fuera del alcance pedido.

**household-policies.spec.ts** (`npx vitest run`): **13 fallos / 22 pasan / 35**. Esperado en el encargo: 12/23. La diferencia es la línea 323. El mensaje es `expected [ 'OWNER', 'MEMBER' ] to deeply equal [ 'ADMIN', 'READER' ]`.

**15 archivos de T237–T242 + access.property + permissions-matrix** (`--reporter=json`):

| Archivo | Total | Fallos | Pasan | D2 |
|---|---|---|---|---|
| unit/household-policies.spec.ts | 35 | 13 | 22 | 12 |
| unit/use-cases.households.spec.ts | 18 | 9 | 9 | 9 |
| unit/access-policy.spec.ts | 19 | 11 | 8 | 11 |
| security/exploits/access-control.security.spec.ts | 13 | 7 | 6 | 7 |
| integration/api/assignments-ownership.api.spec.ts | 11 | 11 | 0 | 11 |
| integration/api/households.api.spec.ts | 29 | 8 | 21 | 8 |
| security/exploits/malicious-input.security.spec.ts | 13 | 3 | 10 | 3 |
| integration/api/pets-records.api.spec.ts | 35 | 7 | 28 | 7 |
| integration/api/backup-atomicity.spec.ts | 18 | 11 | 7 | 11 |
| security/exploits/credentials.security.spec.ts | 12 | 2 | 10 | 2 |
| integration/contracts/openapi-conformance.spec.ts | 3 | 2 | 1 | 2 |
| property/households.property.spec.ts | 3 | 2 | 1 | 2 |
| integration/persistence/roles-migration.spec.ts | 7 | 7 | 0 | 7 |
| property/access.property.spec.ts | 6 | 4 | 2 | 4 |
| unit/permissions-matrix.spec.ts | 44 | 44 | 0 | 44 |
| **Total** | **266** | **141** | **125** | **140** |

Hay +1 respecto a D2, y es exactamente la línea 323. La entrada de bitácora de Oracle D2 registra 126/140; la cifra actual es 125/141 por el mismo motivo.

**tsc --noEmit**: 7 errores, como indicaba el encargo.
- 5 TS2307: `tests/property/access.property.spec.ts:184,185`, `tests/unit/access-policy.spec.ts:161,162`, `tests/unit/permissions-matrix.spec.ts:49`. Módulos `src/domain/access/effective-role.ts` y `rbac.ts` ausentes.
- 2 TS2339: `tests/unit/household-policies.spec.ts:346,356`, `permissions` no existe en `HouseholdPetEntry`.

**verify-oracles.sh**: `Archivos analizados: 79; oráculos débiles: 0. CUMPLE`.

**Oráculos débiles en tests/** (`expect(true)`, `toBeTruthy()`, `toBeDefined()`, `.skip`, `.only`, `it.todo`): las únicas coincidencias están en `tests/integration/gates/verify-gates.spec.ts:240–247`, que son cadenas literales de la propia compuerta. Ningún oráculo débil real.

**Hoja de ruta** (`.specify/memory/audits/hoja-de-ruta-feature-002.md`):
- «32 celdas»: 0 ocurrencias.
- «44 celdas»: líneas 18, 66 y 96.
- Tabla C: `use-cases.households` (línea 68) y `roles-migration` (línea 69) presentes.
- Nota D-10: línea 84.

**Documentación**:
- Informe D2: `.specify/memory/audits/oracle-T237-T242-final-D2.md`. Presente.
- Ratificación de T-1: Neo autorizó la corrección en `claude/log-morpheus.md:593` y Keymaker la aplicó en `claude/log-keymaker.md:223`. **No hay constancia en `.specify/memory/audits/`**; solo en bitácoras. Recomiendo que la decisión de Neo sobre el T-1 nuevo quede escrita en el audit.

---

## Clasificación de los fallos restantes

Los 140 fallos que no son la línea 323 quedan como en D2, clasificados por familia (S1–S5, contrato o src). Verifiqué los conteos por archivo, no reclasifiqué línea por línea. Resumen:
- **Módulos ausentes de src**: `rbac.ts`, `effective-role.ts` (permissions-matrix 44/44, access-policy, access.property).
- **Rutas o lógica 002 no implementadas en src**: asignaciones y transferencia, export `POST /api/backup/export`, `permissions` en `HouseholdPetEntry` (canEdit).
- **Migración 002**: roles-migration 7/7.
- **Único defecto de tests/**: T-1, clase (f).

Verdes que deben seguir siendo verdes: `access-control.security.spec.ts:46` (aceptado hasta T244) y las 22 de household-policies distintas de la 323.

---

## Decisiones pendientes de Neo

1. **T-1 nuevo** (`household-policies.spec.ts:323`): (a) autorizar corrección de test-setup en 309–387 (recomendada), o (b) aceptar el rojo hasta T244 por escrito.
2. **Ratificación de T-1 y H-1 en audits**: pedir que quede escrita en `.specify/memory/audits/`, no solo en bitácoras.
3. **Diferidos a T244 o T243+**: `POST /api/backup/export`, asignación de mascotas a hogares, PATCH de miembros. Neo los aceptó hasta T244; sin cambio.

Sin cambios en src, tests, specs, contratos, src/generated, tasks.md ni hoja de ruta. No se usaron git stash, checkout, reset, commit ni push. No se marcó nada COMPLETED ni [x].
