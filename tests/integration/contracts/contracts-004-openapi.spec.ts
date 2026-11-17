/**
 * T511: OpenAPI 3.1.0 de la feature 004 (delta de rutas sobre la 002). La 002 no se edita (INV-ARCH-003).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '../../..');
const FILE = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts/openapi/pet-tracker-api.openapi.yaml');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const doc = parseYaml(readFileSync(FILE, 'utf8')) as Json;
const op = (path: string, method: string): Json => {
  const found = doc.paths?.[path]?.[method] as Json | undefined;
  if (!found) throw new Error(`operación ausente: ${method.toUpperCase()} ${path}`);
  return found;
};
const codes = (path: string, method: string): string[] => Object.keys(op(path, method).responses as Json).sort();
const paramNames = (path: string, method: string): string[] =>
  (op(path, method).parameters as Json[]).map((p) => (p.$ref as string | undefined)?.split('/').pop() ?? (p.name as string));

describe('T511 versión y metadatos', () => {
  it('REQ-ARC-001: la API pasa a 3.1.0 (MINOR) en DRAFT y supersede a 3.0.0', () => {
    expect(doc.info.version).toBe('3.1.0');
    expect(doc.info['x-sdd-metadata']).toEqual(expect.objectContaining({ version: '3.1.0', status: 'DRAFT', supersedes: '3.0.0', change_type: 'MINOR' }));
  });

  it('REQ-ARC-001: declara exactamente las 7 operaciones nuevas de medios y avatar además de las 40 de la 002', () => {
    const ids = Object.values(doc.paths as Json).flatMap((item) =>
      ['get', 'post', 'put', 'patch', 'delete'].filter((m) => (item as Json)[m]).map((m) => (item as Json)[m].operationId as string),
    );
    expect(ids).toHaveLength(47);
    expect(new Set(ids).size).toBe(47);
    for (const id of ['uploadMedia', 'listMedia', 'getMediaAccess', 'deleteMedia', 'putAvatar', 'getAvatar', 'deleteAvatar']) {
      expect(ids).toContain(id);
    }
  });
});

describe('T511 medios', () => {
  it('REQ-ARC-001: uploadMedia usa cuerpo crudo, kind en la query, X-Argos-Filename y CSRF', () => {
    const upload = op('/pets/{petId}/media', 'post');
    expect(upload.operationId).toBe('uploadMedia');
    expect(Object.keys(upload.requestBody.content)).toEqual(['application/octet-stream']);
    expect(paramNames('/pets/{petId}/media', 'post')).toEqual(['CsrfHeader', 'MediaKindQuery', 'MediaFilename']);
    expect(doc.components.parameters.MediaKindQuery).toEqual(expect.objectContaining({ name: 'kind', in: 'query', required: true }));
    expect(doc.components.parameters.MediaFilename).toEqual(expect.objectContaining({ name: 'X-Argos-Filename', in: 'header', required: true }));
    expect(upload.responses['201'].content['application/json'].schema.$ref).toBe('../schemas/media.schema.json#/$defs/MediaItem');
  });

  it('REQ-ARC-001: uploadMedia declara 201 y los errores 400, 401, 403, 404, 409, 413, 415, 422, 429, 500 y 502', () => {
    expect(codes('/pets/{petId}/media', 'post')).toEqual(['201', '400', '401', '403', '404', '409', '413', '415', '422', '429', '500', '502']);
  });

  it('REQ-ALB-001: listMedia pagina con page y kind opcional y devuelve MediaPage; no hay ruta de galería', () => {
    const list = op('/pets/{petId}/media', 'get');
    expect(list.operationId).toBe('listMedia');
    expect(paramNames('/pets/{petId}/media', 'get')).toEqual(['MediaKindFilter', 'PageQuery']);
    expect(list.responses['200'].content['application/json'].schema.$ref).toBe('../schemas/media.schema.json#/$defs/MediaPage');
    expect(codes('/pets/{petId}/media', 'get')).toEqual(['200', '401', '404', '422']);
    expect(Object.keys(doc.paths).filter((p) => p.includes('gallery'))).toEqual([]);
  });

  it('REQ-ARC-003: getMediaAccess devuelve MediaAccess sin disposition, no-store y 502', () => {
    const access = op('/pets/{petId}/media/{mediaId}/access', 'get');
    expect(access.operationId).toBe('getMediaAccess');
    expect(access.responses['200'].content['application/json'].schema.$ref).toBe('../schemas/media.schema.json#/$defs/MediaAccess');
    expect(access.responses['200'].headers['Cache-Control'].schema.const).toBe('no-store');
    expect(codes('/pets/{petId}/media/{mediaId}/access', 'get')).toEqual(['200', '401', '404', '502']);
    expect(JSON.stringify(access)).not.toContain('disposition');
  });

  it('REQ-GCS-004: deleteMedia responde 204 y no declara 502', () => {
    expect(op('/pets/{petId}/media/{mediaId}', 'delete').operationId).toBe('deleteMedia');
    expect(codes('/pets/{petId}/media/{mediaId}', 'delete')).toEqual(['204', '401', '403', '404']);
  });
});

describe('T511 avatar', () => {
  it('REQ-AVA-001: putAvatar usa cuerpo crudo de imagen, devuelve avatarVersion y declara 502', () => {
    const put = op('/pets/{petId}/avatar', 'put');
    expect(put.operationId).toBe('putAvatar');
    expect(Object.keys(put.requestBody.content).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(put.responses['200'].content['application/json'].schema.$ref).toBe('../schemas/media.schema.json#/$defs/AvatarVersionResult');
    expect(codes('/pets/{petId}/avatar', 'put')).toEqual(['200', '401', '403', '404', '413', '415', '502']);
  });

  it('REQ-AVA-001: getAvatar es inmutable con v actual, 404 y 502 no-store', () => {
    const get = op('/pets/{petId}/avatar', 'get');
    expect(get.operationId).toBe('getAvatar');
    expect(paramNames('/pets/{petId}/avatar', 'get')).toEqual(['AvatarVersionQuery']);
    expect(Object.keys(get.responses['200'].content).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(get.responses['200'].headers['Cache-Control'].description).toContain('immutable');
    expect(codes('/pets/{petId}/avatar', 'get')).toEqual(['200', '401', '404', '502']);
  });

  it('REQ-AVA-001: deleteAvatar responde 204 idempotente y no declara 502 (cola transaccional)', () => {
    expect(op('/pets/{petId}/avatar', 'delete').operationId).toBe('deleteAvatar');
    expect(codes('/pets/{petId}/avatar', 'delete')).toEqual(['204', '401', '403', '404']);
  });
});

describe('T511 rutas existentes cambiadas', () => {
  it('REQ-BOR-005: updateRecord exige If-Match y declara 409 ERR-REC-CONFLICT', () => {
    const path = '/pets/{petId}/records/{collection}/{recordId}';
    expect(paramNames(path, 'patch')).toContain('IfMatch');
    expect(doc.components.parameters.IfMatch).toEqual(expect.objectContaining({ name: 'If-Match', in: 'header', required: true }));
    expect(op(path, 'patch').responses['409'].description).toContain('ERR-REC-CONFLICT');
  });

  it('REQ-BOR-002: deleteRecord declara 409 ERR-REC-SUPERSEDED-IMMUTABLE', () => {
    const del = op('/pets/{petId}/records/{collection}/{recordId}', 'delete');
    expect(del.responses['409'].description).toContain('ERR-REC-SUPERSEDED-IMMUTABLE');
  });

  it('REQ-IMP-001: previewBackupImport devuelve ImportPreviewResult y acepta 3.1.0; exportBackup entrega el sobre 3.1.0', () => {
    expect(op('/backup/import/preview', 'post').summary).toContain('3.1.0');
    expect(op('/backup/export', 'post').responses['200'].content['application/json'].schema.$ref).toBe(
      '../schemas/backup-envelope.schema.json#/$defs/BackupEnvelopeV31',
    );
  });

  it('REQ-LOG-001: login acepta usuario o correo con los mismos errores genéricos', () => {
    expect(op('/auth/login', 'post').summary).toContain('REQ-LOG-001');
    expect(codes('/auth/login', 'post')).toEqual(['200', '401', '403', '422', '429', '500']);
  });

  it('REQ-PET4-002: registerPet y updatePet declaran 429 ERR-RATE-LIMITED por duplicados de microchip', () => {
    expect(op('/pets', 'post').responses['429']).toEqual({ $ref: '#/components/responses/Problem' });
    expect(op('/pets/{petId}', 'patch').responses['429']).toEqual({ $ref: '#/components/responses/Problem' });
  });
});
