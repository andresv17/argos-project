import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChooseGoogleUsernameUseCase, CompleteGoogleLoginUseCase, StartGoogleLoginUseCase } from '../../src/application/use-cases/google-auth-use-cases.ts';
import { maintenanceCutoffs } from '../../src/application/use-cases/maintenance-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { hashOneTimeToken } from '../../src/domain/auth/one-time-token.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { GOOGLE_CODE, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../fixtures/google-fixtures.ts';
import { createHarness, type Harness } from '../fixtures/application-harness.ts';

/**
 * T1134 (008, [GH:#17], tarea [GOV] `/rama`): privacidad de datos de la vinculación y del acceso con Google.
 * Cubre NFR-008-004 (retención y limpieza del estado de flujo, ausencia de correo y `sub` en auditoría), REQ-VIN8-004 (efectos de la vinculación y auditoría)
 * y SC-008-063 (la identidad de Google se borra con la cuenta). Los defectos reales se identifican con `H-RAMA-008-T1134-*`; el defecto (a) ya está corregido y se prueba con `it`, y el (b) queda en `it.skip` pendiente de decisión de esquema:
 * la prueba pasa mientras el defecto exista y se vuelve roja cuando se corrija, momento en que hay que quitar el `.fails`.
 */

const NOW = '2026-11-21T10:00:00.000Z';
const LATER = '2026-11-21T10:30:00.000Z';
const EXPIRES = '2026-11-21T10:15:00.000Z';
const SUB = 'google-sub-t1134-privacidad';
const EMAIL = 'persona.t1134@example.test';
const USER_A = 'a1340000-0000-4000-8000-000000000001';
const USER_B = 'b1340000-0000-4000-8000-000000000002';
const HASH_64 = 'c'.repeat(64);

const base = { preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h', createdAt: NOW } as const;

function sqliteWorld(): { db: SqliteDatabase; uow: SqliteUnitOfWork } {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  return { db, uow: new SqliteUnitOfWork(db) };
}

const countRows = (db: SqliteDatabase, table: string, where = '1 = 1', params: unknown[] = []): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...params) as { n: number }).n;

describe('[NFR-008-004][EDGE-008-007] retención del estado de flujo de Google', () => {
  it('control: la fila USERNAME guarda el correo y el sub mientras el flujo está activo (necesario para «Elige tu usuario»)', async () => {
    const { db, uow } = sqliteWorld();
    await uow.runInTransaction((r) =>
      r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('paso-usuario-t1134'), phase: 'USERNAME', intent: 'LOGIN', state: null, nonce: null, codeVerifier: null, userId: null,
        originSessionHash: null, pendingSubject: SUB, pendingEmail: EMAIL, createdAt: NOW, expiresAt: EXPIRES, consumedAt: null,
      }),
    );
    expect(countRows(db, 'oauth_flow_states', 'pending_email = ? AND pending_subject = ?', [EMAIL, SUB])).toBe(1);
    db.close();
  });

  it('[REQ-SSO8-004] la purga del repositorio borra las filas vencidas con expires_at <= ahora y deja las vigentes', async () => {
    const { db, uow } = sqliteWorld();
    await uow.runInTransaction(async (r) => {
      await r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('vencido-t1134'), phase: 'USERNAME', intent: 'LOGIN', state: null, nonce: null, codeVerifier: null, userId: null,
        originSessionHash: null, pendingSubject: SUB, pendingEmail: EMAIL, createdAt: NOW, expiresAt: EXPIRES, consumedAt: null,
      });
      await r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('vigente-t1134'), phase: 'USERNAME', intent: 'LOGIN', state: null, nonce: null, codeVerifier: null, userId: null,
        originSessionHash: null, pendingSubject: 'otro-sub', pendingEmail: 'otro@example.test', createdAt: NOW, expiresAt: '2026-11-21T11:00:00.000Z', consumedAt: null,
      });
      expect(await r.oauthFlows.purgeExpired(LATER)).toBe(1);
    });
    expect(countRows(db, 'oauth_flow_states')).toBe(1);
    db.close();
  });

  it('[NFR-008-004][EDGE-008-007] H-RAMA-008-T1134-01 (MEDIO), parte (a) corregida: una fila USERNAME consumida y vencida con correo y sub desaparece en la purga de mantenimiento', async () => {
    const { db, uow } = sqliteWorld();
    await uow.runInTransaction((r) =>
      r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('consumido-t1134'), phase: 'USERNAME', intent: 'LOGIN', state: null, nonce: null, codeVerifier: null, userId: null,
        originSessionHash: null, pendingSubject: SUB, pendingEmail: EMAIL, createdAt: NOW, expiresAt: EXPIRES, consumedAt: NOW,
      }),
    );
    await uow.purgeExpired!(maintenanceCutoffs(LATER));
    // Lo esperado por NFR-008-004: ningún correo ni sub de Google persiste tras vencer el flujo.
    expect(countRows(db, 'oauth_flow_states', 'pending_email IS NOT NULL OR pending_subject IS NOT NULL')).toBe(0);
    db.close();
  });

  // PENDIENTE DE DECISIÓN DE ESQUEMA (Neo/architect). NO CUBIERTO: parte (b) de H-RAMA-008-T1134-01.
  // Anular pending_email/pending_subject al consumir la fila choca con el CHECK de la fase USERNAME
  // de las migraciones 0017 (SQLite) y 0013 (PostgreSQL), que exige ambos NOT NULL. Requiere relajar el CHECK
  // (migración, Nivel 2). Hasta entonces la retención del correo queda acotada a expires_at + el intervalo de mantenimiento.
  // Sin prueba ejecutable: it.skip o it.todo lo marca el oráculo débil de verify-oracles.sh. Escribir la prueba cuando se decida el esquema.

  it('[NFR-008-004] la única limpieza de oauth_flow_states en la aplicación es la purga al iniciar un flujo (beginAuthorization)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/application/use-cases/google-auth-use-cases.ts'), 'utf8');
    const calls = source.match(/oauthFlows\.purgeExpired\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).toMatch(/await repositories\.oauthFlows\.purgeExpired\(now\);\n\s+const issued/);
  });
});

