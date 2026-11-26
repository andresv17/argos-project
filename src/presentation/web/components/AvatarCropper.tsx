/**
 * Recortador del avatar de la mascota y de la foto de perfil de la cuenta (T586, REQ-AVA-002, REQ-AVA-001; 011 T1556, REQ-PRF11-001): la persona elige una foto, la mueve y acerca (arrastre, flechas y +/-) dentro de una
 * vista previa con máscara circular y confirma; el cliente exporta un cuadrado de 512×512 (WebP, o JPEG con calidad 0,85 si el navegador no codifica WebP) y lo
 * sube con `PUT /pets/{petId}/avatar`. La vista previa se dibuja en un `canvas` (no usa URL `blob:`, que la CSP de producción no permite en `img-src`).
 * `AvatarCropperView` es presentacional; `AvatarEditorCore` es el contenedor con la sesión de recorte (subida y retirada inyectadas); `AvatarEditor` lo cablea al avatar de la mascota
 * y `UserAvatarEditor` a la foto de perfil de la cuenta (011): ambos reutilizan el mismo recortador y la misma exportación 512×512.
 *
 * @implements REQ-AVA-001, REQ-AVA-002, REQ-PRF11-001
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from './Field.tsx';
import { applyCropKey, AvatarExportError, cropSquare, dragCrop, exportAvatar, initialCrop, type AvatarCanvasPort, type CropState, type ImageSize } from '../avatar-crop.ts';
import { createMediaApi, MediaApiError } from '../media-api.ts';
import { userAvatarProblemMessage, UserAvatarApiError, type UserAvatarApi } from '../user-avatar-api.ts';
import { mediaProblemMessage, PHOTO_ACCEPT } from '../media-view.ts';

const PREVIEW_SIZE = 256;

export interface AvatarCropperViewProps {
  readonly hasAvatar: boolean;
  readonly hasImage: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly previewSize: number;
  /** Mensaje de estado para lectores de pantalla (región `role="status"` montada siempre). */
  readonly status?: string;
  /** Acercar o alejar con botones (equivalente a las teclas + y -). */
  readonly onZoom?: (key: '+' | '-') => void;
  readonly onChoose: (file: File | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly canvasRef: (element: HTMLCanvasElement | null) => void;
}

