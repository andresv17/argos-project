-- Estado de aprobacion de la cuenta (Feature 009, Fase 4, #18; T1243; Nivel 2 pre-autorizada por Neo; REQ-APR9-004, REQ-APR9-007; STATE-ACCT9-001; ADR-009-09).
-- @implements REQ-APR9-001, REQ-APR9-003, REQ-APR9-004, REQ-APR9-007, STATE-ACCT9-001
-- Equivale a la 0020 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (expand, no edita 0001..0015): un DEFAULT constante no reescribe la tabla; toda cuenta previa queda `ACTIVE`, sin fecha ni autor de decision.
-- Los CHECK se agregan NOT VALID y se validan despues (sin bloqueo largo); el texto de cada CHECK es el mismo que el de columna de SQLite.
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN decided_at TEXT;
ALTER TABLE users ADD COLUMN decided_by TEXT;
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('PENDING', 'ACTIVE', 'REJECTED')) NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_decided_at_check CHECK ((account_status = 'PENDING' AND decided_at IS NULL) OR (account_status = 'REJECTED' AND decided_at IS NOT NULL) OR account_status = 'ACTIVE') NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_decided_by_check CHECK (decided_by IS NULL OR (decided_at IS NOT NULL AND length(decided_by) = 36)) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_account_status_check;
ALTER TABLE users VALIDATE CONSTRAINT users_decided_at_check;
ALTER TABLE users VALIDATE CONSTRAINT users_decided_by_check;
