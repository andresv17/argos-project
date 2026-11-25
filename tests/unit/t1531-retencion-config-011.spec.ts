import { describe, expect, it } from 'vitest';
import { ADMIN_DELEGATE_DISABLED_RETENTION_DAYS, ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS } from '../../src/infrastructure/config/app-config.ts';

/**
 * T1531 (011, Bloque D, #63; `/keymaker`): constantes de retención de delegados aprobadas por Neo (D-1, D-2; DEUDA-011-PURGA-DELEGADOS).
 *
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
describe('T1531 retención de delegados (D-1, D-2)', () => {
  it('[REQ-ADM11-001] DISABLED se conserva 365 días (entero positivo)', () => {
    expect(Number.isInteger(ADMIN_DELEGATE_DISABLED_RETENTION_DAYS)).toBe(true);
    expect(ADMIN_DELEGATE_DISABLED_RETENTION_DAYS).toBeGreaterThan(0);
    expect(ADMIN_DELEGATE_DISABLED_RETENTION_DAYS).toBe(365);
  });

  it('[REQ-ADM11-001] la invitación caducada se conserva 30 días (entero positivo)', () => {
    expect(Number.isInteger(ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS)).toBe(true);
    expect(ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS).toBeGreaterThan(0);
    expect(ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS).toBe(30);
  });
});
