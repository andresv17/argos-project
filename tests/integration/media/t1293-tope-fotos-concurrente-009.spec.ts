/**
 * T1293 [GH:#20] EDGE-009-048: con el tope en 10 y 9 fotos, DOS subidas concurrentes NO crean 11 (comprobación de conteo e inserción
 * en la misma transacción con candado de mascota). Memoria, SQLite (dos conexiones) y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL).
 * A diferencia de T720 (conexiones intercaladas con compuertas), aquí las dos subidas se lanzan juntas (`Promise.all`) sin retener ningún paso.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, EDGE-009-015, EDGE-009-048, SC-009-017
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetMediaRecord } from '../../../src/application/ports/repositories.port.ts';
import { UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ANDRES, ARGOS } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS, PNG, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const LIMIT = 'ERR-MEDIA-ALBUM-LIMIT';
const photoRow = (n: number): PetMediaRecord => ({
  id: `f0000000-0000-4000-8000-0000000093${String(n).padStart(2, '0')}`,
  petId: ARGOS.id,
  kind: 'PHOTO',
  mime: 'image/png',
  sizeBytes: 1,
  originalName: `f${n}.png`,
  createdAt: `2026-11-05T11:00:${String(n).padStart(2, '0')}.000Z`,
});
/** Código del error de dominio de cualquier catálogo o `OK`; otro error se relanza. */
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
const isBusy = (error: unknown) => (error as { code?: unknown } | null)?.code === 'SQLITE_BUSY';
/** Reintenta ante SQLITE_BUSY (la conexión A de SQLite no espera el candado; B ya reintenta en `asClientB`). */
async function retryBusy<T>(call: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await call();
    } catch (error) {
      if (!isBusy(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}
const upload = (deps: ApplicationDeps) => new UploadMediaUseCase(deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', filename: 'b.png', bytes: PNG() });

const open: ConcurrentEngine[] = [];
const engines: MediaEngine[] = [];
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
  engines.splice(0).forEach((e) => e.close());
});

function suite(name: 'SQLite' | 'PostgreSQL', create: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T1293 EDGE-009-048 dos subidas simultáneas con 9 fotos y tope 10 (${name})`, { timeout: 60_000 }, () => {
    it('[EDGE-009-048][SC-009-017] una pasa (10.ª), la otra recibe ERR-MEDIA-ALBUM-LIMIT; el total es 10, nunca 11, y no quedan objetos ni cola', async () => {
      const engine = await create();
      open.push(engine);
      const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
      const withMedia = (deps: ApplicationDeps): ApplicationDeps => ({ ...deps, media: { storage, limits: DEFAULT_LIMITS } });
      await engine.uowA.runInTransaction(async (r) => {
        for (let n = 1; n <= 9; n += 1) await r.media.insert(photoRow(n));
      });
      const b = engine.asClientB((deps) => upload(withMedia(deps)));
      const outcomes = await Promise.all([codeOf(retryBusy(() => upload(withMedia(engine.depsA())))), codeOf(b.result)]);
      expect([...outcomes].sort()).toEqual([LIMIT, 'OK']);
      expect(await engine.uowA.runInTransaction(async (r) => r.media.countByPetAndKind(ARGOS.id, 'PHOTO'))).toBe(10);
      expect(await storage.keys()).toHaveLength(1);
      expect(await engine.uowA.runInTransaction((r) => r.mediaQueue.listPending(100))).toEqual([]);
    });
  });
}
suite('SQLite', createSqliteConcurrentEngine, false);
suite('PostgreSQL', createPostgresConcurrentEngine, !TEST_DATABASE_URL);

describe('T1293 EDGE-009-048 memoria (y SQLite en proceso): dos subidas simultáneas con 9 fotos y tope 10', () => {
  it('[EDGE-009-048][SC-009-017] una pasa y la otra recibe ERR-MEDIA-ALBUM-LIMIT; el total es 10, nunca 11', async () => {
    for (const e of await createMediaEngines(null)) {
      engines.push(e);
      await e.run(async (r) => {
        for (let n = 1; n <= 9; n += 1) await r.media.insert(photoRow(n));
      });
      const outcomes = await Promise.all([codeOf(upload(e.deps)), codeOf(upload(e.deps))]);
      expect([e.name, [...outcomes].sort()]).toEqual([e.name, [LIMIT, 'OK']]);
      expect([e.name, (await e.mediaRows()).length]).toEqual([e.name, 10]);
      expect([e.name, await e.queue(), (await e.storage.keys()).length]).toEqual([e.name, [], 1]);
    }
  });
});
