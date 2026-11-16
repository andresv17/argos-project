/**
 * T422 (REQ-PG-002, INV-AUTH-003): repositorios de PostgreSQL, parte 1 (usuarios, sesiones, intentos de acceso, límites de
 * frecuencia y tokens de respaldo), verificados con un doble del cliente que registra cada sentencia (sin Postgres):
 * parámetros posicionales `$n`, valores nunca interpolados y orden de columnas. El módulo se importa de forma dinámica para
 * que cada prueba falle por separado mientras `postgres-repositories.ts` no exista (pruebas primero).
 * La suite de conformidad contra Postgres real se OMITE sin TEST_DATABASE_URL.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import type { UserAccount } from '../../../src/application/ports/repositories.port.ts';
import { fixtures } from '../../fixtures/application-harness.ts';

const MODULE_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const MODULE_URL = new URL(MODULE_PATH, import.meta.url);

type Row = Record<string, unknown>;
interface Reply {
  readonly rows?: Row[];
  readonly rowCount?: number | null;
}
interface Part1 {
  users: import('../../../src/application/ports/repositories.port.ts').UserRepositoryPort;
  sessions: import('../../../src/application/ports/repositories.port.ts').SessionRepositoryPort;
  loginAttempts: import('../../../src/application/ports/repositories.port.ts').LoginAttemptRepositoryPort;
  confirmationTokens: import('../../../src/application/ports/repositories.port.ts').ConfirmationTokenRepositoryPort;
  rateLimits: import('../../../src/application/ports/repositories.port.ts').RateLimitRepositoryPort;
}
interface RepositoriesModule {
  createPostgresRepositoriesPart1(client: unknown): Part1;
}
const load = async (): Promise<RepositoriesModule> => (await import(/* @vite-ignore */ MODULE_PATH)) as RepositoriesModule;

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/** Cliente doble: registra (sentencia, valores) y responde con la siguiente respuesta configurada (o vacía). */
function fakeClient(...replies: Reply[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let next = 0;
  return {
    calls,
    release: () => undefined,
    async query(text: string, values: unknown[] = []) {
      calls.push({ sql: norm(text), values });
      const reply = replies[next++] ?? {};
      return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? (reply.rows ?? []).length };
    },
  };
}
async function repos(...replies: Reply[]) {
  const client = fakeClient(...replies);
  const { createPostgresRepositoriesPart1 } = await load();
  return { client, r: createPostgresRepositoriesPart1(client) };
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const NOW = '2026-11-05T12:00:00.000Z';
const LATER = '2026-11-05T13:00:00.000Z';
const HOSTILE = "x'; DROP TABLE users; --";
const profile = fixtures.users[0] as unknown as Record<string, unknown>;
const ANDRES = { ...profile, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h-andres' } as unknown as UserAccount;
const { passwordHash: _hash, email: _email, preferredLanguage: _lang, timezone: _tz, ...ANDRES_DATA } = ANDRES;
const userRow = (over: Row = {}): Row => ({
  id: ANDRES.id,
  username: ANDRES.username,
  password_hash: 'h-andres',
  email: null,
  preferred_language: 'es',
  timezone: 'America/Bogota',
  data: ANDRES_DATA,
  ...over,
});
const SESSION = { userId: ANDRES.id, createdAt: NOW, lastActivityAt: NOW, revokedAt: null };
const SELECT_USER = 'SELECT id, username, password_hash, email, preferred_language, timezone, data FROM users';

/** Toda sentencia emitida usa solo `$1..$n` consecutivos y ningún valor aparece dentro del texto SQL. */
function expectParametrized(calls: ReadonlyArray<{ sql: string; values: unknown[] }>) {
  for (const { sql, values } of calls) {
    const used = [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    expect(used).toEqual(values.map((_, i) => i + 1));
    for (const value of values.flat()) if (typeof value === 'string' && value.length > 3) expect(sql).not.toContain(value);
  }
}

describe('usuarios (T422, REQ-PG-002, INV-AUTH-003)', () => {
  it('findById y findByUsername: SELECT con columnas en orden y un solo parámetro posicional; devuelve la cuenta con el hash', async () => {
    const { client, r } = await repos({ rows: [userRow()] }, { rows: [userRow()] }, { rows: [] });
    expect(await r.users.findById(ANDRES.id)).toEqual(ANDRES);
    expect(await r.users.findByUsername(ANDRES.username)).toEqual(ANDRES);
    expect(await r.users.findByUsername(HOSTILE)).toBeNull();
    expect(client.calls).toEqual([
      { sql: `${SELECT_USER} WHERE id = $1`, values: [ANDRES.id] },
      { sql: `${SELECT_USER} WHERE username = $1`, values: [ANDRES.username] },
      { sql: `${SELECT_USER} WHERE username = $1`, values: [HOSTILE] },
    ]);
    expectParametrized(client.calls);
  });

  it('listByIds: una sola consulta con ANY($1::text[]) y el arreglo como único valor', async () => {
    const { client, r } = await repos({ rows: [userRow()] });
    expect(await r.users.listByIds([ANDRES.id, 'otro'])).toEqual([ANDRES]);
    expect(client.calls).toEqual([{ sql: `${SELECT_USER} WHERE id = ANY($1::text[])`, values: [[ANDRES.id, 'otro']] }]);
  });

  it('insert: columnas id, username, password_hash, data, email, preferred_language, timezone; el hash nunca va en data (INV-AUTH-003)', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.users.insert(ANDRES);
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0]!;
    expect(call.sql).toBe(
      'INSERT INTO users (id, username, password_hash, data, email, preferred_language, timezone) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)',
    );
    expect(call.values.slice(0, 3)).toEqual([ANDRES.id, ANDRES.username, 'h-andres']);
    expect(call.values.slice(4)).toEqual([null, 'es', 'America/Bogota']);
    expect(JSON.parse(call.values[3] as string)).toEqual(ANDRES_DATA);
    expect(call.values[3]).not.toContain('h-andres');
    expectParametrized(client.calls);
  });

  it('insert rechaza un hash vacío y un perfil inválido sin emitir SQL', async () => {
    const { client, r } = await repos();
    await expect(r.users.insert({ ...ANDRES, passwordHash: '' })).rejects.toBeInstanceOf(DomainError);
    await expect(r.users.insert({ ...ANDRES, username: 42 } as unknown as UserAccount)).rejects.toBeInstanceOf(DomainError);
    expect(client.calls).toEqual([]);
  });

  it('update: SET password_hash, data, email, preferred_language, timezone WHERE id y username; 0 filas falla', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 0 });
    await r.users.update(ANDRES);
    expect(client.calls[0]!.sql).toBe(
      'UPDATE users SET password_hash = $1, data = $2::jsonb, email = $3, preferred_language = $4, timezone = $5 WHERE id = $6 AND username = $7',
    );
    expect(client.calls[0]!.values.filter((_, i) => i !== 1)).toEqual(['h-andres', null, 'es', 'America/Bogota', ANDRES.id, ANDRES.username]);
    await expect(r.users.update(ANDRES)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expectParametrized(client.calls);
  });

  it('delete: DELETE por id con parámetro', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.users.delete(HOSTILE);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM users WHERE id = $1', values: [HOSTILE] }]);
  });

  it('countReferences: una sentencia con las 9 tablas, el mismo $1 y el conteo bigint (texto) convertido a número', async () => {
    const { client, r } = await repos({ rows: [{ n: '4' }] });
    expect(await r.users.countReferences(ANDRES.id)).toBe(4);
    const call = client.calls[0]!;
    expect(call.values).toEqual([ANDRES.id]);
    const tables = [...call.sql.matchAll(/FROM (\w+) WHERE (\w+) = \$1/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(tables).toEqual([
      'users.id',
      'pets.owner_user_id',
      'households.owner_user_id',
      'household_members.user_id',
      'sessions.user_id',
      'household_invitations.invited_by_user_id',
      'household_invitations.invitee_user_id',
      'backup_confirmation_tokens.user_id',
      'rate_limit_events.subject_user_id',
    ]);
  });

  it('una fila corrupta (data que no coincide con las columnas, hash vacío o idioma desconocido) se rechaza con ERR-INTERNAL-UNEXPECTED', async () => {
    for (const bad of [userRow({ username: 'otro' }), userRow({ password_hash: '' }), userRow({ preferred_language: 'fr' })]) {
      const { r } = await repos({ rows: [bad] });
      await expect(r.users.findById(ANDRES.id)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
  });
});

describe('sesiones (T422, INV-AUTH-003, INV-AUTH2-002, REQ-AUTH2-003)', () => {
  it('findByToken: busca por SHA-256 del token (nunca el token) y valida data contra las columnas', async () => {
    const row = { user_id: SESSION.userId, created_at: NOW, last_activity_at: NOW, revoked_at: null, data: SESSION };
    const { client, r } = await repos({ rows: [row] }, { rows: [] }, { rows: [{ ...row, revoked_at: LATER }] });
    expect(await r.sessions.findByToken('token-secreto')).toEqual(SESSION);
    expect(await r.sessions.findByToken('otro')).toBeNull();
    await expect(r.sessions.findByToken('token-secreto')).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expect(client.calls[0]).toEqual({
      sql: 'SELECT user_id, created_at, last_activity_at, revoked_at, data FROM sessions WHERE token_hash = $1',
      values: [sha('token-secreto')],
    });
    expect(JSON.stringify(client.calls)).not.toContain('token-secreto');
  });

  it('save: UPSERT con token_hash, user_id, data, created_at, last_activity_at, revoked_at en ese orden', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.sessions.save('token-secreto', SESSION);
    const call = client.calls[0]!;
    expect(call.sql).toBe(
      'INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6) ' +
        'ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, data = EXCLUDED.data, created_at = EXCLUDED.created_at, ' +
        'last_activity_at = EXCLUDED.last_activity_at, revoked_at = EXCLUDED.revoked_at',
    );
    expect(call.values.filter((_, i) => i !== 2)).toEqual([sha('token-secreto'), SESSION.userId, NOW, NOW, null]);
    expect(JSON.parse(call.values[2] as string)).toEqual(SESSION);
    expect(JSON.stringify(call)).not.toContain('token-secreto');
    expectParametrized(client.calls);
  });

  it('save rechaza una sesión inválida sin emitir SQL', async () => {
    const { client, r } = await repos();
    await expect(r.sessions.save('t', { ...SESSION, createdAt: 'ayer' })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expect(client.calls).toEqual([]);
  });

  it('revokeOthers: un solo UPDATE por conjunto (sin N+1) que excluye el token conservado y devuelve rowCount', async () => {
    const { client, r } = await repos({ rowCount: 2 });
    expect(await r.sessions.revokeOthers(ANDRES.id, 'actual', LATER)).toBe(2);
    expect(client.calls).toEqual([
      {
        sql:
          "UPDATE sessions SET revoked_at = $3, data = jsonb_set(data, '{revokedAt}', to_jsonb($3::text)) " +
          'WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL',
        values: [ANDRES.id, sha('actual'), LATER],
      },
    ]);
  });

  it('deleteByUser: DELETE por user_id con parámetro', async () => {
    const { client, r } = await repos({ rowCount: 3 });
    await r.sessions.deleteByUser(HOSTILE);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM sessions WHERE user_id = $1', values: [HOSTILE] }]);
  });
});

describe('intentos de acceso (T422, INV-AUTH-005)', () => {
  it('listFailures lee failures (texto JSON) por username; sin fila devuelve []; JSON roto es corrupción', async () => {
    const { client, r } = await repos({ rows: [{ failures: JSON.stringify(['a', 'b']) }] }, { rows: [] }, { rows: [{ failures: '{no' }] });
    expect(await r.loginAttempts.listFailures('maria.v')).toEqual(['a', 'b']);
    expect(await r.loginAttempts.listFailures('nadie')).toEqual([]);
    await expect(r.loginAttempts.listFailures('roto')).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expect(client.calls[0]).toEqual({ sql: 'SELECT failures FROM login_attempts WHERE username = $1', values: ['maria.v'] });
  });

  it('replaceFailures: UPSERT (username, failures) con el arreglo serializado; deleteFailures: DELETE por username', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 1 });
    await r.loginAttempts.replaceFailures('maria.v', [NOW, LATER]);
    await r.loginAttempts.deleteFailures(HOSTILE);
    expect(client.calls).toEqual([
      {
        sql: 'INSERT INTO login_attempts (username, failures) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET failures = EXCLUDED.failures',
        values: ['maria.v', JSON.stringify([NOW, LATER])],
      },
      { sql: 'DELETE FROM login_attempts WHERE username = $1', values: [HOSTILE] },
    ]);
  });
});

