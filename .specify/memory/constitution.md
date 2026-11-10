---
document_id: CONSTITUTION-ARGOS-001
version: 2.4.0
status: REVIEW
last_updated: 2026-11-09
supersedes: 2.3.0
change_type: MINOR
change_summary: >
  v2.4.0: migración al estándar GitHub Spec Kit (plantilla `constitution-template.md`, CLI 1.3.4.dev0). El archivo pasa de `.specify/constitution/constitution.md` a `.specify/memory/constitution.md`. Se añaden «Core Principles» (índice declarativo de §1–§7 y de `spec-system.md`), «Governance» y la línea de versión de la plantilla. §1–§6 conservan su texto; en §4 solo cambia la ruta de la spec. §7 autoriza el árbol de Spec Kit (`.specify/memory|templates|scripts|workflows|integrations/` y `specs/<NNN-feature>/`). Pendiente de aprobación de Andrés.
  v2.3.0: autorización nueva de `@vitest/coverage-v8` (proveedor de cobertura de Vitest 2, gratuito; condición: solo dependencias y servicios gratuitos) por Andrés el 2026-11-05 (H-03). Se retira 'pendiente de firma formal' del stack (ya firmado por Andrés, D-10) y se fija la versión exacta de Node (`.nvmrc` 22.23.4; `engines` >=22.18 <23), aceptada por el Auditor en TASK-101.
  v2.2.0: autorización explícita del stack de §2 (incluido `@types/node`) y de la lista de dependencias adicionales, por luz verde de Andrés (Nivel 2) el 2026-11-05 (D-10).
  Eliminación del cupo fijo de mascotas (2 perros / 2 gatos), incorporación de cuentas de usuario
  (registro/login), hogares compartidos, servidor API local con SQLite preparado para migración Cloud,
  generación real de validadores desde contratos y toolchain de pruebas oficial (sin harness propio). v2.1.0: dependencias adicionales autorizadas (§2), umbral de mutación de 85 % (§5), compuerta por tarea (§5) e INV-AUTH-006 (§4).
approved_by: pendiente (v2.4.0 en REVIEW, 2026-11-09: contenido derivado pendiente de revisión)
---

<!--
SYNC IMPACT REPORT
==================
Version change: 2.3.0 -> 2.4.0
Bump rationale: MINOR. Se añaden secciones (Core Principles, Governance, línea de versión) al adoptar
  la plantilla constitution-template.md de GitHub Spec Kit. Ninguna regla de §1-§6 cambia de texto ni
  de alcance; §7 amplía el árbol autorizado con la jerarquía de Spec Kit.

Modified principles: ninguno (las reglas normativas siguen en §1-§7 con su numeración).
Added sections:
  - Core Principles (I-VI): enunciado declarativo de cada principio con remisión a su sección normativa.
  - Governance: autoridad, enmiendas, versionado y revisión de cumplimiento (reglas ya vigentes en
    spec-system.md y en la cabecera de los artefactos).
  - Línea final Version | Ratified | Last Amended.
  - §7: viñeta que autoriza el árbol de Spec Kit.
Removed sections: ninguna.
Path changes: .specify/constitution/constitution.md -> .specify/memory/constitution.md;
  §4 cita specs/001-pet-health-tracker/spec.md.

Templates reviewed for alignment:
  - .specify/templates/plan-template.md: la sección "Constitution Check" se evalúa contra §2-§7
    (ver specs/001-pet-health-tracker/plan.md).
  - .specify/templates/spec-template.md, tasks-template.md, checklist-template.md: sin tokens
    dependientes de la constitución.

Compatibilidad con scripts/verify-traceability.sh: se conservan los encabezados "## 3." y "## 4." y la
  línea de identificadores dados de baja dentro de §4, que el script lee de forma literal.

Follow-up TODOs:
  - Aprobación de Andrés Vallejo (Nivel 2) para pasar v2.4.0 de REVIEW a LOCKED.
  - Validación del Auditor sobre el contenido migrado.
-->

# Proyecto Argos (Pet Health Tracker) Constitution

Esta Constitución define las invariantes técnicas, tecnológicas y operativas no negociables del **Proyecto Argos**. Ningún plan, tarea o línea de código en `src/` o `tests/` puede contradecir este documento.

## Core Principles

Los principios enuncian las reglas no negociables del proyecto. El texto normativo completo de cada uno está en las secciones numeradas §1–§7 de este documento y en `spec-system.md`; ante cualquier diferencia de redacción prevalece la sección numerada.

### I. Especificación y Contratos como Fuente de Verdad

Las especificaciones (`specs/<NNN-feature>/spec.md`) y los contratos formales (`contracts/`) son la fuente de verdad; el código de `src/` es un derivado. Si la prosa de una spec y un contrato formal difieren, prevalece el contrato y se detiene la ejecución hasta reconciliarlos. Queda prohibido implementar código sin una tarea aprobada, vinculada a un plan, a contratos bloqueados y a una spec validada.

**Texto normativo:** `spec-system.md` §1 y §4. **Motivo:** evita la deriva entre lo que se especifica y lo que se construye.

**IDs de lineage:** `INV-ARCH-003` (`src/generated/` solo se regenera desde `contracts/`), `REQ-AUTH-001`.

### II. Determinismo Total y Aislamiento de Entropía (NON-NEGOTIABLE)

El dominio y la aplicación no leen el reloj, no generan aleatoriedad y no leen la configuración del entorno: reciben puertos inyectados. `src/generated/` solo cambia regenerando desde `contracts/`. Las capas dependen hacia adentro y los puertos de repositorio son asíncronos y transaccionales para que la migración a Cloud solo sustituya adaptadores.

