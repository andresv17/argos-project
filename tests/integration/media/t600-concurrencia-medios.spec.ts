/**
 * T600/T601 [US2] cierre de medios y avatar: concurrencia con DOS conexiones intercaladas, en SQLite (archivo) y PostgreSQL 17 real (se OMITE sin
 * TEST_DATABASE_URL) (SC-CAT-028, SC-ALM-026; REQ-BOR-005, INV-REG-003, REQ-GCS-004, INV-AVA-001):
 *  - dos DELETE simultáneos del mismo medio: uno OK, el otro ERR-MEDIA-NOT-FOUND y una sola fila DELETE en la cola;
 *  - dos DELETE simultáneos del avatar: ambos 204 (idempotente), `avatar_version` no cambia y una sola fila DELETE en la cola;
 *  - un borrado de medio con la mascota ya eliminada por la otra conexión: ERR-PET-NOT-FOUND.
 * La conexión A queda retenida con su candado de mascota a mitad de transacción y B llega mientras tanto: B no lee nada hasta que A confirma.
 * El candado propietario → mascota de la subida (`lockOwnerThenPet`) se prueba en t601-candado-mascota.spec.ts y su llamador en t576 (SC-ALM-026).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PutAvatarUseCase, DeleteAvatarUseCase } from '../../../src/application/use-cases/avatar-use-cases.ts';
import { DeleteMediaUseCase, UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import { DeletePetUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { DomainError as DomainErrorV31 } from '../../../src/generated/v31/index.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { ANDRES, ARGOS } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, gate, holdBeforeCommit, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF } from '../../fixtures/media-harness.ts';

const open: ConcurrentEngine[] = [];
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
});
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return error.code;
    throw error;
  }
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function suite(name: 'SQLite' | 'PostgreSQL', create: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T600/T601 medios y avatar con dos conexiones intercaladas (${name})`, { timeout: 60_000 }, () => {
    async function setup() {
      const engine = await create();
      open.push(engine);
      const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
      const media = { storage, limits: DEFAULT_LIMITS };
      const withMedia = (deps: ApplicationDeps): ApplicationDeps => ({ ...deps, media });
      const queue = () => engine.uowA.runInTransaction(async (r) => r.mediaQueue.listPending(100));
      return { engine, storage, withMedia, queue };
    }
    /** A retenida a mitad de transacción (con su candado de mascota) y la llave que la libera. */
    async function startHeldA<T>(engine: ConcurrentEngine, withMedia: (d: ApplicationDeps) => ApplicationDeps, run: (deps: ApplicationDeps) => Promise<T>) {
      const entered = gate();
      const hold = gate();
      const a = run(withMedia(engine.depsA(holdBeforeCommit(engine.uowA, entered.open, hold.promise))));
      const outcome = codeOf(a);
      await Promise.race([entered.promise, a.then(() => undefined, () => undefined)]);
      return { outcome, release: hold.open };
    }

    it('[SC-CAT-028][REQ-BOR-005][REQ-GCS-004] dos DELETE simultáneos del mismo medio: uno OK, el otro ERR-MEDIA-NOT-FOUND y una sola fila DELETE en la cola', async () => {
      const { engine, withMedia, queue } = await setup();
      const item = await engine.asClientB((deps) => new UploadMediaUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a', bytes: PDF() })).result; // ids de B: A usa otros y no chocan
      const held = await startHeldA(engine, withMedia, (deps) => new DeleteMediaUseCase(deps).execute(ANDRES, ARGOS.id, item.id));
      let bDone = false;
      const b = engine.asClientB((deps) => new DeleteMediaUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id, item.id));
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect(bDone, 'B no puede terminar mientras A retiene el candado de la mascota').toBe(false);
      expect(b.workStarts(), 'B no llega a leer nada mientras A retiene su candado').toBe(0);
      held.release();
      expect([await held.outcome, await bOutcome]).toEqual(['OK', 'ERR-MEDIA-NOT-FOUND']);
      expect((await queue()).filter((q) => q.reason === 'DELETE').length).toBeLessThanOrEqual(1);
      expect((await engine.audit(item.id)).map((a) => a.join(':')).sort()).toEqual(['CREATE:PET_MEDIA', 'DELETE:PET_MEDIA']); // reloj fijo: el orden por marca de tiempo no distingue
    });

    it('[SC-CAT-028][INV-AVA-001][REQ-GCS-004] dos DELETE simultáneos del avatar: ambos 204 idempotentes, avatar_version no cambia y como mucho una fila DELETE', async () => {
      const { engine, withMedia, queue } = await setup();
      await engine.asClientB((deps) => new PutAvatarUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id, JPEG(1024))).result;
      const before = await engine.uowA.runInTransaction((r) => r.pets.findAvatar(ARGOS.id));
      const held = await startHeldA(engine, withMedia, (deps) => new DeleteAvatarUseCase(deps).execute(ANDRES, ARGOS.id));
      let bDone = false;
      const b = engine.asClientB((deps) => new DeleteAvatarUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id));
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect([bDone, b.workStarts()]).toEqual([false, 0]);
      held.release();
      expect([await held.outcome, await bOutcome]).toEqual(['OK', 'OK']);
      const after = await engine.uowA.runInTransaction((r) => r.pets.findAvatar(ARGOS.id));
      expect([before?.version, after?.version, after?.objectId]).toEqual([1, 1, null]);
      expect((await queue()).filter((q) => q.reason === 'DELETE').length).toBeLessThanOrEqual(1);
    });

    it('[SC-ALM-026][EDGE-013][REQ-BOR-005] el borrado de un medio concurrente con la eliminación de la mascota: el segundo recibe ERR-PET-NOT-FOUND', async () => {
      const { engine, withMedia } = await setup();
      const item = await engine.asClientB((deps) => new UploadMediaUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a', bytes: PDF() })).result; // ids de B: A usa otros y no chocan
      const held = await startHeldA(engine, withMedia, (deps) => new DeletePetUseCase(deps).execute(ANDRES, ARGOS.id));
      let bDone = false;
      const b = engine.asClientB((deps) => new DeleteMediaUseCase(withMedia(deps)).execute(ANDRES, ARGOS.id, item.id));
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect([bDone, b.workStarts()]).toEqual([false, 0]);
      held.release();
      expect([await held.outcome, await bOutcome]).toEqual(['OK', 'ERR-PET-NOT-FOUND']);
    });
  });
}

suite('SQLite', createSqliteConcurrentEngine, false);
suite('PostgreSQL', createPostgresConcurrentEngine, !TEST_DATABASE_URL);
