# Terraform de ARGOS (Feature 003, GCP)

Infraestructura de ARGOS en un proyecto GCP propio. Solo recursos `${var.project_prefix}-*` (por defecto `argos`);
ningún recurso ni `data` referencia otros sistemas del mismo titular (REQ-IAC-003, SC-CLD-005).
Versiones fijadas (D-25): Terraform `1.17.2`, proveedor `hashicorp/google` `7.46.2`.

## Archivos

| Archivo | Contenido |
|---|---|
| `provider.tf`, `backend.tf` | Proveedor y backend `gcs` vacío (bucket y prefijo por `-backend-config`) |
| `variables.tf`, `outputs.tf` | Entradas por `TF_VAR_*` y salidas (sin secretos) |
| `services.tf` | 14 APIs mínimas (REQ-IAC-009), incluidas `billingbudgets.googleapis.com` y, por la enmienda 006 (N2-05), `aiplatform.googleapis.com` y `cloudtasks.googleapis.com` |
| `artifact_registry.tf`, `cloud_run.tf`, `scheduler.tf` | Registro Docker, servicio y disparador |
| `secret_manager.tf`, `iam.tf` | Secretos (2) y cuentas de servicio con privilegio mínimo |
| `buckets.tf` | Bucket de dumps de 14 días |
| `budget.tf` | Presupuesto de 5 USD equivalentes (22500 COP) con umbrales 50/90/100 % y filtro por proyecto (D-13; enmienda 006, N2-05 y N2-04) |
| `bootstrap.sh` | Día 0; lo ejecuta solo Neo (dry-run por defecto, `--execute` explícito) |
| `.terraform.lock.hcl` | Versionado: fija el hash del proveedor para `linux_amd64` y `darwin_arm64` |

## Variables (`TF_VAR_*`)

| Variable | Secreta | Notas |
|---|---|---|
| `project_id` | no | ID del proyecto GCP |
| `billing_account` | no | `AAAAAA-BBBBBB-CCCCCC`, para el presupuesto |
| `database_url`, `audit_hmac_secret`, `share_ip_hmac_secret` | **sí** (`sensitive = true`) | Sin default; `validation` no vacía y sin saltos de línea (REQ-IAC-013) |
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

Primero ejecute `bash scripts/verify-bootstrap-inputs.sh` (solo lectura local, paso previo a `bootstrap.sh`): comprueba herramientas (`gh`, `gcloud`, `terraform`, sesiones) y el formato de las variables no secretas. Salida 0 = todo pasa, 1 = alguna comprobación falla, 2 = faltan variables obligatorias.

1. `bash terraform/bootstrap.sh` en dry-run (imprime los comandos) y luego `bash terraform/bootstrap.sh --execute`, con `ARGOS_PROJECT_ID`, `ARGOS_GITHUB_REPO`, `ARGOS_BILLING_ACCOUNT` y `ARGOS_GITHUB_REVIEWER` exportadas. El script concede `roles/billing.costsManager` a `argos-terraform@` sobre la **cuenta de facturación** (no de proyecto; requisito del presupuesto, REQ-IAC-009); no se concede a `argos-terraform-plan@` ni se usa `billing.admin`.
2. El paso 6 del script crea las variables de GitHub y el paso 7 el Environment `produccion` (revisor: Neo, solo rama `main`). El paso 8 solo imprime las órdenes de los secretos.
3. Neo pega los secretos por entrada estándar: `gh secret set TF_VAR_database_url --repo <dueno/repo>`, `gh secret set TF_VAR_audit_hmac_secret --repo <dueno/repo>`, `gh secret set TF_VAR_share_ip_hmac_secret --repo <dueno/repo>` y `gh secret set DATABASE_URL_DIRECT --repo <dueno/repo>`.
4. Se abre un PR que toque `terraform/**`: el primer plan corre en `infraestructura.yml`; el `apply` solo corre desde `main` tras la aprobación de Neo en `produccion`.

