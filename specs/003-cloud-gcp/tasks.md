# Tasks: Argos en la nube — GCP, Neon, Terraform y CI/CD (Feature 003)

**Input**: `specs/003-cloud-gcp/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/README.md`)

**Estado**: `APPROVED` (Aprobada por Neo (Level 2) el 2026-11-15, bajo condiciones R1 a R5 del veredicto Oracle); decisiones D-01..D-28 resueltas por Neo el 2026-11-15. Toda tarea nace `[ ]`; el techo de los agentes es `REVIEW` y solo Neo marca `COMPLETED` (`[x]`). Ningún documento está `LOCKED`.

**Numeración**: `T401..T483` con **huecos T470 y T476** (retiradas, fusionadas en el ensayo único T469 por el recorte H-MIF-002 de `/mifune`; no se renumera). T463..T477 son la Phase 9 (respuesta a `/lock` y a `/mifune`, 2026-11-15); T477 es nueva (H-MIF-016); T478 es nueva (H-RAMA-004, prueba de restauración); T479 y T480 son nuevas (gate `/merovingian`: cabeceras de seguridad y decisiones D-25..D-28); T481..T483 son nuevas (frentes de exposición F3 y F2, 2026-11-15); `T401..T4xx` (la 001 usa `T001..`, la 002 `T201..T311`; la 003 empieza en `T401`). Hasta que TT406 habilite la compuerta `--feature 003`, la trazabilidad se revisa a mano con la tabla final.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: paralelizable (archivos distintos, sin dependencia). **[N2]**: requiere autorización de Neo (Nivel 2: dependencias, CI, constitución, despliegue). **[GOV]**: gobernanza. **[US1..US5]**: historias de `spec.md`.
- El texto «depende de {X}» enumera dependencias además del orden de la fase.

## Reglas transversales
- **Ninguna tarea ejecuta `terraform apply`, `gcloud` mutante ni despliega**: lo hacen los flujos de CI aprobados o Neo (Phase 8).
- No se edita `specs/001-*` ni `specs/002-*`; no se toca nada de Mirror (REQ-IAC-003).
- `src/domain/` y `src/application/` **no cambian** (NFR-CLD-009, sin excepción): el verificador OIDC es una función inyectada en `infrastructure/http` (H-MIF-005), no un puerto. Si fuera imprescindible tocarlos, Caso B.
- Las pruebas se escriben primero y deben fallar antes de implementar (constitución IV).
- Caso B (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).
- Cambio de CI, de dependencias, de la constitución o de scripts: Nivel 2.

---

## Phase 1: Gobernanza y verificación previa (sin código)

**Goal**: Resolver las decisiones abiertas y habilitar las compuertas para la 003.

**Independent Test**: D-01..D-16 resueltas por escrito; límites re-verificados; enmienda constitucional firmada.

- [ ] T401 [N2] [GOV] Neo resolvió D-01..D-16 de `spec.md` (2026-11-15) y `/architect` las registró en `spec.md` y en `claude/decisiones-arquitecto-003-<fecha>.md` (REQ-CLD-002, REQ-IAC-002)
- [ ] T402 [P] [GOV] T-CLD-VERIFY: repetir la lectura de los límites Free Tier (GCP, Neon, Cloud Scheduler, Cloud Run Tier 1) y actualizar `research.md §1-2` con fecha; resolver los valores `[verificar]` de la matriz de retención (`data-model.md §6`: retención de `_Default` y `_Required` de Cloud Logging, `retention-days` de GitHub); cualquier diferencia con NFR-CLD-001..004/007 se escala (NFR-CLD-001). Incluye el periodo de gracia de SIGTERM de Cloud Run, el cupo real de Scheduler de la cuenta y la versión de PostgreSQL de Neon (H-LOCK-003, H-LOCK-009)
- [x] T403 [N2] [GOV] Enmienda MINOR de la constitución 3.3.0 (II.4 adaptador PostgreSQL, II.6 `HOST=0.0.0.0`, Technology Stack GCP/Neon/Terraform); borrador en `.specify/memory/audits/enmienda-constitucion-003-borrador.md`, firma de Neo (INV-ARCH-004, INV-ARCH-006)
- [x] T404 [N2] [GOV] **Autorizada por Neo (D-27, 2026-11-15)**: dependencias exactas `pg 8.23.1`, `@types/pg 8.23.1`, `@fastify/static 10.1.8` y `esbuild 0.28.2` (devDependency, D-07 = A), sin `^`; se reevalúa la ventana de 14 días al ejecutar y cualquier cambio de versión vuelve a Neo; **no** se añaden `tsx`, `concurrently`, `dotenv` ni `@fastify/helmet` (producción ni CI de despliegue); prueba de arranque de `@fastify/static` con Fastify 5.12.8 (REQ-PG-001, REQ-CLD-001, REQ-CLD-009) — depende de T480
- [ ] T405 [GOV] Revisiones de D-15: `/lock` (EDGE-*), `/mifune`, `/rama` (borrado físico, dumps), `/merovingian`; informes en `.specify/memory/audits/` y ajustes de `/architect` (REQ-PG-011, REQ-SEC-001)
- [x] T406 [N2] [GOV] Hacer que `scripts/compile-contracts.sh`, `scripts/verify-traceability.sh` y `scripts/verify-oracles.sh` acepten `--feature 003` sin romper 001/002 y que reconozcan los prefijos `REQ-CLD/PG/IAC/CICD/SEC`, `NFR-CLD`, `SC-CLD` (INV-ARCH-003). **La salida de 003 va a `src/generated/ops/`** (nunca a `src/generated/api` ni `errors/` de la 002); `npm run test:gate` compila 002 y 003 en secuencia; criterio de aceptación: `git diff --stat -- src/generated/api` vacío tras compilar 003 y el conteo de 40 operaciones de `openapi-conformance.spec.ts` intacto (H-MERO-003)
- [ ] T407 [GOV] `/mouse` audita la estructura de la 003 (spec-tasks 1:1, sin huérfanos) y emite veredicto; luego `/oracle` verifica en disco y escala a Neo la aprobación (`APPROVED` solo de Neo)

---

## Phase 2: Contratos, configuración y servidor HTTP listo para la nube

**Goal**: Que el servidor existente sea desplegable: healthz, readyz, estáticos, mantenimiento externo, configuración y cierre ordenado.

**Independent Test**: Con SQLite, la suite completa sigue verde y los nuevos endpoints cumplen el contrato.

