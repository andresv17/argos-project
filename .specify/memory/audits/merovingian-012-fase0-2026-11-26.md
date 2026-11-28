# Acta /merovingian — Auditoría previa Fase 0, Feature 012 (Multidueño, Microchip y Cuidador)

**Fecha:** 2026-11-26 · **Rama:** `012-multiduenio-microchip-cuidador` · **HEAD:** `953d02c` · **Modo:** solo lectura (sin ediciones de specs, contratos, código ni tests; sin `git add`, sin commit, sin push, sin `[x]`, sin `APPROVED`/`LOCKED`).
**Fuentes leídas en disco:** `~/.claude/skills/merovingian/SKILL.md`, `claude/entorno-y-lecciones.md`, `claude/log-merovingian.md`, `claude/decisiones-neo-012-2026-11-26.md`, `specs/012-*/plan.md`, `specs/012-*/spec.md` (enmiendas, REQ-OWN12/CHP12/VET12/QR12, D12-*), `specs/002-plataforma-v21/spec.md` (INV-OWN2-001, INV-ACC2-001/002, REQ-OWN-001, REQ-RBAC-001, REQ-PET2-001), `specs/002-plataforma-v21/contracts/**`, `specs/001-*/spec.md` (INV-ACC-001/002), `specs/005-*/spec.md` (REQ-VET-002/007/011/012, PN-08, B-1) y `contracts/schemas/share-link.schema.json`, `specs/011-*/spec.md` (D11-06, REQ-HOG11-005), `specs/004-*/contracts/errors/error-catalog.json`, `src/**` y migraciones SQLite/PostgreSQL, `tests/**` (inventario por grep).

## 1. Veredicto
**BLOQUEADO PARA ENMIENDA (no para redactar anexos `DRAFT`).** Tres hallazgos impiden sellar ENM-002-MINOR-012, ENM-002-MINOR-012-CHIP y ENM-005-MINOR-012 tal como están en el acta de Neo:

1. **H-01 (ALTO) — La premisa de microchip está obsoleta.** La unicidad global del microchip YA está en vigor desde la 004 (y la 002 la declara por «Enmienda 004, E-04»). El índice `pets_microchip_global` existe en código.
2. **H-02 (ALTO) — Los identificadores de invariantes están desfasados.** Las enmiendas citan `INV-ACC-001/002` como si fueran de la 002; en la 002 se reemplazaron por `INV-ACC2-001/002`, y la invariante de propiedad única es `INV-OWN2-001`, que no figura en la lista de enmiendas pero es la que la co-propiedad contradice directamente.
3. **H-03 (ALTO) — Dependencia de orden rota.** `REQ-VET-011` y `REQ-VET-002` (elegibilidad por co-propiedad) dependen del Bloque A (`#22`), pero `T1690` los sitúa en el Bloque E (`#81`).

No hay dependencias npm nuevas (ver §5). No se detectan sustituciones de contratos `LOCKED`/`APPROVED` ya hechas.

## 2. H-01 — Microchip: estado real frente a ENM-002-MINOR-012-CHIP
Hechos verificados en disco:
- `specs/002-plataforma-v21/spec.md:205` (REQ-PET2-001): «`microchipId` … **único en todo el sistema** — *Enmienda 004, E-04*: un duplicado, propio o ajeno, devuelve `ERR-PET-MICROCHIP-DUPLICATE` con cuerpo idéntico y la misma ruta de código».
- SQLite `src/infrastructure/persistence/sqlite/migrations/0008_pets_microchip_global.sql`: `DROP INDEX pets_owner_microchip; CREATE UNIQUE INDEX pets_microchip_global ON pets (microchip_id) WHERE microchip_id IS NOT NULL;` (incluye mascotas fallecidas).
- PostgreSQL `src/infrastructure/persistence/postgres/migrations/0004_pets_microchip_global.sql`: mismo índice global.
- Precheck: `sqlite-database.ts` (`MIGRATION_PRECHECKS`) y el bloque `DO $$` de PG 0004 **abortan** la migración si hay microchips repetidos entre propietarios (exigen resolución de Neo, SC-CAT-025).
- `src/application/use-cases/pet-use-cases.ts` (RegisterPet/UpdatePet) confía en `mapMicrochipViolation` → `ERR-PET-MICROCHIP-DUPLICATE` (409, `microchipId`) para cualquier duplicado, propio o ajeno; `microchip-rate-limit.ts` ya implementa el límite de duplicados (REQ-PET4-002).
- `src/application/use-cases/backup-use-cases.ts:540-596`: la importación usa la misma violación global.
- `specs/004-*/contracts/errors/error-catalog.json:63`: `ERR-PET-MICROCHIP-DUPLICATE` oficializado (3.1.0) con detalle sin datos de terceros.
- Búsqueda en `src/`, `tests/`, `scripts/`: **cero** coincidencias de `CHIP_CONFLICT`, `chip_conflict`, `ERR-CHP12-*`, `pet_co_owners`, `co_owner`. Lo nuevo de 012 aún no existe (esperado en Fase 0).

