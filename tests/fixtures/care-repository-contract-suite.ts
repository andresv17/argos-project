import { afterEach, describe, expect, it } from 'vitest';
import type { UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkFactory, ContractSuiteOptions } from './repository-contract-suite.ts';
import { ANDRES_PETS as ANDRES_PETS_001, fixtures } from './application-harness.ts';
import { upgradePet } from './storage-upgrade.ts';

/**
 * Suite de contratos de los tres puertos de cuidado (feature 012, Bloque C; T1655 tramo 2, F7 del oráculo): `careRoutines`, `careLog` y `caregiverAccess`.
 * La ejecutan memoria, SQLite y PostgreSQL (INV-ARCH-005). Cada prueba parte de una unidad de trabajo vacía.
 *
 * ROJO hasta T1655 tramo 2: los repositorios aún no existen. Los nombres de método son los SUPUESTOS por esta suite (insert/update/findById/listByPet/countActive/findActiveByOccurrence/upsert/remove);
 * las firmas finales se registran en el puerto y esta suite se ajusta con el mismo comportamiento. Filas en camelCase.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, SC-012-031, SC-012-037, SC-012-076, INV-ARCH-005
 */
const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const ARGOS = upgradePet(ANDRES_PETS_001[0]!);
const OTRA = { ...upgradePet(ANDRES_PETS_001[1] ?? ANDRES_PETS_001[0]!), id: 'f0000000-0000-4000-8000-0000000000c9', microchipId: null, name: 'Otra' };
const T0 = '2026-11-26T05:00:00.000Z';
const rid = (n: number) => `f0000000-0000-4000-8000-0000000012${String(n).padStart(2, '0')}`;
const lid = (n: number) => `f0000000-0000-4000-8000-0000000013${String(n).padStart(2, '0')}`;

