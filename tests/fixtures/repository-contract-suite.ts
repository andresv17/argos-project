import { describe, expect, it } from 'vitest';
import type { HouseholdMember, PetProfile } from '../../src/generated/index.ts';
import type { RepositorySet, UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { SessionRecord } from '../../src/domain/auth/auth-policies.ts';
import { ANDRES_PETS, HOUSEHOLD, LUNA, MEMBERSHIPS, envelope, fixtures } from './application-harness.ts';

/**
 * Suite de contratos de los puertos de repositorio (INV-ARCH-005). TASK-108 la ejecuta con los repositorios en
 * memoria; TASK-110 debe ejecutarla también con SQLite. Cada prueba parte de una unidad de trabajo vacía.
 * TASK-110: los registros se guardan después de su mascota, porque SQLite exige la referencia (INV-PET-005).
 */
const ANDRES: UserAccount = { ...fixtures.users[0], passwordHash: 'h-andres' };
const MARIA: UserAccount = { ...fixtures.users[1], passwordHash: 'h-maria' };
const ARGOS = ANDRES_PETS[0]!;
const SESSION: SessionRecord = { userId: ANDRES.id, createdAt: '2026-11-05T12:00:00.000Z', expiresAt: '2026-11-12T12:00:00.000Z', revokedAt: null };
const sortedIds = (items: ReadonlyArray<{ id: string }>) => items.map((i) => i.id).sort();
const sortedMemberships = (items: readonly HouseholdMember[]) => items.map((m) => m.membershipId).sort();

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'resolved';
}