Consecuencias para la enmienda:
- **La enmienda no crea la unicidad global; la cambia de alcance.** Lo que D12-06 añade es: índice `WHERE microchip_id IS NOT NULL AND <mascota viva>` (hoy incluye fallecidas) → nueva migración en ambos motores (`DROP INDEX pets_microchip_global; CREATE UNIQUE INDEX …`).
- **Conflicto con la 002/004 (E-04):** REQ-CHP12-001 exige `409 ERR-CHP12-MICROCHIP-REGISTERED` **solo** para otra cuenta y mantener `ERR-PET-MICROCHIP-DUPLICATE` para el mismo propietario. Eso reintroduce un oráculo de propiedad que E-04 prohíbe (cuerpo idéntico y misma ruta). Hay que enmendar E-04 explícitamente o unificar el código de error; no basta con «añadir» `ERR-CHP12-*`.
- **D12-08 (duplicados legados `CHIP_CONFLICT`, conservar ambos, no abortar) contradice SC-CAT-025 y los prechecks vigentes.** Tras 0008/0004 no puede existir un duplicado legado en una base migrada; y si existiera, el precheck aborta. Para cumplir D12-08 hay que relajar el precheck (cambio de una migración ya aplicada en su principio) o aceptar que el caso es teórico. **Decisión de Neo requerida** antes de sellar `T1631`.
- Migración de 012 para el índice: en SQLite, `DROP INDEX` + `CREATE UNIQUE INDEX` es válido (no requiere reconstruir tabla). En PG, idem.

## 3. H-02 — Identificadores de invariantes
- Vigentes (002, `APPROVED` 2026-11-10): `INV-ACC2-001` (lectura), `INV-ACC2-002` (escritura, `can(rol efectivo, acción)`), `INV-OWN2-001` (**propiedad única**, «exactamente un `ownerUserId`»), `REQ-OWN-001`, `REQ-RBAC-001`. La 002 declara que reemplazan a `INV-ACC-001/002` y `INV-OWN-001` (`spec.md:317`).
- `INV-ACC-001/002` siguen existiendo solo en la 001 (`specs/001-*/spec.md:225-226`, `contracts/errors/error-catalog.json:105-111`, OpenAPI 001).
- El acta de Neo (§2, ENM-002-MINOR-012) y `spec.md` (REQ-OWN12-005) citan `INV-ACC-002` de la 002. **Corregir a `INV-ACC2-002`** y añadir **`INV-OWN2-001`** a la lista de enmiendas, porque «co-propietario ACTIVE» rompe «exactamente un ownerUserId».
- Para `invariante de hogar` la 002 usa `INV-HOUSE-004` (citado en `tasks.md` T245/T247); el texto exacto no se verificó en este turno (pendiente de `/mouse`).

## 4. Matriz de impacto (contrato → artefactos afectados)

Leyenda: **C** = contrato, **D** = dominio puro, **A** = aplicación, **P** = persistencia/migración, **T** = tests, **W** = presentación.

