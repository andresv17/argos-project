/**
 * Foto de referencia del hogar y nota de la foto de referencia de la mascota (feature 006, T878; REQ-ESC6-001, REQ-ESC6-002, D6-07 = A). La foto del hogar se sube
 * (reexportada por `canvas`, sin EXIF ni GPS), se reemplaza y se quita con confirmación; se muestra por la ruta propia del servidor (302 firmada), sin URL firmadas
 * en el DOM. La foto de referencia de cada mascota es su avatar: aquí solo se explica, no hay otro selector. `HouseholdPhotoView` es presentacional;
 * `HouseholdPhoto` es el contenedor.
 *
 * @implements REQ-ESC6-001, REQ-ESC6-002, EDGE-ESC6-012, EDGE-ESC6-013, SC-ESC6-002, SC-ESC6-004, SC-ESC6-019
 */
import { useMemo, useState } from 'react';
import { createSceneApi, SceneApiError } from '../scene-api.ts';
import { PHOTO_ACCEPT } from '../media-view.ts';
import { browserPhotoPort, PhotoReexportError, reexportPhoto } from '../photo-reexport.ts';
import { householdPhotoPath, sceneProblemMessage } from '../scene-view.ts';
import { Button } from './Field.tsx';

export interface HouseholdPhotoViewProps {
  readonly idPrefix: string;
  /** `CHECKING`: aún no se sabe si hay foto (una sonda oculta carga la ruta propia). */
  readonly photoState: 'CHECKING' | 'PRESENT' | 'ABSENT';
  readonly photoSrc: string;
  readonly canUpload: boolean;
  readonly chosenName: string | null;
  readonly uploading: boolean;
  readonly confirmDelete: boolean;
  readonly error: string | null;
  readonly onPhotoLoad: () => void;
  readonly onPhotoError: () => void;
  readonly onChoose: (file: File | null) => void;
  readonly onUpload: () => void;
  readonly onAskDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
}

const FIELD = 'min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export function HouseholdPhotoView({ idPrefix, photoState, photoSrc, canUpload, chosenName, uploading, confirmDelete, error, onPhotoLoad, onPhotoError, onChoose, onUpload, onAskDelete, onConfirmDelete, onCancelDelete }: HouseholdPhotoViewProps): JSX.Element {
  const titleId = `${idPrefix}-photo-title`;
  const fileId = `${idPrefix}-photo-file`;
  const dialogId = `${idPrefix}-photo-delete`;
  const present = photoState === 'PRESENT';
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 max-w-full gap-3 rounded-2xl border border-slate-300 bg-white p-4">
      <h3 id={titleId} className="text-base font-semibold text-slate-900">
        Foto del hogar
      </h3>
      <p className="text-sm text-slate-900">Es opcional: sirve de referencia para dibujar la escena. No subas fotos donde aparezca alguien, en especial menores.</p>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {photoState === 'CHECKING' ? <img src={photoSrc} alt="" aria-hidden="true" className="hidden" onLoad={onPhotoLoad} onError={onPhotoError} /> : null}
      {present ? (
        <img src={photoSrc} alt="Foto de referencia del hogar" loading="lazy" decoding="async" onError={onPhotoError} className="mx-auto h-auto max-h-64 w-full max-w-full rounded-2xl border border-slate-200 object-contain sm:max-w-md" />
      ) : photoState === 'ABSENT' ? (
        <p className="text-sm font-semibold text-slate-900">Aún no hay foto del hogar.</p>
      ) : null}
      {!canUpload ? (
        <p className="text-sm text-slate-800">Solo el propietario del hogar o un administrador puede cambiar la foto del hogar.</p>
      ) : confirmDelete ? (
        <div role="alertdialog" aria-labelledby={dialogId} className="rounded-2xl border-2 border-danger bg-red-50 p-4">
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
        <div className="flex flex-wrap items-end gap-3">
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
export function HouseholdPhoto({ householdId, idPrefix, canUpload, reload }: { readonly householdId: string; readonly idPrefix: string; readonly canUpload: boolean; readonly reload: () => Promise<void> }): JSX.Element {
  const api = useMemo(() => createSceneApi(), []);
  const [photoState, setPhotoState] = useState<'CHECKING' | 'PRESENT' | 'ABSENT'>('CHECKING');
  const [tag, setTag] = useState<string | null>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown): void => setError(e instanceof PhotoReexportError ? e.message : sceneProblemMessage(e instanceof SceneApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED', e instanceof SceneApiError ? e.retryAfterSeconds : undefined));

  const upload = async (): Promise<void> => {
    if (chosen === null || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const payload = await reexportPhoto(chosen, browserPhotoPort());
      const saved = await api.putHouseholdPhoto(householdId, payload.blob);
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
      canUpload={canUpload}
      chosenName={chosen === null ? null : chosen.name}
      uploading={uploading}
      confirmDelete={confirmDelete}
      error={error}
      onPhotoLoad={() => setPhotoState('PRESENT')}
      onPhotoError={() => setPhotoState('ABSENT')}
      onChoose={setChosen}
      onUpload={() => void upload()}
      onAskDelete={() => setConfirmDelete(true)}
      onConfirmDelete={() => void remove()}
      onCancelDelete={() => setConfirmDelete(false)}
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
