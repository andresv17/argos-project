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

## Respaldo y restauración (REQ-IAC-008, REQ-PG-016, NFR-CLD-014, NFR-CLD-015, SC-CLD-008)

Runbook manual de Neo (T454). Nada de esto lo ejecuta un flujo ni un agente. Bucket: `argos-<project_id>-exports` (`buckets.tf`), objetos bajo `dumps/`.

### Respaldo semanal por pipe (sin archivo local)

```bash
set -eo pipefail
BUCKET="argos-${TF_VAR_project_id}-exports"
OBJ="gs://${BUCKET}/dumps/$(date -u +%Y-%m-%d).sql"
# DATABASE_URL_DIRECT: URL directa (sin -pooler) del rol argos_migrator; no la escriba en el historial.
if ! pg_dump "$DATABASE_URL_DIRECT" | gcloud storage cp - "$OBJ"; then
  gcloud storage rm "$OBJ" 2>/dev/null || true   # pg_dump o la subida fallaron: no dejar un dump parcial
  echo "Respaldo FALLIDO: objeto parcial eliminado; repita el respaldo." >&2; exit 1
fi
SIZE="$(gcloud storage objects describe "$OBJ" --format='value(size)')"
if [ "${SIZE:-0}" -gt 0 ]; then echo "Respaldo valido: ${SIZE} bytes en ${OBJ}"; else
  gcloud storage rm "$OBJ"; echo "Respaldo FALLIDO: objeto vacio eliminado." >&2; exit 1
fi
```

- El nombre es solo la fecha UTC: sin datos personales. El dump viaja por pipe y nunca toca el disco local.
- `OBJ` se calcula una sola vez: así el `cp`, el borrado del parcial y la verificación de tamaño apuntan al mismo objeto aunque el bloque cruce la medianoche UTC.
- `set -eo pipefail` en una shell interactiva cierra la sesión si el bloque falla (por `exit` o por `-e`): ejecute el bloque en una subshell `( ... )` o guárdelo como script y lánzelo con `bash`.
- `set -eo pipefail` hace que falle el pipe si falla `pg_dump` (no solo `gcloud`); en ese caso, o si el objeto queda vacío, se borra y el respaldo NO es válido: repítalo antes de darlo por hecho.
- Sin cifrado propio: el bucket cifra en reposo (acceso uniforme, acceso público prohibido).
- Vida de 14 días (regla de ciclo de vida sobre `dumps/`) y soft delete en 0 s: el borrado es definitivo a los 14 días.
- Cadencia semanal estricta (RPO <= 7 d, NFR-CLD-014): con 14 días de vida quedan al menos 2 copias; un dump omitido deja 1. Ponga un recordatorio semanal en su calendario: no hay automatización (R-14).
- Lectura limitada a Neo (solo Neo lee y escribe el bucket): Terraform y `bootstrap.sh` no conceden a las cuentas de servicio de CI ningún rol que lea objetos del bucket (T441a: solo permisos de metadatos de buckets, sin `storage.objects.*`); compruébelo con `gcloud storage buckets get-iam-policy "gs://${BUCKET}"` (sin entradas `serviceAccount:`). Compruebe el último dump con `gcloud storage ls -l "gs://${BUCKET}/dumps/"` (antigüedad <= 7 días).
- Límite residual aceptado (H-ORA-T441a-2; decisión de Neo, opción (a), 2026-11-16): el rol de `apply` conserva `resourcemanager.projectIamAdmin`, `serviceAccountAdmin` y `serviceAccountUser`, de modo que un `apply` comprometido podría concederse a sí mismo lectura de `dumps/`. Es un límite aceptado: `apply` en `main` es la cuenta autorizada de infraestructura. Por eso «ninguna cuenta de CI lee los dumps» se cumple como configuración nominal, no como garantía frente a un `apply` comprometido.
- La comprobación `gcloud storage buckets get-iam-policy "gs://${BUCKET}"` no muestra los bindings heredados del proyecto (H-ORA-T441a-3). La verificación completa requiere además `gcloud projects get-iam-policy "$TF_VAR_project_id" --flatten="bindings[].members" --filter="bindings.members:serviceAccount" --format="table(bindings.role,bindings.members)"`, revisando que ninguna cuenta de servicio de CI tenga un rol con `storage.objects.get` o `storage.objects.list` (p. ej. `roles/storage.admin`, `roles/storage.objectViewer`, `roles/viewer`).

### Restauración sin resurrección (REQ-PG-016)

Prerrequisitos: la restauración usa el mismo secreto HMAC de auditoría que la base viva (`ARGOS_AUDIT_HMAC_SECRET`); rotarlo rompe el paso 3. `LIVE_URL` es la URL directa de la base viva; `RESTORED_URL` es la URL directa de una rama o base vacía de Neon creada para restaurar. Los archivos `*.txt` contienen seudónimos HMAC y IDs: guárdelos fuera del repositorio y bórrelos al terminar.

