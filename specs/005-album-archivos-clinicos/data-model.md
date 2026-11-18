# Modelo de datos — Feature 005 (Álbum, archivos clínicos, enlace veterinario y ClinicalSummary)

**Estado**: `DRAFT` (T706; revisión T707 del 2026-11-18 con las brechas EDGE de `/lock` y las podas de `/mifune` sin decisión de Neo). Deltas sobre el modelo de la 004 (`specs/004-*/data-model.md`, `LOCKED`). Migraciones **Nivel 2** (SQLite y Postgres con prueba de paridad); los números de migración los asigna `/keymaker` tras la última de la 004. Fechas: `TEXT` ISO-8601 UTC con milisegundos (`IsoTimestamp`), salvo las fechas de calendario de los registros clínicos, que no se tocan.

## 1. `pet_media` (existente): sin cambio de esquema

`kind = PHOTO` es el álbum y `kind = FILE` son los archivos clínicos (D5-04: sin tipo ni fecha de examen). El índice `pet_media_pet_created (pet_id, kind, created_at DESC, id DESC)` cubre el nuevo conteo `COUNT(*) WHERE pet_id = ? AND kind = 'PHOTO'`. Cambio de **puerto** (no de esquema): `MediaRepository.countByPetAndKind(petId, kind)` en los dos motores y en la suite de contrato de repositorio.

| Regla | Detalle |
|---|---|
| Tope de álbum (`REQ-ALB5-002`, `INV-005-003`) | Dentro de **T2** de la subida: (1) candado de mascota, (2) **después** del candado, `countByPetAndKind(petId,'PHOTO') >= maxPhotosPerPet` → `ERR-MEDIA-ALBUM-LIMIT` (la comprobación autoritativa **se repite bajo el candado en PostgreSQL**, A-06 de `/trinity`; contar antes del candado reintroduce la carrera), (3) cuota de 1 GiB. Orden: tipo → tope de álbum → cuota (un rechazo por tope no consume cuota). Comprobación previa al `put` solo como rechazo barato. `maxPhotosPerPet` se lee una vez al inicio de la operación |
| Rechazo | `rollback` completo: sin fila `pet_media`, sin auditoría de subida; la fila `INTENT` pasa a `DELETE` y el objeto se borra por la cola de 004 (`REQ-GCS-006`) |
| Cuentan | Solo `kind = PHOTO` vigentes; `FILE` no cuenta; una mascota con más fotos que el tope conserva todas (D5-03) y solo se rechazan subidas nuevas |
| Exposición al cliente | `getAlbumLimits` devuelve `{photoCount, maxPhotosPerPet}` (dos lecturas separadas: `countByPetAndKind` y `PlatformParameterPort.getInt`) |

## 2. `platform_parameters` (`REQ-PRM-001..003`)

| Columna | Tipo | Restricción |
|---|---|---|
| `key` | `TEXT` | PK; patrón `^[a-z][a-z0-9_.]{2,63}$` validado por dominio |
| `value` | `TEXT` | NOT NULL, 1–200 (texto canónico; el tipo y el rango los define el catálogo del código y los interpreta el dominio) |
| `description` | `TEXT` | NOT NULL, <= 200 |
| `updated_at` | `TEXT` | NOT NULL |
| `updated_by_user_id` | `TEXT` | NULL; **sin FK** (el perfil de administrador de plataforma aún no existe, `REQ-PRM-003`) |

**MIF-005-07 (T707)**: sin columnas `value_type`, `min_value` ni `max_value` (no tienen consumidor: el rango y el defecto ya viven en el catálogo del código y la UI de administración está fuera, `REQ-PRM-003`).

Siembra: `('album.max_photos_per_pet','10','Máximo de fotos de álbum por mascota',now,NULL)`. Lectura con caché en memoria de TTL <= 60 s **por instancia** (`D5-07`; con varias instancias el desfase entre ellas está acotado a 60 s y es aceptado, EDGE-005-12; la interfaz se reconcilia con `getAlbumLimits` tras el 409); fila ausente, ilegible o fuera de rango → valor por defecto del código y aviso sin datos. Sin endpoint ni UI. Alternativas descartadas: tabla ancha (cada parámetro exigiría migración); JSON único (no consultable ni restringible por clave).

