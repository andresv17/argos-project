import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { ANDRES, ENGINE_FACTORIES, MARIA, cases, requestRows, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, CHIP_FREE, codeOfChip, last4, loadChipModule, type UseCaseClass } from '../fixtures/chip-012.ts';

/**
 * T1634 (Feature 012, Bloque B, #23) PRUEBAS ROJAS de la reclamación de co-propiedad por chip (T1635). ROJAS porque `chip-claim-use-cases.ts` (`CreateChipClaimUseCase`, `ListMyChipRequestsUseCase`) aún no existe.
 * API supuesta (de `chip-claim.openapi.yaml`): `execute(actorUserId, { microchipId, message? })` devuelve SIEMPRE `{ accepted: true }` (202 uniforme, sin `claimId` ni oráculo, `ChipRequestAccepted`);
 * `ListMyChipRequestsUseCase.execute(actor)` lista solo filas reales y propias con `chipLast4`.
 *
 * @implements REQ-CHP12-001, REQ-CHP12-003, REQ-CHP12-005, REQ-CHP12-010, INV-CHP12-002, STATE-OWNREQ12-001, NFR-012-006
 * Cubre SC-012-016, SC-012-017, SC-012-018, SC-012-022, SC-012-077, SC-012-079, SC-012-081.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

interface ClaimModule { CreateChipClaimUseCase: UseCaseClass<{ microchipId: string; message?: string }, { accepted: true }>; ListMyChipRequestsUseCase: UseCaseClass<never, readonly Record<string, unknown>[]> }
const REG = (name: string, microchipId: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', microchipId });

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1634 reclamación de co-propiedad por chip (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-077] la respuesta es uniforme por clase: chip ocupado, libre, propio y de mascota fallecida dan el MISMO 202 sin claimId ni oráculo', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      const claim = new mod.CreateChipClaimUseCase(engine.deps);
      const taken = await claim.execute(ANDRES, { microchipId: CHIP_A });
      const free = await claim.execute(ANDRES, { microchipId: CHIP_FREE });
      expect(taken).toStrictEqual({ accepted: true });
      expect(free).toStrictEqual(taken);
    });

    it('[SC-012-016] la solicitud queda PENDING, el solicitante no puede leer la mascota y los propietarios ven su username', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      await new mod.CreateChipClaimUseCase(engine.deps).execute(ANDRES, { microchipId: CHIP_A, message: 'Es mi perra' });
      const rows = await requestRows(engine, luna.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'CLAIM_CO_OWNERSHIP', status: 'PENDING', requesterUserId: ANDRES, chipLast4: last4(CHIP_A) });
      expect(await codeOfChip(cases(engine.deps).ownership(ANDRES, luna.id))).toBe('ERR-PET-NOT-FOUND');
    });

    it('[SC-012-017] aprobada con tope libre el solicitante pasa a co-propietario ACTIVE; con el tope superado da ERR-OWN12-CO-OWNER-LIMIT', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      await new mod.CreateChipClaimUseCase(engine.deps).execute(ANDRES, { microchipId: CHIP_A });
      const [request] = await requestRows(engine, luna.id);
      expect(await codeOfChip(cases(engine.deps).approve(MARIA, String(request!['id'])))).toBe('OK');
      expect((await cases(engine.deps).ownership(ANDRES, luna.id)) as unknown).toMatchObject({ role: 'CO_OWNER' });
    });

    it('[SC-012-018] tras un rechazo, reintentar el MISMO chip antes de CHIP_CLAIM_COOLDOWN_DAYS (30) da ERR-CHP12-CLAIM-COOLDOWN; pasados 30 días se admite', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      engine.setNow('2026-11-26T10:00:00.000Z');
      const claim = new mod.CreateChipClaimUseCase(engine.deps);
      await claim.execute(ANDRES, { microchipId: CHIP_A });
      const [request] = await requestRows(engine, luna.id);
      await cases(engine.deps).reject(MARIA, String(request!['id']));
      expect(await codeOfChip(claim.execute(ANDRES, { microchipId: CHIP_A }))).toBe('ERR-CHP12-CLAIM-COOLDOWN');
      engine.setNow('2026-12-27T10:00:01.000Z');
      expect(await codeOfChip(claim.execute(ANDRES, { microchipId: CHIP_A }))).toBe('OK');
    });

    it('[SC-012-079] el ancla (chip, solicitante) sobrevive a la eliminación de la mascota: el enfriamiento y la reserva siguen y la respuesta es el MISMO 202', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      const claim = new mod.CreateChipClaimUseCase(engine.deps);
      await claim.execute(ANDRES, { microchipId: CHIP_A });
      const [request] = await requestRows(engine, luna.id);
      await cases(engine.deps).reject(MARIA, String(request!['id']));
      await engine.run((r) => r.pets.delete(luna.id));
      expect(await codeOfChip(claim.execute(ANDRES, { microchipId: CHIP_A }))).toBe('ERR-CHP12-CLAIM-COOLDOWN');
    });

    it('[SC-012-081] «mis solicitudes» lista solo filas reales y propias con chipLast4, nunca el chip completo ni datos del otro dueño', async () => {
      const mod = await loadChipModule<ClaimModule>('chip-claim-use-cases');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      await new mod.CreateChipClaimUseCase(engine.deps).execute(ANDRES, { microchipId: CHIP_A });
      await new mod.CreateChipClaimUseCase(engine.deps).execute(ANDRES, { microchipId: CHIP_FREE }); // chip libre: 202 sin fila
      const mine = await new mod.ListMyChipRequestsUseCase(engine.deps).execute(ANDRES);
      expect(mine).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toContain(CHIP_A);
      expect(mine[0]).toMatchObject({ chipLast4: last4(CHIP_A), status: 'PENDING' });
      expect(JSON.stringify(mine)).not.toMatch(/Luna|maria/i);
    });
  });
}
