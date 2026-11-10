# Cloud Readiness & GCP Playbook — Link

> Estándar operativo de producción y transición a Google Cloud Platform (GCP) bajo `INV-ARCH-005` e `INV-ARCH-006`.

## 1. Preparación Obligatoria Antes de Salir de `127.0.0.1`
- **Red y Contenedores:** `HOST` configurable (`127.0.0.1` en local, `0.0.0.0` en Cloud Run / Docker) y `PORT` inyectado por entorno sin hardcodeos en configuración ni proxys.
- **Health Checks y Señales:**
  - Endpoint público `/healthz` (sin sesión, verificando conectividad real a BD con `SELECT 1`) para probes de liveness/readiness.
  - Manejadores de `SIGTERM` y `SIGINT` para drenar peticiones en vuelo (`app.close()`) y cerrar conexiones limpiamente.
- **Observabilidad Mínima:** Generación y propagación de `X-Request-ID`, logs estructurados JSON sin secretos (`req.headers.cookie`, `set-cookie`, tokens, passwords redactados) y métricas básicas de latencia/errores.

## 2. Arquitectura Objetivo en GCP (Fase 3)
- **Cómputo:** Cloud Run (escala a cero, capa gratuita amigable, HTTPS/TLS gestionado).
- **Persistencia y Archivos:** Adaptador Cloud SQL (Postgres) detrás de `UnitOfWorkPort` / `RepositorySet` sin tocar `domain/` ni `application/`; Cloud Storage (GCS) con URLs firmadas para adjuntos PDF y fotos reales.
- **Identidad y Secretos:** Secret Manager para secretos de OAuth2/SMTP y rotación; nunca secretos en `.env` versionado ni en `terraform.tfvars` subidos a Git.
- **CI/CD e IaC:** GitHub Actions reproducible con Node 22 LTS, Terraform modular con estado remoto y principio de mínimo privilegio en IAM.
