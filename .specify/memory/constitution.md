<!--
SYNC IMPACT REPORT (3.3.0 -> 3.4.0, 2026-11-16)
==================
Version change: 3.3.0 -> 3.4.0
Bump rationale: MINOR, conforme al precedente de 3.3.0 (una dependencia nueva en Technology Stack).
  Autoriza `jose` 6.2.17 (versión exacta, ESM nativo para Node >= 22, cero dependencias) acotada a la
  verificación OIDC de la ruta /internal/maintenance. No retira ni redefine principios. Autorizada por
  Neo (Andrés Vallejo, Level 2), 2026-11-16, ratificada en la Logos (iteración 150); tarea T486.
Modified principles: ninguno.
Modified sections: Technology Stack & Repository Structure (Dependencias autorizadas).
Added/Removed sections: ninguna.
Follow-up TODOs: ninguno.
-->

<!--
SYNC IMPACT REPORT (3.2.0 -> 3.3.0, 2026-11-15)
==================
Version change: 3.2.0 -> 3.3.0
Bump rationale: MINOR. La Feature 003 (Argos en la nube, GCP Free Tier) amplía el catálogo de
  adaptadores (II.4), la tecnología autorizada (Technology Stack) y una condición de
  configuración (II.6). No retira ni redefine principios. Firmada por Neo (Level 2), 2026-11-15
  (tarea T403; borrador en .specify/memory/audits/enmienda-constitucion-003-borrador.md).
Modified principles: II.4 (adaptador PostgreSQL), II.6 (HOST=0.0.0.0 bajo D-26).
Modified sections: Technology Stack & Repository Structure (fase Cloud, dependencias pg,
  @types/pg, @fastify/static, esbuild, Terraform 1.17.2, google 7.46.2, WIF, CI sobre develop).
Added/Removed sections: ninguna.
Follow-up TODOs: relajar tests/unit/app-config.spec.ts:59 es Nivel 3 (firma de Neo aparte).
-->

<!--
SYNC IMPACT REPORT
==================
Version change: 3.1.0 -> 3.2.0
Bump rationale: MINOR. La Feature 002 incorpora sus identificadores formales (requisitos,
  invariantes, máquinas de estado y catálogo de errores) al Principio III con una fuente de verdad
  por feature. No redefine los principios I a VI; se trata como MINOR conforme a la enmienda
  ratificada por Neo (Andrés Vallejo, Nivel 2) el 2026-11-14.

Modified principles:
  - III. Trazabilidad Verificable por Máquina: fuentes de verdad por feature (001 y 002), listado
    completo de IDs de la 002, máquinas de estado actualizadas, catálogo de errores de la 002 y
    declaración de IDs reemplazados y dados de baja.
Modified sections: ninguna.
Added sections: ninguna.
Removed sections: ninguna.

Templates reviewed for alignment:
  - .specify/templates/{plan,spec,tasks,checklist,constitution}-template.md: sin referencias a
    DOG | CAT, 7 días ni a los tres anchos; sin cambios.
  - spec-system.md: sin referencias a los valores antiguos; sin cambios.
  - scripts/verify-traceability.sh: verifica compuertas multi-feature 001 y 002; sin cambios.

Follow-up TODOs:
  - Versión 3.2.0 firmada por Andrés Vallejo (Nivel 2) el 2026-11-14 (tarea T204a).
-->

# Proyecto Argos Constitution

Esta constitución define las reglas técnicas y operativas no negociables del Proyecto Argos (Pet
Health & Biometric Tracker). Ningún plan, tarea o línea de código de `src/` o `tests/` puede
contradecirla.

## Core Principles

### I. Especificación y Contratos como Fuente de Verdad

- Las especificaciones (`specs/<NNN-feature>/spec.md`) y los contratos formales
  (`specs/<NNN-feature>/contracts/`) son la fuente de verdad. El código de `src/` es un derivado.
- Si la prosa de una especificación y un contrato formal difieren, prevalece el contrato y la
  ejecución se detiene hasta reconciliarlos.
- Está prohibido implementar código sin una tarea de `specs/<NNN-feature>/tasks.md` vinculada a un
  plan (`plan.md`), a contratos compilados hacia `src/generated/` y a una especificación validada.
