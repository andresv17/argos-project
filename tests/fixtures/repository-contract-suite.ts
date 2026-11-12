import { describe, expect, it } from 'vitest';
import type { PetProfile } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import type { RepositorySet, UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { SessionRecord } from '../../src/domain/auth/auth-policies.ts';
import { ANDRES_PETS as ANDRES_PETS_001, HOUSEHOLD, LUNA as LUNA_001, MEMBERSHIPS, envelope as envelope001, fixtures } from './application-harness.ts';
import { envelopePets, upgradeEnvelope, upgradePet } from './storage-upgrade.ts';

/**
 * Suite de contratos de los puertos de repositorio (INV-ARCH-005). la ejecuta con los repositorios en
 * memoria; debe ejecutarla también con SQLite. Cada prueba parte de una unidad de trabajo vacía.
 *: los registros se guardan después de su mascota, porque SQLite exige la referencia (INV-PET-005).
 */
const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES: UserAccount = account(fixtures.users[0], 'h-andres');
const MARIA: UserAccount = account(fixtures.users[1], 'h-maria');
// Los datos de la 001 se elevan al esquema 3.0.0 para que SQLite los valide (T214; T226 y T255 los sustituyen).
const envelope = upgradeEnvelope(envelope001);
const ANDRES_PETS = ANDRES_PETS_001.map(upgradePet);
const LUNA = upgradePet(LUNA_001);
const ENVELOPE_PETS = envelopePets(envelope);
const ARGOS = ANDRES_PETS[0]!;
const NOW = '2026-11-05T12:00:00.000Z';
const SESSION: SessionRecord = { userId: ANDRES.id, createdAt: NOW, lastActivityAt: NOW, revokedAt: null };
const at = (offsetMs: number) => new Date(Date.parse(NOW) + offsetMs).toISOString();
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
  const seed2 = <T>(uow: UnitOfWorkPort, work: (r: RepositorySet) => Promise<T>) => uow.runInTransaction(work);

  describe(`suite de contratos de repositorio (${adapterName})`, () => {
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
          r.confirmationTokens.consume(ANDRES.id, 'h', NOW),
          r.rateLimits.countSince('INVITE', ANDRES.id, NOW),
          r.invitations.findOpen(HOUSEHOLD.id, 'x'),
          r.users.countReferences(ANDRES.id),
        ];
        expect(results.map((p) => p instanceof Promise)).toEqual([true, true, true, true, true, true, true, true, true, true]);
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
        for (const pet of ENVELOPE_PETS) await r.pets.save(pet);
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
        for (const pet of ENVELOPE_PETS) await r.pets.save(pet);
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
        // H-T249-2: household_members solo admite ACTIVE, LEFT y REMOVED; Carlos (INVITED en el fixture 001) se guarda ACTIVE y luego pasa a LEFT.
        const carlosActive: HouseholdMember = { ...MEMBERSHIPS[2]!, status: 'ACTIVE' };
        for (const m of [MEMBERSHIPS[0]!, MEMBERSHIPS[1]!, carlosActive, otherOwner]) await r.households.saveMembership(m);
        await r.households.saveMembership({ ...carlosActive, status: 'LEFT' });
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
        carlos: ['LEFT'],
      });
      expect(await rejection(seed(uow, (r) => r.households.insert(HOUSEHOLD)))).not.toBe('resolved');
      await seed(uow, (r) => r.households.deleteWithMemberships(HOUSEHOLD.id));
      const after = await read(uow, async (r) => [await r.households.findById(HOUSEHOLD.id), await r.households.listMemberships(HOUSEHOLD.id), (await r.households.findById(other.id))!.name, (await r.households.listMemberships(other.id)).length]);
      expect(after).toEqual([null, [], 'Otro', 1]);
    });

    it('[INV-AUTH-003][REQ-ACC-001] usuarios: email, idioma y zona horaria viajan completos; update reemplaza perfil y hash; delete borra solo esa cuenta', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.users.update({ ...MARIA, displayName: 'María V.', email: 'maria@example.com', preferredLanguage: 'pt', timezone: 'Europe/Madrid', passwordHash: 'h-nuevo' });
      });
      const [maria, andres] = await read(uow, async (r) => [await r.users.findById(MARIA.id), await r.users.findById(ANDRES.id)]);
      expect([maria, andres]).toEqual([{ ...MARIA, displayName: 'María V.', email: 'maria@example.com', preferredLanguage: 'pt', timezone: 'Europe/Madrid', passwordHash: 'h-nuevo' }, ANDRES]);
      expect(await rejection(seed(uow, (r) => r.users.update({ ...MARIA, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66', username: 'otro.mas' })))).not.toBe('resolved');
      await seed(uow, (r) => r.users.delete(MARIA.id));
      expect(await read(uow, async (r) => [await r.users.findById(MARIA.id), (await r.users.findById(ANDRES.id))?.username])).toEqual([null, 'andres']);
    });

    it('[INV-AUTH2-002][REQ-AUTH2-003] sesiones: lastActivityAt se guarda y se renueva; revokeOthers revoca las demás sesiones vigentes del usuario y conserva la actual; deleteByUser borra solo las suyas', async () => {
      const uow = createUnitOfWork();
      const maria: UserAccount = MARIA;
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(maria);
        await r.sessions.save('actual', SESSION);
        await r.sessions.save('otra', SESSION);
        await r.sessions.save('cerrada', { ...SESSION, revokedAt: at(1000) });
        await r.sessions.save('ajena', { ...SESSION, userId: maria.id });
        await r.sessions.save('actual', { ...SESSION, lastActivityAt: at(60_000) });
      });
      expect(await read(uow, (r) => r.sessions.findByToken('actual'))).toEqual({ ...SESSION, lastActivityAt: at(60_000) });
      const revoked = await seed2(uow, (r) => r.sessions.revokeOthers(ANDRES.id, 'actual', at(120_000)));
      const state = await read(uow, async (r) => Promise.all(['actual', 'otra', 'cerrada', 'ajena'].map((t) => r.sessions.findByToken(t))));
      expect(revoked).toBe(1);
      expect(state.map((x) => x?.revokedAt)).toEqual([null, at(120_000), at(1000), null]);
      await seed(uow, (r) => r.sessions.deleteByUser(ANDRES.id));
      expect(await read(uow, async (r) => Promise.all(['actual', 'otra', 'cerrada', 'ajena'].map(async (t) => (await r.sessions.findByToken(t)) !== null)))).toEqual([false, false, false, true]);
    });

    it('[INV-AUTH-005] intentos de login: deleteFailures borra los fallos del username', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.loginAttempts.replaceFailures('maria.v', ['a']);
        await r.loginAttempts.replaceFailures('andres', ['b']);
        await r.loginAttempts.deleteFailures('maria.v');
      });
      expect(await read(uow, async (r) => [await r.loginAttempts.listFailures('maria.v'), await r.loginAttempts.listFailures('andres')])).toEqual([[], ['b']]);
    });

    it('[REQ-ACC-002][INV-AUTH-003] tokens de confirmación: uno por usuario (el nuevo reemplaza al anterior), consumo condicional de un solo uso, caducidad exacta y ligado al usuario', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.confirmationTokens.replaceForUser(ANDRES.id, 'hash-a1', NOW, at(600_000));
        await r.confirmationTokens.replaceForUser(ANDRES.id, 'hash-a2', NOW, at(600_000));
        await r.confirmationTokens.replaceForUser(MARIA.id, 'hash-m1', NOW, at(600_000));
      });
      const attempts = await seed2(uow, async (r) => [
        await r.confirmationTokens.consume(ANDRES.id, 'hash-a1', at(1000)),
        await r.confirmationTokens.consume(ANDRES.id, 'hash-m1', at(1000)),
        await r.confirmationTokens.consume(MARIA.id, 'hash-m1', at(600_000)),
        await r.confirmationTokens.consume(ANDRES.id, 'hash-a2', at(599_999)),
        await r.confirmationTokens.consume(ANDRES.id, 'hash-a2', at(599_999)),
      ]);
      expect(attempts).toEqual([false, false, false, true, false]);
      await seed(uow, (r) => r.confirmationTokens.deleteForUser(MARIA.id));
      expect(await seed2(uow, (r) => r.confirmationTokens.consume(MARIA.id, 'hash-m1', at(1000)))).toBe(false);
    });

    it('[INV-ARCH-005] un consumo de token dentro de una transacción que falla se revierte y el token sigue vigente', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.confirmationTokens.replaceForUser(ANDRES.id, 'hash-a1', NOW, at(600_000));
      });
      const outcome = await rejection(
        uow.runInTransaction(async (r) => {
          expect(await r.confirmationTokens.consume(ANDRES.id, 'hash-a1', at(1000))).toBe(true);
          throw new Error('fallo posterior');
        }),
      );
      expect(outcome).toBe('fallo posterior');
      expect(await seed2(uow, (r) => r.confirmationTokens.consume(ANDRES.id, 'hash-a1', at(2000)))).toBe(true);
    });

    it('[ERR-RATE-LIMITED] eventos de frecuencia: countSince cuenta por ámbito y usuario con ventana abierta por la izquierda, y deleteForUser los borra', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.rateLimits.record({ id: 'e1000000-0000-4000-8000-000000000001', scope: 'INVITE', userId: ANDRES.id, occurredAt: at(0) });
        await r.rateLimits.record({ id: 'e1000000-0000-4000-8000-000000000002', scope: 'INVITE', userId: ANDRES.id, occurredAt: at(60_000) });
        await r.rateLimits.record({ id: 'e1000000-0000-4000-8000-000000000003', scope: 'EXPORT', userId: ANDRES.id, occurredAt: at(60_000) });
        await r.rateLimits.record({ id: 'e1000000-0000-4000-8000-000000000004', scope: 'INVITE', userId: MARIA.id, occurredAt: at(60_000) });
      });
      const counts = await read(uow, async (r) => [
        await r.rateLimits.countSince('INVITE', ANDRES.id, at(-1)),
        await r.rateLimits.countSince('INVITE', ANDRES.id, at(0)),
        await r.rateLimits.countSince('INVITE', ANDRES.id, at(60_000)),
        await r.rateLimits.countSince('EXPORT', ANDRES.id, at(0)),
        await r.rateLimits.countSince('INVITE', MARIA.id, at(0)),
      ]);
      expect(counts).toEqual([2, 1, 0, 1, 1]);
      await seed(uow, (r) => r.rateLimits.deleteForUser(ANDRES.id));
      expect(await read(uow, async (r) => [await r.rateLimits.countSince('INVITE', ANDRES.id, at(-1)), await r.rateLimits.countSince('INVITE', MARIA.id, at(-1))])).toEqual([0, 1]);
    });

    it('[REQ-HOUSE2-001][INV-HOUSE-003] invitaciones: la inerte no tiene usuario, solo hay una INVITED por hogar y username, y deleteForUser / deleteForHousehold las retiran', async () => {
      const uow = createUnitOfWork();
      const invitation = (n: number, username: string, inviteeUserId: string | null, status: 'INVITED' | 'DECLINED' = 'INVITED') => ({
        invitationId: `e2000000-0000-4000-8000-00000000000${n}`,
        householdId: HOUSEHOLD.id,
        inviteeUsername: username,
        inviteeUserId,
        roleOnJoin: 'READER' as const,
        invitedByUserId: ANDRES.id,
        status,
        createdAt: NOW,
        respondedAt: status === 'INVITED' ? null : at(1000),
      });
      await seed(uow, async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.households.insert(HOUSEHOLD);
        await r.invitations.save(invitation(1, 'maria.v', MARIA.id));
        await r.invitations.save(invitation(2, 'nadie.x', null));
        await r.invitations.save(invitation(3, 'otra.x', null, 'DECLINED'));
      });
      const open = await read(uow, async (r) => [await r.invitations.findOpen(HOUSEHOLD.id, 'maria.v'), await r.invitations.findOpen(HOUSEHOLD.id, 'nadie.x'), await r.invitations.findOpen(HOUSEHOLD.id, 'otra.x')]);
      expect(open).toEqual([invitation(1, 'maria.v', MARIA.id), invitation(2, 'nadie.x', null), null]);
      expect(await rejection(seed(uow, (r) => r.invitations.save(invitation(4, 'nadie.x', null))))).not.toBe('resolved');
      await seed(uow, (r) => r.invitations.save({ ...invitation(2, 'nadie.x', null), status: 'CANCELLED', respondedAt: at(2000) }));
      await seed(uow, (r) => r.invitations.save(invitation(5, 'nadie.x', null)));
      expect((await read(uow, (r) => r.invitations.listByHousehold(HOUSEHOLD.id))).map((i) => `${i.inviteeUsername}:${i.status}`).sort()).toEqual(['maria.v:INVITED', 'nadie.x:CANCELLED', 'nadie.x:INVITED', 'otra.x:DECLINED']);
      await seed(uow, (r) => r.invitations.deleteForUser(MARIA.id));
      expect((await read(uow, (r) => r.invitations.listByHousehold(HOUSEHOLD.id))).map((i) => i.inviteeUsername).sort()).toEqual(['nadie.x', 'nadie.x', 'otra.x']);
      await seed(uow, (r) => r.invitations.deleteForHousehold(HOUSEHOLD.id));
      expect(await read(uow, (r) => r.invitations.listByHousehold(HOUSEHOLD.id))).toEqual([]);
    });

    it('[REQ-ACC-002] households.deleteMembershipsOfUser borra las filas del usuario en todos los hogares y countReferences llega a 0 cuando no queda nada que lo referencie', async () => {
      const uow = createUnitOfWork();
      await seed(uow, async (r) => {
        await r.users.insert(MARIA);
        await r.households.insert(HOUSEHOLD);
        // H-T249-2: la fila INVITED del fixture 001 vive en household_invitations, no en household_members.
        for (const m of MEMBERSHIPS.filter((x) => x.status !== 'INVITED')) await r.households.saveMembership(m);
        await r.sessions.save('s', { ...SESSION, userId: MARIA.id });
        await r.confirmationTokens.replaceForUser(MARIA.id, 'h', NOW, at(600_000));
        await r.rateLimits.record({ id: 'e1000000-0000-4000-8000-000000000001', scope: 'EXPORT', userId: MARIA.id, occurredAt: NOW });
      });
      expect(await read(uow, (r) => r.users.countReferences(MARIA.id))).toBeGreaterThanOrEqual(4);
      await seed(uow, async (r) => {
        await r.households.deleteMembershipsOfUser(MARIA.id);
        await r.sessions.deleteByUser(MARIA.id);
        await r.confirmationTokens.deleteForUser(MARIA.id);
        await r.rateLimits.deleteForUser(MARIA.id);
      });
      expect(await read(uow, (r) => r.users.countReferences(MARIA.id))).toBe(1);
      await seed(uow, (r) => r.users.delete(MARIA.id));
      expect(await read(uow, async (r) => [await r.users.countReferences(MARIA.id), (await r.households.listMemberships(HOUSEHOLD.id)).some((m) => m.userId === MARIA.id)])).toEqual([0, false]);
    });
  });
}
