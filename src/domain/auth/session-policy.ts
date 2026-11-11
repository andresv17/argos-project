/**
 * Vigencia de sesión de la Feature 002 (constantes de dominio; el reloj llega por parámetro, INV-ARCH-001).
 * - INV-AUTH2-002: válida si no fue revocada, `ahora < createdAt + 24 h` y `ahora < lastActivityAt + 30 min`.
 *   Cada petición autenticada válida renueva `lastActivityAt`; las rechazadas no.
 * - EXPIRED (tope absoluto, prioridad 1) y EXPIRED_IDLE (inactividad, prioridad 2) no se persisten: se derivan en cada
 *   petición. T208 PENDIENTE: REVOKED (revocada por un evento externo) y LOGGED_OUT no se distinguen en disco porque
 *   data-model 2.2 solo guarda `revoked_at`; ambos se derivan como LOGGED_OUT.
 * - REQ-AUTH-003: LOGOUT es idempotente y responde 204 en cualquier estado (D-04).
 * - STATE-AUTH-SESSION-001: tabla de transiciones leída del contrato generado.
 *
 * @implements INV-AUTH2-002, STATE-AUTH-SESSION-001, REQ-AUTH-003, REQ-AUTH-004, ERR-AUTH-UNAUTHENTICATED, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  STATE_AUTH_SESSION_001,
  type ErrorCode,
  type StateAuthSession001Event,
  type StateAuthSession001State,
} from '../../generated/index.ts';
import { MS_PER_MINUTE, addMillis, toEpochMillis } from './utc-timestamp.ts';

const SESSION_MACHINE = STATE_AUTH_SESSION_001;
export const SESSION_ABSOLUTE_TTL_HOURS: number = SESSION_MACHINE.constants.SESSION_ABSOLUTE_TTL_HOURS;
export const SESSION_IDLE_TIMEOUT_MINUTES: number = SESSION_MACHINE.constants.SESSION_IDLE_TIMEOUT_MINUTES;

const ABSOLUTE_TTL_MS = SESSION_ABSOLUTE_TTL_HOURS * 60 * MS_PER_MINUTE;
const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * MS_PER_MINUTE;

/** Sesión persistida (el token vive solo en la cookie y, como SHA-256, en el repositorio; nunca en el dominio de salida). */
export interface SessionRecord {
  readonly userId: string;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly revokedAt: string | null;
}

/** Resultado de una transición de STATE-AUTH-SESSION-001. */
export interface SessionTransition {
  readonly target: StateAuthSession001State;
  readonly error: ErrorCode | null;
  readonly response: number | null;
}

type RawTransition = string | { readonly target: string; readonly error?: string; readonly response?: number };

/**
 * Transición del contrato para (estado, evento). Lanza RangeError si el contrato no la define.
 * @implements STATE-AUTH-SESSION-001
 */
export function nextSessionState(state: StateAuthSession001State, event: StateAuthSession001Event): SessionTransition {
  const on = SESSION_MACHINE.states[state].on as Readonly<Partial<Record<string, RawTransition>>>;
  const raw = on[event];
  if (raw === undefined) {
    throw new RangeError(`STATE-AUTH-SESSION-001: el evento ${event} no está definido en el estado ${state}.`);
  }
  if (typeof raw === 'string') {
    return { target: raw as StateAuthSession001State, error: null, response: null };
  }
  return {
    target: raw.target as StateAuthSession001State,
    error: (raw.error ?? null) as ErrorCode | null,
    response: raw.response ?? null,
  };
}

/**
 * Sesión nueva: `createdAt = lastActivityAt = ahora` (REGISTER_SUCCESS / LOGIN_SUCCESS).
 * @implements INV-AUTH2-002, STATE-AUTH-SESSION-001
 */
export function openSession(userId: string, nowIsoTimestamp: string): SessionRecord {
  return { userId, createdAt: nowIsoTimestamp, lastActivityAt: nowIsoTimestamp, revokedAt: null };
}

