import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  STATE_AUTH_SESSION_001_EVENTS,
  STATE_AUTH_SESSION_001_STATES,
  type StateAuthSession001Event,
  type StateAuthSession001State,
} from '../../src/generated/index.ts';
import {
  LOCKOUT_WINDOW_MINUTES,
  MAX_FAILED_ATTEMPTS,
  assertNotLockedOut,
  assertUsernameAvailable,
  evaluateLoginAttempt,
  failuresInWindow,
  invalidCredentialsError,
  isLockedOut,
  parseRegisterUserInput,
} from '../../src/domain/auth/auth-policies.ts';
import { PASSWORD_SYMBOLS, assertPasswordCompliant, isPasswordCompliant } from '../../src/domain/auth/password-policy.ts';
import {
  SESSION_ABSOLUTE_TTL_HOURS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  assertAuthenticated,
  logout,
  nextSessionState,
  openSession,
  renewSession,
  revokeSession,
  sessionExpiries,
  sessionStateAt,
  type SessionRecord,
} from '../../src/domain/auth/session-policy.ts';
import { addMillis, fromEpochMillis, toEpochMillis } from '../../src/domain/auth/utc-timestamp.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';

const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));
const edge = (prefix: string) => fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId.startsWith(prefix));
const passwords: Record<string, string> = fixtures.credentialsForTestsOnly;
const usernames: string[] = fixtures.users.map((u: { username: string }) => u.username);
const ANDRES_ID: string = fixtures.users[0].id;
const clock = new FixedClockAdapter();
const NOW = clock.nowIsoTimestamp();

function catchDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

type Expected = [StateAuthSession001State, string | null, number | null];
/** Oráculo escrito a mano a partir del contrato 3.0.0 (STATE-AUTH-SESSION-001 v3) y D-04, independiente del contrato generado. */
const SESSION_TABLE: Partial<Record<StateAuthSession001State, Partial<Record<StateAuthSession001Event, Expected>>>> = {
  ANONYMOUS: {
    REGISTER_SUCCESS: ['AUTHENTICATED', null, null],
    LOGIN_SUCCESS: ['AUTHENTICATED', null, null],
    LOGIN_FAILURE: ['ANONYMOUS', 'ERR-AUTH-INVALID-CREDENTIALS', null],
    LOGIN_LOCKED: ['ANONYMOUS', 'ERR-AUTH-TOO-MANY-ATTEMPTS', null],
    ACCESS_PROTECTED: ['ANONYMOUS', 'ERR-AUTH-UNAUTHENTICATED', null],
    LOGOUT: ['ANONYMOUS', null, 204],
  },
  AUTHENTICATED: {
    REQUEST: ['AUTHENTICATED', null, null],
    ABSOLUTE_TTL_ELAPSED: ['EXPIRED', null, null],
    IDLE_TIMEOUT: ['EXPIRED_IDLE', null, null],
    LOGOUT: ['LOGGED_OUT', null, null],
    PASSWORD_CHANGED: ['AUTHENTICATED', null, null],
    REVOKED_BY_PASSWORD_CHANGE: ['REVOKED', null, null],
    ACCOUNT_DELETED: ['REVOKED', null, null],
    PASSWORD_VERIFY_FAILURE: ['AUTHENTICATED', 'ERR-AUTH-INVALID-CREDENTIALS', null],
    PASSWORD_VERIFY_LOCKED: ['AUTHENTICATED', 'ERR-AUTH-TOO-MANY-ATTEMPTS', null],
  },
  EXPIRED_IDLE: { LOGOUT: ['EXPIRED_IDLE', null, 204] },
  EXPIRED: { LOGOUT: ['EXPIRED', null, 204] },
  LOGGED_OUT: { LOGOUT: ['LOGGED_OUT', null, 204] },
  REVOKED: { LOGOUT: ['REVOKED', null, 204] },
};

