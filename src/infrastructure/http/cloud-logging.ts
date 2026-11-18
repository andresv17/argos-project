/**
 * Registro JSON para Cloud Logging (REQ-CLD-008, H-RAMA-003): `severity` y `message` en lugar de `level` y `msg`,
 * sin `pid` ni `hostname`, con la hora en ISO 8601. Los serializadores reducen la petición a método y ruta con plantilla
 * y el error a SQLSTATE y nombre de restricción; el texto de cualquier registro pasa por `redactSecrets` para que
 * `DATABASE_URL` (URL, usuario, contraseña y host) no salga nunca.
 *
 * El registro de petición de Cloud Run (`run.googleapis.com/requests`: IP, URL, user-agent) lo escribe la plataforma
 * fuera del control de la app; la app no lo duplica ni pretende suprimirlo.
 *
 * @implements REQ-CLD-008, SC-CLD-004, INV-AUTH-003, INV-AUD-001
 */

import type { FastifyError } from 'fastify';
import { SystemClockAdapter } from '../adapters/system-clock.adapter.ts';

const defaultClock = new SystemClockAdapter();

export type CloudSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

const SEVERITIES: Readonly<Record<string, CloudSeverity>> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** Severidad de Cloud Logging para un nivel de pino. */
export const severityOf = (label: string): CloudSeverity => SEVERITIES[label] ?? 'INFO';

const REDACTED = '[REDACTED]';
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"'<>]+/gi;
const MIN_FRAGMENT_LENGTH = 3;

/** Fragmentos sensibles de una `DATABASE_URL`: la URL completa, el usuario, la contraseña y el host. */
function sensitiveFragments(databaseUrl: string | undefined): string[] {
  if (databaseUrl === undefined || databaseUrl === '') return [];
  const fragments = [databaseUrl];
  try {
    const url = new URL(databaseUrl);
    fragments.push(url.hostname, decodeURIComponent(url.username), decodeURIComponent(url.password), url.password);
  } catch {
    // URL ilegible: queda la redacción por patrón y por valor completo.
  }
  return [...new Set(fragments)].filter((fragment) => fragment.length >= MIN_FRAGMENT_LENGTH).sort((a, b) => b.length - a.length);
}

/**
 * Formas sensibles de los medios (T582, NFR-ALM-002, SC-ALM-024): la URL firmada y sus parámetros `X-Goog-*`, la clave de objeto `pets/<uuid>/…`, el detalle
 * `Key (…)=(…)` de una violación de unicidad (lleva el microchip) y cualquier número de 15 dígitos (microchip). Se aplican a todo texto del registro,
 * vengan en un mensaje, un campo anidado o un error del SDK.
 */
const SIGNED_URL_PATTERN = /https?:\/\/[^\s"'<>]*X-Goog-[^\s"'<>]*/gi;
const GOOG_PARAMETER_PATTERN = /X-Goog-[A-Za-z0-9-]*\s*[=:]\s*[^\s&"'<>]+/gi;
const OBJECT_KEY_PATTERN = /pets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:files|photos|avatar)(?:\/[0-9a-f-]{36})?)?\/?/gi;
/** Ruta pública del enlace veterinario con el token (`/shared/<43 base64url>`, `/api/shared/…`): el token jamás sale en un registro (INV-005-009, REQ-VET-008). */
const SHARED_PATH_PATTERN = /\/shared\/[A-Za-z0-9_%.~-]{8,}/g;
const UNIQUE_DETAIL_PATTERN = /Key \([^)]*\)=\([^)]*\)(?: already exists\.?)?/g;
const MICROCHIP_PATTERN = /(?<![0-9])[0-9]{15}(?![0-9])/g;

/** Campos que nunca se registran, con cualquier mayúscula y a cualquier profundidad (T582). */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set(['original_name', 'originalname', 'x-argos-filename', 'objectkey', 'object_key', 'microchipid', 'microchip_id', 'signedurl', 'signed_url']);