**Texto normativo:** §3 (invariantes de arquitectura 001 a 006). **Motivo:** el mismo dato y la misma fecha deben producir siempre el mismo resultado, en local, en CI y en Cloud.

**IDs de lineage:** `INV-ARCH-001`, `INV-ARCH-002`.

### III. Trazabilidad Verificable por Máquina

Toda regla de negocio, invariante, máquina de estados y error tiene un identificador inmutable que aparece en la spec o en los contratos, en un `@implements` de `src/` y en el título de una prueba de `tests/`. Un identificador sin esas dos evidencias no cuenta como cumplido.

**Texto normativo:** §4. **Motivo:** permite auditar por script, sin interpretación, que lo especificado está implementado y probado.

**IDs de lineage:** `REQ-PET-001`, `INV-PET-002` (identificadores vigentes citados por la compuerta de trazabilidad).

### IV. Test Gate con Umbrales Fijos (NON-NEGOTIABLE)

Ninguna tarea se cierra sin pasar su compuerta: trazabilidad del 100 %, cobertura de líneas y ramas, puntuación de mutación, cero oráculos débiles, accesibilidad sin violaciones graves y la batería de seguridad. Las pruebas se ejecutan con las herramientas oficiales, nunca con sustitutos propios, y no se eliminan ni se relajan para obtener un resultado en verde.

**Texto normativo:** §5 y §2 (suite de pruebas). **Motivo:** una compuerta que se puede rebajar deja de medir.

**IDs de lineage:** ninguno: el umbral del test gate está en §5 y no tiene identificador de lineage.

### V. Seguridad y Privacidad por Defecto

Las credenciales nunca se almacenan ni se exponen en claro, los errores no revelan la existencia de usuarios ni de recursos ajenos, toda petición que modifica estado exige sesión y defensa CSRF, y ningún usuario ve datos de otro sin una membresía activa aceptada.

**Texto normativo:** §6. **Motivo:** el sistema guarda datos personales de varios usuarios en una misma instalación.

**IDs de lineage:** `INV-ACC-001`, `INV-ACC-002`, `INV-OWN-001`.

### VI. Stack Autorizado y Estructura de Repositorio Estándar

El stack tecnológico y el árbol de carpetas son los autorizados en este documento. Añadir o actualizar dependencias, crear carpetas fuera del árbol o cambiar contratos, CI o scripts de verificación requiere autorización humana previa (Nivel 2).

**Texto normativo:** §2, §7 y `spec-system.md` §3. **Motivo:** mantiene reproducible el entorno y acotado el coste de mantenimiento.

**IDs de lineage:** ninguno: la pila y la estructura están en §2 y §7 y no tienen identificador de lineage.

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
Fuente de verdad de IDs: `specs/001-pet-health-tracker/spec.md` (SPEC-ARGOS-001; antes `.specify/specs/pet-health-tracker.md` v2.2.0), `contracts/` y los `INV-ARCH-*` declarados en esta constitución (§3).
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
- **Árbol SDD de GitHub Spec Kit (v2.4.0, pendiente de aprobación):** `.specify/memory/` (esta constitución y artefactos de soporte: `audits/`, `legacy-templates/`, reporte de migración), `.specify/templates/`, `.specify/scripts/`, `.specify/workflows/`, `.specify/integrations/`, los archivos de estado de `.specify/` (`init-options.json`, `integration.json`, `feature.json`, `.gitignore`) y `specs/<NNN-feature>/` en la raíz (`spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, `checklists/`). Sustituye a `.specify/constitution/`, `.specify/specs/`, `.specify/plans/`, `.specify/tasks/` y `.specify/checklists/`. `README.md` y `spec-system.md` permanecen en la raíz.
Queda prohibido crear carpetas fuera del árbol estándar (p. ej. `tests/support/`); los auxiliares compartidos de prueba van en `tests/fixtures/`. Toda carpeta vacía del estándar conserva su `.gitkeep`.

## Governance

Esta constitución prevalece sobre cualquier plan, tarea o línea de código. `spec-system.md` es el plano de control operativo que la aplica (jerarquía de verdad, límites de tres niveles y bucle de ejecución).

- **Autoridad.** Los principios I–VI y las secciones §1–§7 son compuertas obligatorias. La sección «Constitution Check» de cada `plan.md` se evalúa contra ellas; un conflicto se resuelve cambiando la spec, el plan o las tareas, no rebajando la regla.
- **Enmiendas.** Todo cambio de este documento requiere autorización humana previa (Nivel 2, `spec-system.md` §3), se registra en la cabecera (`version`, `supersedes`, `change_type`, `change_summary`, `approved_by`) y recorre el ciclo `DRAFT` → `REVIEW` → `APPROVED` → `LOCKED`. Ninguna fase posterior puede iniciarse con un artefacto anterior fuera de `APPROVED` o `LOCKED` (`spec-system.md` §1).
- **Versionado.** SemVer: MAJOR para cambios incompatibles o retirada de una regla; MINOR para una regla o sección nueva; PATCH para aclaraciones sin cambio de alcance. Un cambio MAJOR en contratos exige estrategia de migración explícita.
- **Evolución de las specs.** Un cambio de reglas de negocio se escribe primero en la spec y en los contratos, se regenera `src/generated/`, se ajustan plan y tareas, y solo entonces se modifica `src/` (`spec-system.md` §1, resolución de deriva). Una regresión de implementación se corrige en `src/`, nunca en la spec.
- **Revisión de cumplimiento.** El agente ejecuta la compuerta y adjunta evidencia; el Auditor valida; solo el arquitecto humano firma los checklists y marca una tarea como completada (`spec-system.md` §4, paso 7). Las desviaciones aceptadas se registran como deuda con responsable y condición de cierre en `tasks.md` y en «Complexity Tracking» del plan.

**Version**: 2.4.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-09
