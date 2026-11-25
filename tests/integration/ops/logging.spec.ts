/**
 * T415 (pruebas primero) — registros de la API real con el logger de producción y `stdout` capturado:
 * una violación de microchip duplicado y un 404 con UUID no dejan el UUID, el microchip ni la IP (SC-CLD-004).
 *
 * Registro de petición de Cloud Run (REQ-CLD-008c): la plataforma escribe por su cuenta `run.googleapis.com/requests`
 * (IP remota, URL completa, user-agent) fuera del control de la app; no se pretende suprimirlo y su retención se
 * documenta en research.md y data-model.md §6. Por eso la app NO duplica un registro de petición propio con esos datos:
 * el único registro de petición de la app lleva método y ruta con plantilla (verificado aquí).
 *
 * @implements REQ-CLD-008, SC-CLD-004, INV-AUTH-003, INV-AUD-001, H-RAMA-003
 */
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { CryptoSecureTokenAdapter } from '../../../src/infrastructure/adapters/crypto-secure-token.adapter.ts';
import { CryptoUuidAdapter } from '../../../src/infrastructure/adapters/crypto-uuid.adapter.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { HmacAuditPseudonymAdapter } from '../../../src/infrastructure/adapters/hmac-audit-pseudonym.adapter.ts';
import { RepositoryAuditLogAdapter } from '../../../src/infrastructure/adapters/repository-audit-log.adapter.ts';
import { ScryptPasswordHasherAdapter } from '../../../src/infrastructure/adapters/scrypt-password-hasher.adapter.ts';
import { Sha256BackupTokenAdapter } from '../../../src/infrastructure/adapters/sha256-backup-token.adapter.ts';
import { SlidingWindowRateLimiterAdapter } from '../../../src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { cloudLoggerOptions } from '../../../src/infrastructure/http/cloud-logging.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { activateAccount, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { AUDIT_SECRET_HEX } from '../../fixtures/audit-fixtures.ts';

const CLIENT_IP = '203.0.113.77';
const MICROCHIP = '985112345678901';
const MISSING_PET_UUID = '0b9e1b8a-6c1d-4a53-9f3e-2f8f7c1d9a11';
const DATABASE_URL = 'postgresql://argos_app:s3cr3tP4ss@ep-cool-name-123.eu-central-1.aws.neon.tech/argos?sslmode=require'; // argos-scan:allow
const PASSWORD = 'Lucia2026xyz!';
const CSRF = { 'x-argos-request': '1', 'content-type': 'application/json' };
const PET = { name: 'Lucía', species: 'CANINE', breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE', avatarUrl: null, microchipId: MICROCHIP };

async function appWithCapturedStdout(): Promise<{ app: FastifyInstance; lines: string[]; db: SqliteDatabase }> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString('utf8').split('\n').filter((l) => l.length > 0));
      done();
    },
  });
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const hasher = new ScryptPasswordHasherAdapter();
  const ids = new CryptoUuidAdapter();
  const tokens = new CryptoSecureTokenAdapter();
  const deps: ApplicationDeps = {
    uow: new SqliteUnitOfWork(db),
    clock: new FixedClockAdapter(),
    ids,
    tokens,
    hasher,
    dummyPasswordHash: await hasher.createDummyHash(),
    rateLimiter: new SlidingWindowRateLimiterAdapter(ids, { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 20, windowMinutes: 15 }, MICROCHIP_DUPLICATE: { maxPerWindow: 5, windowMinutes: 1440 } }),
    backupTokens: new Sha256BackupTokenAdapter(tokens),
    auditLog: new RepositoryAuditLogAdapter(),
    auditPseudonym: new HmacAuditPseudonymAdapter(),
    auditHmacSecret: AUDIT_SECRET_HEX,
    auditIds: ids,
  };
  const app = await buildApp({ deps, cookieSecure: false, logger: { ...cloudLoggerOptions({ databaseUrl: DATABASE_URL }), stream } });
  app.addHook('onClose', async () => db.close());
  return { app, lines, db };
}

