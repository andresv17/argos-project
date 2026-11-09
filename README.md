# Proyecto Argos — Pet Health & Biometric Tracker (SDD Edition) · v2.2.0

Plataforma web multiusuario y determinista para la gestión clínica, biométrica y sanitaria de mascotas (perros y gatos, **sin límite de cantidad**). Cada usuario gestiona sus propias mascotas y puede crear **hogares** para compartirlas con otros usuarios, con distinción visual del dueño. Construida íntegramente bajo **Spec-Driven & Schema-Driven Development (SDD)**.

## Estado del repositorio (release v2.2.0)

Versiones leídas de la cabecera de cada artefacto. La release v2.2.0 agrupa la cola de tareas v2.2.0; la spec y los contratos recibieron después parches aprobados (spec 2.3.1, OpenAPI 2.4.0).

| Fase | Artefacto | Versión | Estado |
| :--- | :--- | :--- | :--- |
| 0. Gobernanza | `.specify/constitution/constitution.md` | 2.3.0 | `LOCKED` |
| 0. Plano de control | `spec-system.md` | 2.4.0 | — |
| 1. Specify | `.specify/specs/pet-health-tracker.md` | 2.3.1 | `APPROVED` |
| 1.5. Contratos | `contracts/openapi/pet-tracker-api.openapi.yaml` | 2.4.0 | `APPROVED` |
| 1.5. Contratos | `contracts/schemas/*.schema.json`, `contracts/errors/error-catalog.json` | 2.0.2 – 2.2.0 (cabecera `x-sdd-metadata` de cada archivo) | — |
| 2. Plan | `.specify/plans/pet-health-tracker-plan.md` | 2.2.0 | `APPROVED` |
| 3. Tasks | `.specify/tasks/pet-health-tracker-tasks.md` | 2.2.0 | `APPROVED`: TASK-100 a TASK-114 `COMPLETED`; TASK-115 (compuerta final) en revisión |
| 4–5. Implement / Test Gate | `src/`, `tests/` | v2.2.0 | `npm run test:gate` en verde (ver «Compuerta») |

Los checklists `.specify/checklists/code-review.md` y `oracle-validation.md` llevan la evidencia por ítem de TASK-115 y esperan la firma humana.

## Mapa de artefactos de verdad

1. **Plano de control raíz:** [`spec-system.md`](./spec-system.md)
2. **Constitución:** [`.specify/constitution/constitution.md`](./.specify/constitution/constitution.md)
3. **Especificación funcional:** [`.specify/specs/pet-health-tracker.md`](./.specify/specs/pet-health-tracker.md)
4. **Contratos formales:**
   - Identidad (usuarios, sesiones, hogares): [`contracts/schemas/identity.schema.json`](./contracts/schemas/identity.schema.json)
   - Mascotas: [`contracts/schemas/pet.schema.json`](./contracts/schemas/pet.schema.json)
   - Registros médicos: [`contracts/schemas/medical-records.schema.json`](./contracts/schemas/medical-records.schema.json)
   - Tipos comunes y `ProblemDetails`: [`contracts/schemas/common.schema.json`](./contracts/schemas/common.schema.json)
   - Respaldo JSON (v2 + v1 legado): [`contracts/schemas/backup-envelope.schema.json`](./contracts/schemas/backup-envelope.schema.json)
   - API OpenAPI 3.1: [`contracts/openapi/pet-tracker-api.openapi.yaml`](./contracts/openapi/pet-tracker-api.openapi.yaml)
   - Máquinas de estado: [`contracts/state-machines/`](./contracts/state-machines/) (`sanitary-alert`, `backup-import`, `auth-session`, `household-membership`)
   - Catálogo de errores: [`contracts/errors/error-catalog.json`](./contracts/errors/error-catalog.json)
   - Fixtures canónicos: [`contracts/examples/canonical-fixtures.json`](./contracts/examples/canonical-fixtures.json)
5. **Plan técnico:** [`.specify/plans/pet-health-tracker-plan.md`](./.specify/plans/pet-health-tracker-plan.md)
6. **Cola de tareas:** [`.specify/tasks/pet-health-tracker-tasks.md`](./.specify/tasks/pet-health-tracker-tasks.md)

## Arranque local

Requisitos: **Node.js 22** (`.nvmrc` fija `22.23.4`; `engines` admite `>=22.18 <23`) y npm. Todo corre en `127.0.0.1`; no hace falta ningún servicio externo.

