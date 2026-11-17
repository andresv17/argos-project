import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import type { MemoryState } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { PASSWORDS, TEST_RATE_LIMITS, USERS, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, identityState } from '../../fixtures/identity-fixtures.ts';
import type { RateLimits } from '../../../src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts';
import { dumpSqlite, seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';
import { checkResponse } from '../contracts/openapi-contract.ts';

/**
 * API real (Fastify `inject`) sobre SQLite en memoria con el estado canónico, reloj fijo (2026-11-05T12:00:00Z),
 * IDs y tokens deterministas y hasher espía. Cada respuesta se comprueba contra el OpenAPI salvo que la
 * prueba lo desactive con `contract: false` (y lo justifique).
 */
export interface CallOptions {
  readonly cookie?: string | null;
  readonly body?: unknown;
  readonly raw?: string | Uint8Array;
  readonly csrf?: boolean;
  readonly headers?: Record<string, string>;
  readonly contract?: boolean;
}

export interface ApiResponse {
  readonly status: number;
  readonly json: unknown;
  readonly text: string;
  readonly headers: LightMyRequestResponse['headers'];
  readonly cookie: string | null;
  readonly setCookie: string | null;
}

export interface Api {
  readonly app: FastifyInstance;
  readonly db: SqliteDatabase;
  readonly clock: FixedClockAdapter;
  readonly hasher: SpyPasswordHasher;
  readonly deps: ApplicationDeps;
  call(method: string, url: string, options?: CallOptions): Promise<ApiResponse>;
  /** Inicia sesión con la contraseña canónica y devuelve la cookie `argos_session=...`. */
  login(username: string): Promise<string>;
  /** Siembra el token de confirmación de respaldo del usuario por su puerto (la emisión real llega con la rebanada 5). */
  issueConfirmationToken(userId: string): Promise<string>;
  dump(): string;
  close(): Promise<void>;
}

export const username = (id: string) => USERS.find((u) => u.id === id)!.username;

export async function createApi(
  state: MemoryState = canonicalState(),
  options: { readonly cookieSecure?: boolean; readonly rateLimits?: RateLimits } = {},
): Promise<Api> {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, state);
  // La migración 0005 deja su fila MIGRATION (REQ-MIG-001); las pruebas de la API parten de una auditoría vacía (T254).
  db.exec("DELETE FROM audit_log WHERE mutation_type = 'MIGRATION'");
  const clock = new FixedClockAdapter();
  const hasher = new SpyPasswordHasher();
  const deps = createDeps(uow, clock, hasher, options.rateLimits ?? TEST_RATE_LIMITS);
  const app = await buildApp({ deps, cookieSecure: options.cookieSecure ?? false });

  async function call(method: string, url: string, options: CallOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.csrf !== false) headers['x-argos-request'] = '1';
    if (options.cookie) headers['cookie'] = options.cookie;
    let payload: string | Buffer | undefined;
    if (options.raw !== undefined) {
      payload = typeof options.raw === 'string' ? options.raw : Buffer.from(options.raw);
      headers['content-type'] ??= 'application/json';
    } else if (options.body !== undefined) {
      payload = JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }
    const response = await app.inject({ method: method as 'GET', url, headers, ...(payload === undefined ? {} : { payload }) });
    const text = response.body;
    let json: unknown = undefined;
    try {
      json = text === '' ? undefined : JSON.parse(text);
    } catch {
      json = undefined;
    }
    const setCookie = ([] as string[]).concat(response.headers['set-cookie'] ?? [])[0] ?? null;
    if (options.contract !== false) {
      const check = checkResponse(method, url, response.statusCode, response.headers['content-type'] as string | undefined, json ?? (text === '' ? undefined : text));
      expect(check.errors, `contrato OpenAPI de ${method} ${url}`).toEqual([]);
    }
    return { status: response.statusCode, json, text, headers: response.headers, setCookie, cookie: setCookie === null ? null : setCookie.split(';')[0]! };
  }

  return {
    app,
    db,
    clock,
    hasher,
    deps,
    call,
    async login(user) {
      const response = await call('POST', '/api/auth/login', { body: { username: user, password: IDENTITY_PASSWORDS[user] ?? PASSWORDS[user] } });
      if (response.status !== 200 || response.cookie === null) throw new Error(`login de ${user} falló: ${response.text}`);
      return response.cookie;
    },
    async issueConfirmationToken(userId) {
      const issued = await deps.uow.runInTransaction((r) => deps.backupTokens.issue(r, userId, deps.clock.nowIsoTimestamp()));
      return issued.token;
    },
    dump: () => dumpSqlite(db),
    async close() {
      await app.close();
      db.close();
    },
  };
}

/** API con el estado de identidad de la Rebanada 1 y el reloj en el instante de referencia de los fixtures 3.0.0 (2026-11-11T12:00:00Z). */
export async function createIdentityApi(options: { readonly cookieSecure?: boolean; readonly rateLimits?: RateLimits } = {}): Promise<Api> {
  const api = await createApi(identityState(), options);
  api.clock.setClock(REFERENCE_TODAY, REFERENCE_NOW);
  return api;
}

/** Campos del problema que verifican las pruebas. */
export const problemOf = (response: ApiResponse) => {
  const p = response.json as { code?: string; field?: string | null; finalState?: string };
  return { status: response.status, code: p?.code, ...(p?.finalState === undefined ? {} : { finalState: p.finalState }) };
};
