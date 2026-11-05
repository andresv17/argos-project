---
document_id: PLAN-ARGOS-001
version: 2.0.0
status: APPROVED
supersedes: 1.0.0
spec_ref: .specify/specs/pet-health-tracker.md (v2.0.0)
constitution_ref: .specify/constitution/constitution.md (v2.0.0)
approved_by: Arquitecto humano (Nivel 2) — 2026-11-05
---

# Plan de Arquitectura Técnica: Argos Pet Health & Biometric Tracker (v2.0.0)

## 0. Vista General
```
Navegador (React SPA, Vite :5173)  ──/api (proxy)──►  API Fastify (127.0.0.1:3000)  ──►  SQLite ./data/argos.sqlite
        src/presentation/web/                          src/infrastructure/http/            src/infrastructure/persistence/
                     │                                           │
                     └──── cliente tipado (openapi) ─────────────┘──► src/application/ (casos de uso) ──► src/domain/
```
Para Cloud solo se sustituyen adaptadores en `src/infrastructure/` (persistencia, config, cookie `Secure`, host).

## 1. Mapeo de Contratos a Capas (`contracts/` -> `src/`)

| Contrato Fuente | Artefacto Generado (`src/generated/`) | Herramienta | Consumidores |
| :--- | :--- | :--- | :--- |
| `contracts/schemas/identity.schema.json` | `schemas/identity.types.ts`, `schemas/identity.validators.js` | json-schema-to-typescript + Ajv standalone | domain/auth, domain/households, infrastructure, presentation |
| `contracts/schemas/pet.schema.json` | `schemas/pet.types.ts`, `schemas/pet.validators.js` | idem | domain/pet, infrastructure, presentation |
| `contracts/schemas/medical-records.schema.json` | `schemas/medical-records.types.ts`, `schemas/medical-records.validators.js` | idem | domain/records, infrastructure, presentation |
| `contracts/schemas/backup-envelope.schema.json` | `schemas/backup.types.ts`, `schemas/backup.validators.js` | idem (incluye v1 legado) | application/use-cases (backup), infrastructure |
| `contracts/openapi/pet-tracker-api.openapi.yaml` | `api/openapi-types.ts`, `api/api-validators.js` (components.schemas) | openapi-typescript + Ajv | infrastructure/http, presentation/web/api-client, tests/integration |
| `contracts/state-machines/*.machine.json` | `machines/*.types.ts` + constantes de estados/transiciones | codegen.mjs (lee el JSON) | domain, application, presentation |
| `contracts/errors/error-catalog.json` | `errors/error-codes.ts` (`ErrorCode`, `ERROR_CATALOG`, `DomainError`) | codegen.mjs (lee el JSON) | todas las capas |

`scripts/compile-contracts.sh` limpia `src/generated/` y lo regenera completo; la lista de contratos requeridos se obtiene listando `contracts/` (no fija a mano). Los `@implements` de los archivos generados se leen de `x-sdd-metadata.traceability` de cada contrato.

## 2. Capa de Dominio (`src/domain/`) — pura, síncrona
- `shared/date-utils.ts`: aritmética ISO, `diffInCalendarDays`, `calculatePetAge` con regla de fin de mes / 29-feb (`REQ-PET-002`, `INV-PET-002`).
- `sorting/deterministic-sorter.ts`: `INV-SORT-001` y orden de `REQ-PET-005`.
- `pet/pet-invariants.ts`: `INV-PET-002`, `INV-PET-006`, `INV-OWN-001`. (Se elimina toda lógica de cupo.)
- `records/record-invariants.ts`: `INV-REC-001..006`, `deltaKg` y variación porcentual.
- `alerts/sanitary-alert-evaluator.ts`: `STATE-ALERT-001`.
- `access/access-policy.ts`: `INV-ACC-001`, `INV-ACC-002` como funciones puras `canRead(user, pet, memberships)` / `canWrite(user, pet)`.
- `auth/auth-policies.ts`: `INV-AUTH-002` (política), `INV-AUTH-004` (vigencia), `INV-AUTH-005` (ventana de bloqueo), `STATE-AUTH-SESSION-001`.
- `households/household-policies.ts`: `INV-HOUSE-001..005`, `STATE-HOUSE-MEMBERSHIP-001` (tabla de transiciones generada).
- `backup/backup-migration.ts`: transformación pura v1.0.0 → v2.0.0.

