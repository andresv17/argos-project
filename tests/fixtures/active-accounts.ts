/**
 * Arnés de cuentas ACTIVE (T1244, Feature 009, Fase 4, #18; ADR-009-10; REQ-APR9-004, NFR-009-002; SC-009-005).
 * Cuando T1246 haga que el registro nazca `PENDING` sin sesión, las ≈18 pruebas que registran y esperan sesión necesitan una cuenta `ACTIVE`. Este módulo la crea POR REPOSITORIO
 * (SQL sobre `users`, SQLite y PostgreSQL) sin pasar por la aprobación del portal, y NO cambia la política de registro: hoy el alta ya devuelve sesión y el helper es idempotente
 * (si el alta ya trajo sesión, no toca nada). T1246 amplió `UserAccount` con `accountStatus` (ausente = ACTIVE) y los tres motores lo guardan: la rama de memoria del arnés es `activateViaPorts`.
 */
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { isAccountStatusResult, type AccountStatusResult, type AuthenticatedSession } from '../../src/application/use-cases/auth-use-cases.ts';
import { openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

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

/** Estrecha el resultado de `LoginUseCase`/`ChooseGoogleUsernameUseCase` (unión con `AccountStatusResult` desde T1246) a una sesión; si no la hay, la prueba falla con el estado recibido. */
export function sessionOf(result: AuthenticatedSession | AccountStatusResult): AuthenticatedSession {
  if (isAccountStatusResult(result)) throw new Error(`se esperaba una sesión y llegó el estado ${result.accountStatus}`);
  return result;
}

/**
 * Rama de memoria (y de cualquier motor) del arnés, sin SQL: pasa a `ACTIVE` una cuenta ya creada borrándola y reinsertándola con el estado explícito dentro de UNA transacción
 * (`update` nunca modifica `account_status`; la decisión atómica es T1247). Solo para cuentas sin referencias (recién registradas en la prueba); devuelve el id de la cuenta.
 */
export async function activateViaPorts(uow: Pick<UnitOfWorkPort, 'runInTransaction'>, username: string): Promise<string> {
  return uow.runInTransaction(async (repositories) => {
    const account = await repositories.users.findByUsername(username);
    if (account === null) throw new Error(`activateViaPorts: no existe la cuenta ${username}`);
    await repositories.users.delete(account.id);
    const { accountStatus: _status, ...active } = account; // ausente = ACTIVE en los tres motores
    await repositories.users.insert(active);
    return account.id;
  });
}

/** Id de una cuenta por username (para las pruebas cuyo alta ya no devuelve el perfil). */
export async function accountIdOf(uow: Pick<UnitOfWorkPort, 'runInTransaction'>, username: string): Promise<string> {
  return uow.runInTransaction(async (repositories) => {
    const account = await repositories.users.findByUsername(username);
    if (account === null) throw new Error(`accountIdOf: no existe la cuenta ${username}`);
    return account.id;
  });
}

/** Activa una cuenta en un archivo SQLite que otro proceso de prueba (la app de producción compuesta) tiene abierto: abre su propia conexión, aplica `activateAccount` y la cierra. */
export async function activateInFile(databasePath: string, username: string, decidedAt: string = '2026-11-23T10:00:00.000Z'): Promise<void> {
  const db = openSqliteDatabase(databasePath);
  try {
    await activateAccount(sqliteRunner(db), 'sqlite', username, decidedAt);
  } finally {
    db.close();
  }
}