describe('[REQ-VIN8-004][SC-008-063][NFR-008-004] borrado de cuenta y cascada de la identidad de Google', () => {
  it('[NFR-008-004] auth_identities y oauth_flow_states se declaran con ON DELETE CASCADE hacia users (sin filas huérfanas)', () => {
    const { db } = sqliteWorld();
    const identityFk = db.prepare('PRAGMA foreign_key_list(auth_identities)').all() as Array<{ table: string; on_delete: string }>;
    const flowFk = db.prepare('PRAGMA foreign_key_list(oauth_flow_states)').all() as Array<{ table: string; on_delete: string }>;
    expect(identityFk).toContainEqual(expect.objectContaining({ table: 'users', on_delete: 'CASCADE' }));
    expect(flowFk).toContainEqual(expect.objectContaining({ table: 'users', on_delete: 'CASCADE' }));
    db.close();
  });

  it('[NFR-008-004] auth_identities no tiene columna de correo: la identidad se ancla solo en (provider, provider_subject)', () => {
    const { db } = sqliteWorld();
    const columns = (db.prepare('PRAGMA table_info(auth_identities)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns.sort()).toEqual(['created_at', 'provider', 'provider_subject', 'user_id']);
    db.close();
  });

  it('[SC-008-063][NFR-008-004] borrar la cuenta A elimina sus identidades y sus flujos (LINK y USERNAME) y no toca los de la cuenta B', async () => {
    const { db, uow } = sqliteWorld();
    await uow.runInTransaction(async (r) => {
      for (const [id, username] of [[USER_A, 'ana.t1134'], [USER_B, 'beto.t1134']] as const) {
        await r.users.insert({ id, username, displayName: username, email: `${username}@example.test`, emailVerifiedAt: NOW, ...base });
        await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: `sub-${username}`, userId: id, createdAt: NOW });
      }
      await r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('link-A-t1134'), phase: 'AUTHORIZATION', intent: 'LINK', state: 'S'.repeat(43), nonce: 'N'.repeat(43), codeVerifier: 'V'.repeat(43),
        userId: USER_A, originSessionHash: HASH_64, pendingSubject: null, pendingEmail: null, createdAt: NOW, expiresAt: EXPIRES, consumedAt: null,
      });
      await r.oauthFlows.insert({
        tokenHash: hashOneTimeToken('link-B-t1134'), phase: 'AUTHORIZATION', intent: 'LINK', state: 'T'.repeat(43), nonce: 'N'.repeat(43), codeVerifier: 'V'.repeat(43),
        userId: USER_B, originSessionHash: 'd'.repeat(64), pendingSubject: null, pendingEmail: null, createdAt: NOW, expiresAt: EXPIRES, consumedAt: null,
      });
    });
    await uow.runInTransaction((r) => r.users.delete(USER_A));
    expect(countRows(db, 'auth_identities', 'user_id = ?', [USER_A])).toBe(0);
    expect(countRows(db, 'oauth_flow_states', 'user_id = ?', [USER_A])).toBe(0);
    expect(countRows(db, 'auth_identities', 'user_id = ?', [USER_B])).toBe(1);
    expect(countRows(db, 'oauth_flow_states', 'user_id = ?', [USER_B])).toBe(1);
    db.close();
  });
});

