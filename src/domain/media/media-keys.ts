/**
 * Claves de objeto derivadas solo de UUID v4 en minúsculas y de una carpeta fija (INV-ARC-003): `pets/{petId}/files/{mediaId}`,
 * `pets/{petId}/photos/{mediaId}` y `pets/{petId}/avatar/{avatarObjectId}`. Enmienda MINOR de la 006 (N2-06 (b)): `scenes/{sceneId}/images/{objectId}`
 * y `households/{householdId}/photo/{objectId}`. Sin extensión ni texto del usuario. Se derivan, no se almacenan.
 *
 * @implements INV-ARC-003, REQ-ARC-004, NFR-ALM-004, REQ-ESC6-018, REQ-ESC6-029, INV-ESC6-009
 */

import type { MediaKind } from './media-signatures.ts';

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_V4_ONLY = new RegExp(`^${UUID_V4}$`);
const OBJECT_KEY = new RegExp(`^(?:pets/${UUID_V4}/(?:files|photos|avatar)|scenes/${UUID_V4}/images|households/${UUID_V4}/photo)/${UUID_V4}$`);

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

/** Imagen vigente de una escena del hogar (006). Lanza si algún identificador no es UUID v4 en minúsculas. @implements INV-ARC-003, INV-ESC6-009 */
export function sceneImageObjectKey(sceneId: string, objectId: string): string {
  return `scenes/${requireUuid(sceneId)}/images/${requireUuid(objectId)}`;
}

/** Foto del hogar (006). Lanza si algún identificador no es UUID v4 en minúsculas. @implements INV-ARC-003, INV-ESC6-009 */
export function householdPhotoObjectKey(householdId: string, objectId: string): string {
  return `households/${requireUuid(householdId)}/photo/${requireUuid(objectId)}`;
}

/**
 * true si `key` es exactamente `pets/<uuid>/(files|photos|avatar)/<uuid>`, `scenes/<uuid>/images/<uuid>` o `households/<uuid>/photo/<uuid>`.
 * @implements INV-ARC-003
 */
export function isMediaObjectKey(key: string): boolean {
  return OBJECT_KEY.test(key);
}

/** Prefijos que recorre la conciliación diaria de `REQ-GCS-006` (una sola rutina; los de la 006 los añade `N2-06` (b)). */
export const RECONCILED_PREFIXES: readonly string[] = ['pets/', 'scenes/', 'households/'];

const PETS_ORPHAN_AGE_MINUTES = 24 * 60;
/** Un worker zombi puede subir un objeto tras vencer el arrendamiento (H-LCK-006-11): la escena concilia a los 15 min. */
const SCENE_ORPHAN_AGE_MINUTES = 15;

/** Antigüedad (minutos) a partir de la cual un objeto sin referencia se encola con `DELETE`: 24 h en `pets/`, 15 min en `scenes/` y `households/`. @implements INV-ARC-003, EDGE-ESC6-021 */
export function reconciliationAgeMinutes(key: string): number {
  if (!isMediaObjectKey(key)) throw new RangeError('Clave de medio no válida.');
  return key.startsWith('pets/') ? PETS_ORPHAN_AGE_MINUTES : SCENE_ORPHAN_AGE_MINUTES;
}
