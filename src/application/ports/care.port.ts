/**
 * Puertos de repositorio del Modo Cuidador (Feature 012, Bloque C, #26; T1655 tramo 2): `care_routines`, `care_log_entries` y `pet_caregiver_access`. Filas en camelCase, idénticas en memoria, SQLite y PostgreSQL.
 * Las pruebas fijan los nombres de método (insert, update, findById, listByPet, countActive, findActiveByOccurrence, upsert, find, remove). La FK a users es SET NULL (autor, revertidor, concedente) y la de mascota CASCADE.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-009, INV-ARCH-005
 */
import type { DoseUnit, RoutineKind } from '../../domain/care/care-routine.ts';

export interface CareRoutineRecord {
  readonly id: string;
  /** Rutina lógica común a todas las versiones (A-05); la primera versión usa su propio id. */
  readonly seriesId: string;
  readonly petId: string;
  readonly kind: RoutineKind;
  readonly title: string;
  readonly instructions: string | null;
  readonly doseAmount: number | null;
  readonly doseUnit: DoseUnit | null;
  readonly timesOfDay: readonly string[];
  readonly daysOfWeek: readonly number[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly ongoing: boolean;
  readonly active: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly supersedesRoutineId: string | null;
  readonly version: number;
  readonly createdByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CareRoutineRepositoryPort {
  insert(row: CareRoutineRecord): Promise<void>;
  /** Reemplaza la fila por `id` (la FK, la mascota y la serie no cambian). */
  update(row: CareRoutineRecord): Promise<void>;
  /** Solo si la rutina pertenece a la mascota; si no, null (404 uniforme). */
  findById(petId: string, id: string): Promise<CareRoutineRecord | null>;
  /** Todas las versiones de la mascota (activas e inactivas), por `effectiveFrom` e `id`. */
  listByPet(petId: string): Promise<CareRoutineRecord[]>;
  /** Filas con `active = true` (las versiones sustituidas no cuentan). */
  countActive(petId: string): Promise<number>;
  /**
   * Retención (T1661): borra las rutinas inactivas (`active = false`) cuyo `updatedAt` (la desactivación) es ANTERIOR a `before`, y que ninguna otra fila referencia por `supersedesRoutineId` (FK sin cascada: la cadena de versiones se
   * poda de la más nueva a la más vieja en pasadas sucesivas). D-D(b): una rutina con registros vivos en `care_log_entries` se conserva (se purga cuando el último registro vence). Devuelve cuántas rutinas borró.
   */
  purgeInactiveBefore(before: string): Promise<number>;
}

export type CareLogStatusValue = 'DONE' | 'SKIPPED';

export interface CareLogRecord {
  readonly id: string;
  readonly petId: string;
  readonly routineId: string;
  readonly seriesId: string;
  readonly occurrenceDate: string;
  readonly occurrenceTime: string;
  readonly status: CareLogStatusValue;
  readonly note: string | null;
  readonly late: boolean;
  /** `null` tras la supresión de la cuenta del autor (FK SET NULL, SC-012-076). */
  readonly performedByUserId: string | null;
  readonly performedAt: string;
  /** Dosis de la versión de rutina que cubría la ocurrencia (A-04): se deriva de `routineId`, no se persiste aparte. */
  readonly doseAmountAtTime: number | null;
  readonly doseUnitAtTime: DoseUnit | null;
  readonly revertedAt: string | null;
  readonly revertedByUserId: string | null;
  readonly revertReason: string | null;
}

export interface CareLogRepositoryPort {
  /** Una segunda fila vigente para (serie, fecha, hora) viola el UNIQUE parcial y lanza la violación del motor. */
  insert(row: CareLogRecord): Promise<void>;
  /** Solo actualiza los campos de reversión (la entrada es inmutable salvo revertirse). */
  update(row: CareLogRecord): Promise<void>;
  findById(petId: string, id: string): Promise<CareLogRecord | null>;
  /** Todas las filas de la mascota (revertidas incluidas), por ocurrencia e id. */
  listByPet(petId: string): Promise<CareLogRecord[]>;
  /** Fila NO revertida de la ocurrencia de la serie lógica. */
  findActiveByOccurrence(seriesId: string, occurrenceDate: string, occurrenceTime: string): Promise<CareLogRecord | null>;
  /**
   * Retención (T1661): borra los registros cuya `occurrenceDate` es ANTERIOR a `medicationBefore` (rutina `MEDICATION`) o a `otherBefore` (`MEAL`/`WALK`/`OTHER`), o cuyo `revertedAt` es ANTERIOR a `revertedBefore`.
   * Las fechas son `YYYY-MM-DD`; `revertedBefore` es un instante ISO UTC. Devuelve cuántos registros borró.
   */
  purgeExpired(cutoffs: { readonly medicationBefore: string; readonly otherBefore: string; readonly revertedBefore: string }): Promise<number>;
}

export type CareLevelValue = 'BASIC_LOG' | 'VIEW_ONLY';

export interface CaregiverAccessRecord {
  readonly petId: string;
  readonly userId: string;
  readonly level: CareLevelValue;
  readonly careUntil: string | null;
  readonly grantedByUserId: string | null;
  readonly grantedAt: string;
  readonly version: number;
}

export interface CaregiverAccessRepositoryPort {
  /** Una fila por (mascota, usuario): reemplaza la existente. */
  upsert(row: CaregiverAccessRecord): Promise<void>;
  find(petId: string, userId: string): Promise<CaregiverAccessRecord | null>;
  listByPet(petId: string): Promise<CaregiverAccessRecord[]>;
  /** `true` si había fila; idempotente. */
  remove(petId: string, userId: string): Promise<boolean>;
}

/** Mensaje de SQLite de la violación del índice parcial `care_log_entries_occurrence` (la memoria lo imita; PostgreSQL la reconoce por el nombre del índice). */
export const CARE_LOG_UNIQUE_SQLITE_MESSAGE = 'UNIQUE constraint failed: care_log_entries.series_id, care_log_entries.occurrence_date, care_log_entries.occurrence_time';
