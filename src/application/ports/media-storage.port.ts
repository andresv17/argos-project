/**
 * Puerto de almacenamiento de objetos de medios (REQ-GCS-003). Adaptadores: GCS (producción) y memoria (desarrollo, E2E y pruebas).
 * Sin `deletePrefix` ni `exists` (la cola de borrado es por clave y la conciliación usa `list`, ADR-004-01, K-03).
 *
 * - Las claves son solo `pets/<uuid>/(files|photos|avatar)/<uuid>` (INV-ARC-003): un adaptador rechaza cualquier otra.
 * - `put` reemplaza el objeto; `get` devuelve `null` si no existe; `delete` es idempotente (inexistente = éxito).
 * - `list(prefix)` devuelve clave y fecha de creación (UTC canónico) ordenadas por clave.
 * - `createReadUrl` produce una URL de lectura `inline` con tipo fijado y nombre neutro (INV-ARC-004, D-14 A); `ttlSeconds` en 30–900.
 * - Todo fallo del almacenamiento se informa como `MediaStorageUnavailableError`, sin clave, URL, cabeceras ni causa del SDK
 *   (NFR-ALM-002, SC-ALM-024).
 *
 * @implements REQ-GCS-003, INV-ARC-003, INV-ARC-004, NFR-ALM-002, INV-ARCH-001
 */

export interface MediaObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface MediaListEntry {
  readonly key: string;
  /** Fecha de creación del objeto, UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ`. */
  readonly createdAt: string;
}

export interface MediaReadUrlRequest {
  readonly key: string;
  /** Tipo detectado: se fija en `response-content-type`. */
  readonly contentType: string;
  /** Nombre neutro de `neutralFilename` (`foto.jpg`, `archivo.pdf`); nunca el nombre original. */
  readonly filename: string;
  /** Caducidad en segundos, 30–900 (`ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS`). */
  readonly ttlSeconds: number;
}

export interface MediaReadUrl {
  readonly url: string;
  /** Instante de caducidad, UTC canónico. */
  readonly expiresAt: string;
}

export type MediaStorageOperation = 'put' | 'get' | 'delete' | 'list' | 'createReadUrl';

/** El almacenamiento no respondió o falló. Sin datos del objeto ni del SDK. @implements NFR-ALM-002, ERR-MEDIA-STORAGE-UNAVAILABLE */
export class MediaStorageUnavailableError extends Error {
  constructor(public readonly operation: MediaStorageOperation) {
    super('Almacenamiento de medios no disponible.');
    this.name = 'MediaStorageUnavailableError';
  }
}

export interface MediaStoragePort {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<MediaObject | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<readonly MediaListEntry[]>;
  createReadUrl(request: MediaReadUrlRequest): Promise<MediaReadUrl>;
}
