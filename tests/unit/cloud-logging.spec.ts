/**
 * T415 (pruebas primero) — formato de registro para Cloud Logging, serializadores y redacción de DATABASE_URL.
 * @implements REQ-CLD-008, SC-CLD-004, INV-AUTH-003, INV-AUD-001, H-RAMA-003
 */
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { cloudLoggerOptions, redactSecrets, serializeError, serializeRequest, severityOf } from '../../src/infrastructure/http/cloud-logging.ts';

const DATABASE_URL = 'postgresql://argos_app:s3cr3tP4ss@ep-cool-name-123.eu-central-1.aws.neon.tech/argos?sslmode=require'; // argos-scan:allow

async function capture(databaseUrl: string | undefined, log: (logger: import('fastify').FastifyBaseLogger) => void): Promise<Array<Record<string, unknown>>> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString('utf8').split('\n').filter((l) => l.length > 0));
      done();
    },
  });
  const app = Fastify({ logger: { ...cloudLoggerOptions({ databaseUrl }), stream } });
  await app.ready();
  log(app.log);
  await app.close();
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('formato de registro de Cloud Logging (REQ-CLD-008)', () => {
  it('mapea los niveles de pino a severity de Cloud Logging', () => {
    expect([severityOf('trace'), severityOf('debug'), severityOf('info'), severityOf('warn'), severityOf('error'), severityOf('fatal')]).toEqual([
      'DEBUG', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL',
    ]);
  });

  it('cada línea es JSON con severity y message, sin level, msg, pid ni hostname', async () => {
    const entries = await capture(undefined, (log) => {
      log.info('arranque');
      log.warn('aviso');
      log.error('fallo');
    });
    const own = entries.filter((e) => ['arranque', 'aviso', 'fallo'].includes(e['message'] as string));
    expect(own.map((e) => [e['severity'], e['message']])).toEqual([['INFO', 'arranque'], ['WARNING', 'aviso'], ['ERROR', 'fallo']]);
    for (const entry of entries) {
      expect(Object.keys(entry)).not.toContain('level');
      expect(Object.keys(entry)).not.toContain('msg');
      expect(Object.keys(entry)).not.toContain('pid');
      expect(Object.keys(entry)).not.toContain('hostname');
      expect(typeof entry['time']).toBe('string');
      expect(Number.isNaN(Date.parse(entry['time'] as string))).toBe(false);
    }
  });
});

