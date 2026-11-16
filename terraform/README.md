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

## Despliegue

1. Neo ejecuta `bash terraform/bootstrap.sh` (primero en dry-run). Ver `specs/003-cloud-gcp/quickstart.md`. El script concede `roles/billing.costsManager` a `argos-terraform@` sobre la **cuenta de facturación** (no de proyecto; requisito del presupuesto, REQ-IAC-009); no se concede a `argos-terraform-plan@` ni se usa `billing.admin`.
2. CI (`infraestructura.yml`, T446) corre `plan` en PR y `apply` solo desde `main` con aprobación de Neo.
3. Variables de CI: `TF_VAR_database_url`, `TF_VAR_audit_hmac_secret`, `TF_VAR_billing_account`.
