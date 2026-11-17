/**
 * T610 [US4] pruebas de contrato con el doble de GCS caído (SC-ALM-030; REQ-ARC-003, REQ-AVA-001, EDGE-027): las cuatro operaciones con lectura o escritura
 * del objeto responden 502 ERR-MEDIA-STORAGE-UNAVAILABLE con `Cache-Control: no-store`; los dos borrados (`deleteMedia`, `deleteAvatar`) responden 204
 * idempotente con la clave en cola. Cada respuesta se valida contra el OpenAPI 3.1.0 en el arnés `createApi` (estado declarado, tipo de contenido y cuerpo).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const MEDIA = `/api/pets/${ARGOS.id}/media`;
const AVATAR = `/api/pets/${ARGOS.id}/avatar`;
const fileHeaders = { 'x-argos-filename': encodeURIComponent('a.pdf'), 'content-type': 'application/octet-stream' };

describe('T610 GCS caído (SC-ALM-030)', () => {
  it('[SC-ALM-030] getMediaAccess, putAvatar y getAvatar responden 502 ERR-MEDIA-STORAGE-UNAVAILABLE con no-store y conformes al OpenAPI', async () => {
    const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
    api = await createApi(undefined, { media: { storage, limits: DEFAULT_LIMITS } });
    const cookie = await api.login('andres');
    const created = await api.call('POST', `${MEDIA}?kind=FILE`, { cookie, raw: PDF(), headers: fileHeaders });
    await api.call('PUT', AVATAR, { cookie, raw: JPEG(1024), headers: { 'content-type': 'image/jpeg' } });
    storage.down = true;
    const responses = [
      await api.call('GET', `${MEDIA}/${(created.json as { id: string }).id}/access`, { cookie }),
      await api.call('PUT', AVATAR, { cookie, raw: JPEG(1024), headers: { 'content-type': 'image/jpeg' } }),
      await api.call('GET', AVATAR, { cookie }),
    ];
    expect(responses.map((r) => [problemOf(r), r.headers['cache-control']])).toEqual(
      responses.map(() => [{ status: 502, code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' }, 'no-store']),
    );
  });

  it('[SC-ALM-030] deleteMedia y deleteAvatar responden 204 con la clave en la cola (attempts 1, reason DELETE) y el mantenimiento los retira al volver GCS', async () => {
    const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
    api = await createApi(undefined, { media: { storage, limits: DEFAULT_LIMITS } });
    const cookie = await api.login('andres');
    const created = await api.call('POST', `${MEDIA}?kind=FILE`, { cookie, raw: PDF(), headers: fileHeaders });
    await api.call('PUT', AVATAR, { cookie, raw: JPEG(1024), headers: { 'content-type': 'image/jpeg' } });
    storage.down = true;
    const deleted = [
      await api.call('DELETE', `${MEDIA}/${(created.json as { id: string }).id}`, { cookie }),
      await api.call('DELETE', AVATAR, { cookie }),
    ];
    expect(deleted.map((r) => r.status)).toEqual([204, 204]);
    expect(api.db.prepare('SELECT reason, attempts FROM media_deletion_queue ORDER BY object_key').all()).toEqual([
      { reason: 'DELETE', attempts: 1 },
      { reason: 'DELETE', attempts: 1 },
    ]);
    expect((await storage.keys()).length).toBe(2);
    storage.down = false;
    expect(await runMediaQueueMaintenance(api.deps)).toMatchObject({ deleted: 2, failed: 0 });
    expect([await storage.keys(), api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()]).toEqual([[], 0]);
  });
});
