/**
 * Cliente HTTP de la foto de perfil de la cuenta (feature 011, #78, T1556; contrato `user-avatar.openapi.yaml` 3.2.0): `put` (cuerpo crudo del recorte), `remove` y `meta`. Solo la PROPIA
 * cuenta: ninguna llamada lleva id de usuario. Se usa `fetch` propio (como `media-api.ts`) porque el cliente tipado de la SPA se genera del OpenAPI 3.0.0 y tipa los cuerpos binarios como
 * texto; la `X-Argos-Request` viaja en toda petición (INV-AUTH-007). Un fallo de red es `ERR-INTERNAL-UNEXPECTED` (estado 0) y nunca rompe el encabezado: quien llama cae a iniciales.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-AUTH-007, EDGE-011-007
 */
import { notifyActivity } from './activity.ts';

export interface UserAvatarMeta {
  readonly avatarVersion: number | null;
}
export interface UserAvatarVersion {
  readonly avatarVersion: number;
}

const UNEXPECTED_CODE = 'ERR-INTERNAL-UNEXPECTED';

/** Error de la API de la foto de perfil: `code` del catálogo (o `ERR-INTERNAL-UNEXPECTED` ante un fallo de red) y estado HTTP (0 sin respuesta). */
export class UserAvatarApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'UserAvatarApiError';
  }
}

/** Textos para la persona de los errores de la foto de perfil (413, 415, 422, 429 y 502); un código desconocido usa el genérico. */
export const USER_AVATAR_MESSAGES: Readonly<Record<string, string>> = {
  'ERR-MEDIA-TOO-LARGE': 'La foto supera el máximo de 512 KB. Prueba con otra o recórtala más.',
  'ERR-MEDIA-TYPE-NOT-ALLOWED': 'Formato no admitido. Usa una foto JPEG, PNG o WebP.',
  'ERR-PRF11-AVATAR-INVALID-IMAGE': 'No se pudo usar esa imagen. Elige otra foto.',
  'ERR-RATE-LIMITED': 'Has subido muchas fotos en poco tiempo. Intenta de nuevo más tarde.',
  'ERR-MEDIA-STORAGE-UNAVAILABLE': 'El almacenamiento de fotos no responde. Intenta de nuevo en unos minutos.',
};
export const userAvatarProblemMessage = (code: string | undefined): string =>
  (code === undefined ? undefined : USER_AVATAR_MESSAGES[code]) ?? 'Ocurrió un error inesperado. Intenta de nuevo.';

export interface UserAvatarApi {
  /** `PUT /account/avatar` con el recorte como cuerpo crudo; el `Content-Type` es el del recorte (el servidor lo compara con la firma). */
  put(blob: Blob): Promise<UserAvatarVersion>;
  /** `DELETE /account/avatar` (204, idempotente). */
  remove(): Promise<void>;
  /** `GET /account/avatar/meta`: `{avatarVersion: N | null}`. */
  meta(): Promise<UserAvatarMeta>;
}

export function createUserAvatarApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): UserAvatarApi {
  async function send(method: string, path: string, headers: Record<string, string> = {}, body?: Blob): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { 'X-Argos-Request': '1', ...headers }, ...(body === undefined ? {} : { body }) });
    } catch {
      throw new UserAvatarApiError(UNEXPECTED_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_CODE;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // Cuerpo no JSON (error del transporte): inesperado con el estado HTTP real.
      }
      throw new UserAvatarApiError(code, response.status);
    }
    notifyActivity(); // INV-AUTH2-002: toda petición con sesión es actividad (como `media-api.ts`)
    return response;
  }
  return {
    async put(blob) {
      return (await (await send('PUT', '/account/avatar', { 'Content-Type': blob.type }, blob)).json()) as UserAvatarVersion;
    },
    async remove() {
      await send('DELETE', '/account/avatar');
    },
    async meta() {
      return (await (await send('GET', '/account/avatar/meta')).json()) as UserAvatarMeta;
    },
  };
}
