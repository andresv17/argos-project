# Tasks: Plataforma ARGOS v2.1 (Feature 002)

**Input**: Design documents from `/specs/002-plataforma-v21/`

**Prerequisites**: spec.md (APPROVED, 2026-11-10), plan.md (ADR-002-01..17), data-model.md, quickstart.md, contracts/ (`REVIEW`), `.specify/memory/audits/hoja-de-ruta-feature-002.md` (F8, seis rebanadas)

**Estado**: `REVIEW` (redactado por `/architect` en F6). La aprobación es de Neo (Nivel 2). Toda tarea nace `[ ]`; el techo de los agentes es `REVIEW` y solo Neo marca `COMPLETED`.

**Tests**: obligatorias. La constitución (principio IV) exige pruebas unitarias, de propiedades, de contrato, de seguridad, de mutación y E2E, y cada prueba lleva en su título el identificador que verifica. Dentro de cada fase, las pruebas se escriben primero y deben fallar antes de implementar.

**Organization**: las fases siguen las seis rebanadas de la F8 (hoja de ruta, sección D), en orden fijo. Cada rebanada se puede cerrar sin la siguiente y termina con una tarea de compuerta.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencia).
- **[Story]**: historia de la spec (US1 a US8). `[F7]` marca los prerequisitos de herramientas.
- **[N2]**: requiere autorización de Neo (Nivel 2).
- Los identificadores entre paréntesis al final de una tarea son los que verifica su compuerta: `bash scripts/verify-traceability.sh --feature 002 --task T###` (el parámetro `--feature` lo crea T204).
- Numeración: las tareas de la 002 empiezan en `T201` para no confundirse con las `T001..T0xx` de la 001. Los `SC-*` se citan como criterio de aceptación; el script no los exige, la compuerta final de T311 sí los revisa a mano contra el mapa del quickstart.

## Path Conventions

- **Single project**: `src/`, `tests/` en la raíz; es común a la 001 y a la 002.
- Contratos formales en `specs/002-plataforma-v21/contracts/`; código generado en `src/generated/` (carpeta única, solo por `scripts/compile-contracts.sh`); compuertas en `scripts/`.
- Tabla de sustitución de pruebas de la 001: `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md`. Ninguna prueba de la 001 se borra, se comenta ni se relaja: se sustituye por su prueba de la 002 en la tarea que indica la tabla.

## Reglas transversales

- Nivel 2 (Neo): cualquier dependencia nueva, cualquier cambio de CI, y cada `COMPLETED`. El plan no declara dependencias nuevas.
- Ninguna tarea edita `specs/001-*` ni los contratos de la 002 por su cuenta: un hallazgo de contrato vuelve a `/architect` (Caso B, `MAX_HOPS = 2`).
- Dependencia entre rebanadas, declarada a propósito: el token de confirmación de respaldo (`ERR-ACCOUNT-CONFIRMATION-MISMATCH`) se emite por `exportBackup` (rebanada 5); en la rebanada 1 la eliminación de cuenta se prueba con el token sembrado por su puerto. La fila de auditoría `ACCOUNT_DELETE` entra en la rebanada 4 (en la 1 el puerto de auditoría es nulo). Las comprobaciones de mascotas y hogares compartidos de la eliminación se activan en la rebanada 3.
- La enmienda del principio III (borrador `.specify/memory/audits/enmienda-principio-iii-002-borrador.md`) debe estar firmada por Neo después de T204 y antes de T306 (tarea T204a); hasta entonces la compuerta de la 002 toma los IDs de `spec.md` y de los contratos.

---

## Phase 1: Prerequisitos de F7 — herramientas multi-feature

**Purpose**: que las compuertas lean la Feature 002 sin romper la 001. Autorizado por Neo para F7 (cambio de scripts, Nivel 2).

**Marca explícita**: el código generado de la 001 se conserva. F7 no borra ni regenera `src/generated/`; los scripts siguen aceptando la 001 (`--feature 001` es el valor por defecto) y la 001 debe seguir en `CUMPLE`. La primera regeneración con los contratos de la 002 ocurre en T207 (Fase 2) y el estado de la 001 queda recuperable por la etiqueta `v1.0.0-feature-001` y por el historial de git.

- [x] T201 [P] [F7] Pruebas de las compuertas multi-feature en `tests/integration/gates/verify-gates.spec.ts` y `tests/integration/contracts/codegen-drift.spec.ts`: la 001 sigue en `CUMPLE`, la 002 lee su spec, sus contratos y su `tasks.md`, y una feature inexistente sale con código 2 (INV-ARCH-001, INV-ARCH-002, INV-ARCH-003)
- [x] T202 [F7] Hacer que `scripts/compile-contracts.sh` acepte `--feature 001|002` (por defecto 001) y verifique la existencia de los 13 contratos de la 002 en `specs/002-plataforma-v21/contracts/` (INV-ARCH-003, ERR-SCHEMA-VALIDATION-FAILED)
- [x] T203 [F7] Hacer que `scripts/codegen.mjs` lea `--contracts specs/002-plataforma-v21/contracts` sin cambiar su salida determinista, y que registre solo las palabras `x-sdd-metadata`, `x-sdd-status` y `x-sdd-error` (INV-ARCH-003, ERR-SCHEMA-VALIDATION-FAILED)
- [x] T204 [F7] [N2] Hacer que `scripts/verify-traceability.sh` acepte `--feature 002` (spec, contratos, catálogo y `tasks.md` de la feature), que su expresión de IDs admita dígitos en el segmento (`REQ-AUTH2-001`, `REQ-HOUSE2-004`, `INV-REC2-002`, `STATE-ACCOUNT-DELETE-001`) y que excluya como vigentes los IDs que la tabla «Trazabilidad con la Feature 001» marca como reemplazados (INV-ARCH-001, INV-ARCH-002, INV-ARCH-006)
- [ ] T204a [N2] [F7] Firma de Neo de la enmienda del principio III (3.2.0), dependiente de T204 y bloqueante de T306. Nivel 2.
- [x] T205 [P] [F7] [N2] Ajustar `scripts/verify-oracles.sh`, `tests/unit/layer-dependencies.spec.ts` y las rutas fijas de `.github/workflows/test-gate.yml` y `drift-detection.yml` solo para rutas multi-feature; el cambio de los flujos de CI es Nivel 2 y se escala a Neo antes de aplicarlo (INV-ARCH-004, INV-ARCH-002)
- [x] T206 [F7] Compuerta F7: `bash scripts/verify-traceability.sh` (001, debe seguir en CUMPLE), `bash scripts/verify-traceability.sh --feature 002` (debe ejecutarse y listar lo pendiente, sin error de uso), `npx tsc --noEmit` y `npm run test:gate` en verde con la 001 intacta (INV-ARCH-001, INV-ARCH-003)

**Checkpoint**: las herramientas leen las dos features; el código generado de la 001 sigue en su sitio.

---

## Phase 2: Rebanada 1 — Cuenta e identidad (US1, US7 parcial)

