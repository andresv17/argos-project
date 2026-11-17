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

// Mismas opciones numéricas que los validadores generados (scripts/codegen.mjs): sin multipleOfPrecision, 32.85 no es múltiplo de 0.001 por coma flotante (T226).
const ajv = new Ajv2020({ strict: false, allErrors: true, multipleOfPrecision: 10 });
addFormats(ajv);
// T525: las respuestas de mascota llevan `breedCode` (pet.schema.json 3.1.0 de la 004, mismo $id). `avatarVersion` (4A-2, avatar) aún no existe
// en el servidor: el arnés la exime de `required` hasta que la implemente su tarea; el resto de esquemas sigue siendo el de la 002.
const PET_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/pet.schema.json';
// T535: los parámetros adicionales llevan `symptomType` y `severity` (medical-records.schema.json 3.1.0 de la 004, mismo $id). `revision` (4A-2,
// edición con If-Match) aún no existe en el servidor: el arnés la exime de `required` en los 6 registros hasta que la implemente su tarea.
// T540 (H-O-T617-2): la COLUMNA `revision` ya existe (SQLite 0006, Postgres 0002), pero el servidor aún no la lee ni la expone (es de T614, «revision de
// solo lectura en los registros»). Se probó retirar la exención ahora: 21 pruebas de API fallan porque las respuestas no la traen, y exponerla exige
// los validadores v31 de registro (hoy 002, sin `revision`), los repositorios de los 3 motores y 5 baselines de pruebas de Postgres. Se retira con T614.
// T617: `symptomType` y `severity` vuelven a ser obligatorios en el registro (ya no hay exportación 3.0.0 que los omita); es un endurecimiento.
const RECORDS_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/medical-records.schema.json';
// T617: el respaldo es 3.1.0 (backup-envelope.schema.json 3.1.0 de la 004, mismo $id; conserva BackupEnvelopeV3 y los heredados, añade
// BackupEnvelopeV31 y amplía `sourceSchemaVersion` a 3.1.0). SUPERSESIÓN LEGÍTIMA, no debilitamiento: el OpenAPI de la 002 declara la respuesta de
// POST /backup/export como BackupEnvelopeV3 y la exportación ahora emite 3.1.0 (REQ-BACKUP2-001 de la 004); el arnés apunta esa respuesta a
// BackupEnvelopeV31 del mismo OpenAPI de la 004, y se valida con el esquema completo (breedCode, symptomType y severity obligatorios, sin
// propiedades adicionales). `mediaToDeleteCount` (ImportPreviewResult) pertenece a la vista previa de T604/T605: se exime de `required` hasta entonces.
const BACKUP_004 = 'specs/004-catalogos-registros-archivos/contracts/schemas/backup-envelope.schema.json';
const exportOk = (openapi.paths['/backup/export']!['post'] as { responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> }).responses['200']!.content['application/json']!.schema;
exportOk.$ref = exportOk.$ref.replace('#/$defs/BackupEnvelopeV3', '#/$defs/BackupEnvelopeV31');
for (const file of readdirSync('specs/002-plataforma-v21/contracts/schemas')) {
  if (file === 'medical-records.schema.json') {
    const records = JSON.parse(readFileSync(RECORDS_004, 'utf8')) as { $defs: Record<string, { required?: string[] }> };
    for (const def of Object.values(records.$defs)) if (def.required !== undefined) def.required = def.required.filter((name) => name !== 'revision');
    ajv.addSchema(records);
  } else if (file === 'backup-envelope.schema.json') {
    const backup = JSON.parse(readFileSync(BACKUP_004, 'utf8')) as { $defs: Record<string, { required?: string[] }> };
    const preview = backup.$defs['ImportPreviewResult']!;
    preview.required = (preview.required ?? []).filter((name) => name !== 'mediaToDeleteCount');
    ajv.addSchema(backup);
  } else if (file === 'pet.schema.json') {
    const pet = JSON.parse(readFileSync(PET_004, 'utf8')) as { $defs: { PetProfile: { required: string[] } } };
    pet.$defs.PetProfile.required = pet.$defs.PetProfile.required.filter((name) => name !== 'avatarVersion');
    ajv.addSchema(pet);
  } else ajv.addSchema(JSON.parse(readFileSync(join('specs/002-plataforma-v21/contracts/schemas', file), 'utf8')));
}
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
