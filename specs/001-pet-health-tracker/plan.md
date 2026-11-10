---
document_id: PLAN-ARGOS-001
version: 2.3.0
status: REVIEW
supersedes: 2.2.0
change_type: MINOR
spec_ref: specs/001-pet-health-tracker/spec.md (plan alineado a la spec v2.2.0; spec vigente v2.4.0, sin cambios de requisitos desde v2.3.1)
constitution_ref: .specify/memory/constitution.md (v2.4.0 en REVIEW; reglas de §1–§6 sin cambios desde v2.3.0)
approved_by: pendiente (v2.3.0 en REVIEW, 2026-11-09: migración de formato, pendiente de revisión)
---

# Implementation Plan: Argos Pet Health & Biometric Tracker

**Branch**: `001-pet-health-tracker` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-pet-health-tracker/spec.md`

**Note**: Este plan es PLAN-ARGOS-001 migrado a la plantilla `plan-template.md` de GitHub Spec Kit. El diseño por capas (§0 a §6 del plan v2.2.0) conserva su texto y su numeración dentro de las secciones «Summary» y «Project Structure». «Technical Context», «Constitution Check» y «Complexity Tracking» se derivan de la constitución, de `tasks.md` y de los checklists firmados.

## Summary

Plataforma web multiusuario para el expediente clínico y biométrico de mascotas: una SPA React consume una API HTTP local que aplica casos de uso sobre un dominio puro y persiste en SQLite. Los tipos, validadores y el cliente de la API se generan desde los contratos formales de `contracts/`, y el reloj y la entropía se inyectan por puertos para que todo cálculo sea determinista.

### 0. Vista General
```
Navegador (React SPA, Vite :5173)  ──/api (proxy)──►  API Fastify (127.0.0.1:3000)  ──►  SQLite ./data/argos.sqlite
        src/presentation/web/                          src/infrastructure/http/            src/infrastructure/persistence/
                     │                                           │
                     └──── cliente tipado generado (src/generated/api/client.ts) ──► src/application/ (casos de uso) ──► src/domain/
