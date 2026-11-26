# Anexo T1553 — Foto de perfil de usuario (Bloque I, #78; D11-13 = C)

Estado: `APPROVED` (firmado por Neo — Nivel 2, 2026-11-25). Redactó `/architect` el 2026-11-25. Contratos hermanos: `openapi/user-avatar.openapi.yaml` 3.2.0, `schemas/user-avatar.schema.json` 1.0.0, `errors/error-catalog.json` 1.3.0. Las migraciones y las constantes de `app-config.ts` las escribe `/keymaker` en `T1556` (escribirlas ahora rompe las pruebas que fijan la última migración: SQLite `0031`, Postgres `0027`).

## 1. Migraciones (Nivel 2, separadas de la de #63 — `MIF-011-10` = NO)

Aditivas, sin tabla ni puerto nuevo (`MIF-011-02`). Las filas existentes quedan con `avatar_version = 0` y sin foto. Sin saneado de datos. El runner aplica cada archivo en su propia transacción.

`src/infrastructure/persistence/sqlite/migrations/0032_user_avatar.sql`

```sql
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0 CHECK (avatar_version >= 0);
ALTER TABLE users ADD COLUMN avatar_object_id TEXT CHECK (avatar_object_id IS NULL OR length(avatar_object_id) = 36);
```

`src/infrastructure/persistence/postgres/migrations/0028_user_avatar.sql`

```sql
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0 CHECK (avatar_version >= 0);
ALTER TABLE users ADD COLUMN avatar_object_id TEXT CHECK (avatar_object_id IS NULL OR length(avatar_object_id) = 36);
```

Reglas: `avatar_version` solo crece (`UPDATE users SET avatar_version = avatar_version + 1`) y NUNCA se reinicia al quitar la foto; `avatar_object_id` nulo = sin foto. La API expone `avatarVersion = avatar_version` si `avatar_object_id` no es nulo, y `null` en caso contrario. La clave del objeto se deriva y no se persiste ni se expone: `users/{userId}/avatar/{avatarObjectId}` (UUID v4 nuevo en cada subida, sin extensión). El estado NO vive en `users.data` (un reescrito del JSON de perfil no puede revertirlo; mismo criterio que `pets`). El respaldo (`exportBackup`) no exporta estas columnas.

**Diferencia en PostgreSQL (`0028`, `/trinity` R-3).** Los `CHECK` se añaden con `ALTER TABLE users ADD CONSTRAINT ... CHECK (...) NOT VALID` seguido de `ALTER TABLE users VALIDATE CONSTRAINT ...` (convención de `0016`/`0024` y paridad de esquema), en lugar del `CHECK` en línea del bloque anterior. Mismo significado; las columnas son nuevas con `DEFAULT 0`, así que no hay filas que incumplan. SQLite (`0032`) conserva el `CHECK` en línea.

Pruebas existentes que fijan la última migración (SQLite `0031`, Postgres `0027`) deben actualizarse en `T1556` (paridad de esquema, `t1429`, `postgres-pool`).

## 2. Excepción documentada de clave de objeto (INV-ARC-003)

`media-storage.port.ts` admite solo `pets|scenes|households|about`. Se añade el patrón `users/<uuid>/avatar/<uuid>` (misma familia que la excepción de `households/<uuid>/photo/<uuid>` de 010/011-F). Un adaptador (GCS y memoria) rechaza cualquier otra. `/internal/maintenance` extiende la conciliación a `users/` con la misma regla (objeto con antigüedad > 15 min, `reconciliationAgeMinutes` en `media-keys.ts`, cuya clave no esté en `users.avatar_object_id` ni en la cola, a la cola con `DELETE`; alineado con `ENM-004-MINOR`. La subida en vuelo la protege su fila `INTENT` en la cola, que la conciliación no encola de nuevo, y no la antigüedad). Ningún campo de respuesta, log ni auditoría lleva la clave.

## 3. Endpoints (solo la propia cuenta; sin id de usuario en la ruta)

| Operación | Método y ruta | Éxito | Errores |
| --- | --- | --- | --- |
| `putUserAvatar` | `PUT /api/account/avatar` | 200 `{avatarVersion}` | 401, 403 `ERR-AUTH-CSRF-REJECTED`, 413 `ERR-MEDIA-TOO-LARGE`, 415 `ERR-MEDIA-TYPE-NOT-ALLOWED`, 422 `ERR-PRF11-AVATAR-INVALID-IMAGE`, 429, 502 `ERR-MEDIA-STORAGE-UNAVAILABLE` |
| `getUserAvatar` | `GET /api/account/avatar[?v=N]` | 200 imagen | 401, 404 `ERR-PRF11-AVATAR-NOT-FOUND`, 502 |
| `getUserAvatarMeta` | `GET /api/account/avatar/meta` | 200 `{avatarVersion: N \| null}` | 401 |
| `deleteUserAvatar` | `DELETE /api/account/avatar` | 204 (idempotente) | 401, 403 |

