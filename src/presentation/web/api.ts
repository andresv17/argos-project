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

export type ProblemDetails = components['schemas']['ProblemDetails'];
export type ApiClient = ReturnType<typeof createApiClient>;

export function createWebApi(baseUrl = '/api'): ApiClient {
  return createApiClient(baseUrl);
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
    if (isCatalogCode(candidate.code)) return candidate;
  }
  return catalogProblem('ERR-INTERNAL-UNEXPECTED');
}

/** Texto para el usuario: el `detailTemplate` del catálogo para el código recibido. */
export function problemMessage(problem: ProblemDetails): string {
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
  return result.data as T;
}

/** Nombre del archivo de `Content-Disposition` (exportación de respaldo). */
export function attachmentFileName(header: string | null, fallback = 'argos-backup.json'): string {
  const match = header === null ? null : /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? fallback;
}
