/**
 * Panel «Archivos» de «Historial / Archivos» (T732, T733, REQ-CLI5-001, REQ-CLI5-003; SC-005-001, SC-005-007): solo archivos clínicos (`kind = FILE`: PDF, JPEG, PNG,
 * WebP), nunca fotos del álbum. Lista de documentos (no cuadrícula, sin miniaturas) con tipo, nombre original, fecha de subida y tamaño; sube con el botón
 * deshabilitado en vuelo, abre el visor con renovación de la URL firmada y borra con confirmación. Quien no puede subir o borrar (Lector, Cuidador sin borrado)
 * no ve esos controles; el servidor vuelve a comprobarlo. Sin selector «Tipo» ni filtro (H-4 de `/sati`). Álbum y archivos comparten la cuota de 1 GiB.
 *
 * `ClinicalFilesPanelView` es presentacional; `ClinicalFilesPanel` es el contenedor con estado y peticiones.
 *
 * @implements REQ-CLI5-001, REQ-CLI5-003, REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, INV-ARC-004, SC-005-001, SC-005-007, SC-005-008, SC-005-010
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './Field.tsx';
import { Viewer, type ViewerState } from './MediaPanel.tsx';
import { createMediaApi, MediaApiError, type MediaItem } from '../media-api.ts';
import { createAccessRenewer, type Scheduler } from '../access-renewer.ts';
import { browserRenewal } from '../browser-scheduler.ts';
import { albumPageCount, ALBUM_PAGE_SIZE, clinicalFilesMessage, FILE_ACCEPT, formatBytes, uploadDateText } from '../media-view.ts';
import { browserPhotoPort, PhotoReexportError, reexportPhoto, type UploadPayload } from '../photo-reexport.ts';

export interface ClinicalFilesPanelViewProps {
  readonly items: readonly MediaItem[];
  readonly total: number;
  readonly page: number;
  readonly canUpload: boolean;
  readonly canDelete: boolean;
  readonly uploading: boolean;
  readonly chosenName: string | null;
  readonly error: string | null;
  readonly viewer: ViewerState | null;
  readonly confirmDeleteId: string | null;
  readonly onChoose: (file: File | null) => void;
  readonly onUpload: () => void;
  readonly onView: (item: MediaItem) => void;
  readonly onCloseViewer: () => void;
  readonly onAskDelete: (id: string) => void;
  readonly onConfirmDelete: (item: MediaItem) => void;
  readonly onCancelDelete: () => void;
  readonly onPage: (page: number) => void;
}

const FIELD = 'min-h-12 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const typeLabel = (item: MediaItem): string => (item.mime === 'application/pdf' ? 'PDF' : 'Imagen');

export function ClinicalFilesPanelView(props: ClinicalFilesPanelViewProps): JSX.Element {
  const { items, total, page, canUpload, canDelete, uploading, chosenName, error, viewer, confirmDeleteId } = props;
  const pages = albumPageCount(total);
  return (
    <section aria-labelledby="clinical-files-title" className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 id="clinical-files-title" className="text-base font-semibold text-slate-900">
        Archivos
      </h3>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {canUpload ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="clinical-file" className="text-sm font-medium text-slate-800">
              Elegir archivo
            </label>
            <input id="clinical-file" type="file" accept={FILE_ACCEPT} disabled={uploading} onChange={(e) => props.onChoose(e.target.files?.[0] ?? null)} className={`${FIELD} w-full min-w-0`} />
          </div>
          <Button disabled={uploading || chosenName === null} onClick={props.onUpload}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </Button>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-slate-800">
          Aún no hay archivos clínicos. Guarda aquí resultados de exámenes, radiografías o fotos médicas de control. Formatos: PDF, JPEG, PNG o WebP.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0 text-sm text-slate-900">
                <span className="break-words font-semibold">{item.originalName}</span>
                <span className="block tabular-nums text-text-muted">{`${typeLabel(item)} · ${formatBytes(item.sizeBytes)} · ${uploadDateText(item.createdAt)}`}</span>
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

const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Contenedor: carga solo `FILE`, sube (las imágenes se reexportan sin EXIF ni GPS; el PDF va tal cual), abre el visor con renovación y borra con confirmación. */
export function ClinicalFilesPanel({ petId, canUpload, canDelete, renewal = browserRenewal }: {
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
      const result = await api.list(petId, 'FILE', page);
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(clinicalFilesMessage(e instanceof MediaApiError ? e.code : undefined));
    }
  }, [api, petId, page]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => () => renewer.current?.stop(), []);
  useEffect(() => {
    closeViewer();
    setPage(1);
  }, [petId, closeViewer]);

  const prepare = async (file: File): Promise<UploadPayload> => (ALLOWED_IMAGE_MIME.has(file.type) ? reexportPhoto(file, browserPhotoPort()) : { blob: file, name: file.name });

  const upload = async (): Promise<void> => {
    if (chosen === null || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await prepare(chosen);
      await api.upload(petId, 'FILE', payload.blob, payload.name);
      setChosen(null);
      setPage(1);
      await load();
    } catch (e) {
      setError(e instanceof PhotoReexportError ? e.message : clinicalFilesMessage(e instanceof MediaApiError ? e.code : undefined));
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
      setError(clinicalFilesMessage(e instanceof MediaApiError ? e.code : undefined));
    }
  };

  return (
    <ClinicalFilesPanelView
      items={items}
      total={total}
      page={page}
      canUpload={canUpload}
      canDelete={canDelete}
      uploading={uploading}
      chosenName={chosen === null ? null : chosen.name}
      error={error}
      viewer={viewer}
      confirmDeleteId={confirmDeleteId}
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
