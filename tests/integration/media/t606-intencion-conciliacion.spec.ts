/**
 * T606 [US4] intención previa y conciliación (REQ-GCS-006, INV-GCS-002, REQ-BOR-005; SC-ALM-025, SC-ALM-026, SC-ALM-031; EDGE-012, EDGE-013):
 * proceso muerto entre `put` e `INSERT`, `put` ambiguo, fila `INTENT` vencida, objeto sin referencia de más de 24 h, objeto referenciado intacto,
 * subida concurrente con eliminación de mascota, cuota simultánea y permiso revocado durante la transmisión. Memoria y SQLite.
 * Las tres últimas ya viven en t576 (SC-ALM-026); aquí se repiten con la comprobación de huérfanos de INV-GCS-002 tras el mantenimiento.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MediaStorageUnavailableError } from '../../../src/application/ports/media-storage.port.ts';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import { ANDRES, ARGOS, JPEG, MARIA, PDF, codeOf, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
async function eachEngine(role: 'CAREGIVER' | null, run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(role)) {
    open.push(engine);
    await run(engine);
  }
}
const upload = (e: MediaEngine, who: string, bytes: Uint8Array) => new UploadMediaUseCase(e.deps).execute(who, ARGOS.id, { kind: 'FILE', filename: 'a', bytes });
const AVATAR_ID = 'f0000000-0000-4000-8000-0000000a0a01';
const ORPHAN = (n: number) => `pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000c0c${String(n).padStart(2, '0')}`;

function advance(e: MediaEngine, ms: number): void {
  const next = new Date(Date.parse(e.clock.nowIsoTimestamp()) + ms).toISOString();
  e.clock.setClock(next.slice(0, 10), next);
}
const HOUR = 3_600_000;

/** Objetos del bucket sin fila de pet_media, sin avatar referenciado y sin fila en la cola (INV-GCS-002). */
async function orphans(e: MediaEngine): Promise<string[]> {
  const rows = new Set((await e.mediaRows()).map((m) => `pets/${m.petId}/${m.kind === 'PHOTO' ? 'photos' : 'files'}/${m.id}`));
  const avatar = await e.avatar();
  if (avatar?.objectId) rows.add(`pets/${ARGOS.id}/avatar/${avatar.objectId}`);
  for (const q of await e.queue()) rows.add(q.objectKey);
  return (await e.storage.keys()).filter((k) => !rows.has(k));
}

