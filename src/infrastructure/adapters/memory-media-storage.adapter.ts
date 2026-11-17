/**
 * Adaptador de memoria de `MediaStoragePort` (desarrollo, E2E y pruebas; REQ-GCS-003). Guarda copias de los bytes; la fecha de creación es
 * la de la primera escritura de la clave. `createReadUrl` apunta a la ruta de desarrollo `/__dev/media/<clave>` (ver `dev-media.routes.ts`).
 * El reloj se inyecta (INV-ARCH-001).
 *
 * @implements REQ-GCS-003, INV-ARC-003, INV-ARC-004
 */

import type { MediaListEntry, MediaObject, MediaReadUrl, MediaReadUrlRequest, MediaStoragePort } from '../../application/ports/media-storage.port.ts';
import { assertListPrefix, assertMediaKey, assertNeutralFilename, assertTtlSeconds } from './media-storage-guards.ts';

export const DEV_MEDIA_PATH = '/__dev/media/';

interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
  createdAt: string;
}

export class MemoryMediaStorageAdapter implements MediaStoragePort {
  private readonly objects = new Map<string, StoredObject>();
  private readonly now: () => Date;

  constructor(options: { readonly now: () => Date }) {
    this.now = options.now;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assertMediaKey(key);
    const previous = this.objects.get(key);
    this.objects.set(key, { bytes: Uint8Array.from(bytes), contentType, createdAt: previous?.createdAt ?? this.now().toISOString() });
  }

  async get(key: string): Promise<MediaObject | null> {
    assertMediaKey(key);
    const found = this.objects.get(key);
    return found === undefined ? null : { bytes: Uint8Array.from(found.bytes), contentType: found.contentType };
  }

  async delete(key: string): Promise<void> {
    assertMediaKey(key);
    this.objects.delete(key);
  }

  async list(prefix: string): Promise<readonly MediaListEntry[]> {
    assertListPrefix(prefix);
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, createdAt: value.createdAt }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async createReadUrl(request: MediaReadUrlRequest): Promise<MediaReadUrl> {
    assertMediaKey(request.key);
    assertTtlSeconds(request.ttlSeconds);
    assertNeutralFilename(request.filename);
    return { url: `${DEV_MEDIA_PATH}${request.key}`, expiresAt: new Date(this.now().getTime() + request.ttlSeconds * 1000).toISOString() };
  }
}
