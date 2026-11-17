# Runbook y quickstart: Feature 004 (catálogos, registros y archivos)

**Estado**: `DRAFT` (T595, redactado por `/link`; sin firma de Neo). Opera lo que la 004 añade a la 003: bucket de medios, variables `ARGOS_MEDIA_*`, borrado físico y cola de borrado de GCS. Para el día 0, secretos y frentes de exposición vale `specs/003-cloud-gcp/quickstart.md`; para respaldo y restauración vale `terraform/README.md` («Respaldo y restauración»). Nada de esto lo ejecuta un agente: la nube es de Neo (Nivel 2, T597).

Fuentes: `terraform/buckets_media.tf`, `terraform/iam.tf`, `terraform/cloud_run.tf`, `.github/workflows/deploy-argos.yml`, `src/infrastructure/config/app-config.ts`, `src/application/use-cases/maintenance-use-cases.ts`, `spec.md` (REQ-GCS-001, REQ-GCS-004, REQ-BOR-004, NFR-ALM-001, NFR-ALM-005, REQ-PET4-002).

## 1. Local (sin nube)

Con `ARGOS_MEDIA_DRIVER=memory` (valor por defecto en `app-config.ts`) no hace falta bucket ni credenciales:

```bash
npm ci && npx tsc --noEmit && npm run test:gate
bash scripts/verify-traceability.sh --feature 004
```

Con `NODE_ENV=production` el arranque **rechaza** `memory` (`ARGOS_MEDIA_DRIVER` inválida): la producción exige `gcs`.

## 2. Variables `ARGOS_MEDIA_*`

Las valida `app-config.ts` al arrancar; un valor fuera de rango impide el arranque (la configuración nombra la variable, no su valor). `deploy-argos.yml` las pasa con `--set-env-vars` (reemplaza **todo** el entorno de la revisión); Terraform no las declara (`ignore_changes` sobre `env`, REQ-IAC-012).

| Variable | Valor en producción | Regla de `app-config.ts` |
|---|---|---|
| `ARGOS_MEDIA_DRIVER` | `gcs` | `gcs` o `memory`; vacío se rechaza; con `NODE_ENV=production` debe ser `gcs` |
| `ARGOS_MEDIA_BUCKET` | `argos-<project_id>-media` (deriva de `vars.TF_VAR_project_id` en el workflow) | Obligatoria con `gcs`; patrón `^[a-z0-9][a-z0-9._-]{1,62}$` |
| `ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS` | `300` | 30 a 900 |
| `ARGOS_MEDIA_MAX_BYTES` | `10485760` (10 MiB) | 1 a 10 485 760 (tope duro) |
| `ARGOS_MEDIA_MAX_BYTES_PER_OWNER` | `1073741824` (1 GiB) | entero positivo |
| `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS` | `4` | 1 a 8 |

El nombre del bucket debe coincidir entre `buckets_media.tf` (`${project_prefix}-${project_id}-media`, con `project_prefix = "argos"`) y el workflow (línea `ARGOS_MEDIA_BUCKET: argos-${{ vars.TF_VAR_project_id }}-media`). Si cambia uno, cambia el otro.

Memoria de Cloud Run: `512Mi` y concurrencia 20 (`cloud_run.tf`). Cuatro subidas de 10 MiB son 40 MiB en vuelo; si la memoria no alcanzara, el cambio exige firma de Neo (E3-05).

## 3. Orden del primer despliegue con medios

La revisión con `ARGOS_MEDIA_DRIVER=gcs` necesita antes el bucket y el IAM. El orden y quién lo ejecuta:

1. **PR con `terraform/**`**: `infraestructura.yml` corre `validate` y `plan`. El plan debe añadir exactamente: `google_storage_bucket.media`, `google_storage_bucket_iam_member.run_media_object_user` y `google_service_account_iam_member.run_token_creator_self`. `terraform-plan-guard.mjs` exige la etiqueta `aprobacion-manual` porque se crea un `google_storage_bucket`.
2. **Fusión a `main`**: `infraestructura.yml` hace `apply` tras la aprobación de Neo en el Environment `produccion`. Esto crea el bucket y concede `roles/storage.objectUser` sobre el bucket a `argos-run@` y `roles/iam.serviceAccountTokenCreator` a `argos-run@` sobre sí misma (para firmar URL V4 con `signBlob`, sin llaves).
3. **`deploy-argos.yml`** espera a que `infraestructura.yml` termine en `main` (paso «Esperar a Infraestructura (Terraform) en main»); si el `apply` sigue sin aprobarse tras el sondeo, falla con el mensaje de re-ejecutar el workflow después de aprobar y terminar el `apply`. No lo omita: sin bucket e IAM, la revisión con `gcs` no puede escribir ni firmar.
4. El workflow migra la base (migraciones aditivas, §7), despliega la revisión **sin tráfico** con etiqueta `sha-<7>`, las sondas y las variables de §2, prueba `/readyz` y `/` sobre la URL etiquetada y solo entonces mueve el 100 % del tráfico.

