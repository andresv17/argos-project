/**
 * Políticas puras de cuentas y bloqueo de inicio de sesión.
 * - REQ-AUTH2-001 / INV-AUTH-001 / INV-AUTH2-001: registro con username exacto (3..30, minúsculas; con mayúsculas se
 *   rechaza y no se normaliza, H-F5-08), `confirmPassword` igual a `password`, correo opcional y política de contraseña.
 * - REQ-AUTH2-002 / INV-AUTH-005: login con bloqueo por ventana deslizante (5 fallos en 15 minutos); los intentos
 *   bloqueados no se registran y un éxito borra los fallos. Aplica igual a usernames inexistentes.
 * - La vigencia de sesión vive en `session-policy.ts` y la política de contraseña en `password-policy.ts`; se
 *   reexportan aquí para los llamadores existentes.
 *
 * @implements REQ-AUTH2-001, REQ-AUTH2-002, INV-AUTH-001, INV-AUTH2-001, INV-AUTH-005, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-WEAK-PASSWORD, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-TOO-MANY-ATTEMPTS, INV-ARCH-001, INV-ARCH-004
 */

import { DomainError, STATE_AUTH_SESSION_001, resolveFieldErrorCode, validateRegisterUserInput, type RegisterUserInput } from '../../generated/index.ts';
import { MS_PER_MINUTE, toEpochMillis } from './utc-timestamp.ts';

export { isPasswordCompliant } from './password-policy.ts';
export {
  SESSION_ABSOLUTE_TTL_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  assertAuthenticated,
  logout,
  nextSessionState,
  openSession,
  sessionStateAt,
  type SessionRecord,
  type SessionTransition,
} from './session-policy.ts';

export const MAX_FAILED_ATTEMPTS: number = STATE_AUTH_SESSION_001.constants.MAX_FAILED_ATTEMPTS;
export const LOCKOUT_WINDOW_MINUTES: number = STATE_AUTH_SESSION_001.constants.LOCKOUT_WINDOW_MINUTES;

/** Normalización de username antes de validar: recortar espacios y pasar a minúsculas. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * REQ-AUTH2-001: valida RegisterUserInput tal como llega: el username no se recorta ni se pasa a minúsculas (con
 * mayúsculas o espacios, el esquema lo rechaza). Según la regla 4, un fallo sobre el valor de password da
 * ERR-AUTH-WEAK-PASSWORD (x-sdd-error del contrato); un campo obligatorio ausente, una propiedad no autorizada o
 * cualquier otro fallo da ERR-SCHEMA-VALIDATION-FAILED. Después del esquema, `confirmPassword` debe ser idéntico a
 * `password` (ERR-SCHEMA-VALIDATION-FAILED, campo confirmPassword).
 * @implements REQ-AUTH2-001, INV-AUTH2-001, ERR-AUTH-WEAK-PASSWORD
 */
export function parseRegisterUserInput(input: unknown): RegisterUserInput {
  if (!validateRegisterUserInput(input)) {
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
  if (input.confirmPassword !== input.password) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'RegisterUserInput: confirmPassword debe ser idéntico a password.', 'confirmPassword');
  }
  return input;
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
 * REQ-AUTH2-002 / INV-AUTH-005 completo para un intento. `verifyCredentials` solo se invoca si no hay bloqueo,
 * y debe devolver false tanto para usuario inexistente como para contraseña errónea (respuesta genérica).
 * @implements REQ-AUTH2-002, INV-AUTH-005, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-TOO-MANY-ATTEMPTS
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
