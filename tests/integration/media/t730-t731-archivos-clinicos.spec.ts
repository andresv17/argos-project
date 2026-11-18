/**
 * T730 + T731 [US2] archivos clínicos (`kind = FILE`) en el servidor (REQ-CLI5-001, REQ-CLI5-003; SC-005-001, SC-005-007, SC-005-008, SC-005-009).
 * Caracterización del comportamiento heredado de 004 que la 005 promete mantener y que la sección «Historial / Archivos» consume:
 *  - T730: PDF, JPEG, PNG y WebP se aceptan como `FILE` y se listan solo con `kind=FILE`; un `.docx` recibe ERR-MEDIA-TYPE-NOT-ALLOWED sin fila ni objeto;
 *    los `FILE` no cuentan en el álbum (`countByPetAndKind`, `getAlbumLimits`) ni lo bloquean cuando está lleno (SQLite y PostgreSQL 17 real);
 *  - T731: la cuota de 1 GiB por propietario es una sola suma para álbum y archivos (en ambos sentidos; borrar una foto libera cuota para un archivo) y los
 *    permisos de `FILE` por rol son los de 004 (Lector ve pero no sube ni borra; Cuidador sube pero no borra), en memoria y SQLite.
 * Estas pruebas NO pueden estar rojas por diseño: 004 ya implementa el comportamiento (se declara en el informe); fijan que la 005 no lo altera.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetMediaRecord } from '../../../src/application/ports/repositories.port.ts';
import { DeleteMediaUseCase, GetAlbumLimitsUseCase, GetMediaAccessUseCase, ListMediaUseCase, UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ANDRES, ARGOS, MARIA } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF, PNG, WEBP, createMediaEngines, text, type EngineOptions, type MediaEngine } from '../../fixtures/media-harness.ts';
import type { HouseholdRole } from '../../fixtures/record-engines.ts';

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
  id: `f0000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`,
  petId: ARGOS.id,
  kind: 'PHOTO',
  mime: 'image/png',
  sizeBytes: 1,
  originalName: `f${n}.png`,
  createdAt: `2026-11-05T11:00:${String(n).padStart(2, '0')}.000Z`,
});
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);

// --- PostgreSQL 17 real y SQLite de archivo: tipos, separación del álbum y cuota compartida ---------------------------------------------------------------
const open: ConcurrentEngine[] = [];
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
});

function persistence(name: 'SQLite' | 'PostgreSQL', create: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T730/T731 archivos clínicos sobre la persistencia (${name})`, { timeout: 60_000 }, () => {
    async function setup(maxBytesPerOwner = DEFAULT_LIMITS.maxBytesPerOwner) {
      const engine = await create();
      open.push(engine);
      const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
      const deps: ApplicationDeps = { ...engine.depsA(), media: { storage, limits: { ...DEFAULT_LIMITS, maxBytesPerOwner } } };
      const upload = (kind: 'FILE' | 'PHOTO', bytes: Uint8Array, filename: string) => new UploadMediaUseCase(deps).execute(ANDRES, ARGOS.id, { kind, filename, bytes });
      const list = (kind: 'FILE' | 'PHOTO') => new ListMediaUseCase(deps).execute(ANDRES, ARGOS.id, { kind, page: undefined });
      const rows = () => engine.uowA.runInTransaction(async (r) => (await r.media.listPage(ARGOS.id, null, 100, 0)).items);
      return { engine, storage, deps, upload, list, rows };
    }

    it('[SC-005-007][REQ-CLI5-001] PDF, JPEG, PNG y WebP se aceptan como FILE y se listan solo con kind=FILE; un .docx es ERR-MEDIA-TYPE-NOT-ALLOWED sin fila ni objeto', async () => {
      const { storage, upload, list, rows } = await setup();
      const sent = [await upload('FILE', PDF(), 'examen.pdf'), await upload('FILE', JPEG(), 'rx.jpg'), await upload('FILE', PNG(), 'rx.png'), await upload('FILE', WEBP(), 'rx.webp')];
      expect(sent.map((s) => [s.kind, s.mime])).toEqual([
        ['FILE', 'application/pdf'],
        ['FILE', 'image/jpeg'],
        ['FILE', 'image/png'],
        ['FILE', 'image/webp'],
      ]);
      const objects = (await storage.keys()).length;
      expect(await codeOf(upload('FILE', ZIP, 'informe.docx'))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
      expect(await codeOf(upload('FILE', text('hola'), 'nota.docx'))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
      expect([(await rows()).length, (await storage.keys()).length]).toEqual([4, objects]);
      expect((await list('FILE')).total).toBe(4);
      expect((await list('PHOTO')).total).toBe(0);
    });

    it('[SC-005-001][REQ-CLI5-001] 3 fotos y 2 archivos: PHOTO lista 3 y FILE lista 2 (sin cruce); el conteo del álbum son 3', async () => {
      const { deps, upload, list, engine } = await setup();
      for (const n of [1, 2, 3]) await upload('PHOTO', PNG(), `foto-${n}.png`);
      for (const n of [1, 2]) await upload('FILE', PDF(), `examen-${n}.pdf`);
      const files = await list('FILE');
      const photos = await list('PHOTO');
      expect([files.items.map((i) => i.kind), photos.items.map((i) => i.kind)]).toEqual([['FILE', 'FILE'], ['PHOTO', 'PHOTO', 'PHOTO']]);
      expect(await new GetAlbumLimitsUseCase(deps).execute(ANDRES, ARGOS.id)).toEqual({ photoCount: 3, maxPhotosPerPet: 10 });
      expect(await engine.uowA.runInTransaction((r) => r.media.countByPetAndKind(ARGOS.id, 'FILE'))).toBe(2);
    });

    it('[SC-005-006][REQ-CLI5-001] con el álbum en 10 de 10 un archivo clínico se acepta y el conteo del álbum no cambia', async () => {
      const { engine, deps, upload } = await setup();
      await engine.uowA.runInTransaction(async (r) => {
        for (let n = 1; n <= 10; n += 1) await r.media.insert(photoRow(n));
      });
      expect(await codeOf(upload('PHOTO', PNG(), 'once.png'))).toBe('ERR-MEDIA-ALBUM-LIMIT');
      expect(await codeOf(upload('FILE', PDF(), 'radiografia.pdf'))).toBe('OK');
      expect((await new GetAlbumLimitsUseCase(deps).execute(ANDRES, ARGOS.id)).photoCount).toBe(10);
    });

    it('[SC-005-008][REQ-CLI5-003] la cuota es una sola suma: una foto de 600 B deja sin cupo a un archivo de 401 B y, al revés, un archivo de 600 B a una foto de 401 B', async () => {
      const first = await setup(1000);
      await first.upload('PHOTO', PNG(600), 'a.png');
      expect(await codeOf(first.upload('FILE', PDF(401), 'b.pdf'))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
      expect(await codeOf(first.upload('FILE', PDF(400), 'c.pdf'))).toBe('OK');
      const second = await setup(1000);
      await second.upload('FILE', PDF(600), 'a.pdf');
      expect(await codeOf(second.upload('PHOTO', PNG(401), 'b.png'))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
      expect((await second.rows()).length).toBe(1);
      expect((await second.storage.keys()).length).toBe(1);
    });

    it('[SC-005-008][REQ-CLI5-003] borrar una foto libera cuota para un archivo clínico', async () => {
      const { deps, upload } = await setup(1000);
      const photo = await upload('PHOTO', PNG(700), 'a.png');
      expect(await codeOf(upload('FILE', PDF(400), 'b.pdf'))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
      await new DeleteMediaUseCase(deps).execute(ANDRES, ARGOS.id, photo.id);
      expect(await codeOf(upload('FILE', PDF(400), 'b.pdf'))).toBe('OK');
    });
  });
}
persistence('SQLite', createSqliteConcurrentEngine, false);
persistence('PostgreSQL', createPostgresConcurrentEngine, !TEST_DATABASE_URL);

// --- Memoria y SQLite en proceso: permisos de FILE por rol (REQ-CLI5-003, SC-005-009) -----------------------------------------------------------------
const engines: MediaEngine[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.close()));
async function eachEngine(role: HouseholdRole | null, options: EngineOptions, run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(role, options)) {
    engines.push(engine);
    await run(engine);
  }
}

describe('T731 permisos de los archivos clínicos por rol (REQ-CLI5-003, SC-005-009)', () => {
  it('[SC-005-009] el Lector ve y pide acceso a un archivo clínico pero sube y borra con ERR-ACC-FORBIDDEN; el Cuidador sube y no borra; Administrador y propietario suben y borran', async () => {
    const matrix: Array<[HouseholdRole | null, string, boolean, boolean]> = [
      [null, ANDRES, true, true],
      ['ADMIN', MARIA, true, true],
      ['CAREGIVER', MARIA, true, false],
      ['READER', MARIA, false, false],
    ];
    for (const [role, user, canUpload, canDelete] of matrix) {
      await eachEngine(role, {}, async (e) => {
        const seeded = await new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'examen.pdf', bytes: PDF() });
        const forbidden = (allowed: boolean) => (allowed ? 'OK' : 'ERR-ACC-FORBIDDEN');
        expect([role, await codeOf(new UploadMediaUseCase(e.deps).execute(user, ARGOS.id, { kind: 'FILE', filename: 'otro.pdf', bytes: PDF() }))]).toEqual([role, forbidden(canUpload)]);
        const listed = await new ListMediaUseCase(e.deps).execute(user, ARGOS.id, { kind: 'FILE', page: undefined });
        expect(listed.items.some((i) => i.id === seeded.id)).toBe(true);
        expect(await codeOf(new GetMediaAccessUseCase(e.deps).execute(user, ARGOS.id, seeded.id))).toBe('OK');
        expect([role, await codeOf(new DeleteMediaUseCase(e.deps).execute(user, ARGOS.id, seeded.id))]).toEqual([role, forbidden(canDelete)]);
      });
    }
  });

  it('[SC-005-009][SC-005-008] la subida del Lector no deja fila, objeto ni cuota consumida, y la cuota de un archivo del Cuidador cuenta contra el propietario', async () => {
    await eachEngine('READER', { limits: { maxBytesPerOwner: 1000 } }, async (e) => {
      expect(await codeOf(new UploadMediaUseCase(e.deps).execute(MARIA, ARGOS.id, { kind: 'FILE', filename: 'a.pdf', bytes: PDF(900) }))).toBe('ERR-ACC-FORBIDDEN');
      expect([(await e.mediaRows()).length, (await e.storage.keys()).length, await e.queue()]).toEqual([0, 0, []]);
      expect(await codeOf(new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a.pdf', bytes: PDF(900) }))).toBe('OK');
    });
    await eachEngine('CAREGIVER', { limits: { maxBytesPerOwner: 1000 } }, async (e) => {
      await new UploadMediaUseCase(e.deps).execute(MARIA, ARGOS.id, { kind: 'FILE', filename: 'a.pdf', bytes: PDF(900) });
      expect(await codeOf(new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', filename: 'a.png', bytes: PNG(200) }))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
    });
  });
});