## 3. `share_links` (`REQ-VET-*`, `STATE-SHARE-001`)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | `TEXT` (UUID v4) | PK; identificador visible en listas y auditoría |
| `token_hash` | `TEXT` | NOT NULL, UNIQUE (hex de `SHA-256`, 64) |
| `scope` | `TEXT` | NOT NULL, `CHECK (scope IN ('PET','HOUSEHOLD'))` |
| `pet_id` | `TEXT` | FK `pets(id)` `ON DELETE CASCADE`; NOT NULL si `scope = 'PET'` |
| `household_id` | `TEXT` | FK `households(id)` `ON DELETE CASCADE`; NOT NULL si `scope = 'HOUSEHOLD'` |
| `created_by_user_id` | `TEXT` | NOT NULL, FK `users(id)` `ON DELETE CASCADE` |
| `created_at` | `TEXT` | NOT NULL |
| `expires_in_days` | `INTEGER` | NOT NULL, `CHECK (expires_in_days IN (1,7,30))` (RAMA-005-009: la BD solo admite la enumeración; no existe `expiresAt` libre). **Nota MIF-005-10 (T707)**: sin consumidor aparente; no se retira hasta que `/rama` confirme que basta un `CHECK` equivalente sobre `expires_at - created_at` ∈ {1,7,30} días o la validación de dominio |
| `idempotency_key` | `TEXT` | NOT NULL (UUID v4 de la cabecera `Idempotency-Key`); `UNIQUE (created_by_user_id, idempotency_key)` (EDGE-005-16/17, T707); no es un secreto ni el token; se purga con la fila |
| `pet_owner_user_id_at_creation` | `TEXT` | NOT NULL si `scope = 'PET'`, NULL si `HOUSEHOLD`; `pets.owner_user_id` vigente al crear el enlace; sin FK (no bloquea el borrado de cuentas); si `pets.owner_user_id` difiere, el enlace responde el 404 uniforme (`PN-08`, `EDGE-005-20`, `REQ-VET-011`) |
| `expires_at` | `TEXT` | NOT NULL; `CHECK (expires_at > created_at)`; el dominio fija `expires_at = created_at + expires_in_days` con `ClockPort` |
| `revoked_at` | `TEXT` | NULL = no revocado |
| `include_microchip` | `INTEGER` | NOT NULL DEFAULT 0, `CHECK (IN (0,1))`; inmutable (`D5-14`) |
| `include_clinical_files` | `INTEGER` | NOT NULL DEFAULT 0, `CHECK (IN (0,1))`; inmutable (`D5-21`) |

**Nota MIF-005-10 (T707)**: `ShareLinkView.revokedAt` no tiene consumidor confirmado (la lista pinta `status`); se retira solo si `/sati` confirma que no muestra la fecha de revocación; hasta entonces permanece.

`CHECK ((scope='PET' AND pet_id IS NOT NULL AND household_id IS NULL) OR (scope='HOUSEHOLD' AND household_id IS NOT NULL AND pet_id IS NULL))`. **Sin columna de estado** (derivado, `STATE-SHARE-001`), **sin columna de token**, **sin IP**. Índices: UNIQUE `token_hash` (resolución pública); `share_links_pet_active (pet_id, revoked_at, expires_at)` y `share_links_household_active (household_id, revoked_at, expires_at)` (tope de 20 y listado); `share_links_created_by (created_by_user_id, created_at DESC)`; `share_links_purge (expires_at)` y `(revoked_at)` para la purga. `PRAGMA foreign_keys = ON` verificado por la prueba de paridad.

### 3.1 Reglas transaccionales

