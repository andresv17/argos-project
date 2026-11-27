/**
 * Puerto de almacenamiento de objetos de medios (REQ-GCS-003). Adaptadores: GCS (producción) y memoria (desarrollo, E2E y pruebas).
 * Sin `deletePrefix` ni `exists` (la cola de borrado es por clave y la conciliación usa `list`, ADR-004-01, K-03).
 *
 * - Las claves son solo `pets/<uuid>/(files|photos|avatar)/<uuid>`, `scenes/<uuid>/images/<uuid>`, `households/<uuid>/photo/<uuid>`, `users/<uuid>/avatar/<uuid>` (ENM-004-MINOR, 011 #78) y `about/photo/<uuid>` (INV-ARC-003; la última, excepción de la 010, H-ARCH-ACE-KEY): un adaptador rechaza cualquier otra.
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
  /** Caducidad en segundos, 30–900 (`ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS`); con `allowShortTtl`, 1–900. */
  readonly ttlSeconds: number;
  /**
   * Solo la superficie pública del enlace veterinario (REQ-VET-009, EDGE-005-23): admite desde 1 s para que `X-Goog-Expires = min(300, restante)` no deje una
   * URL viva más allá del enlace. Ausente: el rango de la 004 (30–900), que el resto de las rutas sigue exigiendo.
   */
  readonly allowShortTtl?: boolean;
  /**
   * Tratamiento del archivo en `response-content-disposition`. Ausente o `inline`: lectura en línea con `filename` neutro (INV-ARC-004). `attachment`: descarga
   * de la escena del hogar (REQ-UX8-002, contrato 006 3.5.0), con `filename` fijo `argos-hogar-AAAA-MM-DD.png` y sin PII.
   */
  readonly disposition?: 'inline' | 'attachment';
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