- [x] T408 [P] [US1] Redactar el contrato `specs/003-cloud-gcp/contracts/openapi/ops.openapi.yaml` (`/healthz`, `/readyz`, `/internal/maintenance`) y añadir `ERR-*` de readiness si hace falta en el catálogo 003 (reutiliza `ERR-INTERNAL-UNEXPECTED`); compilar a **`src/generated/ops/`** con el script y comprobar `git diff --stat -- src/generated/api` vacío; confirmar por escrito que `ops.openapi.yaml` no toca contratos de dominio (REQ-CLD-004, REQ-CLD-007, INV-ARCH-003)
- [x] T409 [P] [US1] Pruebas primero de `app-config.ts` (**D-26 resuelta**): `HOST=0.0.0.0` aceptado **solo** con `NODE_ENV=production` o `ARGOS_DB_DRIVER=postgres`; rechazos de `::`, `localhost`, `10.0.0.1` y vacío; defecto `127.0.0.1`. **Nivel 3, firma de Neo junto con T403:** la aserción de `tests/unit/app-config.spec.ts:59` se *sustituye* por estas aserciones más fuertes (nunca se elimina) y nadie la edita antes de la firma. Además `ARGOS_DB_DRIVER`, `DATABASE_URL` (obligatoria solo con `postgres`, `sslmode=require`, sin eco del valor) y `ARGOS_PG_POOL_MAX` 1..10 (REQ-CLD-003, REQ-CLD-005, REQ-PG-010, REQ-SEC-003)
- [x] T410 [US1] Implementar la enmienda del esquema de configuración en `src/infrastructure/config/app-config.ts` y actualizar `.env.example` sin secretos; el tipo literal `host: '127.0.0.1'` y su propagación se ajustan según D-26 (resuelta) (REQ-CLD-003, REQ-CLD-005, REQ-PG-010, INV-ARCH-006) — depende de T403, T404, T409, T480
- [ ] T411 [P] [US1] Pruebas primero de `/healthz`, `/readyz` (200, 503 con RFC 9457, tiempo máximo 5 s), SPA fallback, cabeceras de caché y ausencia de datos sensibles; **pruebas de *path traversal* codificado** (`%2e%2e`, `%2f`, `//`, `\`) sobre estáticos y sobre el *fallback* SPA (reutiliza el vector 9 de `/sentinels`); pruebas de `Content-Security-Policy`, `nosniff`, `Referrer-Policy` y `Cache-Control` por ruta (`/assets/*` inmutable, `index.html` sin caché) (REQ-CLD-001, REQ-CLD-004, REQ-CLD-009, SC-CLD-022)
- [ ] T412 [US1] Implementar rutas `/healthz` y `/readyz`, plugin de estáticos de `dist/` (`@fastify/static` con `dotfiles: 'deny'`, sin `list`, `wildcard` acotado) con fallback de SPA y `trustProxy` en `src/infrastructure/http/` (REQ-CLD-001, REQ-CLD-003, REQ-CLD-004, REQ-CLD-009) — depende de T408, T410, T411
- [ ] T413 [P] [US1] Pruebas primero de `POST /internal/maintenance`: 401 sin token OIDC, 403 con identidad ajena, 200 con la del Scheduler (función `verifyOidc` inyectada en las opciones del plugin; las pruebas usan una función falsa), solo conteos en el log; la ruta se **excluye de la matriz CSRF** y se prueba aparte (Bearer OIDC, ajeno a cookies) (REQ-CLD-007, REQ-SEC-007, INV-AUD-001)
- [ ] T414 [US1] Implementar la ruta de mantenimiento en `src/infrastructure/http/routes/ops-routes.ts` con `verifyOidc(token): Promise<Identity>` inyectada como opción del plugin (implementación en `src/infrastructure/http/oidc-verify.ts`, compuesta en `server.ts`; sin puerto ni cambios en `application/`) y mantener `setInterval` solo con `ARGOS_DB_DRIVER=sqlite` (REQ-CLD-007, REQ-SEC-007, H-03-03) — depende de T413, T412
- [ ] T415 [P] [US1] Formato de registro con `severity` para Cloud Logging, redacción de `DATABASE_URL`, `serializers.req` (método y ruta con plantilla, sin IP, `hostname` ni *query*) y `serializers.err` (solo SQLSTATE y nombre de restricción) en `server.ts`/`infrastructure/http`; cierre ordenado con `SIGTERM` (<= 7 s, menor que la gracia de 10 s de Cloud Run). **Pruebas primero**: violación de microchip duplicado y 404 con UUID afirman que `stdout` no contiene el UUID, el microchip ni la IP; documentar el registro de petición de Cloud Run (REQ-CLD-006, REQ-CLD-008, SC-CLD-004)
- [ ] T416 [US1] Compuerta de la Fase 2: `bash scripts/compile-contracts.sh --feature 003`, `git diff --stat -- src/generated/api` vacío tras compilar 003, `npx tsc --noEmit`, `npm run test:gate` (SQLite, sin regresión; compila 002 y 003 en secuencia) (NFR-CLD-010, SC-CLD-011) — depende de T414, T415, T479

---

## Phase 3: Adaptador PostgreSQL (`src/infrastructure/persistence/postgres/`)

**Goal**: Persistencia Postgres equivalente a SQLite, con la misma semántica transaccional.

**Independent Test**: La suite de conformidad de repositorios pasa 100 % en memoria, SQLite y Postgres, incluida la concurrencia con 2 pools.

- [ ] T417 [US2] Refactor de pruebas (solo `tests/`): extraer la suite de conformidad de repositorios y de unidad de trabajo a una función parametrizada por fábrica de adaptador, sin cambiar las pruebas existentes de memoria/SQLite (REQ-PG-002, SC-CLD-002) — depende de T416
- [ ] T418 [P] [US2] Servicio PostgreSQL local para pruebas: `docker-compose.test.yml` (postgres 17) y variable `TEST_DATABASE_URL`; las pruebas de Postgres se omiten con motivo explícito si falta (REQ-PG-001) — depende de T404
- [ ] T419 [US2] Migración **única** `0001_baseline.sql` de Postgres con el esquema final completo según `data-model.md §2` (JSONB, CHECK, índices parciales, cascadas, `schema_migrations` con una sola fila; D-20) y prueba de paridad del esquema final contra SQLite (REQ-PG-003, REQ-MIG-001, INV-PET2-001, REQ-HOUSE2-003) — depende de T417
- [ ] T420 [US2] `postgres-database.ts`: pool `pg` (`max` por `ARGOS_PG_POOL_MAX`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `keepAlive` corto, `pool.on('error')`); sin verificación de `schema_migrations` en el arranque (la hace T464, REQ-PG-013) (REQ-PG-001, REQ-PG-006) — depende de T419
- [ ] T421 [US2] `postgres-unit-of-work.ts`: `BEGIN`, `pg_advisory_xact_lock`, `SET LOCAL` de `lock_timeout`, `statement_timeout` e `idle_in_transaction_session_timeout` (15 s; más `ALTER ROLE` en la migración), `COMMIT/ROLLBACK`, convención C-6 y reintento único por `ECONNRESET` previo al primer comando (REQ-PG-004, REQ-PG-005, REQ-PG-012, INV-ARCH-005) — depende de T420, T465
- [ ] T422 [US2] `postgres-repositories.ts` parte 1: usuarios, sesiones, intentos de acceso, límites de frecuencia, tokens de respaldo (REQ-PG-002, INV-AUTH-003) — depende de T421
- [ ] T423 [US2] `postgres-repositories.ts` parte 2: mascotas, pesos y los 5 módulos clínicos, con cascadas y unicidad de microchip (REQ-PG-002, INV-PET-005, REQ-PET2-001) — depende de T422
- [ ] T424 [US2] `postgres-repositories.ts` parte 3: hogares, membresías, invitaciones, asignaciones y auditoría (REQ-PG-002, INV-HOUSE2-001, INV-HOUSE-003, REQ-AUD-001) — depende de T423
- [ ] T425 [US2] `purgeExpired` en el mantenimiento solo con `DELETE` por lotes (sin `VACUUM`, que pasa al rol propietario, T473) (REQ-PG-008, REQ-PG-011, INV-AUD-001) — depende de T424, T405
- [ ] T426 [P] [US2] Inyector de fallos determinista envolviendo los repositorios de Postgres (SC-004 de la 002) y prueba de que un fallo en la escritura N revierte todo (REQ-PG-002, INV-ARCH-005) — depende de T424
- [ ] T427 [US2] Pruebas de concurrencia: 2 pools escribiendo a la vez dan resultado serial, `lock_timeout` produce error controlado y no hay bloqueos muertos (REQ-PG-004, SC-CLD-002) — depende de T425, T426
- [ ] T428 [US2] Composición en `server.ts`: elegir adaptador por `ARGOS_DB_DRIVER` con **carga dinámica** (`await import()`) del adaptador elegido, solo en `infrastructure` (sin tocar `domain/` ni `application/`), de modo que con `postgres` no se cargue `better-sqlite3`; cerrar el pool en `onClose`; SQLite y memoria intactos (REQ-PG-010, REQ-CLD-001, NFR-CLD-009, H-MERO-006) — depende de T427, T410
- [ ] T429 [US2] `scripts/migrate-postgres.ts`: ejecutor con candado de sesión por `pg_try_advisory_lock` acotado a 60 s, `lock_timeout` 5 s con hasta 3 reintentos, `statement_timeout`, `application_name`, URL directa, una transacción por migración, idempotente y con salida sin secretos; la lectura de `DATABASE_URL_DIRECT` pasa por `src/infrastructure/config/` (sin segundo punto de `process.env`, INV-ARCH-006) o se amplía la regla SAST a `scripts/` (T453) (REQ-PG-006, REQ-PG-010, REQ-PG-014, REQ-CICD-005) — depende de T419, T467
- [ ] T430 [US2] Prueba de traslado (D-23 = A): con **dos usuarios y un hogar compartido** en SQLite, registrar las cuentas en Postgres, exportar el respaldo v3 de cada una e importarlo; verificar que se conservan las mascotas y sus 6 colecciones clínicas y que **no** se trasladan credenciales, hogares, asignaciones, sesiones ni auditoría (la prueba afirma exactamente qué se pierde) (REQ-PG-007, REQ-MIG-001) — depende de T428
- [ ] T431 [US2] Compuerta de la Fase 3: suite de conformidad x3 adaptadores, `npx tsc --noEmit`, `npm run test:coverage` >= umbral, `git diff --stat` sin cambios en `src/domain` ni `src/application`, y prueba de arranque con `ARGOS_DB_DRIVER=postgres` que verifica que `better-sqlite3` no se carga (SC-CLD-002, SC-CLD-011, NFR-CLD-009, REQ-CLD-001) — depende de T430, T429

---

## Phase 4: Contenedor

**Goal**: Una imagen única, pequeña y sin secretos.

**Independent Test**: Imagen <= 200 MB que responde `/healthz` en <= 3 s con la base local.

- [ ] T432 [US1] Producción de ejecutable de servidor según D-07 = A (bundle `esbuild` 0.28.2 devDependency, `better-sqlite3` como `external`; alternativas `tsc` y *type stripping* solo como nota en `research.md §9`) y `vite build` en `dist/` (REQ-CLD-001, H-03-04) — depende de T431
- [ ] T433 [US1] `Dockerfile` multi-etapa y `.dockerignore`: usuario no root, sin devDependencies, `NODE_ENV=production`, sin secretos, escritura solo en `/tmp`; base fijada por digest `FROM node:22.23.4-slim@sha256:<digest>` (registrar el digest y verificar que la etiqueta existe; reevaluar 22.23.5); etapa final sin `better-sqlite3` ni `npm` (REQ-CLD-001, REQ-SEC-005, NFR-CLD-011) — depende de T432
- [ ] T434 [US1] Humo local: `docker build`, ejecución contra el Postgres de pruebas, recorrido mínimo (registro, mascota, peso), `/healthz` y `/readyz`; comprobar que `better-sqlite3` no está en la imagen y que el servicio arranca con Postgres, medir tamaño comprimido y tiempo de arranque, y **fijar N de la política `keep` de Artifact Registry** (mayor N con N x tamaño <= 400 MB; 5 provisional, 3 si hace falta) (REQ-IAC-004, NFR-CLD-011, SC-CLD-001) — depende de T433

---

## Phase 5: Terraform (`terraform/`, desacoplado de Mirror)

**Goal**: Todos los recursos de Argos como código, con estado propio.

**Independent Test**: `terraform fmt -check` y `terraform validate` verdes; ningún `apply` fuera de CI.

- [ ] T435 [N2] [P] [US3] Script de arranque `terraform/bootstrap.sh` (solo documentado y revisable, ejecutado por Neo): crear proyecto/APIs mínimas, bucket de estado versionado (D-12), cuentas de Terraform (`argos-terraform-plan@` de solo lectura y `argos-terraform@`), WIF, variables y secretos de GitHub del día 0 y Environment `produccion`; sin ejecutarlo en esta fase (REQ-IAC-002, REQ-SEC-006, REQ-CICD-006, REQ-CICD-012) — depende de T401
- [ ] T436 [US3] `provider.tf`, `backend.tf` (`backend "gcs" {}`), `variables.tf`, `outputs.tf` y `services.tf` en la raíz plana de `terraform/` (sin `module`, `modules/` ni `locals.tf`; H-MIF-004) (REQ-IAC-001, REQ-IAC-002, REQ-IAC-003, REQ-IAC-009) — depende de T401
- [ ] T437 [US3] `artifact_registry.tf` con **una sola** política `keep` de N versiones (N fijado en T434; sin `delete` por antigüedad) (REQ-IAC-004, NFR-CLD-002) — depende de T436, T434
- [ ] T438 [US3] `secret_manager.tf`: `argos-database-url`, `argos-audit-hmac-secret`, versión sin `count` condicional con `validation` de la variable, `create_before_destroy`, `deletion_policy` de la versión y `prevent_destroy` (REQ-IAC-005, REQ-IAC-007, REQ-IAC-013, REQ-SEC-001) — depende de T436, T471
- [ ] T439 [US3] `iam.tf`: cuentas `argos-run`, `argos-deployer`, `argos-scheduler` con roles mínimos y `allUsers` invocador (REQ-IAC-006) — depende de T438, T437
- [ ] T440 [US3] `cloud_run.tf`: servicio v2 con CPU/memoria/concurrencia/escala, cuenta de ejecución, imagen marcadora sin sondas propias ni referencias a secretos, e `ignore_changes` sobre `traffic`, `client`, `client_version`, revisión, etiquetas, anotaciones, imagen, env, sondas y secretos (REQ-CLD-002, REQ-CLD-005, REQ-IAC-010, REQ-IAC-012) — depende de T439
- [ ] T441 [P] [US5] `buckets.tf`: bucket STANDARD `us-central1`, acceso uniforme, sin acceso público, ciclo de vida 14 d sobre `dumps/`, `soft_delete_policy { retention_duration_seconds = 0 }` (sin permisos para `argos-run@`, H-MIF-010) (REQ-IAC-008, SC-CLD-008) — depende de T436
- [ ] T442 [US1] `scheduler.tf`: **un** job `argos-maintenance` diario con OIDC hacia `/internal/maintenance` (REQ-CLD-007, NFR-CLD-001) — depende de T440
- [ ] T443 [P] [N2] [US3] Presupuesto de 1 USD con alerta preventiva por correo (D-13) (NFR-CLD-001) — depende de T436
- [ ] T444 [US3] `terraform fmt -check`, `terraform validate` (sin credenciales ni `apply`), `grep -ri mirror terraform/` = 0, `soft_delete_policy` en 0 s también en el bucket de estado de `bootstrap.sh`/`terraform/README.md`, `sensitive = true` en variables y salidas de secretos, y README de Terraform (REQ-IAC-003, REQ-IAC-008, REQ-SEC-001, SC-CLD-005, SC-CLD-008) — depende de T442, T441
- [ ] T485 [N2] [US3] `terraform/bootstrap.sh` paso 5c: añadir `roles/iam.workloadIdentityUser` sobre la cuenta `argos-deployer@` (en `iam.tf`, T439) restringido estrictamente a `attribute.job_workflow_ref` del flujo `.github/workflows/deploy-argos.yml` en `refs/heads/main`, y corregir el comentario de la línea 157 que hoy dice falsamente que la vinculación "se añade en T439/T450" (REQ-CICD-012, REQ-IAC-013, REQ-SEC-001, D-W1 de Neo). Sin este binding el primer despliegue real de `deploy-argos.yml` falla. Pruebas primero en `tests/unit/terraform-bootstrap.spec.ts` — depende de T450, T439

---

## Phase 6: CI/CD (`.github/workflows/`)

**Goal**: Plan en PR, apply en `main`, despliegue de aplicación con migración segura.

**Independent Test**: Los flujos pasan `actionlint` y se ejecutan en una rama de prueba sin tocar producción.

- [ ] T445 [N2] [P] [US4] `auto-pr.yml` (integración → `main`, D-09), acciones por SHA de 40 caracteres si manejan credenciales o son de terceros y `permissions` mínimos por trabajo (REQ-CICD-001, REQ-CICD-011) — depende de T401 **REVIEW** (Oracle CUMPLE CON RESERVAS: .specify/memory/audits/oracle-T445-auto-pr.md; precondición H-K-2 para Neo; sin [x])
- [ ] T446 [N2] [US4] `infraestructura.yml`: fmt, validate, plan y comentario en PR (sin valores sensibles), en `main` plan y apply **en el mismo trabajo sin subir `tfplan` como artefacto**, `retention-days` mínimos, prueba que busca un secreto de prueba en comentario y artefactos, guarda de borrados que incluye `google_secret_manager_secret_version`, falla del plan si falta una `TF_VAR` de secreto, `concurrency`, `-lock-timeout`; **PR con `argos-terraform-plan@` (solo lectura, `-lock=false`) y `apply` con `argos-terraform@` solo desde `main` con `environment: produccion` y aprobación de Neo (REQ-CICD-012, D-18)**; acciones de credenciales (`google-github-actions/auth`, `hashicorp/setup-terraform`) por SHA; `permissions` mínimos con `id-token: write` solo en `plan` (PR, solo lectura) y `apply`, y `validate` sin `id-token` (REQ-CICD-002, REQ-CICD-008, REQ-CICD-011, REQ-CICD-012, REQ-IAC-007, REQ-IAC-013, REQ-SEC-001, SC-CLD-004, SC-CLD-025) — depende de T444, T471, T472 **REVIEW** (Oracle CUMPLE CON RESERVAS: .specify/memory/audits/oracle-T446-infraestructura.md; sin [x])
- [ ] T447 [N2] [P] [US4] Añadir `workflow_call` y la rama de D-09 a `test-gate.yml` sin cambiar sus pasos, con `permissions: contents: read` y sin `id-token` ni secretos de GCP en el trabajo reutilizable (H-MERO-009); `drift-detection.yml` intacto (REQ-CICD-004, REQ-CICD-011) — depende de T401 **REVIEW** (Oracle CUMPLE CON RESERVAS: .specify/memory/audits/oracle-T447-test-gate.md; sin [x])
- [ ] T448 [N2] [US4] `deploy-argos.yml`: compuerta, build+push, migrar (D-03), desplegar sin tráfico con sondas, entorno y secretos por versión numérica, humo, mover tráfico, retroceso; sin trabajo `compat`; el trabajo `gate` corre sin `id-token`, `build-push` y `deploy` tienen `id-token: write` y `gate`, `audit` y `migrate` no lo tienen (enmienda E1, Neo N2), acciones de credenciales (`google-github-actions/auth`, `docker/login-action`) por SHA, `npm audit --omit=dev --audit-level=high` antes de construir (REQ-CICD-011, SC-CLD-023) (REQ-CICD-003, REQ-CICD-005, REQ-CICD-006, REQ-CICD-009, SC-CLD-006, SC-CLD-007) — depende de T447, T433, T429, T440 **REVIEW** (Oracle CUMPLE CON RESERVAS en reauditoría: .specify/memory/audits/oracle-T448-reauditoria.md; reserva abierta H-K-T448-2 pendiente de Neo E1; sin [x])
- [ ] T449 [N2] [P] [US4] `code-quality.yml` solo con `hadolint` y `actionlint` **como binarios con versión y `sha256` fijos** (sin `hadolint/hadolint-action`, `rhysd/actionlint` ni `gitleaks/gitleaks-action`), más `npm audit --omit=dev --audit-level=high` como compuerta; lista de cada acción de la 003 con versión y SHA (sin `terraform fmt/validate`, que ya corre en `infraestructura.yml`, ni `trivy`); justificar por escrito que `deploy-functions.yml` y los flujos de VM de Mirror no aplican (REQ-CICD-007, REQ-CICD-011, SC-CLD-023) — depende de T444 **REVIEW** (Oracle CUMPLE CON RESERVAS: .specify/memory/audits/oracle-T449-code-quality.md; sin [x])
- [ ] T450 [US4] Documentar en `terraform/README.md` y `quickstart.md §6` la guía de bootstrap del día 0 de secretos y variables de GitHub: SECRETS `TF_VAR_database_url`, `TF_VAR_audit_hmac_secret` y `DATABASE_URL_DIRECT`; VARIABLES `TF_VAR_project_id`, `TF_VAR_region`, `TF_VAR_custom_domain` (valor inicial `""`), `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_TERRAFORM_SA`, `GCP_TERRAFORM_PLAN_SA`, `TF_STATE_BUCKET`; Environment `produccion` con revisor Neo; sin `NEON_API_KEY` ni `NEON_PROJECT_ID` (D-19) (REQ-CICD-006, REQ-SEC-001, REQ-IAC-014, REQ-CICD-012) — depende de T448

---

## Phase 7: Seguridad y privacidad

**Goal**: Cero secretos filtrados; borrado y respaldos con la ventana aceptada.

**Independent Test**: SC-CLD-004 verificado.

- [ ] T451 [P] [US1] Escaneo de secretos (`grep` de patrones o binario `gitleaks` con `sha256` fijo; **no** `gitleaks-action`) en repositorio, capas de imagen y registros de CI (REQ-SEC-001, REQ-SEC-005, SC-CLD-004) — depende de T433, T448
- [ ] T452 [US5] `/rama` audita el equivalente de borrado (D-06, **reevaluación marcada por H-LOCK-009**: con el `VACUUM` del propietario y la evidencia de `pg_stat_user_tables`), el ciclo de vida de dumps y el estado de Terraform con secretos; enmienda ADR-003-09 si procede (REQ-PG-011, REQ-IAC-008, R-02, R-06) — depende de T425, T444, T473
- [ ] T453 [US1] `/trinity` y `/sentinels` repiten los 9 vectores sobre `/healthz`, `/readyz` y los estáticos, y prueban `/internal/maintenance` aparte (Bearer OIDC, excluida de la matriz CSRF); extienden la regla SAST `argos-no-process-env` a `scripts/` o confirman que la lectura está centralizada (H-MERO-018; cambio de CI, Nivel 2) (REQ-SEC-007, REQ-CLD-004, REQ-CLD-009) — depende de T414, T479
- [ ] T454 [US5] Comando documentado **por pipe, sin archivo local**: `pg_dump <URL directa> | gcloud storage cp - gs://<bucket>/dumps/<fecha>.sql` (nombre sin datos personales; manual por Neo con su identidad, o por flujo con conexión directa), sin cifrado propio (el bucket cifra en reposo), vida de 14 días con soft delete 0 s, cadencia semanal **estricta** (RPO <= 7 d, NFR-CLD-014; con 14 días de vida del dump quedan al menos 2 copias, R-14) y lectura IAM limitada a Neo; **runbook de restauración** con los pasos 1-6 de REQ-PG-016 (exportar filas `ACCOUNT_DELETE`, restaurar, recalcular el HMAC de `user.id` restaurados y eliminar coincidentes, revocar sesiones, borrar la rama de respaldo de Neon, registrar RPO/RTO) y paso en `quickstart.md` (REQ-IAC-008, REQ-PG-016, NFR-CLD-014, NFR-CLD-015, SC-CLD-008) — depende de T441, T429

---

## Phase 8: Despliegue y aceptación (ejecución humana o autorizada por Neo)

**Goal**: Primer despliegue real con evidencia; ningún agente ejecuta `gcloud`/`terraform apply` por su cuenta.

**Independent Test**: SC-CLD-001, 003, 005, 006, 008, 009, 010, 012 con evidencia.

- [ ] T455 [N2] [US2] Neo crea el proyecto Neon (D-02, D-08), los roles `argos_app` y `argos_migrator` y entrega `DATABASE_URL` y `DATABASE_URL_DIRECT` como GitHub Secrets; verifica `SHOW server_version` y que coincida con el Postgres de pruebas (REQ-SEC-004, REQ-SEC-001, REQ-PG-015) — depende de T401
- [ ] T456 [N2] [US3] Neo ejecuta `terraform/bootstrap.sh` y configura variables y secretos de GitHub (REQ-IAC-002, REQ-CICD-006) — depende de T435, T450, T485
- [ ] T457 [N2] [US3] Fusión a `main`: `infraestructura.yml` aplica; verificar segundo `plan` sin cambios y estado en `terraform/argos-state` (NFR-CLD-008, SC-CLD-005) — depende de T446, T456, T469
- [ ] T458 [N2] [US4] Primer despliegue: migración, revisión sin tráfico, humo y tráfico al 100 % (SC-CLD-006, SC-CLD-007) — depende de T457, T455, T451, T477
- [ ] T459 [US1] T-CLD-MEASURE: medir RTT Cloud Run→Neon, arranque en frío encadenado y p95 de las rutas del recorrido; recalibrar NFR-CLD-005/006 o reabrir D-02 (NFR-CLD-005, NFR-CLD-006, R-04) — depende de T458
- [ ] T460 [US1] Recorrido de aceptación `quickstart.md` contra la URL de Cloud Run por `/zee` y `/kid` (SC-CLD-001, SC-CLD-012) — depende de T459
- [ ] T461 [US1] Verificar cuota consumida (Cloud Run vCPU-s, AR con la política `keep`, Secret Manager, Neon CU-h) y cerrar el mes con factura 0,00 USD (SC-CLD-003, SC-CLD-010, NFR-CLD-001, NFR-CLD-002, NFR-CLD-004, NFR-CLD-007) — depende de T460
- [ ] T462 [N2] Compuerta final de la 003: `bash scripts/verify-traceability.sh --feature 003`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`, veredicto de `/oracle` y cierre por Neo (todos los SC-CLD) — depende de T461, T452, T453, T466, T473, T474, T478, T479, T480, T482, T483

---

## Phase 9: Endurecimiento tras el gate `/lock` (H-LOCK-001, 003..007, 009, 010)

**Goal**: Respuesta escrita y trazable de `/architect` a los 10 hallazgos altos de `.specify/memory/audits/gate-lock-003.md`, recortada por `/mifune` (`gate-mifune-003.md`; ver «Notas de recorte» de `spec.md`). Los hallazgos H-LOCK-002 y H-LOCK-008 se cerraron con D-17 y D-18 (T474); D-19..D-28 también están resueltas por Neo.

**Independent Test**: SC-CLD-013..020 con evidencia; mapa 1:1 sin huérfanos.

- [ ] T463 [P] [US2] Pruebas primero de la verificación perezosa de esquema: esperadas ⊆ aplicadas (200 con versiones de más, 503 si falta una), nunca en el arranque; el servidor N-1 arranca y sirve contra el esquema N; `/healthz` 200 con Neon inalcanzable (REQ-PG-013, REQ-CLD-004, SC-CLD-013) — depende de T419, T412
- [ ] T464 [US2] Implementar la verificación perezosa en `postgres-database.ts` y su uso en `/readyz` y en el primer caso de uso de la instancia (REQ-PG-013, REQ-PG-006) — depende de T463, T420
- [ ] T465 [P] [US2] Pruebas primero de los topes de sesión: `SET LOCAL` de `lock_timeout`, `statement_timeout` e `idle_in_transaction_session_timeout` (15 s), `keepAlive`, y `SIGTERM` que espera <= 7 s y cierra el pool (REQ-PG-012, REQ-CLD-006) — depende de T419
- [ ] T466 [US2] Prueba de caos con cliente muerto: matar el proceso o la conexión con la transacción abierta reteniendo el candado global; otra instancia reanuda escrituras en < 20 s; entrega para `/seraph` y `/smith` (REQ-PG-012, REQ-CLD-006, SC-CLD-014) — depende de T427, T421
- [ ] T467 [P] [US2] Pruebas primero del migrador acotado: dos migradores con el candado retenido fallan en <= 60 s; un `ALTER TABLE` contra una transacción abierta vence por `lock_timeout` 5 s con reintentos acotados y no paraliza a la aplicación; el candado se libera en `finally` (REQ-PG-014, SC-CLD-020) — depende de T419
- [ ] T468 [N2] [US4] **Condicionada** (H-MIF-001): prueba en `tests/` (archivo previsto `tests/integration/postgres-n1-compat.test.ts`, sin crear aún) que ejecuta la suite de conformidad de Postgres del commit base del PR contra el esquema ya migrado y corre **solo cuando el PR toca `migrations/`**; más la casilla *expand/contract* en `checklists/code-review.md`. Si en la implementación la prueba N-1 deja de ser barata (más de ~1 h de mantenimiento o minutos de CI relevantes), se reduce a la casilla del `code-review.md` y se escala a `/architect`. Sin trabajo `compat` de CI (REQ-PG-013, REQ-CICD-005, SC-CLD-020) — depende de T463, T429
- [ ] T469 [N2] [US3] **Ensayo único en proyecto desechable** (fusiona los antiguos T469, T470 y T476; H-MIF-002/003): (a) escribir la secuencia de bootstrap en dos fases en `terraform/README.md` y `bootstrap.sh`; (b) primer `apply` sin sondas ni referencias a secretos; (c) `gcloud run deploy --no-traffic` y rollback manual de tráfico, tras lo cual `terraform plan`/`apply` no cambia tráfico, no crea revisión y el plan siguiente es vacío (registrar los atributos reales de `ignore_changes`); (d) una rotación de versión numérica (nueva revisión, humo, promoción) sin 5xx sostenidos y un secreto malformado rechazado antes de crear versión. Un solo checklist; alternativa: anclarlo en T457/T458 si Neo lo prefiere (REQ-IAC-010, REQ-IAC-012, REQ-CICD-009, REQ-SEC-008, NFR-CLD-008, SC-CLD-015, SC-CLD-016, SC-CLD-018) — depende de T435, T436, T440, T446, T448, T472, T475
- [ ] T471 [P] [US3] Pruebas del guardia con planes JSON sintéticos: bloquear `delete`/`replace` de `google_secret_manager_secret_version` sin la etiqueta `rotacion-secreto`; `terraform validate`/`plan` falla con `TF_VAR` de secreto nula, vacía o con salto de línea; **`terraform plan` con `custom_domain = ""` NO falla y no contiene `google_cloud_run_domain_mapping`**, y con un dominio válido contiene exactamente 1 (REQ-IAC-007, REQ-IAC-013, REQ-IAC-014, SC-CLD-017, SC-CLD-024) — depende de T436
- [ ] T472 [N2] [US4] Validación de `DATABASE_URL` y del secreto HMAC en CI: `trim`, rechazo de `\n`/`\r`/espacios, formato, `sslmode=require`, `-pooler` en la URL de aplicación y no en la directa, `::add-mask::`; antes de crear la versión (REQ-CICD-009, REQ-SEC-002, SC-CLD-018) — depende de T444
- [ ] T473 [N2] [US2] `.github/workflows/vacuum-argos.yml` (cron **semanal** y `workflow_dispatch` tras cada eliminación o importación): `VACUUM (ANALYZE)` en el cron y `VACUUM (FULL, ANALYZE)` con `lock_timeout=3s` y 3 reintentos en el disparo manual, por tabla con el rol propietario por URL directa; falla ante `skipping … only table owner` o `last_vacuum` > 10 d; imprime `last_vacuum`/`last_autovacuum`/`n_dead_tup`; runbook: reactivar el cron cada 50 días (GitHub lo deshabilita a los 60 sin actividad); prueba de integración **con centinela** (usuario con correo centinela, eliminar, `VACUUM`, comprobar con `pg_relation_size`/`pageinspect` que ya no aparece) además de la estadística (REQ-PG-015, REQ-PG-011, SC-CLD-019) — depende de T425, T429
- [ ] T474 [N2] [GOV] **D-17 y D-18 resueltas por Neo (2026-11-15)**: `/architect` registró en `spec.md` la caché de 60 s de `/readyz` (REQ-CLD-004; sin OIDC, sin límite por IP, sin alerta de CU-h, sin `NEON_API_KEY`) y las cuentas de Terraform separadas (REQ-CICD-012, SC-CLD-025); implementación en T446, T435 y T412. Queda a Neo la firma final (H-LOCK-002, H-LOCK-008)
- [ ] T475 [US4] Párrafo de runbook de rotación (unas 5 líneas) en `terraform/README.md`: nueva versión numérica → revisión sin tráfico → humo → promover; si falla, rollback de tráfico; HMAC solo ante compromiso con decisión de Neo (REQ-SEC-008, SC-CLD-018) — depende de T448
- [ ] T477 [N2] [US2] (H-MIF-016) Verificar en el pooler real de Neon (conexión `-pooler`, modo transacción, rol sin `SET LOCAL`) que `ALTER ROLE argos_app SET idle_in_transaction_session_timeout='15s'` se respeta: abrir una transacción sin cerrarla y comprobar que Postgres la aborta a los 15 s. Si se respeta, el tope ocioso queda a nivel de rol y se elimina solo su `SET LOCAL` en `postgres-unit-of-work.ts` (cambio por T421/T465 con Caso B si aplica); si no, **se mantiene `SET LOCAL`** (estado por defecto, H-LOCK-003 no se recorta). Evidencia en `research.md` (REQ-PG-012) — depende de T455, T421
- [ ] T478 [US5] Prueba de restauración (H-RAMA-004): en una rama desechable de Neon (o Postgres de pruebas) tomar un dump, eliminar una cuenta después, restaurar y aplicar el runbook de T454 (REQ-PG-016); verificar que la cuenta eliminada no reaparece, que ninguna sesión restaurada es válida y que la rama de respaldo se borró; registrar el RTO medido (objetivo **<= 2 h**, NFR-CLD-015, D-24 resuelta) en `research.md` (REQ-PG-016, NFR-CLD-014, NFR-CLD-015, SC-CLD-021) — depende de T454, T455
- [ ] T479 [US1] (H-MERO-013) Cabeceras de seguridad con código propio en `src/infrastructure/http/` (sin `@fastify/helmet`): `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cache-Control` inmutable para `/assets/*` y sin caché para `index.html`; las pruebas de T411 (cabeceras y *traversal*) deben fallar antes (REQ-CLD-009, SC-CLD-022) — depende de T411, T412
- [x] T480 [N2] [GOV] **D-25, D-26, D-27 y D-28 resueltas por Neo (2026-11-15)**: `/architect` registró proveedor 7.46.2 y Terraform 1.17.2 con lockfile (REQ-IAC-002), `HOST` (REQ-CLD-003, T409, T410), dependencias exactas (T404) y encargados (spec «Supuestos»). Queda a Neo la firma de D-26 junto con T403 (REQ-IAC-002, REQ-CLD-003, REQ-PG-001)
- [ ] T481 [N2] [US3] (F3, **OPCIONAL**, sin activación inmediata ni impacto en facturación; recurso condicional por `TF_VAR_custom_domain`, default `""`) En `terraform/cloud_run.tf` y `variables.tf`: `variable "custom_domain"` (`default = ""`, `validation` que acepta `""` o un nombre de dominio) y `google_cloud_run_domain_mapping.custom` con `count = var.custom_domain != "" ? 1 : 0`, `location = var.region`, `route_name` = servicio `argos`; la compuerta de T471 pasa con `""` y con un dominio válido (REQ-IAC-014, SC-CLD-024) — depende de T440, T471
- [ ] T482 [N2] [US1] (F3, **OPCIONAL**, manual de Neo, sin activación inmediata) Verificar la propiedad del dominio en Google (Search Console, por la identidad que crea el mapeo), fijar la variable de GitHub `TF_VAR_custom_domain`, aplicar por `infraestructura.yml`, leer los registros con `gcloud beta run domain-mappings describe` y crearlos a mano en el DNS de GoDaddy; confirmar el estado Preview y el costo real (la gratuidad no está confirmada) en la factura (REQ-IAC-014, NFR-CLD-001, SC-CLD-024) — depende de T458, T481
- [ ] T483 [N2] [US1] (F2, **verificación externa, sin Terraform y sin acceso a Mirror**) Tras el cambio que Neo ejecute en el repositorio de Mirror, comprobar desde fuera: `curl` a `/healthz` por el alias `argos-avallejo.duckdns.org` (200), certificado del alias con `openssl s_client -servername`, `Set-Cookie` con `Secure; HttpOnly; SameSite=Strict` y `Host` reescrito al nombre `*.run.app` **[verificar]**; evidencia en `.specify/memory/audits/`; si falla, F1 sigue vigente (REQ-CLD-010, SC-CLD-024) — depende de T458

---

## Mapa de trazabilidad ID → tareas (1:1 con `spec.md`; sin huérfanos)

| ID | Tareas |
|---|---|
| REQ-CLD-001 | T412, T432, T433, T411, T428, T434, T404, T431 |
| REQ-CLD-009 | T411, T412, T479, T404, T453 |
| REQ-CLD-010 | T483, T458 |
| REQ-CLD-002 | T440, T401 |
| REQ-CLD-003 | T410, T412, T409, T403, T480 |
| REQ-CLD-004 | T408, T412, T411, T453 |
| REQ-CLD-005 | T410, T440, T409 |
| REQ-CLD-006 | T415 |
| REQ-CLD-007 | T408, T413, T414, T442 |
| REQ-CLD-008 | T415 |
| REQ-PG-001 | T418, T419, T420, T404, T403, T480 |
| REQ-PG-002 | T417, T422, T423, T424, T426 |
| REQ-PG-003 | T419 |
| REQ-PG-004 | T421, T427 |
| REQ-PG-005 | T421 |
| REQ-PG-006 | T420, T429 |
| REQ-PG-007 | T430 |
| REQ-PG-008 | T425 |
| REQ-PG-009 | T442, T405 |
| REQ-PG-010 | T409, T410, T428, T429 |
| REQ-PG-011 | T425, T452, T405, T473 |
| REQ-PG-012 | T421, T465, T466, T477 |
| REQ-PG-013 | T463, T464, T468 |
| REQ-PG-014 | T429, T467 |
| REQ-PG-015 | T473, T455 |
| REQ-PG-016 | T454, T478 |
| REQ-IAC-001 | T436 |
| REQ-IAC-002 | T435, T436, T456, T480 |
| REQ-IAC-003 | T436, T444 |
| REQ-IAC-004 | T437, T434 |
| REQ-IAC-005 | T438 |
| REQ-IAC-006 | T439 |
| REQ-IAC-007 | T438, T446, T471 |
| REQ-IAC-008 | T441, T444, T452, T454 |
| REQ-IAC-009 | T436, T443 |
| REQ-IAC-010 | T440, T469 |
| REQ-IAC-012 | T469, T440 |
| REQ-IAC-013 | T471, T438, T446, T485 |
| REQ-IAC-014 | T481, T482, T471, T450 |
| REQ-CICD-001 | T445 |
| REQ-CICD-002 | T446 |
| REQ-CICD-003 | T448 |
| REQ-CICD-004 | T447 |
| REQ-CICD-005 | T429, T448 |
| REQ-CICD-006 | T435, T448, T450, T456 |
| REQ-CICD-007 | T449 |
| REQ-CICD-008 | T448, T446 |
| REQ-CICD-009 | T472, T448, T469 |
| REQ-CICD-011 | T445, T446, T447, T448, T449 |
| REQ-CICD-012 | T435, T446, T457, T485 |
| REQ-SEC-001 | T438, T444, T446, T450, T451, T455, T405, T485 |
| REQ-SEC-002 | T410, T409 |
| REQ-SEC-003 | T409 |
| REQ-SEC-004 | T455 |
| REQ-SEC-005 | T433, T451 |
| REQ-SEC-006 | T435 |
| REQ-SEC-007 | T413, T414, T453 |
| REQ-SEC-008 | T475, T469 |
| NFR-CLD-001 | T402, T442, T443, T461 |
| NFR-CLD-002 | T437, T461 |
| NFR-CLD-004 | T461 |
| NFR-CLD-005 | T459, T460 |
| NFR-CLD-006 | T459 |
| NFR-CLD-007 | T461, T455 |
| NFR-CLD-008 | T457 |
| NFR-CLD-009 | T428, T431 |
| NFR-CLD-010 | T416, T431, T406 |
| NFR-CLD-011 | T433, T434 |
| NFR-CLD-012 | T435 |
| NFR-CLD-014 | T454, T478 |
| NFR-CLD-015 | T478, T454 |
| SC-CLD-001 | T434, T460, T462 |
| SC-CLD-002 | T417, T427, T431, T462 |
| SC-CLD-003 | T461, T462 |
| SC-CLD-004 | T415, T446, T451, T462 |
| SC-CLD-005 | T444, T457, T462 |
| SC-CLD-006 | T448, T458, T462 |
| SC-CLD-007 | T448, T458, T462 |
| SC-CLD-008 | T441, T444, T454, T462 |
| SC-CLD-009 | T413, T414, T462 |
| SC-CLD-010 | T461, T462 |
| SC-CLD-011 | T416, T431, T406, T462 |
| SC-CLD-012 | T460, T462 |
| SC-CLD-013 | T463, T464, T462 |
| SC-CLD-014 | T466, T462 |
| SC-CLD-015 | T469, T462 |
| SC-CLD-016 | T469, T462 |
| SC-CLD-017 | T471, T462 |
| SC-CLD-018 | T472, T475, T469, T462 |
| SC-CLD-019 | T473, T462 |
| SC-CLD-020 | T467, T468, T462 |
| SC-CLD-021 | T478, T462 |
| SC-CLD-022 | T411, T479, T462 |
| SC-CLD-023 | T448, T449, T462 |
| SC-CLD-024 | T481, T482, T483, T462 |
| SC-CLD-025 | T446, T457, T462 |

Retirados sin sustituto de ID (H-MIF-001/014): REQ-CICD-010, NFR-CLD-013, NFR-CLD-003 (fusionado en NFR-CLD-001) y REQ-IAC-011; T470 y T476 fusionadas en T469. T407 es la compuerta estructural transversal (`/mouse` + `/oracle`, 1:1 y sin huérfanos) y no implementa un ID propio. T474 (D-17, D-18) y T480 (D-25..D-28) son tareas de gobernanza con decisiones ya resueltas por Neo y aplicadas en los REQ (REQ-CLD-004, REQ-CICD-012, REQ-IAC-002, REQ-CLD-003, REQ-PG-001); T474 no implementa un ID propio y T480 se mapea a REQ-IAC-002, REQ-CLD-003 y REQ-PG-001.

## Dependencias entre fases

Phase 1 → Phase 2 → Phase 3 → Phase 4. Phase 5 (Terraform) puede avanzar en paralelo desde `T401` sin esperar a la Phase 3, salvo `T448` (necesita la imagen y el ejecutor de migraciones). Phase 6 requiere Phases 4 y 5. Phase 7 es transversal. Phase 9 se inserta antes de la Phase 8 (T457 depende de T469; T458 de T477; T448 ya no depende de T468). Phase 8 solo comienza con todas las `[N2]` previas resueltas, incluida T474.
