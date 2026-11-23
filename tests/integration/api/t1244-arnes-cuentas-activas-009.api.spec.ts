import { afterEach, describe, expect, it } from 'vitest';
import { activateAccount, HARNESS_ADMIN_ID, markPending, registerActiveAccount, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';
import { createIdentityApi, type Api } from './api-harness.ts';

/**
 * T1244 (Feature 009, Fase 4, #18; ADR-009-10): el arnés que crea cuentas ACTIVE por repositorio para las pruebas que registran y esperan sesión. La política de registro la cambia T1246 (el alta nace PENDING; el arnés la activa).
 * REQ-APR9-004, NFR-009-002; SC-009-005. Inventario de las pruebas afectadas: `.specify/memory/audits/keymaker-009-T1244-inventory.md`.
 */
const BODY = { username: 'nueva.t1244', displayName: 'Nueva', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' };
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

describe('T1244 [REQ-APR9-004] registerActiveAccount sobre la API (SQLite)', () => {
  it('con la política de T1246 (el alta nace PENDING y no devuelve cookie) el arnés activa la fila con la decisión del arnés y entra con las mismas credenciales', async () => {
    api = await createIdentityApi();
    const { registered, cookie } = await registerActiveAccount(api, BODY);
    expect([registered.status, registered.json, registered.cookie]).toEqual([201, { accountStatus: 'PENDING' }, null]);
    expect(cookie).toMatch(/^argos_session=/);
    expect(api.db.prepare('SELECT account_status, decided_at, decided_by FROM users WHERE username = ?').get(BODY.username)).toEqual({ account_status: 'ACTIVE', decided_at: '2026-11-23T10:00:00.000Z', decided_by: HARNESS_ADMIN_ID });
    const me = await api.call('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(200);
  });

  it('activateAccount pasa una cuenta PENDING a ACTIVE con fecha y autor del arnés, sin distinguir mayúsculas, y es idempotente', async () => {
    api = await createIdentityApi();
    await api.call('POST', '/api/auth/register', { body: BODY, contract: false });
    const run = sqliteRunner(api.db);
    await markPending(run, 'sqlite', 'NUEVA.T1244');
    expect(api.db.prepare('SELECT account_status FROM users WHERE username = ?').get(BODY.username)).toEqual({ account_status: 'PENDING' });
    await activateAccount(run, 'sqlite', 'Nueva.T1244', '2026-11-23T10:00:00.000Z');
    await activateAccount(run, 'sqlite', 'nueva.t1244', '2026-11-23T11:00:00.000Z');
    expect(api.db.prepare('SELECT account_status, decided_at, decided_by FROM users WHERE username = ?').get(BODY.username)).toEqual({ account_status: 'ACTIVE', decided_at: '2026-11-23T10:00:00.000Z', decided_by: HARNESS_ADMIN_ID });
  });

  it('sin cookie en el alta (política de T1246) activa por SQL y entra con las mismas credenciales', async () => {
    api = await createIdentityApi();
    const real = api;
    const wrapped = {
      db: real.db,
      call: async (method: string, url: string, options?: { body?: unknown; cookie?: string | null; contract?: boolean }) => {
        const r = await real.call(method, url, options);
        // Simula la respuesta de T1246 al alta: estado sin cookie (la fila real ya existe y se deja PENDING).
        if (url === '/api/auth/register') {
          await markPending(sqliteRunner(real.db), 'sqlite', BODY.username);
          return { ...r, cookie: null };
        }
        return r;
      },
    };
    const { cookie } = await registerActiveAccount(wrapped, BODY);
    expect(cookie).toMatch(/^argos_session=/);
    expect(real.db.prepare('SELECT account_status FROM users WHERE username = ?').get(BODY.username)).toEqual({ account_status: 'ACTIVE' });
  });
});

const SQL_ENGINES: EngineName[] = HAS_POSTGRES ? ['SQLite', 'PostgreSQL'] : ['SQLite'];

describe.each(SQL_ENGINES)('T1244 [REQ-APR9-004] cuentas ACTIVE por repositorio sobre %s', (name) => {
  let engine: IdentityEngine | null = null;
  afterEach(async () => {
    await engine?.dispose();
    engine = null;
  });

  it('una cuenta creada por el repositorio nace ACTIVE (defecto de columna); markPending la baja y activateAccount la devuelve a ACTIVE con el mismo SQL en ambos motores', async () => {
    engine = await openEngine(name, stateWith([account(idOf(1), 'previa', 'Clave2026x!')]));
    const dialect = name === 'SQLite' ? 'sqlite' : 'postgres';
    const run = async (sql: string, values: readonly unknown[]) => engine!.rawQuery(sql, [...values]);
    const read = async () => (await engine!.rawQuery(`SELECT account_status, decided_by FROM users WHERE username = ${dialect === 'sqlite' ? '?' : '$1'}`, ['previa']))![0];
    expect(await read()).toEqual({ account_status: 'ACTIVE', decided_by: null });
    await markPending(run, dialect, 'previa');
    expect((await read())!.account_status).toBe('PENDING');
    await activateAccount(run, dialect, 'PREVIA', '2026-11-23T10:00:00.000Z');
    expect(await read()).toEqual({ account_status: 'ACTIVE', decided_by: HARNESS_ADMIN_ID });
    expect(await engine.read((r) => r.users.findByUsername('previa'))).toMatchObject({ username: 'previa' });
  });
});
