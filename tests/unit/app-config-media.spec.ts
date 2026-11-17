import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * T565 (SC-ALM-023, REQ-GCS-003, REQ-ARC-005, REQ-ARC-001, INV-ARCH-006): variables ARGOS_MEDIA_* de `app-config.ts`.
 */
const BUCKET = 'argos-argos-prod-1234-media';
const PROD_SECRET = '1f'.repeat(32);
const PROD = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET };

function failing(env: Record<string, string | undefined>): { variables: readonly string[]; message: string } {
  try {
    loadAppConfig({ NODE_ENV: 'test', ...env });
  } catch (error) {
    if (error instanceof AppConfigError) return { variables: error.variables, message: error.message };
    throw error;
  }
  return { variables: ['sin error'], message: '' };
}

describe('configuración de medios (T565)', () => {
  it('[REQ-GCS-003] por defecto: memory, sin bucket, TTL 300, 10 MiB, 1 GiB por propietario y 4 subidas simultáneas', () => {
    const config = loadAppConfig({ NODE_ENV: 'test' });
    expect([config.mediaDriver, config.mediaBucket, config.mediaSignedUrlTtlSeconds, config.mediaMaxBytes, config.mediaMaxBytesPerOwner, config.mediaMaxConcurrentUploads]).toEqual(['memory', null, 300, 10485760, 1073741824, 4]);
  });

  it('[REQ-GCS-003] valores válidos se convierten a sus tipos; las vacías (salvo el driver) toman el defecto', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: BUCKET, ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '900', ARGOS_MEDIA_MAX_BYTES: '1048576', ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '2048', ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '8' });
    expect([config.mediaDriver, config.mediaBucket, config.mediaSignedUrlTtlSeconds, config.mediaMaxBytes, config.mediaMaxBytesPerOwner, config.mediaMaxConcurrentUploads]).toEqual(['gcs', BUCKET, 900, 1048576, 2048, 8]);
    const empty = loadAppConfig({ NODE_ENV: 'test', ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '', ARGOS_MEDIA_MAX_BYTES: '', ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '', ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '' });
    expect([empty.mediaSignedUrlTtlSeconds, empty.mediaMaxBytes, empty.mediaMaxBytesPerOwner, empty.mediaMaxConcurrentUploads]).toEqual([300, 10485760, 1073741824, 4]);
  });

  it.each([
    [{ ARGOS_MEDIA_DRIVER: 'disk' }, ['ARGOS_MEDIA_DRIVER']],
    [{ ARGOS_MEDIA_DRIVER: 'GCS' }, ['ARGOS_MEDIA_DRIVER']],
    [{ ARGOS_MEDIA_DRIVER: '' }, ['ARGOS_MEDIA_DRIVER']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: '' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'Bucket_Mayus' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'a' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'a b' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'x.storage.googleapis.com/y' }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'x'.repeat(64) }, ['ARGOS_MEDIA_BUCKET']],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '29' }, ['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '901' }, ['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '0300' }, ['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '30.5' }, ['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: 'cinco' }, ['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']],
    [{ ARGOS_MEDIA_MAX_BYTES: '10485761' }, ['ARGOS_MEDIA_MAX_BYTES']],
    [{ ARGOS_MEDIA_MAX_BYTES: '0' }, ['ARGOS_MEDIA_MAX_BYTES']],
    [{ ARGOS_MEDIA_MAX_BYTES: '-1' }, ['ARGOS_MEDIA_MAX_BYTES']],
    [{ ARGOS_MEDIA_MAX_BYTES: '1e6' }, ['ARGOS_MEDIA_MAX_BYTES']],
    [{ ARGOS_MEDIA_MAX_BYTES: '99999999999999' }, ['ARGOS_MEDIA_MAX_BYTES']],
    [{ ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '0' }, ['ARGOS_MEDIA_MAX_BYTES_PER_OWNER']],
    [{ ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '1 GiB' }, ['ARGOS_MEDIA_MAX_BYTES_PER_OWNER']],
    [{ ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '01' }, ['ARGOS_MEDIA_MAX_BYTES_PER_OWNER']],
    [{ ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '0' }, ['ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS']],
    [{ ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '9' }, ['ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS']],
    [{ ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '04' }, ['ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS']],
  ])('[SC-ALM-023] valor inválido se rechaza nombrando solo la variable: %j', (env, variables) => {
    expect(failing(env).variables).toEqual(variables);
  });

  it.each([
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '30' }, 30],
    [{ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '900' }, 900],
  ])('[REQ-ARC-003] los extremos del TTL se aceptan: %j', (env, ttl) => {
    expect(loadAppConfig({ NODE_ENV: 'test', ...env }).mediaSignedUrlTtlSeconds).toBe(ttl);
  });

  it('[REQ-ARC-001] ARGOS_MEDIA_MAX_BYTES acepta exactamente 10 MiB y 1 byte; la concurrencia 1 y 8', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', ARGOS_MEDIA_MAX_BYTES: '10485760', ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '1' });
    expect([config.mediaMaxBytes, config.mediaMaxConcurrentUploads]).toEqual([10485760, 1]);
    expect(loadAppConfig({ NODE_ENV: 'test', ARGOS_MEDIA_MAX_BYTES: '1' }).mediaMaxBytes).toBe(1);
  });

  it('[SC-ALM-023] con memory el bucket se ignora (null) y con gcs el bucket es obligatorio', () => {
    expect(loadAppConfig({ NODE_ENV: 'test', ARGOS_MEDIA_BUCKET: BUCKET }).mediaBucket).toBeNull();
  });

  it('[SC-ALM-023] NODE_ENV=production con memory no arranca y nombra solo ARGOS_MEDIA_DRIVER', () => {
    expect(failing({ ...PROD }).variables).toEqual(['ARGOS_MEDIA_DRIVER']);
    expect(failing({ ...PROD, ARGOS_MEDIA_DRIVER: 'memory', ARGOS_MEDIA_BUCKET: BUCKET }).variables).toEqual(['ARGOS_MEDIA_DRIVER']);
  });

  it('[SC-ALM-023] NODE_ENV=production con gcs sin bucket no arranca y nombra solo ARGOS_MEDIA_BUCKET', () => {
    expect(failing({ ...PROD, ARGOS_MEDIA_DRIVER: 'gcs' }).variables).toEqual(['ARGOS_MEDIA_BUCKET']);
  });

  it('[SC-ALM-023] NODE_ENV=production con gcs, bucket y los demás valores por defecto arranca', () => {
    const config = loadAppConfig({ ...PROD, ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: BUCKET });
    expect([config.mediaDriver, config.mediaBucket]).toEqual(['gcs', BUCKET]);
  });

  it('[SC-ALM-023] NODE_ENV=production con ARGOS_MEDIA_MAX_BYTES > 10 MiB no arranca', () => {
    expect(failing({ ...PROD, ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: BUCKET, ARGOS_MEDIA_MAX_BYTES: '10485761' }).variables).toEqual(['ARGOS_MEDIA_MAX_BYTES']);
  });

  it('[SC-ALM-023][NFR-ALM-002] el mensaje de error no imprime valores (bucket, tamaños ni driver)', () => {
    const { message } = failing({ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'Bucket-Secreto-X', ARGOS_MEDIA_MAX_BYTES: '99999999', ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '7777' });
    expect(message).toBe('Configuración inválida: ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS, ARGOS_MEDIA_MAX_BYTES, ARGOS_MEDIA_BUCKET. Revisa .env.example.');
    expect(message).not.toMatch(/Secreto|99999999|7777/);
  });
});
