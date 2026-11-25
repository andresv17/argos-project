/**
 * Acceso a la API HTTP desde la SPA, solo mediante el cliente generado de `contracts/openapi/` (INV-ARCH-004).
 * El cliente añade `X-Argos-Request: 1` a toda petición (INV-AUTH-007). Los errores se exponen como
 * `ProblemDetails` y su texto sale del catálogo de errores.
 *
 * @implements REQ-UI-005, INV-ARCH-004, INV-AUTH-007, ERR-INTERNAL-UNEXPECTED
 */
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE, createApiClient } from '../../generated/api/client.ts';
import type { components } from '../../generated/api/openapi-types.ts';
import { ERROR_CATALOG, type ErrorCode } from '../../generated/errors/error-codes.ts';
import { notifyActivity } from './activity.ts';
import { businessRuleMessage, humanSchemaMessage } from './schema-messages.ts';

export type ProblemDetails = components['schemas']['ProblemDetails'];
export type ApiClient = ReturnType<typeof createApiClient>;

export function createWebApi(baseUrl = '/api'): ApiClient {
  return createApiClient(baseUrl);
}

/** Transporte HTTP crudo de la SPA: recibe la ruta bajo `baseUrl` y devuelve la `Response` (también en 4xx/5xx; un fallo de red lanza). */
export type RawTransport = (path: string, init: { readonly method: string; readonly headers: Record<string, string>; readonly body?: string }) => Promise<Response>;

/**
 * Transporte por el cliente de `api.ts` para rutas que el OpenAPI 002 no declara (009): no hay otra llamada directa a la red fuera de media/scene/share-api (INV-AUTH2-002).
 * El cuerpo se envía tal cual (ya serializado por quien llama); la actividad la notifica quien lo usa tras una respuesta correcta.
 */
export function createRawTransport(baseUrl = ''): RawTransport {
  return async (path, init) => {
    if (init.method !== 'POST') throw new Error('createRawTransport solo admite POST');
    // El cliente consume el cuerpo de un error para tipar `error`; el middleware conserva una copia intacta de la respuesta para quien llama.
    const client = createWebApi(baseUrl);
    let kept: Response | undefined;
    client.use({
      onResponse({ response }) {
        kept = response.clone();
      },
    });
    await (client as unknown as { POST(path: string, options: object): Promise<unknown> }).POST(path, {
      headers: init.headers,
      parseAs: 'stream',
      ...(init.body === undefined ? {} : { body: init.body, bodySerializer: (body: unknown) => body }),
    });
    return kept!;
  };
}

/** Parámetro de cabecera CSRF que el OpenAPI declara obligatorio en las operaciones mutantes (INV-AUTH-007). */
export const CSRF_PARAMS = { header: { [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE } } as const;

/** Error de la API con su `ProblemDetails`. */
export class ApiProblem extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiProblem';
  }
}

const isCatalogCode = (code: string): code is ErrorCode => Object.prototype.hasOwnProperty.call(ERROR_CATALOG, code);

/** Código del 409 de revisión desactualizada (3.1.0, D-16 A): el catálogo 002 que usa la SPA no lo trae. @implements REQ-BOR-005 */
export const RECORD_CONFLICT_CODE = 'ERR-REC-CONFLICT';
/** Texto de la interfaz para ese 409 (REQ-BOR-005, D-16 A). */
export const RECORD_CONFLICT_MESSAGE = 'El registro cambió; recarga y vuelve a intentarlo.';

/** 412 de la ficha desactualizada (007, EDGE-007-009): otra persona la cambió; la interfaz recarga y pide reintentar. @implements REQ-FAL7-003 */
export const isPetVersionConflict = (error: unknown): boolean => error instanceof ApiProblem && error.problem.code === 'ERR-PET-VERSION-CONFLICT';

/** `ProblemDetails` del catálogo para un código, con los campos opcionales que se indiquen. */
export function catalogProblem(code: ErrorCode, field?: string): ProblemDetails {
  const entry = ERROR_CATALOG[code];
  return {
    type: `urn:argos:error:${code}`,
    code,
    title: entry.title,
    status: entry.status,
    detail: entry.detailTemplate,
    invariantRef: entry.invariantRef,
    ...(field === undefined ? {} : { field }),
  };
}

/** Normaliza el cuerpo de error recibido: si no es un `ProblemDetails` del catálogo, ERR-INTERNAL-UNEXPECTED. */
export function toProblem(error: unknown): ProblemDetails {
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    const candidate = error as ProblemDetails;
    if (isCatalogCode(candidate.code) || candidate.code === RECORD_CONFLICT_CODE) return candidate;
  }
  return catalogProblem('ERR-INTERNAL-UNEXPECTED');
}

/** Texto para el usuario: el `detailTemplate` del catálogo para el código recibido; el de esquema formal se redacta en llano (T293). */
export function problemMessage(problem: ProblemDetails): string {
  if (problem.code === RECORD_CONFLICT_CODE) return RECORD_CONFLICT_MESSAGE;
  // El detalle de una regla de negocio (p. ej. fecha posterior al fallecimiento) se conserva; el error técnico crudo de esquema cae en el texto llano por campo.
  if (problem.code === 'ERR-SCHEMA-VALIDATION-FAILED') return businessRuleMessage(problem.detail) ?? humanSchemaMessage(typeof problem.field === 'string' ? problem.field : undefined);
  return isCatalogCode(problem.code) ? ERROR_CATALOG[problem.code].detailTemplate : problem.detail;
}

interface FetchResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
}

/** Devuelve `data` o lanza `ApiProblem`. Un fallo de red se convierte en ERR-INTERNAL-UNEXPECTED. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    throw new ApiProblem(catalogProblem('ERR-INTERNAL-UNEXPECTED'));
  }
  if (result.error !== undefined || !result.response.ok) throw new ApiProblem(toProblem(result.error));
  notifyActivity();
  return result.data as T;
}

/** Nombre del archivo de `Content-Disposition` (exportación de respaldo). */
export function attachmentFileName(header: string | null, fallback = 'tipi-backup.json'): string {
  const match = header === null ? null : /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? fallback;
}
