import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { expireLapsedDisputes } from '../../src/application/use-cases/chip-dispute-retention.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, allRequestRows, cases, unshare, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, codeOfChip, loadChipModule, type UseCaseClass } from '../fixtures/chip-012.ts';

/**
 * Supresión de cuenta del ÚNICO propietario con una disputa de apropiación de chip abierta (Feature 012; `trinity` A2, `rama` A-R1, `N2-R2`) sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`):
 * la supresión procede (la mascota se elimina), el expediente y `chip_hmac` se conservan con `pet_id = NULL`, ningún ID de la cuenta suprimida queda en claro y el chip sigue reservado (mismo `409`) mientras la
 * disputa esté abierta, también pasada la congelación de 30 días. La reserva se libera al cerrarse por `RESOLVED` o por `EXPIRED` (60 días, `closed_at`).
 *
 * @implements REQ-OWN12-008, REQ-CHP12-004, INV-CHP12-009, EDGE-012-053, SC-012-096, SC-012-097
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

interface Admin { adminId: string; role: 'SUPER_ADMIN' | 'OPERATOR'; personId: string | null }
const ARBITER: Admin = { adminId: '00000000-0000-4000-8000-0000000000e1', role: 'OPERATOR', personId: 'persona_0001' };
const EVIDENCE = [{ contentType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }];
interface DisputeModule { OpenChipDisputeUseCase: UseCaseClass<{ microchipId: string; evidence: typeof EVIDENCE }, { accepted: true }> }
interface AdminModule { ResolveChipDisputeUseCase: UseCaseClass<never, unknown> }
const REG = (name: string, microchipId: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', microchipId });
const NOW = '2026-11-26T10:00:00.000Z';
const daysAfter = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

/** MARIA (única propietaria) registra a Luna con CHIP_A; ANDRES abre la disputa; MARIA borra su cuenta. */
async function erasedWithOpenDispute(factory: (typeof ENGINE_FACTORIES)[number]) {
  const dispute = await loadChipModule<DisputeModule>('chip-dispute-use-cases');
  const admin = await loadChipModule<AdminModule>('chip-dispute-admin-use-cases');
  engine = await factory.make();
  const e = engine;
  await unshare(e.deps);
  e.setNow(NOW);
  const luna = await new RegisterPetUseCase(e.deps).execute(MARIA, REG('Luna', CHIP_A));
  await new dispute.OpenChipDisputeUseCase(e.deps).execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
  const [row] = (await allRequestRows(e)).filter((r) => r['action'] === 'CHIP_DISPUTE');
  expect(row).toMatchObject({ status: 'UNDER_REVIEW', petId: luna.id });
  expect(await codeOfChip(cases(e.deps).erase(MARIA))).toBe('OK');
  return { e, luna, disputeId: String(row!['id']), chipHmac: row!['chipHmac'], admin };
}
const register = (e: Engine012) => codeOfChip(new RegisterPetUseCase(e.deps).execute(CARLOS, REG('Otro', CHIP_A)));

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`supresión del único propietario con disputa de chip abierta (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-096][EDGE-012-053][A-R1] la supresión procede: mascota eliminada, expediente y chip_hmac conservados con pet_id NULL, evidencia retenida y sin el ID de la cuenta suprimida', async () => {
      const { e, luna, disputeId, chipHmac } = await erasedWithOpenDispute(factory);
      expect(await e.run((r) => r.pets.findById(luna.id))).toBeNull();
      expect(await e.run((r) => r.users.findById(MARIA))).toBeNull();
      const stored = (await allRequestRows(e)).find((r) => r['id'] === disputeId)!;
      expect(stored).toMatchObject({ status: 'UNDER_REVIEW', petId: null, chipHmac, action: 'CHIP_DISPUTE', disputeReason: 'CHIP_APPROPRIATION', requesterUserId: ANDRES });
      expect(chipHmac).toEqual(expect.any(String));
      expect(JSON.stringify(stored)).not.toContain(MARIA);
      expect(await e.run((r) => r.disputeEvidence.listByRequest(disputeId))).toHaveLength(1);
    });

    it('[A2][SC-012-096][INV-CHP12-009] con la disputa abierta, registrar el mismo chip da 409 ERR-CHP12-MICROCHIP-REGISTERED, también con la congelación de 30 días caducada', async () => {
      const { e } = await erasedWithOpenDispute(factory);
      expect(await register(e)).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      e.setNow(daysAfter(31)); // congelación caducada; la disputa sigue UNDER_REVIEW (techo de 60 días)
      expect(await register(e)).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
    });

    it('[A2][SC-012-096] al cerrarse la disputa por RESOLVED el chip queda libre y otra cuenta lo registra', async () => {
      const { e, disputeId, admin } = await erasedWithOpenDispute(factory);
      expect(await register(e)).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      const resolve = new admin.ResolveChipDisputeUseCase(e.deps) as unknown as { execute(a: Admin, id: string, body: { resolution: 'REJECT' }): Promise<unknown> };
      expect(await codeOfChip(resolve.execute(ARBITER, disputeId, { resolution: 'REJECT' }))).toBe('OK');
      expect((await allRequestRows(e)).find((r) => r['id'] === disputeId)).toMatchObject({ status: 'RESOLVED', petId: null });
      expect(await register(e)).toBe('OK');
    });

    it('[A2][SC-012-096] al vencer la disputa por EXPIRED (60 días) el chip queda libre y otra cuenta lo registra', async () => {
      const { e, disputeId } = await erasedWithOpenDispute(factory);
      e.setNow(daysAfter(59));
      expect(await register(e)).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      e.setNow(daysAfter(61));
      expect(await expireLapsedDisputes(e.deps)).toBe(1);
      expect((await allRequestRows(e)).find((r) => r['id'] === disputeId)).toMatchObject({ status: 'EXPIRED', petId: null });
      expect(await register(e)).toBe('OK');
    });
  });
}
