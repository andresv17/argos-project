-- Estado de aprobacion de la cuenta (Feature 009, Fase 4, #18; T1243; Nivel 2 pre-autorizada por Neo; REQ-APR9-004, REQ-APR9-007; STATE-ACCT9-001; ADR-009-09).
-- @implements REQ-APR9-001, REQ-APR9-003, REQ-APR9-004, REQ-APR9-007, STATE-ACCT9-001
-- Migracion NUEVA y ADITIVA (no edita 0001..0019): TODA cuenta previa queda `ACTIVE` por el DEFAULT de columna; el codigo crea las cuentas nuevas en `PENDING` de forma explicita (T1246).
-- `account_status`: PENDING | ACTIVE | REJECTED (maquina cerrada STATE-ACCT9-001). `decided_at`: instante de la decision (nulo en PENDING y en las cuentas previas; obligatorio en REJECTED,
--   base del bloqueo y de la purga a 30 dias). `decided_by`: `admin_id` (UUID v4) de quien decidio; sin clave foranea (la auditoria sobrevive a la identidad, INV-ADM9-002) y nulo si no hubo decision.
-- Los CHECK son de columna (SQLite no admite ADD CONSTRAINT) y se evaluan contra las filas existentes; Postgres (0016) los agrega NOT VALID + VALIDATE con el mismo texto.
-- Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.

ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('PENDING', 'ACTIVE', 'REJECTED'));
ALTER TABLE users ADD COLUMN decided_at TEXT CHECK ((account_status = 'PENDING' AND decided_at IS NULL) OR (account_status = 'REJECTED' AND decided_at IS NOT NULL) OR account_status = 'ACTIVE');
ALTER TABLE users ADD COLUMN decided_by TEXT CHECK (decided_by IS NULL OR (decided_at IS NOT NULL AND length(decided_by) = 36));
