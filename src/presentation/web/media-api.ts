/**
 * Cliente HTTP de los medios y el avatar del contrato 004 (OpenAPI 3.1.0): `uploadMedia`, `listMedia`, `getMediaAccess`, `deleteMedia`, `putAvatar` y
 * `deleteAvatar`. Se usa `fetch` propio y no el cliente tipado de la SPA porque este último se genera del OpenAPI 3.0.0 de la 002 (que no declara las
 * rutas de medios) y porque `openapi-fetch` tipa los cuerpos binarios como `string`, no como `Blob`. Los tipos de las respuestas salen del OpenAPI 3.1.0
 * generado, las cabeceras CSRF y de nombre son las del contrato y la `X-Argos-Request` se añade a toda petición (INV-AUTH-007).
 *
 * @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, REQ-AVA-001, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

/*
 * Formas de las respuestas del OpenAPI 3.1.0 (MediaItem, MediaPage, MediaAccess, AvatarVersionResult). Se declaran aquí y no se importan de
 * `src/generated/v31/api/` porque la regla de capas de la presentación (`presentation-architecture.spec.ts`) solo admite módulos concretos de `generated/`;
 * `tests/unit/presentation/t611-contrato-medios.spec.ts` comprueba en compilación que son asignables en ambos sentidos a los tipos generados.
 */
export type MediaKind = 'FILE' | 'PHOTO';
export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export interface MediaItem {
  readonly id: string;
  readonly petId: string;
  readonly kind: MediaKind;
  readonly mime: MediaMime;
  readonly sizeBytes: number;
  readonly originalName: string;
  readonly createdAt: string;
}
export interface MediaPage {
  readonly items: readonly MediaItem[];
  readonly page: number;
  readonly pageSize: 24;
  readonly total: number;
}
export interface MediaAccess {
  readonly url: string;
  readonly expiresAt: string;
  readonly mime: MediaMime;
}
/** `AlbumLimits` del contrato 005 (`getAlbumLimits`): fotos actuales y tope vigente; el cliente no cablea el tope (REQ-ALB5-005). */
export interface AlbumLimits {
  readonly photoCount: number;
  readonly maxPhotosPerPet: number;
}
export interface AvatarVersionResult {
  readonly avatarVersion: number;
}

export const UNEXPECTED_CODE = 'ERR-INTERNAL-UNEXPECTED';

/** Error de la API de medios: `code` del catálogo (o `ERR-INTERNAL-UNEXPECTED` ante un fallo de red) y estado HTTP (0 sin respuesta). */
export class MediaApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'MediaApiError';
  }
}

export interface MediaApi {
  list(petId: string, kind: MediaKind | undefined, page: number): Promise<MediaPage>;
  /** `GET /pets/{petId}/album/limits` (REQ-ALB5-005). */
  albumLimits(petId: string): Promise<AlbumLimits>;
  /** `renewal: true` es la renovación proactiva del visor: envía `X-Argos-Renewal: 1` y NO cuenta como actividad (SC-ALM-036). */
  access(petId: string, mediaId: string, options?: { readonly renewal?: boolean }): Promise<MediaAccess>;
  upload(petId: string, kind: MediaKind, blob: Blob, filename: string): Promise<MediaItem>;
  remove(petId: string, mediaId: string): Promise<void>;
  putAvatar(petId: string, blob: Blob): Promise<AvatarVersionResult>;
  deleteAvatar(petId: string): Promise<void>;
}

export function createMediaApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): MediaApi {
  async function send(path: string, method: string, headers: Record<string, string> = {}, body?: Blob, passive = false): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { 'X-Argos-Request': '1', ...headers }, ...(body === undefined ? {} : { body }) });
    } catch {
      throw new MediaApiError(UNEXPECTED_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_CODE;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // Cuerpo no JSON (error del transporte): se informa como inesperado con el estado HTTP real.
      }
      throw new MediaApiError(code, response.status);
    }
    if (!passive) notifyActivity();
    return response;
  }
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  return {
    async list(petId, kind, page) {
      const query = new URLSearchParams();
      if (kind !== undefined) query.set('kind', kind);
      query.set('page', String(page));
      return json<MediaPage>(await send(`/pets/${petId}/media?${query.toString()}`, 'GET'));
    },
    async albumLimits(petId) {
      return json<AlbumLimits>(await send(`/pets/${petId}/album/limits`, 'GET'));
    },
    async access(petId, mediaId, options) {
      const passive = options?.renewal === true;
      return json<MediaAccess>(await send(`/pets/${petId}/media/${mediaId}/access`, 'GET', passive ? { 'X-Argos-Renewal': '1' } : {}, undefined, passive));
    },
    async upload(petId, kind, blob, filename) {
      return json<MediaItem>(await send(`/pets/${petId}/media?kind=${kind}`, 'POST', { 'X-Argos-Filename': encodeURIComponent(filename), 'Content-Type': 'application/octet-stream' }, blob));
    },
    async remove(petId, mediaId) {
      await send(`/pets/${petId}/media/${mediaId}`, 'DELETE');
    },
    async putAvatar(petId, blob) {
      return json<AvatarVersionResult>(await send(`/pets/${petId}/avatar`, 'PUT', { 'Content-Type': blob.type }, blob));
    },
    async deleteAvatar(petId) {
      await send(`/pets/${petId}/avatar`, 'DELETE');
    },
  };
}