- Una regresión de implementación se corrige en `src/`, nunca en la especificación ni en el
  contrato. Un defecto de especificación o un caso de negocio nuevo se escribe primero en `spec.md`
  y en los contratos, se regenera `src/generated/`, se ajustan `plan.md` y `tasks.md`, y solo
  entonces se modifica `src/`.
- Todo contrato se versiona con SemVer. Un cambio incompatible (MAJOR) exige estrategia de
  migración explícita y autorización humana previa.

**Rationale**: evita la deriva entre lo que se especifica y lo que se construye.

### II. Determinismo Total y Aislamiento de Entropía (NON-NEGOTIABLE)

1. **Prohibición de Reloj Global (`INV-ARCH-001`):** prohibido `new Date()`, `Date.now()` o `performance.now()` en `src/domain/` y `src/application/`. Todo cálculo temporal (edad, fechas futuras, alertas, expiración de sesión, bloqueo de login) recibe `ClockPort`:
   - `interface ClockPort { todayIsoDate(): string; nowIsoTimestamp(): string; }`
   - `todayIsoDate()` devuelve la fecha calendario en la zona horaria configurada (`APP_TIMEZONE`, por defecto `America/Bogota`). `nowIsoTimestamp()` devuelve UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ`.
2. **Prohibición de Entropía Directa (`INV-ARCH-002`):** prohibido `Math.random()`, `crypto.randomUUID()`, `crypto.randomBytes()` o equivalentes en `src/domain/` y `src/application/`. Se inyectan:
   - `interface IdGeneratorPort { nextId(): string; }` (UUID v4)
   - `interface SecureTokenPort { nextSessionToken(): string; }`
   - `interface PasswordHasherPort { hash(plain: string): Promise<string>; verify(plain: string, hash: string): Promise<boolean>; }`
3. **Inmutabilidad de `src/generated/` (`INV-ARCH-003`):** todo artefacto de contrato reside en `src/generated/` y proviene exclusivamente de `scripts/compile-contracts.sh`. Prohibida la edición manual.
4. **Regla de Dependencia Concéntrica (`INV-ARCH-004`):**
   - `src/domain/` depende únicamente de `src/generated/`.
   - `src/application/` depende únicamente de `src/domain/` y `src/generated/`, y define los puertos.
   - `src/infrastructure/` implementa los puertos (persistencia SQLite/memoria/PostgreSQL, HTTP Fastify, hashing, tokens, reloj, configuración) y valida en runtime contra `src/generated/` en toda frontera.
   - El adaptador PostgreSQL reside en `src/infrastructure/persistence/postgres/`, se elige por `ARGOS_DB_DRIVER` (`sqlite` por defecto) y debe pasar la misma suite de conformidad de repositorios que memoria y SQLite (REQ-PG-001..005, SC-CLD-002). `src/domain/` y `src/application/` no cambian (NFR-CLD-009).
   - `src/presentation/` consume la API HTTP mediante un cliente tipado generado del contrato OpenAPI y tipos de `src/generated/`. Prohibidas reglas de negocio o aritmética de fechas en componentes.
5. **Puertos asíncronos y listos para Cloud (`INV-ARCH-005`):** todos los puertos de repositorio devuelven `Promise` y exponen una operación transaccional `runInTransaction(fn)`. Sustituir SQLite local por la base de datos Cloud no puede requerir cambios en `domain/` ni `application/`.
6. **Configuración aislada (`INV-ARCH-006`):** `process.env` solo puede leerse en `src/infrastructure/config/`, validado contra un esquema. Ningún secreto se versiona; existe `.env.example` sin valores sensibles. `HOST` es `127.0.0.1` por defecto. Se admite `HOST=0.0.0.0` únicamente con `NODE_ENV=production` o `ARGOS_DB_DRIVER=postgres` (D-26 de la feature 003), tras el frontal HTTPS de Cloud Run (`trustProxy`) con `COOKIE_SECURE=true` y `PORT` inyectado por la plataforma; el esquema de configuración en `src/infrastructure/config/` rechaza `::`, `localhost`, `10.x` y el valor vacío. `DATABASE_URL` nunca se registra ni se devuelve (REQ-CLD-003, REQ-SEC-002, REQ-SEC-003).

**Rationale**: el mismo dato y la misma fecha deben producir siempre el mismo resultado, en local,
en CI y en Cloud.

### III. Trazabilidad Verificable por Máquina

Fuente de verdad de los identificadores, por feature: Feature 001: `specs/001-pet-health-tracker/spec.md` y los contratos de `specs/001-pet-health-tracker/contracts/`. Feature 002: `specs/002-plataforma-v21/spec.md` y los contratos de `specs/002-plataforma-v21/contracts/`. Común a ambas: los `INV-ARCH-*` del principio II. La compuerta se ejecuta por feature (`scripts/verify-traceability.sh --feature 001|002`); un identificador que una feature declara «reemplazado» deja de ser vigente para esa feature y sigue vigente para la anterior mientras esta se mantenga en la compuerta.

**Feature 001**

- **Requisitos:** `REQ-AUTH-001`..`004`, `REQ-PET-001`..`005`, `REQ-REC-001`..`006`, `REQ-HOUSE-001`..`005`, `REQ-UI-001`..`007`, `REQ-BACKUP-001`..`002`.
- **Invariantes:** `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-AUTH-001`..`007`, `INV-HOUSE-001`..`005`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
- **Máquinas de Estado:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`.
- **Errores:** todos los códigos de `specs/001-pet-health-tracker/contracts/errors/error-catalog.json`.