Privacidad (`REQ-PRF11-002`, `SC-011-059`): no existe ruta que reciba un id de usuario; no se incluye en `/api/shared/*` (vista pública del veterinario) ni en listados de miembros/invitados/administración; `GET` sirve la imagen por proxy (nunca URL firmada ni redirección); `Cache-Control: private, max-age=300` (decisión de Neo 1A, Logos iter 248) con `Vary: Cookie`, `X-Content-Type-Options: nosniff`. Sin foto, objeto ausente o fallo del almacén: la interfaz cae a iniciales sin error visible (`EDGE-011-007`). Códigos nuevos solo `ERR-PRF11-*` (no se reutiliza `ERR-HOG11-*`); se heredan `ERR-MEDIA-TOO-LARGE`, `ERR-MEDIA-TYPE-NOT-ALLOWED` y `ERR-MEDIA-STORAGE-UNAVAILABLE` de 004.

## 4. Límites y saneado (`SC-011-061`, `SC-011-062`)

Constantes que `/keymaker` añade a `src/infrastructure/config/app-config.ts` (`INV-ARCH-006`; este acta NO edita el archivo por los hunks `H-01`):

| Constante | Valor | Regla |
| --- | --- | --- |
| `USER_AVATAR_MAX_BYTES` | `524288` (512 KiB) | `Content-Length` y conteo en streaming, antes de decodificar; excedido = 413 |
| `USER_AVATAR_MIN_SIDE` | `64` px | imagen cuadrada (ancho = alto) |
| `USER_AVATAR_MAX_SIDE` | `1024` px | más estricto que `MAX_IMAGE_SIDE = 8192`; el cliente exporta 512×512 |
| `USER_AVATAR_PUT_MAX_PER_WINDOW` / `USER_AVATAR_PUT_WINDOW_MINUTES` | `10` / `60` | por usuario; excedido = 429 |

Orden de validación del `PUT`: CSRF y sesión → tamaño (413) → `Content-Type` ∈ {`image/jpeg`, `image/png`, `image/webp`} y firma coincidente por magic bytes (`415`; no se confía en la extensión ni en el nombre) → dimensiones con `readImageDimensions` (cuadrada, 64..1024; `422`) → `stripImageMetadata(mime, bytes)` (saneado por lista blanca: quedan solo los segmentos/chunks necesarios para decodificar; EXIF, XMP, ICC, GPS y comentarios fuera; `ok: false` = 422) → se guarda SOLO la versión saneada. Nada se persiste ante cualquier rechazo. La decisión de MIME la toma el servidor sobre la firma, no el cliente. Sin lectura ni descarga de `picture` de Google.

**Saneado (decisión de Neo 2A, Logos iter 248; cierra H-4 de Trinity).** El saneado es por **lista blanca con `stripImageMetadata`**, sin reencodificación de píxeles y sin dependencias npm nuevas: se conservan solo los bloques estructurales imprescindibles y se descartan EXIF, XMP, ICC y comentarios (en PNG los chunks `tEXt`/`iTXt`/`zTXt`/`eXIf`/`iCCP`; en JPEG los segmentos `APP1`/`APP2`/`APP13`/`COM`; en WebP los chunks `EXIF`/`XMP `/`ICCP`). Va precedido de la validación de firma PNG/WebP/JPEG, dimensiones cuadradas 64..1024 y tope de 512 KiB, coherente con `REQ-AVA-002` y `RES-2`. Los píxeles no se tocan.

### 4.1 Precisiones de T1555 (consolidación `/architect`, 2026-11-25)

Origen: actas `trinity-011-T1555-avatar-usuario-2026-11-25.md` y `rama-011-T1555-avatar-usuario-2026-11-25.md`; Neo aprobó (a)-(d) en Logos iter 246. Los puntos marcados «requisito de implementación» no cambian el contrato; los recoge `/keymaker` en `T1556` y los fija la prueba roja de `T1554`.