```bash
nvm use                  # opcional: Node 22.23.4 de .nvmrc
npm ci                   # dependencias exactas del lockfile
npm run dev              # API Fastify en http://127.0.0.1:3000 y SPA Vite en http://127.0.0.1:5173
```

Abre `http://127.0.0.1:5173`, crea una cuenta con «Crear cuenta» y entra. La SPA llama a la API por el proxy `/api` de Vite.

**Configuración.** La API lee solo variables de entorno (INV-ARCH-006, `src/infrastructure/config/app-config.ts`). Si no defines ninguna, usa los mismos valores de [`.env.example`](./.env.example):

| Variable | Valor por defecto | Regla |
| :--- | :--- | :--- |
| `PORT` | `3000` | 1–65535. El proxy de Vite apunta a `127.0.0.1:3000`: si lo cambias, la SPA deja de llegar a la API. |
| `HOST` | `127.0.0.1` | Solo `127.0.0.1`. |
| `DATABASE_PATH` | `./data/argos.sqlite` | La carpeta se crea al arrancar; `data/` no se versiona. |
| `APP_TIMEZONE` | `America/Bogota` | Zona IANA válida. |
| `COOKIE_SECURE` | `false` | `true` solo detrás de HTTPS. |

Ningún proceso lee un archivo `.env`: para cambiar un valor, expórtalo al lanzar, por ejemplo `DATABASE_PATH=/tmp/argos.sqlite npm run dev`. Un valor inválido detiene el arranque con la lista de variables afectadas.

**Datos.** La base SQLite queda en `DATABASE_PATH`. Para empezar de cero, detén `npm run dev` y borra ese archivo. El respaldo JSON se descarga e importa desde la pantalla «Respaldo».

## Compuerta (`npm run test:gate`)

Para las pruebas E2E instala una vez el navegador de Playwright:

```bash
npx playwright install chromium
npm run test:gate
```

`test:gate` ejecuta en orden y se detiene en el primer fallo:

| Paso | Comando | Umbral |
| :--- | :--- | :--- |
| Contratos | `scripts/compile-contracts.sh` | Regenera `src/generated/` desde `contracts/` (en CI, además, `git diff --exit-code src/generated/`) |
| Trazabilidad y pureza | `scripts/verify-traceability.sh` | 100 % de los IDs vigentes de constitución §4; 0 violaciones de pureza |
| Oráculos | `scripts/verify-oracles.sh` | 0 oráculos débiles |
| Tipos | `tsc --noEmit` | 0 errores |
| Unitarias, propiedades, integración y seguridad, con cobertura | `vitest run --coverage` | Líneas y ramas ≥ 95 % en `src/domain/` y `src/application/` |
| Mutación | `npm run test:mutation` (Stryker) | Mutation score ≥ 85 % (`break`) |
| E2E y accesibilidad | `playwright test` | Flujos reales con `webServer`; 0 violaciones `critical`/`serious` de axe-core a 320, 1024 y 1280 px |

Playwright arranca la API y la SPA con una base nueva en el directorio temporal. Si el puerto 3000 o el 5173 ya están en uso (por ejemplo, por un `npm run dev` abierto), se detiene antes de ejecutar pruebas: cierra ese proceso y repite. Ejecuta las pruebas con una configuración regional UTF-8 (`LANG=C.UTF-8`, la habitual en macOS y en Ubuntu): con `POSIX`/`C`, Chromium no abre archivos cuya ruta lleva tildes y la prueba de importación de respaldo de `wcag.spec.ts` se queda esperando.

Otros comandos: `npm test` (Vitest sin cobertura), `npm run test:coverage`, `npm run test:e2e`, `npm run typecheck`, `npm run build`, `npm run verify:traceability`, `npm run verify:oracles`. El análisis SAST con Semgrep (reglas en `tests/security/sast-rules/`) corre en CI (`.github/workflows/test-gate.yml`).

## Protocolo de ejecución para agentes IA

1. Leer `spec-system.md` y `.specify/constitution/constitution.md`.
2. Tomar la siguiente tarea `PENDING` de `.specify/tasks/pet-health-tracker-tasks.md`.
3. Ejecutarla respetando las capas (`src/generated/`, `src/domain/`, `src/application/`, `src/infrastructure/`, `src/presentation/`).
4. Verificar con `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh` y los checklists de `.specify/checklists/`, dejar la tarea en `REVIEW` con evidencia y esperar el aval humano.
