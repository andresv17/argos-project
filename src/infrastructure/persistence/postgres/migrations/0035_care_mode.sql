-- Cuidador (Feature 012, Bloque C, #26; T1652; Nivel 2 PREAUTORIZADA por Neo, 2026-11-27; REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007; data-model.md Bloque #26; contratos 0.1.2 APPROVED).
-- @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007
-- Migracion NUEVA y ADITIVA: tres tablas, sin tocar ninguna existente. Una fila por VERSION de rutina (supersedes_routine_id); `series_id` es la rutina logica (A-05) y se copia a `care_log_entries.series_id` para la UNIQUE parcial (serie, fecha, hora) de registros no revertidos; las ocurrencias no se persisten (ADR-012-04). Sin idempotency_key (P-10).
-- `times_of_day` y `days_of_week`: arreglos JSON como TEXT; el CHECK solo acota forma y longitud (igual en ambos motores), el dominio valida elementos, orden y unicidad. `IU` incluida en dose_unit (contrato 0.1.1 A-01); `UNIT` retirada. La retencion (MEDICATION 1095 d, resto 365 d, revertidos 30 d) la aplica el mantenimiento por kind + occurrence_date/reverted_at: no hay columna de vencimiento en data-model.
-- FK a users con SET NULL (seudonimizacion de created_by/performed_by/reverted_by/granted_by); FK a pets y routines con CASCADE segun data-model.md (tabla de retencion).
-- Equivale a la 0039 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
CREATE TABLE care_routines (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  series_id TEXT NOT NULL CHECK (length(series_id) = 36),
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('MEDICATION', 'MEAL', 'WALK', 'OTHER')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  instructions TEXT NOT NULL DEFAULT '' CHECK (length(instructions) <= 300),
  dose_amount NUMERIC(8,3) CHECK (dose_amount IS NULL OR (dose_amount > 0 AND dose_amount <= 100000)),
  dose_unit TEXT CHECK (dose_unit IS NULL OR dose_unit IN ('MG', 'MCG', 'ML', 'IU', 'TABLET', 'DROP')),
  times_of_day TEXT NOT NULL CHECK (times_of_day LIKE '[%]' AND length(times_of_day) BETWEEN 9 AND 80),
  days_of_week TEXT NOT NULL CHECK (days_of_week LIKE '[%]' AND length(days_of_week) BETWEEN 3 AND 30),
  start_date TEXT NOT NULL CHECK (start_date LIKE '____-__-__'),
  end_date TEXT CHECK (end_date IS NULL OR end_date LIKE '____-__-__'),
  ongoing INTEGER NOT NULL DEFAULT 0 CHECK (ongoing IN (0, 1)),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  supersedes_routine_id TEXT REFERENCES care_routines (id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK ((dose_amount IS NULL) = (dose_unit IS NULL)),
  CHECK (kind <> 'MEDICATION' OR dose_amount IS NOT NULL),
  CHECK (kind <> 'MEDICATION' OR ((end_date IS NOT NULL) <> (ongoing = 1))),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX care_routines_pet ON care_routines (pet_id, active);
CREATE INDEX care_routines_series ON care_routines (series_id);

CREATE TABLE care_log_entries (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  routine_id TEXT NOT NULL REFERENCES care_routines (id) ON DELETE CASCADE,
  series_id TEXT NOT NULL CHECK (length(series_id) = 36),
  occurrence_date TEXT NOT NULL CHECK (occurrence_date LIKE '____-__-__'),
  occurrence_time TEXT NOT NULL CHECK (occurrence_time LIKE '__:__'),
  status TEXT NOT NULL CHECK (status IN ('DONE', 'SKIPPED')),
  late INTEGER NOT NULL DEFAULT 0 CHECK (late IN (0, 1)),
  performed_at TEXT NOT NULL,
  performed_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 140),
  reverted_at TEXT,
  reverted_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  revert_reason TEXT CHECK (revert_reason IS NULL OR length(revert_reason) BETWEEN 1 AND 140),
  CHECK (reverted_at IS NOT NULL OR (reverted_by_user_id IS NULL AND revert_reason IS NULL))
);
CREATE UNIQUE INDEX care_log_entries_occurrence ON care_log_entries (series_id, occurrence_date, occurrence_time) WHERE reverted_at IS NULL;
CREATE INDEX care_log_entries_routine_date ON care_log_entries (routine_id, occurrence_date);

CREATE TABLE pet_caregiver_access (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('VIEW_ONLY', 'BASIC_LOG')),
  care_until TEXT CHECK (care_until IS NULL OR care_until LIKE '____-__-__'),
  granted_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (pet_id, user_id)
);
CREATE INDEX pet_caregiver_access_user ON pet_caregiver_access (user_id);
