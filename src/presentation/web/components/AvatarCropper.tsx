/**
 * Recortador del avatar de la mascota (T586, REQ-AVA-002, REQ-AVA-001): la persona elige una foto, la mueve y acerca (arrastre, flechas y +/-) dentro de una
 * vista previa con máscara circular y confirma; el cliente exporta un cuadrado de 512×512 (WebP, o JPEG con calidad 0,85 si el navegador no codifica WebP) y lo
 * sube con `PUT /pets/{petId}/avatar`. La vista previa se dibuja en un `canvas` (no usa URL `blob:`, que la CSP de producción no permite en `img-src`).
 * `AvatarCropperView` es presentacional; `AvatarEditor` es el contenedor con la sesión de recorte.
 *
 * @implements REQ-AVA-001, REQ-AVA-002
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from './Field.tsx';
import { applyCropKey, AvatarExportError, cropSquare, dragCrop, exportAvatar, initialCrop, type AvatarCanvasPort, type CropState, type ImageSize } from '../avatar-crop.ts';
import { createMediaApi, MediaApiError } from '../media-api.ts';
import { mediaProblemMessage, PHOTO_ACCEPT } from '../media-view.ts';

const PREVIEW_SIZE = 256;

export interface AvatarCropperViewProps {
  readonly hasAvatar: boolean;
  readonly hasImage: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly previewSize: number;
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
    <div className="grid gap-3">
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
          onChange={(e) => props.onChoose(e.target.files?.[0] ?? null)}
          className="min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
      </div>
      {hasImage ? (
        <>
          <div
            role="img"
            aria-label="Vista previa circular del recorte de la foto de perfil"
            tabIndex={0}
            onKeyDown={props.onKeyDown}
            onPointerDown={props.onPointerDown}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            style={{ width: previewSize, height: previewSize, touchAction: 'none' }}
            className="overflow-hidden rounded-full border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <canvas ref={props.canvasRef} width={previewSize} height={previewSize} />
          </div>
          <p className="text-sm text-text-muted">Flechas para mover, + y - para acercar o alejar; también puedes arrastrar la foto.</p>
          <div className="flex flex-wrap gap-2">
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

/** Contenedor: sesión de recorte (imagen decodificada, zoom y centro), exportación 512×512 y subida o retirada del avatar. */
export function AvatarEditor({ petId, petName, avatarVersion, onChanged }: {
  readonly petId: string;
  readonly petName: string;
  readonly avatarVersion: number | null;
  readonly onChanged: () => Promise<void>;
}): JSX.Element {
  const api = useMemo(() => createMediaApi(), []);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const reset = useCallback((): void => {
    setBitmap(null);
    setCrop(null);
  }, []);

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
    try {
      const exported = await exportAvatar(outputPort(bitmap), cropSquare(size, crop));
      await api.putAvatar(petId, exported.blob);
      reset();
      await onChanged();
    } catch (e) {
      setError(e instanceof AvatarExportError ? e.message : mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAvatar(petId);
      await onChanged();
    } catch (e) {
      setError(mediaProblemMessage(e instanceof MediaApiError ? e.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={`Foto de perfil de ${petName}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Foto de perfil</h3>
      <AvatarCropperView
        hasAvatar={avatarVersion !== null}
        hasImage={bitmap !== null}
        busy={busy}
        error={error}
        previewSize={PREVIEW_SIZE}
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
        onCancel={reset}
        onRemove={() => void remove()}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const last = drag.current;
          if (last === null || size === null || crop === null) return;
          setCrop(dragCrop(size, crop, event.clientX - last.x, event.clientY - last.y, PREVIEW_SIZE));
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        canvasRef={(element) => {
          canvas.current = element;
        }}
      />
    </section>
  );
}
