/**
 * Repositorios SQLite del Modo Cuidador de la 012 (#26; T1655): `care_routines`, `care_log_entries` y `pet_caregiver_access` (migración 0039). Mismo contrato que PostgreSQL y memoria.
 * `care_log_entries` no tiene `pet_id` ni dosis propias: la mascota y la dosis de la ocurrencia (A-04) salen de la fila de `care_routines` de su `routine_id`.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, INV-ARCH-005
 */
import type {
  CareLogRecord,
  CareLogRepositoryPort,
  CareRoutineRecord,
  CareRoutineRepositoryPort,
  CaregiverAccessRecord,
  CaregiverAccessRepositoryPort,
} from '../../../application/ports/care.port.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

type Row = Record<string, unknown>;

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const nonEmpty = (v: unknown): string | null => {
  const t = text(v);
  return t === null || t === '' ? null : t;
};

const toRoutine = (r: Row): CareRoutineRecord => ({
  id: String(r['id']),
  seriesId: String(r['series_id']),
  petId: String(r['pet_id']),
  kind: r['kind'] as CareRoutineRecord['kind'],
  title: String(r['title']),
  instructions: nonEmpty(r['instructions']),
  doseAmount: r['dose_amount'] === null ? null : Number(r['dose_amount']),
  doseUnit: r['dose_unit'] as CareRoutineRecord['doseUnit'],
  timesOfDay: JSON.parse(String(r['times_of_day'])) as string[],
  daysOfWeek: JSON.parse(String(r['days_of_week'])) as number[],
  startDate: String(r['start_date']),
  endDate: text(r['end_date']),
  ongoing: Number(r['ongoing']) === 1,
  active: Number(r['active']) === 1,
  effectiveFrom: String(r['effective_from']),
  effectiveTo: text(r['effective_to']),
  supersedesRoutineId: text(r['supersedes_routine_id']),
  version: Number(r['version']),
  createdByUserId: text(r['created_by_user_id']),
  createdAt: String(r['created_at']),
  updatedAt: String(r['updated_at']),
});

const toEntry = (r: Row): CareLogRecord => ({
  id: String(r['id']),
  petId: String(r['pet_id']),
  routineId: String(r['routine_id']),
  seriesId: String(r['series_id']),
  occurrenceDate: String(r['occurrence_date']),
  occurrenceTime: String(r['occurrence_time']),
  status: r['status'] as CareLogRecord['status'],
  note: nonEmpty(r['note']),
  late: Number(r['late']) === 1,
  performedByUserId: text(r['performed_by_user_id']),
  performedAt: String(r['performed_at']),
  doseAmountAtTime: r['dose_amount'] === null ? null : Number(r['dose_amount']),
  doseUnitAtTime: r['dose_unit'] as CareLogRecord['doseUnitAtTime'],
  revertedAt: text(r['reverted_at']),
  revertedByUserId: text(r['reverted_by_user_id']),
  revertReason: text(r['revert_reason']),
});

const toAccess = (r: Row): CaregiverAccessRecord => ({
  petId: String(r['pet_id']),
  userId: String(r['user_id']),
  level: r['level'] as CaregiverAccessRecord['level'],
  careUntil: text(r['care_until']),
  grantedByUserId: text(r['granted_by_user_id']),
  grantedAt: String(r['granted_at']),
  version: Number(r['version']),
});

const ROUTINE_COLUMNS =
  'id, series_id, pet_id, kind, title, instructions, dose_amount, dose_unit, times_of_day, days_of_week, start_date, end_date, ongoing, effective_from, effective_to, supersedes_routine_id, active, created_by_user_id, created_at, updated_at, version';

export function sqliteCareRoutineRepository(db: SqliteDatabase): CareRoutineRepositoryPort {
  const insert = db.prepare(`INSERT INTO care_routines (${ROUTINE_COLUMNS}) VALUES (${ROUTINE_COLUMNS.split(',').map(() => '?').join(', ')})`);
  const update = db.prepare(
    `UPDATE care_routines SET kind = ?, title = ?, instructions = ?, dose_amount = ?, dose_unit = ?, times_of_day = ?, days_of_week = ?, start_date = ?, end_date = ?, ongoing = ?,
       effective_from = ?, effective_to = ?, supersedes_routine_id = ?, active = ?, created_by_user_id = ?, updated_at = ?, version = ? WHERE id = ?`,
  );
  const byId = db.prepare<[string, string], Row>(`SELECT ${ROUTINE_COLUMNS} FROM care_routines WHERE id = ? AND pet_id = ?`);
  const ofPet = db.prepare<[string], Row>(`SELECT ${ROUTINE_COLUMNS} FROM care_routines WHERE pet_id = ? ORDER BY effective_from, id`);
  const count = db.prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM care_routines WHERE pet_id = ? AND active = 1');
  const purgeInactive = db.prepare(
    'DELETE FROM care_routines WHERE active = 0 AND updated_at < ? AND NOT EXISTS (SELECT 1 FROM care_routines s WHERE s.supersedes_routine_id = care_routines.id)',
  );
  return {
    async insert(r) {
      insert.run(
        r.id, r.seriesId, r.petId, r.kind, r.title, r.instructions ?? '', r.doseAmount, r.doseUnit, JSON.stringify(r.timesOfDay), JSON.stringify(r.daysOfWeek), r.startDate, r.endDate, r.ongoing ? 1 : 0,
        r.effectiveFrom, r.effectiveTo, r.supersedesRoutineId, r.active ? 1 : 0, r.createdByUserId, r.createdAt, r.updatedAt, r.version,
      );
    },
    async update(r) {
      const result = update.run(
        r.kind, r.title, r.instructions ?? '', r.doseAmount, r.doseUnit, JSON.stringify(r.timesOfDay), JSON.stringify(r.daysOfWeek), r.startDate, r.endDate, r.ongoing ? 1 : 0,
        r.effectiveFrom, r.effectiveTo, r.supersedesRoutineId, r.active ? 1 : 0, r.createdByUserId, r.updatedAt, r.version, r.id,
      );
      if (result.changes === 0) throw new Error(`care_routines: la rutina ${r.id} no existe`);
    },
    async findById(petId, id) {
      const row = byId.get(id, petId);
      return row === undefined ? null : toRoutine(row);
    },
    async listByPet(petId) {
      return ofPet.all(petId).map(toRoutine);
    },
    async countActive(petId) {
      return count.get(petId)!.n;
    },
    async purgeInactiveBefore(before) {
      return Number(purgeInactive.run(before).changes);
    },
  };
}

