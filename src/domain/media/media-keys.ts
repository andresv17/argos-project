/**
 * Claves de objeto derivadas solo de UUID v4 en minúsculas y de una carpeta fija (INV-ARC-003): `pets/{petId}/files/{mediaId}`,
 * `pets/{petId}/photos/{mediaId}` y `pets/{petId}/avatar/{avatarObjectId}`. Sin extensión ni texto del usuario. Se derivan, no se almacenan.
 *
 * @implements INV-ARC-003, REQ-ARC-004, NFR-ALM-004
 */

import type { MediaKind } from './media-signatures.ts';

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_V4_ONLY = new RegExp(`^${UUID_V4}$`);
const OBJECT_KEY = new RegExp(`^pets/${UUID_V4}/(?:files|photos|avatar)/${UUID_V4}$`);

function requireUuid(value: string): string {
  if (!UUID_V4_ONLY.test(value)) throw new RangeError('Identificador de medio no válido.');
  return value;
}

/** Clave de un archivo o foto. Lanza si algún identificador no es UUID v4 en minúsculas. @implements INV-ARC-003 */
export function mediaObjectKey(petId: string, kind: MediaKind, mediaId: string): string {
  return `pets/${requireUuid(petId)}/${kind === 'PHOTO' ? 'photos' : 'files'}/${requireUuid(mediaId)}`;
}

/** Clave de un avatar. @implements INV-ARC-003 */
export function avatarObjectKey(petId: string, avatarObjectId: string): string {
  return `pets/${requireUuid(petId)}/avatar/${requireUuid(avatarObjectId)}`;
}

/** true si `key` es exactamente `pets/<uuid>/(files|photos|avatar)/<uuid>`. @implements INV-ARC-003 */
export function isMediaObjectKey(key: string): boolean {
  return OBJECT_KEY.test(key);
}
