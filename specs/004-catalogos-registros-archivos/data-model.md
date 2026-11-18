# Data Model: Cambios físicos de la Feature 004 (4A-1 y 4A-2)

**Estado**: `DRAFT` (para aprobación de Neo). El modelo base es el de `specs/002-plataforma-v21/data-model.md` más el mapeo de `specs/003-cloud-gcp/data-model.md`. Aquí solo se listan los **deltas**. Toda migración es **Nivel 2** y se escribe en dos motores: SQLite (`0006`, `0009`) y Postgres (`0002`, `0005`), con prueba de paridad (`tests/integration/persistence/schema-parity.spec.ts`). **Enmienda única 2026-11-17**: recortes de `/mifune` (K-05, K-06, K-08, K-10) y mitigaciones de `/rama` y `/lock`. **Decisiones de Neo asentadas 2026-11-17**: `D-11` A y `D-03` C (borrado físico, **sin** `deleted_at`, `deleted_by_user_id` ni índices de purga), `D-16` A (columna `revision`), `D-12` B (sin galería) y `D-06` C (sin DOCX/XLSX).

## 1. Migración «catálogos, revisión, usuario y microchip» (SQLite `0006`, Postgres `0002`)

| Cambio | SQLite | Postgres | Requisito |
|---|---|---|---|
| `username` sin distinguir mayúsculas | `CREATE UNIQUE INDEX users_username_lower ON users (lower(username))` | `CREATE UNIQUE INDEX users_username_lower ON users (LOWER(username))` | REQ-LOG-002, INV-LOG-001 |
| Normalizar intentos | `UPDATE login_attempts SET username = lower(username)` (con fusión de duplicados por máximo de contador) | igual con `LOWER` | REQ-LOG-001 |
| Invitaciones por `username` | reemplazar `household_invitations_one_open` por índice único parcial sobre `(household_id, lower(invitee_username)) WHERE status = 'INVITED'` | igual con `LOWER` | REQ-LOG-002, E-10 |
| Microchip global | `DROP INDEX pets_owner_microchip; CREATE UNIQUE INDEX pets_microchip_global ON pets (microchip_id) WHERE microchip_id IS NOT NULL` | igual | REQ-PET4-001, INV-PET4-001 |
| Control de revisión por registro (`D-16` A) | `ALTER TABLE <tabla> ADD COLUMN revision INTEGER NOT NULL DEFAULT 0` en las 6 tablas (`weights`, `body_measurements`, `vaccinations`, `dewormings`, `medical_visits`, `custom_parameters`) | igual | REQ-BOR-005, INV-REG-003 |

**Comprobaciones previas obligatorias** (la migración aborta sin cambiar el esquema si fallan; el mensaje solo trae conteos):
1. `SELECT count(*) FROM (SELECT lower(username) FROM users GROUP BY 1 HAVING count(*) > 1)` = 0 (por 002 todo `username` está en minúsculas, por lo que debe ser 0).
2. `SELECT count(*) FROM (SELECT microchip_id FROM pets WHERE microchip_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1)` = 0 (EDGE-008, SC-CAT-025).

El campo nuevo de la mascota `breedCode` vive en el documento `data` JSON de `pets` validado por Ajv, igual que `breed`; no requiere columna (no existe `breedOther`, K-08). Los campos `symptomType` y `severity` viven en el documento `data` de `custom_parameters`; los registros existentes tienen `symptomType = null`, `severity = null`. El estado del avatar **no** vive en el JSON (ver §2): un `PATCH` de la mascota que reescribe el documento no puede revertirlo. Las mascotas existentes quedan con `breedCode = null`.

## 2. Migración «medios» (SQLite `0009`, Postgres `0005`)

### Columnas nuevas de `pets` (avatar)

| Columna | Tipo | Restricción |
|---|---|---|
| `avatar_version` | `INTEGER` | NOT NULL DEFAULT 0; solo crece con `UPDATE … SET avatar_version = avatar_version + 1`; **nunca se reinicia** al borrar el avatar |
| `avatar_object_id` | `TEXT` (UUID v4) | NULL = sin avatar; el objeto es `pets/{pet_id}/avatar/{avatar_object_id}` |

