/**
 * T582 [US4] redacción de logs de medios por campo y por forma (NFR-ALM-002, SC-ALM-024, REQ-ARC-003): nunca se registra `original_name`, la cabecera
 * del nombre, la URL firmada (`X-Goog-Signature`), la clave de objeto (`pets/<uuid>/…`) ni el microchip (15 dígitos, `Key (…)=(…)` de la violación 23505),
 * ni siquiera cuando el texto llega dentro de un mensaje, un campo anidado o un error del SDK.
 * @implements NFR-ALM-002, SC-ALM-024, REQ-ARC-003, INV-ARC-003
 */
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { cloudLoggerOptions, redactSecrets } from '../../src/infrastructure/http/cloud-logging.ts';
import { GcsMediaStorageAdapter } from '../../src/infrastructure/adapters/gcs-media-storage.adapter.ts';

const PET = 'a0000000-0000-4000-8000-000000000001';
const MEDIA = 'b0000000-0000-4000-8000-000000000002';
const KEY = `pets/${PET}/files/${MEDIA}`;
const SIGNED = `https://argos-media.storage.googleapis.com/${KEY}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=argos-run%40p.iam&X-Goog-Expires=300&X-Goog-Signature=0a1b2c3d4e5f6a7b8c9d&response-content-type=application%2Fpdf`;
const CHIP = '985112345678901';
const NAME = 'Historial clínico de Luna.pdf';
const SECRET_FRAGMENTS = [PET, MEDIA, KEY, 'X-Goog-Signature', '0a1b2c3d4e5f6a7b8c9d', CHIP, NAME, 'Historial'];

async function capture(log: (logger: import('fastify').FastifyBaseLogger) => void): Promise<string> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString('utf8'));
      done();
    },
  });
  const app = Fastify({ logger: { ...cloudLoggerOptions(), stream } });
  await app.ready();
  log(app.log);
  await app.close();
  return lines.join('');
}
const leaks = (output: string) => SECRET_FRAGMENTS.filter((fragment) => output.includes(fragment));