describe('tokens de confirmación de respaldo (T422, REQ-ACC-002, INV-AUTH-003)', () => {
  it('replaceForUser: UPSERT por user_id que reinicia used_at; solo guarda el hash', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.confirmationTokens.replaceForUser(ANDRES.id, sha('t'), NOW, LATER);
    expect(client.calls).toEqual([
      {
        sql:
          'INSERT INTO backup_confirmation_tokens (user_id, token_hash, created_at, expires_at, used_at) VALUES ($1, $2, $3, $4, NULL) ' +
          'ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at, used_at = NULL',
        values: [ANDRES.id, sha('t'), NOW, LATER],
      },
    ]);
  });

  it('consume: UPDATE condicional de un solo uso con $1 (ahora) reutilizado; true solo si rowCount es 1', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 0 });
    expect(await r.confirmationTokens.consume(ANDRES.id, sha('t'), NOW)).toBe(true);
    expect(await r.confirmationTokens.consume(ANDRES.id, sha('t'), NOW)).toBe(false);
    expect(client.calls[0]).toEqual({
      sql: 'UPDATE backup_confirmation_tokens SET used_at = $1 WHERE token_hash = $2 AND user_id = $3 AND used_at IS NULL AND expires_at > $1',
      values: [NOW, sha('t'), ANDRES.id],
    });
    expectParametrized(client.calls);
  });

  it('deleteForUser: DELETE por user_id', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.confirmationTokens.deleteForUser(ANDRES.id);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM backup_confirmation_tokens WHERE user_id = $1', values: [ANDRES.id] }]);
  });
});

