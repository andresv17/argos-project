/**
 * T424 (REQ-PG-002, INV-HOUSE2-001, INV-HOUSE-003, REQ-AUD-001): repositorios de PostgreSQL, parte 3 (hogares, membresías,
 * invitaciones, asignaciones y auditoría) y la fábrica compuesta `createPostgresRepositories` (las 3 partes = RepositorySet),
 * verificados con un doble del cliente: SQL parametrizado `$n`, orden de columnas, un solo propietario por hogar (rol y
 * bandera viajan juntos; el índice parcial lo impone) y una sola invitación abierta (23505 propagada). El módulo se importa de
 * forma dinámica para que cada prueba falle por separado mientras falte la parte 3 (pruebas primero).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DomainError, type AuditEntry, type Household } from '../../../src/generated/index.ts';
import type {
  AuditLogRepositoryPort,
  HouseholdRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
  PetAssignmentRecord,
  PetAssignmentRepositoryPort,
} from '../../../src/application/ports/repositories.port.ts';
import type { LegacyHouseholdMember } from '../../../src/domain/households/household-policies.ts';
import { HOUSEHOLD, MEMBERSHIPS } from '../../fixtures/application-harness.ts';
import { expectParametrized, fakeClient, type Reply } from '../../fixtures/pg-fake-client.ts';

const MODULE_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
interface Part3 {
  households: HouseholdRepositoryPort;
  invitations: InvitationRepositoryPort;
  assignments: PetAssignmentRepositoryPort;
  auditLog: AuditLogRepositoryPort;
}
interface Module {
  createPostgresRepositoriesPart3(client: unknown): Part3;
  createPostgresRepositories(client: unknown): Record<string, unknown>;
}
const load = async () => (await import(/* @vite-ignore */ MODULE_PATH)) as Module;
async function repos(...replies: Reply[]) {
  const client = fakeClient(...replies);
  const { createPostgresRepositoriesPart3 } = await load();
  return { client, r: createPostgresRepositoriesPart3(client) };
}

const HOSTILE = "x'; DROP TABLE households; --";
const OWNER = MEMBERSHIPS[0] as LegacyHouseholdMember;
const MEMBER = MEMBERSHIPS[1] as LegacyHouseholdMember;
const MEMBER_COLS = 'membership_id, household_id, user_id, status, first_joined_at, data';
const memberRow = (m: LegacyHouseholdMember, over: Record<string, unknown> = {}) => ({
  membership_id: m.membershipId,
  household_id: m.householdId,
  user_id: m.userId,
  status: m.status,
  first_joined_at: m.firstJoinedAt,
  data: m,
  ...over,
});

