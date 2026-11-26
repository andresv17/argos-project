/**
 * Foto de referencia del hogar y nota de la foto de referencia de la mascota (feature 006, T878; REQ-ESC6-001, REQ-ESC6-002, D6-07 = A). La foto del hogar se sube
 * (reexportada por `canvas`, sin EXIF ni GPS), se reemplaza y se quita con confirmación; se muestra por la ruta propia del servidor (302 firmada), sin URL firmadas
 * en el DOM. La foto de referencia de cada mascota es su avatar: aquí solo se explica, no hay otro selector. `HouseholdPhotoView` es presentacional;
 * `HouseholdPhoto` es el contenedor.
 *
 * Feature 011 (T1539, D11-10 = C): la carga inicial solo muestra el indicador «Ya hay una foto del hogar guardada» y «Ver foto» (la presencia se comprueba sin
 * descargar el objeto); «Ver foto» carga bajo demanda una miniatura de máx. `THUMBNAIL_MAX_PX` generada con canvas; «Ampliar» muestra la foto completa.
 *
 * @implements REQ-ESC6-001, REQ-ESC6-002, REQ-HOG11-003, EDGE-ESC6-012, EDGE-ESC6-013, SC-ESC6-002, SC-ESC6-004, SC-ESC6-019, SC-011-041, SC-011-042, SC-011-043, SC-011-044
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSceneApi, SceneApiError } from '../scene-api.ts';
import { PHOTO_ACCEPT } from '../media-view.ts';
import { browserPhotoPort, PhotoReexportError, reexportPhoto } from '../photo-reexport.ts';
import { browserThumbnailPort, makeThumbnail, THUMBNAIL_MAX_PX } from '../photo-thumbnail.ts';
import { householdPhotoPath, sceneProblemMessage } from '../scene-view.ts';
import { shouldFocusAfterThumbLoad, useDialogFocus } from '../dialog-focus.ts';
import { Button } from './Field.tsx';

export interface HouseholdPhotoViewProps {
  readonly idPrefix: string;
  /** `CHECKING`: aún no se sabe si hay foto (se comprueba por la API sin descargar el objeto). */
  readonly photoState: 'CHECKING' | 'PRESENT' | 'ABSENT';
  /** Ruta propia de la foto completa: solo se usa al ampliar. */
  readonly photoSrc: string;
  readonly thumbState: 'IDLE' | 'LOADING' | 'READY';
  /** Miniatura (blob local) o, si el navegador no pudo generarla, la ruta propia acotada por CSS al tope. */
  readonly thumbSrc: string | null;
  readonly enlarged: boolean;
  readonly canUpload: boolean;
  readonly chosenName: string | null;
  readonly uploading: boolean;
  readonly confirmDelete: boolean;
  readonly error: string | null;
  readonly onPhotoError: () => void;
  readonly onShowPhoto: () => void;
  readonly onToggleEnlarge: () => void;
  readonly onChoose: (file: File | null) => void;
  readonly onUpload: () => void;
  readonly onAskDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
  /** 3 bajo el h2 de «Mis mascotas», 5 dentro de la tarjeta del hogar (h3) (H-S1). */
  readonly headingLevel?: 3 | 5;
}

const FIELD = 'min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';

