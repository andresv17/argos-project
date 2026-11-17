# Tasks: Argos Pet Health & Biometric Tracker

**Input**: Design documents from `/specs/001-pet-health-tracker/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: obligatorias. La constitución (principio IV) exige pruebas unitarias, de propiedades, de contrato, de seguridad, de mutación y E2E, y cada prueba lleva en su título el identificador que verifica.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions
- Los identificadores entre paréntesis al final de una tarea son los que verifica su compuerta: `bash scripts/verify-traceability.sh --task T###`

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Contratos formales en `specs/001-pet-health-tracker/contracts/`; código generado en `src/generated/`; compuertas en `scripts/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Crear la estructura por capas de `src/` (`generated`, `domain`, `application`, `infrastructure`, `presentation`) y de `tests/` (`unit`, `property`, `integration`, `security`, `e2e`, `mutation`, `fixtures`) definida en plan.md
- [x] T002 Inicializar el proyecto TypeScript 5.6 sobre Node 22 con sus dependencias en `package.json`, `package-lock.json`, `.nvmrc` y `tsconfig.json`
- [x] T003 [P] Configurar Vite, Tailwind y PostCSS en `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js` e `index.html`
- [x] T004 [P] Configurar Playwright y Stryker en `playwright.config.ts` y `tests/mutation/stryker.conf.json`
- [x] T005 [P] Configurar `.gitignore` y `.env.example` sin secretos (INV-ARCH-006)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Definir los contratos formales de la feature en `specs/001-pet-health-tracker/contracts/` (`schemas/`, `openapi/`, `state-machines/`, `errors/`, `examples/`)
- [x] T007 Generar validadores, tipos y cliente con `scripts/compile-contracts.sh` y `scripts/codegen.mjs` hacia `src/generated/`, con pruebas en `tests/integration/contracts/codegen-drift.spec.ts` y `tests/integration/contracts/generated-contracts.spec.ts` (INV-ARCH-003, ERR-SCHEMA-VALIDATION-FAILED)
- [x] T008 Implementar las compuertas `scripts/verify-traceability.sh` y `scripts/verify-oracles.sh`, sus pruebas en `tests/integration/gates/verify-gates.spec.ts` y los flujos `.github/workflows/test-gate.yml` y `.github/workflows/drift-detection.yml` (INV-ARCH-001, INV-ARCH-002)
- [x] T009 [P] Implementar fechas, edad y orden determinista en `src/domain/shared/date-utils.ts` y `src/domain/sorting/deterministic-sorter.ts`, con pruebas en `tests/unit/date-and-sort.spec.ts` y `tests/property/sorting.property.spec.ts` (INV-SORT-001, INV-REC-001)
- [x] T010 [P] Definir los puertos asíncronos en `src/application/ports/` y el soporte común en `src/application/use-cases/use-case-support.ts` (INV-ARCH-005)
- [x] T011 [P] Implementar los adaptadores de reloj, identificadores, token y hash en `src/infrastructure/adapters/`, con pruebas en `tests/unit/infrastructure-adapters.spec.ts` (INV-ARCH-001, INV-ARCH-002)
- [x] T012 [P] Implementar la configuración validada en `src/infrastructure/config/app-config.ts`, con pruebas en `tests/unit/app-config.spec.ts` (INV-ARCH-006)
- [x] T013 Implementar los repositorios en memoria en `src/infrastructure/persistence/memory/in-memory-unit-of-work.ts` y SQLite en `src/infrastructure/persistence/sqlite/` (migración `migrations/0001_init.sql`), con la suite `tests/fixtures/repository-contract-suite.ts` ejecutada en `tests/unit/use-cases.memory-repositories.spec.ts` y `tests/integration/persistence/sqlite-repositories.spec.ts` (INV-ARCH-005, INV-PET-005, ERR-INTERNAL-UNEXPECTED)
- [x] T014 Implementar el servidor HTTP y sus plugins en `src/infrastructure/http/app.ts`, `server.ts`, `request-input.ts` y `plugins/` (`csrf-guard.ts`, `session-auth.ts`, `problem-details.ts`), con pruebas en `tests/integration/api/server.api.spec.ts` y `tests/integration/api/precedence.api.spec.ts` (INV-AUTH-007, ERR-AUTH-CSRF-REJECTED, ERR-AUTH-UNAUTHENTICATED)
- [x] T015 Implementar la base de la SPA en `src/presentation/web/main.tsx`, `App.tsx`, `api.ts`, `session.tsx`, `validation.ts`, `use-contract-form.ts`, `view-model.ts`, `styles.css`, `components/Field.tsx` y `pages/AppShell.tsx`, con pruebas en `tests/unit/presentation/` (REQ-UI-004, INV-ARCH-003)
- [x] T016 [P] Verificar la dependencia concéntrica entre capas en `tests/unit/layer-dependencies.spec.ts` y `tests/unit/presentation/presentation-architecture.spec.ts` (INV-ARCH-004)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Crear cuenta e iniciar sesión (Priority: P1) 🎯 MVP

**Goal**: registro, inicio y cierre de sesión con bloqueo por intentos y respuesta uniforme

**Independent Test**: recorrido registro → sesión → cierre de sesión → inicio de sesión, sin crear mascotas

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [P] [US1] Pruebas de las políticas de autenticación y sesión en `tests/unit/auth-policies.spec.ts` y `tests/property/auth.property.spec.ts` (INV-AUTH-001, INV-AUTH-002, INV-AUTH-004, INV-AUTH-005, STATE-AUTH-SESSION-001)
- [x] T018 [P] [US1] Pruebas de la API de autenticación en `tests/integration/api/auth.api.spec.ts` (REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004)

### Implementation for User Story 1

- [x] T019 [US1] Implementar las políticas de autenticación y sesión en `src/domain/auth/auth-policies.ts` y `src/domain/auth/utc-timestamp.ts` (INV-AUTH-001, INV-AUTH-002, INV-AUTH-004, INV-AUTH-005, STATE-AUTH-SESSION-001, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-WEAK-PASSWORD, ERR-AUTH-TOO-MANY-ATTEMPTS)
- [x] T020 [US1] Implementar los casos de uso de registro, inicio, cierre y sesión actual en `src/application/use-cases/auth-use-cases.ts`, con pruebas en `tests/unit/use-cases.spec.ts` (REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH-003, INV-AUTH-006, ERR-AUTH-INVALID-CREDENTIALS)
- [x] T021 [US1] Implementar las rutas de autenticación en `src/infrastructure/http/routes/auth.routes.ts` y registrarlas en `src/infrastructure/http/routes/use-cases.ts`
- [x] T022 [US1] Implementar las pantallas de registro e inicio de sesión en `src/presentation/web/pages/AuthPages.tsx` (REQ-UI-005)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Gestionar mis mascotas (Priority: P2)

**Goal**: alta, edición, listado, ficha y eliminación de mascotas con propiedad y control de acceso

**Independent Test**: crear dos mascotas, comprobar orden y filtro, abrir una ficha, editarla y eliminar una escribiendo su nombre

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T023 [P] [US2] Pruebas de invariantes de mascota y de la política de acceso en `tests/unit/pet-and-alerts.spec.ts`, `tests/unit/access-policy.spec.ts`, `tests/property/pet.property.spec.ts` y `tests/property/access.property.spec.ts` (INV-PET-002, INV-PET-006, INV-OWN-001, INV-ACC-001, INV-ACC-002)
- [x] T024 [P] [US2] Pruebas de la API de mascotas en `tests/integration/api/pets-records.api.spec.ts` (REQ-PET-001, REQ-PET-003, REQ-PET-004, REQ-PET-005)

### Implementation for User Story 2

- [x] T025 [US2] Implementar las invariantes de mascota, la eliminación en cascada y la política de acceso en `src/domain/pet/pet-invariants.ts`, `src/domain/pet/pet-deletion.ts` y `src/domain/access/access-policy.ts` (REQ-PET-002, INV-PET-002, INV-PET-005, INV-PET-006, INV-OWN-001, INV-ACC-001, INV-ACC-002, ERR-PET-FUTURE-BIRTHDATE, ERR-PET-BIRTHDATE-AFTER-RECORDS, ERR-ACC-FORBIDDEN)
- [x] T026 [US2] Implementar los casos de uso de mascotas en `src/application/use-cases/pet-use-cases.ts` (REQ-PET-001, REQ-PET-003, REQ-PET-004, REQ-PET-005, INV-PET-003, ERR-PET-NOT-FOUND)
- [x] T027 [US2] Implementar las rutas de mascotas en `src/infrastructure/http/routes/pets.routes.ts`
- [x] T028 [US2] Implementar la lista, el formulario y la ficha de mascotas en `src/presentation/web/pages/PetsPage.tsx`, `components/PetCards.tsx`, `components/PetForm.tsx`, `components/PetDashboard.tsx` y `components/ContextSelector.tsx` (REQ-UI-001)

**Checkpoint**: At this point, User Story 2 should be fully functional and testable independently

---

## Phase 5: User Story 3 - Registrar el historial clínico y biométrico (Priority: P3)

**Goal**: alta de registros en los 6 módulos con sus rangos, ventanas de fecha y variación de peso

**Independent Test**: dar de alta un registro en cada módulo y comprobar el orden de cada historial y la variación de peso

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T029 [P] [US3] Pruebas de las invariantes de registros en `tests/unit/record-invariants.spec.ts` y `tests/property/records.property.spec.ts` (INV-REC-001, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006)
- [x] T030 [P] [US3] Prueba de precisión decimal en la frontera en `tests/integration/contracts/decimal-precision-boundary.spec.ts` (INV-REC-002, INV-REC-003)

### Implementation for User Story 3

- [x] T031 [US3] Implementar las invariantes de los 6 módulos y las variaciones de peso en `src/domain/records/record-invariants.ts` (INV-REC-001, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE)
- [x] T032 [US3] Implementar los casos de uso de alta de registros en `src/application/use-cases/record-use-cases.ts` (REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006)
- [x] T033 [US3] Implementar las rutas de registros de una mascota en `src/infrastructure/http/routes/pets.routes.ts`
- [x] T034 [US3] Implementar los formularios de registro y la evolución de peso en `src/presentation/web/components/RecordForm.tsx`, `components/WeightChart.tsx` y `records.ts` (REQ-UI-002)

**Checkpoint**: At this point, User Story 3 should be fully functional and testable independently

---

## Phase 6: User Story 4 - Ver las alertas de vacunas y desparasitaciones (Priority: P4)

**Goal**: semáforo de alertas por vacunación y desparasitación

**Independent Test**: registrar vacunas con refuerzos en fechas distintas y comprobar el estado de cada insignia

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T035 [P] [US4] Pruebas del evaluador de alertas en `tests/unit/pet-and-alerts.spec.ts` y `tests/property/alerts.property.spec.ts` (STATE-ALERT-001)

### Implementation for User Story 4

- [x] T036 [US4] Implementar el evaluador de alertas sanitarias en `src/domain/alerts/sanitary-alert-evaluator.ts` (STATE-ALERT-001)
- [x] T037 [US4] Implementar las insignias de alerta y los contadores de las tarjetas en `src/presentation/web/components/AlertBadge.tsx` y `src/presentation/web/view-model.ts` (REQ-UI-003)

**Checkpoint**: At this point, User Story 4 should be fully functional and testable independently

---

## Phase 7: User Story 5 - Compartir mascotas en un hogar (Priority: P5)

**Goal**: hogares con invitación aceptada, vista compartida y distinción del dueño

**Independent Test**: con dos usuarios en navegadores separados, crear un hogar, invitar y comprobar qué ve cada uno antes y después de aceptar

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T038 [P] [US5] Pruebas de las políticas de hogar en `tests/unit/household-policies.spec.ts` y `tests/property/households.property.spec.ts` (INV-HOUSE-001, INV-HOUSE-002, INV-HOUSE-003, INV-HOUSE-004, INV-HOUSE-005, STATE-HOUSE-MEMBERSHIP-001)
- [x] T039 [P] [US5] Pruebas de la API de hogares en `tests/integration/api/households.api.spec.ts` y de sus casos de uso en `tests/unit/use-cases.households.spec.ts` (REQ-HOUSE-001, REQ-HOUSE-002, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005)

### Implementation for User Story 5

- [x] T040 [US5] Implementar las políticas de hogar y membresía en `src/domain/households/household-policies.ts` (INV-HOUSE-001, INV-HOUSE-002, INV-HOUSE-003, INV-HOUSE-004, INV-HOUSE-005, STATE-HOUSE-MEMBERSHIP-001, ERR-HOUSE-OWNER-CANNOT-LEAVE, ERR-HOUSE-MEMBER-ALREADY-EXISTS)
- [x] T041 [US5] Implementar los casos de uso de hogares en `src/application/use-cases/household-use-cases.ts` (REQ-HOUSE-001, REQ-HOUSE-002, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, ERR-AUTH-USER-NOT-FOUND, ERR-HOUSE-NOT-FOUND, ERR-HOUSE-INVITATION-NOT-FOUND, ERR-HOUSE-MEMBERSHIP-NOT-FOUND)
- [x] T042 [US5] Implementar las rutas de hogares e invitaciones en `src/infrastructure/http/routes/households.routes.ts`
- [x] T043 [US5] Implementar la gestión de hogares y la distinción del dueño en `src/presentation/web/pages/HouseholdsPage.tsx` y `src/presentation/web/components/OwnerBadge.tsx` (REQ-UI-006, REQ-UI-007)

**Checkpoint**: At this point, User Story 5 should be fully functional and testable independently

---

## Phase 8: User Story 6 - Respaldar y restaurar mis datos (Priority: P6)

**Goal**: exportación por usuario e importación atómica con migración del formato 1.0.0

**Independent Test**: exportar, importar de nuevo y comparar; importar un archivo inválido y comprobar que los datos no cambian

### Tests for User Story 6

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T044 [P] [US6] Pruebas de la migración y de los casos de uso de respaldo en `tests/unit/backup-migration.spec.ts`, `tests/unit/backup-use-cases.spec.ts` y `tests/unit/backup-import-atomicity.spec.ts` (INV-BACKUP-001, STATE-BACKUP-001)
- [x] T045 [P] [US6] Pruebas de atomicidad sobre la API y SQLite en `tests/integration/api/backup-atomicity.spec.ts` y `tests/integration/persistence/sqlite-backup-import.spec.ts` (REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001)

### Implementation for User Story 6

- [x] T046 [US6] Implementar la migración pura del sobre 1.0.0 al 2.0.0 en `src/domain/backup/backup-migration.ts` (STATE-BACKUP-001)
- [x] T047 [US6] Implementar la exportación y la importación atómica en `src/application/use-cases/backup-use-cases.ts` (REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK)
- [x] T048 [US6] Implementar las rutas de exportación e importación con límite de 10 MB en `src/infrastructure/http/routes/backup.routes.ts`
- [x] T049 [US6] Implementar la pantalla de respaldo en `src/presentation/web/pages/BackupPage.tsx`

**Checkpoint**: At this point, User Story 6 should be fully functional and testable independently

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T050 [P] Validar las respuestas reales de la API contra el contrato OpenAPI y los fixtures canónicos en `tests/integration/contracts/openapi-conformance.spec.ts` y `tests/integration/contracts/canonical-fixtures.spec.ts`
- [x] T051 [P] Probar el cliente web contra la API en `tests/integration/presentation/web-client.spec.ts`
- [x] T052 Cubrir la batería de seguridad en `tests/security/exploits/` y las reglas Semgrep de `tests/security/sast-rules/` (INV-ACC-001, INV-ACC-002, INV-AUTH-003, INV-AUTH-006, INV-AUTH-007, INV-HOUSE-004, ERR-BACKUP-PAYLOAD-TOO-LARGE)
- [x] T053 Cubrir los recorridos E2E y la accesibilidad en `tests/e2e/visual/` y `tests/e2e/accessibility/wcag.spec.ts` a 320, 1024 y 1280 px
- [x] T054 [P] Documentar el arranque local y la compuerta en `README.md` y validar los escenarios de quickstart.md
- [x] T055 Pasar la compuerta final `npm run test:gate` desde un checkout limpio con todos los IDs vigentes de la constitución trazados
- [x] T056 Retirar los 3 `any` de `tests/unit/backup-use-cases.spec.ts` y la aserción no nula de `src/domain/backup/backup-migration.ts` (`checklists/code-review.md`, CHK009)
- [x] T057 Migrar `react-router-dom` a la versión 7 en `package.json` y `src/presentation/web/App.tsx` hasta dejar `npm audit --omit=dev` sin avisos de ese paquete
- [ ] T058 Traducir los errores de esquema a mensajes humanos en español solo en la capa de presentación: crear `src/presentation/web/schema-messages.ts` (etiquetas por campo y `humanizeSchemaError`) y usarlo en `src/presentation/web/validation.ts`, `src/presentation/web/api.ts` y `src/presentation/web/use-contract-form.ts`, sin cambiar el código `ERR-SCHEMA-VALIDATION-FAILED` ni el catálogo (REQ-UI-005 opción A; INV-ARCH-003; REQ-UI-001, REQ-UI-002, REQ-UI-004; diseño en `.specify/memory/audits/hallazgo-6-traduccion-errores.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: necesita la sesión de US1
- **User Story 3 (P3)**: necesita mascotas (US2)
- **User Story 4 (P4)**: necesita registros de vacunación y desparasitación (US3)
- **User Story 5 (P5)**: necesita cuentas (US1) y mascotas (US2)
- **User Story 6 (P6)**: necesita mascotas (US2); respalda también los registros de US3
- **T056 y T057**: deuda técnica posterior a la compuerta final T055; dependen de ella y no la bloquean
- **T058**: mejora de presentación posterior a T055; depende de los esquemas generados (INV-ARCH-003) y de los formularios de US1–US3, y no bloquea la compuerta final

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Dominio antes que casos de uso
- Casos de uso antes que rutas HTTP
- Rutas HTTP antes que pantallas
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- All tests for a user story marked [P] can run in parallel
- US3 y US5 pueden avanzar en paralelo una vez completa US2

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Pruebas de las políticas de autenticación y sesión en tests/unit/auth-policies.spec.ts y tests/property/auth.property.spec.ts"
Task: "Pruebas de la API de autenticación en tests/integration/api/auth.api.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently (MVP)
3. Add User Story 2 → Test independently
4. Add User Story 3 y User Story 4 → Test independently
5. Add User Story 5 y User Story 6 → Test independently
6. Polish: seguridad, E2E, accesibilidad y compuerta final

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Una tarea se marca `[x]` solo con la aprobación del arquitecto humano (constitución, «Governance»)