describe('T606 proceso muerto entre el put y el INSERT (SC-ALM-025, EDGE-012, INV-GCS-002)', () => {
  it('[SC-ALM-025] el proceso muere tras el put: queda la fila INTENT; antes de 1 h no se toca y tras 1 h pasa a DELETE y el objeto se borra', async () => {
    await eachEngine(null, async (e) => {
      const alive = e.deps.uow;
      let dead = false;
      const crashing = { ...e.deps, uow: { ...alive, runInTransaction: (work: never) => (dead ? Promise.reject(new Error('proceso muerto')) : alive.runInTransaction(work)) } } as typeof e.deps;
      e.storage.beforePut = async () => undefined;
      const original = e.storage.inner.put.bind(e.storage.inner);
      e.storage.inner.put = async (key, bytes, type) => {
        await original(key, bytes, type);
        dead = true; // el proceso cae justo después de que el objeto quedó escrito
      };
      await expect(new UploadMediaUseCase(crashing).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a', bytes: PDF() })).rejects.toThrow('proceso muerto');
      dead = false;
      const [intent] = await e.queue();
      expect([intent?.reason, await e.mediaRows(), (await e.storage.keys()).length, await orphans(e)]).toEqual(['INTENT', [], 1, []]);
      advance(e, HOUR - 1000);
      expect(await runMediaQueueMaintenance(e.deps)).toMatchObject({ promoted: 0, deleted: 0 });
      expect((await e.storage.keys()).length).toBe(1);
      advance(e, 2000);
      expect(await runMediaQueueMaintenance(e.deps)).toMatchObject({ promoted: 1, deleted: 1 });
      expect([await e.storage.keys(), await e.queue(), await orphans(e)]).toEqual([[], [], []]);
    });
  });

  it('[SC-ALM-025] el put agota el tiempo con éxito remoto: ERR-MEDIA-STORAGE-UNAVAILABLE, fila INTENT y el mantenimiento borra el objeto tras 1 h', async () => {
    await eachEngine(null, async (e) => {
      const original = e.storage.inner.put.bind(e.storage.inner);
      e.storage.inner.put = async (key, bytes, type) => {
        await original(key, bytes, type);
        throw new MediaStorageUnavailableError('put'); // el objeto llegó pero la respuesta no
      };
      expect(await codeOf(upload(e, ANDRES, PDF()))).toBe('ERR-MEDIA-STORAGE-UNAVAILABLE');
      expect([(await e.queue()).map((q) => q.reason), (await e.storage.keys()).length, await orphans(e)]).toEqual([['INTENT'], 1, []]);
      advance(e, HOUR + 1000);
      await runMediaQueueMaintenance(e.deps);
      expect([await e.storage.keys(), await e.queue(), await orphans(e)]).toEqual([[], [], []]);
    });
  });
});

describe('T606 conciliación diaria del prefijo pets/ (SC-ALM-031, REQ-GCS-006)', () => {
  it('[SC-ALM-031] un objeto de más de 24 h sin fila, sin avatar y sin cola se encola con DELETE y se borra; uno de menos de 24 h no se toca', async () => {
    await eachEngine(null, async (e) => {
      await e.storage.inner.put(ORPHAN(1), PDF(), 'application/pdf');
      advance(e, 24 * HOUR - 1000);
      await e.storage.inner.put(ORPHAN(2), PDF(), 'application/pdf');
      advance(e, 2000); // el primero tiene 24 h y 2 s; el segundo 2 s
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.reconciled, result.deleted, await e.storage.keys(), await e.queue()]).toEqual([1, 1, [ORPHAN(2)], []]);
    });
  });

  it('[SC-ALM-031] un objeto referenciado (fila de pet_media, avatar o cola) nunca se encola aunque tenga más de 24 h', async () => {
    await eachEngine(null, async (e) => {
      const item = await upload(e, ANDRES, PDF());
      await e.storage.inner.put(`pets/${ARGOS.id}/avatar/${AVATAR_ID}`, JPEG(), 'image/jpeg');
      await e.run((r) => r.pets.replaceAvatar(ARGOS.id, AVATAR_ID).then(() => undefined));
      const queued = ORPHAN(3);
      await e.storage.inner.put(queued, PDF(), 'application/pdf');
      await e.run((r) => r.mediaQueue.enqueue(queued, 'INTENT', e.clock.nowIsoTimestamp()));
      advance(e, 30 * HOUR);
      // la fila INTENT de `queued` ya tiene más de 1 h: la pasada la promueve y la borra por la cola, no por la conciliación
      const result = await runMediaQueueMaintenance(e.deps);
      expect(result.reconciled).toBe(0);
      expect((await e.storage.keys()).sort()).toEqual([`pets/${ARGOS.id}/avatar/${AVATAR_ID}`, `pets/${ARGOS.id}/files/${item.id}`].sort());
      expect(await e.mediaRows()).toHaveLength(1);
    });
  });

  it('[SC-ALM-031] claves ajenas al formato de objetos de medios no se borran y un fallo de list no detiene el mantenimiento', async () => {
    await eachEngine(null, async (e) => {
      await e.storage.inner.put('pets/no-es-una-clave', PDF(), 'application/pdf');
      advance(e, 48 * HOUR);
      expect((await runMediaQueueMaintenance(e.deps)).reconciled).toBe(0);
      expect(await e.storage.keys()).toEqual(['pets/no-es-una-clave']);
      e.storage.failing.add('list');
      expect(await runMediaQueueMaintenance(e.deps)).toMatchObject({ reconciled: 0, failed: 0 });
    });
  });

  it('[SC-ALM-031][INV-GCS-002] tras la conciliación el conteo de huérfanos es 0 incluso con varios objetos de más de 24 h', async () => {
    await eachEngine(null, async (e) => {
      for (const n of [1, 2, 3]) await e.storage.inner.put(ORPHAN(n), PDF(), 'application/pdf');
      advance(e, 25 * HOUR);
      expect(await orphans(e)).toHaveLength(3);
      await runMediaQueueMaintenance(e.deps);
      expect([await orphans(e), await e.storage.keys()]).toEqual([[], []]);
    });
  });
});

describe('T606 concurrencia de la subida (SC-ALM-026, REQ-BOR-005, EDGE-013): sin huérfanos tras el mantenimiento', () => {
  it('[SC-ALM-026] permiso revocado durante la transmisión: 403 y 0 huérfanos', async () => {
    await eachEngine('CAREGIVER', async (e) => {
      e.storage.beforePut = async () => {
        await e.run(async (r) => {
          const membership = (await r.households.listMembershipsOfUsers([MARIA])).find((m) => m.status === 'ACTIVE')!;
          await r.households.saveMembership({ ...membership, role: 'READER' });
        });
      };
      expect(await codeOf(upload(e, MARIA, PDF()))).toBe('ERR-ACC-FORBIDDEN');
      await runMediaQueueMaintenance(e.deps);
      expect([await e.storage.keys(), await orphans(e)]).toEqual([[], []]);
    });
  });

  it('[SC-ALM-026][EDGE-013] eliminación de la mascota durante la subida: ERR-PET-NOT-FOUND y 0 huérfanos', async () => {
    await eachEngine(null, async (e) => {
      e.storage.beforePut = async () => {
        await e.run(async (r) => {
          await r.mediaQueue.enqueueObjectsOfPet(ARGOS.id, e.clock.nowIsoTimestamp());
          await r.pets.delete(ARGOS.id);
        });
      };
      expect(await codeOf(upload(e, ANDRES, PDF()))).toBe('ERR-PET-NOT-FOUND');
      await runMediaQueueMaintenance(e.deps);
      expect([await e.storage.keys(), await e.queue()]).toEqual([[], []]);
    });
  });
});
