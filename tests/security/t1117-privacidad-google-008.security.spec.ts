import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import { GoogleOidcError } from '../../src/infrastructure/http/google-oidc-verify.ts';
import { cloudLoggerOptions } from '../../src/infrastructure/http/cloud-logging.ts';
import { registerProblemDetails } from '../../src/infrastructure/http/plugins/problem-details.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { hashOneTimeToken } from '../../src/domain/auth/one-time-token.ts';

/**
 * T1117 (008, [GH:#16]) — regresión de privacidad NFR-008-004: el correo, el `sub` de Google, los tokens, el `code` y el `state` no salen en los logs ni en
 * `detail`/`instance` RFC 9457, ni siquiera cuando un repositorio o el verificador fallan con esos valores dentro del mensaje o del detalle del motor.
 */
const EMAIL = 'persona.privada@example.test';
const SUB = 'google-sub-109876543210987654321';
const CODE = '4/0AfJohXn-codigo-secreto';
const STATE = 'S'.repeat(43);
const NONCE = 'N'.repeat(43);
const VERIFIER = 'V'.repeat(43);
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIx.firma-secreta';
const SECRETS = [EMAIL, SUB, CODE, STATE, NONCE, VERIFIER, ID_TOKEN, 'persona.privada'];

async function runRoute(thrown: unknown): Promise<{ readonly status: number; readonly body: string; readonly logs: string }> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString('utf8'));
      done();
    },
  });
  const app = Fastify({ logger: { ...cloudLoggerOptions(), stream } });
  registerProblemDetails(app);
  app.get('/api/auth/google/callback', async () => {
    throw thrown;
  });
  const response = await app.inject({ method: 'GET', url: `/api/auth/google/callback?code=${encodeURIComponent(CODE)}&state=${STATE}` });
  await app.close();
  return { status: response.statusCode, body: response.body, logs: lines.join('') };
}

const expectClean = (text: string): void => {
  for (const secret of SECRETS) expect(text, `fuga de ${secret.slice(0, 8)}…`).not.toContain(secret);
};

describe('[NFR-008-004][REQ-SSO8-005] el fallo del flujo con Google no filtra datos personales', () => {
  it('[REQ-SSO8-005] un error de Postgres con el correo y el sub en `message` y `detail` (violación del índice del titular verificado) responde 500 genérico y el log solo trae SQLSTATE y restricción', async () => {
    const pgError = Object.assign(new Error(`duplicate key value violates unique constraint "users_email_verified_unique" Key (lower(email))=(${EMAIL}) sub=${SUB}`), {
      code: '23505',
      constraint: 'users_email_verified_unique',
      detail: `Key (lower(email))=(${EMAIL}) already exists.`,
    });
    const result = await runRoute(pgError);
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED', instance: '/api/auth/google/callback' });
    expectClean(result.body);
    expectClean(result.logs);
    expect(result.logs).toContain('users_email_verified_unique');
    expect(result.logs).toContain('23505');
  });

  it('[REQ-SSO8-005] un GoogleOidcError (verificación fallida) se trata como error imprevisto: cuerpo sin motivo ni datos y log sin el id_token', async () => {
    const result = await runRoute(Object.assign(new GoogleOidcError('NONCE'), { idToken: ID_TOKEN, code: CODE }));
    expect(result.status).toBe(500);
    expectClean(result.body);
    expectClean(result.logs);
  });

  it('`instance` es la ruta sin query: el code y el state del callback nunca viajan en el problema ni en la línea de petición del log', async () => {
    const result = await runRoute(new DomainError('ERR-INTERNAL-UNEXPECTED'));
    expect(JSON.parse(result.body).instance).toBe('/api/auth/google/callback');
    expectClean(result.body);
    expectClean(result.logs);
  });

  it('los errores del motor SQLite de los repositorios nuevos no incluyen el correo, el sub ni el identificador del flujo', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const uow = new SqliteUnitOfWork(db);
    const base = { preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h', createdAt: '2026-11-21T10:00:00.000Z' } as const;
    await uow.runInTransaction(async (r) => {
      await r.users.insert({ id: 'a0000000-0000-4000-8000-000000000001', username: 'ana', displayName: 'Ana', email: EMAIL, emailVerifiedAt: '2026-11-21T10:00:00.000Z', ...base });
      await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: 'a0000000-0000-4000-8000-000000000001', createdAt: base.createdAt });
      await r.oauthFlows.insert({
        tokenHash: hashOneTimeToken(STATE), phase: 'AUTHORIZATION', intent: 'LOGIN', state: STATE, nonce: NONCE, codeVerifier: VERIFIER, userId: null, originSessionHash: null,
        pendingSubject: null, pendingEmail: null, createdAt: base.createdAt, expiresAt: '2026-11-21T10:15:00.000Z', consumedAt: null,
      });
    });
    const failures: string[] = [];
    const attempt = async (work: Parameters<typeof uow.runInTransaction>[0]) => {
      try {
        await uow.runInTransaction(work);
      } catch (error) {
        failures.push(`${(error as Error).message} ${JSON.stringify(error)}`);
      }
    };
    await attempt((r) => r.users.insert({ id: 'a0000000-0000-4000-8000-000000000002', username: 'bea', displayName: 'Bea', email: EMAIL.toUpperCase(), emailVerifiedAt: base.createdAt, ...base }));
    await attempt((r) =>
      r.oauthFlows.insert({
        tokenHash: hashOneTimeToken(STATE), phase: 'AUTHORIZATION', intent: 'LOGIN', state: STATE, nonce: NONCE, codeVerifier: VERIFIER, userId: null, originSessionHash: null,
        pendingSubject: null, pendingEmail: null, createdAt: base.createdAt, expiresAt: '2026-11-21T10:15:00.000Z', consumedAt: null,
      }),
    );
    await attempt((r) => r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: `${SUB}-otra`, userId: 'a0000000-0000-4000-8000-0000000000ff', createdAt: base.createdAt }));
    expect(failures.length).toBe(3);
    for (const failure of failures) expectClean(failure);
    db.close();
  });
});
