/**
 * T587 [US5] paginación del álbum (REQ-ALB-001, INV-ALB-001, SC-ALM-021): 24 por página, orden determinista `(created_at DESC, id DESC)`, página fuera de
 * rango con total correcto y `page = 0` rechazado. El `loading="lazy"` de cada imagen se prueba en la pantalla (presentation).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, PNG } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const BASE = `/api/pets/${ARGOS.id}/media`;
type Page = { items: Array<{ id: string; createdAt: string }>; page: number; pageSize: number; total: number };

async function seedPhotos(count: number) {
  api = await createApi(undefined, { media: { storage: new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z')), limits: DEFAULT_LIMITS } });
  const cookie = await api.login('andres');
  // Instantes repetidos de a 5 para ejercitar el desempate por id; el reloj fijo se mueve cada 5 subidas.
  for (let n = 0; n < count; n += 1) {
    if (n % 5 === 0) api.clock.setClock('2026-11-05', new Date(Date.parse('2026-11-05T12:00:00.000Z') + (n / 5) * 1000).toISOString());
    const r = await api.call('POST', `${BASE}?kind=PHOTO`, { cookie, raw: PNG(40), headers: { 'x-argos-filename': `f${n}.png`, 'content-type': 'application/octet-stream' } });
    expect(r.status).toBe(201);
  }
  return cookie;
}
const page = async (cookie: string, n: number, kind = 'PHOTO') => (await api.call('GET', `${BASE}?kind=${kind}&page=${n}`, { cookie })).json as Page;

describe('T587 álbum paginado (SC-ALM-021)', () => {
  it('[SC-ALM-021][INV-ALB-001] con 50 fotos las páginas 1, 2 y 3 devuelven 24, 24 y 2, total 50, pageSize 24, sin repetidos y en orden (created_at DESC, id DESC)', async () => {
    const cookie = await seedPhotos(50);
    const pages = [await page(cookie, 1), await page(cookie, 2), await page(cookie, 3)];
    expect(pages.map((p) => [p.items.length, p.total, p.pageSize, p.page])).toEqual([[24, 50, 24, 1], [24, 50, 24, 2], [2, 50, 24, 3]]);
    const all = pages.flatMap((p) => p.items);
    expect(new Set(all.map((i) => i.id)).size).toBe(50);
    const sorted = [...all].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    expect(all.map((i) => i.id)).toEqual(sorted.map((i) => i.id));
  });

  it('[SC-ALM-021] la página 4 y una página enorme devuelven lista vacía con total correcto; page = 0, -1 y no numérico se rechazan con ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const cookie = await seedPhotos(50);
    expect(await page(cookie, 4)).toMatchObject({ items: [], total: 50, page: 4, pageSize: 24 });
    expect(await page(cookie, 999_999)).toMatchObject({ items: [], total: 50 });
    const bad = [];
    for (const value of ['0', '-1', 'abc', '1.5']) bad.push(problemOf(await api.call('GET', `${BASE}?kind=PHOTO&page=${value}`, { cookie })));
    expect(bad).toEqual(Array(4).fill({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }));
  });

  it('[REQ-ALB-001] el filtro por kind separa fotos y archivos; sin elementos devuelve página vacía con total 0', async () => {
    const cookie = await seedPhotos(3);
    expect([(await page(cookie, 1, 'FILE')).total, (await page(cookie, 1, 'PHOTO')).total]).toEqual([0, 3]);
  });

  it('[REQ-ALB-001] el paginado es repetible: dos lecturas seguidas de la misma página devuelven exactamente lo mismo', async () => {
    const cookie = await seedPhotos(30);
    expect(await page(cookie, 1)).toEqual(await page(cookie, 1));
  });
});
