---
document_id: CONSTITUTION-ARGOS-001
version: 2.3.0
status: LOCKED
last_updated: 2026-11-05
supersedes: 2.2.0
change_type: MINOR
change_summary: >
  v2.3.0: autorización nueva de `@vitest/coverage-v8` (proveedor de cobertura de Vitest 2, gratuito; condición: solo dependencias y servicios gratuitos) por Andrés el 2026-11-05 (H-03). Se retira 'pendiente de firma formal' del stack (ya firmado por Andrés, D-10) y se fija la versión exacta de Node (`.nvmrc` 22.23.4; `engines` >=22.18 <23), aceptada por el Auditor en TASK-101.
  v2.2.0: autorización explícita del stack de §2 (incluido `@types/node`) y de la lista de dependencias adicionales, por luz verde de Andrés (Nivel 2) el 2026-11-05 (D-10).
  Eliminación del cupo fijo de mascotas (2 perros / 2 gatos), incorporación de cuentas de usuario
  (registro/login), hogares compartidos, servidor API local con SQLite preparado para migración Cloud,
  generación real de validadores desde contratos y toolchain de pruebas oficial (sin harness propio). v2.1.0: dependencias adicionales autorizadas (§2), umbral de mutación de 85 % (§5), compuerta por tarea (§5) e INV-AUTH-006 (§4).
approved_by: Andrés Vallejo, 2026-11-05
---

# CONSTITUCIÓN ARQUITECTÓNICA — PROYECTO ARGOS (PET HEALTH TRACKER)

Esta Constitución define las invariantes técnicas, tecnológicas y operativas no negociables del **Proyecto Argos**. Ningún plan, tarea o línea de código en `src/` o `tests/` puede contradecir este documento.

## 1. DEFINICIÓN Y PROPÓSITO DEL SISTEMA
Argos es una plataforma web **multi-usuario** y determinista para administrar el expediente clínico, físico y sanitario de mascotas (`DOG` | `CAT`) **sin límite de cantidad**. Garantiza:
- **Propiedad individual:** cada mascota pertenece exactamente a un usuario (`ownerUserId`); cada usuario gestiona solo lo suyo.
- **Hogares compartidos:** un usuario puede crear hogares e invitar a otros usuarios; los miembros activos de un hogar ven las mascotas de todos los miembros, siempre distinguiendo visualmente a su dueño. Solo el dueño puede modificar una mascota y sus registros.
- Alertas sanitarias calculadas mediante máquinas de estados finitos y respaldo/restauración atómica en JSON por usuario.

### 1.1 Fases de despliegue
- **Fase actual — Local:** API y web se ejecutan en el computador del arquitecto (`127.0.0.1`), con base de datos en un archivo SQLite local. No se expone a la red.
- **Fase futura — Cloud:** se migrará a la plataforma Cloud del arquitecto **sustituyendo únicamente adaptadores de `src/infrastructure/`** (persistencia, configuración, cookies `Secure`). `src/domain/` y `src/application/` no deben requerir cambios para esa migración (`INV-ARCH-005`).

## 2. STACK TECNOLÓGICO INMUTABLE
- **Lenguaje y Compilador:** TypeScript **5.x** (fijado `~5.6`; prohibido TS 6/7) con `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitReturns: true`. `src/` y `tests/` deben compilar con `tsc --noEmit` sin errores (incluye `@types/node`).
- **Runtime:** Node.js **22 LTS**, idéntico en local y CI. Versión exacta: `.nvmrc` = `22.23.4`; `engines` en `package.json` = `>=22.18 <23` (TASK-101).
- **Frontend (SPA):** Vite 5 + React 18 + Tailwind CSS 3, con JSX real. Punto de entrada `index.html` → `src/presentation/web/main.tsx`.
- **Backend local (API HTTP):** Fastify 5 en `src/infrastructure/http/`, escuchando en `127.0.0.1:3000`. En desarrollo, Vite hace proxy de `/api` hacia el servidor. Un único comando (`npm run dev`) levanta API + web.
- **Persistencia:** SQLite en archivo local (`./data/argos.sqlite`, ignorado por git) mediante `better-sqlite3`, detrás de puertos de repositorio. Migraciones SQL versionadas y aplicadas al arranque en `src/infrastructure/persistence/migrations/`. Adaptador en memoria para pruebas unitarias y de propiedades.
- **Autenticación:** hash de contraseñas con `scrypt` de `node:crypto` (N=2^15, r=8, p=1, salt 16 bytes, keylen 64). Sesiones opacas de 32 bytes (base64url) almacenadas en BD solo como SHA-256, entregadas en cookie `argos_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` obligatorio en Cloud). TTL 7 días.
- **Generación desde contratos (real, no plantillas):** `scripts/compile-contracts.sh` debe **derivar** de `contracts/`:
  - Validadores runtime con **Ajv 8 en modo standalone** + `ajv-formats` desde `contracts/schemas/` y los `components.schemas` de `contracts/openapi/`.
  - Tipos estáticos con `json-schema-to-typescript` (schemas) y `openapi-typescript` (API).
  - Catálogo de errores y tipos de máquinas de estado leídos de `contracts/errors/` y `contracts/state-machines/`.
  Cambiar un valor en un contrato **debe** cambiar `src/generated/`. Prohibido escribir reglas de validación a mano en plantillas del generador.
