/**
 * T720 [US1] tope atómico del álbum con conexiones intercaladas y rechazo sin objeto huérfano (REQ-ALB5-002, INV-005-003, EDGE-005-02;
 * SC-005-002, SC-005-003). SQLite (archivo, dos conexiones) y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL), más memoria y SQLite
 * en proceso para el rechazo previo y el rechazo autoritativo (fila INTENT -> DELETE):
 *  - 9 fotos y dos subidas intercaladas: una pasa y la otra recibe ERR-MEDIA-ALBUM-LIMIT; el total es 10 y no queda objeto ni fila en la cola;
 *  - PostgreSQL: la conexión B no cuenta hasta que A suelta el candado de la mascota (el conteo autoritativo va DESPUÉS del candado, A-06);
 *  - con 10 fotos el rechazo es previo al `put` (sin objeto, sin INTENT, sin cuota consumida);
 *  - si otra conexión llena el álbum entre la intención y la transacción final, la fila INTENT pasa a DELETE, el objeto se borra y no hay fila ni auditoría.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetMediaRecord } from '../../../src/application/ports/repositories.port.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ANDRES, ARGOS } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, gate, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS, PDF, PNG, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const LIMIT = 'ERR-MEDIA-ALBUM-LIMIT';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Código del error de dominio de cualquier catálogo (002, 3.1.0 o 3.3.0) o `OK`; otro error se relanza. */
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code.startsWith('ERR-')) return code;
    throw error;
  }
};
const photoRow = (n: number): PetMediaRecord => ({
  id: `f0000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`,
  petId: ARGOS.id,
  kind: 'PHOTO',
  mime: 'image/png',
  sizeBytes: 1,
  originalName: `f${n}.png`,
  createdAt: `2026-11-05T11:00:${String(n).padStart(2, '0')}.000Z`,
});
const upload = (deps: ApplicationDeps, bytes: Uint8Array = PNG()) => new UploadMediaUseCase(deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', filename: 'b.png', bytes });

/** Retiene la SEGUNDA transacción (la final de la subida) tras ejecutar su trabajo y antes de confirmar: conserva sus candados. */
function holdFinalTransaction(uow: UnitOfWorkPort, entered: () => void, hold: Promise<void>): UnitOfWorkPort {
  let calls = 0;
  return {
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>) => {
      calls += 1;
      const mine = calls;
      return uow.runInTransaction(async (repositories) => {
        const result = await work(repositories);
        if (mine === 2) {
          entered();
          await hold;
        }
        return result;
      });
    },
  };
}

const open: ConcurrentEngine[] = [];
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
});

