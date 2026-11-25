# Anexo de contratos 011: matriz de roles y diseño de migraciones de delegados (T1524)

Estado: `APPROVED` (firmado por Neo — Nivel 2, 2026-11-25). Fuente normativa de la matriz: `x-sdd-role-matrix` de `openapi/admin.openapi.yaml` 1.8.0; este anexo la explica. Trazabilidad: `REQ-ADM11-001..007`, `INV-ADM11-001`, `INV-ADM11-002`, `STATE-ADM11-001`.

## 1. Matriz operación → roles (deny-by-default, H-7)

`SUPER_ADMIN` figura en toda fila. `PUBLIC_PRE_SESSION` = ruta anterior a la sesión (acceso con Google).

| Operación (`operationId`) | Ruta | SUPER_ADMIN | OPERATOR | SUPPORT |
| --- | --- | :-: | :-: | :-: |
| `startAdminGoogleLogin`, `completeAdminGoogleLogin` | `GET /api/admin/auth/google/{start,callback}` | PUBLIC_PRE_SESSION | | |
| `getAdminSession`, `endAdminSession` | `GET/DELETE /api/admin/session` | sí | sí | sí |
| `getAdminSelf` (nueva, **(f) ratificada por Neo 2026-11-25 (Logos iter 226)**) | `GET /api/admin/me` | sí | sí | sí |
| `getAdminPendingCount` | `GET /api/admin/pending-count` | sí | sí | sí |
| `listAdminRegistrations` | `GET /api/admin/registrations` | sí | sí | sí |
| `approveAdminRegistration`, `rejectAdminRegistration` | `POST /api/admin/registrations/{id}/{approve,reject}` | sí | sí | sí |
| `listAdminParameters` | `GET /api/admin/parameters` | sí | sí | no |
| `updateAdminParameter` | `PUT /api/admin/parameters/{key}` | sí | sí | no |
| `resetAdminSceneQuota` | `POST /api/admin/parameters/scene-quota/reset` | sí | sí | no |
| `getAdminAbout`, `updateAboutText`, `putAboutPhoto` | `GET/PUT /api/admin/about`, `PUT /api/admin/about/photo` | sí | sí | no |
| `listAdminDelegates` | `GET /api/admin/administrators` | sí | no | no |
| `inviteAdminDelegate` | `POST /api/admin/administrators` | sí (SUPER_ADMIN como rol destino: solo la raíz) | no | no |
| `changeAdminDelegateRole` | `PUT /api/admin/administrators/{adminId}/role` | sí (H-6) | no | no |
| `disableAdminDelegate`, `reactivateAdminDelegate`, `reinviteAdminDelegate` | `POST /api/admin/administrators/{adminId}/{disable,reactivate,reinvite}` | sí (H-6) | no | no |

Reglas:

1. **Registro central.** Un único módulo de `infrastructure/http/` exporta `método + ruta → conjunto de roles` (o `PUBLIC_PRE_SESSION`). Las rutas de 009, 010 y 011 se declaran allí; una ruta `/api/admin/*` montada y ausente se rechaza (404 uniforme) y la **prueba meta** (T1525) enumera las rutas montadas por Fastify y falla si alguna no figura o si el registro lista una que no existe.
2. **Orden de comprobación.** `X-Argos-Request` (403, antes de la sesión) → sesión (404 uniforme) → rol desde BD (403 `ERR-ADM11-ROLE-NOT-AUTHORIZED`, antes de leer el cuerpo) → esquema (422) → existencia (404) → autoafectación (403) → concesión H-6 (403) → raíz protegida y estado (409) → precondición (412) → tope y guarda del último `SUPER_ADMIN` (409) → efecto y auditoría.
3. **Resolución del rol.** Desde BD en cada petición y de nuevo dentro de la transacción de escritura (`EDGE-011-015`); nunca desde la cookie ni un campo de sesión. Correo en `ARGOS_ADMIN_EMAILS` → `SUPER_ADMIN` raíz; si no, delegado `ACTIVE` con correo exacto y `sub` anclado; cualquier otro caso (sin fila, `INVITED`, caducada, `DISABLED`, sin ancla, correo distinto, rol desconocido) = sin acceso = 404 uniforme (`DENIED`).
4. **Alcance de `SUPPORT`:** solo `pending-count`, `registrations` y sus decisiones, más `session` y `me`. `OPERATOR`: lo anterior más parámetros (las claves de escena viven en el catálogo cerrado de parámetros), reinicio de cuota y Acerca de.
5. **Concesión (H-6).** Solo la raíz concede o retira `SUPER_ADMIN`; un `SUPER_ADMIN` delegado gestiona `OPERATOR` y `SUPPORT` y no toca a otro `SUPER_ADMIN` ni a la raíz; ningún rol se autoafecta.
6. **Sin «eliminar»** (H-9): la baja es `DISABLED`.

