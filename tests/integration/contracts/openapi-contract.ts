import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { parse as parseYaml } from 'yaml';

/**
 * El OpenAPI de contracts/openapi/ como validador de respuestas reales (plan §6, `integration/contracts/`).
 * Los $ref relativos ('../schemas/x.schema.json#/$defs/Y') se resuelven contra el $id de cada esquema
 * (https://argos.local/contracts/schemas/...), con el documento OpenAPI publicado en https://argos.local/contracts/openapi/.
 */
export const OPENAPI_PATH = 'contracts/openapi/pet-tracker-api.openapi.yaml';
const OPENAPI_ID = 'https://argos.local/contracts/openapi/pet-tracker-api.openapi.yaml';
export const API_PREFIX = '/api';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Json = Record<string, unknown>;
export const openapi = parseYaml(readFileSync(OPENAPI_PATH, 'utf8')) as Json & { paths: Record<string, Record<string, Json>> };

export interface Operation {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly statuses: readonly string[];
}

/** Las operaciones del OpenAPI: método en mayúsculas, ruta con prefijo /api y estados declarados. */
export const OPERATIONS: readonly Operation[] = Object.entries(openapi.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m] !== undefined).map((m) => {
    const op = item[m] as Json & { operationId: string; responses: Json };
    return { method: m.toUpperCase(), path: `${API_PREFIX}${path}`, operationId: op.operationId, statuses: Object.keys(op.responses) };
  }),
);

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const file of readdirSync('contracts/schemas')) ajv.addSchema(JSON.parse(readFileSync(join('contracts/schemas', file), 'utf8')));
ajv.addSchema({ ...openapi, $id: OPENAPI_ID });

const pointer = (...parts: string[]) => parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const validators = new Map<string, ValidateFunction>();

/** Plantilla del OpenAPI que corresponde a una URL concreta (sin consulta), o null. */
export function matchOperation(method: string, url: string): Operation | null {
  const path = url.split('?')[0]!;
  return (
    OPERATIONS.find((op) => op.method === method.toUpperCase() && new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path)) ?? null
  );
}

export interface ContractCheck {
  readonly operationId: string | null;
  readonly errors: readonly string[];
}

/**
 * Comprueba una respuesta contra el OpenAPI: estado declarado, tipo de contenido y cuerpo según el esquema.
 * Sin operación que coincida, o con un estado no declarado, devuelve el error correspondiente.
 */
export function checkResponse(method: string, url: string, status: number, contentType: string | undefined, body: unknown): ContractCheck {
  const op = matchOperation(method, url);
  if (op === null) return { operationId: null, errors: [`sin operación en el OpenAPI para ${method} ${url}`] };
  const template = op.path.slice(API_PREFIX.length);
  let response = (openapi.paths[template]![method.toLowerCase()] as { responses: Record<string, Json> }).responses[String(status)];
  if (response === undefined) return { operationId: op.operationId, errors: [`${op.operationId}: estado ${status} no declarado (${op.statuses.join(', ')})`] };
  let base = pointer('paths', template, method.toLowerCase(), 'responses', String(status));
  if (typeof response['$ref'] === 'string') {
    base = (response['$ref'] as string).slice(2);
    response = base.split('/').reduce<Json>((node, key) => node[key] as Json, openapi);
  }
  const content = response['content'] as Record<string, unknown> | undefined;
  if (content === undefined) return { operationId: op.operationId, errors: body === undefined || body === '' ? [] : [`${op.operationId}: ${status} no debe tener cuerpo`] };
  const mediaType = Object.keys(content)[0]!;
  if (!(contentType ?? '').startsWith(mediaType)) return { operationId: op.operationId, errors: [`${op.operationId}: content-type ${contentType} en vez de ${mediaType}`] };
  const ref = `${OPENAPI_ID}#/${base}/${pointer('content', mediaType, 'schema')}`;
  let validate = validators.get(ref);
  if (validate === undefined) {
    validate = ajv.compile({ $ref: ref });
    validators.set(ref, validate);
  }
  return {
    operationId: op.operationId,
    errors: validate(body) ? [] : (validate.errors ?? []).map((e) => `${op.operationId} ${status}: ${e.instancePath} ${e.message}`),
  };
}
