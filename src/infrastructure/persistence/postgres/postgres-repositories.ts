/**
 * Repositorios PostgreSQL detrás de los puertos de aplicación (misma firma que el adaptador SQLite). Solo se usan dentro de
 * `PostgresUnitOfWork.runInTransaction`, sobre el cliente de esa transacción.
 * - PARTE 1 (T422): usuarios, sesiones, intentos de acceso, límites de frecuencia y tokens de respaldo.
 *   Las partes 2 (T423) y 3 (T424) añaden el resto de `RepositorySet`.
 * - SQL siempre parametrizado con `$n` posicionales: ningún valor se interpola en el texto de la sentencia. Las únicas plantillas
 *   componen constantes SQL (la lista de columnas de `users`).
 * - Cada fila guarda el objeto del contrato en `data` (JSONB) y repite en columnas las claves y referencias. Frontera validada
 *   (INV-ARCH-004): al escribir y al leer el objeto se valida y las columnas deben coincidir con `data`; un dato inválido o
 *   corrupto produce ERR-INTERNAL-UNEXPECTED controlado, igual que en SQLite.
 * - `pg` entrega JSONB ya parseado y COUNT(*) como bigint en texto: ambos se normalizan aquí.
 * - INV-AUTH-003: el hash de la contraseña va en su columna, nunca en `data`; el token de sesión se guarda como SHA-256.
 * - Sin lectura del entorno (INV-ARCH-006) ni consulta a la tabla de migraciones (T464).
 *
 * @implements REQ-PG-002, INV-ARCH-004, INV-AUTH-003, INV-AUTH2-002, REQ-AUTH2-003, REQ-ACC-001, REQ-ACC-002, ERR-INTERNAL-UNEXPECTED
 */