| Tipo | Nombre | Origen |
|---|---|---|
| Secreto | `TF_VAR_database_url` | Neo (URL de Neon con `-pooler`, rol `argos_app`) |
| Secreto | `TF_VAR_audit_hmac_secret` | Neo (>= 32 bytes hex) |
| Secreto | `TF_VAR_share_ip_hmac_secret` | Neo (>= 32 bytes hex; HMAC de la IP en la auditoría de enlaces compartidos). Único input humano de la directiva 005: lo lee `infraestructura.yml` y crea el secreto `argos-share-ip-hmac-secret` por Terraform |
| Secreto | `DATABASE_URL_DIRECT` | Neo (URL directa sin `-pooler`, rol `argos_migrator`); la leen la validación de secretos de `infraestructura.yml` y la migración de `deploy-argos.yml` |
| Variable | `TF_VAR_project_id`, `TF_VAR_region` | `bootstrap.sh` paso 6 |
| Variable | `TF_VAR_billing_account` | `bootstrap.sh` paso 6, desde `ARGOS_BILLING_ACCOUNT`; **obligatoria** (presupuesto, REQ-IAC-009) |
| Variable | `TF_VAR_custom_domain` | Neo: `""` (F3 desactivado); si GitHub rechaza el valor vacío, no crearla |
| Variable | `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_TERRAFORM_SA`, `GCP_TERRAFORM_PLAN_SA`, `TF_STATE_BUCKET` | `bootstrap.sh` paso 6 |
| Environment | `produccion` | `bootstrap.sh` paso 7: revisor requerido Neo |

Si la aprobación en `produccion` supera 45 min y el sondeo de `deploy-argos.yml` falla, re-ejecute deploy-argos.yml tras aprobar y terminar el apply.

Sin `NEON_API_KEY` ni `NEON_PROJECT_ID` (D-19) y sin `GCP_SA_KEY` (WIF, D-05).

## Secuencia de bootstrap en dos fases (T469 a; REQ-IAC-010, REQ-IAC-012)

Solo documentación: no cambia ninguna lógica de `bootstrap.sh` ni de Terraform.

**Fase 1: día 0 manual (Neo, una vez, `bootstrap.sh --execute`).** Crea lo que Terraform necesita para existir y que no puede crear él mismo: proyecto y facturación, APIs mínimas, bucket de estado, cuentas `argos-terraform-plan@` y `argos-terraform@` con roles acotados, Workload Identity Federation, variables de GitHub, Environment `produccion` y, por entrada estándar, los 3 secretos de GitHub.

**Fase 2: Terraform desde CI (`infraestructura.yml`, solo `main` con aprobación en `produccion`).** El primer `apply` crea los recursos `argos-*` con una imagen marcadora pública, sin sondas propias y sin referencias a secretos ni `env`. Después, `deploy-argos.yml` (cuenta `argos-deployer@`) fija imagen, `env`, sondas, versión numérica de secretos y tráfico.

Atributos de `google_cloud_run_v2_service.argos` cubiertos por `ignore_changes` (verificados contra el servicio real en T469: ninguno rompe el plan, que queda no-op): `traffic`, `client`, `client_version`, `template[0].revision`, `template[0].labels`, `template[0].annotations`, `template[0].containers[0].image`, `template[0].containers[0].env`, `template[0].containers[0].startup_probe`, `template[0].containers[0].liveness_probe`. Evidencia del ensayo: `.specify/memory/audits/link-T469-ensayo-unico.md`.

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

### Fuera del respaldo exportable (feature 006)

La escena del hogar en pixel art (REQ-ESC6-022, REQ-ESC6-018, REQ-ESC6-029; T836). Pruebas estáticas en `tests/unit/backup-restore-runbook-docs.spec.ts` y `tests/unit/backup-runbook-hardening.spec.ts`.