function suite(name: 'SQLite' | 'PostgreSQL', create: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T720 tope atómico del álbum con dos conexiones intercaladas (${name})`, { timeout: 60_000 }, () => {
    async function setup(seeded: number) {
      const engine = await create();
      open.push(engine);
      const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
      const withMedia = (deps: ApplicationDeps): ApplicationDeps => ({ ...deps, media: { storage, limits: DEFAULT_LIMITS } });
      await engine.uowA.runInTransaction(async (r) => {
        for (let n = 1; n <= seeded; n += 1) await r.media.insert(photoRow(n));
      });
      const photos = () => engine.uowA.runInTransaction(async (r) => (await r.media.listPage(ARGOS.id, 'PHOTO', 24, 0)).total);
      const queue = () => engine.uowA.runInTransaction((r) => r.mediaQueue.listPending(100));
      /** El `put` de la conexión B (ids `ccccccc1`) queda retenido hasta `release()`; el de A pasa. */
      const putGate = gate();
      const reached = gate();
      storage.beforePut = async (key) => {
        if (!key.includes('ccccccc1')) return;
        reached.open();
        await putGate.promise;
      };
      return { engine, storage, withMedia, photos, queue, reached, release: putGate.open };
    }

    it('[SC-005-003][EDGE-005-02][INV-005-003] 9 fotos y dos subidas intercaladas: una pasa, la otra recibe ERR-MEDIA-ALBUM-LIMIT; total 10, sin objeto huérfano ni fila en la cola', async () => {
      const { engine, storage, withMedia, photos, queue, reached, release } = await setup(9);
      const b = engine.asClientB((deps) => upload(withMedia(deps)));
      const bOutcome = codeOf(b.result);
      await reached.promise; // B superó el rechazo previo (9 fotos) y tiene su fila INTENT; su put espera
      await upload(withMedia(engine.depsA())); // A sube la décima y confirma
      release();
      expect(await bOutcome).toBe(LIMIT);
      expect(await photos()).toBe(10);
      const keys = await storage.keys();
      expect([keys.length, keys.every((k) => k.includes('aaaaaaa1'))]).toEqual([1, true]); // solo el objeto de A
      expect(await queue()).toEqual([]); // el objeto de B se borró y su fila salió de la cola
      expect(await engine.audit('ccccccc1-0000-4000-8000-000000000001')).toEqual([]);
    });

    it('[SC-005-003][REQ-GCS-006] si el borrado del objeto rechazado falla, su fila queda como DELETE (no INTENT) y el conteo sigue en 10', async () => {
      const { engine, storage, withMedia, photos, queue, reached, release } = await setup(9);
      const b = engine.asClientB((deps) => upload(withMedia(deps)));
      const bOutcome = codeOf(b.result);
      await reached.promise;
      await upload(withMedia(engine.depsA()));
      storage.failing.add('delete');
      release();
      expect(await bOutcome).toBe(LIMIT);
      expect(await photos()).toBe(10);
      const pending = await queue();
      expect(pending.map((q) => q.reason)).toEqual(['DELETE']);
      expect(pending[0]!.objectKey).toContain('ccccccc1');
    });
  });
}
suite('SQLite', createSqliteConcurrentEngine, false);
suite('PostgreSQL', createPostgresConcurrentEngine, !TEST_DATABASE_URL);

describe.skipIf(!TEST_DATABASE_URL)('T720 candado de mascota antes del conteo autoritativo (PostgreSQL 17 real, A-06)', { timeout: 60_000 }, () => {
  it('[SC-005-003][INV-005-003] B no cuenta mientras A retiene el candado: A pasa (10.ª), B recibe ERR-MEDIA-ALBUM-LIMIT y el total es 10', async () => {
    const engine = await createPostgresConcurrentEngine();
    open.push(engine);
    const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
    const withMedia = (deps: ApplicationDeps): ApplicationDeps => ({ ...deps, media: { storage, limits: DEFAULT_LIMITS } });
    await engine.uowA.runInTransaction(async (r) => {
      for (let n = 1; n <= 9; n += 1) await r.media.insert(photoRow(n));
    });
    const putGate = gate();
    const reached = gate();
    storage.beforePut = async (key) => {
      if (!key.includes('ccccccc1')) return;
      reached.open();
      await putGate.promise;
    };
    const b = engine.asClientB((deps) => upload(withMedia(deps)));
    const bOutcome = codeOf(b.result);
    await reached.promise; // B pasó el rechazo previo con 9 fotos
    const entered = gate();
    const hold = gate();
    const a = upload(withMedia(engine.depsA(holdFinalTransaction(engine.uowA, entered.open, hold.promise))));
    const aOutcome = codeOf(a);
    await Promise.race([entered.promise, a.then(() => undefined, () => undefined)]); // A tiene candado, conteo (9) e inserción sin confirmar
    putGate.open();
    await pause(200);
    expect(b.workStarts(), 'B no llega a su transacción final (ni cuenta) mientras A retiene el candado de la mascota').toBe(1);
    hold.open();
    expect([await aOutcome, await bOutcome]).toEqual(['OK', LIMIT]);
    expect(await engine.uowA.runInTransaction(async (r) => (await r.media.listPage(ARGOS.id, 'PHOTO', 24, 0)).total)).toBe(10);
    expect(await engine.uowA.runInTransaction((r) => r.mediaQueue.listPending(100))).toEqual([]);
  });
});

describe('T720 rechazo previo y rechazo autoritativo sin objeto huérfano (memoria y SQLite)', () => {
  const engines: MediaEngine[] = [];
  afterEach(() => engines.splice(0).forEach((e) => e.close()));
  async function eachEngine(run: (e: MediaEngine) => Promise<void>) {
    for (const e of await createMediaEngines(null)) {
      engines.push(e);
      await run(e);
    }
  }
  const seed = (e: MediaEngine, count: number) =>
    e.run(async (r) => {
      for (let n = 1; n <= count; n += 1) await r.media.insert(photoRow(n));
    });

  it('[SC-005-002][REQ-ALB5-002] con 10 fotos la undécima es 409 ERR-MEDIA-ALBUM-LIMIT ANTES del put: sin objeto, sin INTENT, sin fila ni auditoría; un archivo clínico sí entra', async () => {
    await eachEngine(async (e) => {
      await seed(e, 10);
      const error = await upload(e.deps).then(() => null, (x: { code: string; status: number }) => x);
      expect([e.name, error?.code, error?.status]).toEqual([e.name, LIMIT, 409]);
      expect(e.storage.operations.filter((o) => o.startsWith('put:'))).toEqual([]);
      expect([(await e.mediaRows()).length, await e.queue(), await e.storage.keys(), await e.audit('PET_MEDIA')]).toEqual([10, [], [], []]);
      const file = await new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a.pdf', bytes: PDF() });
      expect(file.kind).toBe('FILE');
    });
  });

  it('[SC-005-002][REQ-GCS-006] otra conexión llena el álbum tras la intención: rechazo autoritativo, la fila INTENT pasa a DELETE, el objeto se borra y no hay fila ni auditoría', async () => {
    await eachEngine(async (e) => {
      await seed(e, 9);
      e.storage.beforePut = async () => {
        await e.run((r) => r.media.insert(photoRow(10))); // la décima foto de «otra conexión»
      };
      expect([e.name, await codeOf(upload(e.deps))]).toEqual([e.name, LIMIT]);
      expect([(await e.mediaRows()).length, await e.queue(), await e.storage.keys(), await e.audit('PET_MEDIA')]).toEqual([10, [], [], []]);
      expect(e.storage.operations.filter((o) => o.startsWith('delete:')).length).toBe(1);
    });
  });

  it('[SC-005-003] el rechazo autoritativo con el almacenamiento caído deja UNA fila DELETE (no INTENT) para el mantenimiento', async () => {
    await eachEngine(async (e) => {
      await seed(e, 9);
      e.storage.beforePut = async () => {
        await e.run((r) => r.media.insert(photoRow(10)));
        e.storage.failing.add('delete');
      };
      expect(await codeOf(upload(e.deps))).toBe(LIMIT);
      const pending = await e.queue();
      expect([e.name, pending.map((q) => q.reason), (await e.mediaRows()).length]).toEqual([e.name, ['DELETE'], 10]);
    });
  });
});