export function HouseholdPhotoView({ idPrefix, photoState, photoSrc, thumbState, thumbSrc, enlarged, canUpload, chosenName, uploading, confirmDelete, error, onPhotoError, onShowPhoto, onToggleEnlarge, onChoose, onUpload, onAskDelete, onConfirmDelete, onCancelDelete, headingLevel = 3 }: HouseholdPhotoViewProps): JSX.Element {
  const titleId = `${idPrefix}-photo-title`;
  const fileId = `${idPrefix}-photo-file`;
  const dialogId = `${idPrefix}-photo-delete`;
  const present = photoState === 'PRESENT';
  const Title = `h${headingLevel}` as 'h3' | 'h5';
  const { dialogRef, triggerRef, fallbackRef } = useDialogFocus(confirmDelete);
  const thumbActionsRef = useRef<HTMLDivElement>(null);
  const prevThumb = useRef(thumbState);
  useEffect(() => {
    if (shouldFocusAfterThumbLoad(prevThumb.current, thumbState)) thumbActionsRef.current?.querySelector('button')?.focus();
    prevThumb.current = thumbState;
  }, [thumbState]);
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 max-w-full gap-3 rounded-2xl border border-slate-300 bg-white p-4">
      <Title id={titleId} ref={fallbackRef} tabIndex={-1} className="text-base font-semibold text-slate-900">
        Foto del hogar
      </Title>
      <p className="max-w-prose text-sm text-slate-900">Es opcional: sirve de referencia para dibujar la escena. No subas fotos donde aparezca alguien, en especial menores.</p>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {present ? (
        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-semibold text-slate-900">Ya hay una foto del hogar guardada</p>
          {thumbState === 'READY' && thumbSrc !== null ? (
            <img src={thumbSrc} alt="Miniatura de la foto del hogar" decoding="async" style={{ maxWidth: `${THUMBNAIL_MAX_PX}px`, maxHeight: `${THUMBNAIL_MAX_PX}px` }} className="h-auto w-auto rounded-xl border border-slate-200 object-contain" />
          ) : null}
          {enlarged ? <img src={photoSrc} alt="Foto de referencia del hogar" decoding="async" onError={onPhotoError} className="mx-auto h-auto max-h-64 w-full max-w-full rounded-2xl border border-slate-200 object-contain sm:max-w-md" /> : null}
          <p role="status" className="sr-only">
            {thumbState === 'READY' ? 'Miniatura cargada' : ''}
          </p>
          <div ref={thumbActionsRef} className="flex flex-wrap gap-2">
            {thumbState === 'IDLE' ? <Button variant="secondary" onClick={onShowPhoto}>Ver foto</Button> : null}
            {thumbState === 'LOADING' ? <Button variant="secondary" disabled>Cargando…</Button> : null}
            {thumbState === 'READY' ? <Button variant="secondary" onClick={onToggleEnlarge}>{enlarged ? 'Reducir' : 'Ampliar'}</Button> : null}
          </div>
        </div>
      ) : photoState === 'ABSENT' ? (
        <p className="text-sm font-semibold text-slate-900">Aún no hay foto del hogar.</p>
      ) : null}
      {!canUpload ? (
        <p className="text-sm text-slate-800">Solo el propietario del hogar o un administrador puede cambiar la foto del hogar.</p>
      ) : confirmDelete ? (
        <div ref={dialogRef} tabIndex={-1} role="alertdialog" aria-labelledby={dialogId} className="rounded-2xl border-2 border-danger bg-red-50 p-4">
          <p id={dialogId} className="text-sm text-red-900">
            ¿Quitar la foto del hogar? Se borra de inmediato y la imagen de la escena queda desactualizada, con 1 cambio pendiente.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" disabled={uploading} onClick={onConfirmDelete}>
              Sí, quitar
            </Button>
            <Button variant="secondary" onClick={onCancelDelete}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div ref={triggerRef} className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={fileId} className="text-sm font-medium text-slate-800">
              Elegir foto del hogar
            </label>
            <input id={fileId} type="file" accept={PHOTO_ACCEPT} disabled={uploading} onChange={(e) => onChoose(e.target.files?.[0] ?? null)} className={FIELD} />
          </div>
          <Button disabled={uploading || chosenName === null} onClick={onUpload}>
            {uploading ? 'Subiendo…' : present ? 'Reemplazar foto' : 'Subir foto del hogar'}
          </Button>
          {present ? (
            <Button variant="secondary" disabled={uploading} onClick={onAskDelete}>
              Quitar foto
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Contenedor: sube (reexportada por canvas), reemplaza y quita la foto del hogar y relee la escena (el cambio deja la imagen desactualizada). */
export function HouseholdPhoto({ householdId, idPrefix, canUpload, reload, headingLevel }: { readonly householdId: string; readonly idPrefix: string; readonly canUpload: boolean; readonly reload: () => Promise<void>; readonly headingLevel?: 3 | 5 }): JSX.Element {
  const api = useMemo(() => createSceneApi(), []);
  const [photoState, setPhotoState] = useState<'CHECKING' | 'PRESENT' | 'ABSENT'>('CHECKING');
  const [tag, setTag] = useState<string | null>(null);
  const [thumbState, setThumbState] = useState<'IDLE' | 'LOADING' | 'READY'>('IDLE');
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown): void => setError(e instanceof PhotoReexportError ? e.message : sceneProblemMessage(e instanceof SceneApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED', e instanceof SceneApiError ? e.retryAfterSeconds : undefined));

  const dropThumb = (): void => {
    if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setThumbSrc(null);
    setThumbState('IDLE');
    setEnlarged(false);
  };
  useEffect(() => {
    let live = true;
    api.householdPhotoExists(householdId).then(
      (exists) => live && setPhotoState(exists ? 'PRESENT' : 'ABSENT'),
      (e: unknown) => {
        if (!live) return;
        setPhotoState('ABSENT');
        fail(e);
      },
    );
    return () => {
      live = false;
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
    };
  }, [api, householdId]);
  const showPhoto = async (): Promise<void> => {
    setThumbState('LOADING');
    setError(null);
    try {
      const original = await api.getHouseholdPhotoBlob(householdId);
      const mini = await makeThumbnail(original, browserThumbnailPort());
      if (mini === null) {
        setThumbSrc(tag === null ? `/api/households/${householdId}/photo` : householdPhotoPath(householdId, tag));
      } else {
        objectUrl.current = URL.createObjectURL(mini);
        setThumbSrc(objectUrl.current);
      }
      setThumbState('READY');
    } catch (e) {
      setThumbState('IDLE');
      fail(e);
    }
  };

  const upload = async (): Promise<void> => {
    if (chosen === null || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await reexportPhoto(chosen, browserPhotoPort());
      const saved = await api.putHouseholdPhoto(householdId, payload.blob);
      dropThumb();
      setTag(saved.tag);
      setPhotoState('PRESENT');
      setChosen(null);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
    }
  };
  const remove = async (): Promise<void> => {
    setConfirmDelete(false);
    setUploading(true);
    setError(null);
    try {
      await api.deleteHouseholdPhoto(householdId);
      dropThumb();
      setTag(null);
      setPhotoState('ABSENT');
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
    }
  };
  return (
    <HouseholdPhotoView
      idPrefix={idPrefix}
      photoState={photoState}
      photoSrc={tag === null ? `/api/households/${householdId}/photo` : householdPhotoPath(householdId, tag)}
      thumbState={thumbState}
      thumbSrc={thumbSrc}
      enlarged={enlarged}
      canUpload={canUpload}
      chosenName={chosen === null ? null : chosen.name}
      uploading={uploading}
      confirmDelete={confirmDelete}
      error={error}
      onPhotoError={() => setPhotoState('ABSENT')}
      onShowPhoto={() => void showPhoto()}
      onToggleEnlarge={() => setEnlarged((v) => !v)}
      onChoose={setChosen}
      onUpload={() => void upload()}
      onAskDelete={() => setConfirmDelete(true)}
      onConfirmDelete={() => void remove()}
      onCancelDelete={() => setConfirmDelete(false)}
      {...(headingLevel === undefined ? {} : { headingLevel })}
    />
  );
}

/** Nota bajo el editor del avatar: la foto de referencia de la mascota en la escena es su avatar (D6-07 = A); sin avatar se dibuja por especie, raza y sexo (REQ-ESC6-009). */
export function PetReferenceNote({ hasAvatar }: { readonly hasAvatar: boolean }): JSX.Element {
  return (
    <p className="rounded-xl border border-slate-300 bg-meadow px-3 py-2 text-sm text-slate-900">
      {hasAvatar
        ? 'Este avatar es la foto de referencia de tu mascota en la escena del hogar, solo si consientes el envío de fotos. Cámbialo o quítalo aquí arriba.'
        : 'Esta mascota no tiene avatar: en la escena del hogar se dibuja por especie, raza y sexo. Si añades un avatar, será su foto de referencia.'}
    </p>
  );
}
