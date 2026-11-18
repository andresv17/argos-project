/** T559 [US3] umbral TTL de login_attempts (REQ-LOG-001, SC-CAT-030, INV-AUTH-005): ahora menos la ventana de bloqueo, con la frontera de failuresInWindow. */
import { describe, expect, it } from 'vitest';
import { failuresInWindow, loginAttemptsExpiryCutoff, LOCKOUT_WINDOW_MINUTES } from '../../src/domain/auth/auth-policies.ts';

describe('loginAttemptsExpiryCutoff (src/domain/auth/auth-policies.ts)', () => {
  it('[REQ-LOG-001][INV-AUTH-005] es ahora menos la ventana de bloqueo y coincide con la frontera inclusiva de failuresInWindow', () => {
    const now = '2026-11-05T12:00:00.000Z';
    const cutoff = loginAttemptsExpiryCutoff(now);
    expect([LOCKOUT_WINDOW_MINUTES, cutoff]).toEqual([15, '2026-11-05T11:45:00.000Z']);
    const edge = '2026-11-05T11:45:00.000Z';
    const justOut = '2026-11-05T11:44:59.999Z';
    expect(failuresInWindow([edge, justOut], now)).toEqual([edge]);
    expect([edge >= cutoff, justOut >= cutoff]).toEqual([true, false]);
  });
});