describe('hogares (T424, REQ-PG-002, INV-HOUSE-003, INV-HOUSE2-001)', () => {
  it('findById: SELECT id, owner_user_id, data con un parámetro; contrasta columnas con data; null sin fila', async () => {
    const row = { id: HOUSEHOLD.id, owner_user_id: HOUSEHOLD.ownerUserId, data: HOUSEHOLD };
    const { client, r } = await repos({ rows: [row] }, { rows: [] }, { rows: [{ ...row, owner_user_id: 'otro' }] });
    expect(await r.households.findById(HOUSEHOLD.id)).toEqual(HOUSEHOLD);
    expect(await r.households.findById(HOSTILE)).toBeNull();
    await expect(r.households.findById(HOUSEHOLD.id)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expect(client.calls[0]).toEqual({ sql: 'SELECT id, owner_user_id, data FROM households WHERE id = $1', values: [HOUSEHOLD.id] });
    expectParametrized(client.calls);
  });

  it('insert: columnas id, owner_user_id, data; rechaza un hogar inválido sin emitir SQL', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.households.insert(HOUSEHOLD);
    expect(client.calls[0]!.sql).toBe('INSERT INTO households (id, owner_user_id, data) VALUES ($1, $2, $3::jsonb)');
    expect(client.calls[0]!.values.filter((_, i) => i !== 2)).toEqual([HOUSEHOLD.id, HOUSEHOLD.ownerUserId]);
    expect(JSON.parse(client.calls[0]!.values[2] as string)).toEqual(HOUSEHOLD);
    const bad = await repos();
    await expect(bad.r.households.insert({ ...HOUSEHOLD, name: 7 } as unknown as Household)).rejects.toBeInstanceOf(DomainError);
    expect(bad.client.calls).toEqual([]);
  });

  it('deleteWithMemberships (cascada C5): una sola sentencia DELETE; membresías, invitaciones y asignaciones caen por ON DELETE CASCADE', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.households.deleteWithMemberships(HOSTILE);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM households WHERE id = $1', values: [HOSTILE] }]);
  });

  it('listMemberships y listMembershipsOfUsers: 6 columnas en orden; ANY($1::text[]) para varios usuarios', async () => {
    const { client, r } = await repos({ rows: [memberRow(OWNER), memberRow(MEMBER)] }, { rows: [memberRow(OWNER)] });
    expect(await r.households.listMemberships(HOUSEHOLD.id)).toEqual([OWNER, MEMBER]);
    expect(await r.households.listMembershipsOfUsers([OWNER.userId, 'otro'])).toEqual([OWNER]);
    expect(client.calls).toEqual([
      { sql: `SELECT ${MEMBER_COLS} FROM household_members WHERE household_id = $1`, values: [HOUSEHOLD.id] },
      { sql: `SELECT ${MEMBER_COLS} FROM household_members WHERE user_id = ANY($1::text[])`, values: [[OWNER.userId, 'otro']] },
    ]);
  });

  it('lectura de membresía: una columna distinta de data es dato corrupto (ERR-INTERNAL-UNEXPECTED)', async () => {
    for (const over of [{ status: 'LEFT' }, { user_id: 'otro' }, { household_id: 'otro' }, { first_joined_at: null }]) {
      const { r } = await repos({ rows: [memberRow(OWNER, over)] });
      await expect(r.households.listMemberships(HOUSEHOLD.id)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
  });

  it('saveMembership: UPSERT con role e is_household_owner; OWNER -> ADMIN y 1; MEMBER -> READER y 0 (INV-HOUSE2-001)', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 1 }, { rowCount: 1 });
    await r.households.saveMembership(OWNER);
    await r.households.saveMembership(MEMBER);
    await r.households.saveMembership({ ...MEMBER, role: 'CAREGIVER' });
    expect(client.calls[0]!.sql).toBe(
      `INSERT INTO household_members (${MEMBER_COLS}, role, is_household_owner) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) ON CONFLICT (membership_id) DO UPDATE SET household_id = EXCLUDED.household_id, user_id = EXCLUDED.user_id, status = EXCLUDED.status, first_joined_at = EXCLUDED.first_joined_at, data = EXCLUDED.data, role = EXCLUDED.role, is_household_owner = EXCLUDED.is_household_owner`,
    );
    const tail = (i: number) => client.calls[i]!.values.filter((_, k) => k !== 5);
    expect(tail(0)).toEqual([OWNER.membershipId, OWNER.householdId, OWNER.userId, 'ACTIVE', OWNER.firstJoinedAt, 'ADMIN', 1]);
    expect(tail(1)).toEqual([MEMBER.membershipId, MEMBER.householdId, MEMBER.userId, 'ACTIVE', MEMBER.firstJoinedAt, 'READER', 0]);
    expect(tail(2).slice(5)).toEqual(['CAREGIVER', 0]);
    expect(JSON.parse(client.calls[0]!.values[5] as string)).toEqual(OWNER);
    expectParametrized(client.calls);
  });

  it('un segundo propietario ACTIVE viola household_members_one_owner (23505) y el error se propaga intacto', async () => {
    const violation = Object.assign(new Error('duplicate key value violates unique constraint "household_members_one_owner"'), { code: '23505' });
    const { r } = await repos({ error: violation });
    await expect(r.households.saveMembership({ ...OWNER, membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc99' })).rejects.toBe(violation);
  });

  it('saveMembership rechaza una fila estructuralmente inválida sin emitir SQL', async () => {
    const { client, r } = await repos();
    await expect(r.households.saveMembership({ ...OWNER, status: 7 } as unknown as LegacyHouseholdMember)).rejects.toBeInstanceOf(DomainError);
    expect(client.calls).toEqual([]);
  });

  it('deleteMembershipsOfUser: DELETE por user_id', async () => {
    const { client, r } = await repos();
    await r.households.deleteMembershipsOfUser(HOSTILE);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM household_members WHERE user_id = $1', values: [HOSTILE] }]);
  });

  it('updateOwner: columna y data.ownerUserId cambian juntos en una sentencia; 0 filas falla (INV-HOUSE2-001)', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 0 });
    await r.households.updateOwner(HOUSEHOLD.id, MEMBER.userId);
    expect(client.calls[0]).toEqual({
      sql: "UPDATE households SET owner_user_id = $1, data = jsonb_set(data, '{ownerUserId}', to_jsonb($1::text)) WHERE id = $2",
      values: [MEMBER.userId, HOUSEHOLD.id],
    });
    await expect(r.households.updateOwner('no-existe', MEMBER.userId)).rejects.toThrow('no existe');
    expectParametrized(client.calls);
  });
});