const ENTRY_SELECT = `SELECT e.id, r.pet_id, e.routine_id, e.series_id, e.occurrence_date, e.occurrence_time, e.status, e.note, e.late, e.performed_by_user_id, e.performed_at,
  r.dose_amount, r.dose_unit, e.reverted_at, e.reverted_by_user_id, e.revert_reason
  FROM care_log_entries e JOIN care_routines r ON r.id = e.routine_id`;

export function sqliteCareLogRepository(db: SqliteDatabase): CareLogRepositoryPort {
  const insert = db.prepare(
    `INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, late, performed_at, performed_by_user_id, note, reverted_at, reverted_by_user_id, revert_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const revert = db.prepare('UPDATE care_log_entries SET reverted_at = ?, reverted_by_user_id = ?, revert_reason = ? WHERE id = ?');
  const byId = db.prepare<[string, string], Row>(`${ENTRY_SELECT} WHERE e.id = ? AND r.pet_id = ?`);
  const ofPet = db.prepare<[string], Row>(`${ENTRY_SELECT} WHERE r.pet_id = ? ORDER BY e.occurrence_date, e.occurrence_time, e.performed_at, e.id`);
  const purge = db.prepare(
    `DELETE FROM care_log_entries WHERE occurrence_date < (CASE WHEN (SELECT kind FROM care_routines r WHERE r.id = care_log_entries.routine_id) = 'MEDICATION' THEN ? ELSE ? END)
       OR (reverted_at IS NOT NULL AND reverted_at < ?)`,
  );
  const active = db.prepare<[string, string, string], Row>(`${ENTRY_SELECT} WHERE e.series_id = ? AND e.occurrence_date = ? AND e.occurrence_time = ? AND e.reverted_at IS NULL`);
  return {
    async insert(e) {
      insert.run(e.id, e.routineId, e.seriesId, e.occurrenceDate, e.occurrenceTime, e.status, e.late ? 1 : 0, e.performedAt, e.performedByUserId, e.note ?? '', e.revertedAt, e.revertedByUserId, e.revertReason);
    },
    async update(e) {
      const result = revert.run(e.revertedAt, e.revertedByUserId, e.revertReason, e.id);
      if (result.changes === 0) throw new Error(`care_log_entries: el registro ${e.id} no existe`);
    },
    async findById(petId, id) {
      const row = byId.get(id, petId);
      return row === undefined ? null : toEntry(row);
    },
    async listByPet(petId) {
      return ofPet.all(petId).map(toEntry);
    },
    async findActiveByOccurrence(seriesId, date, time) {
      const row = active.get(seriesId, date, time);
      return row === undefined ? null : toEntry(row);
    },
    async purgeExpired(cutoffs) {
      return Number(purge.run(cutoffs.medicationBefore, cutoffs.otherBefore, cutoffs.revertedBefore).changes);
    },
  };
}

export function sqliteCaregiverAccessRepository(db: SqliteDatabase): CaregiverAccessRepositoryPort {
  const columns = 'pet_id, user_id, level, care_until, granted_by_user_id, granted_at, version';
  const upsert = db.prepare(
    `INSERT INTO pet_caregiver_access (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (pet_id, user_id) DO UPDATE SET level = excluded.level, care_until = excluded.care_until, granted_by_user_id = excluded.granted_by_user_id, granted_at = excluded.granted_at, version = excluded.version`,
  );
  const one = db.prepare<[string, string], Row>(`SELECT ${columns} FROM pet_caregiver_access WHERE pet_id = ? AND user_id = ?`);
  const ofPet = db.prepare<[string], Row>(`SELECT ${columns} FROM pet_caregiver_access WHERE pet_id = ? ORDER BY granted_at, user_id`);
  const del = db.prepare('DELETE FROM pet_caregiver_access WHERE pet_id = ? AND user_id = ?');
  return {
    async upsert(a) {
      upsert.run(a.petId, a.userId, a.level, a.careUntil, a.grantedByUserId, a.grantedAt, a.version);
    },
    async find(petId, userId) {
      const row = one.get(petId, userId);
      return row === undefined ? null : toAccess(row);
    },
    async listByPet(petId) {
      return ofPet.all(petId).map(toAccess);
    },
    async remove(petId, userId) {
      return del.run(petId, userId).changes > 0;
    },
  };
}
