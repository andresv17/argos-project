# Análisis T304 — Pruebas de la 001 en rojo frente a la tabla de sustitución

Fecha: 2026-11-14. Autor: `/architect`. Rama `002-plataforma-v21`. Modo solo lectura (no se tocó spec, contratos, tests ni src). Estado de este documento: informe de análisis, sin valor normativo.
Fuentes: `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md` (34 filas, estado `REVIEW`), `claude/hallazgos-t303-mutacion.md`, `gate-T296-output.txt` (26 rojas; la 27.ª es `audit-pseudonym.spec.ts`, que apareció después), ejecución puntual de `vitest` sobre `audit-pseudonym` y `infrastructure-adapters` (solo lectura).

## 1. Reglas de la tabla de sustitución (transcripción)

La tabla no está en la constitución ni en el plan: vive en `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md` y la citan `tasks.md` L25 (cabecera), T207, T304 y L318, y `spec.md` L368 («Código compartido»).

1. Ninguna prueba de la 001 se borra, se comenta ni se relaja. Una prueba que contradice la 002 se sustituye **en el mismo archivo** (o en el archivo nuevo que indica la tabla) por la prueba de la 002; el motivo queda en la tabla; el historial de git conserva la 001.
2. Una prueba de la 001 que sigue siendo válida pasa como regresión sin cambios (T304).
3. La columna «Tarea» enlaza con `tasks.md`; la sustitución ocurre en la tarea de pruebas de esa rebanada. La regeneración de `src/generated/` (T207) deja `tsc` en verde y no cambia el sentido de ninguna prueba.
4. La matriz RBAC tiene 44 celdas (11 acciones por 4 roles).
5. `/mouse` verifica que no quede una prueba con un identificador reemplazado sin su sustituta.
6. Filas 1-22: pruebas de la 001 que contradicen la 002 (22 filas); fila 23: pruebas nuevas; filas 24-34: ampliaciones posteriores (enumeración de invitaciones, sesión 3.0.0, `openapi-contract.ts`, `validation.spec.ts`, `app-config`, inventario de seguridad, peso 0.001 a 150, `deltaPercent` retirado, `upgradePet`, valores `species` de entrada, harness).

**Hallazgo de forma (importante para T304):** la tabla **no tiene columna de estado**. T304 exige «todas las pruebas de la tabla en estado "sustituida"», pero hoy no existe dónde registrar ese estado. Además, en este contexto «sustituida» significa **reescrita según la fila** (regla 1: se sustituye en el mismo archivo), **no** «excluida de la ejecución». Una prueba listada que se salta o se excluye violaría la regla 1 y SC-002. Por eso en el grupo (a) la acción es completar la sustitución, nunca excluir.

**Qué ocurre con las no listadas:** regla 2, pasan sin cambios y en verde. Si una no listada falla, o es un defecto de `src/` (Caso A a Keymaker) o revela una contradicción real con la 002 (Caso B: se añade fila a la tabla con firma de Neo).

## 2. Clasificación de las 27 pruebas rojas

Resultado: **a = 25, b = 2, c = 0.**

### Grupo (a): listadas en la tabla, la sustitución está pendiente o incompleta (25)

Acción común: Keymaker (Caso A) completa la sustitución indicada por la fila; no se excluye ni se relaja nada. Causa de fondo: el archivo sigue con la forma 001 aunque la tarea de la fila (T226, T228, T284...) figura `[x]`.

