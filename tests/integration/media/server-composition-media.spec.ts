import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';

/**
 * Composición del almacenamiento de medios en `createProductionApp` (REQ-GCS-003, REQ-ARC-003): con `ARGOS_MEDIA_DRIVER=gcs` se
 * construye `GcsMediaStorageAdapter` con el bucket de `app-config.ts`; con `memory` se conserva el adaptador de memoria y `/__dev/media`.
 */
const spies = vi.hoisted(() => ({ storage: vi.fn(), bucket: vi.fn() }));
vi.mock('../../../src/infrastructure/adapters/gcs-media-storage.adapter.ts', () => ({
  createGcsStorage: () => ({ marker: 'storage' }),
  GcsMediaStorageAdapter: class {
    readonly kind = 'gcs';
    constructor(options: { bucket: string }) {
      spies.bucket(options.bucket);
      spies.storage();
    }
  },
}));

const PET = '8d3a4c32-7a9b-4f3e-9a58-2b5ad8b6f001';
let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'argos-media-comp-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function statuses(extra: Record<string, string>): Promise<{ media: number; hasDevRoute: boolean }> {
  const { createProductionApp } = await import('../../../src/infrastructure/http/server.ts');
  const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, `${Math.random()}.sqlite`), ...extra }), false);
  try {
    const media = await app.inject({ method: 'GET', url: `/api/pets/${PET}/media` });
    const dev = await app.inject({ method: 'GET', url: '/__dev/media/pets/x/y' });
    // Sin ruta de desarrollo: si existe dist/ responde el fallback SPA (text/html); en CI (sin dist/) Fastify responde 404 de ruta no registrada.
    const hasDevRoute = !String(dev.headers['content-type']).startsWith('text/html') && !dev.body.includes('Route GET:/__dev/media/pets/x/y not found');
    return { media: media.statusCode, hasDevRoute };
  } finally {
    await app.close();
  }
}

describe('composición de medios en createProductionApp', () => {
  it('[REQ-GCS-003] con driver gcs construye el adaptador GCS con el bucket de la configuración, compone las rutas de medios (401 sin sesión) y no expone /__dev/media (cae al fallback o 404)', async () => {
    const result = await statuses({ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-media-test' });
    expect([result, spies.bucket.mock.calls]).toEqual([{ media: 401, hasDevRoute: false }, [['argos-media-test']]]);
  });

  it('[REQ-GCS-003] con driver memory no construye el adaptador GCS y conserva las rutas de medios y /__dev/media', async () => {
    spies.bucket.mockClear();
    const result = await statuses({ ARGOS_MEDIA_DRIVER: 'memory' });
    expect([result, spies.bucket.mock.calls]).toEqual([{ media: 401, hasDevRoute: true }, []]);
  });
});