async function login(app: FastifyInstance, db: SqliteDatabase): Promise<string> {
  const registered = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: CSRF, remoteAddress: CLIENT_IP,
    payload: { adultDeclaration: true, username: 'lucia', password: PASSWORD, confirmPassword: PASSWORD, displayName: 'Lucía', email: 'lucia.privada@example.com' },
  });
  expect(registered.statusCode).toBe(201);
  // 009 (T1246): el alta nace PENDING y sin sesión; el arnés T1244 la activa y la persona entra con sus credenciales.
  await activateAccount(sqliteRunner(db), 'sqlite', 'lucia', '2026-11-23T10:00:00.000Z');
  const entered = await app.inject({ method: 'POST', url: '/api/auth/login', headers: CSRF, remoteAddress: CLIENT_IP, payload: { username: 'lucia', password: PASSWORD } });
  const header = entered.headers['set-cookie'];
  const joined = Array.isArray(header) ? header.join(';') : (header ?? '');
  return `argos_session=${/argos_session=([^;]+)/.exec(joined)![1]!}`;
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('SC-CLD-004: stdout sin UUID, microchip ni IP', () => {
  it('[REQ-CLD-008] la violación de microchip duplicado no deja el microchip ni la IP en stdout', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    const cookie = await login(app, captured.db);
    const first = await app.inject({ method: 'POST', url: '/api/pets', headers: { ...CSRF, cookie }, remoteAddress: CLIENT_IP, payload: PET });
    expect(first.statusCode).toBe(201);
    const duplicate = await app.inject({ method: 'POST', url: '/api/pets', headers: { ...CSRF, cookie }, remoteAddress: CLIENT_IP, payload: { ...PET, name: 'Otra' } });
    expect(duplicate.statusCode).toBe(409);

    const log = captured.lines.join('\n');
    expect(captured.lines.length).toBeGreaterThanOrEqual(4);
    expect(log).not.toContain(MICROCHIP);
    expect(log).not.toContain(CLIENT_IP);
    expect(log).not.toContain('remoteAddress');
    expect(log).not.toContain('hostname');
    expect(log).not.toContain('argos_session');
  });

  it('[REQ-CLD-008] un 404 con UUID de mascota inexistente (ruta con plantilla) no deja el UUID ni la IP en stdout', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    const cookie = await login(app, captured.db);
    const missing = await app.inject({ method: 'GET', url: `/api/pets/${MISSING_PET_UUID}/dashboard?ref=correo@privado.example`, headers: { cookie }, remoteAddress: CLIENT_IP });
    expect(missing.statusCode).toBe(404);

    const log = captured.lines.join('\n');
    expect(log).not.toContain(MISSING_PET_UUID);
    expect(log).not.toContain(CLIENT_IP);
    expect(log).not.toContain('correo@privado.example');
    expect(log).not.toContain('ref=');
    const requestLine = captured.lines.map((l) => JSON.parse(l) as { req?: { method: string; url: string } }).find((e) => e.req?.url === '/api/pets/:petId/dashboard');
    expect(requestLine?.req).toEqual({ method: 'GET', url: '/api/pets/:petId/dashboard' });
  });

  it('[REQ-CLD-008] un 404 de ruta inexistente con UUID tampoco lo registra', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    const missing = await app.inject({ method: 'GET', url: `/no-existe/${MISSING_PET_UUID}`, remoteAddress: CLIENT_IP });
    expect(missing.statusCode).toBe(404);
    const log = captured.lines.join('\n');
    expect(log).not.toContain(MISSING_PET_UUID);
    expect(log).not.toContain(CLIENT_IP);
    expect(captured.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('[REQ-CLD-008b] un error de pg no previsto registra solo SQLSTATE y restricción, nunca detail, message ni valores', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    app.get('/boom', async () => {
      throw Object.assign(new Error(`duplicate key (microchip_id)=(${MICROCHIP}) ${DATABASE_URL}`), {
        code: '23505', constraint: 'pets_microchip_global', detail: `Key (microchip_id)=(${MICROCHIP}) already exists.`, parameters: [MICROCHIP],
      });
    });
    const res = await app.inject({ method: 'GET', url: '/boom', remoteAddress: CLIENT_IP });
    expect(res.statusCode).toBe(500);
    const log = captured.lines.join('\n');
    expect(log).toContain('23505');
    expect(log).toContain('pets_microchip_global');
    for (const fragment of [MICROCHIP, CLIENT_IP, 's3cr3tP4ss', 'neon.tech', 'already exists', 'duplicate key']) expect(log).not.toContain(fragment);
  });
});

describe('formato de las líneas de la app real', () => {
  it('cada línea es JSON con severity válido y message o req/res; sin level ni msg', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    await app.inject({ method: 'GET', url: '/api/auth/me', remoteAddress: CLIENT_IP });
    const entries = captured.lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const entry of entries) {
      expect(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).toContain(entry['severity']);
      expect(typeof entry['message']).toBe('string');
      expect(Object.keys(entry)).not.toContain('level');
      expect(Object.keys(entry)).not.toContain('msg');
    }
  });

  it('una petición produce un solo registro de petición entrante (sin duplicar el de Cloud Run)', async () => {
    const captured = await appWithCapturedStdout();
    app = captured.app;
    await app.inject({ method: 'GET', url: '/api/auth/me' });
    const incoming = captured.lines.filter((l) => (JSON.parse(l) as { message?: string }).message === 'incoming request');
    expect(incoming).toHaveLength(1);
  });
});
