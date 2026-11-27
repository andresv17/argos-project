import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { maintenanceCutoffs } from '../../src/application/use-cases/maintenance-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { buildApp } from '../../src/infrastructure/http/app.ts';
import { cloudLoggerOptions } from '../../src/infrastructure/http/cloud-logging.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ADMIN_EMAIL, ADMIN_SESSION_COOKIE, ADMIN_SUB, adminCallback, adminKit, adminLogin, adminStart, cookieNamed, stateOfUrl, staticRootWithAdmin, valueOf, type AdminKit } from '../fixtures/admin-fixtures.ts';
import { createDeps, canonicalState, TEST_RATE_LIMITS } from '../fixtures/application-harness.ts';
import { GOOGLE_CODE } from '../fixtures/google-fixtures.ts';
import { seedSqlite } from '../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../fixtures/test-doubles.ts';

/**
 * T1239 (009, [GH:#19], tarea [GOV] `/rama`): privacidad y retención del portal de administración.
 * REQ-ADM9-004, NFR-009-004; SC-009-013.
 *
 * Decisión de Neo (Logos, cerrada): el correo del administrador se guarda EN CLARO y en minúsculas en `admin_identities`; no se
 * expone en respuestas, logs ni `admin_audit_entries`. Esta suite AUDITA ese cumplimiento; no reabre la decisión.
 *
 * Ámbito: rutas REALES (`registerAdminRoutes` vía `buildApp`), logger REAL de Cloud Run (`cloudLoggerOptions`) con salida capturada,
 * SQLite en memoria con migraciones reales y el puerto de Google simulado. Los `it.fails` son HALLAZGOS documentados: pasan mientras el
 * defecto exista y deben pasar a `it` cuando keymaker lo corrija (ver `.specify/memory/audits/rama-009-T1239.md`).
 */

const OWN_ORIGIN = 'http://localhost';
const NOW = '2026-11-05T12:00:00.000Z';
const HOUR = 60 * 60 * 1000;
const isoAgo = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString();
const SHA256_HEX = /^[0-9a-f]{64}$/;

interface Harness {
  readonly call: (method: string, url: string, options?: { headers?: Record<string, string>; cookie?: string | null }) => Promise<Resp>;
  readonly db: SqliteDatabase;
  readonly clock: FixedClockAdapter;
  readonly kit: AdminKit;
  readonly lines: string[];
  close(): Promise<void>;
}

interface Resp {
  readonly status: number;
  readonly text: string;
  readonly headers: Record<string, unknown>;
  readonly setCookie: string | string[] | undefined;
  readonly cookie: string | null;
}

/** Réplica mínima del arnés de la API con el logger real de Cloud Run y salida capturada (el arnés compartido no admite `logger`). */
async function boot(): Promise<Harness> {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, canonicalState());
  const clock = new FixedClockAdapter();
  clock.setClock('2026-11-05', NOW);
  const kit = adminKit();
  const base = createDeps(uow, clock, new SpyPasswordHasher(), TEST_RATE_LIMITS);
  const deps: ApplicationDeps = { ...base, admin: kit.admin };
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString('utf8'));
      done();
    },
  });
  const app = await buildApp({ deps, cookieSecure: false, staticRoot: staticRootWithAdmin(), logger: { ...cloudLoggerOptions(), stream } });
  const call: Harness['call'] = async (method, url, options = {}) => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.cookie) headers['cookie'] = options.cookie;
    const response = await app.inject({ method: method as 'GET', url, headers });
    const setCookie = response.headers['set-cookie'] as string | string[] | undefined;
    const first = ([] as string[]).concat(setCookie ?? [])[0];
    return { status: response.statusCode, text: response.body, headers: response.headers, setCookie, cookie: first === undefined ? null : first.split(';')[0]! };
  };
  return { call, db, clock, kit, lines, close: async () => {
      await app.close();
      db.close();
    } };
}

/** Adaptador al tipo `Api` que esperan los fixtures de administración (solo usa `call`). */
const asApi = (h: Harness) => h as unknown as Parameters<typeof adminLogin>[0];

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.close();
  harness = null;
});