/**
 * Vencimientos derivados (no persistidos): inactividad `lastActivityAt + 30 min` y tope `createdAt + 24 h`.
 * @implements INV-AUTH2-002
 */
export function sessionExpiries(session: SessionRecord): { readonly idleExpiresAt: string; readonly absoluteExpiresAt: string } {
  return { idleExpiresAt: addMillis(session.lastActivityAt, IDLE_TIMEOUT_MS), absoluteExpiresAt: addMillis(session.createdAt, ABSOLUTE_TTL_MS) };
}

/**
 * Estado de STATE-AUTH-SESSION-001 de una sesión en un instante: sin sesión, ANONYMOUS; revocada, LOGGED_OUT;
 * `ahora >= createdAt + 24 h`, EXPIRED (prioridad 1); `ahora >= lastActivityAt + 30 min`, EXPIRED_IDLE; si no, AUTHENTICATED.
 * @implements STATE-AUTH-SESSION-001, INV-AUTH2-002
 */
export function sessionStateAt(session: SessionRecord | null, nowIsoTimestamp: string): StateAuthSession001State {
  if (session === null) return 'ANONYMOUS';
  if (session.revokedAt !== null) return 'LOGGED_OUT';
  const now = toEpochMillis(nowIsoTimestamp);
  if (now >= toEpochMillis(session.createdAt) + ABSOLUTE_TTL_MS) return 'EXPIRED';
  if (now >= toEpochMillis(session.lastActivityAt) + IDLE_TIMEOUT_MS) return 'EXPIRED_IDLE';
  return 'AUTHENTICATED';
}

/**
 * REQ-AUTH-004: devuelve la sesión si está vigente; si no, ERR-AUTH-UNAUTHENTICATED (mismo error para ausente,
 * revocada y vencida por inactividad o por tope).
 * @implements REQ-AUTH-004, INV-AUTH2-002, ERR-AUTH-UNAUTHENTICATED
 */
export function assertAuthenticated(session: SessionRecord | null, nowIsoTimestamp: string): SessionRecord {
  if (sessionStateAt(session, nowIsoTimestamp) !== 'AUTHENTICATED') {
    throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
  }
  return session as SessionRecord;
}

/**
 * Evento REQUEST: una petición autenticada válida desplaza `lastActivityAt` a ahora (sin tocar `createdAt`). Una
 * sesión no vigente lanza ERR-AUTH-UNAUTHENTICATED y no cambia.
 * @implements INV-AUTH2-002, STATE-AUTH-SESSION-001, ERR-AUTH-UNAUTHENTICATED
 */
export function renewSession(session: SessionRecord | null, nowIsoTimestamp: string): SessionRecord {
  const valid = assertAuthenticated(session, nowIsoTimestamp);
  return { ...valid, lastActivityAt: nowIsoTimestamp };
}

/**
 * Revoca la sesión (cierre de sesión o cambio de contraseña): fija `revokedAt`; no renueva la actividad.
 * @implements REQ-AUTH-003, REQ-AUTH2-003, STATE-AUTH-SESSION-001
 */
export function revokeSession(session: SessionRecord, nowIsoTimestamp: string): SessionRecord {
  return { ...session, revokedAt: nowIsoTimestamp };
}

/**
 * REQ-AUTH-003: LOGOUT revoca una sesión AUTHENTICATED; en ANONYMOUS, EXPIRED, EXPIRED_IDLE, LOGGED_OUT o REVOKED no
 * cambia nada. Siempre responde 204 (D-04).
 * @implements REQ-AUTH-003, STATE-AUTH-SESSION-001
 */
export function logout(session: SessionRecord | null, nowIsoTimestamp: string): { session: SessionRecord | null; response: 204 } {
  const state = sessionStateAt(session, nowIsoTimestamp);
  nextSessionState(state, 'LOGOUT');
  if (state === 'AUTHENTICATED') {
    return { session: revokeSession(session as SessionRecord, nowIsoTimestamp), response: 204 };
  }
  return { session, response: 204 };
}
