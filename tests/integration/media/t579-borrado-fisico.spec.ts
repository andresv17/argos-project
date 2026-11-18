/**
 * T579 [US4] borrado físico inmediato y cola transaccional (REQ-GCS-004, INV-GCS-002, SC-ALM-014, SC-ALM-015; E3-04):
 * borrado individual, cascada de mascota, `delete` idempotente, 204 siempre tras el COMMIT, refuerzo por `list` del prefijo, fallo del almacenamiento
 * con reintento sin tope del mantenimiento, alerta a las 48 h y transacción revertida sin borrar nada. Memoria y SQLite.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { DeleteMediaUseCase, UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import { DeletePetUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { ANDRES, ARGOS, JPEG, PDF, PNG, codeOf, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
async function eachEngine(run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(null)) {
    open.push(engine);
    await run(engine);
  }
}
const upload = (e: MediaEngine, kind: 'FILE' | 'PHOTO', bytes: Uint8Array) => new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind, filename: 'a', bytes });
const hours = (e: MediaEngine, h: number) => new Date(Date.parse(e.clock.nowIsoTimestamp()) + h * 3_600_000).toISOString();
const AVATAR_ID = 'f0000000-0000-4000-8000-0000000a0a01';

/** Siembra una mascota con 3 archivos, 2 fotos y avatar; devuelve las 6 claves. */
async function seedSix(e: MediaEngine): Promise<string[]> {
  const keys: string[] = [];
  for (let n = 0; n < 3; n += 1) keys.push(`pets/${ARGOS.id}/files/${(await upload(e, 'FILE', PDF(32 + n))).id}`);
  for (let n = 0; n < 2; n += 1) keys.push(`pets/${ARGOS.id}/photos/${(await upload(e, 'PHOTO', PNG(32 + n))).id}`);
  const avatarKey = `pets/${ARGOS.id}/avatar/${AVATAR_ID}`;
  await e.storage.put(avatarKey, JPEG(), 'image/jpeg');
  await e.run((r) => r.pets.replaceAvatar(ARGOS.id, AVATAR_ID).then(() => undefined));
  e.storage.operations.length = 0;
  return [...keys, avatarKey];
}

describe('T579 borrado de un archivo (SC-ALM-014)', () => {
  it('[SC-ALM-014] al borrar, el objeto ya no existe en la misma petición, la fila no existe y la cola está vacía', async () => {
    await eachEngine(async (e) => {
      const item = await upload(e, 'FILE', PDF());
      await new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id);
      expect([await e.storage.keys(), await e.mediaRows(), await e.queue()]).toEqual([[], [], []]);
    });
  });

  it('[SC-ALM-014] si el almacenamiento falla la petición termina igual (204) y la fila queda DELETE con attempts = 1; el mantenimiento la reintenta', async () => {
    await eachEngine(async (e) => {
      const item = await upload(e, 'FILE', PDF());
      const key = `pets/${ARGOS.id}/files/${item.id}`;
      e.storage.failing.add('delete');
      expect(await codeOf(new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id))).toBe('OK');
      expect(await e.mediaRows()).toEqual([]);
      expect(await e.queue()).toEqual([{ objectKey: key, reason: 'DELETE', attempts: 1, enqueuedAt: expect.any(String) }]);
      expect(await e.storage.keys()).toEqual([key]);
      e.storage.failing.clear();
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.deleted, result.failed, await e.queue(), await e.storage.keys()]).toEqual([1, 0, [], []]);
    });
  });

  it('[SC-ALM-014][REQ-GCS-004] el reintento no tiene tope: 60 pasadas fallidas suman 60 intentos y la fila sigue; al recuperarse se borra', async () => {
    await eachEngine(async (e) => {
      const item = await upload(e, 'FILE', PDF());
      e.storage.failing.add('delete');
      await new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id);
      for (let n = 0; n < 60; n += 1) await runMediaQueueMaintenance(e.deps);
      expect((await e.queue()).map((q) => q.attempts)).toEqual([61]);
      e.storage.failing.clear();
      await runMediaQueueMaintenance(e.deps);
      expect(await e.queue()).toEqual([]);
    });
  });

  it('[SC-ALM-014] borrar una clave inexistente cuenta como éxito y retira la fila de la cola', async () => {
    await eachEngine(async (e) => {
      const item = await upload(e, 'FILE', PDF());
      await e.storage.inner.delete(`pets/${ARGOS.id}/files/${item.id}`); // el objeto ya no existe en el bucket
      await new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id);
      expect([await e.queue(), await e.mediaRows()]).toEqual([[], []]);
    });
  });

  it('[REQ-GCS-004] si la transacción de borrado falla (auditoría) no se encola ni se borra nada y la fila sigue', async () => {
    await eachEngine(async (e) => {
      const item = await upload(e, 'FILE', PDF());
      const failing = { ...e.deps, auditLog: { append: async () => Promise.reject(new Error('fallo de auditoría')), pseudonymizeUser: async () => undefined } };
      await expect(new DeleteMediaUseCase(failing).execute(ANDRES, ARGOS.id, item.id)).rejects.toThrow('fallo de auditoría');
      expect([(await e.mediaRows()).length, await e.queue(), (await e.storage.keys()).length]).toEqual([1, [], 1]);
    });
  });
});

