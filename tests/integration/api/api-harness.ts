import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { DeterministicIdAdapter } from '../../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import type { MemoryState } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { GENERATED_IDS, PASSWORDS, USERS, canonicalState } from '../../fixtures/application-harness.ts';
import { dumpSqlite, seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { DUMMY_PASSWORD_HASH, SequentialTokenAdapter, SpyPasswordHasher } from '../../fixtures/test-doubles.ts';
import { checkResponse } from '../contracts/openapi-contract.ts';

/**
 * API real (Fastify `inject`) sobre SQLite en memoria con el estado canónico, reloj fijo (2026-11-05T12:00:00Z),
 * IDs y tokens deterministas y hasher espía (TASK-111). Cada respuesta se comprueba contra el OpenAPI salvo que la
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
  call(method: string, url: string, options?: CallOptions): Promise<ApiResponse>;
  /** Inicia sesión con la contraseña canónica y devuelve la cookie `argos_session=...`. */
  login(username: string): Promise<string>;
  dump(): string;
  close(): Promise<void>;
}

export const username = (id: string) => USERS.find((u) => u.id === id)!.username;

export async function createApi(state: MemoryState = canonicalState(), options: { readonly cookieSecure?: boolean } = {}): Promise<Api> {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, state);
  const clock = new FixedClockAdapter();
  const hasher = new SpyPasswordHasher();
  const deps: ApplicationDeps = {
    uow,
    clock,
    ids: new DeterministicIdAdapter(GENERATED_IDS),
    tokens: new SequentialTokenAdapter(),
    hasher,
    dummyPasswordHash: DUMMY_PASSWORD_HASH,
  };
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
    call,
    async login(user) {
      const response = await call('POST', '/api/auth/login', { body: { username: user, password: PASSWORDS[user] } });
      if (response.status !== 200 || response.cookie === null) throw new Error(`login de ${user} falló: ${response.text}`);
      return response.cookie;
    },
    dump: () => dumpSqlite(db),
    async close() {
      await app.close();
      db.close();
    },
  };
}

/** Campos del problema que verifican las pruebas. */
export const problemOf = (response: ApiResponse) => {
  const p = response.json as { code?: string; field?: string | null; finalState?: string };
  return { status: response.status, code: p?.code, ...(p?.finalState === undefined ? {} : { finalState: p.finalState }) };
};