```
Para Cloud solo se sustituyen adaptadores en `src/infrastructure/` (persistencia, config, cookie `Secure`, host).

## Technical Context

Valores tomados de la constitución §2 y §5 (stack autorizado y umbrales) y del estado del repositorio.

**Language/Version**: TypeScript `~5.6` en modo `strict`, sobre Node.js 22 LTS (`.nvmrc` = `22.23.4`; `engines` `>=22.18 <23`)

**Primary Dependencies**: Fastify 5 y `@fastify/cookie` (API), React 18 con `react-router-dom`, Vite 5 y Tailwind CSS 3 (SPA), Ajv 8 standalone con `ajv-formats`, `openapi-fetch`; generación con `json-schema-to-typescript` y `openapi-typescript`

**Storage**: SQLite en archivo local (`./data/argos.sqlite`) mediante `better-sqlite3`, con migraciones SQL versionadas; adaptador en memoria para pruebas

**Testing**: Vitest 2 con `@vitest/coverage-v8`, fast-check 3 (`seed: 20261105`), Stryker con `vitest-runner`, Playwright con `@axe-core/playwright`, Semgrep en CI

**Target Platform**: ejecución local en `127.0.0.1` (API Node en el puerto 3000 y SPA en navegador); fase Cloud posterior sustituyendo solo adaptadores de `src/infrastructure/`

**Project Type**: aplicación web (SPA + API HTTP) en un único proyecto organizado por capas concéntricas

**Performance Goals**: N/A. La spec no fija metas de rendimiento.

**Constraints**: determinismo total (reloj, identificadores, tokens y hash por puertos inyectados); sin exposición a la red en la fase local; importación de respaldo de hasta 10 MB; WCAG 2.1 AA a 320, 1024 y 1280 px; solo dependencias gratuitas y autorizadas

**Scale/Scope**: multiusuario en una instalación local; mascotas sin límite por usuario; 6 módulos de registro histórico; 6 pantallas (login, registro, mis mascotas, hogar, ficha, respaldo); 96 identificadores vigentes en la compuerta de trazabilidad

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra `.specify/memory/constitution.md`. La columna «Evidencia» indica de dónde sale cada resultado: «ejecutado» son compuertas corridas durante la migración del 2026-11-09 sobre la rama de trabajo (antes la rama de trabajo); el resto es evidencia registrada y firmada en TASK-115.

| Compuerta | Regla | Resultado | Evidencia |
| :--- | :--- | :--- | :--- |
| Reloj y entropía solo por puertos | §3, reglas 1 y 2 | PASS | Ejecutado: `scripts/verify-traceability.sh`, 0 violaciones de pureza |
| `src/generated/` solo desde `contracts/` | §3, regla 3 | PASS | `checklists/code-review.md`, ítem 1 |
| Dependencia concéntrica entre capas | §3, regla 4 | PASS | `checklists/code-review.md`, ítem 3 |
| Puertos asíncronos y transaccionales | §3, regla 5 | PASS | `checklists/code-review.md`, ítem 4 |
| `process.env` solo en `src/infrastructure/config/` | §3, regla 6 | PASS | Ejecutado: `scripts/verify-traceability.sh`; `checklists/code-review.md`, ítem 5 |
| Trazabilidad del 100 % de los IDs vigentes | §4 y §5 | PASS | Ejecutado: 96/96 |
| Cero oráculos débiles | §5 | PASS | Ejecutado: `scripts/verify-oracles.sh`, 0 en 65 archivos |
| Cobertura de líneas y ramas ≥ 95 % | §5 | PASS | `checklists/oracle-validation.md`, ítem 7: 99,57 % y 99,70 % |
| Puntuación de mutación ≥ 85 % | §5 | PASS | `checklists/oracle-validation.md`, ítem 7: 99,69 % |
| Accesibilidad sin violaciones graves | §5 | PASS | `checklists/oracle-validation.md`, ítem 6 |
| Batería de seguridad | §5 y §6 | PASS | `checklists/oracle-validation.md`, ítem 8 |
| Stack autorizado | §2 | PASS con desviación registrada | DEUDA-DEP-001 (ver «Complexity Tracking») |
| Tipado estricto sin escapes | `checklists/code-review.md`, ítem 9 | Desviación aceptada | DEUDA-TIPADO-001 (ver «Complexity Tracking») |
| Estructura de repositorio | §7 | PENDIENTE | El árbol de Spec Kit queda autorizado cuando se apruebe la constitución v2.4.0 |

## Project Structure

### Documentation (this feature)

```text
specs/001-pet-health-tracker/
├── spec.md              # Especificación (SPEC-ARGOS-001)
├── plan.md              # Este archivo (PLAN-ARGOS-001)
├── research.md          # Decisiones técnicas registradas
├── data-model.md        # Entidades y ciclos de vida, con remisión a los contratos
├── quickstart.md        # Arranque local y validación de la compuerta
├── contracts/           # Índice de los contratos formales (viven en contracts/ de la raíz)
│   └── README.md
├── checklists/
│   ├── requirements.md      # Calidad de la spec según Spec Kit
│   ├── spec-review.md       # Compuerta Fase 1 -> Fase 2
│   ├── code-review.md       # Compuerta Fase 4
│   └── oracle-validation.md # Compuerta Fase 5
└── tasks.md             # Cola de tareas (TASKS-ARGOS-001)
```

### Source Code (repository root)

```text
contracts/                     # Fuente de verdad formal (entrada del generador)
├── schemas/                   # JSON Schema 2020-12
├── openapi/                   # OpenAPI 3.1
├── state-machines/            # Máquinas de estado
├── errors/                    # Catálogo de errores (RFC 9457)
└── examples/                  # Fixtures canónicos

