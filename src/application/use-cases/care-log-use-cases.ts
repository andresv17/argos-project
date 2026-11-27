/**
 * Casos de uso del registro de cuidado (Feature 012, Bloque C, #26; T1655): registrar (`{ entry, created }`: 201 vs 200), revertir e historial paginado.
 * Autor, hora y `late` los fija el servidor (se ignoran los valores del cliente); la unicidad es por SERIE lógica (A-05) y la dosis de la entrada es la de la versión que cubre la OCURRENCIA (A-04).
 * SIN limitador de escrituras: los cubos 120/60/30 son de T1656 (R-3).
 *
 * @implements REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-007, REQ-CAR12-009, SC-012-029, SC-012-030, SC-012-031, SC-012-032, SC-012-033, SC-012-034, SC-012-038, SC-012-076, ERR-CAR12-ALREADY-LOGGED, ERR-CAR12-OUT-OF-WINDOW
 */
import { DomainError } from '../../generated/v38/index.ts';
import { assertCanRevert, assertLogWindow, assertSkipNote, decideExistingEntry, parseCareLogLimit, type CareLogStatus } from '../../domain/care/care-log.ts';
import { bogotaInstantMs, isoWeekday } from '../../domain/care/care-time.ts';
import { isIsoCalendarDate } from '../../domain/shared/date-utils.ts';
import { isUniqueViolationOf } from './unique-violation.ts';
import { CARE_LOG_UNIQUE_SQLITE_MESSAGE, type CareLogRecord, type CareRoutineRecord } from '../ports/care.port.ts';
import { DELETED_USER_NAME, decodeCareLogCursor, encodeCareLogCursor, forbidden, invalidField, petNotFound, presentEntry, requireCareContext, usernamesById } from './care-support.ts';
import { lockPet, type ApplicationDeps } from './use-case-support.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// eslint-disable-next-line no-control-regex
const CONTROL_OR_BIDI = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/u;
/** Nombre de la restricción única parcial en cada motor (PostgreSQL: índice `care_log_entries_occurrence`). */
const OCCURRENCE_UNIQUE = { pgConstraint: 'care_log_entries_occurrence', sqliteMessage: CARE_LOG_UNIQUE_SQLITE_MESSAGE } as const;

/** Texto plano NFC, sin caracteres de control ni bidi; `undefined`/`null` = ausente. */
function plainText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalidField(field);
  const normalized = value.normalize('NFC');
  if (CONTROL_OR_BIDI.test(normalized) || [...normalized].length > max) throw invalidField(field);
  return normalized;
}

/** Versión de la serie que cubre el instante de la ocurrencia (A-04); la v1 rige desde `startDate` (R-2), las demás desde su `effectiveFrom`. */
function coveringVersion(series: readonly CareRoutineRecord[], ms: number): CareRoutineRecord | null {
  return (
    series.find((r) => {
      const from = r.supersedesRoutineId === null ? Number.NEGATIVE_INFINITY : Date.parse(r.effectiveFrom);
      const to = r.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(r.effectiveTo);
      return ms >= from && ms < to;
    }) ?? null
  );
}

function occursOn(r: CareRoutineRecord, date: string, time: string): boolean {
  if (!r.timesOfDay.includes(time) || !r.daysOfWeek.includes(isoWeekday(date)) || r.startDate > date) return false;
  return r.ongoing || r.endDate === null || r.endDate >= date;
}

/** Registra una toma, comida o paseo (DONE o SKIPPED). @implements REQ-CAR12-003, REQ-CAR12-004, SC-012-029, SC-012-031, SC-012-032, SC-012-034 */
export class CreateCareLogEntryUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, input: Record<string, unknown>): Promise<{ entry: Record<string, unknown>; created: boolean }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      if (!ctx.access.canLogCare) throw forbidden();
      const { routineId, occurrenceDate, occurrenceTime, status } = input;
      if (typeof routineId !== 'string' || !UUID.test(routineId)) throw invalidField('routineId');
      if (typeof occurrenceDate !== 'string' || !isIsoCalendarDate(occurrenceDate)) throw invalidField('occurrenceDate');
      if (typeof occurrenceTime !== 'string' || !TIME.test(occurrenceTime)) throw invalidField('occurrenceTime');
      if (status !== 'DONE' && status !== 'SKIPPED') throw invalidField('status');
      const note = plainText(input['note'], 'note', 140);
      // T-C4: un routineId ajeno da el MISMO 422 que uno inexistente.
      const given = await repositories.careRoutines.findById(petId, routineId);
      if (given === null) throw invalidField('routineId');
      const series = (await repositories.careRoutines.listByPet(petId)).filter((r) => r.seriesId === given.seriesId);
      const covering = coveringVersion(series, bogotaInstantMs(occurrenceDate, occurrenceTime));
      if (covering === null || !occursOn(covering, occurrenceDate, occurrenceTime)) throw invalidField('occurrenceTime');
      const { late } = assertLogWindow({ occurrenceDate, occurrenceTime, status: status as CareLogStatus, now });
      assertSkipNote({ kind: covering.kind, status: status as CareLogStatus, note });
      const existing = await repositories.careLog.findActiveByOccurrence(covering.seriesId, occurrenceDate, occurrenceTime);
      const viewer = { userId: actorUserId, titular: ctx.titular };
      let decision;
      try {
        decision = decideExistingEntry({ existing, actorUserId, status: status as CareLogStatus });
      } catch (error) {
        if (existing !== null && error instanceof DomainError && error.code === 'ERR-CAR12-ALREADY-LOGGED') {
          const names = await usernamesById(repositories, [existing.performedByUserId]);
          // REQ-CAR12-009: lo único que el 409 revela a un cuidador es el autor, la hora y el estado de la ocurrencia en conflicto.
          throw Object.assign(error, { existing: { performedByDisplayName: existing.performedByUserId === null ? DELETED_USER_NAME : (names.get(existing.performedByUserId) ?? DELETED_USER_NAME), performedAt: existing.performedAt, status: existing.status } });
        }
        throw error;
      }
      if (decision.action === 'RETURN_EXISTING') {
        const names = await usernamesById(repositories, [decision.entry.performedByUserId]);
        return { entry: presentEntry(decision.entry as CareLogRecord, viewer, names, false), created: false };
      }
      const row: CareLogRecord = {
        id: this.deps.ids.nextId(),
        petId,
        routineId: covering.id,
        seriesId: covering.seriesId,
        occurrenceDate,
        occurrenceTime,
        status: status as CareLogStatus,
        note,
        late,
        performedByUserId: actorUserId,
        performedAt: now,
        doseAmountAtTime: covering.doseAmount,
        doseUnitAtTime: covering.doseUnit,
        revertedAt: null,
        revertedByUserId: null,
        revertReason: null,
      };
      try {
        await repositories.careLog.insert(row);
      } catch (error) {
        if (isUniqueViolationOf(error, OCCURRENCE_UNIQUE)) throw new DomainError('ERR-CAR12-ALREADY-LOGGED');
        throw error;
      }
      const names = await usernamesById(repositories, [actorUserId]);
      return { entry: presentEntry(row, viewer, names, false), created: true };
    });
  }
}

