# Terraform de ARGOS (Feature 003, GCP)

Infraestructura de ARGOS en un proyecto GCP propio. Solo recursos `${var.project_prefix}-*` (por defecto `argos`);
ningún recurso ni `data` referencia otros sistemas del mismo titular (REQ-IAC-003, SC-CLD-005).
Versiones fijadas (D-25): Terraform `1.17.2`, proveedor `hashicorp/google` `7.46.2`.

## Archivos

| Archivo | Contenido |
|---|---|
| `provider.tf`, `backend.tf` | Proveedor y backend `gcs` vacío (bucket y prefijo por `-backend-config`) |
| `variables.tf`, `outputs.tf` | Entradas por `TF_VAR_*` y salidas (sin secretos) |
| `services.tf` | 12 APIs mínimas (REQ-IAC-009), incluida `billingbudgets.googleapis.com` |
| `artifact_registry.tf`, `cloud_run.tf`, `scheduler.tf` | Registro Docker, servicio y disparador |
| `secret_manager.tf`, `iam.tf` | Secretos (2) y cuentas de servicio con privilegio mínimo |
| `buckets.tf` | Bucket de dumps de 14 días |
| `budget.tf` | Presupuesto de 1 USD con umbrales 50/90/100 % (D-13) |
| `bootstrap.sh` | Día 0; lo ejecuta solo Neo (dry-run por defecto, `--execute` explícito) |
| `.terraform.lock.hcl` | Versionado: fija el hash del proveedor para `linux_amd64` y `darwin_arm64` |

## Variables (`TF_VAR_*`)

| Variable | Secreta | Notas |
|---|---|---|
| `project_id` | no | ID del proyecto GCP |
| `billing_account` | no | `AAAAAA-BBBBBB-CCCCCC`, para el presupuesto |
| `database_url`, `audit_hmac_secret` | **sí** (`sensitive = true`) | Sin default; `validation` no vacía y sin saltos de línea (REQ-IAC-013) |
| `region`, `project_prefix`, `custom_domain` | no | Con default (`us-central1`, `argos`, `""`) |

Toda variable o salida que transporte un secreto lleva `sensitive = true` (REQ-SEC-001). Hoy ninguna salida expone secretos.
`sensitive` oculta el valor en la consola, pero el estado de Terraform lo conserva en claro: por eso el bucket de estado es privado.

## Soft delete en 0 s (REQ-IAC-008, SC-CLD-008)

Google aplica por defecto 7 días de soft delete a los buckets nuevos; ARGOS lo desactiva en los dos buckets:

- Bucket de dumps: `soft_delete_policy { retention_duration_seconds = 0 }` en `buckets.tf`.
- Bucket de estado: `--soft-delete-duration=0` en `bootstrap.sh`.

Verificación: `gcloud storage buckets describe gs://<bucket>` debe mostrar `softDeletePolicy.retentionDurationSeconds: 0`.

## Compuertas locales (sin credenciales ni `apply`)

```bash
cd terraform
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
grep -ri "$(printf 'mir''ror')" . --exclude-dir=.terraform   # REQ-IAC-003: debe dar 0 coincidencias
cd .. && npx vitest run tests/unit/terraform-*.spec.ts
```

Para regenerar el lock con las dos plataformas: `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`.

## Bootstrap del día 0: secretos y variables de GitHub (REQ-CICD-006, REQ-SEC-001, REQ-IAC-014, REQ-CICD-012)

Solo Neo ejecuta estos pasos (T456). Detalle y orden completo en `specs/003-cloud-gcp/quickstart.md` sección 6.

1. `bash terraform/bootstrap.sh` en dry-run (imprime los comandos) y luego `bash terraform/bootstrap.sh --execute`, con `ARGOS_PROJECT_ID`, `ARGOS_GITHUB_REPO`, `ARGOS_BILLING_ACCOUNT` y `ARGOS_GITHUB_REVIEWER` exportadas. El script concede `roles/billing.costsManager` a `argos-terraform@` sobre la **cuenta de facturación** (no de proyecto; requisito del presupuesto, REQ-IAC-009); no se concede a `argos-terraform-plan@` ni se usa `billing.admin`.
2. El paso 6 del script crea las variables de GitHub y el paso 7 el Environment `produccion` (revisor: Neo, solo rama `main`). El paso 8 solo imprime las órdenes de los secretos.
3. Neo pega los secretos por entrada estándar: `gh secret set TF_VAR_database_url --repo <dueno/repo>`, `gh secret set TF_VAR_audit_hmac_secret --repo <dueno/repo>` y `gh secret set DATABASE_URL_DIRECT --repo <dueno/repo>`.
4. Se abre un PR que toque `terraform/**`: el primer plan corre en `infraestructura.yml`; el `apply` solo corre desde `main` tras la aprobación de Neo en `produccion`.

| Tipo | Nombre | Origen |
|---|---|---|
| Secreto | `TF_VAR_database_url` | Neo (URL de Neon con `-pooler`, rol `argos_app`) |
| Secreto | `TF_VAR_audit_hmac_secret` | Neo (>= 32 bytes hex) |
| Secreto | `DATABASE_URL_DIRECT` | Neo (URL directa sin `-pooler`, rol `argos_migrator`); la leen la validación de secretos de `infraestructura.yml` y la migración de `deploy-argos.yml` |
| Variable | `TF_VAR_project_id`, `TF_VAR_region` | `bootstrap.sh` paso 6 |
| Variable | `TF_VAR_billing_account` | `bootstrap.sh` paso 6, desde `ARGOS_BILLING_ACCOUNT`; **obligatoria** (presupuesto, REQ-IAC-009) |
| Variable | `TF_VAR_custom_domain` | Neo: `""` (F3 desactivado); si GitHub rechaza el valor vacío, no crearla |
| Variable | `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_TERRAFORM_SA`, `GCP_TERRAFORM_PLAN_SA`, `TF_STATE_BUCKET` | `bootstrap.sh` paso 6 |
| Environment | `produccion` | `bootstrap.sh` paso 7: revisor requerido Neo |

Sin `NEON_API_KEY` ni `NEON_PROJECT_ID` (D-19) y sin `GCP_SA_KEY` (WIF, D-05).

## Despliegue

1. Bootstrap del día 0 (sección anterior).
2. CI (`infraestructura.yml`, T446) corre `plan` en PR y `apply` solo desde `main` con aprobación de Neo; junto con `deploy-argos.yml`, solo lee los secretos y variables de la tabla anterior.