| Operación | Regla |
|---|---|
| Crear (`REQ-VET-001/003/012`) | Token generado en memoria (`randomBytes(32)`, base64url) → **una transacción**: **candado del alcance** (la mascota para `PET`; **el hogar (`household_id`) para `HOUSEHOLD`**, nunca el candado del usuario creador: dos creadores distintos tomarían candados distintos y ambos contarían 19, EDGE-005-15; PostgreSQL: `SELECT ... FOR UPDATE` de la fila del hogar o `pg_advisory_xact_lock` con clave por `household_id`; SQLite: la transacción `IMMEDIATE`), revalidar `CREATE_SHARE_LINK` (PET: rol efectivo; HOUSEHOLD: rol del usuario en el hogar, no el rol por mascota), **buscar `(created_by_user_id, idempotency_key)`: si existe con el mismo alcance y opciones, `COMMIT` sin escribir y responder 200 `CreateShareLinkReplay` sin URL; con otro alcance u opciones, 422**, validar que el selector pertenezca al conjunto vigente, contar **bajo ese candado** los activos del alcance (`revoked_at IS NULL AND expires_at > now`, por `pet_id` o `household_id`, de cualquier creador) y rechazar con `ERR-SHARE-LINK-LIMIT` si ya hay 20, insertar la fila con solo el hash y la `idempotency_key`, insertar la auditoría `CREATED` → `COMMIT` → solo entonces devolver la URL. Cualquier fallo: rollback total y token descartado. Si la respuesta se pierde tras el `COMMIT`, el token es irrecuperable (`INV-005-005`): el reintento con la misma clave no crea otro enlace y el enlace queda listado y revocable (riesgo residual aceptado por Neo, `PN-07`, `EDGE-005-16`) |
| Revocar (`REQ-VET-005`) | `UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND expires_at > ?` + auditoría `REVOKED` en la misma transacción; idempotente (0 filas = sin segunda auditoría); un enlace ya VENCIDO es un **no-op** (204 sin escribir ni auditar, sigue VENCIDO; MIF-005-08, T707); `DELETE /share-links/{id}` **no** borra la fila |
| Resolver (`REQ-VET-006/011`, `INV-005-006`) | **Una transacción de solo lectura con aislamiento explícito** (PostgreSQL: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, instantánea única; `READ COMMITTED` no basta, EDGE-005-14; SQLite: transacción de lectura sobre WAL) y **un único `ClockPort.now()` por petición** (EDGE-005-24), con prueba de dos conexiones en PostgreSQL real (`SC-005-049`): fila por `token_hash` + vigencia + revocación + autoridad vigente del creador + conjunto de mascotas del alcance por consulta (HOUSEHOLD: `pets` asignadas ahora al hogar **y** `owner_user_id = created_by_user_id`) + lectura de los registros. Sin caché ni instantánea. Misma secuencia de llamadas a puertos en todas las ramas de fallo |
| Cascada (`REQ-VET-010`) | Eliminar mascota, hogar o cuenta borra las filas en la misma transacción (`ON DELETE CASCADE`); la importación de respaldo **por reemplazo** ejecuta la misma cascada al borrar mascotas |
| Autoridad perdida (`REQ-VET-011`) | Además del rol del creador, el enlace `PET` exige `pets.owner_user_id = pet_owner_user_id_at_creation` (`PN-08`: la transferencia de propiedad lo deja en 404 aunque el ex-propietario conserve rol `ADMIN`). No se borra: el enlace deja de resolver (404 uniforme) mientras el creador no recupere autoridad; si la recupera, vuelve a resolver (la autoridad se evalúa en cada acceso). La fila sigue su vigencia y se purga a los 30 días de vencer o revocarse |
| Purga (`REQ-VET-013`) | Mantenimiento diario (`REQ-CLD-007`): `DELETE FROM share_links WHERE expires_at < :now-30d OR revoked_at < :now-30d` |

## 4. `share_link_audit` (auditoría de creación, revocación y accesos; retención 90 días, 30 días para filas con `ip_hmac`)

