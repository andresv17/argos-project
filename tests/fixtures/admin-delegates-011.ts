import type { FastifyInstance } from 'fastify';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { buildApp } from '../../src/infrastructure/http/app.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import type { SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { createApi, type Api } from '../integration/api/api-harness.ts';
import { ADMIN_EMAIL, ADMIN_SUB, ADMIN_SESSION_COOKIE, adminKit, staticRootWithIndex, stateOfUrl, valueOf, type AdminKit } from './admin-fixtures.ts';
import { canonicalState, createDeps } from './application-harness.ts';
import { GOOGLE_CODE } from './google-fixtures.ts';
import { SpyPasswordHasher } from './test-doubles.ts';

/**
 * Arnés común de las pruebas rojas de T1525 (Feature 011, Bloque D, #63; `/keymaker`). Todo el acceso a los delegados es por HTTP (contrato `admin.openapi.yaml` 1.8.0) con Google SIMULADO,
 * de modo que las pruebas dependen solo de los contratos y no de nombres de módulos que `T1527` aún no crea. Dos motores en proceso: memoria y SQLite en memoria (la unidad de trabajo de
 * SQLite serializa por cola; la carrera con candados reales de SQLite está en las suites de dos conexiones y la de PostgreSQL real está pendiente de arnés sin `TEST_DATABASE_URL`).
 *
 * @implements REQ-ADM11-001, REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-006, REQ-ADM11-007
 */
export const DELEGATE_ROOT_EMAIL = ADMIN_EMAIL;
export const OWN_ORIGIN_011 = 'http://localhost';
export const TTL_72H_MS = 72 * 3600 * 1000;
export const BASE_ISO = '2026-11-05T12:00:00.000Z';
export const BASE_MS = Date.parse(BASE_ISO);
/** Correo de un usuario REAL de ARGOS (cuenta canónica 0) para la prueba de anti-enumeración (H-4). */
export const EXISTING_USER_EMAIL = 'usuaria.existente@example.test';

export interface Resp {
  readonly status: number;
  readonly json: unknown;
  readonly text: string;
  readonly headers: Record<string, unknown>;
}

export interface CallOpts {
  readonly cookie?: string | null;
  readonly body?: unknown;
  readonly raw?: string;
  readonly csrf?: boolean;
  readonly headers?: Record<string, string>;
  readonly ip?: string;
}

export interface Env {
  readonly name: string;
  readonly app: FastifyInstance;
  readonly kit: AdminKit;
  readonly clock: FixedClockAdapter;
  /** Solo SQLite: la base en memoria para sembrar y leer la auditoría. */
  readonly db: SqliteDatabase | null;
  readonly logs: string[];
  /** Veces que una petición tocó el repositorio `users` desde el último `resetUsersReads()`. */
  usersReads(): number;
  resetUsersReads(): void;
  call(method: string, url: string, options?: CallOpts): Promise<Resp>;
  at(offsetMs: number): void;
  close(): Promise<void>;
}

export interface DelegateView {
  readonly adminId: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly isAnchored: boolean;
  readonly invitedAt: string | null;
  readonly invitedExpiresAt: string | null;
  readonly anchoredAt: string | null;
  readonly disabledAt: string | null;
  readonly etag: string;
}

export const problemCode = (r: Resp): string | undefined => (r.json as { code?: string } | undefined)?.code;
export const observable = (r: Resp): { status: number; text: string; headers: Record<string, unknown> } => {
  const { date: _date, ...headers } = r.headers;
  return { status: r.status, text: r.text, headers };
};