| # | Prueba roja | Archivo | Fila(s) | Causa real observada | Acción |
|---|---|---|---|---|---|
| 1-3 | `[REQ-PET-005]` GET /pets propias y orden; `q` sin mayúsculas/tildes; `[REQ-PET2-002]` filter Todos/Perros/Gatos/Otros | `tests/integration/api/pets-records.api.spec.ts` | 17, 31, 33 | El fixture del harness incluye ahora a «Luna» (mascota de María/Elena) en la lista del dueño; las expectativas 001 listan solo Argos, Kira, Milo, Nyx, Toby | Reescribir expectativas con el fixture 002 (`identity-fixtures.ts`/`upgradePet`) y permisos de rol |
| 4-11 | 8 pruebas `[REQ-UI-001]`, `[REQ-UI-002]`, `[REQ-UI-003]`, `[REQ-UI-006]`, `[REQ-UI-007]` (tarjetas, ficha propia/ajena, pestaña de peso, semáforo, miembros) | `tests/unit/presentation/components.spec.ts` | 19, 21 | `presentation-fixtures.ts` aún tiene `canEdit`/`OWNER`/`MEMBER`/`DOG`/`CAT` (su cabecera dice «T284 PENDIENTE»); `view-model.ts:127 isReadOnly(permissions)` recibe `undefined` | Reescribir fixtures con `permissions` y roles 002; actualizar las aserciones de cada prueba |
| 12 | `[REQ-UI-002]` tabla de peso con variación | `tests/unit/presentation/view-model.spec.ts` | 19, 31 | Espera `deltaPercent` («+1.85 %»); el contrato 3.0.0 lo retiró y recibe «—» | Sustituir por `deltaKg` (gramos enteros); `deltaPercent` ausente |
| 13 | `[REQ-UI-006]` acciones de miembro (OWNER cancela/retira/elimina; MEMBER abandona) | `tests/unit/presentation/view-model.spec.ts` | 19, 7 | Matriz de acciones por rol 001 frente a `ADMIN/CAREGIVER/READER` y `LEAVE` para todos | Reescribir con la matriz 002 y `permissions` |
| 14 | `[REQ-UI-002]` rangos de peso y medidas con `x-sdd-error` | `tests/unit/presentation/validation.spec.ts` | 27, 30 | Espera mensaje de peso fuera de rango (límite 001 de 2 decimales); el esquema 3.0.0 admite 0.001 a 150 con 3 decimales y `32.851` ya es válido | Cambiar casos: 200 sigue inválido; `32.851` pasa a válido; el rango por especie lo valida el dominio |
| 15 | `[REQ-UI-007]` colorToken null en «Mis mascotas» y presente en el hogar | `tests/integration/presentation/web-client.spec.ts` | 19, 27, 31 | Expectativa 001 (`[['Luna','OWNER_COLOR_2']]`, tarjetas con `canEdit`); el cliente 002 trae `permissions` y colores `OWNER_COLOR_1..8` | Reescribir con el fixture y el mapeo de color de la 002 |
| 16-18 | `INV-ARCH-003` fixtures canónicos válidos; catálogo generado = `error-catalog.json`; «no existe máquina de cupo» | `tests/integration/contracts/generated-contracts.spec.ts` | 3, 30, 32 | Lee catálogo y fixtures de `specs/001`; `src/generated` es 002 (35 códigos y 6 estados de sesión frente a 30 y 4). Los fixtures 001 sin `username`/`lastActivityAt` no validan contra `UserPublicProfile`/sesión 3.0.0 | Ver sección 3: catálogo, máquinas y esquemas desde `specs/002`; fixtures 001 elevados con `upgradePet` solo para el caso legado |
| 19-22 | `[REQ-PET-001][REQ-HOUSE-001]` usuarios/hogar/mascotas; `additionalProperties:false`; 6 módulos de registros; catálogo de 30 códigos | `tests/integration/contracts/canonical-fixtures.spec.ts` | 3, 32 | Mismo origen: lee `specs/001/.../canonical-fixtures.json` y `error-catalog.json` (30 códigos) contra `src/generated` 002 | Igual que 16-18; el catálogo de 30 códigos pasa a los vigentes de la 002 |
| 23 | `--feature 001 equivale al valor por defecto` | `tests/integration/contracts/codegen-drift.spec.ts` | 3, 22 | Premisa caducada: el valor por defecto de `compile-contracts.sh` ahora es 002 (T207), así que `--feature 001` ya no «equivale» al defecto (diff `v3.0.0` frente a `v2.4.0`) | Sustituir por «`--feature 002` equivale al valor por defecto» y mantener un caso «`--feature 001` compila los contratos 001 en `--out` sin tocar `src/generated`» (la regresión de la 001 se conserva, no se borra) |
| 24-25 | `cada una de las 27 operaciones tiene su ruta`; `recorrido feliz por las 27 operaciones` | `tests/integration/contracts/openapi-conformance.spec.ts` | 3, 26 | El OpenAPI 3.0.0 tiene 40 operaciones y la prueba aún afirma 27. Además **`cancelInvitation` (`DELETE /households/{householdId}/invitations/{invitationId}`) no tiene ruta en Fastify** (`households.routes.ts` solo tiene POST invitations, GET/accept/decline) | Reescribir con 40 operaciones (fila 3/26). Falta de la ruta: Caso A para Keymaker (ver hallazgo H-T304-2) |

