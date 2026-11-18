/**
 * Pantalla del álbum de fotos por mascota (T588, REQ-ALB-001, INV-ALB-001, D-09, D-20 B): 24 fotos por página en el orden del servidor, cada imagen se carga
 * completa (sin miniaturas) con `loading="lazy"` desde su URL firmada. Las URL se piden con `getMediaAccess` por cada foto de la página; si una imagen falla
 * (URL caducada) se pide una nueva una sola vez. `PhotoAlbumView` es presentacional; `PhotoAlbum` es el contenedor.
 *
 * @implements REQ-ALB-001, INV-ALB-001, REQ-ARC-003
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Field.tsx';
import { createMediaApi, MediaApiError, type MediaItem } from '../media-api.ts';
import { albumPageCount, mediaProblemMessage } from '../media-view.ts';

export interface PhotoAlbumViewProps {
  readonly petName: string;
  readonly items: readonly MediaItem[];
  readonly urls: Readonly<Record<string, string>>;
  readonly page: number;
  readonly total: number;
  readonly status: 'LOADING' | 'READY' | 'ERROR';
  readonly error: string | null;
  readonly onPage: (page: number) => void;
  readonly onImageError: (item: MediaItem) => void;
}

export function PhotoAlbumView({ petName, items, urls, page, total, status, error, onPage, onImageError }: PhotoAlbumViewProps): JSX.Element {
  const pages = albumPageCount(total);
  return (
    <section aria-labelledby="album-title" className="grid min-w-0 gap-4">
      <h1 id="album-title" className="text-xl font-semibold text-slate-900">
        Álbum de {petName}
      </h1>
      {status === 'LOADING' ? (
        <p role="status" className="text-sm text-slate-800">
          Cargando fotos…
        </p>
      ) : null}
      {status === 'ERROR' ? (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error ?? 'No se pudo cargar el álbum.'}
        </p>
      ) : null}
      {status === 'READY' && items.length === 0 ? <p className="text-sm font-semibold text-slate-800">Aún no hay fotos.</p> : null}
      {items.length === 0 ? null : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const url = urls[item.id];
            return (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {url === undefined ? (
                  <div className="aspect-square w-full bg-meadow" aria-hidden="true" />
                ) : (
                  <img src={url} alt={item.originalName} loading="lazy" decoding="async" onError={() => onImageError(item)} className="aspect-square w-full object-cover" />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {total > 24 ? (
        <nav aria-label="Páginas del álbum" className="flex items-center justify-between gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-slate-800">
            Página {page} de {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Siguiente
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

/** Contenedor: pide la página de fotos y la URL firmada de cada una; reintenta una vez por imagen si la URL falla. */
export function PhotoAlbum({ petId, petName }: { readonly petId: string; readonly petName: string }): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  const [items, setItems] = useState<readonly MediaItem[]>([]);
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  const [error, setError] = useState<string | null>(null);
  const retried = useRef<Set<string>>(new Set());

  const load = useCallback(async (): Promise<boolean> => {
    setStatus('LOADING');
    retried.current = new Set();
    try {
      const result = await api.list(petId, 'PHOTO', page);
      setItems(result.items);
      setTotal(result.total);
      setUrls({});
      const access = await Promise.all(result.items.map(async (item) => [item.id, (await api.access(petId, item.id)).url] as const));
      setUrls(Object.fromEntries(access));
      setStatus('READY');
      return true;
    } catch (e) {
      setError(mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
      setStatus('ERROR');
      return false;
    }
  }, [api, petId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const onImageError = (item: MediaItem): void => {
    if (retried.current.has(item.id)) return;
    retried.current.add(item.id);
    api.access(petId, item.id).then(
      (access) => setUrls((current) => ({ ...current, [item.id]: access.url })),
      () => undefined,
    );
  };

  return (
    <div className="grid min-w-0 gap-4">
      <Link to="/" className="text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Volver a la ficha
      </Link>
      <PhotoAlbumView petName={petName} items={items} urls={urls} page={page} total={total} status={status} error={error} onPage={setPage} onImageError={onImageError} />
    </div>
  );
}
