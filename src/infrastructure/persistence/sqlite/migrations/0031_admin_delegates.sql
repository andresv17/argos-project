-- Administradores delegados de /admin y roles de plataforma (Feature 011, Bloque D, #63; T1527; Nivel 2: ORA-1 opcion (b), aprobada por Neo en Logos iter 226; REQ-ADM11-001..007, INV-ADM11-001, INV-ADM11-002, STATE-ADM11-001).
-- @implements REQ-ADM11-001, REQ-ADM11-002, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-006, REQ-ADM11-007, STATE-ADM11-001, EDGE-011-009, EDGE-011-010, EDGE-011-019
-- Migracion NUEVA y ADITIVA (no edita 0001..0030): DDL puro de la tabla `admin_delegates`; NO toca `users`, `admin_identities`, `admin_sessions` ni `admin_audit_entries`. Sin saneado de datos.
-- Sin clave foranea hacia `users` (INV-ADM9-002) ni hacia `admin_identities`: el `admin_id` es el MISMO id en ambas tablas (DERIVADA (g)) y la raiz (ARGOS_ADMIN_EMAILS) no tiene fila.
-- `role`: conjunto cerrado de PlatformRole (H-8); ningun valor coincide con un rol de hogar. `status`: STATE-ADM11-001. La caducidad de INVITED NO es un estado: se deriva de `invited_expires_at` y del reloj.
-- ORA-1 (b): el correo es unico SOLO entre filas vivas (`ACTIVE` | `INVITED`); una baja (`DISABLED`) libera el correo para una invitacion nueva con `admin_id` nuevo y ancla limpia (EDGE-011-019). La reactivacion
--   explicita por `admin_id` sigue funcionando y la rechaza el indice si ya hay otra fila viva con ese correo. Reemplaza el UNIQUE(email) del anexo.
-- Derivada de la misma decision: `(provider, provider_subject)` es unico solo entre filas `ACTIVE` (una fila `DISABLED` conserva su `sub` para la reactivacion de D11-04 sin impedir que la misma cuenta de Google
--   se vuelva a invitar con una fila nueva).
-- Las acciones de auditoria nuevas (ADMIN_DELEGATE_*) no requieren migracion: `admin_audit_entries.action` solo tiene CHECK de longitud (MIF-011-01).

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
CREATE INDEX admin_delegates_email ON admin_delegates (email);
