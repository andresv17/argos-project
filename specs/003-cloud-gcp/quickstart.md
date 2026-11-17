# Quickstart y mapa de aceptación: Feature 003

**Estado**: `APPROVED` (Aprobada por Neo (Level 2) el 2026-11-15, bajo condiciones R1 a R5 del veredicto Oracle). Describe cómo se verificará la 003; nada de esto se ejecuta en la fase de especificación.

## 1. Local (sin nube, regresión de la 002)
```bash
npm ci && npm run test:gate            # SQLite, debe seguir 100 % verde (SC-CLD-011)
docker compose -f docker-compose.test.yml up -d    # Postgres 17 de pruebas
TEST_DATABASE_URL=postgres://... npm test           # suite de conformidad x3 adaptadores (SC-CLD-002)
```

## 2. Contenedor local contra Postgres local
```bash
docker build -t argos:local .
docker run --rm -p 8080:8080 -e PORT=8080 -e HOST=0.0.0.0 -e COOKIE_SECURE=false \
  -e ARGOS_DB_DRIVER=postgres -e DATABASE_URL=postgres://... -e ARGOS_AUDIT_HMAC_SECRET=<hex 64+> argos:local
curl -fsS localhost:8080/healthz && curl -fsS localhost:8080/readyz
```
(`COOKIE_SECURE=false` solo en local por HTTP; en Cloud Run es `true`.)

## 3. Nube (solo con autorización de Neo, Fase 8)
1. Neo crea Neon (`aws-us-east-2`), roles y secretos de GitHub (T455).
2. Neo ejecuta `terraform/bootstrap.sh` (una vez).
3. Fusión a `main`: `infraestructura.yml` aplica; `deploy-argos.yml` migra, despliega y hace humo.
4. Verificar F1 `https://<service>-<hash>.a.run.app/healthz` y el recorrido §4; luego, si Neo los activa, F2 (T483) y F3 (T482), ver §7.

## 4. Mapa de aceptación

| SC | Cómo se verifica | Evidencia esperada |
|---|---|---|
| SC-CLD-001 | Recorrido 002 §6 (7 pasos) por `/zee` y `/kid` contra la URL de Cloud Run | informe en `.specify/memory/audits/recorrido-aceptacion-003.md` |
| SC-CLD-002 | `npm test` con `TEST_DATABASE_URL` y concurrencia de 2 pools | informe de pruebas |
| SC-CLD-003 | Factura del mes 0,00 USD (Billing → Reportes, filtro etiqueta `app=argos`) | captura/exportación en `claude/` |
| SC-CLD-004 | `gitleaks detect` + inspección de capas de imagen + búsqueda en logs | salida de los escaneos |
| SC-CLD-005 | `terraform plan` en proyecto vacío; `grep -ri mirror terraform/` | plan y grep = 0 |
| SC-CLD-006 / 007 | Fusión con humo forzado a fallar / migración forzada a fallar en una rama de prueba | historial del flujo |
| SC-CLD-008 | Subir objeto de prueba a `dumps/`, comprobar regla de ciclo de vida y `publicAccessPrevention` | `gcloud storage buckets describe` |
| SC-CLD-009 | `curl -X POST /internal/maintenance` sin token (401) y disparo manual del job (200) | logs de Cloud Run |
| SC-CLD-010 | `gcloud artifacts docker images list` tras 5 despliegues <= 400 MB | salida del comando |
| SC-CLD-011 | `npm run test:gate` y `git diff --stat -- src/domain src/application` | salida |
| SC-CLD-012 | Esperar 10 min sin tráfico (Neon se suspende a los 5), iniciar sesión | grabación o informe |
| SC-CLD-024 | F1: `curl` a `/healthz`; F2: `curl` y `openssl s_client -servername argos-avallejo.duckdns.org`; F3: `terraform plan` con `custom_domain` vacío y con dominio | salida de los comandos en `.specify/memory/audits/` |
| SC-CLD-025 | PR con `argos-terraform-plan@` falla al crear un recurso (403); `apply` en espera de aprobación del Environment `produccion` | historial del flujo |
| SC-CLD-021 | Prueba de restauración T478 con el runbook de REQ-PG-016 | informe con RTO medido |

## 4.1 Después de eliminar una cuenta o importar
Disparar `vacuum-argos.yml` con `workflow_dispatch` (REQ-PG-011, REQ-PG-015). Tras verificar T430, borrar de forma segura el `.db`, `-wal` y `-shm` locales de la 002 (H-RAMA-014). Al restaurar (PITR, rama o dump) seguir el runbook de REQ-PG-016 (T454). Los dumps de `dumps/` viven 14 días (R-14): con cadencia semanal hay al menos 2 copias y la purga física completa de una cuenta eliminada ocurre como máximo a los 14 días.

## 4.2 Respaldo semanal y restauración (REQ-IAC-008, REQ-PG-016, NFR-CLD-014, T454)
Cada semana, sin saltarse ninguna (RPO <= 7 d), Neo ejecuta con su identidad, con `set -eo pipefail`, asignando antes `OBJ="gs://argos-${TF_VAR_project_id}-exports/dumps/$(date -u +%Y-%m-%d).sql"` (un único `$(date`, para que el objeto subido y el verificado sean el mismo aunque el pipe cruce medianoche UTC): `if ! pg_dump "$DATABASE_URL_DIRECT" | gcloud storage cp - "$OBJ"; then gcloud storage rm "$OBJ"; exit 1; fi` (por pipe, sin archivo local; el objeto vive 14 días, al menos 2 copias) y comprueba que el objeto no está vacío (`gcloud storage objects describe "$OBJ" --format='value(size)'`, con `[ "${SIZE:-0}" -gt 0 ]`; si no, bórralo y repite). Un respaldo sin esa verificación no es válido. El runbook completo de respaldo y los pasos 1-6 de restauración de REQ-PG-016 están en `terraform/README.md` (sección «Respaldo y restauración»). La restauración se ensaya en T478.

