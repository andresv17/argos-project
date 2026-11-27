/**
 * T1543 [US7, Bloque G, #62] álbum del hogar compuesto EN LA INTERFAZ sobre `GET /pets/{petId}/media?kind=PHOTO` de 004 (D11-11, MIF-011-03 = SÍ; sin caso de uso, ruta
 * ni contrato nuevos): solo `PHOTO` (los archivos clínicos y la foto del hogar quedan fuera), grupos por mascota en orden alfabético con homónimas desempatadas por id, las más
 * recientes primero (orden del servidor), 24 fotos por mascota con carga progresiva por mascota, y sin saltos ni repeticiones ante borrado entre páginas (EDGE-011-017).
 * Las mascotas sin permiso efectivo (403/404 del endpoint de 004) no aparecen (REQ-RBAC-001, REQ-ALB11-002).
 *
 * @implements REQ-ALB11-001, REQ-ALB11-002, REQ-ALB11-003, SC-011-045, SC-011-046, SC-011-047, SC-011-048, SC-011-049, SC-011-050, SC-011-051, SC-011-052, EDGE-011-006, EDGE-011-017, REQ-RBAC-001
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdAlbumView, type HouseholdAlbumViewProps } from '../../../src/presentation/web/components/HouseholdAlbum.tsx';
import { hasMorePhotos, loadFirstPage, loadHouseholdAlbum, loadMorePhotos, sortAlbumPets, type AlbumListApi } from '../../../src/presentation/web/household-album.ts';
import { MediaApiError, type MediaItem, type MediaPage } from '../../../src/presentation/web/media-api.ts';
import { ALBUM_PAGE_SIZE } from '../../../src/presentation/web/media-view.ts';

const read = (path: string): string => readFileSync(path, 'utf8');
const noop = (): void => undefined;
const petId = (n: number): string => `11111111-1111-4111-8111-1111111112${String(n).padStart(2, '0')}`;
const photo = (pet: string, n: number): MediaItem => ({ id: `55555555-5555-4555-8555-${pet.slice(-4)}${String(n).padStart(8, '0')}`, petId: pet, kind: 'PHOTO', mime: 'image/jpeg', sizeBytes: 10, originalName: `f${n}.jpg`, createdAt: `2026-11-${String(10 + (n % 10)).padStart(2, '0')}T10:00:00.000Z` });

/** Servidor simulado de 004: por mascota, lista más recientes primero (índice 0 = más reciente), 24 por página, y registra cada llamada. */
function fakeApi(rows: Record<string, MediaItem[]>, denied: Record<string, number> = {}) {
  const calls: Array<{ petId: string; kind: string | undefined; page: number }> = [];
  const api: AlbumListApi = {
    async list(id, kind, page): Promise<MediaPage> {
      calls.push({ petId: id, kind, page });
      const status = denied[id];
      if (status !== undefined) throw new MediaApiError(status === 404 ? 'ERR-PET-NOT-FOUND' : 'ERR-ACC-FORBIDDEN', status);
      const all = (rows[id] ?? []).filter((m) => kind === undefined || m.kind === kind);
      return { items: all.slice((page - 1) * ALBUM_PAGE_SIZE, page * ALBUM_PAGE_SIZE), page, pageSize: 24, total: all.length };
    },
  };
  return { api, calls, rows };
}

describe('T1543 orden alfabético por mascota (REQ-ALB11-001, EDGE-011-017)', () => {
  it('[SC-011-045] alfabético sin distinguir mayúsculas ni tildes; homónimas por id estable; el cambio de nombre reordena sin duplicar la mascota', () => {
    const pets = [
      { id: petId(3), name: 'luna' },
      { id: petId(2), name: 'Álvaro' },
      { id: petId(5), name: 'Luna' },
      { id: petId(1), name: 'Bruno' },
    ];
    expect(sortAlbumPets(pets).map((p) => p.id)).toEqual([petId(2), petId(1), petId(3), petId(5)]);
    expect(sortAlbumPets([...pets].reverse()).map((p) => p.id)).toEqual([petId(2), petId(1), petId(3), petId(5)]);
    const renamed = pets.map((p) => (p.id === petId(1) ? { ...p, name: 'Zeta' } : p));
    const order = sortAlbumPets(renamed).map((p) => p.id);
    expect(order).toEqual([petId(2), petId(3), petId(5), petId(1)]);
    expect(new Set(order).size).toBe(4);
  });
});