**Paso 1. Exportar de la base viva las filas `ACCOUNT_DELETE`** (antes de restaurar; `entity_id` es el HMAC del ID):

```bash
psql "$LIVE_URL" -X -A -t -c "SELECT entity_id FROM audit_log WHERE mutation_type = 'ACCOUNT_DELETE'" > account_delete_ids.txt
```

**Paso 2. Restaurar** el dump elegido (el más reciente, de <= 7 días) en la base vacía; se aborta y revierte ante el primer error:

```bash
gcloud storage cat "gs://${BUCKET}/dumps/<fecha>.sql" | psql "$RESTORED_URL" -X -v ON_ERROR_STOP=1 --single-transaction
```

**Paso 3. Calcular el HMAC de cada `user.id` restaurado y eliminar a los coincidentes con el paso 1.** El HMAC es `HMAC-SHA256(clave hex, user.id)` igual que el adaptador de producción. Defina el secreto sin dejarlo en el historial (`read -rs ARGOS_AUDIT_HMAC_SECRET; export ARGOS_AUDIT_HMAC_SECRET`):

```bash
psql "$RESTORED_URL" -X -A -t -c "SELECT id FROM users" | node -e 'const{createHmac}=require("node:crypto"),fs=require("node:fs");const del=new Set(fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean));const key=Buffer.from(process.env.ARGOS_AUDIT_HMAC_SECRET,"hex");for(const id of fs.readFileSync(0,"utf8").split("\n").filter(Boolean))if(del.has(createHmac("sha256",key).update(id,"utf8").digest("hex")))console.log(id)' account_delete_ids.txt > ids_olvidados.txt
```

La eliminación sigue el orden de hoja a raíz del caso de uso `DeleteAccountUseCase` (B9) y termina con la poscondición B10 (cero referencias). Se ejecuta en una transacción desde el directorio de `ids_olvidados.txt`:

```bash
psql "$RESTORED_URL" -X -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
CREATE TEMP TABLE olvidados (id text PRIMARY KEY);
\copy olvidados (id) FROM 'ids_olvidados.txt'
DELETE FROM pets WHERE owner_user_id IN (SELECT id FROM olvidados);
DELETE FROM household_members WHERE user_id IN (SELECT id FROM olvidados);
DELETE FROM households WHERE owner_user_id IN (SELECT id FROM olvidados);
DELETE FROM sessions WHERE user_id IN (SELECT id FROM olvidados);
DELETE FROM login_attempts WHERE username IN (SELECT username FROM users WHERE id IN (SELECT id FROM olvidados));
DELETE FROM users WHERE id IN (SELECT id FROM olvidados);
SELECT (SELECT count(*) FROM pets WHERE owner_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM households WHERE owner_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM household_members WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM household_invitations WHERE invited_by_user_id IN (SELECT id FROM olvidados) OR invitee_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM backup_confirmation_tokens WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM rate_limit_events WHERE subject_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM users WHERE id IN (SELECT id FROM olvidados)) AS referencias_restantes;
SQL
```

`referencias_restantes` debe ser 0. Los registros clínicos, las asignaciones, las invitaciones, los tokens de confirmación y los eventos de límite desaparecen por las claves foráneas `ON DELETE CASCADE`. Nota: el `audit_log` restaurado conserva en claro los IDs de esas cuentas y no tiene su fila `ACCOUNT_DELETE`; este runbook no lo corrige (queda para decisión, H-K-T454-2).

**Paso 4. Revocar todas las sesiones restauradas** (ninguna sesión del dump debe seguir válida):

```bash
psql "$RESTORED_URL" -X -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
UPDATE sessions
   SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       data = jsonb_set(data, '{revokedAt}', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 WHERE revoked_at IS NULL;
SQL
```

**Paso 5. Eliminar la rama de respaldo de Neon.** Si restauró con la función de restauración de Neon (PITR o rama), Neon crea una rama de respaldo: bórrela en la consola de Neon (Branches). Con restauración por dump, borre en la consola de Neon la rama o base temporal que ya no se use. No hay comando de CLI verificado para esto y no hay clave de API de Neon en los secretos (D-19).

**Paso 6. Registrar el RPO y el RTO efectivos.** RPO = ahora − fecha del dump usado (objetivo <= 7 d). RTO = desde la decisión de restaurar hasta el servicio sirviendo con datos válidos y los pasos 1-5 aplicados (objetivo <= 2 h, NFR-CLD-015). En la prueba T478 se anotan en `research.md`; en un incidente real, en el registro del incidente.

Para que el servicio use la base restaurada, cambie la URL en el secreto `TF_VAR_database_url` y siga el runbook de rotación (nueva versión numérica, revisión sin tráfico, humo, promover). Esa parte se ensaya en T478 y T469.

## Despliegue

1. Bootstrap del día 0 (sección anterior).
2. CI (`infraestructura.yml`, T446) corre `plan` en PR y `apply` solo desde `main` con aprobación de Neo; junto con `deploy-argos.yml`, solo lee los secretos y variables de la tabla anterior.