describe('máquina STATE-AUTH-SESSION-001 (src/domain/auth/auth-policies.ts)', () => {
  it('[STATE-AUTH-SESSION-001] las 19 transiciones válidas de la v3 coinciden con la spec y las 65 restantes se rechazan', () => {
    let valid = 0;
    let invalid = 0;
    for (const state of STATE_AUTH_SESSION_001_STATES) {
      for (const event of STATE_AUTH_SESSION_001_EVENTS) {
        const expected = SESSION_TABLE[state]?.[event];
        if (expected === undefined) {
          expect(() => nextSessionState(state, event)).toThrow(
            new RangeError(`STATE-AUTH-SESSION-001: el evento ${event} no está definido en el estado ${state}.`),
          );
          invalid += 1;
        } else {
          const t = nextSessionState(state, event);
          expect([t.target, t.error, t.response]).toEqual(expected);
          valid += 1;
        }
      }
    }
    expect([valid, invalid]).toEqual([19, 65]);
  });

  it('[STATE-AUTH-SESSION-001][INV-AUTH2-002] las constantes salen del contrato: tope absoluto de 24 h, inactividad de 30 min, 5 fallos y ventana de 15 minutos', () => {
    expect([SESSION_ABSOLUTE_TTL_HOURS, SESSION_IDLE_TIMEOUT_MINUTES, MAX_FAILED_ATTEMPTS, LOCKOUT_WINDOW_MINUTES]).toEqual([24, 30, 5, 15]);
  });
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = '2026-11-05T12:00:00.000Z';
const at = (offsetMs: number) => fromEpochMillis(toEpochMillis(T0) + offsetMs);
const VALID_PASSWORD = 'Clave2026x!';
const registration = (overrides: Record<string, unknown> = {}) => ({
  username: 'nuevo',
  displayName: 'Nuevo',
  password: VALID_PASSWORD,
  confirmPassword: VALID_PASSWORD,
  ...overrides,
});

describe('registro (REQ-AUTH2-001)', () => {
  it('[REQ-AUTH2-001][INV-AUTH-001] un username con mayúsculas o con espacios se rechaza con ERR-SCHEMA-VALIDATION-FAILED y no se normaliza en silencio', () => {
    for (const username of ['Nuevo_1', ' lucia.r ', 'MARIA.V', 'ab', 'a b', 'x'.repeat(31)]) {
      const error = catchDomainError(() => parseRegisterUserInput(registration({ username })));
      expect([error.code, error.status, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 422, 'username']);
    }
    expect(parseRegisterUserInput(registration({ username: 'nuevo_1.a-b' })).username).toBe('nuevo_1.a-b');
  });

  it('[REQ-AUTH2-001] confirmPassword distinto de password da ERR-SCHEMA-VALIDATION-FAILED en el campo confirmPassword', () => {
    const error = catchDomainError(() => parseRegisterUserInput(registration({ confirmPassword: 'Otra2026x!' })));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'confirmPassword']);
    expect(catchDomainError(() => parseRegisterUserInput(registration({ confirmPassword: undefined }))).field).toBe('confirmPassword');
  });

  it('[REQ-AUTH2-001] el correo es opcional: se acepta ausente, nulo o con formato válido y se rechaza con formato inválido', () => {
    expect(parseRegisterUserInput(registration()).email).toBeUndefined();
    expect(parseRegisterUserInput(registration({ email: null })).email).toBeNull();
    expect(parseRegisterUserInput(registration({ email: 'nueva@example.com' })).email).toBe('nueva@example.com');
    const error = catchDomainError(() => parseRegisterUserInput(registration({ email: 'no-es-un-correo' })));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'email']);
  });

  it('[INV-AUTH2-001][ERR-AUTH-WEAK-PASSWORD] rechaza contraseñas de menos de 10, sin mayúscula, sin número, sin símbolo o de más de 128 (EDGE-011)', () => {
    for (const password of [edge('EDGE-011').payload.password, 'Abcdefg1!', 'abcdefgh1!', 'Abcdefghi!', 'Abcdefghi1', `A1!${'x'.repeat(126)}`, '12345678']) {
      const error = catchDomainError(() => parseRegisterUserInput(registration({ password, confirmPassword: password })));
      expect([error.code, error.status, error.field, error.invariantRef]).toEqual(['ERR-AUTH-WEAK-PASSWORD', 422, 'password', 'INV-AUTH2-001']);
      expect(error.detail).toBe('La contraseña debe tener entre 10 y 128 caracteres e incluir al menos una mayúscula, un número y un símbolo.');
    }
    const typed = catchDomainError(() => parseRegisterUserInput(registration({ password: 12345678, confirmPassword: 12345678 })));
    expect([typed.code, typed.field]).toEqual(['ERR-AUTH-WEAK-PASSWORD', 'password']);
    expect(parseRegisterUserInput(registration({ password: 'Abcdefgh1!', confirmPassword: 'Abcdefgh1!' })).password).toBe('Abcdefgh1!');
    const longest = `A1!${'x'.repeat(125)}`;
    expect(parseRegisterUserInput(registration({ password: longest, confirmPassword: longest })).password.length).toBe(128);
  });

  it('[INV-AUTH2-001] isPasswordCompliant cuenta puntos de código Unicode, exige mayúscula Lu, dígito ASCII y uno de los 32 símbolos, y no recorta', () => {
    const emoji = '😀';
    const cases: Array<[string, boolean]> = [
      ['Abcdefgh1!', true],
      ['Abcdefg1!', false],
      [`A1!${emoji.repeat(7)}`, true],
      [`A1!${emoji.repeat(6)}`, false],
      [`A1!${emoji.repeat(125)}`, true],
      [`A1!${emoji.repeat(126)}`, false],
      ['Abcdefg1! ', true],
      [' Abcdefg1!', true],
      ['Abcdefgh1 ', false],
      ['abcdefgh1!', false],
      ['Ñandu12345!', true],
      ['ñandu12345!', false],
      ['ǅabcdefg1!', false],
      ['Abcdefgh٣!', false],
      ['Abcdefghi!', false],
      ['Abcdefghi1', false],
      ['ÁÉÍÓÚ12345!', true],
    ];
    expect(cases.map(([p]) => isPasswordCompliant(p))).toEqual(cases.map(([, ok]) => ok));
    expect(() => assertPasswordCompliant('Abcdefg1!')).toThrow(DomainError);
    expect(assertPasswordCompliant(VALID_PASSWORD)).toBeUndefined();
  });

  it('[INV-AUTH2-001] cada uno de los 32 símbolos ASCII cumple el requisito de símbolo y el espacio no', () => {
    expect([...PASSWORD_SYMBOLS]).toHaveLength(32);
    for (const symbol of PASSWORD_SYMBOLS) expect(isPasswordCompliant(`Abcdefgh1${symbol}`), symbol).toBe(true);
    expect(isPasswordCompliant('Abcdefgh1 ')).toBe(false);
  });

  it('[REQ-AUTH2-001] los demás fallos, y una contraseña ausente, dan ERR-SCHEMA-VALIDATION-FAILED con el campo', () => {
    const cases: Array<[unknown, string | null]> = [
      [registration({ displayName: ' X' }), 'displayName'],
      [registration({ displayName: undefined }), 'displayName'],
      [registration({ role: 'ADMIN' }), 'role'],
      [registration({ password: undefined, confirmPassword: undefined }), 'password'],
      [registration({ username: 7 }), 'username'],
      [null, null],
    ];
    for (const [input, field] of cases) {
      const error = catchDomainError(() => parseRegisterUserInput(input));
      expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', field]);
      expect(error.detail.startsWith(`RegisterUserInput: ${field ?? '(raíz)'} `)).toBe(true);
    }
  });

  it('[INV-AUTH-001][ERR-AUTH-USERNAME-TAKEN] "ANDRES" choca con "andres" sin importar mayúsculas (EDGE-010)', () => {
    const error = catchDomainError(() => assertUsernameAvailable(edge('EDGE-010').payload.username, usernames));
    expect([error.code, error.status, error.field, error.invariantRef]).toEqual(['ERR-AUTH-USERNAME-TAKEN', 409, 'username', 'INV-AUTH-001']);
    expect(catchDomainError(() => assertUsernameAvailable('lucia.r', ['LUCIA.R'])).code).toBe('ERR-AUTH-USERNAME-TAKEN');
    expect(catchDomainError(() => assertUsernameAvailable(' Maria.V ', usernames)).code).toBe('ERR-AUTH-USERNAME-TAKEN');
    expect(() => assertUsernameAvailable('nuevo', usernames)).not.toThrow(DomainError);
  });
});