describe('T1543 solo PHOTO y solo lo visible (REQ-ALB11-001, REQ-ALB11-002, REQ-RBAC-001)', () => {
  it('[SC-011-045] pide SIEMPRE kind=PHOTO (archivos clínicos fuera), una consulta por mascota, y agrupa 2 mascotas x 3 fotos = 6 sin foto del hogar', async () => {
    const rows = { [petId(1)]: [1, 2, 3].map((n) => photo(petId(1), n)), [petId(2)]: [1, 2, 3].map((n) => photo(petId(2), n)) };
    const { api, calls } = fakeApi(rows);
    const groups = await loadHouseholdAlbum(api, [{ id: petId(2), name: 'Zafiro' }, { id: petId(1), name: 'Argos' }]);
    expect(groups.map((g) => g.petName)).toEqual(['Argos', 'Zafiro']);
    expect(groups.flatMap((g) => g.items)).toHaveLength(6);
    expect(calls.every((c) => c.kind === 'PHOTO' && c.page === 1)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('[SC-011-046][REQ-ALB11-002] una mascota que el endpoint de 004 niega (403 o 404) no aparece ni deja rastro; un fallo distinto se muestra como error de ESA mascota', async () => {
    const rows = { [petId(1)]: [photo(petId(1), 1)], [petId(2)]: [photo(petId(2), 1)], [petId(3)]: [photo(petId(3), 1)] };
    const { api } = fakeApi(rows, { [petId(2)]: 403, [petId(3)]: 404 });
    const groups = await loadHouseholdAlbum(api, [{ id: petId(1), name: 'A' }, { id: petId(2), name: 'B' }, { id: petId(3), name: 'C' }]);
    expect(groups.map((g) => g.petId)).toEqual([petId(1)]);
    const broken: AlbumListApi = { list: async () => { throw new MediaApiError('ERR-INTERNAL-UNEXPECTED', 500); } };
    const [failed] = await loadHouseholdAlbum(broken, [{ id: petId(1), name: 'A' }]);
    expect([failed!.status, failed!.items]).toEqual(['ERROR', []]);
  });

  it('[SC-011-047] una mascota sin fotos (p. ej. fallecida asignada) conserva su grupo vacío en READY', async () => {
    const { api } = fakeApi({});
    const [group] = await loadFirstPage(api, { id: petId(1), name: 'Nube' }).then((g) => [g]);
    expect([group!.status, group!.total, group!.items]).toEqual(['READY', 0, []]);
  });
});

describe('T1543 24 por mascota con carga progresiva (REQ-ALB11-003, EDGE-011-017)', () => {
  const sixty = (id: string): MediaItem[] => Array.from({ length: 60 }, (_, i) => photo(id, 60 - i));

  it('[SC-011-048] primera carga = 24 fotos de esa mascota; «cargar más» añade 24 y luego 12 sin repetir; hasMorePhotos se apaga al llegar al total', async () => {
    const { api, calls } = fakeApi({ [petId(1)]: sixty(petId(1)) });
    let group = await loadFirstPage(api, { id: petId(1), name: 'Argos' });
    expect([group.items.length, group.total, hasMorePhotos(group)]).toEqual([24, 60, true]);
    group = await loadMorePhotos(api, group);
    group = await loadMorePhotos(api, group);
    expect([group.items.length, hasMorePhotos(group)]).toEqual([60, false]);
    expect(new Set(group.items.map((m) => m.id)).size).toBe(60);
    expect(group.items.map((m) => m.id)).toEqual(sixty(petId(1)).map((m) => m.id));
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it('[SC-011-049] otra mascota no se mueve al cargar más de la primera (carga independiente por mascota)', async () => {
    const { api, calls } = fakeApi({ [petId(1)]: sixty(petId(1)), [petId(2)]: sixty(petId(2)) });
    const groups = await loadHouseholdAlbum(api, [{ id: petId(1), name: 'A' }, { id: petId(2), name: 'B' }]);
    const before = calls.length;
    await loadMorePhotos(api, groups[0]!);
    expect(calls.slice(before).every((c) => c.petId === petId(1))).toBe(true);
    expect(groups[1]!.items).toHaveLength(24);
  });

  it('[EDGE-011-017] borrar una foto entre páginas no salta ni repite: tras reconciliar el resultado es exactamente la lista actual', async () => {
    const fake = fakeApi({ [petId(1)]: sixty(petId(1)) });
    let group = await loadFirstPage(fake.api, { id: petId(1), name: 'Argos' });
    fake.rows[petId(1)]!.splice(3, 1); // se borra la 4.ª foto (ya cargada) y todo lo posterior se desplaza un lugar
    group = await loadMorePhotos(fake.api, group);
    const ids = group.items.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(fake.rows[petId(1)]!.slice(0, ids.length).map((m) => m.id));
    expect(group.total).toBe(59);
    expect(ids.length).toBeGreaterThanOrEqual(48);
  });

  it('[EDGE-011-017] una foto nueva subida entre páginas tampoco repite la que se desplaza a la página siguiente', async () => {
    const fake = fakeApi({ [petId(1)]: sixty(petId(1)) });
    let group = await loadFirstPage(fake.api, { id: petId(1), name: 'Argos' });
    fake.rows[petId(1)]!.unshift(photo(petId(1), 99));
    group = await loadMorePhotos(fake.api, group);
    const ids = group.items.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(fake.rows[petId(1)]!.slice(0, ids.length).map((m) => m.id));
  });

  it('[SC-011-048] el tamaño de página es la constante única de 24 (INV-ARCH-006) y household-album.ts no la repite', () => {
    expect(ALBUM_PAGE_SIZE).toBe(24);
    expect(read('src/presentation/web/household-album.ts')).not.toMatch(/\b24\b(?!\))/);
  });
});

function view(overrides: Partial<HouseholdAlbumViewProps> = {}): string {
  const mk = (id: string, name: string, n: number, total = n) => ({ petId: id, petName: name, status: 'READY' as const, items: Array.from({ length: n }, (_, i) => photo(id, i + 1)), total, loadingMore: false });
  const groups = [mk(petId(1), 'Argos', 3), mk(petId(2), 'Luna', 3)];
  const urls = Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.id, `https://b.storage.googleapis.com/${i.id}?sig=1`])));
  const props: HouseholdAlbumViewProps = { householdName: 'Casa Vallejo', groups, urls, onMore: noop, onImageError: noop, ...overrides };
  return renderToStaticMarkup(h(HouseholdAlbumView, props));
}