**Goal**: contraseña fuerte, sesión de 30 min de inactividad y 24 h absolutas con logout que revoca, `GET /auth/me` al arrancar, perfil, cambio de contraseña que revoca las otras sesiones, eliminación de cuenta en las fases A y B, e invitación uniforme con límite de ritmo.

**Independent Test**: contraseña débil rechazada y fuerte aceptada; cuenta de 8 caracteres de la 001 entra; con reloj inyectado la sesión expira a los 30 min y 1 s de inactividad y a las 24 h; recargar a los 10 min no cierra; reusar la cookie tras logout da 401; `DELETE /users/me` falla sin token, sin frase o sin contraseña y con todo correcto deja 0 filas del usuario.

### Preparación de la rebanada

- [x] T207 [US1] Primera compilación de la 002: ejecutar `bash scripts/compile-contracts.sh --feature 002`, dejar `npx tsc --noEmit` en verde con adaptaciones mínimas del código existente (especies, roles, `canEdit`) sin borrar ninguna prueba de la 001 (las que contradicen la 002 se sustituyen en la tarea que indica la tabla) y con los casos de contrato en `tests/integration/contracts/canonical-fixtures.spec.ts`, `generated-contracts.spec.ts`, `codegen-drift.spec.ts` y `openapi-conformance.spec.ts` actualizados a los fixtures y esquemas 3.0.0 (INV-ARCH-003, ERR-SCHEMA-VALIDATION-FAILED, ERR-INTERNAL-UNEXPECTED)

### Tests for Slice 1

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [x] T208 [P] [US1] Pruebas de la política de contraseña y de la vigencia de sesión con reloj inyectado en `tests/unit/auth-policies.spec.ts` y `tests/property/auth.property.spec.ts`: 10 a 128 caracteres Unicode, mayúscula `Lu`, número y símbolo; ventana de 30 min deslizante y tope de 24 h; solo una petición válida renueva (INV-AUTH2-001, INV-AUTH2-002, INV-AUTH-005, STATE-AUTH-SESSION-001, SC-009, SC-010)
- [x] T209 [P] [US1] Pruebas de la API de autenticación en `tests/integration/api/auth.api.spec.ts`: registro (nombre con mayúsculas rechazado, correo opcional), inicio de sesión sin política (cuenta de 8 caracteres entra), logout idempotente que revoca al instante, `GET /auth/me` tras recargar y expiración por inactividad (REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH-006, INV-AUTH-001, SC-001, SC-009, SC-010, ERR-AUTH-WEAK-PASSWORD, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-UNAUTHENTICATED)
- [x] T210 [P] [US1] Pruebas de perfil y cambio de contraseña en `tests/integration/api/account.api.spec.ts`: contraseña actual incorrecta (con límite de intentos), revocación de las demás sesiones conservando la actual, `timezone` que no altera edades ni alertas (REQ-AUTH2-003, REQ-ACC-001, REQ-TIME-001, INV-AUTH-005, SC-006, ERR-AUTH-TOO-MANY-ATTEMPTS, ERR-AUTH-INVALID-CREDENTIALS)
- [x] T211 [P] [US7] Pruebas de la eliminación de cuenta en `tests/unit/account-deletion.spec.ts` y `tests/integration/api/account-deletion.api.spec.ts`: fase A sin escrituras (sesión, frase literal, contraseña, HMAC), fase B atómica con consumo condicional del token, rollback completo ante falla a mitad, hogar de un solo `ACTIVE` que desaparece, sin cuenta ni sesiones al terminar (REQ-ACC-002, STATE-ACCOUNT-DELETE-001, SC-014, INV-AUTH-003, ERR-ACCOUNT-CONFIRMATION-MISMATCH, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD)
- [x] T212 [P] [US7] Pruebas de la invitación uniforme y su límite de ritmo en `tests/integration/api/households.api.spec.ts`: mismo cuerpo y tiempo similar exista o no el `username`, fila inerte, `ERR-RATE-LIMITED` al superar el límite, invitación siempre por `username` (REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006, ERR-RATE-LIMITED)
- [x] T213 [P] [US1] Ampliar `tests/security/exploits/session-csrf.security.spec.ts`, `credentials.security.spec.ts` y `log-redaction.security.spec.ts`: sesión expirada por inactividad y por tope, sesión revocada que no reactiva, peticiones rechazadas que no renuevan, ningún secreto en logs (INV-AUTH2-002, INV-AUTH-003, INV-AUTH-007, SC-009)

### Implementation for Slice 1