- La foto del hogar y las escenas no viajan en el sobre de respaldo `3.x` de la aplicación (`ExportBackupUseCase`): el sobre no lleva `household_photos`, `home_scenes` ni `scene_*`. Importar un respaldo no restaura la escena: queda `idle` u `outdated`, sin imagen.
- La foto del hogar cuenta en la cuota de 1 GiB del propietario del hogar (`households.owner_user_id`, no de quien la sube, REQ-ARC-005); las escenas no cuentan.
- El `pg_dump` semanal guarda las filas de la base (incluidas las 6 tablas de la escena y la referencia de la foto del hogar) y no incluye los objetos de Cloud Storage de los prefijos `scenes/` y `households/`. Tras restaurar, la conciliación diaria (`/internal/maintenance`, una sola rutina) encola con `DELETE` los objetos de esos prefijos sin referencia con más de 15 min (24 h en `pets/`).
- Eliminar la cuenta, la mascota o el hogar purga sus objetos de escena (`media_deletion_queue`); en la restauración, el paso 3 elimina las tablas de la escena por `ON DELETE CASCADE` (`home_scenes`, `scene_attempts`, `scene_image_sources` y `household_photos` con el hogar; `scene_consents`, `scene_quota_carry` y las escenas sin hogar con la cuenta).
- Quedan sin clave foránea, por diseño, `scene_attempts.actor_user_id`, `scene_image_sources.owner_user_id` y `household_photos.uploaded_by_user_id` (seudonimizadas con HMAC al eliminar la cuenta en la base viva). H-KEY-F4-1 corregido en el runbook: el paso 3 las limpia explícitamente para las cuentas olvidadas (encola antes en `media_deletion_queue` los objetos de `scenes/` y `households/`) y `referencias_restantes` las cuenta; añadir una clave foránea en el esquema (opción (b)) queda para decisión de Neo.
- Ventana residual: PITR y los volcados conservan filas de escena hasta su vencimiento (`RR-06-07`, `REQ-BOR-004`); las imágenes y fotos viven solo en el bucket de medios.

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

La eliminación sigue el orden de hoja a raíz del caso de uso `DeleteAccountUseCase` (B9) y termina con la poscondición B10 (cero referencias). Se ejecuta en una transacción desde el directorio de `ids_olvidados.txt`. Nota (H-O-T478-2): `\copy` es una meta-orden del cliente `psql`; requiere `psql` cliente local y lee `ids_olvidados.txt` de la máquina donde corre `psql` (no del servidor), por lo que el comando debe ejecutarse desde ese directorio:

