/**
 * Funciones puras de presentación de la ficha QR (Feature 012, Bloque D, T1676): textos de aviso de apagado, líneas de alergias, comprobación del SVG antes de descargarlo, nombres de archivo y
 * generación del PNG en el cliente. Sin reglas de negocio: la validación, la normalización y la guarda son del servidor.
 *
 * @implements REQ-QR12-005, REQ-QR12-010, SVG_DELIVERY
 */
import type { EmergencyCardOwnerView, EmergencyStatusReason } from './emergency-api.ts';

/** Aviso del apagado automático por causa (REQ-QR12-010); el apagado manual no es un aviso. */
export function autoOffNotice(reason: EmergencyStatusReason | null): string | null {
  switch (reason) {
    case 'AUTO_GUARD_LOST':
      return 'La ficha QR se apagó sola porque ya no hay alergias críticas ni teléfono visible. Agrega alguno y vuelve a activarla; el código anterior ya no funciona.';
    case 'AUTO_PET_DECEASED':
      return 'La ficha QR se apagó sola porque la mascota figura como fallecida. El código anterior ya no funciona.';
    case 'AUTO_NOTICE_CHANGED':
      return 'La ficha QR se apagó sola porque el aviso cambió y ya no queda nada visible. Confirma el aviso nuevo y vuelve a activarla; el código anterior ya no funciona.';
    default:
      return null;
  }
}

/** Aviso a los demás titulares cuando otro cambió la ficha (`lastChange.byMe = false`). */
export function otherOwnerNotice(view: Pick<EmergencyCardOwnerView, 'lastChange'>): string | null {
  const change = view.lastChange;
  if (change === null || change.byMe) return null;
  switch (change.kind) {
    case 'ACTIVATED':
      return 'Otro propietario activó la ficha QR.';
    case 'REGENERATED':
      return 'Otro propietario generó un código nuevo: el anterior dejó de funcionar.';
    case 'DEACTIVATED':
      return 'Otro propietario desactivó la ficha QR.';
    default:
      return null;
  }
}

/** Una alergia por línea; las líneas vacías se descartan. El servidor normaliza y valida (NFC, duplicados, caracteres). */
export const allergiesFromText = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
export const allergiesToText = (list: readonly string[]): string => list.join('\n');

/** Solo `svg`, `rect` y `path` sin atributos peligrosos (SVG_DELIVERY): una defensa más antes de ofrecer el SVG, que nunca se inyecta como HTML. */
export function isSafeQrSvg(svg: string): boolean {
  if (!/^<svg[\s>]/.test(svg.trimStart())) return false;
  const tags = [...svg.matchAll(/<\/?\s*([A-Za-z][A-Za-z0-9:-]*)/g)].map((m) => (m[1] ?? '').toLowerCase());
  if (tags.some((tag) => tag !== 'svg' && tag !== 'rect' && tag !== 'path')) return false;
  return !/\son[a-z]+\s*=|href\s*=|<!|<\?|javascript:/i.test(svg);
}

export const qrFileName = (extension: 'svg' | 'png'): string => `ficha-qr-emergencia.${extension}`;

/** Descarga por `Blob` y atributo `download` (jamás HTML en línea); el enlace temporal se retira y la URL se revoca DIFERIDA (revocar en el mismo turno que `click()` cancela la descarga en algunos navegadores). */
export function downloadBlobAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `data:` URI del SVG: la CSP de producción (`img-src 'self' data:`) NO admite `blob:`. Solo tras `isSafeQrSvg`; devuelve `null` si el SVG no es seguro. */
export const svgDataUri = (svg: string): string | null => (isSafeQrSvg(svg) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null);

export const svgBlob = (svg: string): Blob => new Blob([svg], { type: 'image/svg+xml' });

/** PNG en el cliente desde el mismo SVG (canvas), `size` px de lado con margen blanco; falla con `null` si el navegador no lo permite. */
export async function svgToPngBlob(svg: string, size = 1024): Promise<Blob | null> {
  const url = svgDataUri(svg);
  if (url === null) return null;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('svg'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, size, size);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}