import { DomainError, validateUserPublicProfile, type UserPublicProfile } from '../../../generated/index.ts';
import type {
  ConfirmationTokenRepositoryPort,
  LoginAttemptRepositoryPort,
  RateLimitRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import { corruptData, isSessionRecord, sessionTokenHash } from '../sqlite/sqlite-repositories.ts';
import type { PoolClientLike } from './postgres-database.ts';

type Check<T> = (value: unknown) => value is T;
type Row = Record<string, unknown>;

/** Serializa un objeto validado; si no cumple el contrato, no se escribe. */
function encode<T>(table: string, key: string, value: T, check: Check<T>): string {
  if (!check(value)) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Objeto inválido para ${table} (${key}); no se guarda.`);
  return JSON.stringify(value);
}

/** Valida `data` (JSONB ya parseado por `pg`, o texto) y comprueba que las columnas coinciden con el objeto. */
function decode<T>(table: string, key: string, raw: unknown, check: Check<T>, columns: (value: T) => boolean = () => true): T {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw corruptData(table, key);
    }
  }
  if (!check(value) || !columns(value)) throw corruptData(table, key);
  return value;
}

const isStringArray: Check<string[]> = (value): value is string[] => Array.isArray(value) && value.every((x) => typeof x === 'string');

/** COUNT(*) llega como bigint en texto. */
const count = (row: Row | undefined): number => Number(row?.['n'] ?? 0);

const USER_COLUMNS = 'SELECT id, username, password_hash, email, preferred_language, timezone, data FROM users';
/** `$1` se reutiliza en las 9 subconsultas: un solo parámetro posicional. */
const COUNT_REFERENCES =
  'SELECT (SELECT COUNT(*) FROM users WHERE id = $1)' +
  ' + (SELECT COUNT(*) FROM pets WHERE owner_user_id = $1)' +
  ' + (SELECT COUNT(*) FROM households WHERE owner_user_id = $1)' +
  ' + (SELECT COUNT(*) FROM household_members WHERE user_id = $1)' +
  ' + (SELECT COUNT(*) FROM sessions WHERE user_id = $1)' +
  ' + (SELECT COUNT(*) FROM household_invitations WHERE invited_by_user_id = $1)' +
  ' + (SELECT COUNT(*) FROM household_invitations WHERE invitee_user_id = $1)' +
  ' + (SELECT COUNT(*) FROM backup_confirmation_tokens WHERE user_id = $1)' +
  ' + (SELECT COUNT(*) FROM rate_limit_events WHERE subject_user_id = $1) AS n';

/** @implements INV-ARCH-004, INV-AUTH-003, REQ-ACC-001, REQ-ACC-002, ERR-INTERNAL-UNEXPECTED */
function userRepository(client: PoolClientLike): UserRepositoryPort {
  const toAccount = (row: Row): UserAccount => {
    const id = String(row['id']);
    const profile = decode('users', id, row['data'], validateUserPublicProfile, (u) => u.id === row['id'] && u.username === row['username']);
    const passwordHash = row['password_hash'];
    const language = row['preferred_language'];
    if (typeof passwordHash !== 'string' || passwordHash === '') throw corruptData('users', id);
    if (language !== 'es' && language !== 'en' && language !== 'pt') throw corruptData('users', id);
    return { ...profile, email: row['email'] as string | null, preferredLanguage: language, timezone: String(row['timezone']), passwordHash };
  };
  const split = (user: UserAccount) => {
    const { passwordHash, email, preferredLanguage, timezone, ...profile } = user;
    if (passwordHash === '') throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Usuario sin hash de contraseña (${user.id}); no se guarda.`);
    return { passwordHash, email, preferredLanguage, timezone, data: encode<UserPublicProfile>('users', user.id, profile, validateUserPublicProfile) };
  };
  return {
    async findById(userId) {
      const { rows } = await client.query(`${USER_COLUMNS} WHERE id = $1`, [userId]);
      return rows[0] === undefined ? null : toAccount(rows[0]);
    },
    async findByUsername(username) {
      const { rows } = await client.query(`${USER_COLUMNS} WHERE username = $1`, [username]);
      return rows[0] === undefined ? null : toAccount(rows[0]);
    },
    async listByIds(userIds) {
      const { rows } = await client.query(`${USER_COLUMNS} WHERE id = ANY($1::text[])`, [[...userIds]]);
      return rows.map(toAccount);
    },
    async insert(user) {
      const { passwordHash, email, preferredLanguage, timezone, data } = split(user);
      await client.query(
        'INSERT INTO users (id, username, password_hash, data, email, preferred_language, timezone) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)',
        [user.id, user.username, passwordHash, data, email, preferredLanguage, timezone],
      );
    },
    async update(user) {
      const { passwordHash, email, preferredLanguage, timezone, data } = split(user);
      const result = await client.query(
        'UPDATE users SET password_hash = $1, data = $2::jsonb, email = $3, preferred_language = $4, timezone = $5 WHERE id = $6 AND username = $7',
        [passwordHash, data, email, preferredLanguage, timezone, user.id, user.username],
      );
      if (result.rowCount !== 1) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `El usuario ${user.id} no existe; no se actualiza.`);
    },
    async delete(userId) {
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    },
    async countReferences(userId) {
      const { rows } = await client.query(COUNT_REFERENCES, [userId]);
      return count(rows[0]);
    },
  };
}