## 5. Presupuesto de cuota para vigilar (primer mes)
Cloud Run <= 60 % de 180 000 vCPU-s y 360 000 GiB-s; AR <= 400 MB; Secret Manager <= 4 versiones activas; Neon <= 60 CU-h y 0,5 GB; Scheduler 1 job; GCS <= 1 GB de los 5 GB compartidos.

## 6. Guía de bootstrap del día 0: secretos y variables de GitHub (REQ-CICD-006, REQ-CICD-012, REQ-IAC-014)
Todo se crea el día 0; nada queda pendiente de inventar. Solo Neo ejecuta estos pasos (T456). Orden:

1. Neo crea la base en Neon (T455): rol `argos_app` (URL con `-pooler`) y rol `argos_migrator` (URL directa, sin `-pooler`).
2. Neo exporta `ARGOS_PROJECT_ID`, `ARGOS_GITHUB_REPO`, `ARGOS_BILLING_ACCOUNT` y `ARGOS_GITHUB_REVIEWER`, y ejecuta `bash terraform/bootstrap.sh` (dry-run, imprime los comandos) y después `bash terraform/bootstrap.sh --execute`. El script crea el proyecto, el bucket de estado, WIF, `argos-terraform-plan@` y `argos-terraform@`; en su paso 6 crea las **variables** de GitHub, en el paso 7 el Environment `produccion` (revisor Neo, rama `main`) y en el paso 8 solo imprime las órdenes de los secretos.
3. Neo pega los **secretos** por entrada estándar (los valores nunca van al historial ni al repo): `gh secret set TF_VAR_database_url --repo <dueno/repo>`, `gh secret set TF_VAR_audit_hmac_secret --repo <dueno/repo>` y `gh secret set DATABASE_URL_DIRECT --repo <dueno/repo>`.
4. Neo revisa en GitHub (Settings > Secrets and variables > Actions) que todo exista. Después se abre un PR que toque `terraform/**`: el primer plan corre en `infraestructura.yml` (`validate` y `plan`); el `apply` solo corre desde `main` y espera la aprobación de Neo en `produccion`.

| Tipo | Nombre | Quién lo crea y valor inicial |
|---|---|---|
| Secreto | `TF_VAR_database_url` | Neo, paso 3: URL de Neon con `-pooler` (rol `argos_app`) |
| Secreto | `TF_VAR_audit_hmac_secret` | Neo, paso 3: >= 32 bytes hex |
| Secreto | `DATABASE_URL_DIRECT` | Neo, paso 3: URL directa (rol `argos_migrator`) |
| Variable | `TF_VAR_project_id` | `bootstrap.sh` paso 6: ID del proyecto GCP |
| Variable | `TF_VAR_region` | `bootstrap.sh` paso 6: `us-central1` |
| Variable | `TF_VAR_billing_account` | `bootstrap.sh` paso 6, desde `ARGOS_BILLING_ACCOUNT`. **Obligatoria**: sin ella el presupuesto no se planifica (REQ-IAC-009) |
| Variable | `TF_VAR_custom_domain` | Neo: `""` (F3 desactivado; el script solo imprime la orden, y si GitHub rechaza el valor vacío no se crea la variable: se evalúa como vacía) |
| Variable | `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_TERRAFORM_SA`, `GCP_TERRAFORM_PLAN_SA`, `TF_STATE_BUCKET` | `bootstrap.sh` paso 6 |
| Environment | `produccion` | `bootstrap.sh` paso 7: revisor requerido: Neo |

Si la aprobación en `produccion` supera 45 min y el sondeo de `deploy-argos.yml` falla, re-ejecute deploy-argos.yml tras aprobar y terminar el apply.

Sin `NEON_API_KEY` ni `NEON_PROJECT_ID` (D-19). Tampoco existe `GCP_SA_KEY`: la autenticación es por WIF (D-05, D-18). `custom_domain = ""` es válido: Terraform omite el mapeo (`count = 0`).

## 7. Frentes de exposición: activación y verificación
- **F1** (principal): la URL `https://<service>-<hash>.a.run.app` existe tras el primer `apply` y el primer despliegue; sin Load Balancer.
- **F2** (DuckDNS, fuera del Terraform de Argos): `argos-avallejo.duckdns.org` lo sirve el Nginx de la VM de Mirror como *reverse proxy* hacia F1. Neo ejecuta el cambio **en el repositorio de Mirror** (Argos no lo toca). Requisitos para Mirror: enviar `Host` = nombre `*.run.app` del servicio, SNI correcto hacia el origen (`proxy_ssl_server_name on`, `proxy_ssl_name`), certificado TLS válido para el alias, `X-Forwarded-For` y `X-Forwarded-Proto: https`, y cron de DuckDNS vigente. Verificación desde fuera: T483.
- **F3** (GoDaddy): (1) verificar el dominio base en Google (Search Console); (2) fijar la variable `TF_VAR_custom_domain` con el dominio; (3) `apply` por `infraestructura.yml`; (4) leer los registros con `gcloud beta run domain-mappings describe` y crearlos a mano en GoDaddy. El mapeo de dominio es **Preview** y su gratuidad no está confirmada por la documentación oficial (`research.md §7.1`): T482 y T461 verifican el costo.