| Contrato / regla | Causa (012) | Artefactos afectados (verificados) |
| --- | --- | --- |
| **INV-ACC2-001** (lectura, 002) | Co-propietario lee como propietario | C: `002 spec.md:285`, `002 contracts/openapi`. D: `src/domain/access/access-policy.ts` (`canRead` solo mira `pet.ownerUserId`). A: `use-case-support.ts:280,311`. T: `tests/unit/access-policy.spec.ts`, `tests/property/access.property.spec.ts`, `tests/security/exploits/idor-matrix.security.spec.ts`, `access-control.security.spec.ts`. |
| **INV-ACC2-002** (escritura, 002) y `REQ-RBAC-001` (filas críticas) | Co-propietario escribe; eliminar y transferir pasan a aprobación conjunta (`REQ-OWN12-004`) | D: `access-policy.ts` (`canWrite` = `ownerUserId === user.id`, línea única usada en 5 sitios), `effective-role.ts:52` (OWNER sin mirar membresías), `rbac.ts:37-45` (`DELETE_PET`, `TRANSFER_PET_OWNERSHIP`, `ASSIGN_PET_TO_HOUSEHOLDS` → `['OWNER']`). C: 002 `REQ-RBAC-001` (44 celdas) y `002 contracts/openapi`. T: `tests/unit/permissions-matrix.spec.ts` (44 casos; columna OWNER), `tests/unit/rbac-export-permission.spec.ts`, `tests/security/exploits/nine-vectors-four-roles.security.spec.ts`, `session-csrf.security.spec.ts` (si toca escrituras). |
| **INV-OWN2-001** (propiedad única) y **REQ-OWN-001** (transferencia) | Principal + co-propietarios; cambio de principal exige aprobación (`REQ-OWN12-004`) | D: `src/domain/pet/ownership-transfer.ts:52-81` (actor debe ser `ownerUserId`, reasigna propiedad), `pet-invariants.ts:132,170-175` (`IMMUTABLE_PET_FIELDS`, `assertOwnerExists`). A: `ownership-use-cases.ts:31-45` (transfiere y reasigna `assignedByUserId`), `sceneHooks.onPetOwnershipTransferred`. C: 002 `pet.schema.json` (`ownerUserId` requerido, `additionalProperties:false`), `state-machines/household-membership.machine.json`. T: `tests/unit/ownership-transfer.spec.ts`, `tests/integration/api/assignments-ownership.api.spec.ts` (T239/T247), `t593-cohabitacion.api.spec.ts`. |
| **Invariante de hogar de 002** (asignación) y **STATE-HOUSE-MEMBERSHIP-001** (poda) | `REQ-OWN12-007`: se pasa de `owner` a `assigned_by_user_id` | D: `household-policies.ts:509` (lista pets por `ownerUserId`) y `:656` (`ownedHere` = pets del que sale → poda). A: `assignment-use-cases.ts:50-60` (`assignedByUserId: pet.ownerUserId`; exige `ownerIsActive`). C: `household-membership.machine.json`. T: `tests/integration/api/assignments-ownership.api.spec.ts`, pruebas de poda de 002 (T245). |
| **REQ-OWN-001 / eliminación de cuenta** (`ERR-ACCOUNT-OWNS-SHARED-PETS`) | Co-propietario que elimina cuenta sale; principal debe designar antes | D: `src/domain/account/account-deletion-guards.ts:8,68`. A: `account-use-cases.ts:145` (`rejectBlocked`). C: `002 contracts/state-machines/account-deletion.machine.json`, `002 error-catalog.json`. T: `tests/unit/account-deletion.spec.ts`, `tests/integration/api/account-deletion.api.spec.ts`, `account.api.spec.ts`. |
| **Respaldo (REQ-BACKUP2-*)** | `D12-05`: solo exporta el principal | A: `backup-use-cases.ts:220` (export filtra por owner), `:279` (importa forzando `ownerUserId = userId`), `:386` (`ownedByOther`). D: `src/domain/backup/backup-migration.ts:77,132-140`. C: `002 backup-envelope.schema.json`. T: `tests/unit/backup-use-cases.spec.ts`, `tests/integration/api/backup-export.api.spec.ts`, `backup-import-preview.api.spec.ts`, `backup-atomicity.spec.ts`. |
| **REQ-VET-002** (elegibilidad por co-propiedad) y **REQ-VET-011** (autoridad del creador; PN-08, B-1) | Autoridad del `PET` ya no es «un único dueño» | D: `src/domain/sharing/share-link.ts:10` (`ShareScope = 'PET' \| 'HOUSEHOLD'`), `:45`. A: `share-link-use-cases.ts:143` (`PET` → `pets.ownerUserId === userId`), `shared-view-use-cases.ts:67` (`pet.ownerUserId !== link.petOwnerUserIdAtCreation → null`), `share-access.ts:34,45`. P: `sqlite-repositories.ts:615-636` (`pet_owner_user_id_at_creation`). C: `005 spec REQ-VET-002/011`, `005 data-model.md:43,61`, `005 contracts/state-machines/share-link.machine.json`. T: `tests/integration/api/t756-t763-enlaces.api.spec.ts`, `tests/security/exploits/enlace-veterinario-005.security.spec.ts`, pruebas SC-005-037/039/052. |
| **REQ-VET-012** (tope por hogar; `PETS` cuenta como 1 del hogar de origen, D12-21) | Nuevo alcance no cuenta por mascota | A: `share-link-use-cases.ts` (candado por alcance). P: `sqlite-repositories.ts` / `postgres-share-repositories.ts` (conteo). T: `tests/integration/api/t756-t763-enlaces.api.spec.ts`, SC-005-038. |
| **D11-06 = A** (revocación parcial, D12-19) | Alcance `PETS` | Spec 011: `spec.md:40` y `:102` (REQ-HOG11-005), `tasks.md:39,41`, `plan.md:21`. Fuera de contrato: revisar `011 contracts/README`. Solo afecta a la UI de Hogares (Bloque E). |
| **Alcance `PETS` (ENM-005)** | Tercer valor de `scope` | C: `005 contracts/schemas/share-link.schema.json:41-42` (enum), `clinical-summary.schema.json`, `005 OpenAPI`, `share-link.machine.json`. P: **CHECK** de `share_links.scope` en SQLite `0012_share_links.sql:10` y PG `0008_share_links.sql:11,23` (cambio de CHECK = reconstruir tabla en SQLite). T: `tests/integration/api/t756-t763-enlaces.api.spec.ts`, `tests/security/exploits/enlace-veterinario-005.security.spec.ts`. |
| **Unicidad global de microchip** (002 E-04, 004 `pets_microchip_global`) | D12-06 (índice vivas), D12-08, REQ-CHP12-001 | P: SQLite `0008`, PG `0004` (+ nueva migración de 012). A: `pet-use-cases.ts:6-7,103-104,139-140`, `microchip-violation.ts` (solo `pets_microchip_global`), `microchip-rate-limit.ts`, `backup-use-cases.ts:364-376,540-596`. Prechecks: `sqlite-database.ts` (`MIGRATION_PRECHECKS`), PG 0004 DO-block. C: `002 spec.md:205`, `004 error-catalog.json:63`. T: `tests/unit/microchip-violation.spec.ts`, `tests/unit/microchip-patterns.spec.ts`, `tests/integration/api/t556-microchip-trivial.api.spec.ts`, `tests/unit/backup-use-cases.spec.ts`. |
| **Codificador QR (`D12-17`)** | Ninguna dependencia | `package.json` y `package-lock.json`: sin diferencias vs `HEAD` (ver §5). |