async function bootAndLogin(): Promise<{ h: Harness; sessionCookie: string; sessionValue: string; oauthValue: string; state: string }> {
  const h = await boot();
  harness = h;
  const started = await adminStart(asApi(h));
  const oauthValue = valueOf(cookieNamed(started as never, 'argos_admin_oauth'));
  const state = stateOfUrl(started.headers['location'] as string);
  const done = await adminCallback(asApi(h), oauthValue, `code=${GOOGLE_CODE}&state=${state}`);
  const session = cookieNamed(done as never, ADMIN_SESSION_COOKIE);
  if (session === undefined) throw new Error('el acceso de administración no emitió sesión');
  return { h, sessionCookie: session.split(';')[0]!, sessionValue: session.split(';')[0]!.split('=')[1]!, oauthValue, state };
}

/** Recorre todos los caminos observables del portal (éxito, fallos, sesión, cierre, rutas ocultas) y devuelve cada respuesta. */
async function exerciseAllPaths(h: Harness, sessionCookie: string): Promise<string[]> {
  const bodies: string[] = [];
  const keep = (r: Resp) => bodies.push(r.text);
  keep(await h.call('GET', '/api/admin/session', { cookie: sessionCookie }));
  keep(await h.call('GET', '/api/admin/session'));
  keep(await h.call('DELETE', '/api/admin/session', { cookie: sessionCookie, headers: { origin: 'https://evil.example' } }));
  keep(await h.call('GET', '/api/admin/auth/google/callback?code=zz&state=zz', { cookie: 'argos_admin_oauth=' + 'O'.repeat(43) }));
  keep(await h.call('GET', '/api/admin/auth/google/callback?code=zz&state=zz'));
  keep(await h.call('GET', '/api/admin/ruta-oculta-zz'));
  keep(await h.call('GET', '/api/admin/auth/google/start'));
  keep(await h.call('DELETE', '/api/admin/session', { cookie: sessionCookie, headers: { origin: OWN_ORIGIN } }));
  return bodies;
}

describe('T1239 [LOG] ningún registro de la aplicación contiene correo, sub, código, state, token ni cookie del portal', () => {
  it('recorrido completo del portal: los logs capturados no contienen secretos ni datos personales', async () => {
    const { h, sessionCookie, sessionValue, oauthValue, state } = await bootAndLogin();
    await exerciseAllPaths(h, sessionCookie);
    const logs = h.lines.join('');
    expect(logs.length, 'la captura de logs debe tener registros (control positivo)').toBeGreaterThan(0);
    for (const secret of [ADMIN_EMAIL, ADMIN_SUB, GOOGLE_CODE, state, oauthValue, sessionValue]) {
      expect(logs, `fuga en logs de ${secret.slice(0, 12)}…`).not.toContain(secret);
    }
    expect(logs).not.toMatch(/id_token|access_token|refresh_token|code_verifier|nonce/i);
    expect(logs).not.toContain('argos_admin_session');
    expect(logs).not.toContain('argos_admin_oauth');
  });

  it('los registros de petición solo llevan método y ruta con plantilla (sin query)', async () => {
    const { h } = await bootAndLogin();
    await h.call('GET', '/api/admin/auth/google/callback?code=zz-query-secreta&state=zz-state-secreto');
    const logs = h.lines.join('');
    expect(logs).not.toContain('zz-query-secreta');
    expect(logs).not.toContain('zz-state-secreto');
  });
});

describe('T1239 [ERRORES] ni las respuestas ni sus cabeceras exponen correo, sub, código o tokens', () => {
  it('ninguna respuesta del portal (éxito, fallo uniforme, 403 CSRF, 404 oculto) contiene secretos', async () => {
    const { h, sessionCookie, sessionValue, oauthValue, state } = await bootAndLogin();
    const bodies = await exerciseAllPaths(h, sessionCookie);
    for (const body of bodies) {
      for (const secret of [ADMIN_EMAIL, ADMIN_SUB, GOOGLE_CODE, state, oauthValue, sessionValue]) expect(body).not.toContain(secret);
    }
  });
});

