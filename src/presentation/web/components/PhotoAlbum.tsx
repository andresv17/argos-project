/**
 * Pantalla del álbum de fotos por mascota (T588, REQ-ALB-001, INV-ALB-001, D-09, D-20 B): 24 fotos por página en el orden del servidor, cada imagen se carga
 * completa (sin miniaturas) con `loading="lazy"` desde su URL firmada. Las URL se piden con `getMediaAccess` por cada foto de la página; si una imagen falla
 * (URL caducada) se pide una nueva una sola vez. `PhotoAlbumView` es presentacional; `PhotoAlbum` es el contenedor.
 *
 * Feature 005 (T725, T726): solo `kind = PHOTO` (nunca archivos clínicos); sube fotos (JPEG, PNG, WebP, reexportadas por `canvas`) y borra con confirmación
 * según los permisos; el contador «N de M fotos» y el estado «Álbum lleno» salen de `getAlbumLimits` (el tope no se cablea) y tras un 409 ERR-MEDIA-ALBUM-LIMIT
 * se vuelve a pedir `getAlbumLimits`.
 *
 * @implements SC-005-001, REQ-ALB-001, INV-ALB-001, REQ-ARC-003, REQ-ALB5-001, REQ-ALB5-002, REQ-ALB5-003, REQ-ALB5-004, REQ-ALB5-005
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Field.tsx';
import { createMediaApi, MediaApiError, type AlbumLimits, type MediaItem } from '../media-api.ts';
import { ALBUM_PAGE_SIZE, albumPageCount, mediaProblemMessage, PHOTO_ACCEPT, uploadDateText } from '../media-view.ts';
import { browserPhotoPort, PhotoReexportError, reexportPhoto } from '../photo-reexport.ts';

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
  /** `getAlbumLimits`: sin él (aún no cargado) no hay contador ni estado «Álbum lleno». */
  readonly limits?: AlbumLimits | null;
  readonly canUpload?: boolean;
  readonly canDelete?: boolean;
  readonly uploading?: boolean;
  readonly chosenName?: string | null;
  readonly confirmDeleteId?: string | null;
  readonly onChoose?: (file: File | null) => void;
  readonly onUpload?: () => void;
  readonly onAskDelete?: (id: string) => void;
  readonly onConfirmDelete?: (item: MediaItem) => void;
  readonly onCancelDelete?: () => void;
}

const FIELD = 'min-h-12 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const none = (): void => undefined;

