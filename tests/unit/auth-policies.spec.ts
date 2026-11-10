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
  SESSION_TTL_DAYS,
  assertAuthenticated,
  assertNotLockedOut,
  assertUsernameAvailable,
  evaluateLoginAttempt,
  failuresInWindow,
  invalidCredentialsError,
  isLockedOut,
  isPasswordCompliant,
  logout,
  nextSessionState,
  normalizeUsername,
  openSession,
  parseRegisterUserInput,
  sessionStateAt,
  type SessionRecord,
} from '../../src/domain/auth/auth-policies.ts';
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
/** Oráculo escrito a mano a partir de la y D-04, independiente del contrato generado. */
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
    TTL_ELAPSED: ['EXPIRED', null, null],
    LOGOUT: ['LOGGED_OUT', null, null],
  },
  EXPIRED: { LOGOUT: ['EXPIRED', null, 204] },
  LOGGED_OUT: { LOGOUT: ['LOGGED_OUT', null, 204] },
};

describe('máquina STATE-AUTH-SESSION-001 (src/domain/auth/auth-policies.ts)', () => {
  it('[STATE-AUTH-SESSION-001] las 11 transiciones válidas coinciden con la spec y las 21 restantes se rechazan', () => {
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
    expect([valid, invalid]).toEqual([11, 21]);
  });

  it('[STATE-AUTH-SESSION-001] las constantes salen del contrato: TTL 7 días, 5 fallos, ventana de 15 minutos', () => {
    expect([SESSION_TTL_DAYS, MAX_FAILED_ATTEMPTS, LOCKOUT_WINDOW_MINUTES]).toEqual([7, 5, 15]);
  });
});