type Row = Record<string, unknown>;
const routine = (n: number, over: Row = {}): Row => ({
  id: rid(n), seriesId: rid(n), petId: ARGOS.id, kind: 'MEDICATION', title: `Rutina ${n}`, instructions: null, doseAmount: 250, doseUnit: 'MG', timesOfDay: ['08:00'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2026-11-20', endDate: '2026-12-04', ongoing: false, active: true, effectiveFrom: T0, effectiveTo: null, supersedesRoutineId: null, version: 1, createdByUserId: ANDRES.id, createdAt: T0, updatedAt: T0, ...over,
});
const entry = (n: number, over: Row = {}): Row => ({
  id: lid(n), petId: ARGOS.id, routineId: rid(1), seriesId: rid(1), occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE', note: null, late: false, performedByUserId: MARIA.id, performedAt: `2026-11-26T13:0${n}:00.000Z`,
  doseAmountAtTime: 250, doseUnitAtTime: 'MG', revertedAt: null, revertedByUserId: null, revertReason: null, ...over,
});
const access = (userId: string, over: Row = {}): Row => ({ petId: ARGOS.id, userId, level: 'BASIC_LOG', careUntil: null, grantedByUserId: ANDRES.id, grantedAt: T0, version: 1, ...over });

type CareRepos = {
  careRoutines: { insert(r: Row): Promise<void>; update(r: Row): Promise<void>; findById(petId: string, id: string): Promise<Row | null>; listByPet(petId: string): Promise<Row[]>; countActive(petId: string): Promise<number> };
  careLog: { insert(r: Row): Promise<void>; update(r: Row): Promise<void>; findById(petId: string, id: string): Promise<Row | null>; listByPet(petId: string): Promise<Row[]>; findActiveByOccurrence(seriesId: string, date: string, time: string): Promise<Row | null> };
  caregiverAccess: { upsert(r: Row): Promise<void>; find(petId: string, userId: string): Promise<Row | null>; listByPet(petId: string): Promise<Row[]>; remove(petId: string, userId: string): Promise<boolean> };
};

export function defineCareRepositoryContractSuite(adapterName: string, createUnitOfWork: UnitOfWorkFactory, options: ContractSuiteOptions = {}): void {
  describe(`suite de contratos de repositorios de cuidado (${adapterName})`, () => {
    if (options.dispose) afterEach(async () => options.dispose!());

    const prepare = async () => {
      const uow = await createUnitOfWork();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.pets.save(ARGOS);
        await r.pets.save(OTRA);
      });
      const run = <T>(work: (r: CareRepos) => Promise<T>): Promise<T> => uow.runInTransaction((r) => work(r as unknown as CareRepos));
      return run;
    };

    it('[INV-ARCH-005] careRoutines: insert/findById/listByPet devuelven filas camelCase aisladas por mascota y countActive no cuenta versiones sustituidas', async () => {
      const run = await prepare();
      await run(async (r) => {
        await r.careRoutines.insert(routine(1));
        await r.careRoutines.insert(routine(2, { seriesId: rid(2) }));
        await r.careRoutines.insert(routine(3, { petId: OTRA.id }));
      });
      const out = await run(async (r) => ({ one: await r.careRoutines.findById(ARGOS.id, rid(1)), cross: await r.careRoutines.findById(OTRA.id, rid(1)), list: await r.careRoutines.listByPet(ARGOS.id), active: await r.careRoutines.countActive(ARGOS.id) }));
      expect(out.one).toMatchObject({ id: rid(1), seriesId: rid(1), timesOfDay: ['08:00'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7], doseAmount: 250, doseUnit: 'MG', active: true, version: 1 });
      expect(out.cross).toBeNull();
      expect(out.list.map((x) => x['id']).sort()).toEqual([rid(1), rid(2)]);
      expect(out.active).toBe(2);
      await run(async (r) => r.careRoutines.update(routine(1, { active: false, effectiveTo: '2026-11-26T15:00:00.000Z' })));
      expect(await run((r) => r.careRoutines.countActive(ARGOS.id))).toBe(1);
    });

    it('[SC-012-088] careRoutines: dosis con 3 decimales y tope 100000 viajan sin pérdida (NUMERIC(9,3))', async () => {
      const run = await prepare();
      await run(async (r) => {
        await r.careRoutines.insert(routine(1, { doseAmount: 0.001 }));
        await r.careRoutines.insert(routine(2, { doseAmount: 100000, seriesId: rid(2) }));
      });
      const list = await run((r) => r.careRoutines.listByPet(ARGOS.id));
      expect(list.map((x) => x['doseAmount']).sort((a, b) => Number(a) - Number(b))).toEqual([0.001, 100000]);
    });

    it('[SC-012-031] careLog: UNIQUE parcial por ocurrencia de la serie lógica: una segunda fila vigente falla; revertir la primera la libera', async () => {
      const run = await prepare();
      await run(async (r) => {
        await r.careRoutines.insert(routine(1));
        await r.careLog.insert(entry(1));
      });
      expect(await run((r) => r.careLog.insert(entry(2))).then(() => 'INSERTED', () => 'REJECTED')).toBe('REJECTED');
      expect((await run((r) => r.careLog.findActiveByOccurrence(rid(1), '2026-11-26', '08:00')))?.['id']).toBe(lid(1));
      await run((r) => r.careLog.update(entry(1, { revertedAt: '2026-11-26T13:05:00.000Z', revertedByUserId: MARIA.id })));
      expect(await run((r) => r.careLog.findActiveByOccurrence(rid(1), '2026-11-26', '08:00'))).toBeNull();
      await run((r) => r.careLog.insert(entry(2)));
      expect((await run((r) => r.careLog.listByPet(ARGOS.id))).map((x) => x['id']).sort()).toEqual([lid(1), lid(2)]);
    });

    it('[SC-012-076] careLog: performedByUserId NULL (autor seudonimizado) se lee como null; las filas no cruzan mascotas', async () => {
      const run = await prepare();
      await run(async (r) => {
        await r.careRoutines.insert(routine(1));
        await r.careLog.insert(entry(1, { performedByUserId: null }));
      });
      const out = await run(async (r) => ({ own: await r.careLog.findById(ARGOS.id, lid(1)), cross: await r.careLog.findById(OTRA.id, lid(1)) }));
      expect(out.own?.['performedByUserId']).toBeNull();
      expect(out.cross).toBeNull();
    });

    it('[SC-012-036] caregiverAccess: una fila por (mascota, usuario); upsert reemplaza el nivel; remove es idempotente (true y luego false)', async () => {
      const run = await prepare();
      await run((r) => r.caregiverAccess.upsert(access(MARIA.id)));
      await run((r) => r.caregiverAccess.upsert(access(MARIA.id, { level: 'VIEW_ONLY', careUntil: '2026-11-30', version: 2 })));
      expect(await run((r) => r.caregiverAccess.find(ARGOS.id, MARIA.id))).toMatchObject({ level: 'VIEW_ONLY', careUntil: '2026-11-30', version: 2 });
      expect(await run((r) => r.caregiverAccess.listByPet(ARGOS.id))).toHaveLength(1);
      expect(await run((r) => r.caregiverAccess.find(OTRA.id, MARIA.id))).toBeNull();
      expect(await run((r) => r.caregiverAccess.remove(ARGOS.id, MARIA.id))).toBe(true);
      expect(await run((r) => r.caregiverAccess.remove(ARGOS.id, MARIA.id))).toBe(false);
      expect(await run((r) => r.caregiverAccess.listByPet(ARGOS.id))).toEqual([]);
    });
  });
}