describe('[NFR-008-004][REQ-VIN8-004] auditoría sin correo ni sub de Google', () => {
  let h: Harness;
  let oidc: FakeGoogleOidc;
  let start: StartGoogleLoginUseCase;
  let complete: CompleteGoogleLoginUseCase;
  let choose: ChooseGoogleUsernameUseCase;

  const memoryAudit = () => JSON.stringify((h.uow as unknown as { state: { auditLog: unknown[] } }).state.auditLog);

  function wire(): void {
    h = createHarness();
    oidc = fakeGoogleOidc();
    const deps: ApplicationDeps = { ...h.deps, google: { oidc, entropy: new SequentialEntropy() } };
    start = new StartGoogleLoginUseCase(deps);
    complete = new CompleteGoogleLoginUseCase(deps);
    choose = new ChooseGoogleUsernameUseCase(deps);
  }

  it('[REQ-VIN8-004] el hash de auditoría de una cuenta no depende del correo: dos cuentas iguales con correos distintos producen el mismo estado', () => {
    const account = { id: USER_A, username: 'ana.t1134', displayName: 'Ana', createdAt: NOW, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h' };
    expect(stateHash({ ...account, email: 'uno@example.test', emailVerifiedAt: NOW })).toBe(stateHash({ ...account, email: 'otro@example.test', emailVerifiedAt: NOW }));
    expect(stateHash({ ...account, email: 'uno@example.test' })).toBe(stateHash({ ...account, email: null }));
  });

  it('[REQ-VIN8-004] el alta por Google (CREATE de USER) no escribe el correo ni el sub en la auditoría', async () => {
    wire();
    oidc.identity = { sub: SUB, email: EMAIL };
    const started = await start.execute();
    const chooser = await complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: new URL(started.authorizationUrl).searchParams.get('state')! });
    expect(chooser).toMatchObject({ kind: 'CHOOSE_USERNAME' });
    await choose.execute((chooser as { oauthToken: string }).oauthToken, { username: 'nueva.t1134', adultDeclaration: true });
    const audit = memoryAudit();
    expect(audit).toContain('"CREATE"');
    expect(audit).not.toContain(EMAIL);
    expect(audit).not.toContain(SUB);
    expect(audit).not.toContain('persona.t1134');
  });

  it('[REQ-VIN8-004] el alta por Google no deja el sub ni el correo en el estado de la cuenta que se audita con hash SHA-256 sin clave', async () => {
    wire();
    oidc.identity = { sub: SUB, email: EMAIL };
    const started = await start.execute();
    const chooser = await complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: new URL(started.authorizationUrl).searchParams.get('state')! });
    await choose.execute((chooser as { oauthToken: string }).oauthToken, { username: 'nueva.t1134', adultDeclaration: true });
    const rows = (h.uow as unknown as { state: { auditLog: Array<{ previousStateHash: string | null; newStateHash: string | null }> } }).state.auditLog;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const digest of [row.previousStateHash, row.newStateHash]) {
        if (digest !== null) expect(digest).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(JSON.stringify(row)).not.toContain(SUB);
    }
  });
});

describe('[NFR-008-004] la exclusión de Cloud Logging del callback está escrita en Terraform (pendiente de aplicar por Neo)', () => {
  it('[NFR-008-004] terraform/logging.tf excluye del sumidero _Default las solicitudes a /api/auth/google/callback', () => {
    const tf = readFileSync(resolve(process.cwd(), 'terraform/logging.tf'), 'utf8');
    const block = tf.slice(tf.indexOf('"google_auth_callback_requests"'));
    // En HCL las comillas del filtro van escapadas: filter = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/api/auth/google/callback\""
    expect(block).toContain('filter      = "resource.type=\\"cloud_run_revision\\" AND httpRequest.requestUrl:\\"/api/auth/google/callback\\""');
    expect(tf.slice(0, tf.indexOf('"google_auth_callback_requests"'))).toMatch(/resource "google_logging_project_exclusion" $/);
  });
});
