import { describe, expect, it } from 'vitest';
import { AuthenticateRequestUseCase, LoginUseCase, isAccountStatusResult } from '../../src/application/use-cases/auth-use-cases.ts';
import { ACCOUNT_STATUSES, canTransitionAccountStatus, isAccountActive, nextAccountStatus, parseAccountStatus, type AccountStatus } from '../../src/domain/account/account-status.ts';
import { ANDRES, PASSWORDS, canonicalState, createHarness } from '../fixtures/application-harness.ts';

/**
 * T1246 (Feature 009, Fase 4, #18): máquina cerrada STATE-ACCT9-001 y política de estado de cuenta en la guarda de sesión y en el inicio de sesión (REQ-APR9-001, REQ-APR9-002,
 * EDGE-009-005, EDGE-009-038; ERR-ACCOUNT-PENDING, ERR-ACCOUNT-REJECTED). La política por HTTP y por Google está en `tests/integration/api/t1245-politica-registro-009.api.spec.ts`.
 */
const NOW = '2026-11-05T12:00:00.000Z';
const withStatus = (status: AccountStatus) => {
  const state = canonicalState();
  state.users = state.users.map((u) => (u.id === ANDRES ? { ...u, accountStatus: status } : u));
  state.sessions = { t1: { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null } };
  return createHarness(state);
};

describe('T1246 [STATE-ACCT9-001] la máquina cerrada del estado de cuenta', () => {
  it('[STATE-ACCT9-001] solo PENDING decide, ACTIVE y REJECTED son terminales y un valor ajeno no es un estado', () => {
    expect(ACCOUNT_STATUSES).toEqual(['PENDING', 'ACTIVE', 'REJECTED']);
    expect([nextAccountStatus('PENDING', 'APPROVE'), nextAccountStatus('PENDING', 'REJECT'), nextAccountStatus('ACTIVE', 'REJECT'), nextAccountStatus('REJECTED', 'APPROVE')]).toEqual(['ACTIVE', 'REJECTED', null, null]);
    expect([canTransitionAccountStatus('PENDING', 'ACTIVE'), canTransitionAccountStatus('REJECTED', 'PENDING'), canTransitionAccountStatus('ACTIVE', 'ACTIVE')]).toEqual([true, false, false]);
    expect([parseAccountStatus('ACTIVE'), parseAccountStatus('active'), parseAccountStatus(undefined)]).toEqual(['ACTIVE', null, null]);
    expect([isAccountActive(undefined), isAccountActive('ACTIVE'), isAccountActive('PENDING'), isAccountActive('REJECTED')]).toEqual([true, true, false, false]);
  });
});

describe('T1246 [ERR-ACCOUNT-PENDING] [ERR-ACCOUNT-REJECTED] la guarda de sesión exige ACTIVE (EDGE-009-038)', () => {
  async function expectGuarded(status: AccountStatus, code: string): Promise<void> {
    const { deps, uow, clock } = withStatus(status);
    clock.setClock('2026-11-05', '2026-11-05T12:10:00.000Z');
    await expect(new AuthenticateRequestUseCase(deps).execute('t1')).rejects.toMatchObject({ code, status: 403 });
    await expect(new AuthenticateRequestUseCase(deps).execute('t1', { renew: false })).rejects.toMatchObject({ code, status: 403 });
    expect(uow.snapshot().sessions['t1']).toEqual({ userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
  }

  it('[ERR-ACCOUNT-PENDING] una sesión viva de una cuenta PENDING responde 403 y no renueva lastActivityAt', () => expectGuarded('PENDING', 'ERR-ACCOUNT-PENDING'));

  it('[ERR-ACCOUNT-REJECTED] una sesión viva de una cuenta REJECTED responde 403 y no renueva lastActivityAt', () => expectGuarded('REJECTED', 'ERR-ACCOUNT-REJECTED'));

  it('una cuenta ACTIVE (con o sin el estado explícito) sigue autenticando y renovando', async () => {
    for (const status of [undefined, 'ACTIVE'] as const) {
      const state = canonicalState();
      state.sessions = { t1: { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null } };
      if (status !== undefined) state.users = state.users.map((u) => (u.id === ANDRES ? { ...u, accountStatus: status } : u));
      const { deps, clock } = createHarness(state);
      clock.setClock('2026-11-05', '2026-11-05T12:10:00.000Z');
      expect(await new AuthenticateRequestUseCase(deps).execute('t1')).toBe(ANDRES);
    }
  });
});

describe('T1246 [REQ-APR9-002] [EDGE-009-005] el inicio de sesión de una cuenta no ACTIVE devuelve el estado y no abre sesión', () => {
  it.each(['PENDING', 'REJECTED'] as const)('con credenciales válidas de una cuenta %s devuelve { accountStatus } sin token ni fila de sesión; con credenciales inválidas, el fallo uniforme', async (status) => {
    const state = withStatus(status).uow.snapshot();
    state.sessions = {};
    const harness = createHarness(state);
    const login = new LoginUseCase(harness.deps);
    const result = await login.execute({ username: 'andres', password: PASSWORDS['andres'] });
    expect(result).toEqual({ accountStatus: status });
    expect(isAccountStatusResult(result)).toBe(true);
    expect(harness.uow.snapshot().sessions).toEqual({});
    await expect(login.execute({ username: 'andres', password: 'ClaveIncorrecta9!' })).rejects.toMatchObject({ code: 'ERR-AUTH-INVALID-CREDENTIALS' });
  });
});