- [x] T214 [US1] Migración SQL de cuenta en `src/infrastructure/persistence/sqlite/migrations/` (`email`, `preferred_language`, `timezone` en `users`; `created_at`, `last_activity_at`, `revoked_at` en `sessions`; `backup_confirmation_tokens`, `rate_limit_events`, `schema_migrations`) con la suite `tests/fixtures/repository-contract-suite.ts` ejecutada sobre memoria y SQLite (INV-AUTH-003, REQ-ACC-001, ERR-INTERNAL-UNEXPECTED)
- [x] T215 [P] [US1] Implementar la política de contraseña y de sesión en `src/domain/auth/password-policy.ts` y `session-policy.ts`, con constantes de dominio y sin leer reloj ni entorno (INV-AUTH2-001, INV-AUTH2-002, STATE-AUTH-SESSION-001, ERR-AUTH-WEAK-PASSWORD, ERR-AUTH-UNAUTHENTICATED)
- [x] T216 [P] [US1] Definir los puertos `rate-limiter.port.ts` y `backup-token.port.ts` y sus adaptadores en `src/infrastructure/adapters/`, y la configuración validada de frecuencia en `src/infrastructure/config/app-config.ts` (`EXPORT_MAX_PER_WINDOW`, `EXPORT_WINDOW_MINUTES`, `INVITE_MAX_PER_WINDOW`, `INVITE_WINDOW_MINUTES`) (INV-ARCH-005, INV-ARCH-006, ERR-RATE-LIMITED)
- [x] T217 [US1] Implementar el plugin de sesión con inactividad en `src/infrastructure/http/plugins/session-auth.ts` y los casos de uso y rutas de registro, inicio, cierre y sesión actual en `src/application/use-cases/auth-use-cases.ts` y `src/infrastructure/http/routes/auth.routes.ts` (REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-AUTH-006, INV-AUTH-007, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-CSRF-REJECTED)
- [x] T218 [US1] Implementar perfil y cambio de contraseña en `src/application/use-cases/account-use-cases.ts` y `src/infrastructure/http/routes/account.routes.ts` (REQ-ACC-001, REQ-AUTH2-003, REQ-TIME-001, INV-AUTH2-001, INV-AUTH-005, ERR-AUTH-TOO-MANY-ATTEMPTS)
- [x] T219 [US7] Implementar la eliminación de cuenta en dos fases en `src/domain/account/account-deletion-guards.ts`, `src/application/use-cases/account-use-cases.ts` y la ruta `POST /api/account/deletion`, con el puerto de auditoría nulo hasta T265 y borrado de hoja a raíz con poscondiciones (REQ-ACC-002, STATE-ACCOUNT-DELETE-001, SC-014, ERR-ACCOUNT-CONFIRMATION-MISMATCH, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-INTERNAL-UNEXPECTED)
- [x] T220 [US7] Implementar la invitación uniforme con límite de ritmo en `src/application/use-cases/household-use-cases.ts` y `src/infrastructure/http/routes/households.routes.ts`, con la entidad `household_invitations` y el retiro de los dos errores de enumeración de la 001 (usuario no encontrado y miembro ya existente), que el catálogo 002 declara retirados y que ninguna ruta devuelve; `roleOnJoin` se guarda y su efecto llega en T247 (REQ-HOUSE2-001, INV-HOUSE-003, ERR-RATE-LIMITED, ERR-HOUSE-INVITATION-NOT-FOUND)
- [x] T221 [US1] Adaptar el cliente web mínimo en `src/presentation/web/api.ts` y `session.tsx`: consulta `GET /auth/me` al arrancar, política de contraseña nueva en el registro y ninguna petición autenticada en segundo plano (REQ-UI-005, REQ-AUTH-004, INV-ARCH-003)
- [x] T222 [US1] Prueba E2E en `tests/e2e/visual/auth-pet-forms.spec.ts`: iniciar sesión, recargar y seguir autenticado, cerrar sesión y reusar la cookie devuelve 401 (REQ-AUTH-003, REQ-AUTH-004, SC-009)
- [x] T223 [US1] Sentinels y Trinity ejecutan los vectores de sesión expirada y CSRF sobre la rebanada y entregan evidencia en `tests/security/exploits/` (INV-AUTH2-002, INV-AUTH-007, ERR-AUTH-CSRF-REJECTED, ERR-AUTH-UNAUTHENTICATED)
- [x] T224 [P] [US7] Rama revisa que el correo, el `username` y el token no aparezcan en logs ni en respaldos y entrega su informe sin hallazgos abiertos en `.specify/memory/audits/rebanada-1-rama.md` (INV-AUTH-003, INV-AUD-001)
- [x] T225 [US1] Compuerta de la rebanada 1: `bash scripts/compile-contracts.sh --feature 002`, `bash scripts/verify-traceability.sh --feature 002 --task T208` y cada tarea T209 a T222, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate` (INV-ARCH-001, INV-ARCH-002, INV-ARCH-003)

**Checkpoint**: cuenta e identidad cerradas; criterios (a) a (e) de la rebanada 1 de la hoja de ruta verificables.

---

## Phase 3: Rebanada 2 — Modelo de mascota y especies (US4)

**Goal**: 8 especies con migración `DOG→CANINE` y `CAT→FELINE`, `speciesOther`, microchip único por propietario, `neutered`, edad estimada y peso en gramos enteros con rango por especie.

**Independent Test**: una base de la 001 migra sin pérdida (conteos iguales, 0 filas `DOG`/`CAT`); `OTHER` sin `speciesOther` falla; microchip duplicado del mismo propietario falla; 0.05 y 0.001 kg pasan y por debajo fallan.

### Tests for Slice 2

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [x] T226 [P] [US4] Pruebas de especies, edad y peso en `tests/unit/pet-and-alerts.spec.ts`, `tests/unit/date-and-sort.spec.ts`, `tests/property/pet.property.spec.ts` y `tests/property/records.property.spec.ts`: 8 especies, `OTHER` con `speciesOther`, edad estimada con reloj inyectado y límites de peso por especie en gramos enteros (INV-PET2-001, REQ-PET2-001, REQ-PET-002, INV-PET-002, INV-PET-006, INV-REC2-002, REQ-REC2-001, INV-REC-001, INV-SORT-001, SC-013)
- [x] T227 [P] [US4] Pruebas de la migración de especies en `tests/integration/persistence/sqlite-repositories.spec.ts` y `tests/integration/persistence/species-migration.spec.ts`: conteos antes y después iguales, 0 filas `DOG`/`CAT`, repetible sin duplicar (REQ-MIG-001, SC-011, INV-ARCH-005)
- [x] T228 [P] [US4] Pruebas de la API de mascotas en `tests/integration/api/pets-records.api.spec.ts`: `speciesOther`, `neutered`, `estimatedAge` excluyente con `birthDate`, microchip `^\d{15}$` único por propietario, listado con filtro por especie (REQ-PET2-001, REQ-PET2-002, INV-PET2-001, INV-PET-003, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-FUTURE-BIRTHDATE, ERR-PET-BIRTHDATE-AFTER-RECORDS, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-SCHEMA-VALIDATION-FAILED)
- [x] T229 [P] [US4] Ampliar `tests/security/exploits/malicious-input.security.spec.ts` con `speciesOther` y `email` en los vectores de XSS almacenado y prototype pollution (INV-PET2-001, REQ-AUTH2-001, ERR-SCHEMA-VALIDATION-FAILED)

### Implementation for Slice 2

- [x] T230 [US4] Migración SQL de mascotas en `src/infrastructure/persistence/sqlite/migrations/` (`species`, `species_other`, `neutered`, `microchip_id` con índice único por propietario, `birth_date_is_estimate`, `weight_grams`) con la parte de especies de `REQ-MIG-001` en una transacción (REQ-MIG-001, INV-PET-005, INV-ARCH-005, ERR-INTERNAL-UNEXPECTED)
- [x] T231 [P] [US4] Implementar especies, rangos de peso, edad estimada y las invariantes de mascota en `src/domain/pet/species.ts`, `estimated-age.ts`, `pet-invariants.ts` y `src/domain/records/weight-limits.ts` (INV-PET2-001, INV-REC2-002, REQ-PET-002, INV-PET-002, INV-PET-006, ERR-REC-WEIGHT-OUT-OF-RANGE)
- [x] T232 [US4] Implementar los casos de uso de mascotas y de peso en `src/application/use-cases/pet-use-cases.ts` y `record-use-cases.ts` (alta, edición, listado con filtro por especie, `deltaKg` exacto en gramos, microchip único) y las rutas en `src/infrastructure/http/routes/pets.routes.ts` (REQ-PET2-001, REQ-PET2-002, REQ-REC2-001, INV-PET-003, INV-REC-001, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-NOT-FOUND)
- [x] T233 [US4] Mapear la especie en la lectura de respaldos 1.0.0 y 2.0.0 en `src/domain/backup/backup-migration.ts` (`DOG→CANINE`, `CAT→FELINE`), con pruebas en `tests/unit/backup-migration.spec.ts`; el resto de la migración llega en T276 (REQ-BACKUP2-002, INV-PET2-001, ERR-BACKUP-VERSION-UNSUPPORTED)
- [x] T234 [P] [US4] Maggie firma las reglas por especie: las especies nuevas no generan alertas de peso ni de edad y la cota de 150 kg queda marcada como provisional en `.specify/memory/audits/rebanada-2-maggie.md` (INV-REC2-002, INV-PET2-001, STATE-ALERT-001)
- [x] T235 [US4] Compuerta de la rebanada 2: `bash scripts/verify-traceability.sh --feature 002 --task T226` y cada tarea T227 a T233, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate` (INV-ARCH-001, INV-ARCH-002)