Volumen de referencias en `tests/`: 94 ficheros mencionan `ownerUserId`/`owner_user_id`; 54 mencionan microchip; 34 mencionan `'PET'`. La cifra es un techo de búsqueda, no un conteo de fallos: cada uno debe revisarse en su bloque.

## 5. Dependencias npm (D12-17)
Confirmado: `git diff --quiet HEAD -- package.json package-lock.json` sin diferencias; el plan no propone paquetes. **Cero dependencias npm nuevas en la auditoría.** El codificador QR propio sigue siendo un riesgo de implementación (ADR-012-07), no de supply chain.

## 6. Orden de enmienda recomendado
Solo lectura aquí; la ejecución corresponde a `/architect`, `/keymaker` y las compuertas.

0. **Antes de tocar nada — decisiones de Neo (Nivel 2):** (a) H-01: confirmar que la enmienda de microchip es «cambio de alcance del índice + split de error + E-04 enmendada», no «unicidad nueva»; (b) D12-08 frente a SC-CAT-025 (¿se relaja el precheck o el caso legado se declara teórico?); (c) H-02: confirmar que las enmiendas usan `INV-ACC2-001/002` y `INV-OWN2-001`.
1. **Contratos (anexos `DRAFT`, sin editar 002/004/005):** corregir `ENM-002-MINOR-012` (IDs §3, añadir `INV-OWN2-001`, `STATE-HOUSE-MEMBERSHIP-001` por `assigned_by_user_id`), `ENM-002-MINOR-012-CHIP` (alcance del índice, E-04, `chip_conflict`) y dividir `ENM-005-MINOR-012` en **005-A (REQ-VET-002/011 y B-1 por co-propiedad, Bloque A)** y **005-E (alcance `PETS`, CHECK, D11-06, REQ-VET-012, Bloque E)**.
2. **Bloque A (`#22`), primero en tests:** `permissions-matrix`, `access-policy`, `access.property`, `idor-matrix`, `access-control.security`, `ownership-transfer`, `assignments-ownership.api`, `account-deletion`, `backup-*` (rojo) → luego `access-policy.ts`, `effective-role.ts`, `rbac.ts`, `ownership-transfer.ts`, `household-policies.ts`, `assignment-use-cases.ts`, `ownership-use-cases.ts`, `account-deletion-guards.ts`, `share-link-use-cases.ts:143` y `shared-view-use-cases.ts:67` (PN-08 con co-propietario). Migración `pet_co_owners` + `owner_approval_requests` (SQLite y PG por separado).
3. **Bloque B (`#23`):** migración del índice global (`WHERE` vivas), `chip_claims`; respuesta uniforme y `ERR-CHP12-*` solo tras cerrar H-01 en E-04. Tests de `microchip-violation`, `microchip-patterns`, `t556-microchip-trivial`, backup-import de duplicados.
4. **Bloque C (`#26`):** sin enmienda a 002 (D12-10 = A); el riesgo está en `use-case-support.ts` y en el rol `CAREGIVER` sin fila de nivel (punto 6 del acta).
5. **Bloque D (`#32`):** contratos QR; sin enmiendas a 002/005; tests del codificador (SC-012-049) sin dependencias.
6. **Bloque E (`#81`):** CHECK de `share_links.scope` (SQLite: reconstrucción de tabla; PG: drop/add de constraint), `share_link_pets`, `ShareScope` con `PETS`, `clinical-summary`, OpenAPI 005, `D11-06` en 011. Tests `t756-t763` y `enlace-veterinario-005.security` en rojo primero.
7. **Compuertas tras cada bloque:** `bash scripts/verify-traceability.sh --feature 012` (T1609), `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`; revisar `tests/integration/contracts/canonical-fixtures-002.spec.ts` si cambia cualquier fixture de 002.