describe('registro (REQ-AUTH-001)', () => {
  it('[REQ-AUTH-001][INV-AUTH-001] normaliza el username (recorta espacios y pasa a minúsculas) antes de validar', () => {
    expect(normalizeUsername('  MaRiA.V ')).toBe('maria.v');
    expect(parseRegisterUserInput({ username: ' Lucia.R ', displayName: 'Lucía', password: 'Lucia2026d' }).username).toBe('lucia.r');
    expect(parseRegisterUserInput({ username: 'Nuevo_1', displayName: 'Nuevo', password: 'Clave2026x' })).toEqual({
      username: 'nuevo_1',
      displayName: 'Nuevo',
      password: 'Clave2026x',
    });
  });

  it('[INV-AUTH-002][ERR-AUTH-WEAK-PASSWORD] rechaza contraseñas sin dígito, sin letra o fuera de 8..128 (EDGE-011)', () => {
    const base = { username: 'nuevo', displayName: 'Nuevo' };
    for (const password of [edge('EDGE-011').payload.password, '12345678', 'abc1234', `a1${'x'.repeat(127)}`]) {
      const error = catchDomainError(() => parseRegisterUserInput({ ...base, password }));
      expect([error.code, error.status, error.field, error.invariantRef]).toEqual(['ERR-AUTH-WEAK-PASSWORD', 422, 'password', 'INV-AUTH-002']);
      expect(error.detail).toBe('La contraseña debe tener entre 8 y 128 caracteres e incluir al menos una letra y un dígito.');
    }
    const typed = catchDomainError(() => parseRegisterUserInput({ ...base, password: 12345678 }));
    expect([typed.code, typed.field]).toEqual(['ERR-AUTH-WEAK-PASSWORD', 'password']);
    expect(parseRegisterUserInput({ ...base, password: 'abcdefg1' }).password).toBe('abcdefg1');
    expect(parseRegisterUserInput({ ...base, password: `a1${'x'.repeat(126)}` }).password.length).toBe(128);
  });

  it('[INV-AUTH-002] isPasswordCompliant aplica los límites 8 y 128 y exige letra y dígito', () => {
    const cases: Array<[string, boolean]> = [
      ['abcdefg1', true],
      ['abcdef1', false],
      [`A1${'b'.repeat(126)}`, true],
      [`A1${'b'.repeat(127)}`, false],
      ['abcdefgh', false],
      ['12345678', false],
      ['ABCDEFG9', true],
    ];
    expect(cases.map(([p]) => isPasswordCompliant(p))).toEqual(cases.map(([, ok]) => ok));
  });

  it('[REQ-AUTH-001] los demás fallos, y una contraseña ausente, dan ERR-SCHEMA-VALIDATION-FAILED con el campo', () => {
    const cases: Array<[unknown, string | null]> = [
      [{ username: 'a b', displayName: 'X', password: 'Clave2026x' }, 'username'],
      [{ username: 'ab', displayName: 'X', password: 'Clave2026x' }, 'username'],
      [{ username: 'nuevo', displayName: ' X', password: 'Clave2026x' }, 'displayName'],
      [{ username: 'nuevo', password: 'Clave2026x' }, 'displayName'],
      [{ username: 'nuevo', displayName: 'X', password: 'Clave2026x', role: 'ADMIN' }, 'role'],
      [{ username: 'nuevo', displayName: 'X' }, 'password'],
      [{ username: 7, displayName: 'X', password: 'Clave2026x' }, 'username'],
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

describe('sesión (REQ-AUTH-002..004, INV-AUTH-004)', () => {
  it('[REQ-AUTH-002][INV-AUTH-004] una sesión nueva vence a los 7 días exactos de su creación', () => {
    expect(openSession(ANDRES_ID, NOW)).toEqual({
      userId: ANDRES_ID,
      createdAt: NOW,
      expiresAt: '2026-11-12T12:00:00.000Z',
      revokedAt: null,
    });
    expect(openSession(ANDRES_ID, '2024-02-25T23:59:59.999Z').expiresAt).toBe('2024-03-03T23:59:59.999Z');
  });

  it('[INV-AUTH-004][ERR-AUTH-UNAUTHENTICATED] a los 7 días exactos la sesión expira (EDGE-014)', () => {
    const session = openSession(ANDRES_ID, '2026-10-29T12:00:00.000Z');
    expect(sessionStateAt(session, '2026-11-05T11:59:59.999Z')).toBe('AUTHENTICATED');
    expect(assertAuthenticated(session, '2026-11-05T11:59:59.999Z')).toBe(session);
    expect(sessionStateAt(session, NOW)).toBe('EXPIRED');
    const error = catchDomainError(() => assertAuthenticated(session, NOW));
    expect([error.code, error.status, error.invariantRef]).toEqual(['ERR-AUTH-UNAUTHENTICATED', 401, 'INV-AUTH-004']);
  });

  it('[REQ-AUTH-004][ERR-AUTH-UNAUTHENTICATED] sin sesión o con sesión revocada responde ERR-AUTH-UNAUTHENTICATED', () => {
    const revoked: SessionRecord = { ...openSession(ANDRES_ID, NOW), revokedAt: NOW };
    expect([sessionStateAt(null, NOW), sessionStateAt(revoked, NOW)]).toEqual(['ANONYMOUS', 'LOGGED_OUT']);
    expect(catchDomainError(() => assertAuthenticated(null, NOW)).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(catchDomainError(() => assertAuthenticated(revoked, NOW)).code).toBe('ERR-AUTH-UNAUTHENTICATED');
  });

  it('[REQ-AUTH-003][STATE-AUTH-SESSION-001] LOGOUT revoca una sesión vigente y es 204 sin cambios en ANONYMOUS, EXPIRED y LOGGED_OUT (D-04)', () => {
    const active = openSession(ANDRES_ID, NOW);
    const later = '2026-11-05T13:00:00.000Z';
    expect(logout(active, later)).toEqual({ session: { ...active, revokedAt: later }, response: 204 });
    const expired = openSession(ANDRES_ID, '2026-10-01T00:00:00.000Z');
    const loggedOut: SessionRecord = { ...active, revokedAt: NOW };
    for (const session of [null, expired, loggedOut]) {
      const result = logout(session, later);
      expect(result.response).toBe(204);
      expect(result.session).toBe(session);
    }
  });
});

describe('login y bloqueo (REQ-AUTH-002, INV-AUTH-005)', () => {
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

  it('[REQ-AUTH-002][ERR-AUTH-INVALID-CREDENTIALS] usuario inexistente y contraseña errónea dan la misma respuesta (EDGE-012, EDGE-032)', () => {
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
    expect([error.code, error.status, error.detail]).toEqual([spec.expectedError, spec.expectedStatus, spec.expectedDetail]);
  });

  it('[REQ-AUTH-002] un login correcto sin bloqueo devuelve LOGIN_SUCCESS y vacía los fallos', () => {
    expect(evaluateLoginAttempt(['2026-11-05T11:59:00.000Z'], NOW, () => true)).toEqual({ event: 'LOGIN_SUCCESS', failures: [], error: null });
  });
});

describe('timestamps UTC (src/domain/auth/utc-timestamp.ts)', () => {
  it('[INV-AUTH-004] convierte timestamps canónicos a milisegundos y de vuelta, incluso antes de 1970 y en bisiestos', () => {
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