**Checkpoint**: criterios (a) a (e) de la rebanada 2 verificables.

---

## Phase 4: Rebanada 3 — Roles y permisos (US2, US3)

**Goal**: función pura `can(rol, acción)` con la matriz de 11 filas por 4 roles, roles por membresía, cambio de rol, asignación mascota-hogar, transferencia de propiedad con poda de asignaciones y protección contra huérfanos.

**Independent Test**: las 44 celdas de `REQ-RBAC-001` coinciden con el servidor y con la interfaz; el Cuidador registra peso y evento y no edita el perfil ni elimina; el Lector no muta; cada celda «No» responde `ERR-ACC-FORBIDDEN` o `ERR-PET-NOT-FOUND` según el caso.

### Tests for Slice 3

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [x] T236 [P] [US2] Prueba de la matriz en `tests/unit/permissions-matrix.spec.ts` (44 casos de `can(rol, acción)`) y propiedades de rol efectivo en `tests/property/access.property.spec.ts` y `tests/unit/access-policy.spec.ts` (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, SC-008, SC-003)
- [x] T237 [P] [US2] Pruebas de las políticas de hogar en `tests/unit/household-policies.spec.ts`, `tests/unit/use-cases.households.spec.ts` y `tests/property/households.property.spec.ts`: roles, propietario único, `CHANGE_ROLE`, `TRANSFER_OWNERSHIP`, poda de asignaciones y propietario que no puede abandonar (INV-HOUSE2-001, INV-HOUSE-004, REQ-HOUSE2-002, STATE-HOUSE-MEMBERSHIP-001, ERR-HOUSE-OWNER-CANNOT-LEAVE)
- [x] T238 [P] [US2] Pruebas de la API de hogares en `tests/integration/api/households.api.spec.ts`: rol inicial en la invitación, cambio de rol, expulsar, abandonar, transferir y eliminar hogar, responder invitación (REQ-HOUSE-001, REQ-HOUSE-003, REQ-HOUSE2-001, REQ-HOUSE2-002, REQ-HOUSE2-004, INV-HOUSE-005, ERR-HOUSE-NOT-FOUND, ERR-HOUSE-MEMBERSHIP-NOT-FOUND, ERR-HOUSE-INVITATION-NOT-FOUND)
- [x] T239 [P] [US3] Pruebas de asignación y transferencia en `tests/integration/api/assignments-ownership.api.spec.ts`: asignar, desasignar, expulsar, abandonar, eliminar hogar, transferencia a miembro `ACTIVE` con poda y una fila de auditoría pendiente de T264 (REQ-HOUSE2-003, REQ-OWN-001, INV-OWN2-001, SC-016, SC-017, ERR-OWN-TRANSFER-INVALID-TARGET)
- [x] T240 [P] [US2] Pruebas de permisos por rol en `tests/integration/api/pets-records.api.spec.ts`: Cuidador registra peso y evento sanitario y no edita perfil ni elimina, Lector no muta, `ERR-PET-NOT-FOUND` sin permiso de lectura, `ERR-ACC-FORBIDDEN` con lectura y sin permiso (REQ-PET-004, REQ-PET2-002, REQ-PET2-003, REQ-REC-002, REQ-REC-005, REQ-REC-006, INV-ACC2-001, INV-ACC2-002, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND)
- [x] T241 [P] [US2] Pruebas de la migración de roles y asignaciones en `tests/integration/persistence/roles-migration.spec.ts`: `OWNER→ADMIN` con propietario del hogar, `MEMBER→READER`, una asignación por hogar común de cada dueño, misma visibilidad que antes, sesiones revocadas (REQ-MIG-001, SC-011, INV-HOUSE2-001)
- [x] T242 [P] [US2] Ampliar `tests/security/exploits/access-control.security.spec.ts`: IDOR por rol, cada celda «No» responde el error esperado y ningún rol edita datos de un hogar ajeno (INV-ACC2-001, INV-ACC2-002, REQ-RBAC-001, SC-003)

### Implementation for Slice 3