describe('T579 cascada de la mascota (SC-ALM-015, REQ-ACC-002)', () => {
  it('[SC-ALM-015] eliminar la mascota con 3 archivos, 2 fotos y avatar borra los 6 objetos y no queda nada bajo pets/{petId}/', async () => {
    await eachEngine(async (e) => {
      await seedSix(e);
      await new DeletePetUseCase(e.deps).execute(ANDRES, ARGOS.id);
      expect([await e.storage.list(`pets/${ARGOS.id}/`), await e.queue(), await e.mediaRows()]).toEqual([[], [], []]);
    });
  });

  it('[REQ-GCS-004] el refuerzo por list borra lo que quede bajo el prefijo aunque ninguna fila lo referenciara (objeto huérfano)', async () => {
    await eachEngine(async (e) => {
      await seedSix(e);
      const orphan = `pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000b0b01`;
      await e.storage.inner.put(orphan, PDF(), 'application/pdf');
      await new DeletePetUseCase(e.deps).execute(ANDRES, ARGOS.id);
      expect(await e.storage.keys(`pets/${ARGOS.id}/`)).toEqual([]);
    });
  });

  it('[SC-ALM-015][REQ-GCS-004] con el almacenamiento caído la mascota se elimina igual y las 6 claves quedan en la cola con attempts 1; el mantenimiento las borra', async () => {
    await eachEngine(async (e) => {
      const keys = await seedSix(e);
      e.storage.down = true;
      expect(await codeOf(new DeletePetUseCase(e.deps).execute(ANDRES, ARGOS.id))).toBe('OK');
      expect((await e.queue()).map((q) => [q.objectKey, q.reason, q.attempts]).sort()).toEqual(keys.map((k) => [k, 'DELETE', 1]).sort());
      e.storage.down = false;
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.deleted, await e.queue(), await e.storage.keys()]).toEqual([6, [], []]);
    });
  });

  it('[SC-ALM-015] si la transacción falla no se encola ni se borra nada: la mascota, sus medios y los 6 objetos siguen', async () => {
    await eachEngine(async (e) => {
      await seedSix(e);
      const failing = { ...e.deps, auditLog: { append: async () => Promise.reject(new Error('fallo de auditoría')), pseudonymizeUser: async () => undefined } };
      await expect(new DeletePetUseCase(failing).execute(ANDRES, ARGOS.id)).rejects.toThrow('fallo de auditoría');
      expect([(await e.storage.keys()).length, await e.queue(), (await e.mediaRows()).length, await e.avatar()]).toEqual([6, [], 5, { version: 1, objectId: AVATAR_ID }]);
    });
  });

  it('[SC-ALM-027] al eliminar la mascota se encola el avatar vigente aunque la fila de la mascota se hubiera editado antes', async () => {
    await eachEngine(async (e) => {
      const keys = await seedSix(e);
      e.storage.down = true;
      await new DeletePetUseCase(e.deps).execute(ANDRES, ARGOS.id);
      expect((await e.queue()).map((q) => q.objectKey)).toContain(keys.at(-1));
    });
  });
});