Tabla propia (no se edita `audit-entry.schema.json` de la 004). Sin FK a `share_links` para que la auditoría sobreviva a la purga de la fila dentro de sus 90 días.

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | `TEXT` (UUID v4) | PK |
| `share_link_id` | `TEXT` | NULL para fallos que no resuelven a un enlace; **nunca** el token ni su hash ni un prefijo |
| `event_type` | `TEXT` | NOT NULL, `CHECK (event_type IN ('CREATED','REVOKED','ACCESS_OK','ACCESS_FAILED'))` |
| `occurred_at` | `TEXT` | NOT NULL (para `ACCESS_FAILED`, inicio de la ventana de 10 minutos) |
| `actor_user_id` | `TEXT` | NULL (`CREATED`/`REVOKED`); sin FK; pasa a NULL al eliminar la cuenta del actor, en la misma transacción |
| `ip_hmac` | `TEXT` | NULL; hex de `HMAC-SHA-256(clave_ip, ip_efectiva)` (64); **nunca** la IP en claro |
| `fail_count` | `INTEGER` | NOT NULL DEFAULT 1; en `ACCESS_FAILED` se **agrega** una fila por `(ip_hmac, ventana)` con contador, no una fila por intento (minimización y costo) |

Reglas: clave HMAC dedicada (Secret Manager, >= 32 bytes, separada de las claves de sesión y de auditoría); IP efectiva solo de `trustProxy` de 1 salto (nunca `X-Forwarded-For` crudo; IPv6 por /64); sin escritura de BD durante un 429; si la auditoría de un acceso válido falla, **fail-closed** (no se sirve el resumen). El límite de tasa vive en memoria (`Map` con barrido de ventanas vencidas y tope duro de entradas; con el tope lleno, 429 fail-closed; sin estructura de expulsión del más antiguo, MIF-005-12; solo cuenta fallos): `TECHDEBT-005-01`. Retención: **90 días** para filas sin IP y **30 días para toda fila con `ip_hmac` no nulo** (purga diaria `DELETE ... WHERE (ip_hmac IS NULL AND occurred_at < :now-90d) OR (ip_hmac IS NOT NULL AND occurred_at < :now-30d)`). **`PN-06` (Neo, 2026-11-18)**: la rotación de la clave HMAC de IP y la columna `ip_key_version` se **difieren a 006**; en 005 la clave dedicada es única y los 30 días acotan la correlación de una clave que no rota.

## 5. Respaldo, restauración y exportación

- `share_links`, `share_link_audit` y `platform_parameters` quedan **fuera** de la exportación e importación de respaldo (`backup-envelope.schema.json` no cambia): una importación no puede resucitar un `token_hash` (RAMA-005-008).
- Restauración (PITR 6 h, volcados 14 d): **compuerta técnica** (`PN-09`, Neo): el script de restauración ejecuta `UPDATE share_links SET revoked_at = :now WHERE revoked_at IS NULL` (invalidar todos los enlaces) como paso obligatorio antes de reabrir el tráfico, con prueba; el runbook lo documenta — entrega de `/link` en T795.
- El resumen se calcula bajo demanda; **no** hay copia persistente del contenido clínico ni del nombre (DP-10 de `/rama`): borrar un `FILE` lo retira del enlace en la siguiente petición.

## 6. Retención (D5-20)

| Dato | Plazo | Mecanismo |
|---|---|---|
| `share_link_audit` sin IP (creación, revocación) | 90 días | purga diaria |
| `share_link_audit` con `ip_hmac` (accesos) | 30 días (`PN-06`) | purga diaria |
| `share_links` vencidos o revocados | 30 días tras `expires_at` o `revoked_at` | purga diaria |
| HMAC de IP | clave única en 005; rotación y `ip_key_version` diferidas a 006 (`PN-06`) | contrapeso: retención de 30 días |
| Registros de aplicación (`stdout`) | sin token, sin URL, sin nombre de archivo, sin microchip | serializer y redacción (`INV-005-009`) |

## 7. Fuentes del `SharedSummaryView`

| Parte | Fuente | Regla |
|---|---|---|
| `summary` | repositorios existentes por mascota del conjunto resuelto | `buildClinicalSummary(datos, generatedAt, {includeMicrochip, includeClinicalFiles})` por allow-list; sin `pet_media.original_name` |
| `fileLabels` | `pet_media.original_name` por `id`, solo de los `clinicalFiles` que el resumen ya incluyó | consulta aparte tras resolver el token; vacío si `include_clinical_files = 0` |
| `validUntil` | `share_links.expires_at` | `null` en la vista previa autenticada |