- [x] T243 [US2] Migración SQL de roles y asignaciones en `src/infrastructure/persistence/sqlite/migrations/` (`household_members.role`, propietario del hogar, `household_invitations.role_on_join`, `pet_assignments`) con la parte de roles y visibilidad de `REQ-MIG-001` (REQ-MIG-001, INV-HOUSE2-001, REQ-HOUSE2-003, INV-ARCH-005)
- [x] T244 [P] [US2] Implementar `can(rol, acción)` y el rol efectivo en `src/domain/access/rbac.ts` y `effective-role.ts`, con `RbacAction` y los 9 permisos de `PetPermissions` (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, ERR-ACC-FORBIDDEN)
- [x] T245 [P] [US2] Implementar roles, propietario único y poda en `src/domain/households/household-policies.ts` y la transferencia en `src/domain/pet/ownership-transfer.ts` (INV-HOUSE2-001, INV-HOUSE-004, INV-OWN2-001, REQ-OWN-001, STATE-HOUSE-MEMBERSHIP-001, ERR-OWN-TRANSFER-INVALID-TARGET)
- [x] T246 [US2] Implementar los casos de uso de hogares con roles en `src/application/use-cases/household-use-cases.ts` (crear, `roleOnJoin`, responder, cambiar rol, expulsar, abandonar, transferir y eliminar hogar) y sus rutas (REQ-HOUSE-001, REQ-HOUSE-003, REQ-HOUSE2-001, REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001, ERR-HOUSE-OWNER-CANNOT-LEAVE, ERR-HOUSE-MEMBERSHIP-NOT-FOUND)
- [x] T247 [US3] Implementar asignación, desasignación y transferencia de propiedad en `src/application/use-cases/assignment-use-cases.ts` y `ownership-use-cases.ts` y las rutas `assignments.routes.ts` y `ownership.routes.ts`, con la poda al expulsar, abandonar y transferir (REQ-HOUSE2-003, REQ-OWN-001, INV-OWN2-001, INV-HOUSE-004, SC-016, SC-017)
- [x] T248 [US2] Aplicar la matriz a lecturas y escrituras de mascotas y registros: visibilidad por propietario o asignación, `myRole` y `permissions` en la respuesta (reemplazan `canEdit`), vista de hogar con `owner` y `colorToken` (REQ-PET2-002, REQ-PET2-003, REQ-HOUSE2-004, REQ-PET-004, REQ-REC-002, REQ-REC-005, REQ-REC-006, INV-ACC2-001, INV-ACC2-002, INV-HOUSE-005, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN)
- [x] T249 [US7] Activar en la eliminación de cuenta el bloqueo por hogar compartido y por mascotas compartidas, releído dentro de la transacción (REQ-ACC-002, STATE-ACCOUNT-DELETE-001, SC-014, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS)
- [x] T250 [P] [US2] Kid recorre el flujo de dos y tres navegadores por rol en `tests/e2e/visual/household.spec.ts` y `household-counter.spec.ts` (INV-ACC2-001, INV-ACC2-002, REQ-HOUSE2-004, SC-017)
- [x] T251 [US2] Sentinels ejecuta la matriz de IDOR con los cuatro roles y entrega evidencia en `tests/security/exploits/` (SC-003, INV-ACC2-001, INV-ACC2-002)
- [x] T252 [US2] Compuerta de la rebanada 3: `bash scripts/verify-traceability.sh --feature 002 --task T236` y cada tarea T237 a T249, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate` (INV-ARCH-001, INV-ARCH-002)

**Checkpoint**: criterios (a) a (e) de la rebanada 3 verificables; una mascota nunca queda sin Propietario Legal.

---

## Phase 5: Rebanada 4 — Auditoría y registros clínicos (US5, US6)

**Goal**: una fila de auditoría por operación con hash canónico (vista pública), seudonimización con HMAC al eliminar la cuenta, retención de 24 meses, `SUPERSEDED` inmutable, lote y veterinario en eventos sanitarios y registros sin próxima fecha.

**Independent Test**: el mismo estado con distinto orden de claves da el mismo hash; cada mutación crea exactamente una fila sin secretos; editar un `SUPERSEDED` falla con cualquier rol; la fila `ACCOUNT_DELETE` nace con `executorUserId` y `entityId` como HMAC.

### Tests for Slice 4

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [x] T253 [P] [US6] Pruebas del hash canónico y de la vista pública en `tests/unit/audit-canonical.spec.ts` y `tests/property/audit.property.spec.ts`: orden de claves irrelevante, `email`, `displayName` y `microchipId` excluidos, sin secretos (REQ-AUD-001, INV-AUD-001, SC-012)
- [x] T254 [P] [US6] Pruebas de integración de la auditoría en `tests/integration/api/audit.api.spec.ts`: una fila por operación según la regla de filas por mutación, asignaciones podadas con fila propia, retención de 24 meses con purga que registra solo un conteo, escritura en la misma transacción (REQ-AUD-001, INV-AUD-001, SC-012, ERR-INTERNAL-UNEXPECTED)
- [x] T255 [P] [US5] Pruebas de registros clínicos en `tests/unit/record-invariants.spec.ts`, `tests/property/records.property.spec.ts`, `tests/property/alerts.property.spec.ts` y `tests/integration/api/pets-records.api.spec.ts`: editar `SUPERSEDED` falla con cualquier rol, eliminar el posterior lo devuelve a vigente, próxima fecha opcional, lote, veterinario y colegiado, semáforo (REQ-REC2-002, REQ-REC2-003, REQ-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, STATE-ALERT-001, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE, ERR-REC-FUTURE-EVENT-DATE, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-MEASUREMENT-OUT-OF-RANGE)
- [x] T256 [P] [US6] Pruebas de la seudonimización en `tests/integration/api/account-deletion.api.spec.ts` y `tests/integration/persistence/audit-pseudonym.spec.ts`: `executorUserId` y `entityId` de `ACCOUNT_DELETE` como HMAC, cero apariciones del `userId` en claro en auditoría y volcado, la aplicación no arranca en producción sin `ARGOS_AUDIT_HMAC_SECRET` válido (REQ-AUD-001, REQ-ACC-002, INV-AUD-001, STATE-ACCOUNT-DELETE-001, SC-014, INV-ARCH-006)
- [x] T257 [P] [US6] Pruebas de la migración completa en `tests/integration/persistence/roles-migration.spec.ts`: repetible sin duplicar y con exactamente 1 fila `MIGRATION` (REQ-MIG-001, SC-011)

### Implementation for Slice 4

- [x] T258 [US6] Migración SQL de auditoría y registros en `src/infrastructure/persistence/sqlite/migrations/` (`audit_log` sin clave foránea a `users`, columnas de lote, veterinario y colegiado, próxima fecha nullable, `PRAGMA secure_delete = ON`) (REQ-AUD-001, INV-AUD-001, REQ-REC2-002, INV-ARCH-005)
- [x] T259 [P] [US6] Implementar el JSON canónico, el hash de estado y la vista pública en `src/domain/audit/canonical-json.ts`, `state-hash.ts` y `canonical-view.ts` (REQ-AUD-001, INV-AUD-001, SC-012)
- [x] T260 [P] [US5] Implementar la guarda `SUPERSEDED` y las invariantes de registros con próxima fecha opcional en `src/domain/records/superseded-guard.ts` y `record-invariants.ts` (REQ-REC2-002, REQ-REC2-003, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, STATE-ALERT-001, ERR-REC-SUPERSEDED-IMMUTABLE)
- [x] T261 [US6] Definir `AuditLogPort` (solo `append` y `pseudonymizeUser`) y `AuditPseudonymPort` (`hmacUserId` con la clave por parámetro), su adaptador en `src/infrastructure/adapters/hmac-audit-pseudonym.adapter.ts` y la configuración `ARGOS_AUDIT_HMAC_SECRET` y `ARGOS_AUDIT_RETENTION_DAYS` en `src/infrastructure/config/app-config.ts` (INV-ARCH-005, INV-ARCH-006, REQ-AUD-001, INV-AUD-001)
- [x] T262 [US6] Integrar la auditoría en cada caso de uso mutador, una fila por operación y en la misma transacción, con las excepciones de la spec (asignaciones podadas con fila propia) (REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-005)
- [x] T263 [US5] Implementar `updateRecord` y `deleteRecord` por la ruta genérica `/pets/{petId}/records/{collection}/{recordId}` y los formularios de vacuna y desparasitación con lote y veterinario en `src/application/use-cases/record-use-cases.ts` y `src/infrastructure/http/routes/records-edit.routes.ts` (REQ-REC2-002, REQ-REC2-003, REQ-RBAC-001, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-ACC-FORBIDDEN)
- [ ] T264 [US6] Cerrar las pruebas pendientes de la rebanada 3: una fila de auditoría en la transferencia de propiedad y una por asignación podada (REQ-OWN-001, REQ-AUD-001, SC-016, SC-012)
- [ ] T265 [US6] Sustituir el puerto de auditoría nulo de la eliminación de cuenta por la auditoría real: fila `ACCOUNT_DELETE` con HMAC, `pseudonymizeUser`, `secure_delete` y checkpoint del WAL tras el commit (REQ-ACC-002, REQ-AUD-001, INV-AUD-001, STATE-ACCOUNT-DELETE-001, SC-014)
- [ ] T266 [US6] Implementar el mantenimiento de ADR-002-14 (purga de sesiones, tokens, membresías terminales y auditoría de más de 24 meses) que registra solo conteos y no genera fila de auditoría (REQ-AUD-001, INV-AUD-001)
- [ ] T267 [US6] Añadir a la migración la fila `MIGRATION` única y su prueba de repetibilidad (REQ-MIG-001, REQ-AUD-001, SC-011)
- [ ] T268 [P] [US5] Maggie valida que un registro sin próxima fecha con otro posterior de la misma clave queda `SUPERSEDED` (ADR-002-15) y los campos de lote, veterinario y colegiado, en `.specify/memory/audits/rebanada-4-maggie.md` (STATE-ALERT-001, REQ-REC2-002, REQ-REC2-003)
- [ ] T269 [P] [US6] Rama revisa auditoría, seudonimización y eliminación y entrega su informe sin hallazgos abiertos en `.specify/memory/audits/rebanada-4-rama.md` (INV-AUD-001, SC-014)
- [ ] T270 [US6] Compuerta de la rebanada 4: `bash scripts/verify-traceability.sh --feature 002 --task T253` y cada tarea T254 a T267, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate` (INV-ARCH-001, INV-ARCH-002)