describe('T579 mantenimiento de la cola (REQ-GCS-006, E3-04)', () => {
  it('[REQ-GCS-006] un INTENT de más de 1 h pasa a DELETE y se borra; uno de menos de 1 h no se toca', async () => {
    await eachEngine(async (e) => {
      const stale = `pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000c0c01`;
      const fresh = `pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000c0c02`;
      await e.storage.inner.put(stale, PDF(), 'application/pdf');
      await e.storage.inner.put(fresh, PDF(), 'application/pdf');
      await e.run(async (r) => {
        await r.mediaQueue.enqueue(stale, 'INTENT', hours(e, -2));
        await r.mediaQueue.enqueue(fresh, 'INTENT', hours(e, -0.5));
      });
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.promoted, result.deleted, (await e.queue()).map((q) => [q.objectKey, q.reason]), await e.storage.keys()]).toEqual([1, 1, [[fresh, 'INTENT']], [fresh]]);
    });
  });

  it('[REQ-GCS-004] informa solo un conteo de filas con más de 48 h en la cola (alerta a Neo), sin claves', async () => {
    await eachEngine(async (e) => {
      e.storage.down = true;
      await e.run(async (r) => {
        await r.mediaQueue.enqueue(`pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000d0d01`, 'DELETE', hours(e, -49));
        await r.mediaQueue.enqueue(`pets/${ARGOS.id}/files/f0000000-0000-4000-8000-0000000d0d02`, 'DELETE', hours(e, -47));
      });
      const result = await runMediaQueueMaintenance(e.deps);
      expect(result).toEqual({ promoted: 0, deleted: 0, failed: 2, overdue: 1, reconciled: 0 });
      expect(JSON.stringify(result)).not.toContain('pets/');
    });
  });

  it('[REQ-GCS-004] sin medios conectados el mantenimiento no hace nada', async () => {
    await eachEngine(async (e) => {
      const { media: _unused, ...withoutMedia } = e.deps;
      void _unused;
      expect(await runMediaQueueMaintenance(withoutMedia)).toEqual({ promoted: 0, deleted: 0, failed: 0, overdue: 0, reconciled: 0 });
    });
  });
});

describe('T811 borrado físico de claves de la escena (006, N2-06 (b); REQ-ESC6-029, EDGE-ESC6-021, SC-ESC6-044)', () => {
  const SCENE_KEY = 'scenes/f0000000-0000-4000-8000-0000000d0d01/images/f0000000-0000-4000-8000-0000000d0d02';
  const PHOTO_KEY = 'households/f0000000-0000-4000-8000-0000000d0d03/photo/f0000000-0000-4000-8000-0000000d0d04';
  /** `keys()` lista `pets/` por defecto: aquí se recorren los dos prefijos de la 006. */
  const sceneKeys = async (e: MediaEngine): Promise<string[]> => [...(await e.storage.keys('scenes/')), ...(await e.storage.keys('households/'))].sort();

  it('[SC-ESC6-044] la cola de borrado acepta las claves de la escena y la foto del hogar: el mantenimiento las borra y retira la fila', async () => {
    await eachEngine(async (e) => {
      await e.storage.inner.put(SCENE_KEY, PNG(32), 'image/png');
      await e.storage.inner.put(PHOTO_KEY, PNG(33), 'image/png');
      await e.run((r) => r.mediaQueue.enqueue(SCENE_KEY, 'DELETE', e.clock.nowIsoTimestamp()).then(() => r.mediaQueue.enqueue(PHOTO_KEY, 'DELETE', e.clock.nowIsoTimestamp())));
      expect(await runMediaQueueMaintenance(e.deps)).toMatchObject({ deleted: 2, failed: 0 });
      expect([await sceneKeys(e), await e.queue()]).toEqual([[], []]);
    });
  });

  it('[EDGE-ESC6-021] la fila INTENT de una imagen de escena vence a la hora y pasa a DELETE como la de un medio', async () => {
    await eachEngine(async (e) => {
      await e.storage.inner.put(SCENE_KEY, PNG(32), 'image/png');
      await e.run((r) => r.mediaQueue.enqueue(SCENE_KEY, 'INTENT', e.clock.nowIsoTimestamp()));
      e.clock.setClock(hours(e, 2).slice(0, 10), hours(e, 2));
      expect(await runMediaQueueMaintenance(e.deps)).toMatchObject({ promoted: 1, deleted: 1 });
      expect([await sceneKeys(e), await e.queue()]).toEqual([[], []]);
    });
  });

  it('[REQ-ESC6-029] eliminar una mascota con medios no toca objetos de scenes/ ni de households/ (el borrado de la escena es de su propio gancho)', async () => {
    await eachEngine(async (e) => {
      await seedSix(e);
      await e.storage.inner.put(SCENE_KEY, PNG(32), 'image/png');
      await e.storage.inner.put(PHOTO_KEY, PNG(33), 'image/png');
      await new DeletePetUseCase(e.deps).execute(ANDRES, ARGOS.id);
      expect([await e.storage.keys(), await sceneKeys(e)]).toEqual([[], [SCENE_KEY, PHOTO_KEY].sort()]);
    });
  });
});
