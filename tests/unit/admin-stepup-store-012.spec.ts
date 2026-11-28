import { describe, expect, it } from 'vitest';
import { AdminForbiddenError } from '../../src/application/use-cases/chip-dispute-admin-use-cases.ts';
import { AdminStepUpStore } from '../../src/infrastructure/http/admin-stepup-store.ts';

const NOW = '2026-11-05T12:00:00.000Z';
let n = 0;
const newId = (): string => `grant_${String((n += 1)).padStart(8, '0')}`;
const issue = (store: AdminStepUpStore, adminId: string, disputeId = 'disputa_01') => store.issue({ adminId, disputeId, action: 'resolve', now: NOW, newId });

describe('AdminStepUpStore (T-02)', () => {
  it('un administrador que emite muchos grants no expulsa el grant de otro administrador (cuota por administrador)', () => {
    const store = new AdminStepUpStore();
    const victim = issue(store, 'admin_a');
    for (let i = 0; i < 100; i += 1) issue(store, 'admin_b');
    expect(() => store.claim(victim.grantId, { adminId: 'admin_a', disputeId: 'disputa_01', action: 'resolve' }, NOW)).not.toThrow(AdminForbiddenError);
  });

  it('claim reserva el grant (una segunda petición concurrente falla), release lo devuelve y finish lo consume', () => {
    const store = new AdminStepUpStore();
    const { grantId } = issue(store, 'admin_a');
    const expected = { adminId: 'admin_a', disputeId: 'disputa_01', action: 'resolve' } as const;
    store.claim(grantId, expected, NOW);
    expect(() => store.claim(grantId, expected, NOW)).toThrow(AdminForbiddenError);
    store.release(grantId);
    store.claim(grantId, expected, NOW);
    store.finish(grantId);
    expect(() => store.claim(grantId, expected, NOW)).toThrow(AdminForbiddenError);
  });
});
