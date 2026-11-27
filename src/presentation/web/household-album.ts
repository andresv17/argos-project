/**
 * Composición del álbum del hogar EN LA INTERFAZ (T1544, D11-11, MIF-011-03 = SÍ): no hay caso de uso, ruta ni contrato nuevos; cada mascota asignada al hogar se consulta con
 * `GET /pets/{petId}/media?kind=PHOTO` de 004 (siempre `PHOTO`, nunca archivos clínicos; la foto del hogar no es parte de ese endpoint). El filtro de visibilidad vive dentro de la
 * consulta de 004 (REQ-RBAC-001): una mascota que el servidor niega (403/404) no deja grupo. La paginación es POR MASCOTA (`ALBUM_PAGE_SIZE`, constante única) con carga progresiva;
 * si entre dos páginas cambia el total (borrado o subida), se reconcilian las páginas ya cargadas para no saltar ni repetir fotos (EDGE-011-017).
 *
 * @implements REQ-ALB11-001, REQ-ALB11-002, REQ-ALB11-003, EDGE-011-006, EDGE-011-017, REQ-RBAC-001
 */
import { MediaApiError, type MediaApi, type MediaItem } from './media-api.ts';
import { ALBUM_PAGE_SIZE } from './media-view.ts';

/** Lo único que el álbum del hogar necesita del cliente de 004. */
export type AlbumListApi = Pick<MediaApi, 'list'>;

export interface AlbumPetRef {
  readonly id: string;
  readonly name: string;
}

export type PetAlbumStatus = 'READY' | 'ERROR' | 'HIDDEN';

export interface PetAlbumGroup {
  readonly petId: string;
  readonly petName: string;
  readonly status: PetAlbumStatus;
  /** Fotos cargadas, más recientes primero (orden del servidor). */
  readonly items: readonly MediaItem[];
  readonly total: number;
  readonly loadingMore: boolean;
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

/** Alfabético por nombre (sin distinguir mayúsculas ni tildes); las homónimas se desempatan por id para un orden estable aun si cambia un nombre. */
export function sortAlbumPets<T extends AlbumPetRef>(pets: readonly T[]): T[] {
  return [...pets].sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const isDenied = (error: unknown): boolean => error instanceof MediaApiError && (error.status === 403 || error.status === 404);
const uniqueById = (items: readonly MediaItem[]): MediaItem[] => [...new Map(items.map((item) => [item.id, item])).values()];

export function hasMorePhotos(group: PetAlbumGroup): boolean {
  return group.status === 'READY' && group.items.length < group.total;
}

/** Primera página de una mascota: 403 o 404 la ocultan (REQ-ALB11-002); cualquier otro fallo es un error solo de esa mascota. */
export async function loadFirstPage(api: AlbumListApi, pet: AlbumPetRef): Promise<PetAlbumGroup> {
  const base = { petId: pet.id, petName: pet.name, items: [], total: 0, loadingMore: false } as const;
  try {
    const page = await api.list(pet.id, 'PHOTO', 1);
    return { ...base, status: 'READY', items: uniqueById(page.items), total: page.total };
  } catch (error) {
    return { ...base, status: isDenied(error) ? 'HIDDEN' : 'ERROR' };
  }
}

/** Álbum completo: una consulta por mascota, en orden alfabético; las mascotas sin permiso efectivo se omiten. */
export async function loadHouseholdAlbum(api: AlbumListApi, pets: readonly AlbumPetRef[]): Promise<PetAlbumGroup[]> {
  const groups = await Promise.all(sortAlbumPets(pets).map((pet) => loadFirstPage(api, pet)));
  return groups.filter((group) => group.status !== 'HIDDEN');
}

/** Siguiente página de ESA mascota; si el total cambió o la página trae fotos ya cargadas, se vuelven a pedir las páginas 1..n+1 (sin saltos ni repeticiones). */
export async function loadMorePhotos(api: AlbumListApi, group: PetAlbumGroup): Promise<PetAlbumGroup> {
  const pagesLoaded = Math.max(1, Math.ceil(group.items.length / ALBUM_PAGE_SIZE));
  try {
    const next = await api.list(group.petId, 'PHOTO', pagesLoaded + 1);
    const known = new Set(group.items.map((item) => item.id));
    const stable = next.total === group.total && next.items.every((item) => !known.has(item.id));
    if (stable) return { ...group, items: [...group.items, ...next.items], loadingMore: false };
    const pages = await Promise.all(Array.from({ length: pagesLoaded + 1 }, (_, i) => api.list(group.petId, 'PHOTO', i + 1)));
    const last = pages[pages.length - 1]!;
    return { ...group, items: uniqueById(pages.flatMap((p) => p.items)), total: last.total, loadingMore: false };
  } catch (error) {
    return { ...group, status: isDenied(error) ? 'HIDDEN' : 'ERROR', loadingMore: false };
  }
}