- **Suite de Pruebas (The Test Gate) — herramientas oficiales obligatorias, prohibidos harness propios que las emulen:**
  - Unitarias, propiedades e integración: **Vitest 2** (cobertura `@vitest/coverage-v8`).
  - Property-Based Testing: **fast-check 3** con `seed: 20261105`.
  - Mutación: **Stryker Mutator** con `@stryker-mutator/vitest-runner` (`tests/mutation/stryker.conf.json`).
  - E2E, visual y accesibilidad: **Playwright** + **`@axe-core/playwright`** contra la aplicación real levantada (API + SPA).
- **Stack autorizado explícitamente (v2.2.0, Nivel 2, Andrés, firmado 2026-11-05):** TypeScript `~5.6`, Node 22, Vite 5, React 18, Tailwind 3, Fastify 5, better-sqlite3, Ajv 8 (standalone) con ajv-formats, json-schema-to-typescript, openapi-typescript, openapi-fetch, Vitest 2, fast-check 3, Stryker, Playwright con @axe-core/playwright, y `@types/node` para `tsc --noEmit` sobre `src/` y `tests/`.
- **Autorizada (Nivel 2, Andrés, 2026-11-05; H-03):** `@vitest/coverage-v8`, proveedor de cobertura de Vitest 2, necesario para el umbral ≥ 95 % de TASK-115. Condición: solo dependencias y servicios gratuitos; cualquier opción de pago requiere nueva autorización de Andrés.
- **Dependencias adicionales autorizadas (v2.1.0, Nivel 2, aprobadas por Andrés el 2026-11-05):** `@fastify/cookie`, `react-router-dom`, `openapi-fetch`, `yaml` (solo si el generador lo importa, declarada explícitamente), `tsx` (solo desarrollo; aprobado sin condiciones por Andrés (Nivel 2), 2026-11-05), `concurrently` (solo desarrollo), `@vitejs/plugin-react`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`, `@stryker-mutator/typescript-checker`. SAST en CI: **Semgrep** fijado por versión (herramienta de CI, sin dependencia npm).

## 3. REGLAS DE PUREZA Y AISLAMIENTO DE ENTROPÍA (DETERMINISMO TOTAL)
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
   - `src/infrastructure/` implementa los puertos (persistencia SQLite/memoria, HTTP Fastify, hashing, tokens, reloj, configuración) y valida en runtime contra `src/generated/` en toda frontera.
   - `src/presentation/` consume la API HTTP mediante un cliente tipado generado de `contracts/openapi/` y tipos de `src/generated/`. Prohibidas reglas de negocio o aritmética de fechas en componentes.
5. **Puertos asíncronos y listos para Cloud (`INV-ARCH-005`):** todos los puertos de repositorio devuelven `Promise` y exponen una operación transaccional `runInTransaction(fn)`. Sustituir SQLite local por la base de datos Cloud no puede requerir cambios en `domain/` ni `application/`.
6. **Configuración aislada (`INV-ARCH-006`):** `process.env` solo puede leerse en `src/infrastructure/config/`, validado contra un esquema. Ningún secreto se versiona; existe `.env.example` sin valores sensibles.

## 4. ESTÁNDAR DE TRAZABILIDAD (LINEAGE IDS)
Fuente de verdad de IDs: `.specify/specs/pet-health-tracker.md` v2.2.0, `contracts/` y los `INV-ARCH-*` declarados en esta constitución (§3).
- **Requisitos:** `REQ-AUTH-001`..`004`, `REQ-PET-001`..`005`, `REQ-REC-001`..`006`, `REQ-HOUSE-001`..`005`, `REQ-UI-001`..`007`, `REQ-BACKUP-001`..`002`.
- **Invariantes:** `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-AUTH-001`..`007`, `INV-HOUSE-001`..`005`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
- **Máquinas de Estado:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`.
- **Errores:** todos los códigos de `contracts/errors/error-catalog.json` v2.1.1.
- **IDs retirados (no deben aparecer en código nuevo; solo en historial):** `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`, `ERR-PET-QUOTA-EXCEEDED`.

