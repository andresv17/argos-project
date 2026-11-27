/**
 * Registro de cuidado (Feature 012, Bloque C): ventana, nota de omisión, idempotencia por autor, reversión y paginación. Funciones puras (`now` por parámetro).
 *
 * @implements REQ-CAR12-003, REQ-CAR12-004, SC-012-029, SC-012-031, SC-012-032, SC-012-033, SC-012-034, SC-012-038, ERR-CAR12-OUT-OF-WINDOW, ERR-CAR12-ALREADY-LOGGED
 */
import { DomainError } from '../../generated/v38/index.ts';
import { CARE_LOG_BACKFILL_HOURS, CARE_LOG_EARLY_TOLERANCE_MINUTES, CARE_LOG_PAGE_DEFAULT, CARE_LOG_PAGE_MAX, CARE_LOG_UNDO_MINUTES, OVERDUE_GRACE_MINUTES } from '../platform/feature-012-limits.ts';
import { bogotaInstantMs, MINUTE_MS } from './care-time.ts';

export type CareLogStatus = 'DONE' | 'SKIPPED';
export const CARE_NOTE_MAX_CHARS = 140;

const invalid = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', undefined, field);

/** Ventana de registro: hasta 24 h atrás; `DONE` hasta 15 min por delante; `SKIPPED` nunca anticipado. `late` desde hora + 60 min. */
export function assertLogWindow(input: { occurrenceDate: string; occurrenceTime: string; status: CareLogStatus; now: string }): { late: boolean } {
  const diff = Date.parse(input.now) - bogotaInstantMs(input.occurrenceDate, input.occurrenceTime);
  if (diff > CARE_LOG_BACKFILL_HOURS * 3_600_000) throw new DomainError('ERR-CAR12-OUT-OF-WINDOW');
  if (diff < 0) {
    if (input.status === 'SKIPPED' || -diff > CARE_LOG_EARLY_TOLERANCE_MINUTES * MINUTE_MS) throw new DomainError('ERR-CAR12-OUT-OF-WINDOW');
  }
  return { late: diff >= OVERDUE_GRACE_MINUTES * MINUTE_MS };
}

/** Nota de 140 como máximo; obligatoria (no en blanco) al omitir una MEDICATION. */
export function assertSkipNote(input: { kind: string; status: CareLogStatus; note: string | null | undefined }): void {
  const note = input.note ?? undefined;
  if (note !== undefined && [...note].length > CARE_NOTE_MAX_CHARS) throw invalid('note');
  if (input.kind === 'MEDICATION' && input.status === 'SKIPPED' && (note === undefined || note.trim() === '')) throw invalid('note');
}

export interface ExistingEntryRef {
  readonly id: string;
  readonly status: string;
  readonly performedByUserId: string | null;
}

export type ExistingEntryDecision<E extends ExistingEntryRef> = { action: 'INSERT' } | { action: 'RETURN_EXISTING'; entry: E };

/** Sin entrada vigente: insertar. Mismo autor y mismo status: 200 con la existente. Cualquier otro caso: `ERR-CAR12-ALREADY-LOGGED`. */
export function decideExistingEntry<E extends ExistingEntryRef>(input: { existing: E | null; actorUserId: string; status: CareLogStatus }): ExistingEntryDecision<E> {
  const { existing } = input;
  if (existing === null) return { action: 'INSERT' };
  if (existing.performedByUserId !== null && existing.performedByUserId === input.actorUserId && existing.status === input.status) return { action: 'RETURN_EXISTING', entry: existing };
  throw new DomainError('ERR-CAR12-ALREADY-LOGGED');
}

export interface RevertActor {
  readonly userId: string;
  readonly titular: boolean;
  readonly level: 'BASIC_LOG' | 'VIEW_ONLY' | null;
}

/** Deshacer: 10 min para el autor BASIC_LOG o un titular; después solo un titular con `reason`. Todo otro actor: 403. */
export function assertCanRevert(input: { actor: RevertActor; entry: { performedByUserId: string | null; performedAt: string }; now: string; reason?: string | null }): void {
  const { actor, entry } = input;
  const within = Date.parse(input.now) - Date.parse(entry.performedAt) <= CARE_LOG_UNDO_MINUTES * MINUTE_MS;
  if (actor.titular) {
    if (!within && (input.reason === undefined || input.reason === null || input.reason.trim() === '')) throw invalid('reason');
    return;
  }
  if (actor.level === 'BASIC_LOG' && entry.performedByUserId !== null && entry.performedByUserId === actor.userId && within) return;
  throw new DomainError('ERR-ACC-FORBIDDEN');
}

/** `limit`: 50 por defecto, entero 1..100; fuera de rango, 422. */
export function parseCareLogLimit(limit: number | undefined): number {
  if (limit === undefined) return CARE_LOG_PAGE_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > CARE_LOG_PAGE_MAX) throw invalid('limit');
  return limit;
}