No verificado por mí: qué responde la aplicación al arrancar si el bucket no existe pero el nombre es válido (el arranque solo valida el patrón del nombre; el fallo aparecería en la primera subida como `ERR-MEDIA-STORAGE-UNAVAILABLE`, 502). Confirmarlo en T597.

## 4. Verificación de salud y del bucket (T597, Neo)

- Sondas internas de Cloud Run: `/healthz` (arranque cada 2 s, 10 intentos; vida cada 10 s, 3 fallos). El `/healthz` externo lo intercepta el GFE con 404 (D-32): desde fuera use `/readyz` y `/`.
- Bucket (comandos de lectura, sin cambios):

```bash
gcloud storage buckets describe "gs://argos-${TF_VAR_project_id}-media" \
  --format='yaml(location,storageClass,iamConfiguration,softDeletePolicy,versioning)'
```

  Debe mostrar `us-central1`, `STANDARD`, acceso uniforme, `publicAccessPrevention: enforced`, `softDeletePolicy.retentionDurationSeconds: 0` y sin versionado.
- Recorrido en vivo (PE-06, T597): subir un archivo y una foto, abrir la vista en línea (URL firmada, `iframe`, caducidad a los 300 s, CSP de producción), borrar y comprobar que el objeto ya no existe (`gcloud storage ls "gs://.../pets/<petId>/"`), poner y quitar el avatar, y repetirlo en un móvil real (PE-04).
- Los **Data Access audit logs del bucket de medios NO se activan**: registrarían la clave del objeto en la URL (REQ-GCS-001). No los habilite al revisar el bucket.

## 5. Retroceso (rollback)

- **Automático**: si el despliegue falla antes o después del humo, el paso «Retroceso si algo falló» devuelve el 100 % del tráfico a `PREV_REVISION` y quita la etiqueta (SC-CLD-006).
- **Manual** (revisión buena conocida):

```bash
gcloud run services update-traffic argos --project "$PROJECT_ID" --region us-central1 --to-revisions "<REVISION_ANTERIOR>=100"
```

- **Migraciones**: las de 004 son aditivas (columna `revision` con valor por defecto, índices y tablas de medios, `rate_limit_events` con ámbito `MICROCHIP_DUPLICATE`): el código anterior las ignora y sigue funcionando. Volver a la imagen anterior **no resucita datos** (no hay borrado lógico) ni deshace migraciones; el único efecto es perder el control de revisión (`REQ-BOR-005`) hasta el siguiente despliegue (NFR-ALM-005). No hay retroceso destructivo de esquema: no se ejecuta ningún `down`.
- **Bucket**: tiene `prevent_destroy`; un retroceso de código no toca los objetos de GCS. Eliminar el bucket exige quitar esa protección en un cambio de Terraform aprobado por Neo.

## 6. Borrados: retención 0 y ventanas

**Retención 0** (REQ-BOR-004): no hay borrado lógico, ni `deleted_at`, ni purga diferida de registros, ni `ARGOS_SOFT_DELETE_RETENTION_DAYS`. Borrar un registro, una mascota o una cuenta elimina las filas de inmediato y sin interfaz de restauración.

**Ventana de los registros borrados**: la única es la de `REQ-PG-011` (003): `max(PITR de Neon 6 h, próximo VACUUM <= 7 d, vida de los dumps 14 d)`, es decir, hasta 14 días para la purga física definitiva en copias y dumps, con inaccesibilidad lógica inmediata. Tras eliminar una cuenta o importar por reemplazo, dispare `vacuum-argos.yml` con `workflow_dispatch` (REQ-PG-015).

**Ventana de los objetos de GCS** (REQ-GCS-004, bucket con `soft_delete_policy = 0s`, sin versionado):

| Situación | Ventana |
|---|---|
| GCS responde | inmediata: borrado tras el `COMMIT` |
| Falla puntual | <= 24 h: el mantenimiento diario (Scheduler, `0 6 * * *`) reintenta cada fila de la cola `media_deletion_queue` |
| Falla sostenida (permiso o bucket) | se reintenta cada día **sin tope de intentos**; cuando una fila supera 48 h el mantenimiento devuelve `overdue > 0` y el servidor registra el aviso `cola de borrado de medios con filas de más de 48 h` (`server.ts`) |

