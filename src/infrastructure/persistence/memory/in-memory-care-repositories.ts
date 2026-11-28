/**
 * Repositorios en memoria del Modo Cuidador de la 012 (#26; T1655): `care_routines`, `care_log_entries` y `pet_caregiver_access`. Mismas reglas observables que SQLite y PostgreSQL:
 * UNIQUE parcial por (serie, fecha, hora) de los registros no revertidos, FK de registro a rutina y dosis derivada de la versión de rutina del registro.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, INV-ARCH-005
 */
import {
  CARE_LOG_UNIQUE_SQLITE_MESSAGE,
  type CareLogRecord,
  type CareLogRepositoryPort,
  type CareRoutineRecord,
  type CareRoutineRepositoryPort,
  type CaregiverAccessRecord,
  type CaregiverAccessRepositoryPort,
} from '../../../application/ports/care.port.ts';

/** Parte del estado de memoria del Bloque C (opcional: ausente = vacía). */
export interface CareMemoryState {
  careRoutines?: CareRoutineRecord[] | undefined;
  careLog?: CareLogRecord[] | undefined;
  caregiverAccess?: CaregiverAccessRecord[] | undefined;
}

const copy = <T>(value: T): T => structuredClone(value);
/** Las columnas `instructions` y `note` son NOT NULL DEFAULT '' en SQL: el texto vacío y la ausencia son lo mismo (se leen como null). */
const blankToNull = (value: string | null): string | null => (value === '' ? null : value);
const normalizeRoutine = (row: CareRoutineRecord): CareRoutineRecord => ({ ...copy(row), instructions: blankToNull(row.instructions) });
const normalizeEntry = (row: CareLogRecord): CareLogRecord => ({ ...copy(row), note: blankToNull(row.note) });

export function memoryCareRoutineRepository(state: CareMemoryState): CareRoutineRepositoryPort {
  const rows = (): CareRoutineRecord[] => (state.careRoutines ??= []);
  return {
    async insert(row) {
      if (rows().some((r) => r.id === row.id)) throw Object.assign(new Error('UNIQUE constraint failed: care_routines.id'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
      rows().push(normalizeRoutine(row));
    },
    async update(row) {
      const index = rows().findIndex((r) => r.id === row.id);
      if (index < 0) throw new Error(`care_routines: la rutina ${row.id} no existe`);
      rows()[index] = normalizeRoutine(row);
    },
    async findById(petId, id) {
      const found = rows().find((r) => r.id === id && r.petId === petId);
      return found === undefined ? null : copy(found);
    },
    async listByPet(petId) {
      return copy(rows().filter((r) => r.petId === petId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id)));
    },
    async countActive(petId) {
      return rows().filter((r) => r.petId === petId && r.active).length;
    },
    async purgeInactiveBefore(before) {
      const referenced = new Set(rows().map((r) => r.supersedesRoutineId).filter((id) => id !== null));
      // D-D(b): una rutina inactiva con registros vivos en `care_log_entries` se conserva (el registro más largo, p. ej. MEDICATION 1095 d, no pierde su rutina).
      const withLog = new Set((state.careLog ?? []).map((e) => e.routineId));
      const doomed = new Set(rows().filter((r) => !r.active && r.updatedAt < before && !referenced.has(r.id) && !withLog.has(r.id)).map((r) => r.id));
      state.careRoutines = rows().filter((r) => !doomed.has(r.id));
      return doomed.size;
    },
  };
}

export function memoryCareLogRepository(state: CareMemoryState): CareLogRepositoryPort {
  const rows = (): CareLogRecord[] => (state.careLog ??= []);
  const withDose = (row: CareLogRecord): CareLogRecord => {
    const routine = (state.careRoutines ?? []).find((r) => r.id === row.routineId);
    return { ...row, petId: routine?.petId ?? row.petId, doseAmountAtTime: routine?.doseAmount ?? null, doseUnitAtTime: routine?.doseUnit ?? null };
  };
  const byOccurrence = (a: CareLogRecord, b: CareLogRecord): number =>
    a.occurrenceDate.localeCompare(b.occurrenceDate) || a.occurrenceTime.localeCompare(b.occurrenceTime) || a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id);
  return {
    async insert(row) {
      if (!(state.careRoutines ?? []).some((r) => r.id === row.routineId)) throw new Error('FOREIGN KEY constraint failed: care_log_entries.routine_id');
      if (rows().some((r) => r.id === row.id)) throw Object.assign(new Error('UNIQUE constraint failed: care_log_entries.id'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
      if (row.revertedAt === null && rows().some((r) => r.revertedAt === null && r.seriesId === row.seriesId && r.occurrenceDate === row.occurrenceDate && r.occurrenceTime === row.occurrenceTime)) {
        throw Object.assign(new Error(CARE_LOG_UNIQUE_SQLITE_MESSAGE), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
      }
      rows().push(normalizeEntry(row));
    },
    async update(row) {
      const index = rows().findIndex((r) => r.id === row.id);
      if (index < 0) throw new Error(`care_log_entries: el registro ${row.id} no existe`);
      const current = rows()[index]!;
      // Solo cambian los campos de reversión: el resto del registro es inmutable.
      rows()[index] = { ...current, revertedAt: row.revertedAt, revertedByUserId: row.revertedByUserId, revertReason: row.revertReason };
    },
    async findById(petId, id) {
      const found = rows().map(withDose).find((r) => r.id === id && r.petId === petId);
      return found === undefined ? null : copy(found);
    },
    async listByPet(petId) {
      return copy(rows().map(withDose).filter((r) => r.petId === petId).sort(byOccurrence));
    },
    async findActiveByOccurrence(seriesId, occurrenceDate, occurrenceTime) {
      const found = rows().find((r) => r.revertedAt === null && r.seriesId === seriesId && r.occurrenceDate === occurrenceDate && r.occurrenceTime === occurrenceTime);
      return found === undefined ? null : copy(withDose(found));
    },
    async purgeExpired(cutoffs) {
      const kindOf = (routineId: string) => (state.careRoutines ?? []).find((r) => r.id === routineId)?.kind;
      const before = rows().length;
      state.careLog = rows().filter((e) => {
        const limit = kindOf(e.routineId) === 'MEDICATION' ? cutoffs.medicationBefore : cutoffs.otherBefore;
        return !(e.occurrenceDate < limit || (e.revertedAt !== null && e.revertedAt < cutoffs.revertedBefore));
      });
      return before - state.careLog.length;
    },
  };
}

export function memoryCaregiverAccessRepository(state: CareMemoryState): CaregiverAccessRepositoryPort {
  const rows = (): CaregiverAccessRecord[] => (state.caregiverAccess ??= []);
  return {
    async upsert(row) {
      state.caregiverAccess = [...rows().filter((r) => !(r.petId === row.petId && r.userId === row.userId)), copy(row)];
    },
    async find(petId, userId) {
      const found = rows().find((r) => r.petId === petId && r.userId === userId);
      return found === undefined ? null : copy(found);
    },
    async listByPet(petId) {
      return copy(rows().filter((r) => r.petId === petId).sort((a, b) => a.grantedAt.localeCompare(b.grantedAt) || a.userId.localeCompare(b.userId)));
    },
    async remove(petId, userId) {
      const before = rows().length;
      state.caregiverAccess = rows().filter((r) => !(r.petId === petId && r.userId === userId));
      return state.caregiverAccess.length < before;
    },
  };
}
