/**
 * Repositorios PostgreSQL del Modo Cuidador de la 012 (#26; T1655): `care_routines`, `care_log_entries` y `pet_caregiver_access` (migración 0035). SQL siempre parametrizado con `$n`.
 * `care_log_entries` no tiene `pet_id` ni dosis propias: se derivan de `care_routines` por `routine_id`. `dose_amount` es NUMERIC(9,3): el driver lo entrega como texto y aquí se convierte a número.
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
import type { PoolClientLike } from './postgres-database.ts';

type Row = Record<string, unknown>;

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const nonEmpty = (v: unknown): string | null => {
  const t = text(v);
  return t === null || t === '' ? null : t;
};
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const parsed = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));

const toRoutine = (r: Row): CareRoutineRecord => ({
  id: String(r['id']),
  seriesId: String(r['series_id']),
  petId: String(r['pet_id']),
  kind: r['kind'] as CareRoutineRecord['kind'],
  title: String(r['title']),
  instructions: nonEmpty(r['instructions']),
  doseAmount: num(r['dose_amount']),
  doseUnit: r['dose_unit'] as CareRoutineRecord['doseUnit'],
  timesOfDay: parsed<string[]>(r['times_of_day']),
  daysOfWeek: parsed<number[]>(r['days_of_week']),
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
  doseAmountAtTime: num(r['dose_amount']),
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

export function postgresCareRoutineRepository(client: PoolClientLike): CareRoutineRepositoryPort {
  const placeholders = ROUTINE_COLUMNS.split(',').map((_, i) => `$${i + 1}`).join(', ');
  return {
    async insert(r) {
      await client.query(`INSERT INTO care_routines (${ROUTINE_COLUMNS}) VALUES (${placeholders})`, [
        r.id, r.seriesId, r.petId, r.kind, r.title, r.instructions ?? '', r.doseAmount, r.doseUnit, JSON.stringify(r.timesOfDay), JSON.stringify(r.daysOfWeek), r.startDate, r.endDate, r.ongoing ? 1 : 0,
        r.effectiveFrom, r.effectiveTo, r.supersedesRoutineId, r.active ? 1 : 0, r.createdByUserId, r.createdAt, r.updatedAt, r.version,
      ]);
    },
    async update(r) {
      const result = await client.query(
        `UPDATE care_routines SET kind = $1, title = $2, instructions = $3, dose_amount = $4, dose_unit = $5, times_of_day = $6, days_of_week = $7, start_date = $8, end_date = $9, ongoing = $10,
           effective_from = $11, effective_to = $12, supersedes_routine_id = $13, active = $14, created_by_user_id = $15, updated_at = $16, version = $17 WHERE id = $18`,
        [r.kind, r.title, r.instructions ?? '', r.doseAmount, r.doseUnit, JSON.stringify(r.timesOfDay), JSON.stringify(r.daysOfWeek), r.startDate, r.endDate, r.ongoing ? 1 : 0, r.effectiveFrom, r.effectiveTo, r.supersedesRoutineId, r.active ? 1 : 0, r.createdByUserId, r.updatedAt, r.version, r.id],
      );
      if ((result.rowCount ?? 0) === 0) throw new Error(`care_routines: la rutina ${r.id} no existe`);
    },
    async findById(petId, id) {
      const { rows } = await client.query(`SELECT ${ROUTINE_COLUMNS} FROM care_routines WHERE id = $1 AND pet_id = $2`, [id, petId]);
      return rows[0] === undefined ? null : toRoutine(rows[0]);
    },
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${ROUTINE_COLUMNS} FROM care_routines WHERE pet_id = $1 ORDER BY effective_from, id`, [petId]);
      return rows.map(toRoutine);
    },
    async countActive(petId) {
      const { rows } = await client.query('SELECT COUNT(*) AS n FROM care_routines WHERE pet_id = $1 AND active = 1', [petId]);
      return Number(rows[0]!['n']);
    },
    async purgeInactiveBefore(before) {
      const result = await client.query(
        'DELETE FROM care_routines WHERE active = 0 AND updated_at < $1 AND NOT EXISTS (SELECT 1 FROM care_routines s WHERE s.supersedes_routine_id = care_routines.id) AND NOT EXISTS (SELECT 1 FROM care_log_entries e WHERE e.routine_id = care_routines.id)',
        [before],
      );
      return result.rowCount ?? 0;
    },
  };
}

const ENTRY_SELECT = `SELECT e.id, r.pet_id, e.routine_id, e.series_id, e.occurrence_date, e.occurrence_time, e.status, e.note, e.late, e.performed_by_user_id, e.performed_at,
  r.dose_amount, r.dose_unit, e.reverted_at, e.reverted_by_user_id, e.revert_reason
  FROM care_log_entries e JOIN care_routines r ON r.id = e.routine_id`;

export function postgresCareLogRepository(client: PoolClientLike): CareLogRepositoryPort {
  return {
    async insert(e) {
      await client.query(
        `INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, late, performed_at, performed_by_user_id, note, reverted_at, reverted_by_user_id, revert_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [e.id, e.routineId, e.seriesId, e.occurrenceDate, e.occurrenceTime, e.status, e.late ? 1 : 0, e.performedAt, e.performedByUserId, e.note ?? '', e.revertedAt, e.revertedByUserId, e.revertReason],
      );
    },
    async update(e) {
      const result = await client.query('UPDATE care_log_entries SET reverted_at = $1, reverted_by_user_id = $2, revert_reason = $3 WHERE id = $4', [e.revertedAt, e.revertedByUserId, e.revertReason, e.id]);
      if ((result.rowCount ?? 0) === 0) throw new Error(`care_log_entries: el registro ${e.id} no existe`);
    },
    async findById(petId, id) {
      const { rows } = await client.query(`${ENTRY_SELECT} WHERE e.id = $1 AND r.pet_id = $2`, [id, petId]);
      return rows[0] === undefined ? null : toEntry(rows[0]);
    },
    async listByPet(petId) {
      const { rows } = await client.query(`${ENTRY_SELECT} WHERE r.pet_id = $1 ORDER BY e.occurrence_date, e.occurrence_time, e.performed_at, e.id`, [petId]);
      return rows.map(toEntry);
    },
    async findActiveByOccurrence(seriesId, date, time) {
      const { rows } = await client.query(`${ENTRY_SELECT} WHERE e.series_id = $1 AND e.occurrence_date = $2 AND e.occurrence_time = $3 AND e.reverted_at IS NULL`, [seriesId, date, time]);
      return rows[0] === undefined ? null : toEntry(rows[0]);
    },
    async purgeExpired(cutoffs) {
      const result = await client.query(
        `DELETE FROM care_log_entries WHERE occurrence_date < (CASE WHEN (SELECT kind FROM care_routines r WHERE r.id = care_log_entries.routine_id) = 'MEDICATION' THEN $1 ELSE $2 END)
           OR (reverted_at IS NOT NULL AND reverted_at < $3)`,
        [cutoffs.medicationBefore, cutoffs.otherBefore, cutoffs.revertedBefore],
      );
      return result.rowCount ?? 0;
    },
  };
}

export function postgresCaregiverAccessRepository(client: PoolClientLike): CaregiverAccessRepositoryPort {
  const columns = 'pet_id, user_id, level, care_until, granted_by_user_id, granted_at, version';
  return {
    async upsert(a) {
      await client.query(
        `INSERT INTO pet_caregiver_access (${columns}) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (pet_id, user_id) DO UPDATE SET level = EXCLUDED.level, care_until = EXCLUDED.care_until, granted_by_user_id = EXCLUDED.granted_by_user_id, granted_at = EXCLUDED.granted_at, version = EXCLUDED.version`,
        [a.petId, a.userId, a.level, a.careUntil, a.grantedByUserId, a.grantedAt, a.version],
      );
    },
    async find(petId, userId) {
      const { rows } = await client.query(`SELECT ${columns} FROM pet_caregiver_access WHERE pet_id = $1 AND user_id = $2`, [petId, userId]);
      return rows[0] === undefined ? null : toAccess(rows[0]);
    },
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${columns} FROM pet_caregiver_access WHERE pet_id = $1 ORDER BY granted_at, user_id`, [petId]);
      return rows.map(toAccess);
    },
    async remove(petId, userId) {
      const result = await client.query('DELETE FROM pet_caregiver_access WHERE pet_id = $1 AND user_id = $2', [petId, userId]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}