### Grupo (b): no listadas; la 002 mantiene el comportamiento; se adapta o corrige sin tocar contratos (2)

| # | Prueba roja | Archivo | Por qué no es del grupo (a) | Causa y acción (Caso A, Keymaker) |
|---|---|---|---|---|
| 26 | `[INV-AUTH-003]` verify devuelve `false`, sin lanzar, ante hash con «N excesivo para la memoria» | `tests/unit/infrastructure-adapters.spec.ts` | `INV-AUTH-003` sigue vigente y `scrypt-password-hasher.adapter.ts` no cambió desde la 001; no está en la tabla | **Defecto de `src/`, no del contrato.** El envoltorio `scrypt()` (L26) calcula `maxmem = 256*N*r`; con N = 2^30 el límite crece con la entrada hostil y Node no rechaza rápido: intenta computar y la prueba agota 5 s (reproducido en aislamiento; con `maxmem` por defecto Node rechaza al instante con `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`). Es además un vector de denegación de servicio con un hash almacenado/importado. Corrección: en `verify` limitar N (por ejemplo N ≤ 2^20 y potencia de 2) y devolver `false` antes de llamar a scrypt. No se toca el tiempo de espera de la prueba. Verificar con `git stash`/checkout de un commit anterior si es una regresión de entorno (Node v22.23.4) |
| 27 | `[REQ-AUD-001][SC-014]` en producción, un secreto de 64 hex arranca | `tests/integration/persistence/audit-pseudonym.spec.ts` | Es prueba de la 002 (T256), no de la 001; no está en la tabla porque nació en la 002 | `app-config.ts` L108-116 añadió una lista negra (por huella SHA-256) del secreto de fixtures (`secretHexForTestsOnly`) y de la clave de desarrollo; la prueba arranca «producción» con ese mismo `AUDIT_SECRET_HEX`, ahora rechazado por diseño (SC-014). La prueba quedó vieja respecto de la endurecida T269. Corrección: usar en esa aserción un secreto válido de 64 hex que **no** esté en la lista negra; no se relaja la lista negra. Se añade (o ya existe) la prueba negativa «el secreto de fixtures se rechaza en producción» |

### Grupo (c): no listadas y contradicen la 002 (0)

Ninguna de las 27 contradice un contrato 002 sin estar ya en la tabla. **No hay Caso B por contrato.** Quedan **dos decisiones de redacción de la tabla** (no de contrato) que conviene firmar, descritas en la sección 5.

## 3. Causa de H-T303-2 (lectura de contratos de la 001)