/** @implements INV-AUTH-003, INV-AUTH2-002, REQ-AUTH2-003, ERR-INTERNAL-UNEXPECTED */
function sessionRepository(client: PoolClientLike): SessionRepositoryPort {
  return {
    async findByToken(token) {
      const hash = sessionTokenHash(token);
      const { rows } = await client.query('SELECT user_id, created_at, last_activity_at, revoked_at, data FROM sessions WHERE token_hash = $1', [hash]);
      const row = rows[0];
      if (row === undefined) return null;
      return decode(
        'sessions',
        hash.slice(0, 12),
        row['data'],
        isSessionRecord,
        (s) => s.userId === row['user_id'] && s.createdAt === row['created_at'] && s.lastActivityAt === row['last_activity_at'] && s.revokedAt === row['revoked_at'],
      );
    },
    async save(token, session) {
      const hash = sessionTokenHash(token);
      await client.query(
        `INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6)
         ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, data = EXCLUDED.data, created_at = EXCLUDED.created_at,
           last_activity_at = EXCLUDED.last_activity_at, revoked_at = EXCLUDED.revoked_at`,
        [hash, session.userId, encode('sessions', hash.slice(0, 12), session, isSessionRecord), session.createdAt, session.lastActivityAt, session.revokedAt],
      );
    },
    async revokeOthers(userId, keepToken, nowIsoTimestamp) {
      // Un solo UPDATE por conjunto: `revoked_at` y `data.revokedAt` cambian juntos y la conservada queda fuera (REQ-AUTH2-003).
      const result = await client.query(
        `UPDATE sessions SET revoked_at = $3, data = jsonb_set(data, '{revokedAt}', to_jsonb($3::text))
         WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
        [userId, sessionTokenHash(keepToken), nowIsoTimestamp],
      );
      return result.rowCount ?? 0;
    },
    async deleteByUser(userId) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    },
  };
}

/** @implements INV-AUTH-005, ERR-INTERNAL-UNEXPECTED */
function loginAttemptRepository(client: PoolClientLike): LoginAttemptRepositoryPort {
  return {
    async listFailures(username) {
      const { rows } = await client.query('SELECT failures FROM login_attempts WHERE username = $1', [username]);
      return rows[0] === undefined ? [] : decode('login_attempts', username, rows[0]['failures'], isStringArray);
    },
    async replaceFailures(username, failures) {
      await client.query(
        'INSERT INTO login_attempts (username, failures) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET failures = EXCLUDED.failures',
        [username, encode('login_attempts', username, [...failures], isStringArray)],
      );
    },
    async deleteFailures(username) {
      await client.query('DELETE FROM login_attempts WHERE username = $1', [username]);
    },
  };
}

/** @implements REQ-ACC-002, INV-AUTH-003 */
function confirmationTokenRepository(client: PoolClientLike): ConfirmationTokenRepositoryPort {
  return {
    async replaceForUser(userId, tokenHash, createdAt, expiresAt) {
      await client.query(
        `INSERT INTO backup_confirmation_tokens (user_id, token_hash, created_at, expires_at, used_at) VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at, used_at = NULL`,
        [userId, tokenHash, createdAt, expiresAt],
      );
    },
    async consume(userId, tokenHash, nowIsoTimestamp) {
      const result = await client.query(
        'UPDATE backup_confirmation_tokens SET used_at = $1 WHERE token_hash = $2 AND user_id = $3 AND used_at IS NULL AND expires_at > $1',
        [nowIsoTimestamp, tokenHash, userId],
      );
      return result.rowCount === 1;
    },
    async deleteForUser(userId) {
      await client.query('DELETE FROM backup_confirmation_tokens WHERE user_id = $1', [userId]);
    },
  };
}

/** @implements ERR-RATE-LIMITED */
function rateLimitRepository(client: PoolClientLike): RateLimitRepositoryPort {
  return {
    async record(event) {
      await client.query('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES ($1, $2, $3, $4)', [
        event.id,
        event.scope,
        event.userId,
        event.occurredAt,
      ]);
    },
    async countSince(scope, userId, sinceExclusive) {
      const { rows } = await client.query(
        'SELECT COUNT(*) AS n FROM rate_limit_events WHERE scope = $1 AND subject_user_id = $2 AND occurred_at > $3',
        [scope, userId, sinceExclusive],
      );
      return count(rows[0]);
    },
    async deleteForUser(userId) {
      await client.query('DELETE FROM rate_limit_events WHERE subject_user_id = $1', [userId]);
    },
  };
}

/** Repositorios de la parte 1 (T422) sobre el cliente de la transacción; T423 y T424 completan `RepositorySet`. */
export type PostgresRepositoriesPart1 = Pick<RepositorySet, 'users' | 'sessions' | 'loginAttempts' | 'confirmationTokens' | 'rateLimits'>;

/** @implements REQ-PG-002, INV-ARCH-005 */
export function createPostgresRepositoriesPart1(client: PoolClientLike): PostgresRepositoriesPart1 {
  return {
    users: userRepository(client),
    sessions: sessionRepository(client),
    loginAttempts: loginAttemptRepository(client),
    confirmationTokens: confirmationTokenRepository(client),
    rateLimits: rateLimitRepository(client),
  };
}
