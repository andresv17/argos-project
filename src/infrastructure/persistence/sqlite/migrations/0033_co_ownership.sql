-- Co-propiedad y solicitudes de propietarios (Feature 012, Bloque A, #22; T1613; Nivel 2; REQ-OWN12-001, REQ-OWN12-007, NFR-012-006, NFR-012-008; INV-OWN12-001..007, INV-CHP12-005, STATE-COOWN12-001, STATE-OWNREQ12-001).
-- @implements REQ-OWN12-001, REQ-OWN12-007, NFR-012-006, NFR-012-008, STATE-COOWN12-001, STATE-OWNREQ12-001
-- Migracion NUEVA (no edita 0001..0032). `pets.owner_user_id` NO cambia: las mascotas existentes quedan con cero co-propietarios y `ownership_version = 1` (anexo ENM-002-MINOR-012 §7).
-- Despliegue rolling (R-08, T1626): desactivar las rutas de transferencia de 002 o abrir ventana de mantenimiento ANTES de aplicarla.
-- Convenciones del repositorio: marcas de tiempo como TEXT ISO-8601 UTC (como el resto de tablas; el INTEGER del data-model.md se materializa asi para conservar paridad con PostgreSQL y evitar enteros de 32 bits).
--   Por eso el techo absoluto de 60 dias de `frozen_until` (N2-R5) es regla de dominio dentro de la transaccion y no un CHECK (no hay aritmetica de fechas portable entre motores).
--   Sin regex en CHECK (SQLite no tiene REGEXP): E.164, chip_last4 y catalogos se validan en el dominio; aqui solo longitudes y conjuntos cerrados.
-- `owner_requests` y `pet_co_owners` NO usan ON DELETE CASCADE desde `users` y `owner_requests` tampoco desde `pets` (INV-CHP12-005): los expedientes de disputa sobreviven; las columnas de usuario son NULLables con FK SET NULL
--   y se seudonimizan dentro de eraseAccountInTransaction. `pet_co_owners.pet_id` si cae en cascada con la mascota (data-model.md).
-- `dispute_evidence` (Bloque #23, T16xx) NO se crea aqui: pertenece a otro bloque.

ALTER TABLE pets ADD COLUMN ownership_version INTEGER NOT NULL DEFAULT 1 CHECK (ownership_version >= 1);

CREATE TABLE pet_co_owners (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  user_pseudonym TEXT,
  status TEXT NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'EXPIRED', 'LEFT', 'PROMOTED', 'ENDED')),
  invited_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  invited_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  joined_at TEXT,
  left_at TEXT,
  promotion_kind TEXT CHECK (promotion_kind IS NULL OR promotion_kind IN ('DESIGNATED', 'AUTO')),
  promotion_notice_ack_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (promotion_kind IS NULL OR status = 'PROMOTED'),
  CHECK (status <> 'ACTIVE' OR joined_at IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX pet_co_owners_live ON pet_co_owners (pet_id, user_id) WHERE status IN ('INVITED', 'ACTIVE') AND user_id IS NOT NULL;
CREATE INDEX pet_co_owners_user_status ON pet_co_owners (user_id, status);
CREATE INDEX pet_co_owners_pet_status ON pet_co_owners (pet_id, status);

CREATE TABLE owner_requests (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  action TEXT NOT NULL CHECK (action IN ('DELETE_PET', 'TRANSFER_PRINCIPAL', 'CHANGE_PRINCIPAL', 'INVITE_CO_OWNER', 'CLAIM_CO_OWNERSHIP', 'CHIP_DISPUTE')),
  pet_id TEXT REFERENCES pets (id) ON DELETE SET NULL,
  pet_version INTEGER NOT NULL CHECK (pet_version >= 1),
  requester_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  requester_pseudonym TEXT,
  target_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  target_username_sealed TEXT,
  target_response TEXT CHECK (target_response IS NULL OR length(target_response) <= 280),
  trigger_request_ids TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'UNDER_REVIEW', 'RESOLVED')),
  approver_set TEXT NOT NULL DEFAULT '[]',
  approvals TEXT NOT NULL DEFAULT '[]',
  rejected_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  rejected_by_pseudonym TEXT,
  message TEXT CHECK (message IS NULL OR length(message) <= 280),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  stale_reason TEXT,
  dispute_reason TEXT CHECK (dispute_reason IS NULL OR dispute_reason IN ('CHIP_APPROPRIATION', 'CO_OWNER_ABSENT_OR_BLOCKING', 'PRINCIPAL_ABSENT')),
  chip_last4 TEXT CHECK (chip_last4 IS NULL OR length(chip_last4) = 4),
  chip_hmac TEXT CHECK (chip_hmac IS NULL OR length(chip_hmac) >= 1),
  frozen_until TEXT,
  freeze_extended_at TEXT,
  sla_due_at TEXT,
  escalated_at TEXT,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('REJECT', 'ADD_CO_OWNER', 'REQUEST_CHANGE_PRINCIPAL', 'END_CO_OWNERSHIP')),
  moot_reason TEXT CHECK (moot_reason IS NULL OR moot_reason IN ('TARGET_LEFT', 'TARGET_NOT_ACTIVE', 'REQUESTER_NOT_ACTIVE', 'TRIGGER_LOST', 'PET_GONE')),
  resolved_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  second_approver_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  executes_after TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (action <> 'CHIP_DISPUTE' OR dispute_reason IS NOT NULL),
  CHECK (action = 'CHIP_DISPUTE' OR (dispute_reason IS NULL AND resolution IS NULL AND moot_reason IS NULL AND frozen_until IS NULL AND freeze_extended_at IS NULL)),
  CHECK (action <> 'CLAIM_CO_OWNERSHIP' OR (chip_hmac IS NOT NULL AND chip_last4 IS NOT NULL)),
  CHECK (dispute_reason IS NULL OR dispute_reason <> 'CHIP_APPROPRIATION' OR (chip_hmac IS NOT NULL AND chip_last4 IS NOT NULL)),
  CHECK (dispute_reason IS NULL OR dispute_reason = 'CHIP_APPROPRIATION' OR (chip_hmac IS NULL AND chip_last4 IS NULL)),
  CHECK (resolution IS NULL OR resolution <> 'END_CO_OWNERSHIP' OR dispute_reason = 'CO_OWNER_ABSENT_OR_BLOCKING'),
  CHECK (resolution IS NULL OR resolution <> 'REQUEST_CHANGE_PRINCIPAL' OR dispute_reason IN ('CHIP_APPROPRIATION', 'PRINCIPAL_ABSENT')),
  CHECK (freeze_extended_at IS NULL OR frozen_until IS NOT NULL),
  CHECK (message IS NULL OR status IN ('PENDING', 'UNDER_REVIEW')),
  CHECK (target_username_sealed IS NULL OR status = 'PENDING'),
  CHECK (target_response IS NULL OR status = 'UNDER_REVIEW')
) STRICT;
CREATE UNIQUE INDEX owner_requests_one_live_action ON owner_requests (pet_id, action) WHERE status = 'PENDING' AND action IN ('DELETE_PET', 'TRANSFER_PRINCIPAL', 'CHANGE_PRINCIPAL', 'INVITE_CO_OWNER');
CREATE UNIQUE INDEX owner_requests_claim_pending ON owner_requests (requester_user_id, chip_hmac) WHERE action = 'CLAIM_CO_OWNERSHIP' AND status = 'PENDING';
CREATE UNIQUE INDEX owner_requests_dispute_chip_open ON owner_requests (requester_user_id, chip_hmac) WHERE action = 'CHIP_DISPUTE' AND dispute_reason = 'CHIP_APPROPRIATION' AND status = 'UNDER_REVIEW';
CREATE UNIQUE INDEX owner_requests_absence_anchor ON owner_requests (pet_id, target_user_id) WHERE action = 'CHIP_DISPUTE' AND dispute_reason IN ('CO_OWNER_ABSENT_OR_BLOCKING', 'PRINCIPAL_ABSENT') AND status = 'UNDER_REVIEW';
CREATE INDEX owner_requests_chip_reserve ON owner_requests (chip_hmac) WHERE action = 'CHIP_DISPUTE' AND dispute_reason = 'CHIP_APPROPRIATION' AND status = 'UNDER_REVIEW';
CREATE INDEX owner_requests_cooldown ON owner_requests (requester_user_id, chip_hmac, decided_at);
CREATE INDEX owner_requests_pet_status ON owner_requests (pet_id, status);

-- REQ-OWN12-007: `pet_assignments.assigned_by_user_id` pasa a NULLable con FK SET NULL hacia users (SQLite no altera columnas: reconstruccion de la tabla).
-- Relleno retroactivo con el propietario de la mascota cuando el ID previo ya no apunta a un usuario existente (antes no habia FK).
CREATE TABLE pet_assignments_new (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  assigned_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (pet_id, household_id)
) STRICT;
INSERT INTO pet_assignments_new (pet_id, household_id, assigned_by_user_id, assigned_at)
  SELECT a.pet_id, a.household_id,
    COALESCE(
      (SELECT u.id FROM users u WHERE u.id = a.assigned_by_user_id),
      (SELECT u.id FROM users u JOIN pets p ON p.owner_user_id = u.id WHERE p.id = a.pet_id)
    ),
    a.assigned_at
  FROM pet_assignments a;
DROP TABLE pet_assignments;
ALTER TABLE pet_assignments_new RENAME TO pet_assignments;
CREATE INDEX pet_assignments_household_id ON pet_assignments (household_id);
