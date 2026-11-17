import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maintenanceCutoffs, runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, MARIA } from '../../fixtures/application-harness.ts';
import { ARGOS_ID } from '../api/api-fixtures.ts';

/**
 * T266 [US6] — mantenimiento ADR-002-14 sobre SQLite real (REQ-AUD-001, INV-AUD-001): umbrales de retención,
 * solo conteos y ninguna fila de auditoría nueva. El reloj fijo es 2026-11-05T12:00:00.000Z.
 */
const NOW = '2026-11-05T12:00:00.000Z';
const HID = 'b0000000-0000-4000-8000-000000000001';
let db: SqliteDatabase;
let uow: SqliteUnitOfWork;

const clock = () => new FixedClockAdapter('2026-11-05', NOW);
const total = (table: string) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;

beforeEach(() => {
  db = openSqliteDatabase(':memory:');
  uow = new SqliteUnitOfWork(db);
});
afterEach(() => db.close());

describe('umbrales de retención (ADR-002-14)', () => {
  it('[REQ-AUD-001] el umbral de auditoría son 24 meses de calendario respecto del reloj y respeta el fin de mes', () => {
    expect(maintenanceCutoffs(NOW)).toEqual({ now: NOW, auditBefore: '2024-11-05T12:00:00.000Z' });
    expect(maintenanceCutoffs('2026-02-28T00:00:00.000Z').auditBefore).toBe('2024-02-28T00:00:00.000Z');
    expect(maintenanceCutoffs('2028-02-29T00:00:00.000Z').auditBefore).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('runMaintenance sobre SQLite (ADR-002-14)', () => {
  it('[REQ-AUD-001][INV-AUD-001] purga lo vencido, conserva lo vigente, devuelve solo conteos y no escribe auditoría', async () => {
    db.pragma('foreign_keys = OFF');
    const session = (hash: string, created: string, active: string, revoked: string | null) =>
      db.prepare('INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)').run(hash, ANDRES, '{}', created, active, revoked);
    session('revoked-old', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-20T00:00:00.000Z');
    session('revoked-recent', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z');
    session('absolute-expired-old', '2026-10-20T00:00:00.000Z', '2026-11-05T11:00:00.000Z', null);
    session('absolute-expired-recent', '2026-10-30T00:00:00.000Z', '2026-11-05T11:00:00.000Z', null);
    session('idle-expired-old', '2026-11-05T00:00:00.000Z', '2026-10-29T11:00:00.000Z', null);
    session('live', '2026-11-05T10:00:00.000Z', '2026-11-05T11:50:00.000Z', null);
    const token = (user: string, expires: string) =>
      db.prepare('INSERT INTO backup_confirmation_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(user, `h-${user}`, '2026-11-01T00:00:00.000Z', expires);
    token(ANDRES, '2026-11-05T11:59:59.999Z');
    token(MARIA, '2026-11-05T12:00:00.001Z');
    db.prepare('INSERT INTO households (id, owner_user_id, data) VALUES (?, ?, ?)').run(HID, ANDRES, '{}');
    const member = (id: string, status: string, updatedAt: string) =>
      db.prepare('INSERT INTO household_members (membership_id, household_id, user_id, status, first_joined_at, data) VALUES (?, ?, ?, ?, ?, ?)').run(id, HID, `u-${id}`, status, null, JSON.stringify({ updatedAt }));
    member('m-left-old', 'LEFT', '2026-08-06T12:00:00.000Z');
    member('m-removed-recent', 'REMOVED', '2026-08-08T12:00:00.000Z');
    member('m-active-old', 'ACTIVE', '2025-01-01T00:00:00.000Z');
    const invitation = (id: string, status: string, created: string, responded: string | null) =>
      db.prepare('INSERT INTO household_invitations (id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)').run(id, HID, id, ANDRES, 'READER', status, created, responded);
    invitation('i-declined-old', 'DECLINED', '2026-01-01T00:00:00.000Z', '2026-08-06T12:00:00.000Z');
    invitation('i-cancelled-recent', 'CANCELLED', '2026-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    invitation('i-invited-old', 'INVITED', '2025-01-01T00:00:00.000Z', null);
    const audit = (id: string, timestamp: string) =>
      db.prepare('INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)').run(id, timestamp, ANDRES, 'UPDATE', 'PET', ARGOS_ID);
    audit('a-old', '2024-11-05T11:59:59.999Z');
    audit('a-edge', '2024-11-05T12:00:00.000Z');
    const auditBefore = total('audit_log');

    const result = await runMaintenance({ uow, clock: clock() });

    expect(result).toEqual({ sessionsPurged: 3, confirmationTokensPurged: 1, membershipsPurged: 1, invitationsPurged: 1, auditRowsPurged: 1 });
    expect(Object.values(result).every((v) => typeof v === 'number')).toBe(true);
    expect(db.prepare('SELECT token_hash FROM sessions ORDER BY token_hash').pluck().all()).toEqual(['absolute-expired-recent', 'live', 'revoked-recent']);
    expect(db.prepare('SELECT user_id FROM backup_confirmation_tokens').pluck().all()).toEqual([MARIA]);
    expect(db.prepare('SELECT membership_id FROM household_members ORDER BY membership_id').pluck().all()).toEqual(['m-active-old', 'm-removed-recent']);
    expect(db.prepare('SELECT id FROM household_invitations ORDER BY id').pluck().all()).toEqual(['i-cancelled-recent', 'i-invited-old']);
    expect(db.prepare("SELECT id FROM audit_log WHERE id LIKE 'a-%' ORDER BY id").pluck().all()).toEqual(['a-edge']);
    expect(db.prepare("SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'MIGRATION'").pluck().get()).toBe(1);
    expect(total('audit_log')).toBe(auditBefore - 1);
  });

  it('[ADR-002-14] una segunda pasada no encuentra nada que purgar y un almacenamiento sin purga devuelve ceros', async () => {
    expect(await runMaintenance({ uow, clock: clock() })).toEqual({ sessionsPurged: 0, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 0 });
    const withoutPurge = { runInTransaction: uow.runInTransaction.bind(uow) };
    expect(Object.values(await runMaintenance({ uow: withoutPurge, clock: clock() }))).toEqual([0, 0, 0, 0, 0]);
  });
});