| Archivo | Qué lee hoy | Qué debería leer |
|---|---|---|
| `tests/integration/contracts/generated-contracts.spec.ts` L3-4 | `specs/001-.../errors/error-catalog.json` y `.../examples/canonical-fixtures.json` | Catálogo de errores, máquinas y esquemas de `specs/002-plataforma-v21/contracts/**` (los que generan `src/generated/`); fixtures 001 solo vía `upgradePet` para el caso legado (la fila 32 ya lo prevé) |
| `tests/integration/contracts/canonical-fixtures.spec.ts` L25-26 | `specs/001-.../canonical-fixtures.json` y `error-catalog.json` | Catálogo 002 (35 códigos); fixtures 002 (ya cubiertos por `canonical-fixtures-002.spec.ts`) y 001 elevados |
| `tests/integration/contracts/decimal-precision-boundary.spec.ts` L21 | fixtures 001 | Hoy está en verde; la fila 30 lo sustituye por la frontera de milésimas (T226) |
| `tests/fixtures/application-harness.ts` L27 | fixtures 001 (elevados con `upgradePet`, fila 34) | Correcto por la fila 34; solo hay que confirmar que cubre a «Luna» en el resultado esperado |
| `tests/integration/contracts/codegen-drift.spec.ts` L44, 70-71, 126 | `specs/001` a propósito (casos de regresión de la 001) y un caso de «001 = defecto» | Los casos de regresión 001 son legítimos; solo la equivalencia con el defecto está caducada |
| `tests/integration/contracts/openapi-contract.ts` L39 | `specs/002` (correcto, fila 26 hecha) | sin cambio |
| `tests/fixtures/identity-fixtures.ts`, `audit-fixtures.ts` | `specs/002` | sin cambio |

**Causa:** T207 recompiló `src/generated/` desde la 002 y cambió el valor por defecto de `compile-contracts.sh` a 002 (`ARGOS_FEATURE` por defecto 002, L12), pero esas pruebas conservan rutas fijas a la 001. Las pruebas comparan **artefactos generados desde la 002** (`src/generated`) con **la fuente de la 001**, de modo que el desajuste es estructural (30 frente a 35 códigos, sesión de 4 frente a 6 estados, perfil sin `username`). No es una carrera ni un error del script: el script hace lo que la hoja de ruta decidió (002 por defecto, `--feature 001` disponible).

**Corrección mínima (sin ejecutar):** no cambiar el script. En `generated-contracts.spec.ts` y `canonical-fixtures.spec.ts`:
1. Rutas de catálogo, máquinas y esquemas: de `specs/001-pet-health-tracker/contracts/` a `specs/002-plataforma-v21/contracts/`.
2. Fixtures 001: se conservan, elevados con `upgradePet`, solo en los casos «legado» (sobres `BackupEnvelopeV1Legacy`/`V2Legacy`, la migración 1.0.0/2.0.0 a 3.0.0).
3. Una sola constante `CONTRACTS_DIR` por archivo evita repetir la ruta.
Con ello cada prueba lee exactamente lo que generó `src/generated/`.

## 4. Opciones y riesgo

| Opción | Descripción | Riesgo |
|---|---|---|
| **A (recomendada)** | Completar las sustituciones del grupo (a) según las filas (rutas a `specs/002`, `upgradePet` para legado, 40 operaciones, permisos y 8 especies), corregir las dos del grupo (b) en `src/`/prueba nueva, añadir columna «Estado» a la tabla (con firma de Neo) | Esfuerzo medio (11 archivos). Riesgo bajo de relajar pruebas porque cada cambio sigue una fila ya aprobada; hay que vigilar que no se «ajusten» aserciones para que pasen (revisión de `/oracle` y `verify-oracles.sh`, T305) |
| B | Excluir de `vitest`/Stryker las 11 suites y marcarlas «sustituidas» sin reescribir | **Viola la regla 1 de la tabla, SC-002 e INV-ARCH-004** (equivale a borrar pruebas); además deja sin cobertura la 001 vigente que la 002 mantiene (autenticación, backups, hogares) y baja los mutantes muertos. **Rechazada** |
| C | Revertir `compile-contracts.sh` a 001 por defecto y mantener `src/generated` de la 001 | Rompe `tsc`/runtime de la 002 (T207) y obliga a regenerar a mano en cada compuerta. **Rechazada** |
| D | Dejar las pruebas legado apuntando a 001 y generar además `src/generated-001/` | Duplica el árbol generado y viola `INV-ARCH-003` (un solo origen) y la regla de código compartido (`spec.md` L368). **Rechazada** |

## 5. Propuesta de texto para la tabla de sustitución

**PROPUESTA PENDIENTE DE FIRMA DE NEO.** No está escrita en la spec ni en la tabla; la tabla está en `REVIEW` y la aprobación es de Neo (CLAUDE.md §1).

