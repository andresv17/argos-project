import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { parse as parseYaml } from 'yaml';

/**
 * El OpenAPI de contracts/openapi/ como validador de respuestas reales.
 * Los $ref relativos ('../schemas/x.schema.json#/$defs/Y') se resuelven contra el $id de cada esquema
 * (https://argos.local/contracts/schemas/...), con el documento OpenAPI publicado en https://argos.local/contracts/openapi/.
 */
export const OPENAPI_PATH = 'specs/002-plataforma-v21/contracts/openapi/pet-tracker-api.openapi.yaml';
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

// T578 (REQ-ARC-001): las rutas de medios y avatar solo existen en el OpenAPI 3.1.0 de la 004. Se incorporan al documento del arnés con sus respuestas
// tal como las declara la 004 (los `$ref` de componentes que comparten ambos documentos, como `Problem` y `ProblemDetails`, siguen resolviéndose en el de la 002).
const OPENAPI_004_PATH = 'specs/004-catalogos-registros-archivos/contracts/openapi/pet-tracker-api.openapi.yaml';
const MEDIA_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/media.schema.json';
const openapi004 = parseYaml(readFileSync(OPENAPI_004_PATH, 'utf8')) as { paths: Record<string, Record<string, Json>> };
const MEDIA_PATHS = ['/pets/{petId}/media', '/pets/{petId}/media/{mediaId}/access', '/pets/{petId}/media/{mediaId}', '/pets/{petId}/avatar'];
for (const mediaPath of MEDIA_PATHS) openapi.paths[mediaPath] = openapi004.paths[mediaPath]!;
/** Operaciones de medios y avatar de la 004: SOLO sirven para comprobar respuestas; el inventario `OPERATIONS` (la API 002 de 40 operaciones) no cambia. */
export const MEDIA_OPERATIONS: readonly Operation[] = MEDIA_PATHS.flatMap((path) =>
  METHODS.filter((m) => openapi004.paths[path]![m] !== undefined).map((m) => {
    const op = openapi004.paths[path]![m] as Json & { operationId: string; responses: Json };
    return { method: m.toUpperCase(), path: `${API_PREFIX}${path}`, operationId: op.operationId, statuses: Object.keys(op.responses) };
  }),
);



// Mismas opciones numéricas que los validadores generados (scripts/codegen.mjs): sin multipleOfPrecision, 32.85 no es múltiplo de 0.001 por coma flotante (T226).
export const ajv = new Ajv2020({ strict: false, allErrors: true, multipleOfPrecision: 10 });
addFormats(ajv);
// T525: las respuestas de mascota llevan `breedCode` (pet.schema.json 3.1.0 de la 004, mismo $id). `avatarVersion` se exige desde T584
// (columna de avatar); el resto de esquemas sigue siendo el de la 002.
const PET_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/pet.schema.json';
// T535: los parámetros adicionales llevan `symptomType` y `severity` (medical-records.schema.json 3.1.0 de la 004, mismo $id).
// T614 (H-O-T540-1, diferido desde T540): `revision` (D-16 A, solo lectura) ya la leen y la devuelven los 3 repositorios y todas las respuestas de
// registros; se RETIRÓ su exención y el arnés la exige como `required` en los 6 registros (y en los registros anidados de tablero y listados).
// T617: `symptomType` y `severity` vuelven a ser obligatorios en el registro (ya no hay exportación 3.0.0 que los omita); es un endurecimiento.
const RECORDS_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/medical-records.schema.json';
// T617: el respaldo es 3.1.0 (backup-envelope.schema.json 3.1.0 de la 004, mismo $id; conserva BackupEnvelopeV3 y los heredados, añade
// BackupEnvelopeV31 y amplía `sourceSchemaVersion` a 3.1.0). SUPERSESIÓN LEGÍTIMA, no debilitamiento: el OpenAPI de la 002 declara la respuesta de
// POST /backup/export como BackupEnvelopeV3 y la exportación ahora emite 3.1.0 (REQ-BACKUP2-001 de la 004); el arnés apunta esa respuesta a
// BackupEnvelopeV31 del mismo OpenAPI de la 004, y se valida con el esquema completo (breedCode, symptomType y severity obligatorios, sin
// propiedades adicionales). `mediaToDeleteCount` (ImportPreviewResult) es de la vista previa de T604/T605: ya se exige (T605 retiró su exención).
// T549 (REQ-LOG-002, REQ-LOG-001): `Username` admite mayúsculas (`^[A-Za-z0-9._-]+$`) y `LoginInput.username` llega a 254 (identity.schema.json 3.1.0 de la 004, mismo $id).
const IDENTITY_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/identity.schema.json';
const BACKUP_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/backup-envelope.schema.json';
const exportOk = (openapi.paths['/backup/export']!['post'] as { responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> }).responses['200']!.content['application/json']!.schema;
// 007 (Caso B, T1067): el OpenAPI de la 002 ya declara BackupEnvelopeV32; la sustitución solo aplica a la referencia heredada V3 (con V32 un replace de prefijo produciría V312).
if (exportOk.$ref.endsWith('#/$defs/BackupEnvelopeV3')) exportOk.$ref = exportOk.$ref.replace('#/$defs/BackupEnvelopeV3', '#/$defs/BackupEnvelopeV31');
for (const file of readdirSync('specs/002-plataforma-v21/contracts/schemas')) {
  if (file === 'medical-records.schema.json') {
    ajv.addSchema(JSON.parse(readFileSync(RECORDS_004, 'utf8')));
  } else if (file === 'identity.schema.json') {
    ajv.addSchema(JSON.parse(readFileSync(IDENTITY_004, 'utf8')));
  } else if (file === 'backup-envelope.schema.json') {
    // T605 (H-O-T617-2): `mediaToDeleteCount` ya lo devuelve la vista previa; se retira su exención y el arnés lo exige como `required`.
    ajv.addSchema(JSON.parse(readFileSync(BACKUP_004, 'utf8')));
  } else if (file === 'pet.schema.json') {
    // T584 (H-O-004A-1): `avatarVersion` ya existe en el servidor (columna `avatar_version`); se RETIRÓ su exención y el arnés la exige como `required`
    // en toda respuesta de mascota (el esquema completo de la 004, sin filtrar).
    ajv.addSchema(JSON.parse(readFileSync(PET_004, 'utf8')));
  } else ajv.addSchema(JSON.parse(readFileSync(join('specs/002-plataforma-v21/contracts/schemas', file), 'utf8')));
}
ajv.addSchema(JSON.parse(readFileSync(MEDIA_004, 'utf8')));
ajv.addSchema({ ...openapi, $id: OPENAPI_ID });

const pointer = (...parts: string[]) => parts.map((p) => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const validators = new Map<string, ValidateFunction>();

/** Plantilla del OpenAPI que corresponde a una URL concreta (sin consulta), o null. */
export function matchOperation(method: string, url: string): Operation | null {
  const path = url.split('?')[0]!;
  return (
    [...OPERATIONS, ...MEDIA_OPERATIONS].find((op) => op.method === method.toUpperCase() && new RegExp(`^${op.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path)) ?? null
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
  // Varios tipos declarados (p. ej. el avatar: image/jpeg, image/png, image/webp): se usa el que coincide con el de la respuesta.
  const declared = Object.keys(content);
  const mediaType = declared.find((type) => (contentType ?? '').startsWith(type)) ?? declared[0]!;
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