**Checkpoint**: criterios (a) a (d) de la rebanada 4 verificables.

---

## Phase 6: Rebanada 5 — Respaldo 3.0.0 y P-19 (US7)

**Goal**: exportación por `POST` con token en cabecera, importación con previsualización, `fileDigest` y `X-Argos-Import-Confirm`, reemplazo atómico con el criterio de fallo inyectado de SC-004, importación segura (P-14) y migraciones desde 1.0.0 y 2.0.0.

**Independent Test**: exportar solo mascotas propias con cualquiera de los 4 roles; previsualizar sin persistir; importar con el digest correcto; un fallo inyectado en cada escritura deja el volcado lógico idéntico y cero filas de auditoría nuevas; un archivo con `ownerUserId`, `role` o asignaciones falsos no otorga nada.

### Tests for Slice 5

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [ ] T271 [P] [US7] Pruebas de exportación en `tests/unit/backup-use-cases.spec.ts` y `tests/integration/api/backup-export.api.spec.ts`: `POST` con `X-Argos-Request`, solo mascotas propias, 4 roles, token en la cabecera `X-Argos-Confirmation-Token` y nunca en el archivo, sin `userId`, límite de ritmo (REQ-BACKUP2-001, REQ-RBAC-001, REQ-ACC-002, ERR-RATE-LIMITED, ERR-ACCOUNT-CONFIRMATION-MISMATCH). Incluye deuda diferida de Rebanada 3 (H-T252-F1..F3): D-T271-1 (migrar tests de access-control a POST /api/backup/export y retirar contract:false), D-T271-2 (probar 401 sin sesión y 403 por rol sin EXPORT_IMPORT_BACKUP), y D-T271-3 (retirar excepción deleteRecord al servir Rebanada 4).
- [ ] T272 [P] [US7] Pruebas de previsualización y confirmación en `tests/integration/api/backup-import.api.spec.ts`: conteos y colisiones solo contra mascotas propias, `fileDigest`, importación sin `X-Argos-Import-Confirm` rechazada, aviso de mascotas compartidas, la previsualización no persiste nada (REQ-BACKUP2-002, STATE-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID)
- [ ] T273 [P] [US7] Pruebas del criterio de fallo inyectado en `tests/unit/backup-import-atomicity.spec.ts`, `tests/integration/api/backup-atomicity.spec.ts` y `tests/integration/persistence/sqlite-backup-import.spec.ts`: fallo en cada escritura, volcado idéntico, cero filas de auditoría nuevas, `ROLLED_BACK`, casos de rollback fallido y `SIGKILL` (SC-004, INV-BACKUP-001, STATE-BACKUP-001, REQ-BACKUP2-002, ERR-BACKUP-ATOMIC-ROLLBACK)
- [ ] T274 [P] [US7] Pruebas de entradas hostiles en `tests/unit/backup-import-hardening.spec.ts` y `tests/property/backup.property.spec.ts`: más de 10 MB, JSON mal formado, claves duplicadas, `__proto__`, profundidad excesiva, `additionalProperties`, ID ajeno con el mismo error genérico (REQ-BACKUP2-002, INV-BACKUP-001, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY)
- [ ] T275 [P] [US7] Pruebas de migración de sobres en `tests/unit/backup-migration.spec.ts`: 1.0.0 y 2.0.0 a 3.0.0 con mapeo de especie, idempotencia del reemplazo al repetir (REQ-BACKUP2-002, STATE-BACKUP-001, INV-BACKUP-001, ERR-BACKUP-VERSION-UNSUPPORTED)

### Implementation for Slice 5

