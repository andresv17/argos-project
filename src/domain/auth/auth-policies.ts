/**
 * Políticas puras de cuentas y sesión.
 * - REQ-AUTH-001 / INV-AUTH-001 / INV-AUTH-002: registro con username en minúsculas, único, y política de contraseña.
 * - REQ-AUTH-002 / INV-AUTH-005: login con bloqueo por ventana deslizante (5 fallos en 15 minutos); los intentos
 *   bloqueados no se registran y un éxito borra los fallos. Aplica igual a usernames inexistentes.
 * - REQ-AUTH-003: LOGOUT idempotente con 204 en cualquier estado (D-04).
 * - REQ-AUTH-004 / INV-AUTH-004: sesión válida si no está revocada y now < expiresAt = createdAt + 7 días.
 * - STATE-AUTH-SESSION-001: tabla de transiciones leída del contrato generado.
 *
 * @implements REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH-001, INV-AUTH-002, INV-AUTH-004, INV-AUTH-005, STATE-AUTH-SESSION-001, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-WEAK-PASSWORD, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-UNAUTHENTICATED, ERR-AUTH-TOO-MANY-ATTEMPTS, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  STATE_AUTH_SESSION_001,
  resolveFieldErrorCode,
  validateRegisterUserInput,
  type ErrorCode,
  type RegisterUserInput,
  type StateAuthSession001Event,
  type StateAuthSession001State,
} from '../../generated/index.ts';
import { MS_PER_MINUTE, addMillis, toEpochMillis } from './utc-timestamp.ts';

const SESSION_MACHINE = STATE_AUTH_SESSION_001;
export const SESSION_ABSOLUTE_TTL_HOURS: number = SESSION_MACHINE.constants.SESSION_ABSOLUTE_TTL_HOURS;
export const SESSION_IDLE_TIMEOUT_MINUTES: number = SESSION_MACHINE.constants.SESSION_IDLE_TIMEOUT_MINUTES;
export const MAX_FAILED_ATTEMPTS: number = SESSION_MACHINE.constants.MAX_FAILED_ATTEMPTS;
export const LOCKOUT_WINDOW_MINUTES: number = SESSION_MACHINE.constants.LOCKOUT_WINDOW_MINUTES;

/** Sesión persistida (el token vive solo en la cookie y en el repositorio; nunca en el dominio de salida). */
export interface SessionRecord {
  readonly userId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
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

/** Normalización de username antes de validar: recortar espacios y pasar a minúsculas. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * INV-AUTH-002: 8..128 caracteres, al menos una letra y un dígito.
 * @implements INV-AUTH-002, ERR-AUTH-WEAK-PASSWORD
 */
export function isPasswordCompliant(password: string): boolean {
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

/**
 * REQ-AUTH-001: valida RegisterUserInput con el username ya normalizado. Según la regla 4, un fallo
 * sobre el valor de password da ERR-AUTH-WEAK-PASSWORD (x-sdd-error del contrato); un campo obligatorio ausente,
 * una propiedad no autorizada o cualquier otro fallo da ERR-SCHEMA-VALIDATION-FAILED.
 * @implements REQ-AUTH-001, INV-AUTH-002, ERR-AUTH-WEAK-PASSWORD
 */
export function parseRegisterUserInput(input: unknown): RegisterUserInput {
  const username = (input as { username?: unknown } | null)?.username;
  const candidate = typeof username === 'string' ? { ...(input as object), username: normalizeUsername(username) } : input;
  if (!validateRegisterUserInput(candidate)) {
    const error = validateRegisterUserInput.errors![0]!;
    const named = error.params['missingProperty'] ?? error.params['additionalProperty'];
    if (typeof named === 'string') {
      throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `RegisterUserInput: ${named} ${String(error.message)}.`, named);
    }
    const field = error.instancePath.split('/')[1] ?? null;
    const annotated = resolveFieldErrorCode('RegisterUserInput', error.instancePath);
    if (annotated !== undefined) {
      throw new DomainError(annotated, undefined, field);
    }
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `RegisterUserInput: ${field ?? '(raíz)'} ${String(error.message)}.`, field);
  }
  return candidate;
}

/**
 * INV-AUTH-001: lower(username) es único.
 * @implements INV-AUTH-001, ERR-AUTH-USERNAME-TAKEN
 */
export function assertUsernameAvailable(username: string, existingUsernames: Iterable<string>): void {
  const wanted = normalizeUsername(username);
  for (const existing of existingUsernames) {
    if (normalizeUsername(existing) === wanted) {
      throw new DomainError('ERR-AUTH-USERNAME-TAKEN', undefined, 'username');
    }
  }
}

/**
 * Nueva sesión con expiresAt = createdAt + SESSION_ABSOLUTE_TTL_HOURS (tope absoluto de 24 h).
 * T208 PENDIENTE: la ventana deslizante de inactividad (SESSION_IDLE_TIMEOUT_MINUTES) y lastActivityAt no se aplican todavía.
 * @implements REQ-AUTH-002, INV-AUTH-004
 */
export function openSession(userId: string, nowIsoTimestamp: string): SessionRecord {
  return {
    userId,
    createdAt: nowIsoTimestamp,
    expiresAt: addMillis(nowIsoTimestamp, SESSION_ABSOLUTE_TTL_HOURS * 60 * MS_PER_MINUTE),
    revokedAt: null,
  };
}

