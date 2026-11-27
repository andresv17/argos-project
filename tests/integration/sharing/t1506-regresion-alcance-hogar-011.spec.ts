/**
 * T1506 [Bloque A, #64] regresión de 005 que sostiene a `D11-06` = A (lock F-05/F-06): el enlace de hogar tiene alcance dinámico (una mascota asignada después aparece) y se
 * revalida la autoridad del creador en cada petición (`REQ-VET-011`): si deja de ser propietario o ADMIN del hogar (p. ej. pasa a CAREGIVER) el enlace deja de servir.
 * Memoria y SQLite.
 *
 * @implements REQ-HOG11-005, EDGE-011-014, EDGE-011-005, REQ-VET-011
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resolveShare } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import { computeExpiresAt, type ShareLinkRecord } from '../../../src/domain/sharing/share-link.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { ANDRES, HOUSEHOLD_ID, KEY, createShareEngines, type ShareEngine } from '../../fixtures/share-harness.ts';

const TOKEN = 't1506-token'.padEnd(43, 'x');
const KIRA_ID = '11111111-1111-4111-8111-111111111102';

describe('T1506 enlace de hogar: alcance dinámico y revalidación de autoridad (EDGE-011-014, F-06)', { timeout: 60_000 }, () => {
  let engines: ShareEngine[] = [];
  afterEach(() => {
    for (const e of engines) e.close();
    engines = [];
  });

  async function seed(e: ShareEngine): Promise<void> {
    const now = e.deps.clock.nowIsoTimestamp();
    const link: ShareLinkRecord = {
      id: '7a7a7a7a-0000-4000-8000-000000001506', tokenHash: hashToken(TOKEN), scope: 'HOUSEHOLD', petId: null, householdId: HOUSEHOLD_ID, createdByUserId: ANDRES, createdAt: now,
      expiresInDays: 7, expiresAt: computeExpiresAt(now, 7), revokedAt: null, includeMicrochip: false, includeClinicalFiles: false, includeDeceasedAt: false, idempotencyKey: KEY(1506), petOwnerUserIdAtCreation: null,
    };
    await e.run((r) => r.shareLinks.insert(link));
  }
  const resolve = (e: ShareEngine) => e.run((r) => resolveShare(r, TOKEN, e.deps.clock.nowIsoTimestamp()));

  it('[EDGE-011-014] una mascota asignada al hogar después de crear el enlace aparece en él (no se congela el subconjunto)', async () => {
    engines = await createShareEngines('ADMIN');
    for (const e of engines) {
      await seed(e);
      await e.run((r) => r.assignments.remove(KIRA_ID, HOUSEHOLD_ID));
      const before = (await resolve(e))!.pets.map((p) => p.id);
      expect(before).not.toContain(KIRA_ID);
      await e.run((r) => r.assignments.save({ petId: KIRA_ID, householdId: HOUSEHOLD_ID, assignedByUserId: ANDRES, assignedAt: e.deps.clock.nowIsoTimestamp() }));
      const after = (await resolve(e))!.pets.map((p) => p.id);
      expect(after).toContain(KIRA_ID);
    }
  });

  it('[REQ-VET-011][F-06] si el creador pasa a CAREGIVER, el enlace de hogar deja de servir en la siguiente petición', async () => {
    engines = await createShareEngines('ADMIN');
    for (const e of engines) {
      await seed(e);
      expect((await resolve(e))?.pets.length).toBeGreaterThan(0);
      await e.run(async (r) => {
        const m = (await r.households.listMembershipsOfUsers([ANDRES])).find((x) => x.householdId === HOUSEHOLD_ID)!;
        await r.households.saveMembership({ ...m, role: 'CAREGIVER', isHouseholdOwner: false } as typeof m);
      });
      expect(await resolve(e)).toBeNull();
    }
  });
});