- [ ] T276 [P] [US7] Implementar la migración 1.0.0 a 2.0.0 a 3.0.0, el `fileDigest` y el endurecimiento de importación en `src/domain/backup/backup-migration.ts`, `import-hardening.ts` y `file-digest.ts`, con la misma validación final en cada migración (REQ-BACKUP2-002, INV-BACKUP-001, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID)
- [ ] T277 [P] [US7] Implementar el inyector de fallos determinista en los repositorios de memoria y SQLite y la emisión del token de respaldo (32 bytes, solo `SHA-256` en base, 10 min, un solo uso) en `src/infrastructure/persistence/` y `src/infrastructure/adapters/` (STATE-BACKUP-001, SC-004, REQ-ACC-002, ERR-INTERNAL-UNEXPECTED)
- [ ] T278 [US7] Implementar los casos de uso de exportar, previsualizar e importar en `src/application/use-cases/backup-use-cases.ts`: reemplazo atómico sobre mascotas propias, sin asignaciones, una fila de auditoría `IMPORT`, checkpoint del WAL (REQ-BACKUP2-001, REQ-BACKUP2-002, INV-BACKUP-001, STATE-BACKUP-001, REQ-AUD-001, SC-004, ERR-BACKUP-ATOMIC-ROLLBACK)
- [ ] T279 [US7] Implementar las rutas de exportación por `POST`, previsualización e importación con `X-Argos-Request`, `X-Argos-Import-Confirm` y `Cache-Control: no-store` en `src/infrastructure/http/routes/backup.routes.ts` (REQ-BACKUP2-001, REQ-BACKUP2-002, ERR-AUTH-CSRF-REJECTED, ERR-RATE-LIMITED)
- [ ] T280 [P] [US7] Smith inyecta caos (caída a mitad de commit, corrupción de archivo, `SIGKILL`) y comprueba el estado idéntico byte a byte en `tests/security/` (SC-004, INV-BACKUP-001, STATE-BACKUP-001)
- [ ] T281 [P] [US7] Rama revisa que la exportación no incluya datos de otros usuarios y entrega su informe sin hallazgos abiertos en `.specify/memory/audits/rebanada-5-rama.md` (REQ-BACKUP2-001, SC-003)
- [ ] T282 [US7] Compuerta de la rebanada 5: `bash scripts/verify-traceability.sh --feature 002 --task T271` y cada tarea T272 a T279, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate` (INV-ARCH-001, INV-ARCH-002)

**Checkpoint**: criterios (a) a (e) de la rebanada 5 verificables. Decisión cerrada de Neo (F4-M5, aprobada): la exportación por `POST`, `X-Argos-Import-Confirm` y `fileDigest` quedan como contrato vigente; T271 a T279 los implementan tal cual.

---

## Phase 7: Rebanada 6 — Interfaz (US8)

**Goal**: app shell de 768 px, directorio de mascotas con filtros por especie, ficha y formularios clínicos según el rol, pantalla `/cuenta` con zona de peligro, hogares con roles, Centro de Respaldos, mensajes humanos de error y aviso previo de expiración, verificados a 320, 768, 1024 y 1280 px.

**Independent Test**: axe-core sin violaciones `critical` ni `serious` en cada pantalla a los cuatro anchos; ninguna acción denegada por la matriz existe en la interfaz; ningún campo muestra el texto técnico del esquema; sin desbordamiento horizontal a 320 px.

**Responsable visual**: `/sati`. Todo componente nuevo pasa por su revisión; la aprobación del diseño es de Neo.

- [ ] T283 [US8] [N2] Sati entrega el diseño de la v2.1 que la spec aprueba (tokens, app shell, directorio, ficha, `/cuenta`, hogares con roles, Centro de Respaldos, estados vacío y de carga) en `claude/` o `.specify/memory/audits/`, sin SSO, sin recuperación por correo y sin adjuntos; la aprobación es de Neo y cualquier librería de iconos o fuentes nueva es Nivel 2 (REQ-UI2-001, REQ-UI2-003, REQ-UI2-004, REQ-UI2-008)

### Tests for Slice 6

> **NOTE: escribir estas pruebas PRIMERO y comprobar que FALLAN antes de implementar**

- [ ] T284 [P] [US8] Pruebas de presentación en `tests/unit/presentation/` y `tests/integration/presentation/web-client.spec.ts`: acciones ocultas según `permissions`, mensajes humanos sin el texto «El payload incumple el esquema formal...», filtros por especie, color del dueño y «Solo lectura» (REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-005, REQ-UI2-002, REQ-UI2-003, REQ-UI2-006, INV-ARCH-003, INV-ARCH-004)
- [ ] T285 [P] [US8] Prueba de accesibilidad en `tests/e2e/accessibility/wcag.spec.ts`: axe-core WCAG 2.1 AA sin `critical` ni `serious` en todas las pantallas, `/cuenta` incluida, a 320, 768, 1024 y 1280 px, y sin desbordamiento horizontal a 320 px (REQ-UI2-008, REQ-UI2-004, SC-005)
- [ ] T286 [P] [US8] Pruebas E2E en `tests/e2e/visual/` de los recorridos de usuario: tras crear un hogar se ve el éxito, el hogar con su rol y el selector actualizado; navegación por teclado sin recarga con muchas mascotas; aviso previo de expiración de sesión; centro de respaldos con barra de fases sin porcentaje (REQ-UI2-005, REQ-UI2-007, REQ-UI2-001, REQ-UI-002, SC-007, SC-005)

### Implementation for Slice 6

- [ ] T287 [US8] Implementar el app shell y la navegación (≥ 768 px encabezado y menú del avatar; < 768 px barras superior e inferior) con rutas en español en `src/presentation/web/pages/AppShell.tsx` y `App.tsx` (REQ-UI2-001, REQ-UI-001, REQ-UI2-008)
- [ ] T288 [P] [US8] Implementar el directorio de mascotas con búsqueda de 300 ms, grilla de 1, 2 o 3 columnas, filtros por especie, estados vacío y de carga y la distinción visual del dueño en `src/presentation/web/pages/PetsPage.tsx` y `components/` (REQ-UI2-002, REQ-UI2-003, REQ-UI-001)
> **Nota de orden**: T293 (mensajes humanos, `validation.ts`) se ejecuta ANTES de T289 a T292 porque las pantallas lo consumen; conserva su ID y solo cambia su posición en la lista. T289 a T292 pierden la marca `[P]` porque comparten `src/presentation/web/` y pueden solaparse.

- [ ] T293 [US8] Implementar el módulo de mensajes humanos de error en `src/presentation/web/validation.ts` o `schema-messages.ts` (solo presentación, sin tocar contratos) y el aviso previo de expiración de sesión sin sondeo en segundo plano, conforme a las decisiones cerradas de Neo en el hallazgo 6-A: D1 (la lectura de `REQ-UI-005` es solo de presentación) y D2 (opción A, redacción visible); se ejecuta antes de T289 a T292 porque las pantallas consumen este módulo (REQ-UI-005, REQ-UI2-006, INV-ARCH-003)
- [ ] T289 [US8] Implementar la ficha, el semáforo con «Reemplazada por registro posterior», el acordeón de reemplazados y los formularios clínicos con decimales según especie, visibles solo si el rol los permite (REQ-UI2-006, REQ-UI-002, REQ-UI-003, REQ-UI2-003)
- [ ] T290 [US8] Implementar la pantalla `/cuenta` con perfil, cambio de contraseña y la zona de peligro con el flujo de la eliminación (REQ-UI2-004, REQ-ACC-001, REQ-AUTH2-003, REQ-ACC-002)
- [ ] T291 [US8] Implementar la gestión de hogares con roles, asignación y transferencia, con la insignia de rol por miembro (REQ-UI2-005, REQ-HOUSE2-001, REQ-HOUSE2-002, REQ-HOUSE2-003, REQ-OWN-001)
- [ ] T292 [US8] Implementar el Centro de Respaldos con arrastre, previsualización y barra de fases (Validando, Previsualizando, Aplicando, Terminada o Revertida) (REQ-UI2-007, REQ-BACKUP2-001, REQ-BACKUP2-002)
- [ ] T294 [P] [US8] Seraph verifica a 320, 768, 1024 y 1280 px con axe-core y entrega evidencia en `tests/e2e/` (REQ-UI2-008, SC-005)
- [ ] T295 [US8] [N2] Sati revisa lo construido contra su diseño y entrega a Neo la pieza para su aprobación (REQ-UI2-001, REQ-UI2-003, REQ-UI2-008)
- [ ] T296 [US8] Compuerta de la rebanada 6: `bash scripts/verify-traceability.sh --feature 002 --task T284` y cada tarea T285 a T293, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate` y la suite E2E a los cuatro anchos (INV-ARCH-001, INV-ARCH-002, REQ-UI2-008)

**Checkpoint**: criterios (a) a (e) de la rebanada 6 verificables; aprobación del diseño por Neo.

---

## Phase 8: Seguridad V10–V16, mutación y compuerta final

**Purpose**: batería de seguridad ampliada de 9 a 16 vectores, mutación y la compuerta final de la feature.

### Tests de seguridad