Alerta a Neo a las 48 h: hoy solo existe ese aviso en el registro de Cloud Run. La alerta de Cloud Monitoring de E3-05 **no está en `terraform/`** (brecha abierta, ver `.specify/memory/audits/link-T594-costo.md` §5). Mientras tanto, Neo revisa semanalmente:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.msg=~"cola de borrado de medios"' --limit 20 --freshness 7d
```

(El filtro asume que el campo de mensaje de Fastify/Pino es `msg`; no lo he ejecutado contra logs reales.)

**Aviso al eliminar cuenta o mascota** (REQ-ACC-002, E-07): la interfaz informa «Las fotos y archivos no van en el respaldo JSON y se eliminarán». Eliminar una cuenta o mascota borra filas y medios; después se lista el prefijo `pets/{petId}/` y se borra lo que quede, y lo que no se alcance lo cubre la conciliación diaria (REQ-GCS-006). La importación por reemplazo muestra `mediaToDeleteCount` y pide confirmación adicional.

## 7. Restauración sin resurrección de medios

Siga los pasos de `REQ-PG-016` de `terraform/README.md` («Restauración sin resurrección») para el PITR, la rama de Neon o el dump. Reglas específicas de 004:

1. **Los medios no se restauran**: el respaldo y los dumps de la base no incluyen binarios (`D-07`), y el bucket no tiene versionado ni soft delete. Tras restaurar, las filas de `pet_media` pueden apuntar a objetos que ya no existen (la vista responde 404 `ERR-MEDIA-NOT-FOUND`) y objetos borrados no vuelven.
2. **Reaplicar los borrados desde la auditoría**: antes de restaurar, exporte de la base viva los borrados registrados en `audit_log` (los `ACCOUNT_DELETE` del paso 1 de `REQ-PG-016` y las filas `DELETE` de registros y medios, `REQ-AUD-001`); tras restaurar, elimine de la copia las entidades que la auditoría viva marca como borradas, para que un registro borrado físicamente no reaparezca. Los pasos 1 y 3 de `terraform/README.md` cubren las cuentas; para registros y medios de 004 **no hay script**: es un procedimiento manual con SQL sobre `audit_log` que debe ensayar Neo (no verificado por mí; pendiente de T597/ensayo de restauración).
3. Tras restaurar, ejecute el mantenimiento: la conciliación (REQ-GCS-006) encola con `DELETE` los objetos de más de 24 h sin fila, avatar ni cola, bajo el prefijo `pets/`.

## 8. Canal de resolución de microchip (REQ-PET4-002)

El microchip es único global (`pets_microchip_global`). Quien no pueda registrar el suyo recibe el mismo `ERR-PET-MICROCHIP-DUPLICATE` sin datos del tercero. Canal manual:

1. La persona escribe a Neo (Andrés Vallejo) por el medio de contacto del hogar; Neo no recibe de la aplicación ningún dato del otro propietario, ni el microchip ni IDs (los logs y la auditoría no los contienen).
2. Neo verifica de forma independiente a quién corresponde la mascota; **registrar un microchip no es prueba de propiedad**.
3. Neo decide y, si procede, pide al propietario registrado que edite o elimine la mascota; el reclamante no recibe datos del tercero en ningún caso.
4. Límite: 5 eventos de duplicado por usuario en una ventana deslizante de 24 h; con 5 o más, `ERR-RATE-LIMITED` (429) sin guardar y sin revelar si el chip existe. Si una persona legítima queda bloqueada, la ventana se libera sola a las 24 h.

La migración abortará con un conteo (sin datos) si existe un microchip repetido entre propietarios en datos previos; exige resolución de Neo antes de continuar (EDGE-008, `SC-CAT-025`).

## 9. Métrica de bytes servidos (SC-ALM-033, NFR-ALM-001)

Objetivo: vigilar el consumo frente al cupo de Cloud Storage (5 GB-mes, 5 000 operaciones Clase A, 50 000 Clase B, 100 GB de salida combinados; `specs/003-cloud-gcp/research.md`, consultado 2026-11-15). No existe aún una métrica propia en `src/` (brecha, ver informe T594). Medición manual mensual por Neo:

- Consola de Google: Billing > Reportes, filtro por etiqueta `app=argos`, y Cloud Storage > bucket de medios > Observabilidad (bytes y solicitudes). Compare con los cupos vigentes **antes de T597** (PE-05).
- La alerta de presupuesto de 1 USD (50/90/100 %, `budget.tf`) solo avisa, no detiene el gasto.
