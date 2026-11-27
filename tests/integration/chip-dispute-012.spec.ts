import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase, UpdatePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, cases, requestRows, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, CHIP_B, codeOfChip, loadChipModule, type UseCaseClass } from '../fixtures/chip-012.ts';

/**
 * T1634 (Feature 012, Bloque B, #23) PRUEBAS ROJAS de disputas de chip: congelación, reserva, límites, prórroga única, techo de 60 días y enfriamiento de 90 días (T1635, T1642, T1646).
 * ROJAS porque `chip-dispute-use-cases.ts` (`OpenChipDisputeUseCase`) y `chip-dispute-admin-use-cases.ts` (`ExtendChipDisputeFreezeUseCase`, `ResolveChipDisputeUseCase`) aún no existen.
 * API supuesta: `OpenChipDisputeUseCase.execute(actor, { microchipId, evidence })` devuelve el mismo `{ accepted: true }`; las operaciones de administración reciben el actor
 * `{ adminId, role: 'SUPER_ADMIN' | 'OPERATOR', personId }` y `(requestId, cuerpo)`.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-007, REQ-CHP12-009, INV-CHP12-005, INV-CHP12-006, INV-CHP12-009, NFR-012-006
 * Cubre SC-012-019, SC-012-020, SC-012-080, SC-012-096, SC-012-097, SC-012-098, SC-012-099, SC-012-100, SC-012-101, SC-012-102.
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
interface AdminModule {
  ExtendChipDisputeFreezeUseCase: UseCaseClass<never, unknown>;
  ResolveChipDisputeUseCase: UseCaseClass<never, unknown>;
}
const REG = (name: string, microchipId: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', microchipId });
const NOW = '2026-11-26T10:00:00.000Z';
const daysAfter = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

async function setup(factory: (typeof ENGINE_FACTORIES)[number]) {
  const mod = await loadChipModule<DisputeModule>('chip-dispute-use-cases');
  const admin = await loadChipModule<AdminModule>('chip-dispute-admin-use-cases');
  engine = await factory.make();
  engine.setNow(NOW);
  const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
  const open = new mod.OpenChipDisputeUseCase(engine.deps);
  return { e: engine, luna, open, admin };
}
const openRows = async (e: Engine012, petId: string) => (await requestRows(e, petId)).filter((r) => r['action'] === 'CHIP_DISPUTE');

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1634 disputas de chip (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-019][SC-012-020] disputa abierta: ningún propietario puede eliminar, transferir, cambiar el principal ni invitar (ERR-CHP12-CHIP-FROZEN) y el propietario nunca cambia solo', async () => {
      const { e, luna, open } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      expect(await openRows(e, luna.id)).toHaveLength(1);
      const use = cases(e.deps);
      expect(await codeOfChip(use.request(MARIA, luna.id, { action: 'DELETE_PET' }))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect(await codeOfChip(use.request(MARIA, luna.id, { action: 'TRANSFER_PRINCIPAL', targetUserId: CARLOS }))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect(await codeOfChip(use.invite(MARIA, luna.id, 'cualquiera'))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect((await e.run((r) => r.pets.findById(luna.id)))?.ownerUserId).toBe(MARIA);
    });

    it('[SC-012-080] la congelación por chip también rechaza marcar la mascota fallecida y cambiar su chip', async () => {
      const { e, luna, open } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      expect(await codeOfChip(new UpdatePetUseCase(e.deps).execute(MARIA, luna.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-11-20' }, luna.version ?? null))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect(await codeOfChip(new UpdatePetUseCase(e.deps).execute(MARIA, luna.id, { microchipId: CHIP_B }, luna.version ?? null))).toBe('ERR-CHP12-CHIP-FROZEN');
    });

    it('[SC-012-096][SC-012-097][INV-CHP12-009] la reserva NO caduca con la congelación ni con la eliminación de la mascota: el chip da el MISMO 409 y las MISMAS llamadas', async () => {
      const { e, luna, open } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      e.setNow(daysAfter(31)); // congelación caducada (30 días)
      expect(await codeOfChip(new RegisterPetUseCase(e.deps).execute(CARLOS, REG('Otro', CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      await e.run((r) => r.pets.delete(luna.id));
      expect(await codeOfChip(new RegisterPetUseCase(e.deps).execute(CARLOS, REG('Otro', CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
    });

    it('[SC-012-098] límites de disputa: una abierta por (usuario, chip) y como máximo MAX_OPEN_DISPUTES_PER_USER = 3 por usuario', async () => {
      const { e, luna, open } = await setup(factory);
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('OK');
      // Repetir sobre un chip con disputa propia abierta: 202 uniforme y SIN fila duplicada (H-T1638-01); el 409 queda para el tope propio de 3.
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('OK');
      expect(await openRows(e, luna.id)).toHaveLength(1);
      for (const [i, chip] of ['985112345678903', '985112345678904'].entries()) {
        await new RegisterPetUseCase(e.deps).execute(MARIA, REG(`Pet${i}`, chip));
        expect(await codeOfChip(open.execute(ANDRES, { microchipId: chip, evidence: EVIDENCE }))).toBe('OK');
      }
      await new RegisterPetUseCase(e.deps).execute(MARIA, REG('Pet9', '985112345678905'));
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: '985112345678905', evidence: EVIDENCE }))).toBe('ERR-CHP12-DISPUTE-LIMIT');
    });

    it('[SC-012-099] la congelación caduca a los 30 días; una sola prórroga de 30 con motivo; la segunda y cualquier prórroga sobre el techo de 60 días se rechazan', async () => {
      const { e, luna, open, admin } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      const [row] = await openRows(e, luna.id);
      const extend = new admin.ExtendChipDisputeFreezeUseCase(e.deps) as unknown as { execute(a: Admin, id: string, body: { reason: string }): Promise<unknown> };
      expect(await codeOfChip(extend.execute(ARBITER, String(row!['id']), { reason: 'Falta documentación' }))).toBe('OK');
      expect(String((await openRows(e, luna.id))[0]!['frozenUntil'])).toBe(daysAfter(60));
      expect(await codeOfChip(extend.execute(ARBITER, String(row!['id']), { reason: 'Otra vez' }))).toBe('ERR-CHP12-DISPUTE-LIMIT');
    });

    it('[SC-012-100][SC-012-101] tras un REJECT sin moot_reason rige un cooldown de 90 días por (solicitante, chip); un cierre sin efecto NO lo activa', async () => {
      const { e, luna, open, admin } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      const [row] = await openRows(e, luna.id);
      const resolve = new admin.ResolveChipDisputeUseCase(e.deps) as unknown as { execute(a: Admin, id: string, body: { resolution: 'REJECT' }): Promise<unknown> };
      await resolve.execute(ARBITER, String(row!['id']), { resolution: 'REJECT' });
      e.setNow(daysAfter(89));
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('ERR-CHP12-DISPUTE-COOLDOWN');
      e.setNow(daysAfter(91));
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('OK');
    });

    it('[SC-012-111][D1] el cooldown depende solo del historial propio: tras un REJECT propio el chip LIBRE da el mismo 409 que el chip ocupado', async () => {
      const { e, luna, open, admin } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      const [row] = await openRows(e, luna.id);
      const resolve = new admin.ResolveChipDisputeUseCase(e.deps) as unknown as { execute(a: Admin, id: string, body: { resolution: 'REJECT' }): Promise<unknown> };
      await resolve.execute(ARBITER, String(row!['id']), { resolution: 'REJECT' });
      e.setNow(daysAfter(10));
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('ERR-CHP12-DISPUTE-COOLDOWN'); // chip ocupado
      await e.run((r) => r.pets.delete(luna.id)); // chip libre: sin mascota; la reserva ya no existe tras el REJECT
      expect(await codeOfChip(open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE }))).toBe('ERR-CHP12-DISPUTE-COOLDOWN');
    });

    it('[SC-012-102][D12-07] el árbitro no puede ser parte: sin person_id o con el mismo person_id que el resolutor se falla CERRADO con ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT (texto neutro)', async () => {
      const { e, luna, open, admin } = await setup(factory);
      await open.execute(ANDRES, { microchipId: CHIP_A, evidence: EVIDENCE });
      const [row] = await openRows(e, luna.id);
      const resolve = new admin.ResolveChipDisputeUseCase(e.deps) as unknown as { execute(a: Admin, id: string, body: { resolution: 'REQUEST_CHANGE_PRINCIPAL' }): Promise<unknown> };
      expect(await codeOfChip(resolve.execute({ ...ARBITER, personId: null }, String(row!['id']), { resolution: 'REQUEST_CHANGE_PRINCIPAL' }))).toBe('ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT');
    });
  });
}