## 3. Capa de Aplicación (`src/application/`)
- **Puertos (`ports/`, todos asíncronos, `INV-ARCH-005`):** `ClockPort`, `IdGeneratorPort`, `SecureTokenPort`, `PasswordHasherPort`, `UserRepositoryPort`, `SessionRepositoryPort`, `LoginAttemptRepositoryPort`, `PetRepositoryPort`, `MedicalRecordRepositoryPort`, `HouseholdRepositoryPort`, `UnitOfWorkPort` (`runInTransaction`).
- **Casos de uso (`use-cases/`):**
  - Auth: `RegisterUserUseCase`, `LoginUseCase`, `LogoutUseCase`, `GetCurrentSessionUseCase`, `AuthenticateRequestUseCase`.
  - Mascotas: `RegisterPetUseCase`, `UpdatePetUseCase`, `DeletePetUseCase`, `ListMyPetsUseCase`, `GetPetDashboardUseCase`.
  - Registros: `AddWeightRecordUseCase`, `AddBodyMeasurementUseCase`, `AddVaccinationUseCase`, `AddDewormingUseCase`, `AddMedicalVisitUseCase`, `AddCustomParameterUseCase`.
  - Hogares: `CreateHouseholdUseCase`, `InviteMemberUseCase`, `ListMyInvitationsUseCase`, `RespondInvitationUseCase`, `RemoveMemberUseCase`, `LeaveHouseholdUseCase`, `DeleteHouseholdUseCase`, `ListMyHouseholdsUseCase`, `GetHouseholdPetsUseCase`.
  - Respaldo: `ExportBackupUseCase`, `ImportBackupUseCase` (`STATE-BACKUP-001`; el rollback lo garantiza la transacción; el error original se preserva siempre).
  Todo caso de uso recibe el `userId` autenticado como primer argumento y aplica `access-policy` antes de cualquier lectura/escritura.

## 4. Infraestructura (`src/infrastructure/`)
- `config/app-config.ts`: única lectura de `process.env` (`PORT`, `HOST=127.0.0.1`, `DATABASE_PATH`, `APP_TIMEZONE`, `COOKIE_SECURE`), validada con esquema (`INV-ARCH-006`).
- `adapters/`: `SystemClockAdapter` (zona `APP_TIMEZONE` vía `Intl.DateTimeFormat`), `FixedClockAdapter`, `CryptoUuidAdapter`, `DeterministicIdAdapter`, `CryptoSecureTokenAdapter`, `ScryptPasswordHasherAdapter`.
- `persistence/sqlite/`: repositorios `better-sqlite3`, `SqliteUnitOfWork`, `migrations/0001_init.sql` (tablas `users`, `sessions`, `login_attempts`, `pets`, 6 tablas de registros con `ON DELETE CASCADE`, `households`, `household_members`), runner de migraciones al arranque.
- `persistence/memory/`: repositorios en memoria equivalentes para tests.
- `http/`: `server.ts` (Fastify, bind `127.0.0.1`), `routes/*.ts` (una por tag OpenAPI), `plugins/session-auth.ts`, `plugins/csrf-guard.ts`, `plugins/problem-details.ts` (mapea `DomainError` → RFC 9457, oculta trazas), validación de request/response con los validadores generados, límite de cuerpo 10 MB en importación.
- Legado: `LocalStorageTransactionalRepository` se elimina.

## 5. Presentación (`src/presentation/web/`)
- `main.tsx`, `App.tsx` (router: `/login`, `/register`, `/pets`, `/pets/:petId`, `/households`, `/households/:householdId`).
- `api-client/` generado a partir de `openapi-types.ts` (fetch con `credentials: 'include'` y cabecera `X-Argos-Request: 1`).
- Componentes: `AuthForms`, `ContextSwitcher`, `PetCardList` (filtros), `PetDashboard` (pestañas de 6 módulos + formularios), `WeightChart` (SVG), `AlertBadge`, `OwnerBadge` (`REQ-UI-007`), `DeletePetDialog`, `HouseholdManager`, `InvitationsInbox`, `BackupPanel` (descargar/subir archivo).
- Estilos: Tailwind con tokens `owner-1..8` de contraste AA.

## 6. Estrategia de Verificación (`tests/`)
- `unit/`: Vitest, cada `INV-*`, `STATE-*` y `ERR-*` de dominio y aplicación con repositorios en memoria y `FixedClockAdapter` (`2026-11-05`, `America/Bogota`).
- `property/`: fast-check (`seed: 20261105`), arbitrarios derivados de los esquemas: `INV-SORT-001`, `INV-REC-002/003`, `STATE-ALERT-001`, `REQ-PET-002`, `INV-ACC-001`, `INV-HOUSE-005`, atomicidad `INV-BACKUP-001`.
- `integration/contracts/`: `canonical-fixtures.json` contra validadores generados; respuestas reales de la API validadas contra el OpenAPI.
- `integration/api/`: Fastify `inject` + SQLite temporal: códigos HTTP, cookies, `problem+json`, cascada de borrado, importación v1/v2, rollback con fallo de commit simulado.
- `security/exploits/`: IDOR, hogares ajenos, sin sesión, sesión expirada, CSRF, enumeración, bloqueo, XSS almacenado, prototype pollution y payload > 10 MB. `security/sast-rules/`: reglas (p. ej. Semgrep o ESLint) que bloquean entropía/`process.env` fuera de capas permitidas y `dangerouslySetInnerHTML`.
- `e2e/visual/` y `e2e/accessibility/`: Playwright + axe-core sobre la app levantada con `webServer`, incluido el flujo de 2 usuarios y un hogar.
- `mutation/`: Stryker con `vitest-runner` sobre `src/domain/**` y `src/application/**`.