**Nota de dependencia:** el orden D12-ORDEN = A (`#22`→`#23`→`#26`→`#32`→`#81`) es correcto, pero `T1690` (ENM-005 completa) en el Bloque E crea un hueco: la autoridad del `PET` (REQ-VET-011) cambia en el Bloque A y debe enmendarse allí.

## 7. Hallazgos resumen
| ID | Sev. | Hallazgo | Acción propuesta |
| --- | --- | --- | --- |
| H-01 | ALTO | Unicidad global de microchip ya vigente (002 E-04, 004, migraciones 0008/0004); ENM-CHIP mal planteada | Re-enmarcar ENM-CHIP; decisión Neo |
| H-02 | ALTO | Citas de invariantes obsoletas (`INV-ACC-*` → `INV-ACC2-*`); falta `INV-OWN2-001` | Corregir acta y anexos |
| H-03 | ALTO | `REQ-VET-011/002` en Bloque E pese a depender de A | Dividir ENM-005 |
| H-04 | ALTO | D12-08 contradice el precheck de migración (SC-CAT-025) | Decisión Neo |
| H-05 | MEDIO | `ERR-CHP12-*` reintroduce oráculo que E-04 prohíbe (cuerpo idéntico) | Enmendar E-04 o unificar código |
| H-06 | MEDIO | Reglas de `household-policies` (poda por `ownerUserId`) cambian a `assigned_by_user_id` sin enmienda explícita en `ENM-002-MINOR-012` (cita solo «invariante de hogar») | Añadir a la enmienda |
| H-07 | MEDIO | Respaldo: `backup-use-cases.ts:279` fuerza `ownerUserId = userId` al importar; con co-propiedad hay que definir el destino del principal importado | Definir en anexo REQ-OWN12-008 |
| H-08 | BAJO | `CHECK` de `share_links.scope` requiere reconstrucción de tabla en SQLite | Planificar en Bloque E |

## 8. Pendiente / fuera de alcance de esta acta
- No se verificó el texto de `INV-HOUSE-004` en la 002 (pendiente de `/mouse`).
- No se revisó el estado de la 011 (`D11-06`) ni de `011 contracts/README`.
- No se ejecutó la suite de tests (solo inventario por grep, auditoría estática).
- Sin cambios en `specs/`, `contracts/`, `src/`, `tests/`, `package.json`; sin commit ni push.