export function defineRepositoryContractSuite(adapterName: string, createUnitOfWork: () => UnitOfWorkPort): void {
  const seed = async (uow: UnitOfWorkPort, work: (r: RepositorySet) => Promise<void>) => uow.runInTransaction(work);
  const read = <T>(uow: UnitOfWorkPort, work: (r: RepositorySet) => Promise<T>) => uow.runInTransaction(work);

  describe(`TASK-108: suite de contratos de repositorio (${adapterName})`, () => {
    it('[INV-ARCH-005] runInTransaction devuelve una Promise y cada operación de repositorio también', async () => {
      const uow = createUnitOfWork();
      const pending = uow.runInTransaction(async (r) => {
        const results = [
          r.users.findById(ANDRES.id),
          r.sessions.findByToken('t'),
          r.loginAttempts.listFailures('andres'),
          r.pets.findById(ARGOS.id),
          r.records.listForPet(ARGOS.id),
          r.households.findById(HOUSEHOLD.id),
        ];
        expect(results.map((p) => p instanceof Promise)).toEqual([true, true, true, true, true, true]);
        await Promise.all(results);
        return 'ok';
      });
      expect(pending instanceof Promise).toBe(true);
      await expect(pending).resolves.toBe('ok');
    });

    it('[INV-ARCH-005] una transacción que termina confirma todos sus cambios', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.pets.save(ARGOS);
        await r.records.add('weights', envelope.records.weights[0]!);
      });
      const [user, pet, records] = await read(uow, async (r) => [await r.users.findById(ANDRES.id), await r.pets.findById(ARGOS.id), await r.records.listForPet(ARGOS.id)] as const);
      expect([user, pet, records.weights]).toEqual([ANDRES, ARGOS, [envelope.records.weights[0]]]);
    });

    it('[INV-ARCH-005] si la transacción lanza, se descartan los cambios de todos los repositorios y se propaga el error original', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => r.users.insert(ANDRES));
      const failure = new Error('fallo a mitad de transacción');
      const outcome = await rejection(
        uow.runInTransaction(async (r) => {
          await r.pets.save(ARGOS);
          await r.records.add('weights', envelope.records.weights[0]!);
          await r.households.insert(HOUSEHOLD);
          await r.households.saveMembership(MEMBERSHIPS[0]!);
          await r.sessions.save('t1', SESSION);
          await r.loginAttempts.replaceFailures('andres', ['2026-11-05T12:00:00.000Z']);
          await r.users.insert(MARIA);
          throw failure;
        }),
      );
      expect(outcome).toBe('fallo a mitad de transacción');
      const after = await read(uow, async (r) => ({
        pet: await r.pets.findById(ARGOS.id),
        weights: (await r.records.listForPet(ARGOS.id)).weights,
        household: await r.households.findById(HOUSEHOLD.id),
        memberships: await r.households.listMemberships(HOUSEHOLD.id),
        session: await r.sessions.findByToken('t1'),
        failures: await r.loginAttempts.listFailures('andres'),
        maria: await r.users.findById(MARIA.id),
        andres: await r.users.findById(ANDRES.id),
      }));
      expect(after).toEqual({ pet: null, weights: [], household: null, memberships: [], session: null, failures: [], maria: null, andres: ANDRES });
    });

    it('[INV-ARCH-005] las transacciones concurrentes no se mezclan: la segunda ve lo que confirmó la primera', async () => {
      const uow = createUnitOfWork();
      const first = uow.runInTransaction(async (r) => {
        await r.loginAttempts.replaceFailures('andres', ['2026-11-05T12:00:00.000Z']);
        await Promise.resolve();
        return r.loginAttempts.listFailures('andres');
      });
      const second = uow.runInTransaction(async (r) => {
        const seen = await r.loginAttempts.listFailures('andres');
        await r.loginAttempts.replaceFailures('andres', [...seen, '2026-11-05T12:00:01.000Z']);
        return seen;
      });
      expect(await Promise.all([first, second])).toEqual([['2026-11-05T12:00:00.000Z'], ['2026-11-05T12:00:00.000Z']]);
      expect(await read(uow, (r) => r.loginAttempts.listFailures('andres'))).toEqual(['2026-11-05T12:00:00.000Z', '2026-11-05T12:00:01.000Z']);
    });

    it('[INV-ARCH-005] modificar un objeto devuelto o guardado no altera lo persistido', async () => {
      const uow = createUnitOfWork();
      const pet: PetProfile = { ...ARGOS };
      await seed(uow, async (r) => {
        await r.pets.save(pet);
        (pet as { name: string }).name = 'Cambiado tras guardar';
      });
      await read(uow, async (r) => {
        const loaded = (await r.pets.findById(ARGOS.id))!;
        (loaded as { name: string }).name = 'Cambiado tras leer';
      });
      expect((await read(uow, (r) => r.pets.findById(ARGOS.id)))!.name).toBe('Argos');
    });

    it('[INV-ARCH-005] usuarios: búsqueda por id, username exacto y lista; id o username repetidos se rechazan', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
      });
      const found = await read(uow, async (r) => ({
        byId: await r.users.findById(MARIA.id),
        byUsername: await r.users.findByUsername('andres'),
        otherCase: await r.users.findByUsername('ANDRES'),
        missing: await r.users.findById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99'),
        list: sortedIds(await r.users.listByIds([MARIA.id, ANDRES.id, 'x'])),
      }));
      expect(found).toEqual({ byId: MARIA, byUsername: ANDRES, otherCase: null, missing: null, list: [ANDRES.id, MARIA.id].sort() });
      expect(await rejection(seed(uow, (r) => r.users.insert({ ...MARIA, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa77' })))).not.toBe('resolved');
      expect(await rejection(seed(uow, (r) => r.users.insert({ ...MARIA, username: 'otro' })))).not.toBe('resolved');
    });

    it('[INV-ARCH-005] sesiones e intentos de login: guardar reemplaza y la lectura devuelve lo último guardado', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.sessions.save('t1', SESSION);
        await r.sessions.save('t1', { ...SESSION, revokedAt: '2026-11-05T13:00:00.000Z' });
        await r.loginAttempts.replaceFailures('maria.v', ['a', 'b']);
        await r.loginAttempts.replaceFailures('maria.v', ['c']);
      });
      const result = await read(uow, async (r) => [await r.sessions.findByToken('t1'), await r.sessions.findByToken('t2'), await r.loginAttempts.listFailures('maria.v'), await r.loginAttempts.listFailures('nadie')]);
      expect(result).toEqual([{ ...SESSION, revokedAt: '2026-11-05T13:00:00.000Z' }, null, ['c'], []]);
    });

    it('[INV-ARCH-005] mascotas: save inserta o reemplaza, listByOwners filtra por dueño y delete borra', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        for (const pet of [...ANDRES_PETS, LUNA]) await r.pets.save(pet);
        await r.pets.save({ ...ARGOS, name: 'Argos II' });
        await r.pets.delete(ANDRES_PETS[1]!.id);
      });
      const result = await read(uow, async (r) => ({
        argos: (await r.pets.findById(ARGOS.id))!.name,
        deleted: await r.pets.findById(ANDRES_PETS[1]!.id),
        andres: sortedIds(await r.pets.listByOwners([ANDRES.id])),
        both: (await r.pets.listByOwners([ANDRES.id, MARIA.id])).length,
        none: await r.pets.listByOwners([]),
      }));
      expect(result).toEqual({
        argos: 'Argos II',
        deleted: null,
        andres: sortedIds(ANDRES_PETS.filter((p) => p.id !== ANDRES_PETS[1]!.id)),
        both: ANDRES_PETS.length,
        none: [],
      });
    });

    it('[INV-ARCH-005] registros: listForPet devuelve las 6 colecciones de la mascota, add rechaza ids repetidos y deleteForPet borra solo esa mascota', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        for (const pet of envelope.pets) await r.pets.save(pet);
        for (const module of Object.keys(envelope.records) as Array<keyof typeof envelope.records>) {
          for (const record of envelope.records[module]) await r.records.add(module, record as never);
        }
      });
      const argosRecords = await read(uow, (r) => r.records.listForPet(ARGOS.id));
      const expected = Object.fromEntries(Object.entries(envelope.records).map(([m, list]) => [m, (list as Array<{ petId: string }>).filter((x) => x.petId === ARGOS.id)]));
      expect(argosRecords).toEqual(expected);
      expect(await rejection(seed(uow, (r) => r.records.add('weights', envelope.records.weights[0]!)))).not.toBe('resolved');
      await seed(uow, (r) => r.records.deleteForPet(ARGOS.id));
      const after = await read(uow, async (r) => [await r.records.listForPet(ARGOS.id), (await r.records.listForPet(envelope.records.dewormings[0]!.petId)).dewormings.length]);
      expect(after).toEqual([{ weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] }, 1]);
    });

    it('[INV-ARCH-005][INV-BACKUP-001] registros: findPetIdOfRecord devuelve el petId del registro en cualquiera de los 6 módulos y null si no existe', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        for (const pet of envelope.pets) await r.pets.save(pet);
        for (const module of Object.keys(envelope.records) as Array<keyof typeof envelope.records>) {
          for (const record of envelope.records[module]) await r.records.add(module, record as never);
        }
      });
      const all = Object.values(envelope.records).flat() as Array<{ id: string; petId: string }>;
      const found = await read(uow, async (r) => Promise.all(all.map((x) => r.records.findPetIdOfRecord(x.id))));
      expect(found).toEqual(all.map((x) => x.petId));
      expect(await read(uow, (r) => r.records.findPetIdOfRecord(ARGOS.id))).toBe(null);
      await seed(uow, (r) => r.records.deleteForPet(ARGOS.id));
      expect(await read(uow, (r) => r.records.findPetIdOfRecord(envelope.records.weights[0]!.id))).toBe(null);
    });

    it('[INV-ARCH-005] hogares: membresías por hogar y por usuarios, saveMembership reemplaza por membershipId y deleteWithMemberships borra ambos', async () => {
      const uow = createUnitOfWork();
      const other = { ...HOUSEHOLD, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', name: 'Otro' };
      const otherOwner: HouseholdMember = { ...MEMBERSHIPS[0]!, membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc09', householdId: other.id };
      await seed(uow, async (r) => {
        await r.households.insert(HOUSEHOLD);
        await r.households.insert(other);
        for (const m of [...MEMBERSHIPS, otherOwner]) await r.households.saveMembership(m);
        await r.households.saveMembership({ ...MEMBERSHIPS[2]!, status: 'DECLINED' });
      });
      const result = await read(uow, async (r) => ({
        ofHousehold: sortedMemberships(await r.households.listMemberships(HOUSEHOLD.id)),
        ofAndres: sortedMemberships(await r.households.listMembershipsOfUsers([ANDRES.id])),
        ofBoth: sortedMemberships(await r.households.listMembershipsOfUsers([ANDRES.id, MARIA.id, ANDRES.id])),
        carlos: (await r.households.listMembershipsOfUsers([MEMBERSHIPS[2]!.userId])).map((m) => m.status),
      }));
      expect(result).toEqual({
        ofHousehold: sortedMemberships(MEMBERSHIPS),
        ofAndres: sortedMemberships([MEMBERSHIPS[0]!, otherOwner]),
        ofBoth: sortedMemberships([MEMBERSHIPS[0]!, MEMBERSHIPS[1]!, otherOwner]),
        carlos: ['DECLINED'],
      });
      expect(await rejection(seed(uow, (r) => r.households.insert(HOUSEHOLD)))).not.toBe('resolved');
      await seed(uow, (r) => r.households.deleteWithMemberships(HOUSEHOLD.id));
      const after = await read(uow, async (r) => [await r.households.findById(HOUSEHOLD.id), await r.households.listMemberships(HOUSEHOLD.id), (await r.households.findById(other.id))!.name, (await r.households.listMemberships(other.id)).length]);
      expect(after).toEqual([null, [], 'Otro', 1]);
    });
  });
}