**Feature 002**

- **Requisitos nuevos o que reemplazan:** `REQ-AUTH2-001`..`003`, `REQ-ACC-001`, `REQ-ACC-002`, `REQ-TIME-001`, `REQ-PET2-001`..`003`, `REQ-OWN-001`, `REQ-REC2-001`..`003`, `REQ-RBAC-001`, `REQ-HOUSE2-001`..`004`, `REQ-MIG-001`, `REQ-AUD-001`, `REQ-BACKUP2-001`..`002`, `REQ-UI2-001`..`008`.
- **Requisitos de la 001 que siguen vigentes:** `REQ-AUTH-003`, `REQ-AUTH-004`, `REQ-PET-002`, `REQ-PET-004`, `REQ-REC-002`, `REQ-REC-005`, `REQ-REC-006`, `REQ-HOUSE-001`, `REQ-HOUSE-003`, `REQ-UI-001`, `REQ-UI-002`, `REQ-UI-003`, `REQ-UI-005`.
- **Invariantes nuevas o que reemplazan:** `INV-AUTH2-001`, `INV-AUTH2-002`, `INV-PET2-001`, `INV-REC2-002`, `INV-OWN2-001`, `INV-ACC2-001`, `INV-ACC2-002`, `INV-HOUSE2-001`, `INV-AUD-001`.
- **Invariantes de la 001 que siguen vigentes:** `INV-AUTH-001`, `INV-AUTH-003`, `INV-AUTH-005`, `INV-AUTH-006`, `INV-AUTH-007`, `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-HOUSE-003`, `INV-HOUSE-004`, `INV-HOUSE-005`, `INV-REC-001`, `INV-REC-003`, `INV-REC-004`, `INV-REC-005`, `INV-REC-006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
- **Máquinas de Estado:** `STATE-AUTH-SESSION-001` (v3.0.0), `STATE-HOUSE-MEMBERSHIP-001` (v3.0.0), `STATE-ALERT-001` (v2.1.0), `STATE-BACKUP-001` (v2.3.0) y `STATE-ACCOUNT-DELETE-001` (nueva, aprobada por Neo).
- **Errores:** todos los códigos de `specs/002-plataforma-v21/contracts/errors/error-catalog.json` (35 entradas). Entran 7 códigos nuevos: `ERR-ACCOUNT-CONFIRMATION-MISMATCH`, `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`, `ERR-ACCOUNT-OWNS-SHARED-PETS`, `ERR-OWN-TRANSFER-INVALID-TARGET`, `ERR-REC-SUPERSEDED-IMMUTABLE` y los dos aprobados por Neo, `ERR-PET-MICROCHIP-DUPLICATE` y `ERR-RATE-LIMITED`.
- **IDs reemplazados por la 002 (vigentes solo para la compuerta de la 001):** `REQ-AUTH-001`, `REQ-AUTH-002`, `REQ-PET-001`, `REQ-PET-003`, `REQ-PET-005`, `REQ-REC-001`, `REQ-REC-003`, `REQ-REC-004`, `REQ-HOUSE-002`, `REQ-HOUSE-004`, `REQ-HOUSE-005`, `REQ-BACKUP-001`, `REQ-BACKUP-002`, `REQ-UI-004`, `REQ-UI-006`, `REQ-UI-007`, `INV-AUTH-002`, `INV-AUTH-004`, `INV-REC-002`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-HOUSE-001` e `INV-HOUSE-002` (esta última absorbida por `REQ-HOUSE2-001` y `REQ-HOUSE2-002`).
- **IDs retirados (no deben aparecer en código nuevo):** `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`, `ERR-PET-QUOTA-EXCEEDED`. Se añaden, con efecto desde que el código de la 001 los deje de usar (tarea T220 de la 002): `ERR-AUTH-USER-NOT-FOUND` y `ERR-HOUSE-MEMBER-ALREADY-EXISTS`, retirados del catálogo de la 002 porque invitar es uniforme.

