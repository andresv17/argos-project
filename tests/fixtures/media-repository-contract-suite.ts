import { afterEach, describe, expect, it } from 'vitest';
import type { PetMediaRecord } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkFactory, ContractSuiteOptions } from './repository-contract-suite.ts';
import { ANDRES_PETS as ANDRES_PETS_001, fixtures } from './application-harness.ts';
import type { UserAccount } from '../../src/application/ports/repositories.port.ts';
import { upgradePet } from './storage-upgrade.ts';

/**
 * Suite de contratos de los repositorios de medios (T575; REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, INV-AVA-001, INV-ALB-001, REQ-ARC-005):
 * `media` (pet_media), `mediaQueue` (media_deletion_queue) y las operaciones de avatar de `pets`. La ejecutan memoria, SQLite y PostgreSQL.
 * Cada prueba parte de una unidad de trabajo vacía.
 */
const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const ARGOS = upgradePet(ANDRES_PETS_001[0]!);
const OTRA = { ...upgradePet(ANDRES_PETS_001[1] ?? ANDRES_PETS_001[0]!), id: 'f0000000-0000-4000-8000-0000000000c9', microchipId: null, name: 'Otra' };
const AJENA = { ...ARGOS, id: 'f0000000-0000-4000-8000-0000000000d9', ownerUserId: MARIA.id, microchipId: null, name: 'Ajena' };
const NOW = '2026-11-17T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const id = (n: number) => `f0000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`;

const media = (n: number, over: Partial<PetMediaRecord> = {}): PetMediaRecord => ({
  id: id(n), petId: ARGOS.id, kind: 'FILE', mime: 'application/pdf', sizeBytes: 100 * n, originalName: `n${n}.pdf`, createdAt: at(n), ...over,
});