La API expone `avatarVersion` = `avatar_version` si `avatar_object_id` no es nulo y `null` en caso contrario. El respaldo no exporta estas columnas; al importar, `avatar_object_id = NULL` y `avatar_version` conserva el valor de la fila existente con el mismo `id` (0 si la mascota es nueva) para que la versión no retroceda y la caché `?v=` no sirva una imagen antigua.

### `pet_media`

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | `TEXT` (UUID v4) | PK |
| `pet_id` | `TEXT` | NOT NULL, FK `pets(id)` `ON DELETE CASCADE` |
| `kind` | `TEXT` | NOT NULL, `CHECK (kind IN ('FILE','PHOTO'))` |
| `mime` | `TEXT` | NOT NULL (lista cerrada validada por dominio y Ajv, no por `CHECK`) |
| `size_bytes` | `INTEGER` | NOT NULL (rango validado por dominio) |
| `original_name` | `TEXT` | NOT NULL (1–120 puntos de código, validado por dominio) |
| `created_at` | `TEXT` | NOT NULL, ISO-8601 UTC |

Sin `object_key` (se deriva: `'pets/' || pet_id || '/' || CASE kind WHEN 'FILE' THEN 'files' ELSE 'photos' END || '/' || id`, `INV-ARC-003`), sin `sha256` (nadie lo consume), sin `uploaded_by_user_id` (el permiso de borrado es por rol y la auditoría `PET_MEDIA` ya guarda el actor con HMAC), sin `CHECK` de dominio (no se acopla la base a `ARGOS_MEDIA_MAX_BYTES`, EDGE-004-035).

Índice: `pet_media_pet_created (pet_id, kind, created_at DESC, id DESC)` (paginación de 24, INV-ALB-001; cubre las consultas por `pet_id`).

### `media_deletion_queue`

La cola existe **solo** para reintentar el borrado de objetos de GCS (que no participa de la transacción de base de datos) y para la intención previa de la subida; no hay cola ni purga de registros (`D-11` A).

| Columna | Tipo | Restricción |
|---|---|---|
| `object_key` | `TEXT` | PK |
| `reason` | `TEXT` | NOT NULL, `CHECK (reason IN ('INTENT','DELETE'))` |
| `enqueued_at` | `TEXT` | NOT NULL, ISO-8601 UTC |
| `attempts` | `INTEGER` | NOT NULL DEFAULT 0, `CHECK (attempts >= 0)` (sin tope superior) |

Sin datos personales: solo claves con UUID (INV-ARC-003). Sin FK (debe sobrevivir a la fila de `pet_media` y de `pets` eliminadas por cascada).

## 3. Reglas de consistencia

Orden de candados en toda transacción (REQ-BOR-005): propietario (`users`, solo si valida cuota) → mascota (`pets`). SQLite: `BEGIN IMMEDIATE`; Postgres: `SELECT … FOR UPDATE`.

