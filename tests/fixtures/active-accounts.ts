/**
 * Arnés de cuentas ACTIVE (T1244, Feature 009, Fase 4, #18; ADR-009-10; REQ-APR9-004, NFR-009-002; SC-009-005).
 * Cuando T1246 haga que el registro nazca `PENDING` sin sesión, las ≈18 pruebas que registran y esperan sesión necesitan una cuenta `ACTIVE`. Este módulo la crea POR REPOSITORIO
 * (SQL sobre `users`, SQLite y PostgreSQL) sin pasar por la aprobación del portal, y NO cambia la política de registro: hoy el alta ya devuelve sesión y el helper es idempotente
 * (si el alta ya trajo sesión, no toca nada). El motor de MEMORIA no guarda el estado todavía: T1246 amplía `UserAccount`/`MemoryState` y la rama de memoria del arnés.
 */
import type { SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/** `admin_id` sintético (UUID v4, 36 caracteres) que firma las aprobaciones del arnés; no existe en `admin_identities` (sin clave foránea). */
export const HARNESS_ADMIN_ID = '00000000-0000-4000-8000-0000000000aa';

export type SqlDialect = 'sqlite' | 'postgres';
/** Ejecutor SQL crudo: SQLite usa `?` y PostgreSQL `$n`. */
export type SqlRunner = (sql: string, values: readonly unknown[]) => Promise<unknown>;

export const sqliteRunner =
  (db: SqliteDatabase): SqlRunner =>
  async (sql, values) => {
    db.prepare(sql).run(...(values as never[]));
  };

const placeholder = (dialect: SqlDialect, n: number): string => (dialect === 'sqlite' ? '?' : `$${n}`);

/** Pasa la cuenta a `ACTIVE` con decisión del arnés. Idempotente; la búsqueda no distingue mayúsculas (como `findByUsername`); una cuenta inexistente no falla. */
export async function activateAccount(run: SqlRunner, dialect: SqlDialect, username: string, decidedAt: string, decidedBy: string = HARNESS_ADMIN_ID): Promise<void> {
  const p = (n: number) => placeholder(dialect, n);
  await run(`UPDATE users SET account_status = 'ACTIVE', decided_at = ${p(1)}, decided_by = ${p(2)} WHERE lower(username) = lower(${p(3)}) AND account_status <> 'ACTIVE'`, [decidedAt, decidedBy, username]);
}

/** Pasa a `PENDING` una cuenta ya creada (para probar la política de T1245/T1246 sin pasar por el registro). */
export async function markPending(run: SqlRunner, dialect: SqlDialect, username: string): Promise<void> {
  await run(`UPDATE users SET account_status = 'PENDING', decided_at = NULL, decided_by = NULL WHERE lower(username) = lower(${placeholder(dialect, 1)})`, [username]);
}

export interface RegisteringApi {
  readonly db: SqliteDatabase;
  call(method: string, url: string, options?: { readonly body?: unknown; readonly cookie?: string | null; readonly contract?: boolean }): Promise<{ readonly status: number; readonly cookie: string | null; readonly json: unknown }>;
}

/**
 * Registra por HTTP y deja la cuenta ACTIVE con sesión: si el alta ya devolvió cookie (política actual) la entrega tal cual; si devuelve estado sin cookie (política de T1246) activa por SQL y
 * entra con las mismas credenciales. `registered` es la respuesta del alta (para las pruebas que verifican su cuerpo).
 */
export async function registerActiveAccount(
  api: RegisteringApi,
  body: { readonly username: string; readonly password: string; readonly [key: string]: unknown },
  decidedAt: string = '2026-11-23T10:00:00.000Z',
): Promise<{ registered: Awaited<ReturnType<RegisteringApi['call']>>; cookie: string }> {
  const registered = await api.call('POST', '/api/auth/register', { body, contract: false }); // la conformidad del alta la prueban T1245/T1246; el arnés solo necesita la cuenta y la sesión
  if (registered.cookie !== null) return { registered, cookie: registered.cookie };
  await activateAccount(sqliteRunner(api.db), 'sqlite', body.username, decidedAt);
  const login = await api.call('POST', '/api/auth/login', { body: { username: body.username, password: body.password } });
  if (login.cookie === null) throw new Error(`registerActiveAccount: el inicio de sesión de ${body.username} no devolvió cookie (estado ${login.status})`);
  return { registered, cookie: login.cookie };
}