(1) Nueva columna «Estado» con valores `pendiente` / `sustituida` en las 34 filas, y la regla 6: «Una fila pasa a `sustituida` cuando el archivo listado contiene la prueba de la 002 indicada y está en verde; una prueba listada nunca se excluye de la ejecución. T304 solo se cierra con todas las filas en `sustituida`.» Estado inicial por filas según el barrido: filas 3, 17, 19, 21, 26 (parcial), 27, 30, 31, 32, 33 y 34 (parcial) en `pendiente` pese a que sus tareas figuran `[x]`.

(2) Fila 35 (aclaración de la fila 3 frente a la fila 32, que hoy se contradicen: la fila 3 dice «fixtures canónicos de la 002»; la fila 32 dice «fixtures 001 elevados con `upgradePet`»):

| 35 | `tests/integration/contracts/generated-contracts.spec.ts`, `canonical-fixtures.spec.ts` (catálogo de 30 códigos, 4 estados de sesión, esquemas y máquinas leídos de `specs/001`) | Mismos archivos: catálogo, máquinas y esquemas se leen de `specs/002-plataforma-v21/contracts/`; los fixtures 001 se mantienen solo para validar los sobres legados (`BackupEnvelopeV1Legacy`/`V2Legacy`) y se elevan con `upgradePet`; los fixtures 002 los cubre `canonical-fixtures-002.spec.ts` | H-T303-2: las pruebas leían la 001 mientras `src/generated/` se compila desde la 002 (`INV-ARCH-003`); catálogo de 35 códigos y sesión de 6 estados | T226, T207 |

(3) Fila 36 (caducidad de «001 = defecto» en `codegen-drift.spec.ts`):

| 36 | `tests/integration/contracts/codegen-drift.spec.ts` (`--feature 001 equivale al valor por defecto`) | Mismo archivo: «`--feature 002` equivale al valor por defecto» y «`--feature 001` compila los contratos 001 en `--out` sin tocar `src/generated`» (regresión 001 conservada) | T207 cambió el valor por defecto a 002; la premisa de T201 caducó. No se pierde ninguna cobertura | T201 (ajuste), T304 |

(4) Nota para la fila 26: añadir «`cancelInvitation` sin ruta: se sirve en T2xx y se retira de `NOT_YET_SERVED`».

## 6. Hallazgos a escalar

- **H-T304-1 (proceso, Morpheus/Oracle):** T226, T228, T240, T255, T284, T221 figuran `[x]` pero la sustitución de sus filas está incompleta (p. ej. `presentation-fixtures.ts` dice «T284 PENDIENTE»). T304 no puede cerrarse hasta rehacerlas. Conviene que Oracle revise esas marcas.
- **H-T304-2 (Caso A, Keymaker):** `cancelInvitation` (REQ-HOUSE2-002) no tiene ruta. No encontré una tarea de `tasks.md` que cite `cancelInvitation`; `session-csrf.security.spec.ts` L36 lo mantiene en `NOT_YET_SERVED` (la compuerta final T306/T311 exige lista vacía). Verificar quién la implementa; si no hay tarea, es un hueco de la cola que requiere tarea nueva (decisión de Morpheus).
- **H-T304-3 (Caso A, Keymaker + Trinity):** límite de N en `verify` de scrypt (DoS por hash con coste enorme).
- **H-T304-4 (Caso A):** `audit-pseudonym.spec.ts` usa el secreto de fixtures que la lista negra rechaza (por diseño).

## 7. Decisiones que necesitan a Neo

1. Firmar la columna «Estado» y la regla 6 (sección 5, punto 1), con la consecuencia de que «sustituida» significa «reescrita y en verde», nunca «excluida».
2. Firmar las filas 35 y 36 (aclaración de la fila 3/32 y caducidad de `codegen-drift`); ninguna cambia contrato ni código de producción.
3. Confirmar que no se acepta la Opción B (excluir suites): sin esta confirmación, Stryker seguirá midiendo sobre un árbol parcial.
4. (Menor) Autorizar, si Morpheus lo propone, una tarea nueva para `cancelInvitation` si no existe.
