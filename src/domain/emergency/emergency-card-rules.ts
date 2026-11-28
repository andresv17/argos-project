/**
 * Reglas puras de la ficha QR (Feature 012, Bloque D, #32): compatibilidad del aviso (MAJOR.MINOR), espera de 90 días, selección de teléfonos, guarda de activación, avisos derivados
 * de la auditoría (`lastChange`, `criticalAllergiesChange`) y granularidad de `last_scanned_at`. Sin reloj, I/O ni entorno: `now` llega por parámetro.
 *
 * @implements REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-002, INV-QR12-003, INV-QR12-004, INV-QR12-006, SC-012-083, SC-012-084, SC-012-085, SC-012-122, SC-012-124
 */
import { fromEpochMillis, toEpochMillis } from '../auth/utc-timestamp.ts';
import {
  EMERGENCY_HISTORY_RETENTION_DAYS,
  EMERGENCY_NOTICE_WAIT_DAYS,
  MAX_EMERGENCY_PHONES,
  QR_LAST_SCANNED_GRANULARITY_MINUTES,
} from '../platform/feature-012-limits.ts';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const majorMinor = (version: string): string => version.split('.').slice(0, 2).join('.');

/** Dos versiones del aviso son compatibles si coinciden MAJOR y MINOR (PATCH es editorial, `NOTICE_COMPATIBILITY`). */
export function isNoticeCompatible(stored: string, current: string): boolean {
  return majorMinor(stored) === majorMinor(current);
}

/** La espera de un consentimiento en espera vence pasados `EMERGENCY_NOTICE_WAIT_DAYS` desde la entrada en vigor del aviso (a los 90 días exactos aún se conserva). */
export function isNoticeWaitExpired(effectiveAtIso: string, nowIso: string): boolean {
  return toEpochMillis(nowIso) - toEpochMillis(effectiveAtIso) > EMERGENCY_NOTICE_WAIT_DAYS * DAY_MS;
}

export interface ContactCandidate {
  readonly userId: string;
  readonly phone: string;
  readonly joinedAt: string;
  readonly isPrincipal: boolean;
}

/** Hasta 2 teléfonos de propietarios distintos: principal primero, luego `joined_at` y `user_id` ascendentes; los valores repetidos cuentan una sola vez. No muta la entrada. */
export function selectContactPhones(candidates: readonly ContactCandidate[]): string[] {
  const ordered = [...candidates].sort((a, b) => Number(b.isPrincipal) - Number(a.isPrincipal) || (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const phones: string[] = [];
  for (const candidate of ordered) {
    if (phones.includes(candidate.phone)) continue;
    phones.push(candidate.phone);
    if (phones.length === MAX_EMERGENCY_PHONES) break;
  }
  return phones;
}

/** D12-14: al menos un teléfono visible o al menos una alergia crítica. */
export function evaluateGuard(input: { readonly visiblePhones: number; readonly allergies: number }): boolean {
  return input.visiblePhones > 0 || input.allergies > 0;
}

export interface AuditEventRef {
  readonly type: string;
  readonly actorUserId: string | null;
  readonly occurredAt: string;
}

export type LastChangeKind = 'ACTIVATED' | 'REGENERATED' | 'DEACTIVATED' | 'AUTO_DEACTIVATED';
/** Lista blanca de 4 tipos de tarjeta: el consentimiento y las alergias NO producen `lastChange` (rama N-04). */
const LAST_CHANGE_KINDS: Readonly<Record<string, LastChangeKind>> = {
  EMERGENCY_CARD_ACTIVATED: 'ACTIVATED',
  EMERGENCY_CARD_REGENERATED: 'REGENERATED',
  EMERGENCY_CARD_DEACTIVATED: 'DEACTIVATED',
  EMERGENCY_CARD_AUTO_DEACTIVATED: 'AUTO_DEACTIVATED',
};

const withinHistory = (occurredAt: string, nowIso: string): boolean => toEpochMillis(nowIso) - toEpochMillis(occurredAt) < EMERGENCY_HISTORY_RETENTION_DAYS * DAY_MS;
const latest = (events: readonly AuditEventRef[]): AuditEventRef | null => events.reduce<AuditEventRef | null>((best, e) => (best === null || e.occurredAt >= best.occurredAt ? e : best), null);
const byMe = (actor: string | null, viewer: string): boolean => actor !== null && actor === viewer;

/** Último cambio de la tarjeta dentro de 90 días: solo `{kind, at, byMe}`, sin la identidad de otro propietario. */
export function deriveLastChange(events: readonly AuditEventRef[], viewerUserId: string, nowIso: string): { kind: LastChangeKind; at: string; byMe: boolean } | null {
  const last = latest(events.filter((e) => LAST_CHANGE_KINDS[e.type] !== undefined && withinHistory(e.occurredAt, nowIso)));
  return last === null ? null : { kind: LAST_CHANGE_KINDS[last.type]!, at: last.occurredAt, byMe: byMe(last.actorUserId, viewerUserId) };
}

/** Última edición efectiva de las alergias críticas dentro de 90 días: `{at, byMe}`, sin contenido, conteo, identidad ni rol. */
export function deriveCriticalAllergiesChange(events: readonly AuditEventRef[], viewerUserId: string, nowIso: string): { at: string; byMe: boolean } | null {
  const last = latest(events.filter((e) => e.type === 'PET_CRITICAL_ALLERGIES_UPDATED' && withinHistory(e.occurredAt, nowIso)));
  return last === null ? null : { at: last.occurredAt, byMe: byMe(last.actorUserId, viewerUserId) };
}

/** Inicio del intervalo de `QR_LAST_SCANNED_GRANULARITY_MINUTES` (UTC) que contiene `nowIso`. */
export function truncateLastScanned(nowIso: string): string {
  const step = QR_LAST_SCANNED_GRANULARITY_MINUTES * MINUTE_MS;
  return fromEpochMillis(Math.floor(toEpochMillis(nowIso) / step) * step);
}

/** Una escritura por intervalo y ficha: solo si el intervalo actual es posterior al guardado. */
export function shouldRefreshLastScanned(previousIso: string | null, nowIso: string): boolean {
  return previousIso === null || truncateLastScanned(nowIso) > previousIso;
}
