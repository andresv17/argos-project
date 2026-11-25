/**
 * Cliente del portal /admin para «Acerca de» (feature 010, T1431; REQ-ACE10-002, EDGE-010-006, EDGE-010-011). Habla solo con `/api/admin/about` (cookie propia de administración):
 * `GET` (vista con `version` y `etag`), `PUT` del texto y `PUT /photo` con cuerpo crudo, ambos con `If-Match` (el etag que se muestra) y `X-Argos-Request`. Cada respuesta se valida en forma.
 *
 * @implements REQ-ACE10-002, EDGE-010-006, EDGE-010-011
 */
export const ABOUT_BODY_MAX_CHARS = 20_000;
export const ABOUT_ALT_MAX_CHARS = 300;

export interface AdminAbout {
  readonly bodyMarkdown: string;
  readonly photoUrl: string | null;
  readonly photoAlt: string;
  readonly updatedAt: string | null;
  readonly version: number;
  readonly etag: string;
}

/** `SESSION_LOST`: 404 uniforme; `PRECONDITION`: 412 (otro guardado entre tanto); `INVALID`: 422 (texto largo o foto no válida); `TOO_LARGE`: 413; `STORAGE`: 502; `FAILED`: red u otra forma. */
export type AboutOutcome<T> =
  | { readonly kind: 'OK'; readonly value: T }
  | { readonly kind: 'SESSION_LOST' }
  | { readonly kind: 'PRECONDITION' }
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'TOO_LARGE' }
  | { readonly kind: 'STORAGE' }
  | { readonly kind: 'FAILED' };

const PATH = '/api/admin/about';
const PHOTO_URL = /^\/api\/about\/photo(\?v=[0-9]+)?$/;

export function parseAdminAbout(body: unknown): AdminAbout | null {
  if (typeof body !== 'object' || body === null) return null;
  const { bodyMarkdown, photoUrl, photoAlt, updatedAt, version, etag } = body as Record<string, unknown>;
  if (typeof bodyMarkdown !== 'string' || typeof photoAlt !== 'string') return null;
  if (photoUrl !== null && (typeof photoUrl !== 'string' || !PHOTO_URL.test(photoUrl))) return null;
  if (updatedAt !== null && typeof updatedAt !== 'string') return null;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null;
  if (typeof etag !== 'string' || !/^"[0-9]+"$/.test(etag)) return null;
  return { bodyMarkdown, photoUrl, photoAlt, updatedAt, version, etag };
}

async function call(init: RequestInit, suffix = ''): Promise<AboutOutcome<AdminAbout>> {
  try {
    const response = await fetch(`${PATH}${suffix}`, { ...init, credentials: 'same-origin' });
    if (response.status === 200) {
      const value = parseAdminAbout(await response.json());
      return value === null ? { kind: 'FAILED' } : { kind: 'OK', value };
    }
    if (response.status === 404) return { kind: 'SESSION_LOST' };
    if (response.status === 412) return { kind: 'PRECONDITION' };
    if (response.status === 413) return { kind: 'TOO_LARGE' };
    if (response.status === 422) return { kind: 'INVALID' };
    if (response.status === 502) return { kind: 'STORAGE' };
    return { kind: 'FAILED' };
  } catch {
    return { kind: 'FAILED' };
  }
}

export const fetchAdminAbout = (): Promise<AboutOutcome<AdminAbout>> => call({ method: 'GET', headers: { Accept: 'application/json' } });

export const saveAboutText = (input: { readonly bodyMarkdown: string; readonly photoAlt: string }, etag: string): Promise<AboutOutcome<AdminAbout>> =>
  call({ method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag, 'X-Argos-Request': '1' }, body: JSON.stringify(input) });

export const saveAboutPhoto = (file: File, etag: string): Promise<AboutOutcome<AdminAbout>> =>
  call({ method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': file.type || 'application/octet-stream', 'If-Match': etag, 'X-Argos-Request': '1' }, body: file }, '/photo');