describe('redacción de DATABASE_URL en cualquier registro (REQ-CLD-008)', () => {
  it('redactSecrets elimina la URL completa, el usuario, la contraseña y el host', () => {
    const text = `fallo conectando a ${DATABASE_URL} con argos_app / s3cr3tP4ss en ep-cool-name-123.eu-central-1.aws.neon.tech`;
    const clean = redactSecrets(text, DATABASE_URL);
    for (const fragment of [DATABASE_URL, 's3cr3tP4ss', 'argos_app', 'ep-cool-name-123', 'neon.tech']) expect(clean).not.toContain(fragment);
  });

  it('redactSecrets elimina cualquier URL postgres:// o postgresql:// aunque no se conozca la configurada', () => {
    const clean = redactSecrets('error postgres://otro:clave@host.interno:5432/db y postgresql://u:p@h/d', undefined); // argos-scan:allow
    expect(clean).not.toMatch(/postgres(ql)?:\/\//);
    expect(clean).not.toContain('clave');
    expect(clean).not.toContain('host.interno');
  });

  it('el mensaje, un campo de texto y un campo anidado del registro salen sin la URL ni sus partes', async () => {
    const entries = await capture(DATABASE_URL, (log) => {
      log.error({ detalle: `conexión ${DATABASE_URL}`, anidado: { host: 'ep-cool-name-123.eu-central-1.aws.neon.tech', lista: ['pass s3cr3tP4ss'] } }, `no se pudo abrir ${DATABASE_URL}`);
    });
    const text = JSON.stringify(entries);
    for (const fragment of [DATABASE_URL, 's3cr3tP4ss', 'argos_app', 'ep-cool-name-123', 'neon.tech', 'sslmode']) expect(text).not.toContain(fragment);
    expect(entries.filter((e) => e['severity'] === 'ERROR')).toHaveLength(1);
  });

  it('un Error con la URL en su mensaje sale solo con SQLSTATE y restricción', async () => {
    const error = Object.assign(new Error(`connect ${DATABASE_URL} falló`), { code: '08006', constraint: undefined });
    const entries = await capture(DATABASE_URL, (log) => log.error({ err: error }, 'conexión'));
    const text = JSON.stringify(entries);
    expect(text).not.toContain('s3cr3tP4ss');
    expect(text).not.toContain('neon.tech');
    expect(text).toContain('08006');
  });
});

describe('serializers.req (REQ-CLD-008a)', () => {
  const request = {
    method: 'GET',
    url: '/api/pets/0b9e1b8a-6c1d-4a53-9f3e-2f8f7c1d9a11/dashboard?token=abc&email=a@b.co',
    routeOptions: { url: '/api/pets/:petId/dashboard' },
    hostname: 'argos.example.run.app',
    ip: '203.0.113.77',
    headers: { authorization: 'Bearer zzz', cookie: 'argos_session=tok', host: 'argos.example.run.app' },
    socket: { remoteAddress: '203.0.113.77', remotePort: 51234 },
  };

  it('emite únicamente method y la ruta con plantilla', () => {
    expect(serializeRequest(request)).toEqual({ method: 'GET', url: '/api/pets/:petId/dashboard' });
  });

  it('sin plantilla (404 de ruta inexistente) no copia la URL real', () => {
    const out = serializeRequest({ ...request, routeOptions: { url: undefined } });
    expect(JSON.stringify(out)).not.toContain('0b9e1b8a');
    expect(JSON.stringify(out)).not.toContain('token=abc');
    expect(Object.keys(out).sort()).toEqual(['method', 'url']);
  });

  it('no contiene IP, puerto, hostname, query, Authorization ni Cookie', () => {
    const text = JSON.stringify(serializeRequest(request));
    for (const fragment of ['203.0.113.77', '51234', 'argos.example.run.app', 'token=abc', 'a@b.co', 'Bearer', 'zzz', 'argos_session', '0b9e1b8a']) {
      expect(text).not.toContain(fragment);
    }
  });
});

describe('serializers.err (REQ-CLD-008b)', () => {
  it('de un error de pg conserva solo el SQLSTATE y el nombre de la restricción', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "pets_microchip_global"'), {
      code: '23505',
      constraint: 'pets_microchip_global',
      detail: 'Key (owner_user_id, microchip_id)=(u-1, 985112345678901) already exists.',
      where: 'SQL statement "INSERT ..."',
      parameters: ['985112345678901'],
      hint: 'pista con 985112345678901',
      table: 'pets',
      schema: 'public',
    });
    const out = serializeError(pgError);
    expect(out).toEqual({ sqlstate: '23505', constraint: 'pets_microchip_global' });
    expect(JSON.stringify(out)).not.toContain('985112345678901');
  });

  it('de un error de Ajv o genérico no emite message, stack ni valores', () => {
    const ajvLike = Object.assign(new Error('data/microchipId must match pattern "985112345678901"'), { errors: [{ message: 'x', params: { value: '985112345678901' } }] });
    const out = serializeError(ajvLike);
    expect(JSON.stringify(out)).not.toContain('985112345678901');
    expect(JSON.stringify(out)).not.toContain('must match');
    expect(Object.keys(out)).not.toContain('message');
    expect(Object.keys(out)).not.toContain('stack');
  });

  it('descarta un code que no sea SQLSTATE y una constraint con caracteres no permitidos', () => {
    expect(serializeError(Object.assign(new Error('x'), { code: 'ECONNREFUSED 10.0.0.5:5432', constraint: 'a b=(1)' }))).toEqual({});
  });

  it('acepta un valor no Error sin lanzar', () => {
    expect(serializeError('cadena con 985112345678901')).toEqual({});
    expect(serializeError(null)).toEqual({});
  });
});

describe('RAMA-01 exclusión de los callbacks de Google en Cloud Logging (terraform/logging.tf)', () => {
  const tf = readFileSync(new URL('../../terraform/logging.tf', import.meta.url), 'utf8');
  it('excluye del sumidero _Default tanto /api/auth/google/callback como /api/admin/auth/google/callback (code y state no deben quedar en el registro)', () => {
    const filters = [...tf.matchAll(/^\s*filter\s*=\s*"(.*)"\s*$/gm)].map((m) => m[1]!);
    expect(filters.some((f) => f.includes('httpRequest.requestUrl:\\"/api/auth/google/callback\\"'))).toBe(true);
    expect(filters.some((f) => f.includes('httpRequest.requestUrl:\\"/api/admin/auth/google/callback\\"'))).toBe(true);
  });
});