- [ ] T297 [P] Vectores V10 y V11 en `tests/security/exploits/backup-token.security.spec.ts`: token reutilizado o en dos peticiones simultáneas (solo una gana); token caducado a los 10 min exactos, ajeno, ausente o sustituido con el mismo error y cuerpo (REQ-ACC-002, SC-014, ERR-ACCOUNT-CONFIRMATION-MISMATCH)
- [ ] T298 [P] Vectores V12 y V13 en `tests/security/exploits/audit-secret.security.spec.ts` y `session-csrf.security.spec.ts`: secreto de auditoría ausente, corto o de prueba en producción impide el arranque y nunca aparece en logs; cookie de otra sesión inválida tras cambiar la contraseña (REQ-AUD-001, INV-AUD-001, STATE-AUTH-SESSION-001, REQ-AUTH2-003)
- [ ] T299 [P] Vectores V14, V15 y V16 en `tests/security/exploits/`: actividad constante no supera 24 h y lo rechazado no renueva; cero apariciones del `userId` eliminado en auditoría y volcado; importación con `ownerUserId`, `role` o asignaciones falsos en 1.0.0, 2.0.0 y 3.0.0 (INV-AUTH2-002, INV-AUD-001, SC-014, REQ-BACKUP2-002, ERR-BACKUP-SCHEMA-INVALID)
- [ ] T300 [P] Los 9 vectores originales de la constitución ejecutados con los 4 roles (IDOR, hogares ajenos, sin sesión, sesión expirada, CSRF, enumeración por tiempo, prototype pollution, payload mayor de 10 MB y XSS almacenado) (SC-003, INV-ACC2-001, INV-ACC2-002, INV-AUTH-006, INV-AUTH-007, ERR-BACKUP-PAYLOAD-TOO-LARGE)
- [ ] T301 [P] Pruebas adicionales: la interfaz no hace peticiones autenticadas en segundo plano, la invitación devuelve el mismo cuerpo y un tiempo similar exista o no el `username`, y un escáner de logs no encuentra `userId`, `username`, `email`, token ni cookie sembrados (INV-AUTH2-002, INV-HOUSE-003, INV-AUTH-003, INV-AUD-001)
- [ ] T302 Sentinels y Trinity ejecutan la batería completa de 16 vectores y los hallazgos vuelven a Keymaker por Caso A; los que cambian contrato vuelven a Architect por Caso B (SC-003, INV-AUTH-007, ERR-AUTH-CSRF-REJECTED)

### Mutación, regresión y compuerta final

- [ ] T303 Actualizar `tests/mutation/stryker.conf.json` a los módulos nuevos (`src/domain/**`, `src/application/**`) y cazar los mutantes sobrevivientes hasta Stryker ≥ 85 % con Seraph y Dojo, sin relajar ninguna prueba (INV-ARCH-001, SC-002)
- [ ] T304 Regresión completa de la 001 vigente: todas las pruebas de la tabla de sustitución en estado «sustituida» y todas las no listadas en verde, sin pruebas borradas, comentadas ni relajadas (SC-002, INV-ARCH-004)
- [ ] T305 `bash scripts/verify-oracles.sh` sin oráculos débiles sobre las pruebas nuevas y sustituidas (INV-ARCH-002)
- [ ] T306 `bash scripts/verify-traceability.sh --feature 002` en compuerta final: 100 % de los `REQ`, `INV`, `STATE` y `ERR` vigentes con `@implements` en `src/` y título de prueba en `tests/`; depende de T204a (firma de Neo de la enmienda del principio III) (SC-002, INV-ARCH-001, INV-ARCH-002)
- [ ] T307 Revisar a mano el mapa del quickstart §4: `SC-001` a `SC-017` con su prueba nombrada, y listar los que carezcan de ella (SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-008, SC-009, SC-010, SC-011, SC-012, SC-013, SC-014, SC-015, SC-016, SC-017)
- [ ] T308 Recorrido manual de aceptación del quickstart §6 (registro, 8 especies, hogar con rol, Cuidador, `SUPERSEDED`, respaldo con previsualización, eliminación de cuenta) por Zee y Kid, con evidencia en `.specify/memory/audits/` (SC-001, SC-014, SC-015, SC-017)
- [ ] T309 Compuerta final: `bash scripts/compile-contracts.sh --feature 002`, `bash scripts/verify-traceability.sh --feature 002`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run test:mutation`, `npm run test:e2e` y `npm run test:gate` en verde (INV-ARCH-001, INV-ARCH-002, INV-ARCH-003, SC-002)
- [ ] T310 [N2] Oracle emite el veredicto formal sobre la feature y deja las tareas en `REVIEW`; la marca `COMPLETED`, la etiqueta y `git push` son de Neo (SC-002)

**Checkpoint**: feature completa en `REVIEW`; sin `COMPLETED` hasta que Neo lo firme.

---

## Dependencies & Execution Order

- Fase 1 (F7) bloquea todo. T207 bloquea el resto de la Fase 2 porque regenera `src/generated/`.
- Las rebanadas van en orden fijo 1 a 6, cada una con su compuerta; cada una se puede cerrar sin la siguiente, salvo las dependencias declaradas en «Reglas transversales».
- Dentro de una rebanada: pruebas primero, luego migración SQL, dominio, puertos, casos de uso, rutas y presentación, luego revisiones de apoyo y la compuerta.
- Fase 8 depende de las seis rebanadas; T306 depende además de la firma de Neo sobre el principio III.

## Parallel Example: Slice 1

```bash
# Pruebas de la rebanada 1 en paralelo:
Task: "T208 Pruebas de la política de contraseña y de sesión"
Task: "T209 Pruebas de la API de autenticación"
Task: "T210 Pruebas de perfil y cambio de contraseña"
Task: "T211 Pruebas de la eliminación de cuenta"
Task: "T212 Pruebas de la invitación uniforme"
```

## Implementation Strategy

1. Fase 1: herramientas multi-feature (la 001 intacta).
2. Rebanada 1: cuenta e identidad, validar de forma independiente.
3. Rebanadas 2 a 5 en orden, cada una con su compuerta y veredicto de Oracle.
4. Rebanada 6: interfaz con aprobación de Neo del diseño de Sati.
5. Fase 8: seguridad V10 a V16, mutación y compuerta final.

## Notes

- [P] = archivos distintos, sin dependencia.
- Una tarea se marca `[x]` solo con la aprobación del arquitecto humano (constitución, «Governance»). Los agentes dejan `REVIEW`.
- Riesgo declarado: T207 cambia de golpe los tipos generados (`Species`, roles, permisos, sesión); mientras tanto las pruebas de la 001 que afirmen reglas reemplazadas pueden fallar y se atienden en las tareas que indica la tabla de sustitución, nunca borrándolas.
- Riesgo declarado: los identificadores `STATE-ACCOUNT-DELETE-001`, `ERR-PET-MICROCHIP-DUPLICATE` y `ERR-RATE-LIMITED` fueron aprobados por Neo; la enmienda del principio III que los incorpora está en borrador.
- Evidencia de cobertura de IDs: ver el informe de F6 en `claude/log-architect.md`.