describe('T1239 [AUDITORÍA] admin_audit_entries no guarda correo, sub ni tokens y solo tiene columnas de identificador, acción y marca de tiempo', () => {
  it('esquema: columnas exactas de admin_audit_entries', async () => {
    const { h } = await bootAndLogin();
    const columns = (h.db.prepare('PRAGMA table_info(admin_audit_entries)').all() as Array<{ name: string }>).map((c) => c.name).sort();
    expect(columns).toEqual(['action', 'admin_id', 'id', 'metadata', 'object_ref', 'occurred_at']);
  });

  it('contenido: ninguna fila de auditoría contiene correo, sub ni identificador de sesión o flujo', async () => {
    const { h, sessionValue, oauthValue, state } = await bootAndLogin();
    await h.call('DELETE', '/api/admin/session', { cookie: `${ADMIN_SESSION_COOKIE}=${sessionValue}`, headers: { origin: OWN_ORIGIN } });
    const rows = JSON.stringify(h.db.prepare('SELECT * FROM admin_audit_entries').all());
    expect(rows.length).toBeGreaterThan(2); // control positivo: hay filas (inicio y fin de sesión)
    for (const secret of [ADMIN_EMAIL, ADMIN_SUB, GOOGLE_CODE, state, oauthValue, sessionValue]) expect(rows).not.toContain(secret);
  });

  it('el correo solo aparece en admin_identities (decisión de Neo: en claro, minúsculas) y nunca en las tablas de sesión o flujo', async () => {
    const { h, sessionValue, oauthValue } = await bootAndLogin();
    const identity = JSON.stringify(h.db.prepare('SELECT * FROM admin_identities').all());
    expect(identity).toContain(ADMIN_EMAIL); // control positivo de la decisión firmada
    const others = JSON.stringify([
      h.db.prepare('SELECT * FROM admin_sessions').all(),
      h.db.prepare('SELECT * FROM admin_oauth_flow_states').all(),
      h.db.prepare('SELECT * FROM admin_audit_entries').all(),
    ]);
    expect(others).not.toContain(ADMIN_EMAIL);
    expect(others).not.toContain(ADMIN_SUB);
    expect(others).not.toContain(sessionValue);
    // El identificador de la cookie de flujo solo puede aparecer como hash; `state`, `nonce` y el verificador viven en admin_oauth_flow_states por diseño (spec, plan).
    expect(others).not.toContain(oauthValue);
  });

  it('admin_sessions guarda solo el SHA-256 del identificador de la cookie (nunca el valor en claro)', async () => {
    const { h, sessionValue } = await bootAndLogin();
    const hashes = (h.db.prepare('SELECT token_hash FROM admin_sessions').all() as Array<{ token_hash: string }>).map((r) => r.token_hash);
    expect(hashes.length).toBe(1);
    expect(hashes[0]).toMatch(SHA256_HEX);
    expect(hashes[0]).not.toBe(sessionValue);
  });
});