/** Revierte un registro: el autor BASIC_LOG o un titular dentro de 10 min; después solo un titular con motivo. Revertir lo ya revertido es 200 idempotente. @implements REQ-CAR12-003, SC-012-033 */
export class RevertCareLogEntryUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, entryId: string, input: Record<string, unknown> = {}): Promise<{ entry: Record<string, unknown> }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      if (!ctx.titular && !ctx.access.canLogCare) throw forbidden();
      const entry = UUID.test(entryId) ? await repositories.careLog.findById(petId, entryId) : null;
      if (entry === null) throw petNotFound();
      const reason = plainText(input['reason'], 'reason', 140);
      if (reason !== null && reason.trim() === '') throw invalidField('reason');
      const viewer = { userId: actorUserId, titular: ctx.titular };
      const respond = async (row: CareLogRecord) => ({ entry: presentEntry(row, viewer, await usernamesById(repositories, [row.performedByUserId, row.revertedByUserId]), true) });
      if (entry.revertedAt !== null) {
        if (!ctx.titular && entry.performedByUserId !== actorUserId) throw forbidden();
        return respond(entry);
      }
      assertCanRevert({ actor: { userId: actorUserId, titular: ctx.titular, level: ctx.access.level }, entry, now, reason });
      const next: CareLogRecord = { ...entry, revertedAt: now, revertedByUserId: actorUserId, revertReason: reason };
      await repositories.careLog.update(next);
      return respond(next);
    });
  }
}

export interface CareLogQuery {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly routineId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly includeReverted?: boolean | undefined;
}

/** Historial paginado, más recientes primero (INV-SORT-001), con cursor estable atado a mascota, filtros y rol. @implements REQ-CAR12-003, REQ-CAR12-007, REQ-CAR12-009, SC-012-038 */
export class ListCareLogUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, query: CareLogQuery = {}): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const ctx = await requireCareContext(repositories, actorUserId, petId, this.deps.clock.nowIsoTimestamp());
      if (!ctx.access.canViewRoutines) throw forbidden();
      const limit = parseCareLogLimit(query.limit);
      const { routineId, from, to } = query;
      if (routineId !== undefined && (typeof routineId !== 'string' || !UUID.test(routineId))) throw invalidField('routineId');
      for (const [field, value] of [['from', from], ['to', to]] as const) if (value !== undefined && (typeof value !== 'string' || !isIsoCalendarDate(value))) throw invalidField(field);
      if (query.includeReverted !== undefined && typeof query.includeReverted !== 'boolean') throw invalidField('includeReverted');
      const includeReverted = query.includeReverted === true && ctx.titular; // para los demás roles se ignora en silencio
      const fingerprint = JSON.stringify([routineId ?? null, from ?? null, to ?? null, includeReverted, ctx.titular]);
      const position = query.cursor === undefined ? null : decodeCareLogCursor(query.cursor, petId, fingerprint);
      // T-C7: una rutina ajena o inexistente da 200 con items vacíos, indistinguible de una propia sin registros.
      const scoped = routineId === undefined ? null : await repositories.careRoutines.findById(petId, routineId);
      if (routineId !== undefined && scoped === null) return { items: [], nextCursor: null };
      const key = (e: CareLogRecord): string => `${e.occurrenceDate}|${e.occurrenceTime}|${e.performedAt}|${e.id}`;
      const all = (await repositories.careLog.listByPet(petId))
        .filter((e) => (includeReverted || e.revertedAt === null) && (scoped === null || e.seriesId === scoped.seriesId) && (from === undefined || e.occurrenceDate >= from) && (to === undefined || e.occurrenceDate <= to))
        .sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
      const after = position === null ? all : all.filter((e) => key(e) < `${position.date}|${position.time}|${position.performedAt}|${position.id}`);
      const page = after.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor = after.length > limit && last !== undefined ? encodeCareLogCursor(petId, fingerprint, { date: last.occurrenceDate, time: last.occurrenceTime, performedAt: last.performedAt, id: last.id }) : null;
      const names = await usernamesById(repositories, page.flatMap((e) => [e.performedByUserId, e.revertedByUserId]));
      const viewer = { userId: actorUserId, titular: ctx.titular };
      return { items: page.map((e) => presentEntry(e, viewer, names, includeReverted)), nextCursor };
    });
  }
}
