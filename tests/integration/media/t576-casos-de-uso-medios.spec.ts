/**
 * T576 [US4] casos de uso de subida, listado, acceso y borrado de medios (REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ARC-005, REQ-GCS-006,
 * INV-ARC-001..004, SC-ALM-003..010, SC-ALM-013, SC-ALM-026). Cada prueba corre sobre la unidad de trabajo en memoria y sobre SQLite.
 * Orden de validación: acceso (404 antes que 403) → tamaño → firma → tipo para `kind` → cuota → intención previa → put → transacción final.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DeleteMediaUseCase, GetMediaAccessUseCase, ListMediaUseCase, UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import type { HouseholdRole } from '../../fixtures/record-engines.ts';
import { ARGOS, JPEG, LUCIA, PDF, PNG, WEBP, codeOf, createMediaEngines, errorOf, text, type EngineOptions, type MediaEngine } from '../../fixtures/media-harness.ts';
import { ANDRES, MARIA } from '../../fixtures/application-harness.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));

async function eachEngine(role: HouseholdRole | null, options: EngineOptions, run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(role, options)) {
    open.push(engine);
    await run(engine);
  }
}
const upload = (e: MediaEngine, userId: string, kind: unknown, bytes: Uint8Array, filename: string | null = 'a.pdf', petId = ARGOS.id) =>
  new UploadMediaUseCase(e.deps).execute(userId, petId, { kind, filename, bytes });

describe('T576 subida: validación en orden y tipo por firma (REQ-ARC-001, INV-ARC-001, INV-ARC-002)', () => {
  it('[SC-ALM-003] un PDF válido se crea como application/pdf; un PNG llamado foto.pdf es image/png; el Content-Type del cliente no existe en el caso de uso', async () => {
    await eachEngine(null, {}, async (e) => {
      const pdf = await upload(e, ANDRES, 'FILE', PDF(), 'consulta.pdf');
      const png = await upload(e, ANDRES, 'FILE', PNG(), 'foto.pdf');
      expect([e.name, pdf.mime, pdf.originalName, png.mime, png.originalName]).toEqual([e.name, 'application/pdf', 'consulta.pdf', 'image/png', 'foto.png']);
      expect(Object.keys(pdf).sort()).toEqual(['createdAt', 'id', 'kind', 'mime', 'originalName', 'petId', 'sizeBytes']);
      expect((await e.mediaRows()).map((m) => m.mime).sort()).toEqual(['application/pdf', 'image/png']);
    });
  });

  it('[SC-ALM-004][INV-ARC-002] SVG, HTML, un .txt que empieza con <script, un .pdf cuyo contenido es HTML y un ejecutable MZ reciben 415 y no dejan objeto, fila ni cola', async () => {
    await eachEngine(null, {}, async (e) => {
      const attempts: Array<[string, Uint8Array]> = [
        ['a.svg', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
        ['a.html', text('<!DOCTYPE html><html></html>')],
        ['a.txt', text('<script>alert(1)</script>')],
        ['a.pdf', text('  <html><body>no soy pdf</body></html>')],
        ['a.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])],
      ];
      const codes = [];
      for (const [name, bytes] of attempts) codes.push(await codeOf(upload(e, ANDRES, 'FILE', bytes, name)));
      expect(codes).toEqual(Array(5).fill('ERR-MEDIA-TYPE-NOT-ALLOWED'));
      expect([await e.mediaRows(), await e.queue(), await e.storage.keys()]).toEqual([[], [], []]);
    });
  });

  it('[SC-ALM-005] 10 485 761 bytes y 32 MiB son 413; 0 bytes es 415; exactamente 10 485 760 bytes válidos se acepta', async () => {
    await eachEngine(null, {}, async (e) => {
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF(10_485_761)))).toBe('ERR-MEDIA-TOO-LARGE');
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF(32 * 1024 * 1024)))).toBe('ERR-MEDIA-TOO-LARGE');
      expect(await codeOf(upload(e, ANDRES, 'FILE', new Uint8Array(0)))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
      expect([await e.mediaRows(), await e.queue()]).toEqual([[], []]);
      const ok = await upload(e, ANDRES, 'FILE', PDF(10_485_760));
      expect(ok.sizeBytes).toBe(10_485_760);
    });
  });

  it('[SC-ALM-006] kind PHOTO con un PDF se rechaza; un .docx, un .xlsx y un .txt como FILE también', async () => {
    await eachEngine(null, {}, async (e) => {
      expect(await codeOf(upload(e, ANDRES, 'PHOTO', PDF()))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
      const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      for (const bytes of [zip, zip, text('hola mundo')]) expect(await codeOf(upload(e, ANDRES, 'FILE', bytes, 'a.docx'))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
      expect((await upload(e, ANDRES, 'PHOTO', JPEG(), 'f.jpg')).kind).toBe('PHOTO');
      expect((await upload(e, ANDRES, 'PHOTO', WEBP(), 'f.webp')).mime).toBe('image/webp');
    });
  });

  it('[REQ-ARC-001] un kind distinto de FILE o PHOTO es ERR-SCHEMA-VALIDATION-FAILED (campo kind)', async () => {
    await eachEngine(null, {}, async (e) => {
      for (const kind of [undefined, 'AUDIO', 'file', 7]) {
        const error = await errorOf(upload(e, ANDRES, kind, PDF()));
        expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'kind']);
      }
    });
  });

  it('[SC-ALM-007][INV-ARC-003] el nombre ../../etc/passwd\\u0000.pdf queda saneado y la clave solo contiene pets/<uuid>/files/<uuid>', async () => {
    await eachEngine(null, {}, async (e) => {
      const item = await upload(e, ANDRES, 'FILE', PDF(), '../../etc/passwd\u0000.pdf');
      expect(item.originalName).toBe('....etcpasswd.pdf');
      expect(await e.storage.keys()).toEqual([`pets/${ARGOS.id}/files/${item.id}`]);
    });
  });

  it('[REQ-ARC-004] sin nombre (cabecera ausente) el nombre es archivo.<extensión canónica>', async () => {
    await eachEngine(null, {}, async (e) => {
      expect((await upload(e, ANDRES, 'FILE', JPEG(), null)).originalName).toBe('archivo.jpg');
    });
  });
});

describe('T576 permisos de medios por rol (REQ-ARC-002, INV-ACC2-001, INV-ACC2-002)', () => {
  it('[SC-ALM-008] sube Propietario, Administrador y Cuidador; el Lector recibe 403; borran Propietario y Administrador; los cuatro listan y piden acceso', async () => {
    const matrix: Array<[HouseholdRole | null, string, boolean, boolean]> = [
      [null, ANDRES, true, true],
      ['ADMIN', MARIA, true, true],
      ['CAREGIVER', MARIA, true, false],
      ['READER', MARIA, false, false],
    ];
    for (const [role, user, canUpload, canDelete] of matrix) {
      await eachEngine(role, {}, async (e) => {
        const seeded = await upload(e, ANDRES, 'FILE', PDF());
        expect(await codeOf(upload(e, user, 'FILE', PDF()))).toBe(canUpload ? 'OK' : 'ERR-ACC-FORBIDDEN');
        expect(await codeOf(new ListMediaUseCase(e.deps).execute(user, ARGOS.id, { kind: 'FILE', page: undefined }))).toBe('OK');
        expect(await codeOf(new GetMediaAccessUseCase(e.deps).execute(user, ARGOS.id, seeded.id))).toBe('OK');
        expect(await codeOf(new DeleteMediaUseCase(e.deps).execute(user, ARGOS.id, seeded.id))).toBe(canDelete ? 'OK' : 'ERR-ACC-FORBIDDEN');
      });
    }
  });

  it('[SC-ALM-009] un usuario sin acceso recibe ERR-PET-NOT-FOUND en todas las operaciones, con el mismo cuerpo que una mascota inexistente', async () => {
    await eachEngine(null, {}, async (e) => {
      const seeded = await upload(e, ANDRES, 'FILE', PDF());
      const ghost = '99999999-9999-4999-8999-999999999999';
      const calls = (petId: string) => [
        () => upload(e, LUCIA, 'FILE', PDF(), 'a.pdf', petId),
        () => new ListMediaUseCase(e.deps).execute(LUCIA, petId, { kind: 'FILE', page: undefined }),
        () => new GetMediaAccessUseCase(e.deps).execute(LUCIA, petId, seeded.id),
        () => new DeleteMediaUseCase(e.deps).execute(LUCIA, petId, seeded.id),
      ];
      const real = await Promise.all(calls(ARGOS.id).map((c) => errorOf(c())));
      const missing = await Promise.all(calls(ghost).map((c) => errorOf(c())));
      expect(real.map((x) => [x.code, x.status, x.detail, x.field])).toEqual(missing.map((x) => [x.code, x.status, x.detail, x.field]));
      expect(real.map((x) => x.code)).toEqual(Array(4).fill('ERR-PET-NOT-FOUND'));
      expect(await e.mediaRows()).toHaveLength(1);
    });
  });

  it('[REQ-ARC-002] un medio de otra mascota (mediaId ajeno a la mascota de la ruta) es ERR-MEDIA-NOT-FOUND', async () => {
    await eachEngine(null, {}, async (e) => {
      const item = await upload(e, ANDRES, 'FILE', PDF());
      const otherPet = (await e.run((r) => r.pets.listByOwners([ANDRES]))).find((p) => p.id !== ARGOS.id)!;
      expect(await codeOf(new GetMediaAccessUseCase(e.deps).execute(ANDRES, otherPet.id, item.id))).toBe('ERR-MEDIA-NOT-FOUND');
      expect(await codeOf(new DeleteMediaUseCase(e.deps).execute(ANDRES, otherPet.id, item.id))).toBe('ERR-MEDIA-NOT-FOUND');
      expect(await e.mediaRows()).toHaveLength(1);
    });
  });
});

describe('T576 acceso por URL firmada (REQ-ARC-003, INV-ARC-004, SC-ALM-010, SC-ALM-030)', () => {
  it('[SC-ALM-010] devuelve {url, expiresAt, mime} sin disposition, con TTL 300 y nombre neutro (nunca el original)', async () => {
    await eachEngine(null, {}, async (e) => {
      const photo = await upload(e, ANDRES, 'PHOTO', PNG(), 'mi-foto-privada.png');
      const file = await upload(e, ANDRES, 'FILE', PDF(), 'historial-clinico.pdf');
      const access = new GetMediaAccessUseCase(e.deps);
      const a = await access.execute(ANDRES, ARGOS.id, photo.id);
      const b = await access.execute(ANDRES, ARGOS.id, file.id);
      expect(Object.keys(a).sort()).toEqual(['expiresAt', 'mime', 'url']);
      expect([a.mime, b.mime]).toEqual(['image/png', 'application/pdf']);
      expect(a.url).toContain(`pets/${ARGOS.id}/photos/${photo.id}`);
      expect(new Date(a.expiresAt).getTime() - new Date(e.clock.nowIsoTimestamp()).getTime()).toBe(300_000);
      expect(`${a.url}${b.url}`).not.toMatch(/privada|historial|clinico/);
    });
  });

  it('[SC-ALM-030] con el almacenamiento caído getMediaAccess es ERR-MEDIA-STORAGE-UNAVAILABLE y deleteMedia sigue funcionando', async () => {
    await eachEngine(null, {}, async (e) => {
      const item = await upload(e, ANDRES, 'FILE', PDF());
      e.storage.down = true;
      expect(await codeOf(new GetMediaAccessUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id))).toBe('ERR-MEDIA-STORAGE-UNAVAILABLE');
      expect(await codeOf(new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id))).toBe('OK');
    });
  });

  it('[REQ-ARC-003] un medio inexistente es ERR-MEDIA-NOT-FOUND', async () => {
    await eachEngine(null, {}, async (e) => {
      expect(await codeOf(new GetMediaAccessUseCase(e.deps).execute(ANDRES, ARGOS.id, '99999999-9999-4999-8999-999999999999'))).toBe('ERR-MEDIA-NOT-FOUND');
    });
  });
});

describe('T576 cuota por propietario (REQ-ARC-005, SC-ALM-013)', () => {
  it('[SC-ALM-013] con la cuota agotada la subida es 409 ERR-MEDIA-QUOTA-EXCEEDED, sin objeto ni cola; la cuota suma todas las mascotas del propietario', async () => {
    await eachEngine(null, { limits: { maxBytesPerOwner: 1000 } }, async (e) => {
      const otherPet = (await e.run((r) => r.pets.listByOwners([ANDRES]))).find((p) => p.id !== ARGOS.id)!;
      await upload(e, ANDRES, 'FILE', PDF(600), 'a.pdf', ARGOS.id);
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF(401), 'b.pdf', otherPet.id))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
      expect(await e.queue()).toEqual([]);
      expect(await e.storage.keys()).toHaveLength(1);
      await upload(e, ANDRES, 'FILE', PDF(400), 'c.pdf', otherPet.id);
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF(64), 'd.pdf', ARGOS.id))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
    });
  });

  it('[SC-ALM-013] la cuota es del propietario legal: lo que sube un Cuidador cuenta contra el propietario', async () => {
    await eachEngine('CAREGIVER', { limits: { maxBytesPerOwner: 1000 } }, async (e) => {
      await upload(e, MARIA, 'FILE', PDF(900));
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF(200)))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
    });
  });

  it('[SC-ALM-013] no hay tope de elementos por mascota: 101 archivos pequeños se aceptan', async () => {
    await eachEngine(null, {}, async (e) => {
      for (let n = 0; n < 101; n += 1) await upload(e, ANDRES, 'FILE', PDF(16), `n${n}.pdf`);
      expect(await e.mediaRows(ARGOS.id)).toHaveLength(101);
    });
  });
});

describe('T576 intención previa, permiso y cuota re-verificados en la transacción final (REQ-GCS-006, REQ-BOR-005, SC-ALM-026)', () => {
  it('[REQ-GCS-006] mientras el put está en vuelo existe la fila INTENT de la clave; al terminar la subida la fila desaparece', async () => {
    await eachEngine(null, {}, async (e) => {
      let seen: Array<{ objectKey: string; reason: string }> = [];
      e.storage.beforePut = async () => {
        seen = await e.queue();
      };
      const item = await upload(e, ANDRES, 'FILE', PDF());
      expect(seen).toEqual([expect.objectContaining({ objectKey: `pets/${ARGOS.id}/files/${item.id}`, reason: 'INTENT' })]);
      expect(await e.queue()).toEqual([]);
    });
  });

  it('[SC-ALM-025] si el put falla la respuesta es ERR-MEDIA-STORAGE-UNAVAILABLE, no hay fila de medios y la fila INTENT queda para el mantenimiento', async () => {
    await eachEngine(null, {}, async (e) => {
      e.storage.failing.add('put');
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF()))).toBe('ERR-MEDIA-STORAGE-UNAVAILABLE');
      expect(await e.mediaRows()).toEqual([]);
      expect(await e.queue()).toEqual([expect.objectContaining({ reason: 'INTENT', attempts: 0 })]);
    });
  });

  it('[SC-ALM-026] dos subidas con 1 byte de cuota restante: una se acepta, la otra recibe 409 y su objeto se borra', async () => {
    await eachEngine(null, { limits: { maxBytesPerOwner: 128 } }, async (e) => {
      // El put de la primera subida espera a que la segunda también haya pasado la comprobación previa y escrito su objeto.
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let puts = 0;
      e.storage.beforePut = async () => {
        puts += 1;
        if (puts === 2) release();
        await gate;
      };
      const results = await Promise.all([codeOf(upload(e, ANDRES, 'FILE', PDF(64), 'a.pdf')), codeOf(upload(e, ANDRES, 'FILE', PDF(65), 'b.pdf'))]);
      expect(results.slice().sort()).toEqual(['ERR-MEDIA-QUOTA-EXCEEDED', 'OK']);
      const rows = await e.mediaRows();
      expect(rows).toHaveLength(1);
      expect(await e.storage.keys()).toEqual([`pets/${ARGOS.id}/files/${rows[0]!.id}`]);
      expect(await e.queue()).toEqual([]);
    });
  });

  it('[SC-ALM-026][REQ-ARC-002] una subida cuyo rol baja a Lector durante la transmisión recibe 403 y su objeto se borra', async () => {
    await eachEngine('CAREGIVER', {}, async (e) => {
      e.storage.beforePut = async () => {
        await e.run(async (r) => {
          const membership = (await r.households.listMembershipsOfUsers([MARIA])).find((m) => m.status === 'ACTIVE')!;
          await r.households.saveMembership({ ...membership, role: 'READER' }); // cambio de rol a Lector durante la transmisión
        });
      };
      expect(await codeOf(upload(e, MARIA, 'FILE', PDF()))).toBe('ERR-ACC-FORBIDDEN');
      expect([await e.mediaRows(), await e.storage.keys(), await e.queue()]).toEqual([[], [], []]);
    });
  });

  it('[SC-ALM-026][EDGE-013] si la mascota se elimina durante la transmisión la subida es ERR-PET-NOT-FOUND y el objeto se borra', async () => {
    await eachEngine(null, {}, async (e) => {
      e.storage.beforePut = async () => {
        await e.run(async (r) => {
          await r.mediaQueue.enqueueObjectsOfPet(ARGOS.id, e.clock.nowIsoTimestamp());
          await r.pets.delete(ARGOS.id);
        });
      };
      expect(await codeOf(upload(e, ANDRES, 'FILE', PDF()))).toBe('ERR-PET-NOT-FOUND');
      expect([await e.mediaRows(), await e.storage.keys(), await e.queue()]).toEqual([[], [], []]);
    });
  });
});

describe('T576 auditoría PET_MEDIA (REQ-AUD-001, REQ-ARC-001)', () => {
  it('[REQ-AUD-001] subir crea una fila CREATE y borrar una fila DELETE con el id del medio; sin nombre ni clave en la fila', async () => {
    await eachEngine(null, {}, async (e) => {
      const item = await upload(e, ANDRES, 'FILE', PDF(), 'secreto.pdf');
      await new DeleteMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, item.id);
      const rows = await e.audit('PET_MEDIA');
      expect(rows.map((r) => [r.mutationType, r.entityId, r.previousStateHash === null, r.newStateHash === null])).toEqual([
        ['CREATE', item.id, true, false],
        ['DELETE', item.id, false, true],
      ]);
      expect(JSON.stringify(rows)).not.toMatch(/secreto|pets\//);
    });
  });

  it('[REQ-AUD-001] un rechazo (415, 403, 404) no escribe auditoría', async () => {
    await eachEngine('READER', {}, async (e) => {
      await codeOf(upload(e, ANDRES, 'FILE', text('<svg>')));
      await codeOf(upload(e, MARIA, 'FILE', PDF()));
      await codeOf(upload(e, LUCIA, 'FILE', PDF()));
      expect(await e.audit('PET_MEDIA')).toEqual([]);
    });
  });
});