| Regla | Mecanismo |
|---|---|
| Subida: intención previa | **T1**: `INSERT media_deletion_queue (object_key, 'INTENT')` → `put` en GCS → **T2** (candados, permiso `WRITE_MEDIA` y cuota re-verificados, mascota existente): `INSERT pet_media` + auditoría + `DELETE` de la fila `INTENT`. Cualquier fallo tras el `put`: la fila pasa a `reason = 'DELETE'` y se borra de inmediato (EDGE-011). Un corte del proceso deja la fila `INTENT` (EDGE-012) |
| Borrado de fila de medios (individual, cascada de mascota o de cuenta, importación) | En la misma transacción y con candado: `INSERT INTO media_deletion_queue (object_key, reason) SELECT <clave derivada>, 'DELETE' FROM pet_media WHERE pet_id = ?` (más la clave del avatar si `avatar_object_id` no es nulo, **siempre** al eliminar la mascota) y luego `DELETE`; tras `COMMIT`: `delete` idempotente en GCS (404 = éxito) y `DELETE FROM media_deletion_queue WHERE object_key = ?`; tras eliminar mascota o cuenta, `list('pets/{petId}/')` y borrado de lo que quede |
| Avatar: cambio | **T1**: `INTENT` de la clave nueva → `put` → **T2** con candado: `UPDATE pets SET avatar_version = avatar_version + 1, avatar_object_id = :nuevo`, `INSERT` de la clave anterior (si existía) con `DELETE`, `DELETE` de la fila `INTENT` |
| Avatar: borrado | Con candado: `INSERT` de la clave actual con `DELETE` y `UPDATE pets SET avatar_object_id = NULL` (`avatar_version` no cambia) |
| Reintento | `/internal/maintenance` recorre la cola: convierte `INTENT` con `enqueued_at` > 1 h en `DELETE`; para cada `DELETE` intenta `delete` (404 = éxito), incrementa `attempts` si falla y borra la fila al confirmarse; **sin tope**; informa el conteo (sin datos) de filas con `enqueued_at` > 48 h para la alerta a Neo |
| Conciliación | `/internal/maintenance` lista `pets/` en GCS y encola con `DELETE` todo objeto con antigüedad > 24 h cuya clave no esté en `pet_media` (derivada), en `pets.avatar_object_id` ni en la cola (`REQ-GCS-006`) |
| `INV-GCS-002` | Prueba de integración: conjunto de objetos del bucket (doble) ⊆ claves de `pet_media` ∪ claves de `avatar_object_id` ∪ claves de la cola, incluso tras matar el proceso entre `put` e `INSERT` |
| Cuota | `SELECT sum(size_bytes)` sobre `pet_media` unida a `pets` por `owner_user_id` dentro de **T2** y bajo el candado del propietario; una comprobación previa al `put` evita subidas inútiles. No hay tope de elementos por mascota para `kind = FILE` (K-10). *Enmienda 005, D5-01*: para `kind = PHOTO` rige el tope de álbum de la 005 (`REQ-ALB5-002`): dentro de **T2**, tras tomar el candado de mascota y después de la cuota, `countByPetAndKind(petId, 'PHOTO') >= max(maxPhotosPerPet, ...)` rechaza con `ERR-MEDIA-ALBUM-LIMIT` (catálogo incremental de la 005); el índice `pet_media_pet_created` ya cubre ese conteo |
| Borrado de registro (`D-11` A) | Con candado de mascota, en **una transacción**: `assertRecordNotSuperseded`, `DELETE FROM <tabla> WHERE id = ? AND pet_id = ?` con comprobación de filas afectadas (0 ⇒ `ERR-PET-NOT-FOUND`, sin auditoría) y la fila de auditoría `DELETE` (`REQ-AUD-001`, `newStateHash = null`); si la auditoría falla, todo se revierte. Sin `deleted_at` ni retención ni purga |
| Edición con revisión (`D-16` A) | Con candado de mascota: se lee la fila y se compara `revision` con la de `If-Match` (desfase ⇒ 409 `ERR-REC-CONFLICT`, sin cambios ni auditoría); si la edición cambia el estado canónico, `UPDATE <tabla> SET …, revision = revision + 1 WHERE id = ? AND pet_id = ?` y fila de auditoría `UPDATE` en la misma transacción; una edición sin cambios efectivos no incrementa `revision` |
| Importación de respaldo (REQ-IMP-001) | En el reemplazo, borrado físico por `pet_id` en las 6 tablas; `avatar_object_id = NULL`; medios y avatar de las mascotas reemplazadas a la cola; `revision` de una fila importada = la de la fila existente con el mismo `id` más 1, o 0 si es nueva; la vista previa cuenta `mediaToDeleteCount` (archivos, fotos y avatares que se eliminarán, `D-15` A) |
| Eliminación de cuenta | En la misma transacción: cascada de mascotas y registros; medios y avatar de todas sus mascotas a la cola (`REQ-GCS-004`). No hay columnas de autoría que anonimizar (`D-11` A) |

## 4. Objeto en GCS

| Atributo | Valor |
|---|---|
| Bucket | `${project_prefix}-${project_id}-media` |
| Claves | `pets/{petId}/files/{mediaId}`, `pets/{petId}/photos/{mediaId}`, `pets/{petId}/avatar/{avatarObjectId}` (sin extensión) |
| `contentType` del objeto | el tipo detectado por firma (nunca el del cliente) |
| `contentDisposition` del objeto | `attachment` por defecto; la lectura en línea la fija `response-content-disposition` de la URL firmada (INV-ARC-004) |
| Metadatos personalizados | ninguno (sin nombre ni usuario) |
| Registros de acceso a datos del bucket | no se activan (registrarían la clave en la URL) |