Cada función o clase en `src/` incluye en su JSDoc los IDs que implementa (`@implements ...`), y cada `describe`/`it` en `tests/` incluye entre corchetes el ID verificado. La trazabilidad cuenta como cumplida **solo** si el ID aparece en un `@implements` de `src/` fuera de `src/generated/` **y** en el título de un `it`/`test` de `tests/`.

## 5. UMBRALES NO NEGOCIABLES DEL TEST GATE
- **Cobertura de Trazabilidad:** 100% de los IDs vigentes de la sección 4 en la compuerta final (TASK-115); en cada tarea, 100% de los IDs de su columna "IDs de Trazabilidad" (`verify-traceability.sh` acotado por tarea).
- **Cobertura de Líneas y Ramas en `src/domain/` y `src/application/`:** mínimo 95% (medida por Vitest).
- **Mutation Score:** mínimo 85% en `src/domain/` y `src/application/` (bloqueante por debajo de 85%; umbral `break` de Stryker = 85), medido por Stryker en CI.
- **Cero Weak Oracles:** prohibido `toBeDefined()`, `toBeTruthy()`, `toBeFalsy()`, `not.toBeNull()` o `toThrow()` sin argumento como aserción principal; verificado por `scripts/verify-oracles.sh`.
- **Accesibilidad:** cero violaciones `critical`/`serious` de axe-core en todas las pantallas (login, registro, mis mascotas, hogar, ficha, respaldo) a 320px y 1280px.
- **Seguridad:** `tests/security/` debe cubrir al menos: acceso cruzado entre usuarios (IDOR), acceso a hogares ajenos, rutas sin sesión, sesión expirada, CSRF, enumeración de usuarios en login y tiempo de respuesta uniforme (`INV-AUTH-006`), XSS almacenado en campos de texto e importación de backup maliciosa (prototype pollution, tamaño excesivo).
- **CI reproducible:** `test-gate.yml` debe pasar desde un checkout limpio con `npm ci` (lockfile versionado) en Node 22.

## 6. SEGURIDAD Y PRIVACIDAD
1. Las contraseñas nunca se almacenan en claro, nunca se registran en logs, nunca se devuelven en respuestas ni se incluyen en respaldos (`INV-AUTH-003`).
2. Los errores de login son genéricos (`ERR-AUTH-INVALID-CREDENTIALS`) para impedir la enumeración de usuarios.
3. Toda petición que modifica estado exige sesión válida y la cabecera `X-Argos-Request: 1` (defensa CSRF junto a `SameSite=Strict`).
4. Un usuario sin permiso de lectura sobre una mascota u hogar recibe `404` (no `403`) para no revelar su existencia.
5. Las respuestas de error siguen RFC 9457 (`application/problem+json`) y nunca incluyen trazas internas.
6. Ningún usuario ve datos de otro si no existe una membresía `ACTIVE` compartida en un hogar, aceptada explícitamente por el invitado.

## 7. ESTRUCTURA DEL REPOSITORIO
Se aplica el **Estándar de Código / Software Production-Grade (SDD)**. Los archivos de la raíz y de `scripts/` adicionales al árbol estándar están **autorizados únicamente** en esta lista:
- Raíz: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `.gitignore`, `.nvmrc`, `.env.example`.
- `scripts/codegen.mjs`: auxiliar invocado exclusivamente por `scripts/compile-contracts.sh`.
- Subcarpetas de `src/` por responsabilidad (p. ej. `src/infrastructure/http/`, `src/infrastructure/persistence/`, `src/presentation/web/`) siempre dentro de la capa correcta.
Queda prohibido crear carpetas fuera del árbol estándar (p. ej. `tests/support/`); los auxiliares compartidos de prueba van en `tests/fixtures/`. Toda carpeta vacía del estándar conserva su `.gitkeep`.