Cada función o clase de `src/` incluye en su JSDoc los identificadores que implementa (`@implements ...`), y cada `it`/`test` de `tests/` incluye entre corchetes el identificador que verifica. La trazabilidad cuenta como cumplida **solo** si el identificador aparece en un `@implements` de `src/` fuera de `src/generated/` **y** en el título de un `it`/`test` de `tests/`. Los `SC-*` de una spec son criterios de aceptación: se citan en `tasks.md` y se revisan a mano, el script no los exige.

**Rationale**: permite auditar por script, sin interpretación, que lo especificado está implementado y probado, ahora para las dos features con una sola fuente de reglas.

### IV. Test Gate con Umbrales Fijos (NON-NEGOTIABLE)

Ninguna tarea se cierra sin pasar su compuerta. Las pruebas no se eliminan, no se comentan y no se relajan para obtener un resultado en verde.

- **Herramientas oficiales obligatorias (prohibidos los sustitutos propios que las emulen):** Vitest 2 con `@vitest/coverage-v8` para unitarias, propiedades e integración; fast-check 3 con `seed: 20261105`; Stryker Mutator con `@stryker-mutator/vitest-runner` (`tests/mutation/stryker.conf.json`); Playwright con `@axe-core/playwright` contra la aplicación real levantada (API + SPA).
- **Cobertura de trazabilidad:** 100 % de los identificadores vigentes del principio III en la compuerta final; en cada tarea, 100 % de los identificadores citados en su línea de `tasks.md` (`scripts/verify-traceability.sh --task T###`).
- **Cobertura de líneas y ramas en `src/domain/` y `src/application/`:** mínimo 95 %, medida por Vitest.
- **Mutation score:** mínimo 85 % en `src/domain/` y `src/application/` (umbral `break` de Stryker = 85), medido por Stryker en CI.
- **Cero oráculos débiles:** prohibido `toBeDefined()`, `toBeTruthy()`, `toBeFalsy()`, `not.toBeNull()` o `toThrow()` sin argumento como aserción principal; verificado por `scripts/verify-oracles.sh`.
- **Accesibilidad:** cero violaciones `critical`/`serious` de axe-core en todas las pantallas (login, registro, mis mascotas, hogar, ficha, respaldo, cuenta) a 320 px, 768 px, 1024 px y 1280 px.
- **Seguridad:** `tests/security/` cubre al menos: acceso cruzado entre usuarios (IDOR), acceso a hogares ajenos, rutas sin sesión, sesión expirada, CSRF, enumeración de usuarios en login y tiempo de respuesta uniforme (`INV-AUTH-006`), XSS almacenado en campos de texto e importación de respaldo maliciosa (prototype pollution, tamaño excesivo).
- **CI reproducible:** `.github/workflows/test-gate.yml` pasa desde un checkout limpio con `npm ci` (lockfile versionado) en Node 22.

**Rationale**: una compuerta que se puede rebajar deja de medir.

### V. Seguridad y Privacidad por Defecto

1. Las contraseñas nunca se almacenan en claro, nunca se registran en logs, nunca se devuelven en respuestas ni se incluyen en respaldos (`INV-AUTH-003`).
2. Los errores de login son genéricos (`ERR-AUTH-INVALID-CREDENTIALS`) para impedir la enumeración de usuarios.
3. Toda petición que modifica estado exige sesión válida y la cabecera `X-Argos-Request: 1` (defensa CSRF junto a `SameSite=Strict`).
4. Un usuario sin permiso de lectura sobre una mascota u hogar recibe `404` (no `403`) para no revelar su existencia.
5. Las respuestas de error siguen RFC 9457 (`application/problem+json`) y nunca incluyen trazas internas.
6. Ningún usuario ve datos de otro si no existe una membresía `ACTIVE` compartida en un hogar, aceptada explícitamente por el invitado.

