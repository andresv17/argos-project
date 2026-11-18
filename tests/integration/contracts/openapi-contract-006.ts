import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { ContractCheck, Operation } from './openapi-contract.ts';
import { ajv } from './openapi-contract.ts';

/**
 * El OpenAPI 3.4.0 de la 006 (`home-scene.openapi.yaml`, 13 operaciones) como validador de respuestas reales. Reutiliza el `ajv` del arnés de la 002 (mismos
 * esquemas comunes `https://argos.local/contracts/schemas/…`) y añade `scene.schema.json` y `scene-payload.schema.json`; los `$ref` relativos del documento se
 * resuelven contra su propio `$id`. Las operaciones `/api/…` llevan el prefijo del servidor; `/internal/scene-worker` no.
 */
const OPENAPI_006_PATH = 'specs/006-escena-hogar-pixel-art/contracts/openapi/home-scene.openapi.yaml';
const OPENAPI_006_ID = 'https://argos.local/contracts/openapi/home-scene.openapi.yaml';
const SCHEMAS_006 = ['specs/006-escena-hogar-pixel-art/contracts/schemas/scene.schema.json', 'specs/006-escena-hogar-pixel-art/contracts/schemas/scene-payload.schema.json'];
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Json = Record<string, unknown>;
export const openapi006 = parseYaml(readFileSync(OPENAPI_006_PATH, 'utf8')) as Json & { paths: Record<string, Record<string, Json>> };

const prefixOf = (path: string): string => (path.startsWith('/internal/') ? '' : '/api');

export const OPERATIONS_006: readonly Operation[] = Object.entries(openapi006.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m] !== undefined).map((m) => {
    const op = item[m] as Json & { operationId: string; responses: Json };
    return { method: m.toUpperCase(), path: `${prefixOf(path)}${path}`, operationId: op.operationId, statuses: Object.keys(op.responses) };
  }),
);

for (const file of SCHEMAS_006) ajv.addSchema(JSON.parse(readFileSync(file, 'utf8')));
ajv.addSchema({ ...openapi006, $id: OPENAPI_006_ID });

const pointer = (...parts: string[]) => parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export function matchOperation006(method: string, url: string): Operation | null {
  const path = url.split('?')[0]!;
  return OPERATIONS_006.find((op) => op.method === method.toUpperCase() && new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path)) ?? null;
}

/** Comprueba una respuesta contra el OpenAPI de la 006: estado declarado, tipo de contenido y cuerpo según el esquema. */
export function checkResponse006(method: string, url: string, status: number, contentType: string | undefined, body: unknown): ContractCheck {
  const op = matchOperation006(method, url);
  if (op === null) return { operationId: null, errors: [`sin operación en el OpenAPI 006 para ${method} ${url}`] };
  const template = op.path.replace(/^\/api/, '');
  let response = (openapi006.paths[template]![method.toLowerCase()] as { responses: Record<string, Json> }).responses[String(status)];
  if (response === undefined) return { operationId: op.operationId, errors: [`${op.operationId}: estado ${status} no declarado (${op.statuses.join(', ')})`] };
  let base = pointer('paths', template, method.toLowerCase(), 'responses', String(status));
  if (typeof response['$ref'] === 'string') {
    base = (response['$ref'] as string).slice(2);
    response = base.split('/').reduce<Json>((node, key) => node[key] as Json, openapi006);
  }
  const content = response['content'] as Record<string, unknown> | undefined;
  if (content === undefined) return { operationId: op.operationId, errors: body === undefined || body === '' ? [] : [`${op.operationId}: ${status} no debe tener cuerpo`] };
  const declared = Object.keys(content);
  const mediaType = declared.find((type) => (contentType ?? '').startsWith(type)) ?? declared[0]!;
  if (!(contentType ?? '').startsWith(mediaType)) return { operationId: op.operationId, errors: [`${op.operationId}: content-type ${contentType} en vez de ${mediaType}`] };
  const ref = `${OPENAPI_006_ID}#/${base}/${pointer('content', mediaType, 'schema')}`;
  let validate = validators.get(ref);
  if (validate === undefined) {
    validate = ajv.compile({ $ref: ref });
    validators.set(ref, validate);
  }
  return { operationId: op.operationId, errors: validate(body) ? [] : (validate.errors ?? []).map((e) => `${op.operationId} ${status}: ${e.instancePath} ${e.message}`) };
}