/**
 * Estado de STATE-AUTH-SESSION-001 de una sesión en un instante: sin sesión, ANONYMOUS; revocada, LOGGED_OUT;
 * now >= expiresAt, EXPIRED; si no, AUTHENTICATED.
 * @implements STATE-AUTH-SESSION-001, INV-AUTH-004
 */
export function sessionStateAt(session: SessionRecord | null, nowIsoTimestamp: string): StateAuthSession001State {
  if (session === null) return 'ANONYMOUS';
  if (session.revokedAt !== null) return 'LOGGED_OUT';
  return toEpochMillis(nowIsoTimestamp) >= toEpochMillis(session.expiresAt) ? 'EXPIRED' : 'AUTHENTICATED';
}

/**
 * REQ-AUTH-004: devuelve la sesión si está vigente; si no, ERR-AUTH-UNAUTHENTICATED.
 * @implements REQ-AUTH-004, INV-AUTH-004, ERR-AUTH-UNAUTHENTICATED
 */
export function assertAuthenticated(session: SessionRecord | null, nowIsoTimestamp: string): SessionRecord {
  if (sessionStateAt(session, nowIsoTimestamp) !== 'AUTHENTICATED') {
    throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
  }
  return session as SessionRecord;
}

/**
 * REQ-AUTH-003: LOGOUT revoca una sesión AUTHENTICATED; en ANONYMOUS, EXPIRED o LOGGED_OUT no cambia nada.
 * Siempre responde 204 (D-04).
 * @implements REQ-AUTH-003, STATE-AUTH-SESSION-001
 */
export function logout(session: SessionRecord | null, nowIsoTimestamp: string): { session: SessionRecord | null; response: 204 } {
  const state = sessionStateAt(session, nowIsoTimestamp);
  nextSessionState(state, 'LOGOUT');
  if (state === 'AUTHENTICATED') {
    return { session: { ...(session as SessionRecord), revokedAt: nowIsoTimestamp }, response: 204 };
  }
  return { session, response: 204 };
}

/**
 * Fallos registrados dentro de la ventana deslizante: los de instante t con now - t <= LOCKOUT_WINDOW_MINUTES.
 * @implements INV-AUTH-005
 */
export function failuresInWindow(failureTimestamps: readonly string[], nowIsoTimestamp: string): string[] {
  const now = toEpochMillis(nowIsoTimestamp);
  const windowStart = now - LOCKOUT_WINDOW_MINUTES * MS_PER_MINUTE;
  return failureTimestamps.filter((t) => {
    const at = toEpochMillis(t);
    return at >= windowStart && at <= now;
  });
}

/**
 * INV-AUTH-005: bloqueado si hay MAX_FAILED_ATTEMPTS o más fallos registrados en la ventana.
 * @implements INV-AUTH-005
 */
export function isLockedOut(failureTimestamps: readonly string[], nowIsoTimestamp: string): boolean {
  return failuresInWindow(failureTimestamps, nowIsoTimestamp).length >= MAX_FAILED_ATTEMPTS;
}

/**
 * Se llama antes de verificar la contraseña: si el username está bloqueado lanza ERR-AUTH-TOO-MANY-ATTEMPTS
 * (evento LOGIN_LOCKED) sin registrar el intento.
 * @implements INV-AUTH-005, ERR-AUTH-TOO-MANY-ATTEMPTS
 */
export function assertNotLockedOut(failureTimestamps: readonly string[], nowIsoTimestamp: string): void {
  if (isLockedOut(failureTimestamps, nowIsoTimestamp)) {
    throw new DomainError('ERR-AUTH-TOO-MANY-ATTEMPTS', undefined, 'username');
  }
}

export interface LoginOutcome {
  readonly event: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGIN_LOCKED';
  /** Fallos registrados que quedan para el username tras el intento. */
  readonly failures: string[];
  readonly error: 'ERR-AUTH-INVALID-CREDENTIALS' | 'ERR-AUTH-TOO-MANY-ATTEMPTS' | null;
}

/**
 * REQ-AUTH-002 / INV-AUTH-005 completo para un intento. `verifyCredentials` solo se invoca si no hay bloqueo,
 * y debe devolver false tanto para usuario inexistente como para contraseña errónea (respuesta genérica).
 * @implements REQ-AUTH-002, INV-AUTH-005, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-TOO-MANY-ATTEMPTS
 */
export function evaluateLoginAttempt(
  failureTimestamps: readonly string[],
  nowIsoTimestamp: string,
  verifyCredentials: () => boolean,
): LoginOutcome {
  if (isLockedOut(failureTimestamps, nowIsoTimestamp)) {
    return { event: 'LOGIN_LOCKED', failures: [...failureTimestamps], error: 'ERR-AUTH-TOO-MANY-ATTEMPTS' };
  }
  if (verifyCredentials()) {
    return { event: 'LOGIN_SUCCESS', failures: [], error: null };
  }
  return { event: 'LOGIN_FAILURE', failures: [...failureTimestamps, nowIsoTimestamp], error: 'ERR-AUTH-INVALID-CREDENTIALS' };
}

/**
 * Error genérico de login, idéntico para usuario inexistente y contraseña errónea (anti-enumeración).
 * @implements ERR-AUTH-INVALID-CREDENTIALS
 */
export function invalidCredentialsError(): DomainError {
  return new DomainError('ERR-AUTH-INVALID-CREDENTIALS');
}