function spyUow(uow: UnitOfWorkPort, counter: { users: number }): UnitOfWorkPort {
  const spyRepos = (repositories: RepositorySet): RepositorySet =>
    new Proxy(repositories, {
      get(target, prop, receiver) {
        if (prop === 'users') counter.users += 1;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
  return {
    runInTransaction: (work) => uow.runInTransaction((r) => work(spyRepos(r))),
    ...(uow.runReadOnly === undefined ? {} : { runReadOnly: (work) => uow.runReadOnly!((r) => work(spyRepos(r))) }),
  };
}

function caller(app: FastifyInstance): Env['call'] {
  return async (method, url, options = {}) => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.csrf !== false) headers['x-argos-request'] = '1';
    if (options.cookie) headers['cookie'] = options.cookie;
    let payload: string | undefined;
    if (options.raw !== undefined) {
      payload = options.raw;
      headers['content-type'] ??= 'application/json';
    } else if (options.body !== undefined) {
      payload = JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }
    const response = await app.inject({ method: method as 'GET', url, headers, ...(options.ip === undefined ? {} : { remoteAddress: options.ip }), ...(payload === undefined ? {} : { payload }) });
    let json: unknown = undefined;
    try {
      json = response.body === '' ? undefined : JSON.parse(response.body);
    } catch {
      json = undefined;
    }
    return { status: response.statusCode, json, text: response.body, headers: response.headers as Record<string, unknown> };
  };
}

function loggerStream(logs: string[]) {
  return { level: 'info', stream: { write: (line: string) => void logs.push(line) } };
}

export type Backend = 'memory' | 'sqlite';

export interface BootOptions {
  /** Lista raíz (`ARGOS_ADMIN_EMAILS`); por defecto el correo raíz de las fixtures de 009. */
  readonly emails?: readonly string[];
  /** Una cuenta de usuario existente con `EXISTING_USER_EMAIL`. */
  readonly withExistingUser?: boolean;
}

export async function bootEnv(backend: Backend, options: BootOptions = {}): Promise<Env> {
  const kit = adminKit(options.emails ?? [DELEGATE_ROOT_EMAIL]);
  const state = canonicalState();
  if (options.withExistingUser === true) state.users = state.users.map((u, i) => (i === 0 ? { ...u, email: EXISTING_USER_EMAIL } : u));
  const counter = { users: 0 };
  const logs: string[] = [];
  if (backend === 'sqlite') {
    const api: Api = await createApi(state, { admin: kit.admin, staticRoot: staticRootWithIndex(), wrapUow: (uow) => spyUow(uow, counter), logger: loggerStream(logs) });
    return wrap('sqlite', api.app, kit, api.clock, api.db, logs, counter, () => api.close());
  }
  const clock = new FixedClockAdapter();
  const deps = { ...createDeps(spyUow(new InMemoryUnitOfWork(state), counter), clock, new SpyPasswordHasher()), admin: kit.admin };
  const app = await buildApp({ deps, cookieSecure: false, staticRoot: staticRootWithIndex(), logger: loggerStream(logs) });
  return wrap('memory', app, kit, clock, null, logs, counter, () => app.close());
}

/** Entorno sobre una unidad de trabajo ya creada (las dos conexiones de SQLite o el pool de PostgreSQL de `concurrent-engines.ts`). */
export async function envOverUow(name: string, uow: UnitOfWorkPort, kit: AdminKit, clock: FixedClockAdapter, depsFrom: ReturnType<typeof createDeps>, close: () => Promise<void> = async () => undefined): Promise<Env> {
  const counter = { users: 0 };
  const logs: string[] = [];
  const deps = { ...depsFrom, uow: spyUow(uow, counter), admin: kit.admin };
  const app = await buildApp({ deps, cookieSecure: false, staticRoot: staticRootWithIndex(), logger: loggerStream(logs) });
  return wrap(name, app, kit, clock, null, logs, counter, async () => {
    await app.close();
    await close();
  });
}

function wrap(name: string, app: FastifyInstance, kit: AdminKit, clock: FixedClockAdapter, db: SqliteDatabase | null, logs: string[], counter: { users: number }, close: () => Promise<void>): Env {
  const at = (offsetMs: number): void => {
    const iso = new Date(BASE_MS + offsetMs).toISOString();
    clock.setClock(iso.slice(0, 10), iso);
  };
  at(0);
  return { name, app, kit, clock, db, logs, usersReads: () => counter.users, resetUsersReads: () => void (counter.users = 0), call: caller(app), at, close };
}

let ipCounter = 0;
const nextIp = (): string => {
  ipCounter += 1;
  return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.7`;
};

export interface Identity {
  readonly email: string;
  readonly sub: string;
}
export const ROOT_IDENTITY: Identity = { email: ADMIN_EMAIL, sub: ADMIN_SUB };

/** Flujo completo de Google simulado para la identidad dada. `cookie` es `argos_admin_session=...` o `null` si el callback fue el 404 uniforme. */
export async function loginAs(env: Env, identity: Identity): Promise<{ done: Resp; cookie: string | null }> {
  env.kit.oidc.identity = { sub: identity.sub, email: identity.email };
  const ip = nextIp();
  const started = await env.call('GET', '/api/admin/auth/google/start', { csrf: false, ip });
  const location = started.headers['location'];
  const setCookie = ([] as string[]).concat((started.headers['set-cookie'] as string | string[] | undefined) ?? []);
  const oauth = setCookie.find((c) => c.startsWith('argos_admin_oauth='));
  if (started.status !== 302 || typeof location !== 'string' || oauth === undefined) return { done: started, cookie: null };
  const done = await env.call('GET', `/api/admin/auth/google/callback?code=${GOOGLE_CODE}&state=${stateOfUrl(location)}`, { csrf: false, cookie: `argos_admin_oauth=${valueOf(oauth)}`, ip });
  const session = ([] as string[]).concat((done.headers['set-cookie'] as string | string[] | undefined) ?? []).find((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return { done, cookie: session === undefined ? null : `${ADMIN_SESSION_COOKIE}=${valueOf(session)}` };
}

export const loginRoot = async (env: Env): Promise<string> => {
  const { cookie } = await loginAs(env, ROOT_IDENTITY);
  if (cookie === null) throw new Error('el acceso del administrador raíz falló en el arnés');
  return cookie;
};

export const subOf = (email: string): string => `google-sub-${email.split('@')[0]}`;
export const emailOf = (n: number): string => `delegado${String(n).padStart(3, '0')}@example.test`;

const inviteBody = (email: string, role: string, confirmation: string = email) => ({ email, emailConfirmation: confirmation, role });
export const invite = (env: Env, cookie: string | null, email: string, role = 'SUPPORT', confirmation?: string, extra: CallOpts = {}): Promise<Resp> =>
  env.call('POST', '/api/admin/administrators', { cookie, body: inviteBody(email, role, confirmation), ...extra });

export const listDelegates = async (env: Env, cookie: string | null): Promise<{ status: number; items: DelegateView[]; activeCount: number | null; activeLimit: number | null }> => {
  const r = await env.call('GET', '/api/admin/administrators', { cookie });
  const page = r.json as { items?: DelegateView[]; activeCount?: number; activeLimit?: number } | undefined;
  return { status: r.status, items: page?.items ?? [], activeCount: page?.activeCount ?? null, activeLimit: page?.activeLimit ?? null };
};

export const delegateOf = async (env: Env, cookie: string | null, email: string): Promise<DelegateView | undefined> => (await listDelegates(env, cookie)).items.find((d) => d.email === email.toLowerCase());

const writeHeaders = (etag: string): Record<string, string> => ({ 'if-match': etag });
export const changeRole = (env: Env, cookie: string | null, adminId: string, etag: string, role: string): Promise<Resp> =>
  env.call('PUT', `/api/admin/administrators/${adminId}/role`, { cookie, body: { role }, headers: writeHeaders(etag) });
export const disable = (env: Env, cookie: string | null, adminId: string, etag: string): Promise<Resp> => env.call('POST', `/api/admin/administrators/${adminId}/disable`, { cookie, headers: writeHeaders(etag) });
export const reactivate = (env: Env, cookie: string | null, adminId: string, etag: string, role: string): Promise<Resp> =>
  env.call('POST', `/api/admin/administrators/${adminId}/reactivate`, { cookie, body: { role }, headers: writeHeaders(etag) });
export const reinvite = (env: Env, cookie: string | null, adminId: string, etag: string): Promise<Resp> => env.call('POST', `/api/admin/administrators/${adminId}/reinvite`, { cookie, headers: writeHeaders(etag) });

export interface Onboarded {
  readonly email: string;
  readonly sub: string;
  readonly adminId: string | null;
  readonly cookie: string | null;
  readonly invited: Resp;
}

/** Alta por la sesión `inviterCookie`, anclaje por el acceso con Google y la sesión del delegado. `adminId` sale de `GET /api/admin/session`. */
export async function onboard(env: Env, inviterCookie: string | null, email: string, role: string, sub: string = subOf(email)): Promise<Onboarded> {
  const invited = await invite(env, inviterCookie, email, role);
  const { cookie } = await loginAs(env, { email, sub });
  let adminId: string | null = null;
  if (cookie !== null) adminId = ((await env.call('GET', '/api/admin/session', { cookie })).json as { adminId?: string } | undefined)?.adminId ?? null;
  return { email, sub, adminId, cookie, invited };
}

/** Rellena `count` plazas con invitaciones vigentes de correos distintos (cuentan igual que `ACTIVE`, D11-03). Devuelve los correos usados. */
export async function fillSlots(env: Env, rootCookie: string | null, count: number, from = 1): Promise<string[]> {
  const emails: string[] = [];
  for (let n = from; n < from + count; n += 1) {
    const email = emailOf(n);
    emails.push(email);
    await invite(env, rootCookie, email, 'SUPPORT');
  }
  return emails;
}

/** Reintenta una petición que respondió 500 por `SQLITE_BUSY` de la conexión con `busy_timeout = 0` (como lo haría una segunda instancia); tope de reintentos para no ocultar un 500 real. */
export async function retryBusy<T = Resp>(call: () => Promise<T>, statusOf: (result: T) => number = (result) => (result as Resp).status): Promise<T> {
  let last: T = await call();
  for (let attempt = 0; attempt < 60 && statusOf(last) === 500; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    last = await call();
  }
  return last;
}

/** Cuerpo del 404 uniforme de cualquier ruta inexistente de `/api/`. */
export const NOT_FOUND_TEXT = 'Not Found';

/** Código de error de la respuesta o `OK<status>`. */
export const outcome = (r: Resp): string => problemCode(r) ?? (r.status >= 200 && r.status < 300 ? `OK${r.status}` : `HTTP${r.status}`);