src/
├── generated/                 # Derivado de contracts/ (api, errors, machines, schemas); no se edita a mano
├── domain/                    # Puro y síncrono: access, alerts, auth, backup, households, pet, records, shared, sorting
├── application/               # ports/ y use-cases/
├── infrastructure/            # adapters/, config/, http/ (plugins, routes), persistence/ (memory, sqlite)
└── presentation/web/          # SPA React: components/, pages/

tests/
├── unit/                      # Vitest (incluye unit/presentation)
├── property/                  # fast-check
├── integration/               # api, contracts, gates, persistence, presentation
├── security/                  # exploits/ y sast-rules/ (Semgrep)
├── e2e/                       # accessibility/ y visual/ (Playwright + axe-core)
├── mutation/                  # stryker.conf.json
└── fixtures/                  # Dobles y arneses compartidos

scripts/                       # compile-contracts.sh, codegen.mjs, verify-traceability.sh, verify-oracles.sh
```

**Structure Decision**: proyecto único por capas concéntricas (constitución §3, regla 4). Los contratos formales permanecen en `contracts/` de la raíz porque `scripts/compile-contracts.sh` los lee de ahí; `specs/001-pet-health-tracker/contracts/` solo contiene su índice, sin duplicar archivos. El diseño de cada capa sigue a continuación con la numeración del plan v2.2.0.

#### 1. Mapeo de Contratos a Capas (`contracts/` -> `src/`)

| Contrato Fuente | Artefacto Generado (`src/generated/`) | Herramienta | Consumidores |
| :--- | :--- | :--- | :--- |
| `contracts/schemas/identity.schema.json` | `schemas/identity.types.ts`, `schemas/identity.validators.js` + `.d.ts` | json-schema-to-typescript + Ajv standalone | domain/auth, domain/households, infrastructure, presentation (vía `src/generated/`) |
| `contracts/schemas/pet.schema.json` | `schemas/pet.types.ts`, `schemas/pet.validators.js` + `.d.ts` | idem | domain/pet, infrastructure, presentation |
| `contracts/schemas/medical-records.schema.json` | `schemas/medical-records.types.ts`, `schemas/medical-records.validators.js` + `.d.ts` | idem | domain/records, infrastructure, presentation |
| `contracts/schemas/backup-envelope.schema.json` | `schemas/backup.types.ts`, `schemas/backup.validators.js` + `.d.ts` | idem (incluye v1 legado) | application/use-cases (backup), infrastructure |
| `contracts/openapi/pet-tracker-api.openapi.yaml` | `api/openapi-types.ts`, `api/api-validators.js` + `.d.ts` (components.schemas), `api/client.ts` (cliente tipado) | openapi-typescript + Ajv + openapi-fetch | infrastructure/http, presentation/web, tests/integration |
| `contracts/state-machines/*.machine.json` | `machines/*.types.ts` + constantes de estados/transiciones | codegen.mjs (lee el JSON) | domain, application, presentation |
| `contracts/errors/error-catalog.json` | `errors/error-codes.ts` (`ErrorCode`, `ERROR_CATALOG`, `DomainError`) | codegen.mjs (lee el JSON) | todas las capas |

Reglas de generación (v2.2.0):
- **`problemDetailsSchema` es la única definición de `ProblemDetails`** (`contracts/errors/error-catalog.json`). El OpenAPI la referencia con `$ref` externo y no la duplica. TASK-102 verifica que openapi-typescript y Ajv resuelven esa referencia.
- **`x-sdd-error`** (anotación por campo en los JSON Schema, C1) se registra como keyword de metadatos en Ajv. El generador deriva el mapa campo→código; no existe tabla escrita a mano.
- **`multipleOfPrecision: 2`** en la configuración de Ajv (C6). El contrato no cambia.
- **Validadores `.js` ESM con `.d.ts`** emitidos por codegen, para compatibilidad con TypeScript estricto (C7).

`scripts/compile-contracts.sh` limpia `src/generated/` y lo regenera completo; la lista de contratos requeridos se obtiene listando `contracts/` (no fija a mano). Los `@implements` de los archivos generados se leen de `x-sdd-metadata.traceability` de cada contrato.

#### 2. Capa de Dominio (`src/domain/`) — pura, síncrona
- `shared/date-utils.ts`: aritmética ISO, `diffInCalendarDays`, `calculatePetAge` con regla de fin de mes / 29-feb (`REQ-PET-002`, `INV-PET-002`).
- `sorting/deterministic-sorter.ts`: `INV-SORT-001` y orden de `REQ-PET-005`.
- `pet/pet-invariants.ts`: `INV-PET-002`, `INV-PET-006`, `INV-OWN-001`.
- `records/record-invariants.ts`: `INV-REC-001..006`, `deltaKg` exacto en centésimas y `deltaPercent` con redondeo half-away-from-zero (`REQ-REC-001`, `REQ-UI-002`).
- `alerts/sanitary-alert-evaluator.ts`: `STATE-ALERT-001`.
- `access/access-policy.ts`: `INV-ACC-001`, `INV-ACC-002` como funciones puras `canRead(user, pet, memberships)` / `canWrite(user, pet)`.
- `auth/auth-policies.ts`: `INV-AUTH-002` (política), `INV-AUTH-004` (vigencia), `INV-AUTH-005` (ventana deslizante con reinicio en éxito), `STATE-AUTH-SESSION-001`.
- `households/household-policies.ts`: `INV-HOUSE-001..005` (orden y color por `firstJoinedAt`), `STATE-HOUSE-MEMBERSHIP-001` (tabla de transiciones generada).
- `backup/backup-migration.ts`: transformación pura v1.0.0 → v2.0.0.

#### 3. Capa de Aplicación (`src/application/`)
- **Puertos (`ports/`, todos asíncronos, `INV-ARCH-005`):** `ClockPort`, `IdGeneratorPort`, `SecureTokenPort`, `PasswordHasherPort`, `UserRepositoryPort`, `SessionRepositoryPort`, `LoginAttemptRepositoryPort`, `PetRepositoryPort`, `MedicalRecordRepositoryPort`, `HouseholdRepositoryPort`, `UnitOfWorkPort` (`runInTransaction`).
- **Login (`INV-AUTH-006`):** si el `username` no existe, `LoginUseCase` ejecuta `PasswordHasherPort.verify` contra un hash ficticio de igual coste. Los tests unitarios usan un hasher falso; el scrypt real se prueba en integración y seguridad.
- **Casos de uso (`use-cases/`):**
  - Auth: `RegisterUserUseCase`, `LoginUseCase`, `LogoutUseCase`, `GetCurrentSessionUseCase`, `AuthenticateRequestUseCase`.
  - Mascotas: `RegisterPetUseCase`, `UpdatePetUseCase`, `DeletePetUseCase`, `ListMyPetsUseCase`, `GetPetDashboardUseCase`.
  - Registros: `AddWeightRecordUseCase`, `AddBodyMeasurementUseCase`, `AddVaccinationUseCase`, `AddDewormingUseCase`, `AddMedicalVisitUseCase`, `AddCustomParameterUseCase`.
  - Hogares: `CreateHouseholdUseCase`, `InviteMemberUseCase`, `ListMyInvitationsUseCase`, `RespondInvitationUseCase`, `RemoveMemberUseCase`, `LeaveHouseholdUseCase`, `DeleteHouseholdUseCase`, `ListMyHouseholdsUseCase`, `GetHouseholdPetsUseCase`.
  - Respaldo: `ExportBackupUseCase`, `ImportBackupUseCase` (`STATE-BACKUP-001`; el rollback lo garantiza la transacción; el error original se preserva siempre).
  Todo caso de uso recibe el `userId` autenticado como primer argumento y aplica `access-policy` antes de cualquier lectura/escritura.

#### 4. Infraestructura (`src/infrastructure/`)
- `config/app-config.ts`: única lectura de `process.env` (`PORT`, `HOST=127.0.0.1`, `DATABASE_PATH`, `APP_TIMEZONE`, `COOKIE_SECURE`), validada con esquema (`INV-ARCH-006`).
- `adapters/`: `SystemClockAdapter` (zona `APP_TIMEZONE` vía `Intl.DateTimeFormat`), `FixedClockAdapter`, `CryptoUuidAdapter`, `DeterministicIdAdapter`, `CryptoSecureTokenAdapter`, `ScryptPasswordHasherAdapter` (incluye el hash ficticio de `INV-AUTH-006`).
- `persistence/memory/`: repositorios en memoria. **Se crean en TASK-108** (v2.2.0), porque los tests unitarios de casos de uso los necesitan antes de SQLite.
- `persistence/sqlite/`: repositorios `better-sqlite3`, `SqliteUnitOfWork`, `migrations/0001_init.sql` (tablas `users`, `sessions`, `login_attempts`, `pets`, 6 tablas de registros con `ON DELETE CASCADE`, `households`, `household_members` con `membershipId` y `firstJoinedAt`), runner de migraciones al arranque. Borrado de hogar en cascada (C5).
- `http/`: `server.ts` (Fastify, bind `127.0.0.1`), `routes/*.ts` (una por tag OpenAPI), `plugins/session-auth.ts`, `plugins/csrf-guard.ts` (orden de `§5.1` de la spec), `plugins/problem-details.ts` (mapea `DomainError` → RFC 9457 con `finalState` cuando aplica, oculta trazas), validación de request/response con los validadores generados, límite de cuerpo 10 MB en importación. Cookies con `@fastify/cookie`.
- Legado: `LocalStorageTransactionalRepository` se elimina.

#### 5. Presentación (`src/presentation/web/`)
- `main.tsx`, `App.tsx` (router con `react-router-dom`: `/login`, `/register`, `/pets`, `/pets/:petId`, `/households`, `/households/:householdId`).
- **Cliente API:** `src/generated/api/client.ts` (generado por codegen, C7). La presentación lo importa; no existe `api-client/` dentro de `presentation/`. Fetch con `credentials: 'include'` y cabecera `X-Argos-Request: 1`.
- Componentes: `AuthForms`, `ContextSwitcher`, `PetCardList` (filtros), `PetDashboard` (pestañas de 6 módulos + formularios), `WeightChart` (SVG), `AlertBadge`, `OwnerBadge` (`REQ-UI-007`; `colorToken` nulo fuera de hogar), `DeletePetDialog`, `HouseholdManager`, `InvitationsInbox`, `BackupPanel` (descargar/subir archivo).
- Estilos: Tailwind con tokens `owner-1..8` de contraste AA.

#### 6. Estrategia de Verificación (`tests/`)
- `unit/`: Vitest, cada `INV-*`, `STATE-*` y `ERR-*` de dominio y aplicación con repositorios en memoria, hasher falso y `FixedClockAdapter` (`2026-11-05`, `America/Bogota`).
- `property/`: fast-check (`seed: 20261105`), arbitrarios derivados de los esquemas: `INV-SORT-001`, `INV-REC-002/003`, `STATE-ALERT-001`, `REQ-PET-002`, `INV-ACC-001`, `INV-HOUSE-005`, atomicidad `INV-BACKUP-001`.
- `integration/contracts/`: `canonical-fixtures.json` contra validadores generados; respuestas reales de la API validadas contra el OpenAPI.
- `integration/api/`: Fastify `inject` + SQLite temporal: códigos HTTP, cookies, `problem+json`, cascada de borrado, importación v1/v2 con rollback byte a byte (pruebas de backup movidas aquí desde TASK-109), precedencia de `§5.1`.
- `security/exploits/`: IDOR, hogares ajenos, sin sesión, sesión expirada, CSRF, enumeración, enumeración por tiempo (`INV-AUTH-006`), bloqueo, XSS almacenado, prototype pollution y payload > 10 MB. `security/sast-rules/`: reglas Semgrep (fijadas por versión) que bloquean entropía/`process.env` fuera de capas permitidas y `dangerouslySetInnerHTML`.
- `e2e/visual/` y `e2e/accessibility/`: Playwright + axe-core sobre la app levantada con `webServer`, a 320 px, 1024 px y 1280 px, incluido el flujo de 2 usuarios y un hogar.
- `mutation/`: Stryker con `vitest-runner` y `checkers: ["typescript"]` sobre `src/domain/**` y `src/application/**`. Umbral `break: 85` (C9); la configuración la aplica TASK-103.
- **Compuerta por tarea (C8):** `verify-traceability.sh` acotado a los IDs de la columna de la tarea; la compuerta final (TASK-115) exige 100 % de los IDs vigentes.

## Detalles técnicos trasladados desde la spec

La spec v2.4.0 describe comportamiento, no tecnología. Los detalles que se retiraron de sus tablas quedan aquí, con su ubicación normativa:

| Detalle retirado de la spec | Dónde vive ahora |
| :--- | :--- |
| Fecha y hora de referencia inyectadas (antes `ClockPort`) | Constitución §3 (entropía aislada en puertos) y `src/application/ports/` |
| Generador de identificadores (antes `IdGeneratorPort`) | Constitución §3 |
| Verificador de contraseña y hash irreversible con sal (antes `PasswordHasherPort`, `scrypt`) | Constitución §6; verificación con hash ficticio de igual coste en D-108-2 (`tasks.md`) |
| Generador de token seguro (antes `SecureTokenPort`) | Constitución §6 |
| Credencial de sesión (antes cookie `argos_session`, `HttpOnly`, `SameSite=Strict`) | Constitución §6 y `contracts/schemas/identity.schema.json` |
| Marca de petición propia del cliente (antes cabecera `X-Argos-Request: 1`) | Constitución §6, regla 3; `contracts/openapi/pet-tracker-api.openapi.yaml` |
| Códigos HTTP de la tabla de errores | Campo de estado en `contracts/errors/error-catalog.json` |
| Formato de problema estándar (antes RFC 9457) | `contracts/errors/error-catalog.json` |
| Formato JSON del respaldo | `contracts/schemas/backup-envelope.schema.json` |
| Contrato de API (antes OpenAPI) | `contracts/openapi/pet-tracker-api.openapi.yaml` |
| Anotación de código de error por campo (antes `x-sdd-error`) | `contracts/openapi/pet-tracker-api.openapi.yaml` |

Los identificadores de la spec (`REQ-*`, `INV-*`, `STATE-*`, `ERR-*`) no cambian: solo cambia dónde se describe el detalle técnico.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Desviaciones abiertas, aceptadas por el Arquitecto y registradas en `tasks.md` («Deuda técnica registrada»).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| DEUDA-TIPADO-001: 3 `any` en `tests/unit/backup-use-cases.spec.ts` y 1 aserción no nula en `src/domain/backup/backup-migration.ts` (`checklists/code-review.md`, ítem 9) | Aceptada para no bloquear TASK-115 (H-115-6) | Corregirlo dentro de TASK-115 exigía tocar archivos fuera de su alcance; se cierra en la siguiente tarea de mantenimiento |
| DEUDA-DEP-001: `react-router-dom` 6.30.6 con 2 avisos moderados de `npm audit` en runtime | La corrección exige react-router 7 (H-115-8) | Es un cambio mayor del stack de la constitución §2; se cierra en una tarea propia de migración antes de la siguiente versión |