export function AvatarCropperView(props: AvatarCropperViewProps): JSX.Element {
  const { hasAvatar, hasImage, busy, error, previewSize } = props;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <p role="status" className="sr-only">
        {props.status ?? ''}
      </p>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="avatar-file" className="text-sm font-medium text-slate-800">
          Elegir una foto (JPEG, PNG o WebP)
        </label>
        <input
          id="avatar-file"
          type="file"
          accept={PHOTO_ACCEPT}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            // Limpia el valor para que volver a elegir el mismo archivo (p. ej. tras Cancelar) dispare `change` de nuevo.
            e.target.value = '';
            props.onChoose(file);
          }}
          className="min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2"
        />
      </div>
      {hasImage ? (
        <>
          <div
            role="img"
            aria-label="Vista previa circular del recorte de la foto de perfil"
            tabIndex={0}
            aria-describedby="avatar-crop-help"
            onKeyDown={props.onKeyDown}
            onPointerDown={props.onPointerDown}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            style={{ width: previewSize, maxWidth: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}
            className="overflow-hidden rounded-full border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2"
          >
            <canvas ref={props.canvasRef} width={previewSize} height={previewSize} style={{ width: '100%', height: '100%' }} />
          </div>
          <p id="avatar-crop-help" className="text-sm text-text-muted">Flechas para mover, + y - para acercar o alejar; también puedes arrastrar la foto.</p>
          <div className="flex flex-wrap gap-2">
            {props.onZoom === undefined ? null : (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => props.onZoom?.('+')}>
                  Acercar
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => props.onZoom?.('-')}>
                  Alejar
                </Button>
              </>
            )}
            <Button disabled={busy} onClick={props.onConfirm}>
              {busy ? 'Guardando…' : 'Usar esta foto'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={props.onCancel}>
              Cancelar
            </Button>
          </div>
        </>
      ) : null}
      {hasAvatar ? (
        <div>
          <Button variant="secondary" disabled={busy} onClick={props.onRemove}>
            Quitar foto
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Lienzo de salida de 512×512 sobre un `canvas` fuera de pantalla. */
function outputPort(bitmap: ImageBitmap): AvatarCanvasPort {
  const canvas = document.createElement('canvas');
  return {
    drawSquare(sx, sy, side, outputSize) {
      canvas.width = outputSize;
      canvas.height = outputSize;
      canvas.getContext('2d')?.drawImage(bitmap, sx, sy, side, side, 0, 0, outputSize, outputSize);
    },
    toBlob: (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
  };
}

export interface AvatarEditorCoreProps {
  readonly avatarVersion: number | null;
  /** Sube el recorte exportado (512×512); rechaza con el error de su API. */
  readonly upload: (blob: Blob) => Promise<unknown>;
  readonly remove: () => Promise<void>;
  readonly onChanged: () => Promise<void>;
  /** Texto para la persona de un error de la subida o la retirada. */
  readonly messageOf: (error: unknown) => string;
}

/** Contenedor: sesión de recorte (imagen decodificada, zoom y centro), exportación 512×512 y subida o retirada, inyectadas por quien lo usa. */
export function AvatarEditorCore({ avatarVersion, upload, remove: removeAvatar, onChanged, messageOf }: AvatarEditorCoreProps): JSX.Element {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [restoreFocus, setRestoreFocus] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const size: ImageSize | null = bitmap === null ? null : { width: bitmap.width, height: bitmap.height };

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (bitmap === null || size === null || crop === null || context === null || context === undefined) return;
    const square = cropSquare(size, crop);
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.drawImage(bitmap, square.sx, square.sy, square.side, square.side, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  });
  useEffect(() => () => bitmap?.close(), [bitmap]);
  // 2.4.3: al cerrar el editor o quitar la foto los botones se desmontan; el foco vuelve al selector de archivo (o al título del panel, con tabindex -1).
  useEffect(() => {
    if (!restoreFocus || busy) return;
    const target = document.getElementById('avatar-file') ?? document.getElementById('avatar-title');
    if (target !== null && target.tabIndex < 0 && target.getAttribute('tabindex') === null) target.setAttribute('tabindex', '-1');
    target?.focus();
    setRestoreFocus(false);
  }, [restoreFocus, busy]);

  const reset = useCallback((): void => {
    setBitmap(null);
    setCrop(null);
  }, []);
  const cancel = (): void => {
    const input = document.getElementById('avatar-file');
    if (input instanceof HTMLInputElement) input.value = '';
    reset();
    setStatus('');
    setRestoreFocus(true);
  };

  const choose = async (file: File | null): Promise<void> => {
    setError(null);
    if (file === null) return reset();
    try {
      const decoded = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setBitmap(decoded);
      setCrop(initialCrop({ width: decoded.width, height: decoded.height }));
    } catch {
      reset();
      setError('No se pudo leer la imagen. Prueba con otra foto.');
    }
  };

  const confirm = async (): Promise<void> => {
    if (bitmap === null || size === null || crop === null || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Guardando…');
    try {
      const exported = await exportAvatar(outputPort(bitmap), cropSquare(size, crop));
      await upload(exported.blob);
      reset();
      await onChanged();
      setStatus('Foto actualizada');
      setRestoreFocus(true);
    } catch (e) {
      setStatus('');
      setError(e instanceof AvatarExportError ? e.message : messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus('Guardando…');
    try {
      await removeAvatar();
      await onChanged();
      setStatus('Foto quitada');
      setRestoreFocus(true);
    } catch (e) {
      setStatus('');
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AvatarCropperView
      hasAvatar={avatarVersion !== null}
      hasImage={bitmap !== null}
      busy={busy}
      error={error}
      previewSize={PREVIEW_SIZE}
      status={status}
      onZoom={(key) => {
        if (size === null || crop === null) return;
        setCrop(applyCropKey(size, crop, key));
      }}
      onChoose={(file) => void choose(file)}
      onKeyDown={(event) => {
        if (size === null || crop === null) return;
        const next = applyCropKey(size, crop, event.key);
        if (next !== crop) {
          event.preventDefault();
          setCrop(next);
        }
      }}
      onConfirm={() => void confirm()}
      onCancel={cancel}
      onRemove={() => void remove()}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const last = drag.current;
        if (last === null || size === null || crop === null) return;
        setCrop(dragCrop(size, crop, event.clientX - last.x, event.clientY - last.y, event.currentTarget.getBoundingClientRect().width || PREVIEW_SIZE));
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      canvasRef={(element) => {
        canvas.current = element;
      }}
    />
  );
}

/** Avatar de la mascota (`PUT/DELETE /pets/{petId}/avatar`). */
export function AvatarEditor({ petId, petName, avatarVersion, onChanged }: {
  readonly petId: string;
  readonly petName: string;
  readonly avatarVersion: number | null;
  readonly onChanged: () => Promise<void>;
}): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  return (
    <section aria-label={`Foto de perfil de ${petName}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Foto de perfil</h3>
      <AvatarEditorCore
        avatarVersion={avatarVersion}
        upload={(blob) => api.putAvatar(petId, blob)}
        remove={() => api.deleteAvatar(petId)}
        onChanged={onChanged}
        messageOf={(e) => mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined)}
      />
    </section>
  );
}

/** Foto de perfil de la PROPIA cuenta (`PUT/DELETE /account/avatar`, 011 #78): sin id de usuario, sin lectura de fuentes externas; el marco y el título los pone la página. */
export function UserAvatarEditor({ api, avatarVersion, onChanged }: { readonly api: UserAvatarApi; readonly avatarVersion: number | null; readonly onChanged: (version: number | null) => Promise<void> | void }): JSX.Element {
  const versionRef = useRef<number | null>(avatarVersion);
  return (
    <AvatarEditorCore
      avatarVersion={avatarVersion}
      upload={async (blob) => {
        versionRef.current = (await api.put(blob)).avatarVersion;
      }}
      remove={async () => {
        await api.remove();
        versionRef.current = null;
      }}
      onChanged={async () => {
        await onChanged(versionRef.current);
      }}
      messageOf={(e) => userAvatarProblemMessage(e instanceof UserAvatarApiError ? e.code : undefined)}
    />
  );
}