describe('T582 redacción por forma (redactSecrets)', () => {
  it('[SC-ALM-024] elimina la URL firmada completa y cualquier parámetro X-Goog-*', () => {
    expect(leaks(redactSecrets(`falló ${SIGNED} otra vez`, undefined))).toEqual([]);
    expect(redactSecrets('X-Goog-Signature=0a1b2c3d4e5f6a7b8c9d', undefined)).not.toContain('0a1b2c3d4e5f6a7b8c9d');
    expect(redactSecrets('x-goog-signature: 0a1b2c3d4e5f6a7b8c9d', undefined)).not.toContain('0a1b2c3d4e5f6a7b8c9d');
  });

  it('[INV-ARC-003] elimina la clave de objeto, el prefijo de la mascota y el avatar', () => {
    for (const text of [KEY, `pets/${PET}/`, `pets/${PET}/photos/${MEDIA}`, `pets/${PET}/avatar/${MEDIA}`, `objeto ${KEY} no encontrado`]) {
      expect(redactSecrets(text, undefined), text).not.toMatch(/pets\/[0-9a-f]{8}/);
    }
  });

  it('[SC-ALM-024] elimina un microchip de 15 dígitos y el detalle Key (…)=(…) de la violación 23505', () => {
    expect(redactSecrets(`duplicate key value violates unique constraint "pets_microchip_global" Key (microchip_id)=(${CHIP}) already exists.`, undefined)).not.toContain(CHIP);
    expect(redactSecrets(`chip ${CHIP} repetido`, undefined)).not.toContain(CHIP);
    expect(redactSecrets('Key (microchip_id)=(abc) already exists.', undefined)).not.toMatch(/Key \(/);
  });

  it('[NFR-ALM-002] no altera un texto sin nada sensible (números cortos, UUID sueltos de otros dominios y prosa)', () => {
    expect(redactSecrets('mantenimiento ADR-002-14: 12 sesiones, 3 tokens', undefined)).toBe('mantenimiento ADR-002-14: 12 sesiones, 3 tokens');
    expect(redactSecrets('puerto 3100, 123456789012345678 bytes', undefined)).toContain('puerto 3100');
  });
});

describe('T582 redacción por campo en el registro de Fastify', () => {
  it('[NFR-ALM-002] los campos original_name, originalName, X-Argos-Filename, objectKey y microchipId se eliminan aunque vayan anidados', async () => {
    const output = await capture((log) => {
      log.info({ original_name: NAME, originalName: NAME, 'X-Argos-Filename': encodeURIComponent(NAME), 'x-argos-filename': encodeURIComponent(NAME), objectKey: KEY, object_key: KEY, microchipId: CHIP, microchip_id: CHIP, detalle: { originalName: NAME, objectKey: KEY } }, 'subida');
    });
    expect(leaks(output)).toEqual([]);
    expect(leaks(output.replace(/%20/g, ' '))).toEqual([]);
    expect(output).not.toContain('Historial%20cl');
  });

  it('[SC-ALM-024] un nombre malicioso en un mensaje de registro no sale (nombre con control, bidi y separadores)', async () => {
    const malicious = `../../etc/passwd\u0000‮fdp.exe ${KEY}`;
    const output = await capture((log) => log.warn(`nombre rechazado: ${malicious}`));
    expect(output).not.toContain(KEY);
    expect(output).not.toContain(PET);
  });

  it('[SC-ALM-024] una violación 23505 del microchip registrada como error sale solo con SQLSTATE y restricción', async () => {
    const error = Object.assign(new Error(`duplicate key value violates unique constraint "pets_microchip_global" Key (microchip_id)=(${CHIP}) already exists.`), {
      code: '23505',
      constraint: 'pets_microchip_global',
      detail: `Key (microchip_id)=(${CHIP}) already exists.`,
    });
    const output = await capture((log) => log.error({ err: error }, `fallo al guardar ${CHIP}`));
    expect(leaks(output)).toEqual([]);
    expect(output).toContain('23505');
    expect(output).toContain('pets_microchip_global');
  });

  it('[SC-ALM-024] un fallo del SDK con la URL firmada y la clave en el mensaje sale sin ninguno de los dos', async () => {
    const sdkError = Object.assign(new Error(`request to ${SIGNED} failed (${KEY})`), { code: 'ECONNRESET', response: { url: SIGNED } });
    const output = await capture((log) => log.error({ err: sdkError, signedUrl: SIGNED }, `GCS no disponible: ${SIGNED}`));
    expect(leaks(output)).toEqual([]);
  });
});

describe('T582 el adaptador de GCS no filtra la clave, la URL ni la causa en su error (NFR-ALM-002)', () => {
  it('[NFR-ALM-002] un fallo del SDK en put/get/delete/list/createReadUrl es MediaStorageUnavailableError sin datos del objeto', async () => {
    const failing = {
      bucket: () => ({
        file: () => ({
          save: async () => Promise.reject(new Error(`falló ${SIGNED} ${KEY}`)),
          download: async () => Promise.reject(new Error(`falló ${SIGNED} ${KEY}`)),
          delete: async () => Promise.reject(new Error(`falló ${SIGNED} ${KEY}`)),
          getSignedUrl: async () => Promise.reject(new Error(`falló ${SIGNED} ${KEY}`)),
        }),
        getFiles: async () => Promise.reject(new Error(`falló ${SIGNED} ${KEY}`)),
      }),
    };
    const adapter = new GcsMediaStorageAdapter({ storage: failing as never, bucket: 'argos-media', now: () => new Date('2026-11-17T10:00:00.000Z') });
    const operations: Array<() => Promise<unknown>> = [
      () => adapter.put(KEY, new Uint8Array([1]), 'application/pdf'),
      () => adapter.get(KEY),
      () => adapter.delete(KEY),
      () => adapter.list(`pets/${PET}/`),
      () => adapter.createReadUrl({ key: KEY, contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300 }),
    ];
    for (const operation of operations) {
      const error = await operation().then(() => null, (e: unknown) => e as Error);
      expect(error?.name).toBe('MediaStorageUnavailableError');
      expect(leaks(`${error?.message}${error?.stack}${JSON.stringify(error)}`.replace(/\/Users[^\n]*/g, ''))).toEqual([]);
      expect((error as { cause?: unknown }).cause).toBeUndefined();
    }
  });
});
