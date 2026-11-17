-- Roles, propietario del hogar y asignaciones mascota-hogar de la Feature 002 (Rebanada 3, T243).
-- @implements REQ-MIG-001, INV-HOUSE2-001, REQ-HOUSE2-003, INV-ARCH-005
-- REQ-MIG-001 (roles y visibilidad): OWNER pasa a ADMIN con is_household_owner = 1; MEMBER pasa a READER;
--   una asignacion por cada hogar comun de cada dueño (hogar donde el dueño es ACTIVE y hay otro miembro ACTIVE),
--   de modo que cada miembro ve exactamente las mascotas que veia con la 001; todas las sesiones existentes
--   quedan revocadas (revoked_at y data.revokedAt). Es repetible: schema_migrations impide aplicarla dos veces y
--   las asignaciones usan INSERT OR IGNORE sobre la clave (pet_id, household_id).
-- INV-HOUSE2-001: como maximo un propietario del hogar ACTIVE (indice unico parcial sobre household_id).
-- REQ-HOUSE2-003: pet_assignments(pet_id, household_id) con assigned_by_user_id sin clave foranea (data-model §2.11).
-- household_invitations.role_on_join ya existe desde 0002 (REQ-HOUSE2-001); esta migracion no la altera.
-- Conversion de la 001 (data-model §2.9-2.10, ADR-002-10; decision de Neo): las filas INVITED, DECLINED y CANCELLED de
--   household_members pasan a household_invitations (id = membership_id, invitee_username = users.username,
--   role_on_join = READER, created_at = data.invitedAt, responded_at = NULL para INVITED y data.updatedAt para las demas)
--   y se eliminan de household_members; luego se reconstruye household_members con CHECK de status solo ACTIVE, LEFT y
--   REMOVED (household-membership.machine.json: INVITED/DECLINED/CANCELLED viven en la invitacion). Si una fila de la 001 no
--   trae invitedByUserId, invited_by_user_id queda NULO (data-model §2.10; no se inventan datos): para ello se reconstruye
--   household_invitations relajando ese NOT NULL (se conservan columnas, datos e indices). Si su usuario no existe, el
--   INSERT viola NOT NULL de invitee_username y toda la migracion se revierte.
-- Toda la migracion corre en una transaccion (runMigrations): si una sentencia falla, no queda nada a medias (INV-ARCH-005).

ALTER TABLE household_invitations RENAME TO household_invitations_0002;
DROP INDEX household_invitations_household_id;
DROP INDEX household_invitations_invitee_user_id;
DROP INDEX household_invitations_one_open;

CREATE TABLE household_invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  invitee_username TEXT NOT NULL,
  invitee_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  invited_by_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  role_on_join TEXT NOT NULL CHECK (role_on_join IN ('ADMIN', 'CAREGIVER', 'READER')),
  status TEXT NOT NULL CHECK (status IN ('INVITED', 'DECLINED', 'CANCELLED', 'ACCEPTED')),
  created_at TEXT NOT NULL,
  responded_at TEXT
) STRICT;
INSERT INTO household_invitations SELECT id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at FROM household_invitations_0002;
DROP TABLE household_invitations_0002;
CREATE INDEX household_invitations_household_id ON household_invitations (household_id);
CREATE INDEX household_invitations_invitee_user_id ON household_invitations (invitee_user_id);
CREATE UNIQUE INDEX household_invitations_one_open
  ON household_invitations (household_id, invitee_username)
  WHERE status = 'INVITED';

INSERT INTO household_invitations (id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at)
  SELECT m.membership_id, m.household_id, u.username, m.user_id, json_extract(m.data, '$.invitedByUserId'), 'READER', m.status,
         json_extract(m.data, '$.invitedAt'),
         CASE m.status WHEN 'INVITED' THEN NULL ELSE json_extract(m.data, '$.updatedAt') END
  FROM household_members m
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.status IN ('INVITED', 'DECLINED', 'CANCELLED');

DELETE FROM household_members WHERE status IN ('INVITED', 'DECLINED', 'CANCELLED');

DROP INDEX household_members_one_open_per_user;
ALTER TABLE household_members RENAME TO household_members_001;

CREATE TABLE household_members (
  membership_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  first_joined_at TEXT,
  data TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'READER' CHECK (role IN ('ADMIN', 'CAREGIVER', 'READER')),
  is_household_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_household_owner IN (0, 1) AND (is_household_owner = 0 OR role = 'ADMIN'))
) STRICT;

INSERT INTO household_members (membership_id, household_id, user_id, status, first_joined_at, data, role, is_household_owner)
  SELECT membership_id, household_id, user_id, status, first_joined_at,
         json_set(data,
                  '$.role', CASE json_extract(data, '$.role') WHEN 'OWNER' THEN 'ADMIN' ELSE 'READER' END,
                  '$.isHouseholdOwner', json(CASE json_extract(data, '$.role') WHEN 'OWNER' THEN 'true' ELSE 'false' END)),
         CASE json_extract(data, '$.role') WHEN 'OWNER' THEN 'ADMIN' ELSE 'READER' END,
         CASE json_extract(data, '$.role') WHEN 'OWNER' THEN 1 ELSE 0 END
  FROM household_members_001;

DROP TABLE household_members_001;

CREATE INDEX household_members_household_id ON household_members (household_id);
CREATE INDEX household_members_user_id ON household_members (user_id);
CREATE UNIQUE INDEX household_members_one_open_per_user
  ON household_members (household_id, user_id)
  WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX household_members_one_owner
  ON household_members (household_id)
  WHERE is_household_owner = 1 AND status = 'ACTIVE';

CREATE TABLE pet_assignments (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  assigned_by_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (pet_id, household_id)
) STRICT;
CREATE INDEX pet_assignments_household_id ON pet_assignments (household_id);

INSERT OR IGNORE INTO pet_assignments (pet_id, household_id, assigned_by_user_id, assigned_at)
  SELECT p.id, o.household_id, p.owner_user_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM pets p
  JOIN household_members o ON o.user_id = p.owner_user_id AND o.status = 'ACTIVE'
  WHERE EXISTS (
    SELECT 1 FROM household_members m
    WHERE m.household_id = o.household_id AND m.status = 'ACTIVE' AND m.user_id <> p.owner_user_id
  );

UPDATE sessions
  SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      data = json_set(data, '$.revokedAt', COALESCE(json_extract(data, '$.revokedAt'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
