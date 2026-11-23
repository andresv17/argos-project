import { describe, expect, it, vi } from 'vitest';
import { PENDING_WARNING_THRESHOLD, REGISTRATION_LIMIT } from '../../src/infrastructure/config/app-config.ts';
import { RegistrationRateLimiter, RegistrationRateLimitedError } from '../../src/infrastructure/http/registration-rate-limit.ts';
import { pendingBacklogNotice, warnPendingBacklog } from '../../src/infrastructure/http/pending-backlog-notice.ts';

/**
 * T1288 / T1289 (Feature 009, #18; D9-25, ADR-009-15): política del límite de registros por IP efectiva y aviso de umbral de PENDING (> 50). Sin base de datos ni HTTP.
 * @implements REQ-APR9-002, REQ-APR9-005, EDGE-009-040, ERR-ACCOUNT-REGISTRATION-RATE-LIMITED, INV-ARCH-001, INV-ARCH-006
 */
const T0 = Date.parse('2026-11-23T10:00:00.000Z');
const HOUR = 3_600_000;

describe('T1288 [EDGE-009-040] RegistrationRateLimiter: ventana deslizante por IP, reloj inyectado', () => {
  it('permite hasta el máximo de altas y la siguiente lanza ERR-ACCOUNT-REGISTRATION-RATE-LIMITED con los segundos hasta que venza la más antigua', () => {
    let now = T0;
    const limiter = new RegistrationRateLimiter(() => now);
    for (let i = 0; i < REGISTRATION_LIMIT.maxNewAccounts; i += 1) {
      limiter.assertAllowed('1.1.1.1');
      limiter.recordCreated('1.1.1.1');
      now += HOUR;
    }
    let caught: unknown;
    try {
      limiter.assertAllowed('1.1.1.1');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RegistrationRateLimitedError);
    expect((caught as RegistrationRateLimitedError).code).toBe('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    expect((caught as RegistrationRateLimitedError).retryAfterSeconds).toBe((24 * HOUR - 5 * HOUR) / 1000);
  });

  it('assertAllowed no registra nada: consultar repetidamente no gasta cupo ni prolonga la ventana', () => {
    const limiter = new RegistrationRateLimiter(() => T0);
    for (let i = 0; i < 50; i += 1) limiter.assertAllowed('2.2.2.2');
    for (let i = 0; i < REGISTRATION_LIMIT.maxNewAccounts; i += 1) limiter.recordCreated('2.2.2.2');
    expect(() => limiter.assertAllowed('2.2.2.2')).toThrow(RegistrationRateLimitedError);
  });

  it('las IPs son independientes y el cupo vuelve tras la ventana', () => {
    let now = T0;
    const limiter = new RegistrationRateLimiter(() => now);
    for (let i = 0; i < REGISTRATION_LIMIT.maxNewAccounts; i += 1) limiter.recordCreated('3.3.3.3');
    expect(limiter.assertAllowed('3.3.3.4')).toBeUndefined();
    now = T0 + REGISTRATION_LIMIT.windowMinutes * 60_000 + 1;
    expect(limiter.assertAllowed('3.3.3.3')).toBeUndefined();
  });
});

describe('T1289 [REQ-APR9-005] [EDGE-009-040] aviso al operador cuando PENDING supera el umbral (D9-25 = 50)', () => {
  it('el umbral aprobado es 50 y vive solo en app-config.ts', () => {
    expect(PENDING_WARNING_THRESHOLD).toBe(50);
  });

  it('avisa solo por ENCIMA del umbral: 50 no avisa, 51 sí', () => {
    expect(pendingBacklogNotice(0)).toEqual({ pendingCount: 0, threshold: 50, exceeded: false });
    expect(pendingBacklogNotice(50).exceeded).toBe(false);
    expect(pendingBacklogNotice(51)).toEqual({ pendingCount: 51, threshold: 50, exceeded: true });
  });

  it('warnPendingBacklog escribe una advertencia con solo conteos (sin datos personales) cuando se supera y nada si no', () => {
    const log = { warn: vi.fn() };
    warnPendingBacklog(log, 50);
    expect(log.warn).not.toHaveBeenCalled();
    warnPendingBacklog(log, 73);
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = log.warn.mock.calls[0]!;
    expect(fields).toEqual({ pendingCount: 73, threshold: 50 });
    expect(String(message)).toMatch(/PENDING/);
  });
});