describe('límites de frecuencia (T422, ERR-RATE-LIMITED)', () => {
  it('record inserta (id, scope, subject_user_id, occurred_at)', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.rateLimits.record({ id: 'e1', scope: 'EXPORT', userId: ANDRES.id, occurredAt: NOW });
    expect(client.calls).toEqual([
      { sql: 'INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES ($1, $2, $3, $4)', values: ['e1', 'EXPORT', ANDRES.id, NOW] },
    ]);
  });

  it('countSince: ventana abierta a la izquierda (>) y conteo bigint (texto) convertido a número', async () => {
    const { client, r } = await repos({ rows: [{ n: '3' }] });
    expect(await r.rateLimits.countSince('INVITE', ANDRES.id, NOW)).toBe(3);
    expect(client.calls).toEqual([
      {
        sql: 'SELECT COUNT(*) AS n FROM rate_limit_events WHERE scope = $1 AND subject_user_id = $2 AND occurred_at > $3',
        values: ['INVITE', ANDRES.id, NOW],
      },
    ]);
  });

  it('deleteForUser: DELETE por subject_user_id', async () => {
    const { client, r } = await repos({ rowCount: 2 });
    await r.rateLimits.deleteForUser(ANDRES.id);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM rate_limit_events WHERE subject_user_id = $1', values: [ANDRES.id] }]);
  });
});

describe('código fuente (T422, INV-ARCH-006, T464)', () => {
  const source = () => readFileSync(MODULE_URL, 'utf8');
  it('no lee process.env ni consulta schema_migrations', () => {
    expect(source()).not.toMatch(/process\.env/);
    expect(source()).not.toContain('schema_migrations');
  });
  it('ninguna sentencia interpola valores: el primer argumento de cada client.query es literal, la constante de columnas o COUNT_REFERENCES', () => {
    // Solo la sección de la parte 1: las partes 2 y 3 (T423, T424) tienen su propia verificación y constantes (nombres de tabla).
    const part1 = source().split('/** Tabla de cada módulo de registros')[0]!;
    const firstArguments = [...part1.matchAll(/client\.query\(\s*(`[^`]*`|'[^']*'|\w+)/g)].map((m) => m[1]!);
    expect(firstArguments.length).toBe(20);
    for (const argument of firstArguments) {
      const interpolations = [...argument.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
      expect(interpolations.filter((expr) => expr !== 'USER_COLUMNS')).toEqual([]);
      if (/^\w+$/.test(argument)) expect(argument).toBe('COUNT_REFERENCES');
    }
  });
});
