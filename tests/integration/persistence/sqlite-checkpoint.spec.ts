import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountUseCase } from '../../../src/application/use-cases/account-use-cases.ts';
import { CONFIRMATION_PHRASE } from '../../../src/domain/account/account-deletion-guards.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { createDeps } from '../../fixtures/application-harness.ts';
import { AUDIT_SECRET_HEX, hmacHex } from '../../fixtures/audit-fixtures.ts';
import { ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, identityState } from '../../fixtures/identity-fixtures.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

/**
 * T265 (H-2/H-3): checkpointAfterCommit sobre una base SQLite en archivo (ADR-002-13, plan.md:99).
 * El WAL se trunca tras eliminar la cuenta; busy !== 0 se reintenta una vez; el aviso no lleva identificadores;
 * un fallo del checkpoint no revierte la eliminación.
 */
const EMAIL = 'elena.privada@example.test';
const WARNING = 'No se pudo truncar el WAL';

let dir: string;
let dbPath: string;
let db: SqliteDatabase;
let uow: SqliteUnitOfWork;
let useCase: DeleteAccountUseCase;
let deps: ReturnType<typeof createDeps>;

const walSize = () => (existsSync(`${dbPath}-wal`) ? statSync(`${dbPath}-wal`).size : 0);
const accountRows = () => (db.prepare('SELECT COUNT(*) FROM users WHERE id = ?').pluck().get(ELENA) as number);

async function deleteElena(): Promise<204> {
  await uow.runInTransaction(async (r) => r.sessions.save('ses', { userId: ELENA, createdAt: REFERENCE_NOW, lastActivityAt: REFERENCE_NOW, revokedAt: null }));
  const { token } = await uow.runInTransaction((r) => deps.backupTokens.issue(r, ELENA, REFERENCE_NOW));
  return useCase.execute(ELENA, 'ses', { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['elena.solo']!, backupConfirmationToken: token });
}

/** Simula el resultado de wal_checkpoint para el truncado; el resto de pragmas pasa al original. */
function simulateCheckpoint(results: Array<{ busy: number } | Error>) {
  const original = db.pragma.bind(db);
  const calls: string[] = [];
  vi.spyOn(db, 'pragma').mockImplementation(((source: string, options?: unknown) => {
    if (!source.startsWith('wal_checkpoint')) return original(source, options as never);
    calls.push(source);
    const next = results[Math.min(calls.length - 1, results.length - 1)]!;
    if (next instanceof Error) throw next;
    return [{ busy: next.busy, log: 0, checkpointed: 0 }];
  }) as never);
  return calls;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'argos-checkpoint-'));
  dbPath = join(dir, 'argos.db');
  db = openSqliteDatabase(dbPath);
  uow = new SqliteUnitOfWork(db);
  const state = identityState();
  state.users = state.users.map((u) => (u.id === ELENA ? { ...u, email: EMAIL } : u));
  await seedSqlite(uow, state);
  const clock = new FixedClockAdapter();
  clock.setClock(REFERENCE_TODAY, REFERENCE_NOW);
  deps = createDeps(uow, clock, new SpyPasswordHasher());
  useCase = new DeleteAccountUseCase(deps);
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('checkpointAfterCommit de SqliteUnitOfWork con base en archivo (T265, ADR-002-13)', () => {
  it('[REQ-ACC-002][ADR-002-13] tras eliminar la cuenta el archivo -wal queda truncado (0 bytes) y la cuenta no existe', async () => {
    expect(walSize()).toBeGreaterThan(0);
    expect(await deleteElena()).toBe(204);
    expect(accountRows()).toBe(0);
    expect(walSize()).toBe(0);
  });

  it('[ADR-002-13] con busy simulado en el primer intento se reintenta exactamente una vez y, si el segundo sale bien, no hay aviso', async () => {
    const calls = simulateCheckpoint([{ busy: 1 }, { busy: 0 }]);
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    expect(await deleteElena()).toBe(204);
    expect(calls).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('[ADR-002-13] con busy persistente hay solo 2 intentos y un único aviso, sin userId, seudónimo ni email', async () => {
    const calls = simulateCheckpoint([{ busy: 1 }]);
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    expect(await deleteElena()).toBe(204);
    expect(calls).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(warn.mock.calls);
    expect(text).toContain(WARNING);
    const pseudonym = deps.auditPseudonym.hmacUserId(ELENA, AUDIT_SECRET_HEX);
    expect(pseudonym).toBe(hmacHex(ELENA));
    for (const secret of [ELENA, pseudonym, EMAIL, 'elena.solo']) expect(text).not.toContain(secret);
  });

  it('[REQ-ACC-002][ADR-002-13] si el checkpoint lanza una excepción persistente, la eliminación se mantiene: 204, cuenta borrada y fila de auditoría confirmada', async () => {
    const calls = simulateCheckpoint([new Error('disk I/O error')]);
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    expect(await deleteElena()).toBe(204);
    expect(calls).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(accountRows()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'ACCOUNT_DELETE'").pluck().get()).toBe(1);
  });
});
