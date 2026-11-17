-- Usuario unico sin distinguir mayusculas y normalizacion de intentos (Feature 004, T547; D-05, D-04 A).
-- @implements REQ-LOG-002, REQ-LOG-001, INV-LOG-001
-- Equivale a la 0007 de SQLite. Sin BEGIN/COMMIT: el migrador (T429) corre cada migracion en una transaccion y registra la version.
-- COMPROBACION PREVIA: si hay grupos de `users` con el mismo LOWER(username) la migracion ABORTA antes de tocar el esquema; el mensaje solo
--   trae el conteo (nunca un username).
DO $$
DECLARE
  clashes INTEGER;
BEGIN
  SELECT count(*) INTO clashes FROM (SELECT LOWER(username) FROM users GROUP BY 1 HAVING count(*) > 1) g;
  IF clashes > 0 THEN
    RAISE EXCEPTION 'Migracion 0003 abortada: % grupo(s) de usuarios con el mismo LOWER(username); Neo debe resolverlos antes de migrar', clashes;
  END IF;
END
$$;

DELETE FROM login_attempts a
 USING login_attempts other
 WHERE LOWER(other.username) = LOWER(a.username)
   AND other.username <> a.username
   AND (jsonb_array_length(other.failures::jsonb) > jsonb_array_length(a.failures::jsonb)
        OR (jsonb_array_length(other.failures::jsonb) = jsonb_array_length(a.failures::jsonb) AND other.username < a.username));
UPDATE login_attempts SET username = LOWER(username) WHERE username <> LOWER(username);

CREATE UNIQUE INDEX users_username_lower ON users (LOWER(username));

DROP INDEX household_invitations_one_open;
CREATE UNIQUE INDEX household_invitations_one_open
  ON household_invitations (household_id, LOWER(invitee_username))
  WHERE status = 'INVITED';