## 2. Constantes (`app-config.ts`, INV-ARCH-006; las añade `/keymaker`, no esta tarea)

| Constante | Valor | Origen |
| --- | --- | --- |
| `ADMIN_DELEGATE_ACTIVE_LIMIT` | 20 | `D11-03` = B+A (aprobado). Cuenta `ACTIVE` + `INVITED` no caducadas (**(a) ratificada por Neo 2026-11-25 (Logos iter 226)**). |
| `ADMIN_DELEGATE_INVITATION_TTL_HOURS` | 72 | `H-1` (aprobado). |
| `ADMIN_DELEGATE_DISABLED_RETENTION_DAYS` | 365 | D-1 (Neo 2026-11-25, Logos iter 228): 12 meses. Al vencer: anonimizar correo y `sub`, conservando solo `admin_id` opaco (integridad de `admin_audit_entries`). D-3: `admin_identities` del `DISABLED` se retiran o anonimizan al mismo plazo; antes se conservan para la reactivación (`D11-04`). |
| `ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS` | 30 | D-2 (Neo 2026-11-25, Logos iter 228): 30 días tras la caducidad de las 72 h; al vencer, purga de la fila. |
| `ADMIN_DELEGATE_ROW_LIMIT` | 100 | Nota trinity H-5 del spec (valor fijado por `T1524`; **(d) ratificada por Neo 2026-11-25 (Logos iter 226)**). Mismo código de error que el tope de 20. |

## 3. Diseño de migraciones (cerrado; NO se escriben los `.sql` en esta tarea)