**Rationale**: el sistema guarda datos personales de varios usuarios en una misma instalación.

### VI. Stack Autorizado y Estructura de Repositorio Estándar

El stack tecnológico y el árbol de carpetas son los de la sección «Technology Stack & Repository Structure». Añadir o actualizar una dependencia, crear una carpeta fuera del árbol, o cambiar contratos, CI, scripts de verificación o umbrales de mutación requiere autorización humana previa (Nivel 2). Solo se admiten dependencias y servicios gratuitos; cualquier opción de pago requiere una autorización nueva.

**Rationale**: mantiene reproducible el entorno y acotado el coste de mantenimiento.

## Technology Stack & Repository Structure

**Sistema.** Argos es una plataforma web multiusuario y determinista para administrar el expediente clínico, físico y sanitario de mascotas (`CANINE` | `FELINE` | `RABBIT` | `FERRET` | `BIRD` | `REPTILE` | `SMALL_MAMMAL` | `OTHER`; `speciesOther` obligatorio con `OTHER`; migración de la 001: `DOG` → `CANINE`, `CAT` → `FELINE`) sin límite de cantidad. Cada mascota tiene exactamente un Propietario Legal (`ownerUserId`), que decide a qué hogares la asigna; un usuario solo gestiona por sí mismo sus mascotas y las que un hogar le permite según su rol. Un usuario puede crear hogares e invitar a otros con un rol por membresía (Administrador, Cuidador o Lector; el propietario del hogar es siempre Administrador). Los miembros activos de un hogar ven únicamente las mascotas asignadas a ese hogar, siempre con su Propietario Legal identificado, y lo que pueden hacer sobre ellas lo decide su rol mediante una matriz de permisos; solo el Propietario Legal transfiere la propiedad o elimina la mascota. Las alertas sanitarias se calculan con máquinas de estados finitos y el respaldo y la restauración por usuario son atómicos.

**Fases de despliegue.** En la fase actual, API y web se ejecutan en el computador del arquitecto (`127.0.0.1`) con una base SQLite en archivo local, sin exposición a la red. En la fase Cloud se sustituyen únicamente adaptadores de `src/infrastructure/` (persistencia, configuración, cookies `Secure`); `src/domain/` y `src/application/` no cambian (`INV-ARCH-005`).

**Fase Cloud (feature 003).** Contenedor único en Google Cloud Run (`us-central1`), PostgreSQL en Neon (`aws-us-east-2`, creado a mano), Artifact Registry, Secret Manager, Cloud Scheduler (un job de mantenimiento), Cloud Storage (exports, `us-central1`) y Cloud Logging nativo; costo objetivo 0 USD/mes dentro del Free Tier, con alarma preventiva de 1 USD. Infraestructura como código con Terraform 1.17.2 y proveedor `hashicorp/google` 7.46.2 (versiones exactas, `.terraform.lock.hcl` versionado) en `terraform/`, propio y desacoplado de Mirror, con estado en bucket versionado `argos-<project>-tfstate`, secretos por `TF_VAR_*` y autenticación de CI por Workload Identity Federation (WIF), sin llaves JSON fijas. CI/CD en GitHub Actions (infraestructura, despliegue con migración previa, auto-PR) sobre la rama de integración `develop`. Ningún agente ejecuta `terraform apply` ni `gcloud` mutante. SQLite sigue siendo el valor por defecto local; PostgreSQL es el adaptador de la fase Cloud; Firestore queda descartado.

**Stack.**