describe('T1239 [RETENCIÓN] sesiones y estados de flujo con purga efectiva (30 min absolutos, 900 s de flujo)', () => {
  it('el inicio de un flujo purga los estados vencidos de admin_oauth_flow_states', async () => {
    const { h } = await bootAndLogin();
    h.db.prepare(
      "INSERT INTO admin_oauth_flow_states (token_hash, state, nonce, code_verifier, created_at, expires_at, consumed_at) VALUES (?, 's', 'n', 'v', ?, ?, NULL)",
    ).run('a'.repeat(64), isoAgo(2 * HOUR), isoAgo(HOUR));
    await h.call('GET', '/api/admin/auth/google/start');
    const remaining = (h.db.prepare("SELECT COUNT(*) AS n FROM admin_oauth_flow_states WHERE token_hash = ?").get('a'.repeat(64)) as { n: number }).n;
    expect(remaining).toBe(0);
  });

  it('un nuevo acceso purga las sesiones creadas hace más de 30 min (vida absoluta)', async () => {
    const { h } = await bootAndLogin();
    const adminId = (h.db.prepare('SELECT admin_id FROM admin_identities').get() as { admin_id: string }).admin_id;
    h.db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, created_at, last_activity_at, revoked_at) VALUES (?, ?, ?, ?, NULL)').run('b'.repeat(64), adminId, isoAgo(HOUR), isoAgo(HOUR));
    await adminLogin(asApi(h));
    const remaining = (h.db.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE token_hash = ?").get('b'.repeat(64)) as { n: number }).n;
    expect(remaining).toBe(0);
  });

  // HALLAZGO RAMA-T1239-01 (MEDIO): la purga de mantenimiento (ADR-002-14) no incluye las tablas de administración. Ver el acta.
  it('[HALLAZGO RAMA-T1239-01] el mantenimiento programado purga admin_oauth_flow_states vencidos', async () => {
    const { h } = await bootAndLogin();
    h.db.prepare(
      "INSERT INTO admin_oauth_flow_states (token_hash, state, nonce, code_verifier, created_at, expires_at, consumed_at) VALUES (?, 's', 'n', 'v', ?, ?, NULL)",
    ).run('c'.repeat(64), isoAgo(3 * HOUR), isoAgo(2 * HOUR));
    await new SqliteUnitOfWork(h.db).purgeExpired(maintenanceCutoffs(NOW));
    const remaining = (h.db.prepare("SELECT COUNT(*) AS n FROM admin_oauth_flow_states WHERE token_hash = ?").get('c'.repeat(64)) as { n: number }).n;
    expect(remaining).toBe(0);
  });

  // HALLAZGO RAMA-T1239-02 (MEDIO): sesiones vencidas sin purga de mantenimiento; solo se purgan al iniciar sesión.
  it('[HALLAZGO RAMA-T1239-02] el mantenimiento programado purga admin_sessions creadas hace más de 30 min', async () => {
    const { h } = await bootAndLogin();
    const adminId = (h.db.prepare('SELECT admin_id FROM admin_identities').get() as { admin_id: string }).admin_id;
    h.db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, created_at, last_activity_at, revoked_at) VALUES (?, ?, ?, ?, NULL)').run('d'.repeat(64), adminId, isoAgo(HOUR), isoAgo(HOUR));
    await new SqliteUnitOfWork(h.db).purgeExpired(maintenanceCutoffs(NOW));
    const remaining = (h.db.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE token_hash = ?").get('d'.repeat(64)) as { n: number }).n;
    expect(remaining).toBe(0);
  });

  // HALLAZGO RAMA-T1239-03 (MEDIO): admin_audit_entries sin purga de mantenimiento (24 meses). Acta: architect-009-T1252-retencion-admin.md (opción a).
  it('[HALLAZGO RAMA-T1239-03] el mantenimiento purga admin_audit_entries anteriores a auditBefore y los suma a auditRowsPurged', async () => {
    const h = await boot();
    harness = h;
    const cutoffs = maintenanceCutoffs(NOW);
    const dayMs = 24 * HOUR;
    const shift = (days: number): string => new Date(Date.parse(cutoffs.auditBefore) + days * dayMs).toISOString();
    const adminId = 'a'.repeat(36);
    const insertAdmin = h.db.prepare('INSERT INTO admin_audit_entries (id, admin_id, action, object_ref, occurred_at) VALUES (?, ?, ?, NULL, ?)');
    insertAdmin.run('A'.repeat(36), adminId, 'ADMIN_REGISTRATION_APPROVE', shift(-1)); // vencida
    insertAdmin.run('B'.repeat(36), adminId, 'ADMIN_REGISTRATION_APPROVE', cutoffs.auditBefore); // frontera exacta: se conserva (< estricto)
    insertAdmin.run('C'.repeat(36), adminId, 'ADMIN_REGISTRATION_REJECT', NOW); // reciente
    h.db.prepare('DELETE FROM audit_log').run();
    h.db
      .prepare('INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)')
      .run('audit-vencida', shift(-1), 'u-1', 'UPDATE', 'PET', 'p-1');
    const counts = await new SqliteUnitOfWork(h.db).purgeExpired(cutoffs);
    const ids = (h.db.prepare('SELECT id FROM admin_audit_entries ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toEqual(['B'.repeat(36), 'C'.repeat(36)]);
    expect(counts.auditRowsPurged).toBe(2);
    expect(counts).toEqual({ sessionsPurged: expect.any(Number), confirmationTokensPurged: expect.any(Number), membershipsPurged: expect.any(Number), invitationsPurged: expect.any(Number), auditRowsPurged: 2 });
    expect(Object.keys(counts).sort()).toEqual(['auditRowsPurged', 'confirmationTokensPurged', 'invitationsPurged', 'membershipsPurged', 'sessionsPurged']);
  });
});

describe('T1239 [CÓDIGO] los módulos del portal no escriben en logs ni en consola', () => {
  const ADMIN_SOURCES = [
    'src/application/use-cases/admin-use-cases.ts',
    'src/infrastructure/http/routes/admin.routes.ts',
    'src/infrastructure/http/admin-rate-limit.ts',
    'src/infrastructure/persistence/sqlite/sqlite-admin-repositories.ts',
    'src/infrastructure/persistence/postgres/postgres-admin-repositories.ts',
    'src/application/ports/admin.port.ts',
  ];
  it('ningún módulo de administración llama a console.*, logger ni request.log/app.log', () => {
    const root = new URL('../../', import.meta.url);
    for (const file of ADMIN_SOURCES) {
      const text = readFileSync(new URL(file, root), 'utf8');
      expect(text, file).not.toMatch(/\bconsole\.|\.log\.(info|warn|error|debug|trace|fatal)\(|\blogger\b/);
    }
  });
});
