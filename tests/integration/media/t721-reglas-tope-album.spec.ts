/**
 * T721 [US1] reglas del tope de fotos del álbum (REQ-ALB5-002, REQ-ALB5-003, REQ-ALB5-004, REQ-ALB5-005, REQ-PRM-002; SC-005-004, SC-005-005, SC-005-006,
 * SC-005-034). Memoria y SQLite:
 *  - mascota con 14 fotos de la 004: las 14 se listan, se pueden borrar y la subida sigue bloqueada hasta bajar del tope (9 fotos);
 *  - los `FILE` no cuentan para el tope; el parámetro en 12 acepta la undécima y la duodécima y rechaza la decimotercera;
 *  - orden tipo -> tope -> cuota (un rechazo por tope no consume cuota);
 *  - `getAlbumLimits`: `{photoCount, maxPhotosPerPet}`, legible por un lector, 404 para una mascota ajena.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformParameterPort } from '../../../src/application/ports/platform-parameter.port.ts';
import type { PetMediaRecord } from '../../../src/application/ports/repositories.port.ts';
import { DeleteMediaUseCase, GetAlbumLimitsUseCase, ListMediaUseCase, UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import { ANDRES, ARGOS, LUCIA, MARIA, PDF, PNG, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';
import type { EngineOptions } from '../../fixtures/media-harness.ts';
import type { HouseholdRole } from '../../fixtures/record-engines.ts';

const LIMIT = 'ERR-MEDIA-ALBUM-LIMIT';
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
const row = (n: number, kind: 'PHOTO' | 'FILE' = 'PHOTO'): PetMediaRecord => ({
  id: `f0000000-0000-4000-8000-0000000006${String(n).padStart(2, '0')}`,
  petId: ARGOS.id,
  kind,
  mime: kind === 'PHOTO' ? 'image/png' : 'application/pdf',
  sizeBytes: 1,
  originalName: kind === 'PHOTO' ? `f${n}.png` : `a${n}.pdf`,
  createdAt: `2026-11-05T11:00:${String(n).padStart(2, '0')}.000Z`,
});
const fixedParameter = (value: number): PlatformParameterPort => ({ getInt: async () => value });

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
async function eachEngine(role: HouseholdRole | null, options: EngineOptions, run: (e: MediaEngine) => Promise<void>) {
  for (const e of await createMediaEngines(role, options)) {
    open.push(e);
    await run(e);
  }
}
const seed = (e: MediaEngine, photos: number, files = 0) =>
  e.run(async (r) => {
    for (let n = 1; n <= photos; n += 1) await r.media.insert(row(n));
    for (let n = 1; n <= files; n += 1) await r.media.insert(row(50 + n, 'FILE'));
  });
const photo = (e: MediaEngine, bytes: Uint8Array = PNG()) => new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', filename: 'n.png', bytes });
const photoCount = async (e: MediaEngine) => (await e.mediaRows()).filter((m) => m.kind === 'PHOTO').length;

describe('T721 mascota con 14 fotos de la 004 (SC-005-005, EDGE-005-01, REQ-ALB5-003, REQ-ALB5-004)', () => {
  it('[SC-005-005] el listado muestra las 14, se pueden borrar y la subida falla hasta quedar por debajo del tope (9 fotos)', async () => {
    await eachEngine(null, {}, async (e) => {
      await seed(e, 14);
      const page = await new ListMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', page: undefined });
      expect([e.name, page.items.length, page.total]).toEqual([e.name, 14, 14]);
      for (let remaining = 14; remaining >= 10; remaining -= 1) {
        expect([e.name, remaining, await codeOf(photo(e))]).toEqual([e.name, remaining, LIMIT]);
        await new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, row(remaining).id);
      }
      expect(await photoCount(e)).toBe(9);
      expect(await codeOf(photo(e))).toBe('OK'); // 9 -> 10
      expect(await codeOf(photo(e))).toBe(LIMIT); // 10: otra vez completo
      expect(await photoCount(e)).toBe(10);
    });
  });
});

describe('T721 los archivos clínicos no cuentan y el parámetro manda (SC-005-004, SC-005-006)', () => {
  it('[SC-005-006] con 10 fotos y 3 archivos clínicos, subir un FILE se acepta y no cambia el conteo de fotos', async () => {
    await eachEngine(null, {}, async (e) => {
      await seed(e, 10, 3);
      const file = await new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a.pdf', bytes: PDF() });
      expect([e.name, file.kind, await photoCount(e)]).toEqual([e.name, 'FILE', 10]);
      expect(await new GetAlbumLimitsUseCase(e.deps).execute(ANDRES, ARGOS.id)).toEqual({ photoCount: 10, maxPhotosPerPet: 10 });
    });
  });

  it('[SC-005-004] con album.max_photos_per_pet = 12 y 10 fotos: la undécima y la duodécima se aceptan y la decimotercera se rechaza', async () => {
    await eachEngine(null, { platformParameters: fixedParameter(12) }, async (e) => {
      await seed(e, 10);
      expect([e.name, await codeOf(photo(e)), await codeOf(photo(e)), await codeOf(photo(e))]).toEqual([e.name, 'OK', 'OK', LIMIT]);
      expect(await photoCount(e)).toBe(12);
    });
  });

  it('[REQ-PRM-002][INV-005-003] sin puerto de parámetros rige el valor del código (10); con el parámetro bajo a 5 y 7 fotos se conservan las 7 y se bloquea la subida', async () => {
    await eachEngine(null, {}, async (e) => {
      await seed(e, 10);
      expect([e.name, await codeOf(photo(e))]).toEqual([e.name, LIMIT]);
    });
    await eachEngine(null, { platformParameters: fixedParameter(5) }, async (e) => {
      await seed(e, 7);
      expect([e.name, await codeOf(photo(e)), await photoCount(e)]).toEqual([e.name, LIMIT, 7]);
      expect((await new ListMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'PHOTO', page: undefined })).total).toBe(7);
    });
  });

  it('[REQ-ALB5-002] orden tipo -> tope -> cuota: en el tope un PDF como PHOTO es 415 (tipo primero) y, sin cuota, un rechazo por tope no consume cuota (ERR-MEDIA-ALBUM-LIMIT, no QUOTA)', async () => {
    await eachEngine(null, { limits: { maxBytesPerOwner: 10 } }, async (e) => {
      await seed(e, 10); // 10 bytes: la cuota ya está agotada
      expect([e.name, await codeOf(photo(e, PDF()))]).toEqual([e.name, 'ERR-MEDIA-TYPE-NOT-ALLOWED']);
      expect(await codeOf(photo(e))).toBe(LIMIT);
      expect(await e.storage.keys()).toEqual([]);
    });
  });
});

describe('T721 getAlbumLimits (REQ-ALB5-005, SC-005-034)', () => {
  it('[SC-005-034] 7 fotos y tope 10 => {7, 10}; con el parámetro en 12 => {7, 12}; un archivo clínico no suma', async () => {
    await eachEngine(null, {}, async (e) => {
      await seed(e, 7, 2);
      expect([e.name, await new GetAlbumLimitsUseCase(e.deps).execute(ANDRES, ARGOS.id)]).toEqual([e.name, { photoCount: 7, maxPhotosPerPet: 10 }]);
    });
    await eachEngine(null, { platformParameters: fixedParameter(12) }, async (e) => {
      await seed(e, 7);
      expect(await new GetAlbumLimitsUseCase(e.deps).execute(ANDRES, ARGOS.id)).toEqual({ photoCount: 7, maxPhotosPerPet: 12 });
    });
  });

  it('[SC-005-034] un lector (READ_MEDIA) puede leerlo; un usuario sin acceso recibe ERR-PET-NOT-FOUND igual que con una mascota inexistente', async () => {
    await eachEngine('READER', {}, async (e) => {
      await seed(e, 3);
      expect([e.name, await codeOf(new GetAlbumLimitsUseCase(e.deps).execute(MARIA, ARGOS.id))]).toEqual([e.name, 'OK']);
      expect(await codeOf(new GetAlbumLimitsUseCase(e.deps).execute(LUCIA, ARGOS.id))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(new GetAlbumLimitsUseCase(e.deps).execute(ANDRES, '99999999-9999-4999-8999-999999999999'))).toBe('ERR-PET-NOT-FOUND');
    });
  });
});