- **Lenguaje y compilador:** TypeScript 5.x (fijado `~5.6`; prohibido TS 6/7) con `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` y `noImplicitReturns: true`. `src/` y `tests/` compilan con `tsc --noEmit` sin errores (incluye `@types/node`).
- **Runtime:** Node.js 22 LTS, idéntico en local y CI. Versión exacta: `.nvmrc` = `22.23.4`; `engines` en `package.json` = `>=22.18 <23`.
- **Frontend (SPA):** Vite 5 + React 18 + Tailwind CSS 3, con JSX real. Punto de entrada `index.html` → `src/presentation/web/main.tsx`.
- **Backend local (API HTTP):** Fastify 5 en `src/infrastructure/http/`, escuchando en `127.0.0.1:3000` por defecto (`HOST=0.0.0.0` solo bajo las condiciones del Principio II.6). En desarrollo, Vite hace proxy de `/api` hacia el servidor. Un único comando (`npm run dev`) levanta API y web.
- **Persistencia:** SQLite en archivo local (`./data/argos.sqlite`, ignorado por git) mediante `better-sqlite3`, detrás de puertos de repositorio. Migraciones SQL versionadas y aplicadas al arranque en `src/infrastructure/persistence/sqlite/migrations/`. Adaptador en memoria para pruebas unitarias y de propiedades.
- **Autenticación:** hash de contraseñas con `scrypt` de `node:crypto` (N=2^15, r=8, p=1, salt 16 bytes, keylen 64). Sesiones opacas de 32 bytes (base64url) almacenadas en la base solo como SHA-256, entregadas en cookie `argos_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` obligatorio en Cloud). La sesión expira a las 24 horas absolutas desde su creación o a los 30 minutos sin actividad, lo que ocurra primero; recargar la página dentro de la vigencia no la cierra.
- **Generación desde contratos (real, no plantillas):** `scripts/compile-contracts.sh` deriva de `specs/<NNN-feature>/contracts/`: validadores runtime con Ajv 8 en modo standalone y `ajv-formats` desde `schemas/` y los `components.schemas` de `openapi/`; tipos estáticos con `json-schema-to-typescript` y `openapi-typescript`; catálogo de errores y tipos de máquinas de estado leídos de `errors/` y `state-machines/`. Cambiar un valor en un contrato debe cambiar `src/generated/`. Prohibido escribir reglas de validación a mano en plantillas del generador.
- **Dependencias autorizadas:** TypeScript `~5.6`, Node 22, Vite 5, React 18, Tailwind 3, Fastify 5, `better-sqlite3`, `pg` y `@types/pg` (adaptador PostgreSQL), `@fastify/static`, `esbuild` (empaquetado de la imagen), Ajv 8 (standalone) con `ajv-formats`, `json-schema-to-typescript`, `openapi-typescript`, `openapi-fetch`, Vitest 2, `@vitest/coverage-v8`, fast-check 3, Stryker con `@stryker-mutator/vitest-runner` y `@stryker-mutator/typescript-checker`, Playwright con `@axe-core/playwright`, `@types/node`, `@fastify/cookie`, `react-router-dom`, `yaml` (solo si el generador lo importa), `tsx` y `concurrently` (solo desarrollo), `@vitejs/plugin-react`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom` y `@types/better-sqlite3`. SAST en CI con Semgrep fijado por versión, sin dependencia npm. La feature 003 añade `pg`, `@types/pg`, `@fastify/static` y `esbuild` con versión exacta fijada al implementar y verificación de `/merovingian`; `hadolint`, `actionlint` y `trivy` solo en CI, sin dependencia npm. La feature 003 añade además `jose` en la versión exacta `6.2.17` (sin `^` ni `~`; ESM nativo para Node >= 22, cero dependencias), **acotada exclusivamente a la verificación OIDC de la ruta `/internal/maintenance`** (`src/infrastructure/http/oidc-verify.ts`, JWKS de Google; validación de `iss`, `exp`, `aud` y `email_verified`; tarea T486); no se importa desde `src/domain/` ni `src/application/` y cualquier otro uso requiere una autorización nueva (Nivel 2). Autorizada por Neo (Level 2), 2026-11-16.

**Estructura del repositorio.**

- **Cloud (feature 003):** `terraform/`, `Dockerfile`, `.dockerignore`, `src/infrastructure/persistence/postgres/` y `scripts/migrate-postgres.ts`.
- **Capa SDD (GitHub Spec Kit):** `.specify/memory/constitution.md`, `.specify/templates/`, `.specify/scripts/`, `.specify/extensions/`, `.specify/workflows/`, `.specify/integrations/`, los archivos de estado de `.specify/` y `specs/<NNN-feature>/` con `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/` y `checklists/`.
- **Código:** `src/generated/`, `src/domain/`, `src/application/`, `src/infrastructure/` y `src/presentation/`, con subcarpetas por responsabilidad siempre dentro de la capa correcta.
- **Pruebas:** `tests/unit/`, `tests/property/`, `tests/integration/`, `tests/security/`, `tests/e2e/`, `tests/mutation/` y `tests/fixtures/`. Los auxiliares compartidos de prueba van en `tests/fixtures/`.
- **Raíz:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `.gitignore`, `.nvmrc`, `.env.example`, `README.md`, `spec-system.md` y `CLAUDE.md`.
- **Scripts:** `scripts/compile-contracts.sh`, `scripts/codegen.mjs` (invocado solo por el anterior), `scripts/verify-traceability.sh` y `scripts/verify-oracles.sh`.

Queda prohibido crear carpetas fuera de este árbol. Toda carpeta vacía del árbol conserva su `.gitkeep`.

## Development Workflow & Quality Gates

- **Flujo.** Cada feature recorre `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` → `/speckit-converge`, y deja sus artefactos en `specs/<NNN-feature>/`.
- **Contratos antes que código.** Tras un cambio aprobado en `specs/<NNN-feature>/contracts/` se ejecuta `bash scripts/compile-contracts.sh`; `src/` consume solo los tipos y validadores de `src/generated/`.
- **Compuerta.** `npm run test:gate` ejecuta, en orden y deteniéndose en el primer fallo: compilación de contratos, `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh`, `tsc --noEmit`, `vitest run --coverage`, Stryker y Playwright.
- **Checklists.** `specs/<NNN-feature>/checklists/` es la compuerta de `/speckit-implement`. El agente adjunta evidencia verificable por ítem; no marca un ítem sin ella.
- **Niveles de autonomía.** Nivel 1 (siempre): leer esta constitución y `spec-system.md` antes de generar especificaciones, contratos, planes o código. Nivel 2 (preguntar antes): cambios de contratos, de persistencia o migraciones, de dependencias, de CI, de scripts de verificación o de umbrales, y el paso de un artefacto a `Approved` o `Locked`. Nivel 3 (nunca): secretos en texto plano, edición manual de `src/generated/`, entropía directa en `src/domain/` o `src/application/`, y eliminar o relajar pruebas. El detalle operativo de cada nivel está en `spec-system.md`.

## Governance

Esta constitución prevalece sobre cualquier plan, tarea o línea de código.

- **Autoridad.** Los principios I a VI son compuertas obligatorias. La sección «Constitution Check» de cada `plan.md` se evalúa contra ellos y `/speckit-analyze` trata un conflicto con ellos como crítico. Un conflicto se resuelve cambiando la especificación, el plan o las tareas, no rebajando el principio.
- **Enmiendas.** Todo cambio de este documento requiere autorización humana previa (Nivel 2), se hace con `/speckit-constitution`, actualiza la línea de versión y se resume en el Sync Impact Report de la cabecera. Una enmienda se propaga en el mismo cambio a las plantillas y a `spec-system.md` cuando les afecta.
- **Versionado.** SemVer: MAJOR para un cambio incompatible de gobernanza o la retirada o redefinición de un principio; MINOR para un principio o una sección nuevos; PATCH para aclaraciones sin cambio de alcance.
- **Estado de los artefactos.** `spec.md` declara su estado en la línea `**Status**` (`Draft` → `Review` → `Approved` → `Locked`); `plan.md` y `tasks.md` siguen el estado de la especificación de su feature. El historial de cada artefacto es el de git. Ninguna fase posterior se inicia con una especificación fuera de `Approved` o `Locked`.
- **Autoridad humana.** Solo el arquitecto humano (Andrés Vallejo, Nivel 2) pasa un artefacto a `Approved` o `Locked`, firma los checklists, da por completada una tarea y autoriza `git push`. El agente ejecuta la compuerta y adjunta evidencia.
- **Revisión de cumplimiento.** Toda revisión verifica el cumplimiento de estos principios. Una desviación aceptada se registra con responsable y condición de cierre en «Complexity Tracking» del plan y como tarea abierta en `tasks.md`.
- **Guía operativa.** `spec-system.md` y `CLAUDE.md` son la guía de ejecución para agentes; ante una diferencia con este documento prevalece la constitución.

**Version**: 3.4.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-16

Versión 3.3.0 firmada por Andrés Vallejo (Nivel 2) el 2026-11-15 (tarea T403). Firmada por Neo (Level 2), 2026-11-15.

Versión 3.4.0 (`jose` 6.2.17, acotada a la verificación OIDC de `/internal/maintenance`) autorizada por Andrés Vallejo (Nivel 2) el 2026-11-16 (tarea T486).
