/**
 * Álbum del hogar (T1544, #62, D11-11, MIF-011-03 = SÍ): pestaña «Álbum» de Hogares. Solo lectura; un bloque por mascota asignada (alfabético, fotos más recientes primero), cada uno
 * con `PhotoAlbumView` (el mismo componente del álbum por mascota) y 24 fotos por mascota con carga progresiva «Ver más fotos». Se compone sobre los endpoints de 004
 * (`listMedia` con `kind=PHOTO` y `getMediaAccess` por foto); sin ruta, caso de uso ni contrato nuevos. Una mascota que el servidor niega no aparece (REQ-RBAC-001).
 * `HouseholdAlbumView` es presentacional; `HouseholdAlbum` es el contenedor.
 *
 * @implements REQ-ALB11-001, REQ-ALB11-002, REQ-ALB11-003, SC-011-045, EDGE-011-006, EDGE-011-017
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMediaApi, type MediaItem } from '../media-api.ts';
import { loadHouseholdAlbum, loadMorePhotos, type AlbumPetRef, type PetAlbumGroup } from '../household-album.ts';
import { PhotoAlbumView } from './PhotoAlbum.tsx';

const noop = (): void => undefined;

export interface HouseholdAlbumViewProps {
  readonly householdName: string;
  readonly groups: readonly PetAlbumGroup[];
  readonly urls: Readonly<Record<string, string>>;
  readonly onMore: (petId: string) => void;
  readonly onImageError: (item: MediaItem) => void;
}

export function HouseholdAlbumView({ householdName, groups, urls, onMore, onImageError }: HouseholdAlbumViewProps): JSX.Element {
  const visible = groups.filter((group) => group.status !== 'HIDDEN');
  if (visible.length === 0) return <p className="text-sm text-slate-800">Aún no hay fotos en este hogar.</p>;
  return (
    <ul aria-label={`Álbum de ${householdName}`} className="grid min-w-0 gap-6">
      {visible.map((group) => (
        <li key={group.petId} className="min-w-0">
          <PhotoAlbumView
            petName={group.petName}
            items={group.items}
            urls={urls}
            page={1}
            total={group.total}
            status={group.status === 'ERROR' ? 'ERROR' : 'READY'}
            error={group.status === 'ERROR' ? 'No pudimos cargar las fotos de esta mascota. Recarga la página para intentarlo de nuevo.' : null}
            onPage={noop}
            onImageError={onImageError}
            headingLevel={4}
            idPrefix={`album-${group.petId}`}
            onLoadMore={() => onMore(group.petId)}
            loadingMore={group.loadingMore}
          />
        </li>
      ))}
    </ul>
  );
}

export function HouseholdAlbum({ householdName, pets }: { readonly householdName: string; readonly pets: readonly AlbumPetRef[] }): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  const [groups, setGroups] = useState<readonly PetAlbumGroup[] | null>(null);
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const requested = useRef<Set<string>>(new Set());
  const retried = useRef<Set<string>>(new Set());
  const petsKey = pets.map((p) => `${p.id}:${p.name}`).join('|');

  useEffect(() => {
    let alive = true;
    setGroups(null);
    requested.current = new Set();
    retried.current = new Set();
    setUrls({});
    void loadHouseholdAlbum(api, pets).then((loaded) => {
      if (alive) setGroups(loaded);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, petsKey]);

  // Una URL firmada por foto nueva (las ya pedidas no se repiten); un fallo deja el hueco y se reintenta solo desde `onImageError`.
  useEffect(() => {
    for (const group of groups ?? []) {
      for (const item of group.items) {
        if (requested.current.has(item.id)) continue;
        requested.current.add(item.id);
        api.access(group.petId, item.id).then(
          (access) => setUrls((current) => ({ ...current, [item.id]: access.url })),
          () => undefined,
        );
      }
    }
  }, [api, groups]);

  const onMore = useCallback(
    (petId: string): void => {
      const current = groups?.find((g) => g.petId === petId);
      if (current === undefined || current.loadingMore) return;
      setGroups((all) => (all ?? []).map((g) => (g.petId === petId ? { ...g, loadingMore: true } : g)));
      void loadMorePhotos(api, current).then((next) => setGroups((all) => (all ?? []).map((g) => (g.petId === petId ? next : g))));
    },
    [api, groups],
  );

  const onImageError = useCallback(
    (item: MediaItem): void => {
      if (retried.current.has(item.id)) return;
      retried.current.add(item.id);
      api.access(item.petId, item.id).then(
        (access) => setUrls((current) => ({ ...current, [item.id]: access.url })),
        () => undefined,
      );
    },
    [api],
  );

  if (groups === null) {
    return (
      <p role="status" className="text-sm text-slate-800">
        Cargando fotos…
      </p>
    );
  }
  return <HouseholdAlbumView householdName={householdName} groups={groups} urls={urls} onMore={onMore} onImageError={onImageError} />;
}
