/**
 * Adaptador GCS de `MediaStoragePort` con el SDK oficial `@google-cloud/storage` (D-01 A, versión exacta 9.0.0, enmienda 3.5.0). Es el
 * único archivo de `src/` que importa el SDK (C-4, prueba de arquitectura `gcs-sdk-isolation.spec.ts`).
 *
 * - `createReadUrl`: URL V4 `GET` por host virtual (`https://<bucket>.storage.googleapis.com/<clave>?...`), con `X-Goog-Expires` igual al
 *   TTL, `response-content-type` (tipo detectado) y `response-content-disposition: inline; filename="<nombre neutro>"` firmados (D-14 A,
 *   INV-ARC-004). La firma usa `signBlob` de la cuenta de ejecución (credenciales por defecto de Cloud Run): este código no lee ni crea
 *   llaves de cuenta de servicio.
 * - `put` usa carga simple (no reanudable) con validación MD5; `delete` ignora el inexistente; `list` recorre todas las páginas.
 * - Saneado de errores (C-7, NFR-ALM-002, SC-ALM-024): todo fallo del SDK, de la red o de `signBlob` se traduce a
 *   `MediaStorageUnavailableError` sin mensaje, pila ni causa del original, que podrían contener la URL firmada, `X-Goog-*` o la clave.
 *   El adaptador no escribe logs y no activa `debug` ni `GOOGLE_SDK_NODE_LOGGING`.
 *
 * @implements REQ-GCS-003, REQ-ARC-003, INV-ARC-003, INV-ARC-004, NFR-ALM-002, NFR-ALM-003, NFR-ALM-004
 */

import { Storage, type StorageOptions } from '@google-cloud/storage';
import {
  MediaStorageUnavailableError,
  type MediaListEntry,
  type MediaObject,
  type MediaReadUrl,
  type MediaReadUrlRequest,
  type MediaStorageOperation,
  type MediaStoragePort,
} from '../../application/ports/media-storage.port.ts';
import { assertListPrefix, assertMediaKey, assertNeutralFilename, assertTtlSeconds } from './media-storage-guards.ts';

const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,62}$/;

export interface GcsStorageOptions {
  /** Solo pruebas: doble HTTP de la API JSON. Con GCS real se omite. */
  readonly apiEndpoint?: string;
  readonly projectId?: string;
  /** Solo pruebas: cliente de autenticación (en Cloud Run se usan las credenciales por defecto, sin llaves). */
  readonly authClient?: StorageOptions['authClient'];
  /** Reintentos automáticos del SDK (por defecto sí, con tope de 2 y 20 s). */
  readonly autoRetry?: boolean;
}

/** Cliente `Storage` con reintentos acotados. Sin llaves: las credenciales vienen del entorno (cuenta `argos-run@`). */
export function createGcsStorage(options: GcsStorageOptions = {}): Storage {
  return new Storage({
    ...(options.apiEndpoint === undefined ? {} : { apiEndpoint: options.apiEndpoint }),
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    ...(options.authClient === undefined ? {} : { authClient: options.authClient }),
    retryOptions: { autoRetry: options.autoRetry ?? true, maxRetries: 2, totalTimeout: 20 },
  });
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  return candidate?.code === 404 || candidate?.code === '404' || candidate?.status === 404 || candidate?.response?.status === 404;
}

export class GcsMediaStorageAdapter implements MediaStoragePort {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly now: () => Date;

  constructor(options: { readonly storage: Storage; readonly bucket: string; readonly now: () => Date }) {
    if (!BUCKET_NAME.test(options.bucket)) throw new RangeError('Nombre de bucket de medios no válido.');
    this.storage = options.storage;
    this.bucketName = options.bucket;
    this.now = options.now;
  }

  private async guarded<T>(operation: MediaStorageOperation, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch {
      // Se descarta el error original: su texto, pila y causa pueden llevar URL firmadas, X-Goog-* y claves de objeto.
      throw new MediaStorageUnavailableError(operation);
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assertMediaKey(key);
    await this.guarded('put', () => this.storage.bucket(this.bucketName).file(key).save(Buffer.from(bytes), { resumable: false, contentType, validation: 'md5' }));
  }

  async get(key: string): Promise<MediaObject | null> {
    assertMediaKey(key);
    return this.guarded('get', async () => {
      const file = this.storage.bucket(this.bucketName).file(key);
      try {
        const [metadata] = await file.getMetadata();
        const [content] = await file.download({ validation: false });
        return { bytes: Uint8Array.from(content), contentType: typeof metadata.contentType === 'string' ? metadata.contentType : 'application/octet-stream' };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    });
  }

  async delete(key: string): Promise<void> {
    assertMediaKey(key);
    await this.guarded('delete', async () => {
      await this.storage.bucket(this.bucketName).file(key).delete({ ignoreNotFound: true });
    });
  }

  async list(prefix: string): Promise<readonly MediaListEntry[]> {
    assertListPrefix(prefix);
    return this.guarded('list', async () => {
      const [files] = await this.storage.bucket(this.bucketName).getFiles({ prefix, autoPaginate: true });
      return files
        .map((file) => ({ key: file.name, createdAt: new Date(String(file.metadata.timeCreated)).toISOString() }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    });
  }

  async createReadUrl(request: MediaReadUrlRequest): Promise<MediaReadUrl> {
    assertMediaKey(request.key);
    assertTtlSeconds(request.ttlSeconds, request.allowShortTtl === true);
    assertNeutralFilename(request.filename);
    // Se alinea el inicio al segundo para que X-Goog-Expires sea exactamente el TTL configurado.
    const startMs = Math.floor(this.now().getTime() / 1000) * 1000;
    const expiresMs = startMs + request.ttlSeconds * 1000;
    return this.guarded('createReadUrl', async () => {
      const [url] = await this.storage
        .bucket(this.bucketName)
        .file(request.key)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          virtualHostedStyle: true,
          accessibleAt: new Date(startMs),
          expires: expiresMs,
          responseType: request.contentType,
          responseDisposition: `inline; filename="${request.filename}"`,
        });
      return { url, expiresAt: new Date(expiresMs).toISOString() };
    });
  }
}