describe('T1543 interfaz del álbum del hogar reutilizando PhotoAlbum (REQ-ALB11-001, REQ-ALB11-003)', () => {
  it('[SC-011-045] 6 imágenes agrupadas por mascota con su encabezado «Álbum de …», de solo lectura (sin subir ni borrar) y con loading=lazy', () => {
    const html = view();
    expect((html.match(/<img /g) ?? []).length).toBe(6);
    expect(html.indexOf('Álbum de Argos')).toBeGreaterThan(-1);
    expect(html.indexOf('Álbum de Argos')).toBeLessThan(html.indexOf('Álbum de Luna'));
    expect(html).not.toContain('Elegir foto');
    expect(html).not.toContain('Subir');
    expect(html).not.toMatch(/>Borrar</);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toMatch(/<h1/);
  });

  it('[SC-011-048] ids únicos entre grupos (sin id duplicado en el documento) y botón «Ver más fotos» solo donde faltan fotos, con el conteo', () => {
    const more = view({ groups: [{ petId: petId(1), petName: 'Argos', status: 'READY', items: Array.from({ length: 24 }, (_, i) => photo(petId(1), i + 1)), total: 30, loadingMore: false }, { petId: petId(2), petName: 'Luna', status: 'READY', items: [photo(petId(2), 1)], total: 1, loadingMore: false }] });
    const ids = [...more.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect((more.match(/>Ver más fotos</g) ?? []).length).toBe(1);
    expect(more).not.toContain('Página 1 de');
    expect(more).not.toContain('Siguiente');
    expect(view()).not.toContain('>Ver más fotos<');
  });

  it('[SC-011-046] un grupo HIDDEN no se pinta y un grupo en ERROR muestra role=alert solo en esa mascota', () => {
    const html = view({ groups: [{ petId: petId(1), petName: 'Argos', status: 'HIDDEN', items: [], total: 0, loadingMore: false }, { petId: petId(2), petName: 'Luna', status: 'ERROR', items: [], total: 0, loadingMore: false }] });
    expect(html).not.toContain('Argos');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Luna');
  });

  it('[SC-011-045] sin mascotas visibles muestra un texto, no una lista vacía', () => {
    expect(view({ groups: [] })).toContain('Aún no hay fotos en este hogar.');
  });
});

describe('T1543 sin caso de uso, ruta ni contrato nuevos (MIF-011-03, T1542 N/A)', () => {
  it('[REQ-ALB11-001] las rutas de hogares y de medios no declaran ningún álbum de hogar y el cliente solo usa el endpoint por mascota', () => {
    expect(read('src/infrastructure/http/routes/households.routes.ts')).not.toMatch(/album/i);
    expect(read('src/infrastructure/http/routes/media.routes.ts')).not.toMatch(/households\/.*album/i);
    const client = read('src/presentation/web/household-album.ts');
    expect(client).not.toMatch(/\/households\//);
    expect(client).not.toMatch(/cursor/i);
  });

  it('[REQ-ALB11-001] la pestaña Álbum de Hogares monta HouseholdAlbum y ya no es solo una lista de enlaces', () => {
    const page = read('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(page).toContain('HouseholdAlbum');
    expect(page).not.toContain('Ver el álbum de');
  });
});

describe('T1543 Cache-Control de las fotos del álbum (lock F-15, verificación pendiente de /trinity)', () => {
  it('[REQ-ALB11-003] ruta de AVATAR (no las fotos del álbum): la imagen servida por la ruta propia es private, immutable, nunca public', () => {
    const routes = read('src/infrastructure/http/routes/media.routes.ts');
    expect(routes).toContain('private, max-age=31536000, immutable');
    expect(routes).not.toMatch(/cache-control['"]?,\s*['"]public/i);
  });

  it('[REQ-ALB11-003] fotos del álbum: /access responde no-store (media.routes.ts) y dev-media responde no-store (dev-media.routes.ts), sin caché compartida', () => {
    const routes = read('src/infrastructure/http/routes/media.routes.ts');
    expect(routes).toContain("path.endsWith('/access')");
    expect(routes).toContain("reply.header('cache-control', 'no-store')");
    const dev = read('src/infrastructure/http/routes/dev-media.routes.ts');
    expect(dev).toContain("reply.header('Cache-Control', 'no-store')");
    expect(dev).not.toMatch(/cache-control['"]?,\s*['"](public|private)/i);
  });
});