/** Elimina de `text` toda URL `postgres(ql)://` y, si se conoce, la `DATABASE_URL` configurada y sus partes, más las formas sensibles de los medios. */
export function redactSecrets(text: string, databaseUrl: string | undefined): string {
  let clean = text
    .replace(SIGNED_URL_PATTERN, REDACTED)
    .replace(GOOG_PARAMETER_PATTERN, REDACTED)
    .replace(OBJECT_KEY_PATTERN, REDACTED)
    .replace(SHARED_PATH_PATTERN, '/shared/[REDACTED]')
    .replace(UNIQUE_DETAIL_PATTERN, REDACTED)
    .replace(MICROCHIP_PATTERN, REDACTED)
    .replace(DATABASE_URL_PATTERN, REDACTED);
  for (const fragment of sensitiveFragments(databaseUrl)) clean = clean.split(fragment).join(REDACTED);
  return clean;
}

/** Mensaje de Fastify para una ruta inexistente: `Route GET:/x/<uuid> not found` lleva la URL real. */
const ROUTE_NOT_FOUND_PATTERN = /^Route [A-Z]+:.* not found$/s;

const MAX_DEPTH = 6;

function isPlain(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Copia con todo texto redactado; deja intactos Error y objetos con clase (los tratan los serializadores). */
function scrubValue(value: unknown, databaseUrl: string | undefined, depth: number): unknown {
  if (typeof value === 'string') return ROUTE_NOT_FOUND_PATTERN.test(value) ? 'Route not found' : redactSecrets(value, databaseUrl);
  if (typeof value !== 'object' || value === null || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, databaseUrl, depth + 1));
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_FIELDS.has(key.toLowerCase()) ? REDACTED : scrubValue(item, databaseUrl, depth + 1)]));
}

interface RequestLike {
  readonly method: string;
  readonly routeOptions?: { readonly url?: string | undefined } | undefined;
}

/** Marcador de la petición sin ruta registrada (404): nunca se copia la URL real. */
export const UNROUTED_URL = '(sin-ruta)';

/**
 * Solo método y ruta con plantilla (`/api/pets/:petId`): sin IP, puerto, hostname, query, Authorization ni Cookie.
 * @implements REQ-CLD-008
 */
export function serializeRequest(request: RequestLike): { method: string; url: string } {
  return { method: request.method, url: request.routeOptions?.url ?? UNROUTED_URL };
}

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const CONSTRAINT_PATTERN = /^[A-Za-z_][A-Za-z0-9_$.]{0,62}$/;

/**
 * Solo SQLSTATE y nombre de restricción; nunca `message`, `stack`, `detail`, `where`, `parameters` ni `hint`.
 * @implements REQ-CLD-008
 */
export function serializeError(error: unknown): { sqlstate?: string; constraint?: string } {
  if (typeof error !== 'object' || error === null) return {};
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return {
    ...(typeof code === 'string' && SQLSTATE_PATTERN.test(code) ? { sqlstate: code } : {}),
    ...(typeof constraint === 'string' && CONSTRAINT_PATTERN.test(constraint) ? { constraint } : {}),
  };
}

export interface CloudLoggerSettings {
  /** Valor de `DATABASE_URL` si se conoce, para redactar también su host, usuario y contraseña. */
  readonly databaseUrl?: string | undefined;
}

/** Firma que exigen los tipos de Fastify para `err`; `serializeError` devuelve a propósito un subconjunto sin `message` ni `stack`. */
const errSerializer = serializeError as unknown as (error: FastifyError) => { [key: string]: unknown; type: string; message: string; stack: string };

type LogMethod = (this: unknown, ...args: unknown[]) => void;

/**
 * Opciones de logger de Fastify/pino para Cloud Run. `cookie` y `set-cookie` siguen ocultos (INV-AUTH-003).
 * @implements REQ-CLD-008, INV-AUTH-003
 */
export function cloudLoggerOptions({ databaseUrl }: CloudLoggerSettings = {}) {
  return {
    level: 'info',
    messageKey: 'message',
    base: null,
    timestamp: () => `,"time":"${defaultClock.nowIsoTimestamp()}"`,
    formatters: { level: (label: string) => ({ severity: severityOf(label) }) },
    redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    serializers: { req: serializeRequest, err: errSerializer },
    hooks: {
      logMethod(this: unknown, args: unknown[], method: LogMethod) {
        method.apply(this, args.map((arg) => scrubValue(arg, databaseUrl, 0)));
      },
    },
  };
}