describe('sesión (REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002)', () => {
  it('[REQ-AUTH2-002][INV-AUTH2-002] una sesión nueva nace con lastActivityAt = createdAt y sus vencimientos son 30 min y 24 h', () => {
    const session = openSession(ANDRES_ID, NOW);
    expect(session).toEqual({ userId: ANDRES_ID, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
    expect(sessionExpiries(session)).toEqual({ idleExpiresAt: '2026-11-05T12:30:00.000Z', absoluteExpiresAt: '2026-11-06T12:00:00.000Z' });
    expect(sessionExpiries(openSession(ANDRES_ID, '2024-02-28T23:59:59.999Z')).absoluteExpiresAt).toBe('2024-02-29T23:59:59.999Z');
  });

  it('[INV-AUTH2-002][STATE-AUTH-SESSION-001] a los 30 min exactos de inactividad la sesión pasa a EXPIRED_IDLE, un milisegundo antes sigue AUTHENTICATED (SC-009)', () => {
    const session = openSession(ANDRES_ID, T0);
    expect(sessionStateAt(session, at(30 * MINUTE - 1))).toBe('AUTHENTICATED');
    expect(assertAuthenticated(session, at(30 * MINUTE - 1))).toBe(session);
    expect(sessionStateAt(session, at(30 * MINUTE))).toBe('EXPIRED_IDLE');
    expect(sessionStateAt(session, at(30 * MINUTE + 1000))).toBe('EXPIRED_IDLE');
    const error = catchDomainError(() => assertAuthenticated(session, at(30 * MINUTE)));
    expect([error.code, error.status, error.invariantRef]).toEqual(['ERR-AUTH-UNAUTHENTICATED', 401, 'INV-AUTH2-002']);
  });

  it('[INV-AUTH2-002] recargar a los 10 minutos no cierra la sesión y la actividad desplaza la ventana de 30 min', () => {
    const session = openSession(ANDRES_ID, T0);
    expect(sessionStateAt(session, at(10 * MINUTE))).toBe('AUTHENTICATED');
    const renewed = renewSession(session, at(10 * MINUTE));
    expect(renewed).toEqual({ ...session, lastActivityAt: at(10 * MINUTE) });
    expect(sessionStateAt(renewed, at(40 * MINUTE - 1))).toBe('AUTHENTICATED');
    expect(sessionStateAt(renewed, at(40 * MINUTE))).toBe('EXPIRED_IDLE');
  });

  it('[INV-AUTH2-002][ERR-AUTH-UNAUTHENTICATED] el tope absoluto de 24 h vence aunque haya actividad reciente y prevalece sobre la inactividad (EDGE-014)', () => {
    let session = openSession(ANDRES_ID, T0);
    for (let minute = 20; minute < 24 * 60; minute += 20) session = renewSession(session, at(minute * MINUTE));
    expect(sessionStateAt(session, at(24 * HOUR - 1))).toBe('AUTHENTICATED');
    expect(sessionStateAt(session, at(24 * HOUR))).toBe('EXPIRED');
    expect(sessionStateAt(openSession(ANDRES_ID, T0), at(24 * HOUR))).toBe('EXPIRED');
    expect(catchDomainError(() => assertAuthenticated(session, at(24 * HOUR))).code).toBe('ERR-AUTH-UNAUTHENTICATED');
  });

  it('[INV-AUTH2-002] solo una sesión AUTHENTICATED se renueva: vencida, revocada o ausente lanza ERR-AUTH-UNAUTHENTICATED y no cambia', () => {
    const session = openSession(ANDRES_ID, T0);
    const revoked: SessionRecord = { ...session, revokedAt: at(MINUTE) };
    for (const [candidate, now] of [[session, at(30 * MINUTE)], [session, at(24 * HOUR)], [revoked, at(2 * MINUTE)], [null, at(MINUTE)]] as const) {
      expect(catchDomainError(() => renewSession(candidate, now)).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    }
    expect(session.lastActivityAt).toBe(T0);
  });

  it('[REQ-AUTH-004][ERR-AUTH-UNAUTHENTICATED] sin sesión o con sesión revocada responde ERR-AUTH-UNAUTHENTICATED', () => {
    const revoked: SessionRecord = { ...openSession(ANDRES_ID, NOW), revokedAt: NOW };
    expect([sessionStateAt(null, NOW), sessionStateAt(revoked, NOW)]).toEqual(['ANONYMOUS', 'LOGGED_OUT']);
    expect(catchDomainError(() => assertAuthenticated(null, NOW)).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(catchDomainError(() => assertAuthenticated(revoked, NOW)).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    // T208 PENDIENTE: REVOKED (revocada por evento externo) y LOGGED_OUT no se distinguen en disco: data-model 2.2 solo guarda revoked_at.
  });

  it('[REQ-AUTH2-003][STATE-AUTH-SESSION-001] revokeSession fija revokedAt y deja la sesión sin renovar', () => {
    const session = openSession(ANDRES_ID, T0);
    expect(revokeSession(session, at(MINUTE))).toEqual({ ...session, revokedAt: at(MINUTE) });
  });

  it('[REQ-AUTH-003][STATE-AUTH-SESSION-001] LOGOUT revoca una sesión vigente y es 204 sin cambios en ANONYMOUS, EXPIRED, EXPIRED_IDLE y LOGGED_OUT (D-04)', () => {
    const active = openSession(ANDRES_ID, NOW);
    const later = '2026-11-05T12:10:00.000Z';
    expect(logout(active, later)).toEqual({ session: { ...active, revokedAt: later }, response: 204 });
    const expired = openSession(ANDRES_ID, '2026-10-01T00:00:00.000Z');
    const idle = openSession(ANDRES_ID, '2026-11-05T11:00:00.000Z');
    const loggedOut: SessionRecord = { ...active, revokedAt: NOW };
    for (const session of [null, expired, idle, loggedOut]) {
      const result = logout(session, later);
      expect(result.response).toBe(204);
      expect(result.session).toBe(session);
    }
  });
});

describe('login y bloqueo (REQ-AUTH2-002, INV-AUTH-005)', () => {
  type Step = { at: string; username: string; password: string; expectedError?: string; expectedResult?: string };

  function runTimeline(steps: Step[], verifyCalls: { count: number }): Array<string | null> {
    const failures = new Map<string, string[]>();
    return steps.map((step) => {
      const outcome = evaluateLoginAttempt(failures.get(step.username) ?? [], step.at, () => {
        verifyCalls.count += 1;
        return passwords[step.username] === step.password;
      });
      failures.set(step.username, outcome.failures);
      return outcome.error;
    });
  }

  it('[INV-AUTH-005][ERR-AUTH-INVALID-CREDENTIALS] un éxito borra los fallos: 4 fallos, éxito y 4 fallos sin bloqueo (EDGE-028)', () => {
    const steps: Step[] = edge('EDGE-028').timeline;
    const calls = { count: 0 };
    expect(runTimeline(steps, calls)).toEqual(steps.map((s) => s.expectedError ?? null));
    expect(calls.count).toBe(9);
  });

  it('[INV-AUTH-005][ERR-AUTH-TOO-MANY-ATTEMPTS] los intentos bloqueados no se registran ni verifican la contraseña (EDGE-029)', () => {
    const steps: Step[] = edge('EDGE-029').timeline;
    const calls = { count: 0 };
    expect(runTimeline(steps, calls)).toEqual(steps.map((s) => s.expectedError ?? null));
    expect(calls.count).toBe(6);
  });

  it('[INV-AUTH-005][ERR-AUTH-TOO-MANY-ATTEMPTS] el sexto intento en 15 minutos se bloquea aunque la contraseña sea correcta (EDGE-013)', () => {
    const failures = ['00', '01', '02', '03', '04'].map((s) => `2026-11-05T11:50:${s}.000Z`);
    const outcome = evaluateLoginAttempt(failures, NOW, () => true);
    expect(outcome).toEqual({ event: 'LOGIN_LOCKED', failures, error: 'ERR-AUTH-TOO-MANY-ATTEMPTS' });
    const error = catchDomainError(() => assertNotLockedOut(failures, NOW));
    expect([error.code, error.status, error.invariantRef, error.field]).toEqual(['ERR-AUTH-TOO-MANY-ATTEMPTS', 429, 'INV-AUTH-005', 'username']);
  });

  it('[INV-AUTH-005] la ventana incluye el fallo de hace 15 minutos exactos y excluye el de 15 minutos y 1 ms', () => {
    const edgeFailure = '2026-11-05T11:45:00.000Z';
    const outside = '2026-11-05T11:44:59.999Z';
    const recent = ['11:50:00', '11:51:00', '11:52:00', '11:53:00'].map((t) => `2026-11-05T${t}.000Z`);
    expect(failuresInWindow([outside, edgeFailure, ...recent, NOW, '2026-11-05T12:00:00.001Z'], NOW)).toEqual([edgeFailure, ...recent, NOW]);
    expect(isLockedOut([edgeFailure, ...recent], NOW)).toBe(true);
    expect(isLockedOut([outside, ...recent], NOW)).toBe(false);
    expect(() => assertNotLockedOut([outside, ...recent], NOW)).not.toThrow(DomainError);
  });

  it('[REQ-AUTH2-002][ERR-AUTH-INVALID-CREDENTIALS] usuario inexistente y contraseña errónea dan la misma respuesta (EDGE-012, EDGE-032)', () => {
    const spec = edge('EDGE-032');
    const results = spec.cases.map((c: { username: string; password: string }) => {
      let calls = 0;
      const outcome = evaluateLoginAttempt([], NOW, () => {
        calls += 1;
        return passwords[c.username] === c.password;
      });
      return [outcome.event, outcome.error, outcome.failures, calls];
    });
    expect(results).toEqual([
      ['LOGIN_FAILURE', spec.expectedError, [NOW], 1],
      ['LOGIN_FAILURE', spec.expectedError, [NOW], 1],
    ]);
    const error = invalidCredentialsError();
    // El catálogo 3.0.0 amplía el texto (también cubre la contraseña actual incorrecta); el inicio con el prefijo de la 001 se conserva.
    expect([error.code, error.status, error.detail.startsWith(spec.expectedDetail)]).toEqual([spec.expectedError, spec.expectedStatus, true]);
  });

  it('[REQ-AUTH-002] un login correcto sin bloqueo devuelve LOGIN_SUCCESS y vacía los fallos', () => {
    expect(evaluateLoginAttempt(['2026-11-05T11:59:00.000Z'], NOW, () => true)).toEqual({ event: 'LOGIN_SUCCESS', failures: [], error: null });
  });
});

describe('timestamps UTC (src/domain/auth/utc-timestamp.ts)', () => {
  it('[INV-AUTH2-002] convierte timestamps canónicos a milisegundos y de vuelta, incluso antes de 1970 y en bisiestos', () => {
    expect(toEpochMillis('1970-01-01T00:00:00.000Z')).toBe(0);
    expect(toEpochMillis('2026-11-05T12:00:00.000Z')).toBe(1_793_880_000_000);
    expect(toEpochMillis('1969-12-31T23:59:59.999Z')).toBe(-1);
    expect(fromEpochMillis(-1)).toBe('1969-12-31T23:59:59.999Z');
    expect(fromEpochMillis(951_782_400_000)).toBe('2000-02-29T00:00:00.000Z');
    expect(addMillis('2026-12-31T23:59:59.999Z', 1)).toBe('2027-01-01T00:00:00.000Z');
    expect(addMillis('2026-03-01T00:00:00.000Z', -1)).toBe('2026-02-28T23:59:59.999Z');
    const error = catchDomainError(() => toEpochMillis('2026-11-05T12:00:00Z', 'expiresAt'));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'expiresAt']);
    expect(catchDomainError(() => toEpochMillis('2026-11-05')).field).toBe('timestamp');
  });
});
