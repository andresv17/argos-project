import { afterEach, describe, expect, it } from 'vitest';
import type { OwnerRequestRecord } from '../../src/application/ports/co-ownership.port.ts';
import { purgeDelegateData } from '../../src/application/use-cases/maintenance-use-cases.ts';
import { ANDRES, ENGINE_FACTORIES, PET, type Engine012 } from '../fixtures/co-ownership-012.ts';

/**
 * Frontera de 1095 días de `person_id` (Feature 012, D8; `rama` B-R1) sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`): la identidad de operador ya anonimizada que resolvió una disputa de
 * apropiación de chip conserva `person_id` hasta `closed_at` (= `resolved_at`) + `ARBITER_AUDIT_RETENTION_DAYS` = 1095 días; con 1094 días se mantiene, a los 1095 d exactos aún se retiene (comparación estricta) y pasado ese instante y con 1096 se anula. Mientras el expediente
 * siga abierto lo retiene. Mantenimiento: `purgeDelegateData` (`releaseExpiredPersonIds`).
 *
 * @implements REQ-CHP12-008, REQ-ADM11-001, NFR-012-009
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const DAY = 86_400_000;
const CLOSED_AT = '2026-01-01T00:00:00.000Z';
const at = (days: number): string => new Date(Date.parse(CLOSED_AT) + days * DAY).toISOString();
const ADMIN = 'c2000000-0000-4000-8000-000000000001';
const DISPUTE = 'c2000000-0000-4000-8000-0000000000d1';
const PERSON = 'persona_1095';
const CHIP_HMAC = 'a'.repeat(64);

const dispute = (over: Partial<OwnerRequestRecord>): OwnerRequestRecord => ({
  id: DISPUTE, action: 'CHIP_DISPUTE', petId: PET, petVersion: 1, requesterUserId: ANDRES, requesterPseudonym: null, targetUserId: null, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
  status: 'RESOLVED', approverSet: [], approvals: [], rejectedBy: null, rejectedByPseudonym: null, message: null, createdAt: at(-30), expiresAt: at(-5), decidedAt: CLOSED_AT, staleReason: null, disputeReason: 'CHIP_APPROPRIATION',
  chipLast4: '0001', chipHmac: CHIP_HMAC, frozenUntil: at(-10), freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: CLOSED_AT, resolution: 'REJECT', mootReason: null, resolvedByUserId: null, secondApproverUserId: null,
  executesAfter: null, version: 1, resolvedByAdminId: ADMIN, resolvedByPersonId: PERSON, ...over,
});

async function seed(e: Engine012, over: Partial<OwnerRequestRecord> = {}): Promise<void> {
  await e.run(async (r) => {
    await r.adminIdentities.insertIfAbsent({ adminId: ADMIN, provider: 'GOOGLE', providerSubject: 'sub-1095', email: 'arbitro.baja@example.test', createdAt: at(-400), personId: PERSON });
    expect(await r.adminIdentities.anonymizeIdentity(ADMIN)).toBe(true); // identidad ya anonimizada (D8): solo estas liberan `person_id`
    await r.ownerRequests.insert(dispute(over));
  });
}
const personIdOf = (e: Engine012): Promise<string | null> => e.run((r) => r.adminIdentities.findPersonId(ADMIN));
const e2 = (e: Engine012, ms: number): void => e.setNow(new Date(Date.parse(CLOSED_AT) + ms).toISOString());
const sweep = async (e: Engine012, days: number): Promise<string | null> => {
  e.setNow(at(days));
  await purgeDelegateData(e.deps);
  return personIdOf(e);
};

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`frontera de 1095 d de person_id en disputas de apropiación (${factory.name})`, { timeout: 60_000 }, () => {
    it('[B-R1] 1094 días desde closed_at: person_id se mantiene; en los 1095 d exactos se retiene y pasados 1095 d + 1 ms se anula', async () => {
      engine = await factory.make();
      await seed(engine);
      expect(await personIdOf(engine)).toBe(PERSON);
      expect(await sweep(engine, 1094)).toBe(PERSON);
      expect(await sweep(engine, 1095)).toBe(PERSON); // comportamiento real: el plazo vence ESTRICTAMENTE después (`releaseAt < now`); en el instante exacto de los 1095 d aún se retiene
      e2(engine, 1095 * DAY + 1);
      await purgeDelegateData(engine.deps);
      expect(await personIdOf(engine)).toBeNull(); // 1095 d + 1 ms: vencido
    });

    it('[B-R1] con 1096 días (sin pasadas intermedias) person_id se anula', async () => {
      engine = await factory.make();
      await seed(engine);
      expect(await sweep(engine, 1096)).toBeNull();
    });

    it('[B-R1] un expediente de apropiación aún UNDER_REVIEW retiene person_id aunque pasen 1096 días', async () => {
      engine = await factory.make();
      await seed(engine, { status: 'UNDER_REVIEW', resolvedAt: null, resolution: null, decidedAt: null });
      expect(await sweep(engine, 1096)).toBe(PERSON);
    });
  });
}
