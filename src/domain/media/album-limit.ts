/**
 * Tope de fotos del álbum (feature 005): regla pura que decide si una mascota con `currentPhotoCount` fotos admite una más.
 * Cuenta solo `PHOTO` (los archivos clínicos `FILE` no cuentan). Una mascota heredada de la 004 por encima del tope conserva todas sus fotos
 * y solo se le rechazan las subidas nuevas (INV-005-003: nunca se supera `max(tope, conteo previo)` por subidas nuevas).
 *
 * @implements REQ-ALB5-002, REQ-ALB5-003, INV-005-003, ERR-MEDIA-ALBUM-LIMIT
 */
import { DomainError } from '../../generated/v33/index.ts';

/** Lanza ERR-MEDIA-ALBUM-LIMIT (409) cuando ya hay `maxPhotosPerPet` fotos o más. */
export function assertAlbumHasRoom(currentPhotoCount: number, maxPhotosPerPet: number): void {
  if (currentPhotoCount >= maxPhotosPerPet) throw new DomainError('ERR-MEDIA-ALBUM-LIMIT');
}
