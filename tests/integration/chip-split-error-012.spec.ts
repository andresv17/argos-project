import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase, UpdatePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, CHIP_FREE, codeOfChip, loadChipModule } from '../fixtures/chip-012.ts';

/**
 * T1634 (Feature 012, Bloque B, #23) PRUEBAS ROJAS del split de error y del comprobador único de unicidad y reserva del chip (T1635, T1646). ROJAS porque `chip-uniqueness.ts` aún no existe
 * (`assertMicrochipAvailable`, el ÚNICO comprobador usado por toda ruta que escribe `pets.microchip_id`) y porque `repositories.ownerRequests` aún no expone la consulta de reserva por `chipHmac`.
 *
 * @implements REQ-CHP12-001, REQ-CHP12-002, REQ-CHP12-006, INV-CHP12-001, INV-CHP12-002, INV-CHP12-009, NFR-012-006
 * Cubre SC-012-013, SC-012-014, SC-012-015, SC-012-023, SC-012-024, SC-012-096.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const PET = (name: string, microchipId?: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', ...(microchipId === undefined ? {} : { microchipId }) });
interface Uniqueness { assertMicrochipAvailable(deps: unknown, repositories: unknown, actorUserId: string, chip: string): Promise<void> }

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1634 split de error del microchip (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-013] un chip de OTRA cuenta da 409 ERR-CHP12-MICROCHIP-REGISTERED al crear; el del MISMO dueño sigue dando ERR-PET-MICROCHIP-DUPLICATE (split de E-04)', async () => {
      await loadChipModule<Uniqueness>('chip-uniqueness');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Luna', CHIP_A));
      expect(await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, PET('Rocky', CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      expect(await codeOfChip(new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Otra', CHIP_A)))).toBe('ERR-PET-MICROCHIP-DUPLICATE');
    });

    it('[SC-012-013][INV-CHP12-001] la mascota FALLECIDA de otra cuenta sigue ocupando el chip: consulta todas las filas, incluidas las fallecidas', async () => {
      await loadChipModule<Uniqueness>('chip-uniqueness');
      engine = await factory.make();
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Luna', CHIP_A));
      await new UpdatePetUseCase(engine.deps).execute(MARIA, luna.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-11-01' }, luna.version ?? null);
      expect(await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, PET('Rocky', CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
    });

    it('[SC-012-014][P-15] chip libre y chip ocupado por otra cuenta ejecutan llamadas al repositorio ESTRUCTURALMENTE idénticas (espías; la latencia no se mide)', async () => {
      await loadChipModule<Uniqueness>('chip-uniqueness');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Luna', CHIP_A));
      const calls = async (chip: string): Promise<string[]> => {
        const log: string[] = [];
        const spied = await engine!.run(async (r) => new Proxy(r as object, { get: (t, k) => { const v = (t as Record<PropertyKey, unknown>)[k]; return typeof v === 'object' && v !== null ? new Proxy(v, { get: (tt, kk) => { const f = (tt as Record<PropertyKey, unknown>)[kk]; return typeof f === 'function' ? (...a: unknown[]) => { log.push(`${String(k)}.${String(kk)}`); return (f as (...x: unknown[]) => unknown).apply(tt, a); } : f; } }) : v; } }));
        const mod = await loadChipModule<Uniqueness>('chip-uniqueness');
        await codeOfChip(mod.assertMicrochipAvailable(engine!.deps, spied, ANDRES, chip));
        return log;
      };
      const free = await calls(CHIP_FREE);
      const taken = await calls(CHIP_A);
      expect(taken).toEqual(free);
      expect(free).toContain('ownerRequests.hasOpenChipReservation'); // la consulta de reserva SIEMPRE se ejecuta (INV-CHP12-009)
    });

    it('[SC-012-015] corregir un error de tipeo a un chip libre crea la mascota y no deja rastro de solicitud', async () => {
      await loadChipModule<Uniqueness>('chip-uniqueness');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Luna', CHIP_A));
      expect(await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, PET('Rocky', CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      expect(await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, PET('Rocky', CHIP_FREE)))).toBe('OK');
      const rows = await engine.run((r) => r.ownerRequests.listByPet('00000000-0000-4000-8000-000000000000'));
      expect(rows).toHaveLength(0);
    });

    it('[SC-012-096] la edición de un chip a uno ocupado por otra cuenta da el 409 del split (el reclamante ajeno no lee la mascota: 404); la reserva por disputa abierta se prueba en chip-dispute-012', async () => {
      await loadChipModule<Uniqueness>('chip-uniqueness');
      engine = await factory.make();
      await new RegisterPetUseCase(engine.deps).execute(MARIA, PET('Luna', CHIP_A));
      const rocky = await new RegisterPetUseCase(engine.deps).execute(ANDRES, PET('Rocky'));
      expect(await codeOfChip(new UpdatePetUseCase(engine.deps).execute(ANDRES, rocky.id, { microchipId: CHIP_A }, rocky.version ?? null))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      expect(await codeOfChip(new UpdatePetUseCase(engine.deps).execute(CARLOS, rocky.id, { microchipId: CHIP_A }, rocky.version ?? null))).toBe('ERR-PET-NOT-FOUND');
    });
  });
}