- **Dimensiones (Trinity H-3).** Cuadrada y 64..1024 se valida sobre la SALIDA saneada y sobre todas las cabeceras declaradas: canvas VP8X, frames VP8/VP8L internos y los dos SOF de un JPEG. Si cualquiera queda fuera, 422.
- **Tipo declarado (Trinity H-2).** El `Content-Type` declarado debe coincidir con la firma de los bytes; si no, 415.
- **GET (Trinity H-5).** El `Content-Type` de la respuesta se deriva de la firma de los bytes saneados, nunca del tipo almacenado.
- **Límite de subidas (Trinity H-6).** Las 10 subidas por hora se consumen en `onRequest`, tras autenticar y antes de leer el cuerpo, y cuentan todo intento autenticado con CSRF válido (éxitos y fallos 413/415/422). `DELETE` y `GET` no consumen. El intento 11 devuelve 429.
- **Ámbito del limitador (Trinity H-7, requisito de implementación).** Hace falta un ámbito nuevo de tipo cerrado en el limitador. El contador es en memoria por instancia (límite aproximado con varias instancias; se asume).
- **413 y caché (Trinity H-1, requisito de implementación).** El 413 de `/api/account/avatar` debe quedar cubierto por el manejo de errores de medios: ampliar la expresión de `MEDIA_UPLOAD_PATH` de `problem-details.ts`. `Cache-Control: no-store` aplica también a esta ruta en sus respuestas de error y de metadatos.
- **Borrado con la cuenta (Trinity H-8, `INV-PRF11-001` / `SC-011-060`, requisito de `T1556` y de la prueba roja de `T1554`).** El borrado de la foto se cablea en las DOS vías de eliminación de cuenta (contraseña y Google) y en la conciliación del prefijo `users/`.
- **Carrera (Trinity H-9).** `T1554` incluye la prueba de carrera entre `PUT` y eliminación de la cuenta (no debe quedar objeto huérfano).
- **Metadatos embebidos (Rama H-04).** `T1554` comprueba que en lo guardado no quedan chunks `tEXt`/`iTXt`/`zTXt` ni segmentos `APP1`/`APP13`.
- **Caché (Rama H-02, resuelta por Neo 1A, Logos iter 248).** `T1554` prueba la cabecera del `GET`: `Cache-Control: private, max-age=300` y `Vary: Cookie`, con `v` actual; con `v` ausente o distinto, `private, no-cache`.

### 4.2 Decisiones de Neo (Logos iter 248, 2026-11-25; antes pendientes)

1. **H-02 (Rama), 1A:** `GET` con `v` actual: `private, max-age=300`, `Vary: Cookie`, caducidad corta de 5 minutos.
2. **H-4 (Trinity), 2A:** saneado por lista blanca con `stripImageMetadata`, sin reencodificación de píxeles ni dependencias nuevas (ver §4).
3. **H-05 (Rama), 3A:** enmienda MINOR acotada `ENM-004-MINOR` de `INV-ARC-003` en la spec 004: admite EXCLUSIVAMENTE `users/<uuid>/avatar/<uuid>` (regex estricto `^users/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatar/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`) y la conciliación acotada a ese prefijo. La excepción deja de ser solo de este anexo.
4. **H-03 (Rama):** el texto legal de 010 no se edita; queda como `DEUDA-011-LEGAL-AVATAR-PERFIL` (`TECHDEBT-011`, `OPEN`) en `tasks.md`, ligada a la revisión legal externa (0.1.0 DRAFT a 1.0.0) antes de publicar; no bloquea `T1556` ni el cierre del Bloque I.

## 5. Protocolo de datos (igual que el avatar de mascota de 004)

- Cambio: T1 `INSERT media_deletion_queue (users/{id}/avatar/{nuevo}, 'INTENT')` → `put` → T2 con candado: `UPDATE users SET avatar_version = avatar_version + 1, avatar_object_id = :nuevo WHERE id = :id`, `INSERT` de la clave anterior (si existía) con `DELETE`, `DELETE` de la fila `INTENT`. Fallo tras el `put`: la fila pasa a `DELETE` y se borra de inmediato.
- Quitar: con candado, `INSERT` de la clave actual con `DELETE` y `UPDATE users SET avatar_object_id = NULL` (`avatar_version` no cambia). Tras `COMMIT`: `delete` idempotente en GCS (404 = éxito).
- Eliminación de cuenta (`INV-PRF11-001`, `SC-011-060`): en la misma transacción que ya borra la cuenta, `INSERT media_deletion_queue (clave de avatar, 'DELETE')` si `avatar_object_id` no es nulo; tras `COMMIT`, borrado inmediato y refuerzo con `list('users/{userId}/')` borrando lo que quede (mismo patrón `purgeObjects`/`reinforcePrefix` de `media-use-cases.ts`). Aplica a la eliminación con contraseña y a la de cuentas Google (`account-use-cases.ts`, `account-google-deletion-use-cases.ts`). Sin objeto huérfano ni vínculo.
- Auditoría: el `PUT` y el `DELETE` pueden registrar `USER`/`UPDATE` con hash de estado, sin clave ni bytes; no se añade tipo de entidad (sin migración de `audit_log`).

## 6. Derivadas para revisión de Neo / `/oracle`

(a) Ruta de metadatos `GET /account/avatar/meta` separada, para no tocar `UserSelfProfile` ni `/auth/me` de 001/002 (no se edita ningún contrato ajeno); (b) imagen obligatoriamente cuadrada 64..1024 y tope de 512 KiB, igual que el avatar de mascota; (c) limitación de 10 subidas por hora; (d) dos códigos nuevos `ERR-PRF11-*` y reutilización de tres `ERR-MEDIA-*` heredados; (e) conciliación de mantenimiento extendida al prefijo `users/`.
