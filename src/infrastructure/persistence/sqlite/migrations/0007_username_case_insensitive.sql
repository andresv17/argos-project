-- Usuario unico sin distinguir mayusculas y normalizacion de intentos (Feature 004, T547; D-05, D-04 A).
-- @implements REQ-LOG-002, REQ-LOG-001, INV-LOG-001
-- COMPROBACION PREVIA: sqlite-database.ts (`MIGRATION_PRECHECKS`) cuenta los grupos de `users` con el mismo lower(username) y ABORTA antes de
--   ejecutar este archivo si hay alguno; el mensaje solo trae el conteo (nunca un username). La migracion corre en una transaccion: si
--   algo falla no queda nada a medias y schema_migrations no la anota.
-- 1) Intentos de login: la clave pasa a minusculas (REQ-LOG-001). Si dos filas colapsan en la misma clave se conserva la de mayor contador
--    (mas fallos) y, a igualdad, la de menor username; el resto se borra antes de renombrar.
DELETE FROM login_attempts
 WHERE EXISTS (
   SELECT 1 FROM login_attempts other
    WHERE lower(other.username) = lower(login_attempts.username)
      AND other.username <> login_attempts.username
      AND (json_array_length(other.failures) > json_array_length(login_attempts.failures)
           OR (json_array_length(other.failures) = json_array_length(login_attempts.failures) AND other.username < login_attempts.username))
 );
UPDATE login_attempts SET username = lower(username) WHERE username <> lower(username);

-- 2) Unicidad por lower(username) (INV-LOG-001): el UNIQUE de la columna sigue distinguiendo mayusculas; este indice cierra la brecha.
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

-- 3) Invitaciones: una sola abierta por (hogar, lower(invitee_username)) (INV-HOUSE-003, REQ-LOG-002).
DROP INDEX household_invitations_one_open;
CREATE UNIQUE INDEX household_invitations_one_open
  ON household_invitations (household_id, lower(invitee_username))
  WHERE status = 'INVITED';