Numeración real en disco: SQLite última `0030_scene_snapshot_v2.sql` → nueva **`0031_admin_delegates.sql`**; PostgreSQL última `0026_scene_snapshot_v2.sql` → nueva **`0027_admin_delegates.sql`**. Migración **aditiva**, separada de la del Bloque D (#78) (`MIF-011-10` = NO), sin tocar `users`, `admin_identities`, `admin_sessions` ni `admin_audit_entries`.

**Por qué no se escriben ahora.** `tests/integration/persistence/postgres-pool.spec.ts` (línea 106) fija que la última migración de Postgres es `0026_scene_snapshot_v2.sql` y `sqlite-repositories.spec.ts` (líneas 112 y 141) enumera las versiones de SQLite; añadir los `.sql` pone rojas pruebas existentes y obliga a editar código de pruebas y posiblemente `scripts/migrate-postgres.ts`. Eso es trabajo de `/keymaker` junto con `T1525`/`T1527`, no de contratos. El DDL está verificado sintácticamente (`sqlite3 :memory:`).

Tabla `admin_delegates` (sin FK a `users`):

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `admin_id` | TEXT (UUID v4) | PK; `length = 36`; id de `IdGeneratorPort`, el mismo que usa `admin_identities` y la auditoría |
| `email` | TEXT | `NOT NULL`, `length 3..254`, `email = lower(email)`; único **solo entre filas vivas**: `UNIQUE (email) WHERE status IN ('ACTIVE','INVITED')` (ORA-1 b, aprobado por Neo; una baja `DISABLED` libera el correo, `EDGE-011-019`) |
| `role` | TEXT | `NOT NULL`, `CHECK (role IN ('SUPER_ADMIN','OPERATOR','SUPPORT'))` (H-8; conjunto cerrado de `PlatformRole`) |
| `status` | TEXT | `NOT NULL`, `CHECK (status IN ('INVITED','ACTIVE','DISABLED'))` |
| `provider` / `provider_subject` | TEXT / TEXT | nulos hasta el anclaje; `CHECK` los dos nulos o los dos presentes (`provider = 'GOOGLE'`, `sub` ≥ 1); `UNIQUE (provider, provider_subject) WHERE status = 'ACTIVE'` — (i) **ratificada por Neo 2026-11-25 (Logos iter 228)** (ver nota bajo el DDL) |
| `invited_at` / `invited_expires_at` | TEXT | `invited_expires_at > invited_at`; obligatorios en `INVITED`, nulos en `ACTIVE` |
| `anchored_at`, `disabled_at` | TEXT | coherentes con el estado (CHECK de estado, abajo) |
| `created_by_admin_id` | TEXT | `NOT NULL`, `length = 36`, sin FK (la raíz no tiene fila) |
| `created_at`, `updated_at` | TEXT | `NOT NULL`; `updated_at` alimenta el `etag` |

`CHECK` de coherencia estado/anclaje: `INVITED` ⇒ `provider_subject IS NULL`, `invited_expires_at IS NOT NULL`, `disabled_at IS NULL`; `ACTIVE` ⇒ `provider_subject IS NOT NULL`, `disabled_at IS NULL`; `DISABLED` ⇒ `disabled_at IS NOT NULL`. Índices: `UNIQUE (email) WHERE status IN ('ACTIVE','INVITED')` (ORA-1 b), `UNIQUE (provider, provider_subject) WHERE status = 'ACTIVE'` ((i) ratificada por Neo 2026-11-25 (Logos iter 228)), `(status)` para el conteo del tope.

**Acciones de auditoría nuevas (sin migración, `MIF-011-01`):** la columna `admin_audit_entries.action` solo tiene `CHECK (length 1..64)`; la lista cerrada vive en `AdminAuditAction` del contrato y en código: `ADMIN_DELEGATE_INVITED`, `ADMIN_DELEGATE_REINVITED`, `ADMIN_DELEGATE_ANCHORED`, `ADMIN_DELEGATE_ROLE_CHANGED`, `ADMIN_DELEGATE_DISABLED`, `ADMIN_DELEGATE_INVITATION_CANCELLED`, `ADMIN_DELEGATE_REACTIVATED` (todas ≤ 64). `admin_id` de la entrada = autor; `object_ref` = `admin_id` objetivo (36 ≤ 128); nunca el correo.

**Notas para `/keymaker`:**

1. Anclaje: en la misma transacción, `UPDATE ... WHERE admin_id = ? AND status = 'INVITED' AND provider_subject IS NULL AND invited_expires_at >= :now` (compare-and-set) e `INSERT` en `admin_identities` con el **mismo** `admin_id` (así `admin_sessions` y la auditoría de 009 funcionan sin cambios; **(g) ratificada por Neo 2026-11-25 (Logos iter 226)**). Un delegado reactivado ya tiene su identidad.
2. Desactivar: `UPDATE` de estado y borrado de sus filas de `admin_sessions` en la misma transacción (revocación inmediata, `REQ-ADM11-004`).
3. Guarda serializada del último `SUPER_ADMIN`, del tope de 20 y del tope de filas: un único servicio de dominio; PostgreSQL `SELECT ... FOR UPDATE` sobre las filas relevantes más una fila bloqueante de serialización (p. ej. `pg_advisory_xact_lock` o bloqueo del conjunto `status IN ('INVITED','ACTIVE')`); SQLite `BEGIN IMMEDIATE`. La elección exacta del mecanismo de bloqueo en Postgres queda para `/keymaker` y la verifican las pruebas de concurrencia reales de `T1525` (`EDGE-011-002`, `EDGE-011-010`).
4. PostgreSQL: mismos tipos `TEXT` que `0015_admin_portal.sql`, sin `STRICT`; los `CHECK` de rol y estado son idénticos a SQLite.

### DDL de referencia (SQLite 0031; Postgres 0027 igual sin `STRICT`)

```sql
CREATE TABLE admin_delegates (
  admin_id TEXT PRIMARY KEY CHECK (length(admin_id) = 36),
  email TEXT NOT NULL CHECK (length(email) >= 3 AND length(email) <= 254 AND email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'OPERATOR', 'SUPPORT')),
  status TEXT NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('GOOGLE')),
  provider_subject TEXT CHECK (provider_subject IS NULL OR length(provider_subject) >= 1),
  invited_at TEXT,
  invited_expires_at TEXT,
  anchored_at TEXT,
  disabled_at TEXT,
  created_by_admin_id TEXT NOT NULL CHECK (length(created_by_admin_id) = 36),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((provider IS NULL) = (provider_subject IS NULL)),
  CHECK (invited_expires_at IS NULL OR (invited_at IS NOT NULL AND invited_expires_at > invited_at)),
  CHECK (status <> 'INVITED' OR (provider_subject IS NULL AND invited_expires_at IS NOT NULL AND disabled_at IS NULL)),
  CHECK (status <> 'ACTIVE' OR (provider_subject IS NOT NULL AND disabled_at IS NULL AND invited_expires_at IS NULL)),
  CHECK (status <> 'DISABLED' OR (disabled_at IS NOT NULL AND invited_expires_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX admin_delegates_live_email ON admin_delegates (email) WHERE status IN ('ACTIVE', 'INVITED');
CREATE UNIQUE INDEX admin_delegates_active_subject ON admin_delegates (provider, provider_subject) WHERE status = 'ACTIVE';
CREATE INDEX admin_delegates_status ON admin_delegates (status);
```

> **(i) ratificada por Neo 2026-11-25 (Logos iter 228)** (propuesta de /keymaker, recomendada por /trinity; presente en `0031` SQLite y `0027` PostgreSQL): el índice parcial `admin_delegates_active_subject`. Justificación: defensa en profundidad (la unicidad del `sub` anclado la garantiza también la base de datos, no solo el código); implica `sub` no nulo por el `CHECK` de coherencia de `ACTIVE`; la re-invitación de la misma cuenta de Google tras una baja sigue funcionando porque el índice es parcial (una fila `DISABLED` conserva su `sub` sin colisionar); una violación se traduce a `DENIED` uniforme (acceso) o `409`/`412` (gestión), sin revelar el motivo. El correo único entre filas vivas (`admin_delegates_live_email`) es ORA-1 (b), ya aprobado por Neo.

## Listado filtrado en servidor y deudas (directiva de Neo 2026-11-25, Logos iter 228)

- **D-4**: el listado de delegados para un `SUPER_ADMIN` delegado se filtra **en el servidor**: solo filas `OPERATOR` y `SUPPORT`; nunca correos de otros `SUPER_ADMIN` delegados ni de la raíz (`REQ-ADM11-003`, `NFR-011-002`). Lo implementa `/keymaker`.
- **`DEUDA-011-PURGA-DELEGADOS`**: el job de purga (D-1, D-2, D-3) en `/internal/maintenance` queda fuera de #63; hoy no se purga nada.
- **OBS-5 / `DEUDA-011-PRIVACIDAD-DELEGADOS`**: `/privacidad` y `legal-texts.md` §3 no describen el tratamiento de delegados; vinculada a la revisión legal externa (0.1.0 DRAFT → 1.0.0). No dar de alta delegados externos en producción hasta actualizar `/privacidad`. No bloquea el cierre de código del Bloque D.
