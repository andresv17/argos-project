/**
 * Cliente HTTP de los medios y el avatar del contrato 004 (OpenAPI 3.1.0): `uploadMedia`, `listMedia`, `getMediaAccess`, `deleteMedia`, `putAvatar` y
 * `deleteAvatar`. Se usa `fetch` propio y no el cliente tipado de la SPA porque este último se genera del OpenAPI 3.0.0 de la 002 (que no declara las
 * rutas de medios) y porque `openapi-fetch` tipa los cuerpos binarios como `string`, no como `Blob`. Los tipos de las respuestas salen del OpenAPI 3.1.0
 * generado, las cabeceras CSRF y de nombre son las del contrato y la `X-Argos-Request` se añade a toda petición (INV-AUTH-007).
 *
 * @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, REQ-AVA-001, INV-AUTH-007
 */
import type { components } from '../../generated/v31/api/openapi-types.ts';
import { notifyActivity } from './activity.ts';

type Schemas = components['schemas'];
export type MediaItem = Schemas['MediaItem'];
export type MediaPage = Schemas['MediaPage'];
export type MediaAccess = Schemas['MediaAccess'];
export type MediaKind = Schemas['MediaKind'];

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
  access(petId: string, mediaId: string): Promise<MediaAccess>;
  upload(petId: string, kind: MediaKind, blob: Blob, filename: string): Promise<MediaItem>;
  remove(petId: string, mediaId: string): Promise<void>;
  putAvatar(petId: string, blob: Blob): Promise<Schemas['AvatarVersionResult']>;
  deleteAvatar(petId: string): Promise<void>;
}

export function createMediaApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): MediaApi {
  async function send(path: string, method: string, headers: Record<string, string> = {}, body?: Blob): Promise<Response> {
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
    notifyActivity();
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
    async access(petId, mediaId) {
      return json<MediaAccess>(await send(`/pets/${petId}/media/${mediaId}/access`, 'GET'));
    },
    async upload(petId, kind, blob, filename) {
      return json<MediaItem>(await send(`/pets/${petId}/media?kind=${kind}`, 'POST', { 'X-Argos-Filename': encodeURIComponent(filename), 'Content-Type': 'application/octet-stream' }, blob));
    },
    async remove(petId, mediaId) {
      await send(`/pets/${petId}/media/${mediaId}`, 'DELETE');
    },
    async putAvatar(petId, blob) {
      return json<Schemas['AvatarVersionResult']>(await send(`/pets/${petId}/avatar`, 'PUT', { 'Content-Type': blob.type }, blob));
    },
    async deleteAvatar(petId) {
      await send(`/pets/${petId}/avatar`, 'DELETE');
    },
  };
}