export function defineMediaRepositoryContractSuite(adapterName: string, createUnitOfWork: UnitOfWorkFactory, options: ContractSuiteOptions = {}): void {
  describe(`suite de contratos de repositorios de medios (${adapterName})`, () => {
    if (options.dispose) afterEach(async () => options.dispose!());

    const prepare = async () => {
      const uow = await createUnitOfWork();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.pets.save(ARGOS);
        await r.pets.save(OTRA);
        await r.pets.save(AJENA);
      });
      return uow;
    };

    it('[REQ-GCS-005] insert y findById devuelven solo los metadatos, acotados por mascota', async () => {
      const uow = await prepare();
      const found = await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1));
        return [await r.media.findById(ARGOS.id, id(1)), await r.media.findById(OTRA.id, id(1)), await r.media.findById(ARGOS.id, id(2))] as const;
      });
      expect(found).toEqual([media(1), null, null]);
      expect(Object.keys(found[0]!).sort()).toEqual(['createdAt', 'id', 'kind', 'mime', 'originalName', 'petId', 'sizeBytes']);
    });

    it('[REQ-GCS-005] una fila para una mascota inexistente se rechaza (clave foránea)', async () => {
      const uow = await prepare();
      await expect(uow.runInTransaction((r) => r.media.insert(media(1, { petId: 'f0000000-0000-4000-8000-0000000000ee' })))).rejects.toThrow(/foreign key/i);
    });

    it('[REQ-ALB-001][INV-ALB-001] listPage ordena por (createdAt DESC, id DESC), filtra por tipo, pagina y cuenta el total', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        for (let n = 1; n <= 5; n += 1) await r.media.insert(media(n, { kind: 'PHOTO', mime: 'image/png', createdAt: n <= 3 ? at(1) : at(n) }));
        await r.media.insert(media(6, { kind: 'FILE' }));
        await r.media.insert(media(7, { petId: OTRA.id, kind: 'PHOTO' }));
      });
      const page = (kind: 'PHOTO' | 'FILE' | null, limit: number, offset: number) => uow.runInTransaction(async (r) => r.media.listPage(ARGOS.id, kind, limit, offset));
      // Orden: n5 (t5), n4 (t4), luego los tres del mismo instante por id descendente: n3, n2, n1.
      expect((await page('PHOTO', 2, 0)).items.map((m) => m.id)).toEqual([id(5), id(4)]);
      expect((await page('PHOTO', 2, 2)).items.map((m) => m.id)).toEqual([id(3), id(2)]);
      expect((await page('PHOTO', 2, 4)).items.map((m) => m.id)).toEqual([id(1)]);
      expect((await page('PHOTO', 2, 6))).toEqual({ items: [], total: 5 });
      expect((await page('FILE', 24, 0)).items.map((m) => m.id)).toEqual([id(6)]);
      expect((await page('FILE', 24, 0)).total).toBe(1);
      // Sin filtro de tipo se listan ambos, con el mismo orden.
      expect(await page(null, 3, 0)).toMatchObject({ total: 6, items: [{ id: id(6) }, { id: id(5) }, { id: id(4) }] });
    });

    it('[REQ-ALB5-002][INV-005-003] countByPetAndKind cuenta solo el tipo pedido de la mascota pedida; cero si no hay filas; baja al borrar', async () => {
      const uow = await prepare();
      const counts = await uow.runInTransaction(async (r) => {
        for (let n = 1; n <= 3; n += 1) await r.media.insert(media(n, { kind: 'PHOTO', mime: 'image/png' }));
        for (let n = 4; n <= 5; n += 1) await r.media.insert(media(n, { kind: 'FILE' }));
        await r.media.insert(media(6, { petId: OTRA.id, kind: 'PHOTO', mime: 'image/png' }));
        return [
          await r.media.countByPetAndKind(ARGOS.id, 'PHOTO'),
          await r.media.countByPetAndKind(ARGOS.id, 'FILE'),
          await r.media.countByPetAndKind(OTRA.id, 'PHOTO'),
          await r.media.countByPetAndKind(OTRA.id, 'FILE'),
          await r.media.countByPetAndKind('f0000000-0000-4000-8000-0000000000ee', 'PHOTO'),
        ];
      });
      expect(counts).toEqual([3, 2, 1, 0, 0]);
      const after = await uow.runInTransaction(async (r) => {
        await r.media.remove(ARGOS.id, id(1));
        return r.media.countByPetAndKind(ARGOS.id, 'PHOTO');
      });
      expect(after).toBe(2);
      expect(typeof after).toBe('number');
    });

    it('[REQ-ARC-005] countBytesOfOwner suma todas las mascotas del propietario y no cuenta las de otro ni el avatar', async () => {
      const uow = await prepare();
      const bytes = await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1, { sizeBytes: 1000 }));
        await r.media.insert(media(2, { sizeBytes: 2000, petId: OTRA.id }));
        await r.media.insert(media(3, { sizeBytes: 5000, petId: AJENA.id }));
        await r.pets.replaceAvatar(ARGOS.id, id(30));
        return [await r.media.countBytesOfOwner(ANDRES.id), await r.media.countBytesOfOwner(MARIA.id), await r.media.countBytesOfOwner('f0000000-0000-4000-8000-0000000000ff')] as const;
      });
      expect(bytes).toEqual([3000, 5000, 0]);
    });

    it('[REQ-GCS-004] remove borra solo la fila de esa mascota y devuelve si existía', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1));
        const wrongPet = await r.media.remove(OTRA.id, id(1));
        const first = await r.media.remove(ARGOS.id, id(1));
        const second = await r.media.remove(ARGOS.id, id(1));
        return [wrongPet, first, second, await r.media.findById(ARGOS.id, id(1))] as const;
      });
      expect(result).toEqual([false, true, false, null]);
    });

    it('[REQ-GCS-005][INV-PET-005] eliminar la mascota borra en cascada sus medios y no toca la cola', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1));
        await r.media.insert(media(2, { petId: OTRA.id }));
        await r.mediaQueue.enqueue(`pets/${ARGOS.id}/files/${id(1)}`, 'DELETE', NOW);
        await r.pets.delete(ARGOS.id);
      });
      const state = await uow.runInTransaction(async (r) => ({
        gone: await r.media.listPage(ARGOS.id, 'FILE', 24, 0),
        kept: await r.media.listPage(OTRA.id, 'FILE', 24, 0),
        queue: await r.mediaQueue.listPending(10),
      }));
      expect([state.gone.total, state.kept.total, state.queue.map((e) => e.objectKey)]).toEqual([0, 1, [`pets/${ARGOS.id}/files/${id(1)}`]]);
    });

    it('[INV-AVA-001][REQ-AVA-001] el avatar parte en versión 0 sin objeto; replaceAvatar solo crece y clearAvatar no reinicia la versión', async () => {
      const uow = await prepare();
      const states = await uow.runInTransaction(async (r) => {
        const initial = await r.pets.findAvatar(ARGOS.id);
        const first = await r.pets.replaceAvatar(ARGOS.id, id(20));
        const second = await r.pets.replaceAvatar(ARGOS.id, id(21));
        await r.pets.clearAvatar(ARGOS.id);
        const cleared = await r.pets.findAvatar(ARGOS.id);
        const third = await r.pets.replaceAvatar(ARGOS.id, id(22));
        return { initial, first, second, cleared, third, missing: await r.pets.findAvatar('f0000000-0000-4000-8000-0000000000ee') };
      });
      expect(states).toEqual({
        initial: { version: 0, objectId: null },
        first: { version: 1, objectId: id(20) },
        second: { version: 2, objectId: id(21) },
        cleared: { version: 2, objectId: null },
        third: { version: 3, objectId: id(22) },
        missing: null,
      });
    });

    it('[REQ-AVA-001] findAvatarVersions devuelve en una sola lectura la versión de las mascotas con avatar y null para las demás (sin avatar o inexistentes)', async () => {
      const uow = await prepare();
      const versions = await uow.runInTransaction(async (r) => {
        await r.pets.replaceAvatar(ARGOS.id, id(20));
        await r.pets.replaceAvatar(ARGOS.id, id(21));
        await r.pets.replaceAvatar(OTRA.id, id(22));
        await r.pets.clearAvatar(OTRA.id);
        const found = await r.pets.findAvatarVersions([ARGOS.id, OTRA.id, AJENA.id, 'f0000000-0000-4000-8000-0000000000ee']);
        return { found: [...found.entries()].sort(), empty: (await r.pets.findAvatarVersions([])).size };
      });
      expect(versions).toEqual({
        found: [[AJENA.id, null], [ARGOS.id, 2], [OTRA.id, null]].sort(),
        empty: 0,
      });
    });

    it('[REQ-IMP-001][INV-AVA-001] raiseAvatarVersion lleva la versión a un valor mayor y nunca la baja; sin avatar y sin mascota no hace nada', async () => {
      const uow = await prepare();
      const states = await uow.runInTransaction(async (r) => {
        await r.pets.raiseAvatarVersion(ARGOS.id, 5);
        const raised = await r.pets.findAvatar(ARGOS.id);
        await r.pets.raiseAvatarVersion(ARGOS.id, 3);
        const kept = await r.pets.findAvatar(ARGOS.id);
        await r.pets.raiseAvatarVersion('f0000000-0000-4000-8000-0000000000ee', 9);
        const next = await r.pets.replaceAvatar(ARGOS.id, id(20));
        return { raised, kept, next };
      });
      expect(states).toEqual({ raised: { version: 5, objectId: null }, kept: { version: 5, objectId: null }, next: { version: 6, objectId: id(20) } });
    });

    it('[INV-AVA-001] pets.save (PATCH de la mascota) no revierte el avatar ni su versión', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.pets.replaceAvatar(ARGOS.id, id(20));
        await r.pets.save({ ...ARGOS, name: 'Argos II' });
      });
      expect(await uow.runInTransaction((r) => r.pets.findAvatar(ARGOS.id))).toEqual({ version: 1, objectId: id(20) });
    });

    it('[REQ-GCS-004] enqueue es idempotente: DELETE sustituye a INTENT y un INTENT posterior no degrada a un DELETE', async () => {
      const uow = await prepare();
      const key = `pets/${ARGOS.id}/files/${id(1)}`;
      const rows = await uow.runInTransaction(async (r) => {
        await r.mediaQueue.enqueue(key, 'INTENT', at(0));
        const intent = await r.mediaQueue.findByKey(key);
        await r.mediaQueue.enqueue(key, 'DELETE', at(5));
        const del = await r.mediaQueue.findByKey(key);
        await r.mediaQueue.enqueue(key, 'INTENT', at(9));
        const still = await r.mediaQueue.findByKey(key);
        return { intent, del, still, missing: await r.mediaQueue.findByKey('pets/x/files/y') };
      });
      expect(rows.intent).toEqual({ objectKey: key, reason: 'INTENT', enqueuedAt: at(0), attempts: 0 });
      expect(rows.del).toMatchObject({ reason: 'DELETE', attempts: 0 });
      expect(rows.still).toMatchObject({ reason: 'DELETE' });
      expect(rows.missing).toBeNull();
    });

    it('[REQ-GCS-004] enqueueObjectsOfPet encola con DELETE la clave derivada de cada archivo, foto y el avatar, y devuelve las claves', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1, { kind: 'FILE' }));
        await r.media.insert(media(2, { kind: 'PHOTO', mime: 'image/png' }));
        await r.media.insert(media(3, { petId: OTRA.id }));
        await r.pets.replaceAvatar(ARGOS.id, id(20));
        const keys = await r.mediaQueue.enqueueObjectsOfPet(ARGOS.id, NOW);
        const none = await r.mediaQueue.enqueueObjectsOfPet(AJENA.id, NOW);
        return { keys, none, queue: await r.mediaQueue.listPending(10) };
      });
      const expected = [`pets/${ARGOS.id}/avatar/${id(20)}`, `pets/${ARGOS.id}/files/${id(1)}`, `pets/${ARGOS.id}/photos/${id(2)}`];
      expect(result.keys.slice().sort()).toEqual(expected);
      expect(result.none).toEqual([]);
      expect(result.queue.map((e) => [e.objectKey, e.reason, e.attempts]).sort()).toEqual(expected.map((k) => [k, 'DELETE', 0]));
    });

    it('[REQ-GCS-004] recordFailure suma un intento sin tope; remove retira la fila; listPending ordena por instante y respeta el límite', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.mediaQueue.enqueue('pets/a/files/b', 'DELETE', at(3));
        await r.mediaQueue.enqueue('pets/a/files/a', 'DELETE', at(1));
        await r.mediaQueue.enqueue('pets/a/files/c', 'DELETE', at(2));
        for (let n = 0; n < 60; n += 1) await r.mediaQueue.recordFailure('pets/a/files/a');
        await r.mediaQueue.recordFailure('pets/a/files/no-existe');
        const all = await r.mediaQueue.listPending(10);
        const limited = await r.mediaQueue.listPending(2);
        await r.mediaQueue.remove('pets/a/files/a');
        await r.mediaQueue.remove('pets/a/files/a');
        return { all, limited, after: await r.mediaQueue.listPending(10) };
      });
      expect(result.all.map((e) => [e.objectKey, e.attempts])).toEqual([['pets/a/files/a', 60], ['pets/a/files/c', 0], ['pets/a/files/b', 0]]);
      expect(result.limited.map((e) => e.objectKey)).toEqual(['pets/a/files/a', 'pets/a/files/c']);
      expect(result.after.map((e) => e.objectKey)).toEqual(['pets/a/files/c', 'pets/a/files/b']);
    });

    it('[REQ-GCS-006] promoteStaleIntents convierte en DELETE los INTENT anteriores al corte y countOlderThan cuenta filas viejas (alerta de 48 h)', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => {
        await r.mediaQueue.enqueue('pets/a/files/viejo', 'INTENT', at(0));
        await r.mediaQueue.enqueue('pets/a/files/reciente', 'INTENT', at(100));
        await r.mediaQueue.enqueue('pets/a/files/borrar', 'DELETE', at(0));
        const promoted = await r.mediaQueue.promoteStaleIntents(at(50));
        return { promoted, rows: await r.mediaQueue.listPending(10), older: await r.mediaQueue.countOlderThan(at(50)), olderAll: await r.mediaQueue.countOlderThan(at(1000)) };
      });
      expect(result.promoted).toBe(1);
      expect(result.rows.map((e) => [e.objectKey, e.reason]).sort()).toEqual([['pets/a/files/borrar', 'DELETE'], ['pets/a/files/reciente', 'INTENT'], ['pets/a/files/viejo', 'DELETE']]);
      expect([result.older, result.olderAll]).toEqual([2, 3]);
    });

    it('[REQ-IMP-001] countObjectsOfPets cuenta archivos, fotos y avatares de las mascotas indicadas', async () => {
      const uow = await prepare();
      const counts = await uow.runInTransaction(async (r) => {
        await r.media.insert(media(1));
        await r.media.insert(media(2, { kind: 'PHOTO', mime: 'image/png' }));
        await r.media.insert(media(3, { petId: OTRA.id }));
        await r.pets.replaceAvatar(ARGOS.id, id(20));
        return [await r.media.countObjectsOfPets([ARGOS.id]), await r.media.countObjectsOfPets([ARGOS.id, OTRA.id, AJENA.id]), await r.media.countObjectsOfPets([])] as const;
      });
      expect(counts).toEqual([3, 4, 0]);
    });

    it('[INV-ARCH-005] si la transacción lanza, se descartan medios, cola y avatar', async () => {
      const uow = await prepare();
      await expect(
        uow.runInTransaction(async (r) => {
          await r.media.insert(media(1));
          await r.mediaQueue.enqueue('pets/a/files/b', 'DELETE', NOW);
          await r.pets.replaceAvatar(ARGOS.id, id(20));
          throw new Error('fallo');
        }),
      ).rejects.toThrow('fallo');
      const after = await uow.runInTransaction(async (r) => [await r.media.findById(ARGOS.id, id(1)), await r.mediaQueue.listPending(10), await r.pets.findAvatar(ARGOS.id)] as const);
      expect(after).toEqual([null, [], { version: 0, objectId: null }]);
    });
  });
}
