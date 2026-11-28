import { afterEach, describe, expect, it } from 'vitest';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ENGINE_FACTORIES, PET, T0, daysAfter, emergencyCases, emergencyDeps, type Engine012 } from '../../fixtures/emergency-012.ts';

/**
 * H-BD-F1 (Bloque D, #32; `/keymaker`): el barrido de la ficha QR borra de `audit_log` los eventos `EMERGENCY_*` y `PET_CRITICAL_ALLERGIES_UPDATED` con más de 90 días (decisión 3a, annex §7,
 * `EMERGENCY_HISTORY_RETENTION_DAYS`) usando SOLO `mutation_type` y `timestamp`. La fila de `audit_log` no tiene columna de contenido; los hashes (`previous_state_hash` / `new_state_hash`) se siembran con
 * valores distintos para comprobar que no influyen en la decisión de borrado. Los de 10 días y los tipos ajenos a la ficha se conservan. Memoria / SQLite / PostgreSQL real (se OMITE sin `TEST_DATABASE_URL`).
 *
 * @implements REQ-QR12-010, REQ-QR12-006
 * Cubre SC-012-121, SC-012-124.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const OLD = (iso: string) => daysAfter(iso, -100);
const RECENT = (iso: string) => daysAfter(iso, -10);

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`H-BD-F1 purga de auditoría EMERGENCY_* a 90 días (${factory.name})`, { timeout: 120_000 }, () => {
    it('[SC-012-124] runMaintenance borra solo los EMERGENCY_* y PET_CRITICAL_ALLERGIES_UPDATED de 100 días; conserva los de 10 días y los tipos ajenos; el borrado no depende de los hashes', async () => {
      engine = await factory.make();
      engine.setNow(T0);
      const deps: ApplicationDeps = emergencyDeps(engine);
      const seed = async (id: string, type: string, timestamp: string, hash: string | null) =>
        engine!.run((r) =>
          r.auditLog.insert({ id, timestamp, executorUserId: 'SYSTEM', mutationType: type as never, entityType: 'PET', entityId: PET, previousStateHash: hash, newStateHash: hash }),
        );
      const olds = ['EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED', 'EMERGENCY_CARD_AUTO_DEACTIVATED', 'EMERGENCY_PHONE_CONSENT_CHANGED', 'PET_CRITICAL_ALLERGIES_UPDATED'];
      let n = 0;
      for (const type of olds) await seed(`aud-old-${(n += 1)}`, type, OLD(T0), n % 2 === 0 ? 'a'.repeat(64) : null);
      for (const type of olds.slice(0, 5)) await seed(`aud-new-${(n += 1)}`, type, RECENT(T0), n % 2 === 0 ? 'b'.repeat(64) : null);
      await seed('aud-other-old', 'UPDATE', OLD(T0), null);
      const before = (await engine.auditTypes(PET)).length;

      const result = await emergencyCases(deps).maintenance();

      expect(result['auditPurged']).toBe(olds.length);
      const after = await engine.auditTypes(PET);
      expect(before - after.length).toBe(olds.length);
      expect(after.filter((t) => t.startsWith('EMERGENCY_')).length).toBe(5);
      expect(after).not.toContain('PET_CRITICAL_ALLERGIES_UPDATED');
      expect(after).toContain('UPDATE');
      // Idempotente: una segunda pasada no borra nada más.
      expect((await emergencyCases(deps).maintenance())['auditPurged']).toBe(0);
    });
  });
}