export function PhotoAlbumView(props: PhotoAlbumViewProps): JSX.Element {
  const { petName, items, urls, page, total, status, error, onPage, onImageError, limits = null } = props;
  const { canUpload = false, canDelete = false, uploading = false, chosenName = null, confirmDeleteId = null } = props;
  const { onChoose = none, onUpload = none, onAskDelete = none, onConfirmDelete = none, onCancelDelete = none } = props;
  const pages = albumPageCount(total);
  const counter = limits === null ? null : `${limits.photoCount} de ${limits.maxPhotosPerPet} fotos`;
  const full = limits !== null && limits.photoCount >= limits.maxPhotosPerPet;
  return (
    <section aria-labelledby="album-title" className="grid min-w-0 gap-4">
      <h1 id="album-title" className="text-xl font-semibold text-slate-900">
        Álbum de {petName}
      </h1>
      {counter === null ? null : (
        <p id="album-count" className="text-sm font-semibold text-slate-900">
          {counter}
        </p>
      )}
      {full ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-meadow px-4 py-3 text-sm text-slate-900">
          <p className="font-semibold">Álbum lleno</p>
          <p>{`${counter}. Elimina alguna foto o guarda las fotos médicas en Historial / Archivos.`}</p>
        </div>
      ) : null}
      {canUpload && !full ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="album-file" className="text-sm font-medium text-slate-800">
              Elegir foto
            </label>
            <input id="album-file" type="file" accept={PHOTO_ACCEPT} disabled={uploading} onChange={(e) => onChoose(e.target.files?.[0] ?? null)} className={`${FIELD} w-full min-w-0`} />
          </div>
          <Button disabled={uploading || chosenName === null} onClick={onUpload}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </Button>
        </div>
      ) : null}
      {status === 'LOADING' ? (
        <p role="status" className="text-sm text-slate-800">
          Cargando fotos…
        </p>
      ) : null}
      {status === 'ERROR' || error !== null ? (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error ?? 'No se pudo cargar el álbum.'}
        </p>
      ) : null}
      {status === 'READY' && items.length === 0 ? <p className="text-sm font-semibold text-slate-800">Aún no hay fotos.</p> : null}
      {items.length === 0 ? null : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => {
            const url = urls[item.id];
            return (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {url === undefined ? (
                  <div className="aspect-square w-full bg-meadow" aria-hidden="true" />
                ) : (
                  <img src={url} alt={`Foto ${(page - 1) * ALBUM_PAGE_SIZE + index + 1} de ${total} de ${petName}, subida el ${uploadDateText(item.createdAt)}`} loading="lazy" decoding="async" onError={() => onImageError(item)} className="aspect-square w-full object-cover" />
                )}
                {canDelete ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2">
                    {confirmDeleteId === item.id ? (
                      <>
                        <span className="text-sm font-semibold text-slate-900">¿Borrar «{item.originalName}»?</span>
                        <Button variant="danger" onClick={() => onConfirmDelete(item)}>
                          Sí, borrar
                        </Button>
                        <Button variant="secondary" onClick={onCancelDelete}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" ariaLabel={`Borrar ${item.originalName}`} onClick={() => onAskDelete(item.id)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                ) : null}
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
export function PhotoAlbum({ petId, petName, canUpload = false, canDelete = false }: { readonly petId: string; readonly petName: string; readonly canUpload?: boolean; readonly canDelete?: boolean }): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  const [items, setItems] = useState<readonly MediaItem[]>([]);
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<AlbumLimits | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const retried = useRef<Set<string>>(new Set());

  /** `getAlbumLimits`: contador y estado «Álbum lleno»; un fallo deja el contador oculto (el servidor sigue aplicando el tope). */
  const loadLimits = useCallback(async (): Promise<void> => {
    try {
      setLimits(await api.albumLimits(petId));
    } catch {
      setLimits(null);
    }
  }, [api, petId]);

  const load = useCallback(async (): Promise<boolean> => {
    setStatus('LOADING');
    retried.current = new Set();
    setError(null);
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
  useEffect(() => {
    void loadLimits();
  }, [loadLimits]);

  const upload = async (): Promise<void> => {
    if (chosen === null || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await reexportPhoto(chosen, browserPhotoPort());
      await api.upload(petId, 'PHOTO', payload.blob, payload.name);
      setChosen(null);
      setPage(1);
      await Promise.all([load(), loadLimits()]);
    } catch (e) {
      setError(e instanceof PhotoReexportError ? e.message : mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
      setStatus('READY');
      await loadLimits(); // tras un 409 se reconcilia el contador con el servidor (REQ-ALB5-005)
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem): Promise<void> => {
    setConfirmDeleteId(null);
    try {
      await api.remove(petId, item.id);
      await Promise.all([load(), loadLimits()]);
    } catch (e) {
      setError(mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
      setStatus('READY');
    }
  };

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
      <Link to="/" className="text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
        Volver a la ficha
      </Link>
      <PhotoAlbumView
        petName={petName}
        items={items}
        urls={urls}
        page={page}
        total={total}
        status={status}
        error={error}
        onPage={setPage}
        onImageError={onImageError}
        limits={limits}
        canUpload={canUpload}
        canDelete={canDelete}
        uploading={uploading}
        chosenName={chosen === null ? null : chosen.name}
        confirmDeleteId={confirmDeleteId}
        onChoose={setChosen}
        onUpload={() => void upload()}
        onAskDelete={setConfirmDeleteId}
        onConfirmDelete={(item) => void remove(item)}
        onCancelDelete={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