const INV_COLS = 'id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at';
const INVITATION: InvitationRecord = {
  invitationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
  householdId: HOUSEHOLD.id,
  inviteeUsername: 'carlos',
  inviteeUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
  roleOnJoin: 'CAREGIVER',
  invitedByUserId: HOUSEHOLD.ownerUserId,
  status: 'INVITED',
  createdAt: '2026-02-03T10:00:00.000Z',
  respondedAt: null,
};
const invRow = (i: InvitationRecord = INVITATION) => ({
  id: i.invitationId,
  household_id: i.householdId,
  invitee_username: i.inviteeUsername,
  invitee_user_id: i.inviteeUserId,
  invited_by_user_id: i.invitedByUserId,
  role_on_join: i.roleOnJoin,
  status: i.status,
  created_at: i.createdAt,
  responded_at: i.respondedAt,
});

describe('invitaciones (T424, REQ-PG-002, INV-HOUSE-003)', () => {
  it('findOpen: 9 columnas en orden, status INVITED literal, hogar y username como parámetros', async () => {
    const { client, r } = await repos({ rows: [invRow()] }, { rows: [] });
    expect(await r.invitations.findOpen(HOUSEHOLD.id, 'carlos')).toEqual(INVITATION);
    expect(await r.invitations.findOpen(HOUSEHOLD.id, HOSTILE)).toBeNull();
    expect(client.calls[0]).toEqual({
      sql: `SELECT ${INV_COLS} FROM household_invitations WHERE household_id = $1 AND LOWER(invitee_username) = LOWER($2) AND status = 'INVITED'`,
      values: [HOUSEHOLD.id, 'carlos'],
    });
    expectParametrized(client.calls);
  });

  it('listOpenForUser: INVITED del usuario ordenadas por created_at y household_id ASC; listByHousehold por hogar', async () => {
    const { client, r } = await repos({ rows: [invRow()] }, { rows: [invRow()] });
    expect(await r.invitations.listOpenForUser(INVITATION.inviteeUserId!)).toEqual([INVITATION]);
    expect(await r.invitations.listByHousehold(HOUSEHOLD.id)).toEqual([INVITATION]);
    expect(client.calls).toEqual([
      {
        sql: `SELECT ${INV_COLS} FROM household_invitations WHERE invitee_user_id = $1 AND status = 'INVITED' ORDER BY created_at ASC, household_id ASC`,
        values: [INVITATION.inviteeUserId],
      },
      { sql: `SELECT ${INV_COLS} FROM household_invitations WHERE household_id = $1`, values: [HOUSEHOLD.id] },
    ]);
  });

  it('save: UPSERT por id con las 9 columnas en orden; una segunda INVITED del mismo par viola el índice único parcial (23505) y se propaga', async () => {
    const violation = Object.assign(new Error('duplicate key value violates unique constraint "household_invitations_one_open"'), { code: '23505' });
    const { client, r } = await repos({ rowCount: 1 }, { error: violation });
    await r.invitations.save(INVITATION);
    expect(client.calls[0]!.sql).toBe(
      `INSERT INTO household_invitations (${INV_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET household_id = EXCLUDED.household_id, invitee_username = EXCLUDED.invitee_username, invitee_user_id = EXCLUDED.invitee_user_id, invited_by_user_id = EXCLUDED.invited_by_user_id, role_on_join = EXCLUDED.role_on_join, status = EXCLUDED.status, created_at = EXCLUDED.created_at, responded_at = EXCLUDED.responded_at`,
    );
    expect(client.calls[0]!.values).toEqual([
      INVITATION.invitationId,
      INVITATION.householdId,
      'carlos',
      INVITATION.inviteeUserId,
      INVITATION.invitedByUserId,
      'CAREGIVER',
      'INVITED',
      INVITATION.createdAt,
      null,
    ]);
    await expect(r.invitations.save({ ...INVITATION, invitationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd02' })).rejects.toBe(violation);
    expectParametrized(client.calls);
  });

  it('deleteForUser y deleteForHousehold: DELETE con parámetros; el usuario se repite como $1 (emitidas o recibidas)', async () => {
    const { client, r } = await repos();
    await r.invitations.deleteForUser(HOSTILE);
    await r.invitations.deleteForHousehold(HOUSEHOLD.id);
    expect(client.calls).toEqual([
      { sql: 'DELETE FROM household_invitations WHERE invited_by_user_id = $1 OR invitee_user_id = $1', values: [HOSTILE] },
      { sql: 'DELETE FROM household_invitations WHERE household_id = $1', values: [HOUSEHOLD.id] },
    ]);
  });
});

const ASSIGNMENT: PetAssignmentRecord = { petId: 'p1', householdId: HOUSEHOLD.id, assignedByUserId: HOUSEHOLD.ownerUserId, assignedAt: '2026-02-04T10:00:00.000Z' };
const ASG_COLS = 'pet_id, household_id, assigned_by_user_id, assigned_at';
const asgRow = { pet_id: 'p1', household_id: HOUSEHOLD.id, assigned_by_user_id: HOUSEHOLD.ownerUserId, assigned_at: ASSIGNMENT.assignedAt };

describe('asignaciones (T424, REQ-PG-002, REQ-HOUSE2-003)', () => {
  it('listByHousehold y listByPet: 4 columnas en orden con ORDER BY determinista', async () => {
    const { client, r } = await repos({ rows: [asgRow] }, { rows: [asgRow] });
    expect(await r.assignments.listByHousehold(HOUSEHOLD.id)).toEqual([ASSIGNMENT]);
    expect(await r.assignments.listByPet('p1')).toEqual([ASSIGNMENT]);
    expect(client.calls).toEqual([
      { sql: `SELECT ${ASG_COLS} FROM pet_assignments WHERE household_id = $1 ORDER BY pet_id`, values: [HOUSEHOLD.id] },
      { sql: `SELECT ${ASG_COLS} FROM pet_assignments WHERE pet_id = $1 ORDER BY household_id`, values: ['p1'] },
    ]);
  });

  it('save: UPSERT por (pet_id, household_id); remove y los dos deleteFor*: DELETE parametrizados', async () => {
    const { client, r } = await repos();
    await r.assignments.save(ASSIGNMENT);
    await r.assignments.remove('p1', HOUSEHOLD.id);
    await r.assignments.deleteForHousehold(HOSTILE);
    await r.assignments.deleteForPet(HOSTILE);
    expect(client.calls).toEqual([
      {
        sql: `INSERT INTO pet_assignments (${ASG_COLS}) VALUES ($1, $2, $3, $4) ON CONFLICT (pet_id, household_id) DO UPDATE SET assigned_by_user_id = EXCLUDED.assigned_by_user_id, assigned_at = EXCLUDED.assigned_at`,
        values: ['p1', HOUSEHOLD.id, HOUSEHOLD.ownerUserId, ASSIGNMENT.assignedAt],
      },
      { sql: 'DELETE FROM pet_assignments WHERE pet_id = $1 AND household_id = $2', values: ['p1', HOUSEHOLD.id] },
      { sql: 'DELETE FROM pet_assignments WHERE household_id = $1', values: [HOSTILE] },
      { sql: 'DELETE FROM pet_assignments WHERE pet_id = $1', values: [HOSTILE] },
    ]);
    expectParametrized(client.calls);
  });
});

const ENTRY: AuditEntry = {
  id: 'a1000000-0000-4000-8000-000000000001',
  timestamp: '2026-11-05T12:00:00.000Z',
  executorUserId: HOUSEHOLD.ownerUserId,
  mutationType: 'CREATE',
  entityType: 'PET',
  entityId: 'p1',
  previousStateHash: null,
  newStateHash: 'a'.repeat(64),
};

describe('auditoría (T424, REQ-AUD-001, INV-AUD-001)', () => {
  it('insert: 8 columnas en orden, solo INSERT (sin UPDATE ni DELETE de negocio)', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.auditLog.insert(ENTRY);
    expect(client.calls).toEqual([
      {
        sql: 'INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        values: [ENTRY.id, ENTRY.timestamp, ENTRY.executorUserId, 'CREATE', 'PET', 'p1', null, 'a'.repeat(64)],
      },
    ]);
    expectParametrized(client.calls);
  });

  it('pseudonymizeUser: una sentencia que sustituye en executor_user_id y entity_id, con userId y hmac como $1 y $2', async () => {
    const { client, r } = await repos();
    await r.auditLog.pseudonymizeUser(HOSTILE, 'f'.repeat(64));
    expect(client.calls).toEqual([
      {
        sql: 'UPDATE audit_log SET executor_user_id = CASE WHEN executor_user_id = $1 THEN $2 ELSE executor_user_id END, entity_id = CASE WHEN entity_id = $1 THEN $2 ELSE entity_id END WHERE executor_user_id = $1 OR entity_id = $1',
        values: [HOSTILE, 'f'.repeat(64)],
      },
    ]);
  });
});

describe('fábrica compuesta createPostgresRepositories (T424, REQ-PG-002, INV-ARCH-005)', () => {
  it('devuelve las 11 claves de RepositorySet, todas sobre el mismo cliente de la transacción', async () => {
    const client = fakeClient({ rows: [] });
    const { createPostgresRepositories } = await load();
    const set = createPostgresRepositories(client);
    expect(Object.keys(set).sort()).toEqual(
      ['assignments', 'auditLog', 'confirmationTokens', 'households', 'invitations', 'loginAttempts', 'pets', 'rateLimits', 'records', 'sessions', 'users'],
    );
    for (const port of Object.values(set)) expect(typeof port).toBe('object');
    await (set['users'] as { findById(id: string): Promise<unknown> }).findById('u');
    await (set['pets'] as { findById(id: string): Promise<unknown> }).findById('p');
    await (set['auditLog'] as { insert(e: AuditEntry): Promise<void> }).insert(ENTRY);
    expect(client.calls.map((c) => c.sql.split(' ')[0])).toEqual(['SELECT', 'SELECT', 'INSERT']);
  });

  it('la suite viva ya no usa el cast `as RepositorySet` ni la parte 1 sola: compone la fábrica completa', () => {
    const live = readFileSync(new URL('./postgres-repositories.spec.ts', import.meta.url), 'utf8');
    expect(live).toContain('createPostgresRepositories');
    expect(live).not.toContain('createPostgresRepositoriesPart1');
    expect(live).not.toContain('as RepositorySet');
  });
});

describe('código fuente de la parte 3 (T424, INV-ARCH-006)', () => {
  it('sigue sin leer process.env ni consultar schema_migrations', () => {
    const source = readFileSync(new URL(MODULE_PATH, import.meta.url), 'utf8');
    expect(source).toContain('createPostgresRepositoriesPart3');
    expect(source).not.toMatch(/process\.env|schema_migrations/);
  });
});