```bash
psql "$RESTORED_URL" -X -v ON_ERROR_STOP=1 --single-transaction <<'SQL'
CREATE TEMP TABLE olvidados (id text PRIMARY KEY);
\copy olvidados (id) FROM 'ids_olvidados.txt'
DELETE FROM pets WHERE owner_user_id IN (SELECT id FROM olvidados);
DELETE FROM household_members WHERE user_id IN (SELECT id FROM olvidados);
DELETE FROM households WHERE owner_user_id IN (SELECT id FROM olvidados);
DELETE FROM sessions WHERE user_id IN (SELECT id FROM olvidados);
DELETE FROM login_attempts WHERE username IN (SELECT username FROM users WHERE id IN (SELECT id FROM olvidados));
-- H-KEY-F4-1: columnas de la escena sin FK. Primero se encolan los objetos (la conciliacion diaria borra del almacen), despues se borran las filas.
INSERT INTO media_deletion_queue (object_key, reason, enqueued_at, attempts)
  SELECT 'households/' || household_id || '/photo/' || object_id, 'DELETE', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 0
  FROM household_photos WHERE uploaded_by_user_id IN (SELECT id FROM olvidados)
  ON CONFLICT (object_key) DO NOTHING;
INSERT INTO media_deletion_queue (object_key, reason, enqueued_at, attempts)
  SELECT 'scenes/' || a.scene_id || '/images/' || a.result_object_id, 'DELETE', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 0
  FROM scene_attempts a JOIN home_scenes s ON s.id = a.scene_id
  WHERE a.actor_user_id IN (SELECT id FROM olvidados) AND s.image_id IS DISTINCT FROM a.result_object_id
  ON CONFLICT (object_key) DO NOTHING;
DELETE FROM scene_attempts WHERE actor_user_id IN (SELECT id FROM olvidados);
DELETE FROM scene_image_sources WHERE owner_user_id IN (SELECT id FROM olvidados);
DELETE FROM household_photos WHERE uploaded_by_user_id IN (SELECT id FROM olvidados);
DELETE FROM users WHERE id IN (SELECT id FROM olvidados);
SELECT (SELECT count(*) FROM pets WHERE owner_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM households WHERE owner_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM household_members WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM household_invitations WHERE invited_by_user_id IN (SELECT id FROM olvidados) OR invitee_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM backup_confirmation_tokens WHERE user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM rate_limit_events WHERE subject_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM scene_attempts WHERE actor_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM scene_image_sources WHERE owner_user_id IN (SELECT id FROM olvidados))
     + (SELECT count(*) FROM household_photos WHERE uploaded_by_user_id IN (SELECT id FROM olvidados))
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

**Paso 4b. Revocar todos los enlaces para el veterinario (OBLIGATORIO e incondicional; EDGE-005-32, PN-09, REQ-VET-013, T795).** Una copia restaurada puede contener enlaces que se revocaron después de la copia; sin este paso volverían a responder 200 con datos clínicos. Se ejecuta SIEMPRE, sobre la base restaurada y ANTES de reabrir el servicio (antes de cambiar `TF_VAR_database_url` y de promover la revisión). El paso es la compuerta técnica `scripts/restore-share-links.ts` (el `UPDATE` está probado por `tests/integration/sharing/t795-restauracion-revoca-enlaces.spec.ts`, que falla si falta); falla con código 1 si no puede ejecutarse o si queda algún enlace con `revoked_at` nulo, y entonces NO se reabre el servicio:

```bash
RESTORED_URL="$RESTORED_URL" npx tsx scripts/restore-share-links.ts
```

Forma manual equivalente en `psql` (solo si el script no está disponible; el instante es UTC ISO con milisegundos y `Z`):

```bash
psql "$RESTORED_URL" -X -v ON_ERROR_STOP=1 --single-transaction -c "UPDATE share_links SET revoked_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') WHERE revoked_at IS NULL"
```

Orden: pasos 1-4 y 4b, luego el 5 y el 6, y solo después la rotación de `TF_VAR_database_url`. `share_links` queda fuera del respaldo exportable (RAMA-005-008), por eso el paso 3 no lo toca.

Exclusión de Cloud Logging para `/shared/` (T793 (b), EDGE-005-32/P1): APLICADA EN CÓDIGO (`terraform/logging.tf`, `google_logging_project_exclusion.shared_token_requests`, filtro `resource.type="cloud_run_revision" AND httpRequest.requestUrl:"/shared/"` sobre el sumidero `_Default`); PENDIENTE de `terraform plan` y `apply` por Neo (la cuenta que aplica necesita `roles/logging.admin` o equivalente para gestionar exclusiones).

Pendientes (directiva Neo, 005): todo corre vía GitHub Actions (`infraestructura.yml` para Terraform y `deploy-argos.yml` para la aplicación); no hay pasos manuales en GCP. El único input humano es el secreto `TF_VAR_share_ip_hmac_secret` en GitHub Secrets (>= 32 bytes hex). Con ese secreto, Terraform crea `argos-share-ip-hmac-secret` (con su versión, IAM de `argos-run` y lectura de metadatos para `argos-deployer`), y `deploy-argos.yml` resuelve su versión numérica e inyecta `ARGOS_SHARE_IP_HMAC_SECRET` por `--set-secrets`. `ARGOS_PUBLIC_BASE_URL` se inyecta por `--set-env-vars` desde `vars.ARGOS_PUBLIC_BASE_URL` y, si esa variable no existe, desde la URL del propio servicio (`status.url`); no se declara en Terraform (REQ-IAC-012: `ignore_changes` cubre `env`).

**Paso 5. Eliminar la rama de respaldo de Neon.** Si restauró con la función de restauración de Neon (PITR o rama), Neon crea una rama de respaldo: bórrela en la consola de Neon (Branches). Con restauración por dump, borre en la consola de Neon la rama o base temporal que ya no se use. No hay comando de CLI verificado para esto y no hay clave de API de Neon en los secretos (D-19).

**Paso 6. Registrar el RPO y el RTO efectivos.** RPO = ahora − fecha del dump usado (objetivo <= 7 d). RTO = desde la decisión de restaurar hasta el servicio sirviendo con datos válidos y los pasos 1-5 aplicados (objetivo <= 2 h, NFR-CLD-015). En la prueba T478 se anotan en `research.md`; en un incidente real, en el registro del incidente.

Para que el servicio use la base restaurada, cambie la URL en el secreto `TF_VAR_database_url` y siga el runbook de rotación (nueva versión numérica, revisión sin tráfico, humo, promover). Esa parte se ensaya en T478 y T469.

## Despliegue

1. Bootstrap del día 0 (sección anterior).
2. CI (`infraestructura.yml`, T446) corre `plan` en PR y `apply` solo desde `main` con aprobación de Neo; junto con `deploy-argos.yml`, solo lee los secretos y variables de la tabla anterior.

## Escena del hogar (006): mantenimiento, conciliación y CI/CD (T880; REQ-ESC6-022, REQ-ESC6-029, NFR-ESC6-002)

Runbook operativo de la escena del hogar en pixel art. Pruebas estáticas en `tests/unit/runbook-escena-006.spec.ts`.

- **Estado del driver.** El servicio corre con `ARGOS_SCENE_DRIVER=fake` fijado en `deploy-argos.yml` (simulador, 0 USD). `ARGOS_SCENE_DRIVER=real` no se activa: la constante `SCENE_REAL_DRIVER_ACTIVATED` del código es `false` y el adaptador del proveedor no existe como código seleccionable hasta la compuerta T885 (`N2-10`, bloqueada).
- **Respaldo.** La foto del hogar y las escenas no viajan en el respaldo (véase «Fuera del respaldo exportable (feature 006)»); importar un respaldo no restaura la escena. La ayuda de la aplicación lo declara.
- **Borrado.** Eliminar una mascota, un hogar o una cuenta, la salida o expulsión de un miembro y el retiro del consentimiento encolan los objetos en `media_deletion_queue` (borrado inmediato, sin periodo de gracia). Una generación en vuelo registra antes del `put` una fila `INTENT`, de modo que el objeto huérfano se purga sin publicarse (`EDGE-ESC6-021`).
- **Conciliación.** La rutina diaria de `/internal/maintenance` recorre los prefijos `scenes/` y `households/` y encola con `DELETE` los objetos sin referencia con más de 15 min (`pets/`: 24 h). Tras una restauración, ejecútela y compruebe 0 huérfanos.
- **Mantenimiento de la cola.** La cola `argos-scene` (Cloud Tasks) entrega `POST /internal/scene-worker` con el OIDC de `argos-scene-tasks`; la espera en cola tiene su tope `T_QUEUE` de 600 s y el arrendamiento `T_LEASE = T_GEN + 60` es la red de seguridad si una tarea no corre. Si hay generaciones atascadas, no borre la cola: espere al arrendamiento o reintente desde la aplicación.
- **CI/CD.** `infraestructura.yml` corre `plan` en PR y `apply` solo desde `main` con aprobación de Neo; `deploy-argos.yml` despliega sin tráfico y nunca fija el driver en real. Los cambios de `terraform/` de la 006 no se aplican hasta que Neo lo ordene.
- **Ventana residual de PITR.** PITR y los volcados conservan filas de escena hasta su vencimiento (`RR-06-07`, `REQ-BOR-004`); las imágenes y las fotos viven solo en el bucket de medios.
- **Fuera de la 006.** `PN-06` (rotación de la clave HMAC de IP) queda fuera de esta feature (`N2-09` = B); no hay tarea ni requisito de la 006 que la cubra.
