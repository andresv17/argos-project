/**
 * API real (Fastify `inject`) del enlace veterinario sobre SQLite en memoria: estado canónico, reloj fijo, tokens de enlace deterministas, almacenamiento
 * de memoria controlable, límite de tasa en memoria y registro de aplicación capturado (para las pruebas de centinelas, SC-005-022). A diferencia de
 * `createApi`, no valida las respuestas contra el OpenAPI de la 002/004: usa los validadores generados 3.3.0 en cada prueba.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { SharedAccessLimiter } from '../../src/application/sharing/shared-access-limiter.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { cloudLoggerOptions } from '../../src/infrastructure/http/cloud-logging.ts';
import { buildApp } from '../../src/infrastructure/http/app.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { PASSWORDS, TEST_RATE_LIMITS, canonicalState, createDeps } from './application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from './media-harness.ts';
import { SHARE_IP_SECRET, SequentialShareTokenGenerator, recording } from './share-harness.ts';
import { dumpSqlite, seedSqlite } from './sqlite-harness.ts';
import { SpyPasswordHasher } from './test-doubles.ts';

export interface ShareApiResponse {
  readonly status: number;
  readonly json: unknown;
  readonly text: string;
  readonly headers: LightMyRequestResponse['headers'];
}

export interface ShareApi {
  readonly app: FastifyInstance;
  readonly db: SqliteDatabase;
  readonly clock: FixedClockAdapter;
  readonly deps: ApplicationDeps;
  readonly tokens: SequentialShareTokenGenerator;
  readonly limiter: SharedAccessLimiter;
  readonly storage: ControlledStorage;
  /** Líneas JSON que escribió el registro de aplicación (formato de producción). */
  readonly logLines: string[];
  /** Llamadas a puertos de repositorio desde el último reset (secuencia de SC-005-021). */
  readonly calls: string[];
  call(method: string, url: string, options?: { cookie?: string | null; body?: unknown; csrf?: boolean; headers?: Record<string, string> }): Promise<ShareApiResponse>;
  /** Petición pública sin ninguna cabecera de la aplicación (ni CSRF ni cookie). */
  publicGet(url: string, headers?: Record<string, string>): Promise<ShareApiResponse>;
  inject(method: string, url: string, headers?: Record<string, string>): Promise<ShareApiResponse>;
  login(username: string): Promise<string>;
  dump(): string;
  close(): Promise<void>;
}

export async function createShareApi(options: { readonly role?: 'ADMIN' | 'CAREGIVER' | 'READER'; readonly limiter?: SharedAccessLimiter } = {}): Promise<ShareApi> {
  const state = canonicalState();
  if (options.role !== undefined) (state.memberships.find((m) => m.userId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') as { role: string }).role = options.role;
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, state);
  db.exec("DELETE FROM audit_log WHERE mutation_type = 'MIGRATION'");
  const clock = new FixedClockAdapter('2026-11-18', '2026-11-18T12:00:00.000Z');
  const storage = new ControlledStorage(() => new Date(clock.nowIsoTimestamp()));
  const tokens = new SequentialShareTokenGenerator();
  const limiter = options.limiter ?? new SharedAccessLimiter();
  const calls: string[] = [];
  const base = createDeps(uow, clock, new SpyPasswordHasher(), TEST_RATE_LIMITS);
  const deps: ApplicationDeps = { ...base, uow: recording(uow, calls), media: { storage, limits: DEFAULT_LIMITS }, sharing: { tokens, ipHmacSecret: SHARE_IP_SECRET, limiter } };
  const logLines: string[] = [];
  const stream = { write: (line: string) => void logLines.push(line) };
  const app = await buildApp({ deps, cookieSecure: false, logger: { ...cloudLoggerOptions(), stream } as never });

  const toResponse = (response: LightMyRequestResponse): ShareApiResponse => {
    let json: unknown;
    try {
      json = response.body === '' ? undefined : JSON.parse(response.body);
    } catch {
      json = undefined;
    }
    return { status: response.statusCode, json, text: response.body, headers: response.headers };
  };
  const inject = async (method: string, url: string, headers: Record<string, string> = {}, payload?: string) =>
    toResponse(await app.inject({ method: method as 'GET', url, headers, ...(payload === undefined ? {} : { payload }) }));

  return {
    app,
    db,
    clock,
    deps,
    tokens,
    limiter,
    storage,
    logLines,
    calls,
    async call(method, url, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.csrf !== false) headers['x-argos-request'] = '1';
      if (opts.cookie) headers['cookie'] = opts.cookie;
      let payload: string | undefined;
      if (opts.body !== undefined) {
        payload = JSON.stringify(opts.body);
        headers['content-type'] ??= 'application/json';
      }
      return inject(method, url, headers, payload);
    },
    publicGet: (url, headers = {}) => inject('GET', url, headers),
    inject,
    async login(user) {
      const response = await inject('POST', '/api/auth/login', { 'x-argos-request': '1', 'content-type': 'application/json' }, JSON.stringify({ username: user, password: PASSWORDS[user] }));
      const cookie = ([] as string[]).concat(response.headers['set-cookie'] ?? [])[0]?.split(';')[0];
      if (response.status !== 200 || cookie === undefined) throw new Error(`login de ${user} falló: ${response.text}`);
      return cookie;
    },
    dump: () => dumpSqlite(db),
    async close() {
      await app.close();
      db.close();
    },
  };
}
