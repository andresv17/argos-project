/**
 * Panel de archivos de la mascota (T581, REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, INV-ARC-004): subida con el botón deshabilitado en vuelo y `accept` de
 * fotos, mensaje del 415 con los tipos permitidos, lista paginada, visor en línea (imagen y PDF) con «Abrir o descargar», renovación de la URL firmada al 80 %
 * de `expiresAt` con un reintento, y borrado con confirmación. Las fotos se reexportan por `canvas` antes del `POST` (T616, D-13 A: sin EXIF ni GPS).
 * Quien no puede subir o borrar (Lector, Cuidador sin borrado) no ve esos controles; el servidor vuelve a comprobarlo (REQ-ARC-002).
 *
 * `MediaPanelView` es presentacional (props → marcado); `MediaPanel` es el contenedor con estado y peticiones.
 *
 * @implements REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, INV-ARC-004, REQ-GCS-004
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Field.tsx';
import { createMediaApi, MediaApiError, type MediaItem, type MediaKind } from '../media-api.ts';
import { createAccessRenewer, type Scheduler } from '../access-renewer.ts';
import { browserRenewal } from '../browser-scheduler.ts';
import { albumPageCount, ALBUM_PAGE_SIZE, FILE_ACCEPT, formatBytes, mediaProblemMessage, PHOTO_ACCEPT } from '../media-view.ts';
import { browserPhotoPort, PhotoReexportError, reexportPhoto, type UploadPayload } from '../photo-reexport.ts';

export interface ViewerState {
  readonly item: MediaItem;
  readonly url: string | null;
  readonly status: 'LOADING' | 'READY' | 'ERROR';
}

export interface MediaPanelViewProps {
  readonly items: readonly MediaItem[];
  readonly total: number;
  readonly page: number;
  readonly kindFilter: MediaKind | '';
  readonly uploadKind: MediaKind;
  readonly canUpload: boolean;
  readonly canDelete: boolean;
  readonly uploading: boolean;
  readonly chosenName: string | null;
  readonly error: string | null;
  readonly viewer: ViewerState | null;
  readonly confirmDeleteId: string | null;
  readonly onKindFilter: (kind: MediaKind | '') => void;
  readonly onUploadKind: (kind: MediaKind) => void;
  readonly onChoose: (file: File | null) => void;
  readonly onUpload: () => void;
  readonly onView: (item: MediaItem) => void;
  readonly onCloseViewer: () => void;
  readonly onAskDelete: (id: string) => void;
  readonly onConfirmDelete: (item: MediaItem) => void;
  readonly onCancelDelete: () => void;
  readonly onPage: (page: number) => void;
}

const KIND_LABEL: Readonly<Record<MediaKind, string>> = { FILE: 'Archivo', PHOTO: 'Foto' };
const FIELD = 'min-h-12 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const dateText = (iso: string): string => iso.slice(0, 10);

export function Viewer({ viewer, onClose }: { readonly viewer: ViewerState; readonly onClose: () => void }): JSX.Element {
  const { item, url, status } = viewer;
  const isPdf = item.mime === 'application/pdf';
  return (
    <section aria-label={`Visor de ${item.originalName}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold text-slate-900">{item.originalName}</h4>
        <Button variant="secondary" onClick={onClose}>
          Cerrar visor
        </Button>
      </div>
      {status === 'LOADING' ? (
        <p role="status" className="text-sm text-slate-800">
          Preparando…
        </p>
      ) : null}
      {status === 'ERROR' ? (
        <p role="alert" className="text-sm text-red-900">
          No se pudo abrir el archivo. Cierra el visor e inténtalo de nuevo.
        </p>
      ) : null}
      {url !== null && !isPdf ? <img src={url} alt={item.originalName} decoding="async" className="max-h-[70vh] w-full rounded-xl object-contain" /> : null}
      {url !== null && isPdf ? <iframe title={`PDF ${item.originalName}`} src={url} className="hidden h-[70vh] w-full rounded-xl border border-slate-200 sm:block" /> : null}
      {url !== null ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
          Abrir o descargar
        </a>
      ) : null}
    </section>
  );
}

export function MediaPanelView(props: MediaPanelViewProps): JSX.Element {
  const { items, total, page, kindFilter, uploadKind, canUpload, canDelete, uploading, chosenName, error, viewer, confirmDeleteId } = props;
  const pages = albumPageCount(total);
  return (
    <section aria-labelledby="media-title" className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 id="media-title" className="text-base font-semibold text-slate-900">
        Archivos
      </h3>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {canUpload ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="media-kind" className="text-sm font-medium text-slate-800">
              Tipo
            </label>
            <select id="media-kind" value={uploadKind} disabled={uploading} onChange={(e) => props.onUploadKind(e.target.value as MediaKind)} className={FIELD}>
              <option value="FILE">Archivo (foto o PDF)</option>
              <option value="PHOTO">Foto</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="media-file" className="text-sm font-medium text-slate-800">
              Elegir {uploadKind === 'PHOTO' ? 'foto' : 'archivo'}
            </label>
            <input
              id="media-file"
              type="file"
              accept={uploadKind === 'PHOTO' ? PHOTO_ACCEPT : FILE_ACCEPT}
              disabled={uploading}
              onChange={(e) => props.onChoose(e.target.files?.[0] ?? null)}
              className={`${FIELD} w-full min-w-0`}
            />
          </div>
          <Button disabled={uploading || chosenName === null} onClick={props.onUpload}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="media-filter" className="text-sm font-medium text-slate-800">
          Mostrar
        </label>
        <select id="media-filter" value={kindFilter} onChange={(e) => props.onKindFilter(e.target.value as MediaKind | '')} className={FIELD}>
          <option value="">Todo</option>
          <option value="FILE">Archivos</option>
          <option value="PHOTO">Fotos</option>
        </select>
      </div>
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-slate-800">Sin archivos.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0 text-sm text-slate-900">
                <span className="break-words font-semibold">{item.originalName}</span>
                <span className="block text-text-muted">
                  {KIND_LABEL[item.kind]} · {formatBytes(item.sizeBytes)} · {dateText(item.createdAt)}
                </span>
              </span>
              {confirmDeleteId === item.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">¿Borrar «{item.originalName}»?</span>
                  <Button variant="danger" onClick={() => props.onConfirmDelete(item)}>
                    Sí, borrar
                  </Button>
                  <Button variant="secondary" onClick={props.onCancelDelete}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <span className="flex flex-wrap gap-2">
                  <Button variant="secondary" ariaLabel={`Ver ${item.originalName}`} onClick={() => props.onView(item)}>
                    Ver
                  </Button>
                  {canDelete ? (
                    <Button variant="secondary" ariaLabel={`Borrar ${item.originalName}`} onClick={() => props.onAskDelete(item.id)}>
                      Borrar
                    </Button>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {total > ALBUM_PAGE_SIZE ? (
        <nav aria-label="Páginas de archivos" className="flex items-center justify-between gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => props.onPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-slate-800">
            Página {page} de {pages}
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => props.onPage(page + 1)}>
            Siguiente
          </Button>
        </nav>
      ) : null}
      {viewer === null ? null : <Viewer viewer={viewer} onClose={props.onCloseViewer} />}
    </section>
  );
}

const ALLOWED_MIME: ReadonlySet<string> = new Set(FILE_ACCEPT.split(','));

/** Contenedor: carga la lista, sube (con reexportación de fotos), abre el visor con renovación de la URL y borra con confirmación. */
export function MediaPanel({ petId, canUpload, canDelete, renewal = browserRenewal }: {
  readonly petId: string;
  readonly canUpload: boolean;
  readonly canDelete: boolean;
  /** Reloj y planificador de la renovación al 80 % de `expiresAt`; por defecto los reales del navegador. */
  readonly renewal?: { readonly now: () => number; readonly scheduler: Scheduler };
}): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  const [items, setItems] = useState<readonly MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kindFilter, setKindFilter] = useState<MediaKind | ''>('');
  const [uploadKind, setUploadKind] = useState<MediaKind>('FILE');
  const [chosen, setChosen] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renewer = useRef<ReturnType<typeof createAccessRenewer> | null>(null);

  const closeViewer = useCallback((): void => {
    renewer.current?.stop();
    renewer.current = null;
    setViewer(null);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await api.list(petId, kindFilter === '' ? undefined : kindFilter, page);
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
    }
  }, [api, petId, kindFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => () => renewer.current?.stop(), []);
  useEffect(() => {
    closeViewer();
    setPage(1);
  }, [petId, closeViewer]);

  const prepare = async (file: File): Promise<UploadPayload> => (ALLOWED_MIME.has(file.type) ? reexportPhoto(file, browserPhotoPort()) : { blob: file, name: file.name });

  const upload = async (): Promise<void> => {
    if (chosen === null || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await prepare(chosen);
      await api.upload(petId, uploadKind, payload.blob, payload.name);
      setChosen(null);
      setPage(1);
      await load();
    } catch (e) {
      setError(e instanceof PhotoReexportError ? e.message : mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
    } finally {
      setUploading(false);
    }
  };

  const view = (item: MediaItem): void => {
    renewer.current?.stop();
    setViewer({ item, url: null, status: 'LOADING' });
    const next = createAccessRenewer({
      fetchAccess: (isRenewal) => api.access(petId, item.id, { renewal: isRenewal }),
      onUrl: (access) => setViewer({ item, url: access.url, status: 'READY' }),
      onError: () => setViewer({ item, url: null, status: 'ERROR' }),
      now: renewal.now,
      scheduler: renewal.scheduler,
    });
    renewer.current = next;
    void next.start();
  };

  const remove = async (item: MediaItem): Promise<void> => {
    setConfirmDeleteId(null);
    try {
      await api.remove(petId, item.id);
      if (viewer?.item.id === item.id) closeViewer();
      await load();
    } catch (e) {
      setError(mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
    }
  };

  return (
    <MediaPanelView
      items={items}
      total={total}
      page={page}
      kindFilter={kindFilter}
      uploadKind={uploadKind}
      canUpload={canUpload}
      canDelete={canDelete}
      uploading={uploading}
      chosenName={chosen === null ? null : chosen.name}
      error={error}
      viewer={viewer}
      confirmDeleteId={confirmDeleteId}
      onKindFilter={(kind) => {
        setKindFilter(kind);
        setPage(1);
      }}
      onUploadKind={setUploadKind}
      onChoose={setChosen}
      onUpload={() => void upload()}
      onView={view}
      onCloseViewer={closeViewer}
      onAskDelete={setConfirmDeleteId}
      onConfirmDelete={(item) => void remove(item)}
      onCancelDelete={() => setConfirmDeleteId(null)}
      onPage={setPage}
    />
  );
}
