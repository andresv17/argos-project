# BORRADOR PENDIENTE DE FIRMA NIVEL 2 de Neo — Enmienda de la constitución para la Feature 003

**Estado**: `APLICADA` (2026-11-15). Firmada por Neo (Level 2), 2026-11-15, y aplicada a `.specify/memory/constitution.md` como versión 3.3.0 por `/architect`. **Nota de aplicación**: la condición de `HOST=0.0.0.0` se aplicó según D-26 (`NODE_ENV=production` **o** `ARGOS_DB_DRIVER=postgres`, rechazos de `::`, `localhost`, `10.x` y vacío), que prevalece sobre la lista de cinco condiciones conjuntivas de este borrador; se añadieron Terraform 1.17.2 y proveedor `google` 7.46.2 (D-25).
**Fecha**: 2026-11-15 | **Autor**: Architect | **Origen**: decisión D-16 de Neo (2026-11-15) | **Spec relacionada**: `specs/003-cloud-gcp/spec.md` (APPROVED) | **Tarea**: T403
**Versión actual**: 3.2.0 | **Versión propuesta**: **3.3.0 (MINOR)**

## Justificación del tipo de versión

La gobernanza reserva MAJOR para un cambio incompatible o la retirada/redefinición de un principio. Aquí no se retira ni se redefine ningún principio: se amplían el catálogo de adaptadores (II.4), la lista de tecnología autorizada (Technology Stack) y una condición de configuración (II.6). Es una ampliación de sección, por tanto MINOR. `INV-ARCH-005` ya prevé la fase Cloud («sustituir SQLite por la base Cloud no requiere cambios en `domain` ni `application`»); esta enmienda la materializa.

## (a) Principio II.4 — adaptador PostgreSQL

**Sección afectada**: Principio II, punto 4 (Regla de Dependencia Concéntrica), viñeta de `src/infrastructure/` (línea 66 de la v3.2.0).

Texto actual: «`src/infrastructure/` implementa los puertos (persistencia SQLite/memoria, HTTP Fastify, hashing, tokens, reloj, configuración) …»

Texto nuevo: «`src/infrastructure/` implementa los puertos (persistencia SQLite/memoria/**PostgreSQL**, HTTP Fastify, hashing, tokens, reloj, configuración) …». El adaptador PostgreSQL reside en `src/infrastructure/persistence/postgres/`, se elige por `ARGOS_DB_DRIVER` (`sqlite` por defecto) y debe pasar la misma suite de conformidad de repositorios que memoria y SQLite (REQ-PG-001..005, SC-CLD-002). `src/domain/` y `src/application/` no cambian (NFR-CLD-009).

## (b) Principio II.6 — `HOST=0.0.0.0` bajo condiciones de Cloud Run

**Sección afectada**: Principio II, punto 6 (Configuración aislada, `INV-ARCH-006`), y párrafo «Backend local» del Technology Stack (escucha en `127.0.0.1:3000`).

Texto añadido: «`HOST` es `127.0.0.1` por defecto. Se admite `HOST=0.0.0.0` únicamente cuando se cumplen todas estas condiciones: (1) `NODE_ENV=production`; (2) `COOKIE_SECURE=true`; (3) el proceso corre tras el frontal HTTPS de Cloud Run (`trustProxy` habilitado); (4) `PORT` lo inyecta la plataforma; (5) el esquema de configuración en `src/infrastructure/config/` rechaza `0.0.0.0` si falta alguna condición. Toda lectura de `process.env` sigue confinada a `src/infrastructure/config/` y `DATABASE_URL` nunca se registra ni se devuelve (REQ-CLD-003, REQ-SEC-002, REQ-SEC-003).»

## (c) Technology Stack — GCP, Neon, Terraform, esbuild y pg

**Sección afectada**: «Technology Stack & Repository Structure» (Fases de despliegue, Stack, Dependencias autorizadas, Estructura).

1. **Fases de despliegue**: se añade la fase Cloud real: contenedor único en Google Cloud Run (`us-central1`), PostgreSQL en Neon (`aws-us-east-2`, creado a mano), Artifact Registry, Secret Manager, Cloud Scheduler (un job de mantenimiento), Cloud Storage (exports, `us-central1`) y Cloud Logging nativo; costo objetivo 0 USD/mes dentro del Free Tier, con alarma preventiva de 1 USD (D-13).
2. **Infraestructura como código**: Terraform en `terraform/`, propio y desacoplado de Mirror, con estado en bucket versionado `argos-<project>-tfstate` (D-12), secretos por `TF_VAR_*` (D-05) y autenticación de CI por Workload Identity Federation, sin llaves JSON fijas.
3. **CI/CD**: GitHub Actions (infraestructura, despliegue con migración previa D-03, auto-PR) sobre la rama de integración `develop` (D-09). Ningún agente ejecuta `terraform apply` ni `gcloud` mutante.
4. **Dependencias autorizadas (adiciones)**: `pg`, `@types/pg`, `@fastify/static` y `esbuild` (D-07 = A, D-10), con versión exacta fijada al implementar y verificación de `/merovingian`; `hadolint`, `actionlint` y `trivy` solo en CI. `tsx` sigue siendo solo desarrollo.
5. **Estructura del repositorio (adiciones)**: `terraform/`, `Dockerfile`, `.dockerignore`, `src/infrastructure/persistence/postgres/` y `scripts/migrate-postgres.ts`.
6. **Persistencia**: SQLite sigue siendo el valor por defecto local; PostgreSQL es el adaptador de la fase Cloud. Firestore descartado.

## Fuera de esta enmienda

Grafana, BigQuery, SSO, correo real y adjuntos PDF (D-04, D-11). Sin cambios en los Principios I, III, IV, V ni VI, ni en la Gobernanza.

## Efectos y orden de aplicación

- Pie de página propuesto: `Version: 3.3.0 | Ratified: 2026-11-05 | Last Amended: 2026-11-15`; añadir línea «Versión 3.3.0 firmada por Andrés Vallejo (Nivel 2) el 2026-11-15 (tarea T403)».
- Desbloquea: T410 (configuración), T420 (adaptador PostgreSQL) y T404 (autorización de dependencias).
- Firma de Neo: [x] firmada, 2026-11-15 (aplicada como 3.3.0).

TO: Neo (Andrés Vallejo — Level 2)
