/**
 * Repositorios SQLite detrás de los puertos de aplicación. Solo se usan dentro de
 * `SqliteUnitOfWork.runInTransaction`.
 * - Cada fila guarda el objeto del contrato en `data` (JSON) y repite en columnas las claves y referencias.
 * - Frontera validada (INV-ARCH-004): al escribir y al leer, el objeto se valida con los validadores generados y las
 *   columnas deben coincidir con el objeto. Un dato inválido o corrupto produce ERR-INTERNAL-UNEXPECTED controlado
 *   (F4): la transacción se descarta y la aplicación sigue en pie.
 * - INV-AUTH-003: el hash de la contraseña va en su columna, nunca en `data`; el token de sesión se guarda como
 *   SHA-256, nunca en claro.
 * - `pets.save` y `households.saveMembership` usan UPSERT (no `INSERT OR REPLACE`), para que reemplazar una mascota
 *   no dispare el borrado en cascada de sus registros.
 *
 * - Mascotas (0003): species, species_other, neutered, microchip_id y birth_date_is_estimate repiten el objeto en columnas
 *   (CHECK de las 8 especies y de speciesOther solo con OTHER, microchip único por propietario); weights.weight_grams guarda
 *   el peso en gramos enteros (ADR-002-09). La lectura comprueba que las columnas coinciden con `data`.
 *
 * @implements INV-ARCH-004, INV-ARCH-005, INV-AUTH-003, INV-PET-005, INV-HOUSE-003, INV-PET2-001, INV-REC2-002, ERR-INTERNAL-UNEXPECTED
 */

import { createHash } from 'node:crypto';
import {
  DomainError,
  validateBodyMeasurementRecord,
  validateCustomParameterRecord,
  validateDewormingRecord,
  validateHousehold,
  validateMedicalVisitRecord,
  validatePetProfile,
  validateUserPublicProfile,
  validateVaccinationRecord,
  validateWeightRecord,
  type Household,
  type PetProfile,
  type UserPublicProfile,
} from '../../../generated/index.ts';
import type {
  ConfirmationTokenRepositoryPort,
  HouseholdRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetRepositoryPort,
  RateLimitRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import { isLegacyHouseholdMember, type LegacyHouseholdMember } from '../../../domain/households/household-policies.ts';
import type { SessionRecord } from '../../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../../domain/records/record-invariants.ts';
import { weightKgToGrams } from '../../../domain/records/weight-limits.ts';
import { isCanonicalUtcTimestamp } from '../../../domain/sorting/deterministic-sorter.ts';
import type Database from 'better-sqlite3';
import type { SqliteDatabase } from './sqlite-database.ts';

type Check<T> = (value: unknown) => value is T;

/** Tabla de cada módulo de registros y su validador generado. */
const RECORD_TABLES: { readonly [M in RecordModule]: { readonly table: string; readonly check: Check<RecordOf<M>> } } = {
  weights: { table: 'weights', check: validateWeightRecord },
  bodyMeasurements: { table: 'body_measurements', check: validateBodyMeasurementRecord },
  vaccinations: { table: 'vaccinations', check: validateVaccinationRecord },
  dewormings: { table: 'dewormings', check: validateDewormingRecord },
  medicalVisits: { table: 'medical_visits', check: validateMedicalVisitRecord },
  customParameters: { table: 'custom_parameters', check: validateCustomParameterRecord },
};
const RECORD_MODULE_NAMES = Object.keys(RECORD_TABLES) as RecordModule[];

const isSessionRecord: Check<SessionRecord> = (value): value is SessionRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const timestamp = (x: unknown) => typeof x === 'string' && isCanonicalUtcTimestamp(x);
  return (
    Object.keys(v).sort().join(',') === 'createdAt,lastActivityAt,revokedAt,userId' &&
    typeof v['userId'] === 'string' &&
    timestamp(v['createdAt']) &&
    timestamp(v['lastActivityAt']) &&
    (v['revokedAt'] === null || timestamp(v['revokedAt']))
  );
};
const isStringArray: Check<string[]> = (value): value is string[] => Array.isArray(value) && value.every((x) => typeof x === 'string');

/**
 * Dato persistido inválido o corrupto (F4).
 * @implements ERR-INTERNAL-UNEXPECTED
 */
export function corruptData(table: string, key: string): DomainError {
  return new DomainError('ERR-INTERNAL-UNEXPECTED', `Dato persistido inválido o corrupto en ${table} (${key}).`);
}

/** Serializa un objeto validado; si no cumple el contrato, no se escribe. */
function encode<T>(table: string, key: string, value: T, check: Check<T>): string {
  if (!check(value)) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Objeto inválido para ${table} (${key}); no se guarda.`);
  return JSON.stringify(value);
}

/** Parsea y valida `data`; `columns` comprueba que las columnas coinciden con el objeto. */
function decode<T>(table: string, key: string, raw: unknown, check: Check<T>, columns: (value: T) => boolean = () => true): T {
  let value: unknown;
  try {
    value = JSON.parse(String(raw));
  } catch {
    throw corruptData(table, key);
  }
  if (!check(value) || !columns(value)) throw corruptData(table, key);
  return value;
}

/** Parámetro de lista para `IN (SELECT value FROM json_each(?))`. */
const list = (values: readonly string[]) => JSON.stringify([...values]);

/** SHA-256 hexadecimal del token de sesión (INV-AUTH-003). */
export const sessionTokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly password_hash: string;
  readonly email: string | null;
  readonly preferred_language: string;
  readonly timezone: string;
  readonly data: string;
}
interface SessionRow {
  readonly user_id: string;
  readonly created_at: string | null;
  readonly last_activity_at: string | null;
  readonly revoked_at: string | null;
  readonly data: string;
}
interface InvitationRow {
  readonly id: string;
  readonly household_id: string;
  readonly invitee_username: string;
  readonly invitee_user_id: string | null;
  readonly invited_by_user_id: string;
  readonly role_on_join: string;
  readonly status: string;
  readonly created_at: string;
  readonly responded_at: string | null;
}
interface KeyedRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly data: string;
}
interface PetRow extends KeyedRow {
  readonly species: string;
  readonly species_other: string | null;
  readonly neutered: number | null;
  readonly microchip_id: string | null;
  readonly birth_date_is_estimate: number;
}
interface RecordRow {
  readonly id: string;
  readonly pet_id: string;
  readonly data: string;
  /** Solo en `weights` (ADR-002-09). */
  readonly weight_grams?: number;
}
interface ModuleStatements {
  readonly byPet: Database.Statement<[string], RecordRow>;
  readonly insert: Database.Statement<(string | number)[]>;
  readonly removeForPet: Database.Statement<[string]>;
}
interface MembershipRow {
  readonly membership_id: string;
  readonly household_id: string;
  readonly user_id: string;
  readonly status: string;
  readonly first_joined_at: string | null;
  readonly data: string;
}

/** @implements INV-ARCH-004, INV-AUTH-003, REQ-ACC-001, REQ-ACC-002, ERR-INTERNAL-UNEXPECTED */
function userRepository(db: SqliteDatabase): UserRepositoryPort {
  const select = 'SELECT id, username, password_hash, email, preferred_language, timezone, data FROM users';
  const byId = db.prepare<[string], UserRow>(`${select} WHERE id = ?`);
  const byUsername = db.prepare<[string], UserRow>(`${select} WHERE username = ?`);
  const byIds = db.prepare<[string], UserRow>(`${select} WHERE id IN (SELECT value FROM json_each(?))`);
  const insert = db.prepare('INSERT INTO users (id, username, password_hash, data, email, preferred_language, timezone) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const update = db.prepare('UPDATE users SET password_hash = ?, data = ?, email = ?, preferred_language = ?, timezone = ? WHERE id = ? AND username = ?');
  const remove = db.prepare('DELETE FROM users WHERE id = ?');
  const references = db.prepare<[string, string, string, string, string, string, string, string, string], { readonly n: number }>(
    `SELECT (SELECT COUNT(*) FROM users WHERE id = ?)
          + (SELECT COUNT(*) FROM pets WHERE owner_user_id = ?)
          + (SELECT COUNT(*) FROM households WHERE owner_user_id = ?)
          + (SELECT COUNT(*) FROM household_members WHERE user_id = ?)
          + (SELECT COUNT(*) FROM sessions WHERE user_id = ?)
          + (SELECT COUNT(*) FROM household_invitations WHERE invited_by_user_id = ?)
          + (SELECT COUNT(*) FROM household_invitations WHERE invitee_user_id = ?)
          + (SELECT COUNT(*) FROM backup_confirmation_tokens WHERE user_id = ?)
          + (SELECT COUNT(*) FROM rate_limit_events WHERE subject_user_id = ?) AS n`,
  );
  const toAccount = (row: UserRow): UserAccount => {
    const profile = decode('users', row.id, row.data, validateUserPublicProfile, (u) => u.id === row.id && u.username === row.username);
    if (typeof row.password_hash !== 'string' || row.password_hash === '') throw corruptData('users', row.id);
    if (row.preferred_language !== 'es' && row.preferred_language !== 'en' && row.preferred_language !== 'pt') throw corruptData('users', row.id);
    return { ...profile, email: row.email, preferredLanguage: row.preferred_language, timezone: row.timezone, passwordHash: row.password_hash };
  };
  const split = (user: UserAccount) => {
    const { passwordHash, email, preferredLanguage, timezone, ...profile } = user;
    if (passwordHash === '') throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Usuario sin hash de contraseña (${user.id}); no se guarda.`);
    return { passwordHash, email, preferredLanguage, timezone, data: encode<UserPublicProfile>('users', user.id, profile, validateUserPublicProfile) };
  };
  return {
    async findById(userId) {
      const row = byId.get(userId);
      return row === undefined ? null : toAccount(row);
    },
    async findByUsername(username) {
      const row = byUsername.get(username);
      return row === undefined ? null : toAccount(row);
    },
    async listByIds(userIds) {
      return byIds.all(list(userIds)).map(toAccount);
    },
    async insert(user) {
      const { passwordHash, email, preferredLanguage, timezone, data } = split(user);
      insert.run(user.id, user.username, passwordHash, data, email, preferredLanguage, timezone);
    },
    async update(user) {
      const { passwordHash, email, preferredLanguage, timezone, data } = split(user);
      if (update.run(passwordHash, data, email, preferredLanguage, timezone, user.id, user.username).changes !== 1) {
        throw new DomainError('ERR-INTERNAL-UNEXPECTED', `El usuario ${user.id} no existe; no se actualiza.`);
      }
    },
    async delete(userId) {
      remove.run(userId);
    },
    async countReferences(userId) {
      return references.get(userId, userId, userId, userId, userId, userId, userId, userId, userId)!.n;
    },
  };
}

/** @implements INV-AUTH-003, INV-AUTH2-002, REQ-AUTH2-003, ERR-INTERNAL-UNEXPECTED */
function sessionRepository(db: SqliteDatabase): SessionRepositoryPort {
  const byHash = db.prepare<[string], SessionRow>('SELECT user_id, created_at, last_activity_at, revoked_at, data FROM sessions WHERE token_hash = ?');
  const upsert = db.prepare(
    `INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (token_hash) DO UPDATE SET user_id = excluded.user_id, data = excluded.data, created_at = excluded.created_at,
       last_activity_at = excluded.last_activity_at, revoked_at = excluded.revoked_at`,
  );
  const ofUser = db.prepare<[string], { readonly token_hash: string; readonly data: string }>('SELECT token_hash, data FROM sessions WHERE user_id = ? AND revoked_at IS NULL');
  const revoke = db.prepare('UPDATE sessions SET revoked_at = ?, data = ? WHERE token_hash = ?');
  const removeByUser = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  return {
    async findByToken(token) {
      const hash = sessionTokenHash(token);
      const row = byHash.get(hash);
      return row === undefined
        ? null
        : decode(
            'sessions',
            hash.slice(0, 12),
            row.data,
            isSessionRecord,
            (s) => s.userId === row.user_id && s.createdAt === row.created_at && s.lastActivityAt === row.last_activity_at && s.revokedAt === row.revoked_at,
          );
    },
    async save(token, session) {
      const hash = sessionTokenHash(token);
      upsert.run(hash, session.userId, encode('sessions', hash.slice(0, 12), session, isSessionRecord), session.createdAt, session.lastActivityAt, session.revokedAt);
    },
    async revokeOthers(userId, keepToken, nowIsoTimestamp) {
      const keep = sessionTokenHash(keepToken);
      let revoked = 0;
      for (const row of ofUser.all(userId)) {
        if (row.token_hash === keep) continue;
        const session = decode('sessions', row.token_hash.slice(0, 12), row.data, isSessionRecord);
        revoke.run(nowIsoTimestamp, encode('sessions', row.token_hash.slice(0, 12), { ...session, revokedAt: nowIsoTimestamp }, isSessionRecord), row.token_hash);
        revoked += 1;
      }
      return revoked;
    },
    async deleteByUser(userId) {
      removeByUser.run(userId);
    },
  };
}

/** @implements ERR-INTERNAL-UNEXPECTED */
function loginAttemptRepository(db: SqliteDatabase): LoginAttemptRepositoryPort {
  const byUsername = db.prepare<[string], { readonly failures: string }>('SELECT failures FROM login_attempts WHERE username = ?');
  const upsert = db.prepare('INSERT INTO login_attempts (username, failures) VALUES (?, ?) ON CONFLICT (username) DO UPDATE SET failures = excluded.failures');
  const remove = db.prepare('DELETE FROM login_attempts WHERE username = ?');
  return {
    async deleteFailures(username) {
      remove.run(username);
    },
    async listFailures(username) {
      const row = byUsername.get(username);
      return row === undefined ? [] : decode('login_attempts', username, row.failures, isStringArray);
    },
    async replaceFailures(username, failures) {
      upsert.run(username, encode('login_attempts', username, [...failures], isStringArray));
    },
  };
}

/** @implements INV-ARCH-004, INV-PET-005, ERR-INTERNAL-UNEXPECTED */
function petRepository(db: SqliteDatabase): PetRepositoryPort {
  const columns = 'id, owner_user_id, data, species, species_other, neutered, microchip_id, birth_date_is_estimate';
  const byId = db.prepare<[string], PetRow>(`SELECT ${columns} FROM pets WHERE id = ?`);
  const byOwners = db.prepare<[string], PetRow>(`SELECT ${columns} FROM pets WHERE owner_user_id IN (SELECT value FROM json_each(?))`);
  const upsert = db.prepare(
    `INSERT INTO pets (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET owner_user_id = excluded.owner_user_id, data = excluded.data, species = excluded.species,
       species_other = excluded.species_other, neutered = excluded.neutered, microchip_id = excluded.microchip_id,
       birth_date_is_estimate = excluded.birth_date_is_estimate`,
  );
  // INV-PET-005: ON DELETE CASCADE borra en la misma sentencia los registros de los 6 módulos.
  const remove = db.prepare('DELETE FROM pets WHERE id = ?');
  const toPet = (row: PetRow): PetProfile =>
    decode(
      'pets',
      row.id,
      row.data,
      validatePetProfile,
      (p) =>
        p.id === row.id &&
        p.ownerUserId === row.owner_user_id &&
        p.species === row.species &&
        p.speciesOther === row.species_other &&
        p.neutered === (row.neutered === null ? null : row.neutered === 1) &&
        p.microchipId === row.microchip_id &&
        p.birthDateIsEstimate === (row.birth_date_is_estimate === 1),
    );
  return {
    async findById(petId) {
      const row = byId.get(petId);
      return row === undefined ? null : toPet(row);
    },
    async listByOwners(ownerUserIds) {
      return byOwners.all(list(ownerUserIds)).map(toPet);
    },
    async save(pet) {
      upsert.run(
        pet.id,
        pet.ownerUserId,
        encode('pets', pet.id, pet, validatePetProfile),
        pet.species,
        pet.speciesOther,
        pet.neutered === null ? null : pet.neutered ? 1 : 0,
        pet.microchipId,
        pet.birthDateIsEstimate ? 1 : 0,
      );
    },
    async delete(petId) {
      remove.run(petId);
    },
  };
}

/** @implements INV-ARCH-004, INV-PET-005, ERR-INTERNAL-UNEXPECTED */
function recordRepository(db: SqliteDatabase): MedicalRecordRepositoryPort {
  const statements = {} as Record<RecordModule, ModuleStatements>;
  for (const module of RECORD_MODULE_NAMES) {
    const { table } = RECORD_TABLES[module];
    statements[module] = {
      byPet: db.prepare<[string], RecordRow>(`SELECT id, pet_id, data${table === 'weights' ? ', weight_grams' : ''} FROM ${table} WHERE pet_id = ?`),
      insert: db.prepare<[string, string, string]>(`INSERT INTO ${table} (id, pet_id, data${table === 'weights' ? ', weight_grams' : ''}) VALUES (?, ?, ?${table === 'weights' ? ', ?' : ''})`),
      removeForPet: db.prepare<[string]>(`DELETE FROM ${table} WHERE pet_id = ?`),
    };
  }
  const petOfRecord = db
    .prepare<[string, string, string, string, string, string], { readonly pet_id: unknown }>(
      RECORD_MODULE_NAMES.map((m) => `SELECT pet_id FROM ${RECORD_TABLES[m].table} WHERE id = ?`).join(' UNION ALL ') + ' LIMIT 1',
    );
  return {
    async listForPet(petId) {
      const result = {} as Record<RecordModule, unknown[]>;
      for (const module of RECORD_MODULE_NAMES) {
        const { table, check } = RECORD_TABLES[module];
        result[module] = statements[module].byPet
          .all(petId)
          .map((row) =>
            decode(table, row.id, row.data, check as Check<{ id: string; petId: string; weightKg?: number }>, (r) =>
              r.id === row.id && r.petId === row.pet_id && (table !== 'weights' || (row.weight_grams === weightKgToGrams(r.weightKg!))),
            ),
          );
      }
      return result as unknown as PetRecordCollections;
    },
    async findPetIdOfRecord(recordId) {
      const row = petOfRecord.get(recordId, recordId, recordId, recordId, recordId, recordId);
      if (row === undefined) return null;
      if (typeof row.pet_id !== 'string') throw corruptData('records', recordId);
      return row.pet_id;
    },
    async add<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const { table, check } = RECORD_TABLES[module];
      const data = encode(table, record.id, record, check as Check<RecordOf<M>>);
      if (module === 'weights') {
        statements[module].insert.run(record.id, record.petId, data, weightKgToGrams((record as RecordOf<'weights'>).weightKg));
      } else {
        statements[module].insert.run(record.id, record.petId, data);
      }
    },
    async deleteForPet(petId) {
      for (const module of RECORD_MODULE_NAMES) statements[module].removeForPet.run(petId);
    },
  };
}

/** @implements INV-ARCH-004, INV-HOUSE-003, ERR-INTERNAL-UNEXPECTED */
function householdRepository(db: SqliteDatabase): HouseholdRepositoryPort {
  const byId = db.prepare<[string], KeyedRow>('SELECT id, owner_user_id, data FROM households WHERE id = ?');
  const insert = db.prepare('INSERT INTO households (id, owner_user_id, data) VALUES (?, ?, ?)');
  // C5: ON DELETE CASCADE borra las membresías del hogar en la misma sentencia; las mascotas no se tocan.
  const remove = db.prepare('DELETE FROM households WHERE id = ?');
  const membershipColumns = 'membership_id, household_id, user_id, status, first_joined_at, data';
  const membershipsOf = db.prepare<[string], MembershipRow>(`SELECT ${membershipColumns} FROM household_members WHERE household_id = ?`);
  const membershipsOfUsers = db.prepare<[string], MembershipRow>(
    `SELECT ${membershipColumns} FROM household_members WHERE user_id IN (SELECT value FROM json_each(?))`,
  );
  // INV-HOUSE-003: el índice único parcial rechaza una segunda membresía INVITED o ACTIVE del mismo par.
  const upsertMembership = db.prepare(
    `INSERT INTO household_members (${membershipColumns}) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (membership_id) DO UPDATE SET household_id = excluded.household_id, user_id = excluded.user_id,
       status = excluded.status, first_joined_at = excluded.first_joined_at, data = excluded.data`,
  );
  const removeMembershipsOfUser = db.prepare('DELETE FROM household_members WHERE user_id = ?');
  const toHousehold = (row: KeyedRow): Household =>
    decode('households', row.id, row.data, validateHousehold, (h) => h.id === row.id && h.ownerUserId === row.owner_user_id);
  const toMembership = (row: MembershipRow): LegacyHouseholdMember =>
    decode<LegacyHouseholdMember>(
      'household_members',
      row.membership_id,
      row.data,
      isLegacyHouseholdMember,
      (m) =>
        m.membershipId === row.membership_id &&
        m.householdId === row.household_id &&
        m.userId === row.user_id &&
        m.status === row.status &&
        m.firstJoinedAt === row.first_joined_at,
    );
  return {
    async findById(householdId) {
      const row = byId.get(householdId);
      return row === undefined ? null : toHousehold(row);
    },
    async insert(household) {
      insert.run(household.id, household.ownerUserId, encode('households', household.id, household, validateHousehold));
    },
    async deleteWithMemberships(householdId) {
      remove.run(householdId);
    },
    async listMemberships(householdId) {
      return membershipsOf.all(householdId).map(toMembership);
    },
    async listMembershipsOfUsers(userIds) {
      return membershipsOfUsers.all(list(userIds)).map(toMembership);
    },
    async saveMembership(membership) {
      const data = encode('household_members', membership.membershipId, membership, isLegacyHouseholdMember);
      upsertMembership.run(membership.membershipId, membership.householdId, membership.userId, membership.status, membership.firstJoinedAt, data);
    },
    async deleteMembershipsOfUser(userId) {
      removeMembershipsOfUser.run(userId);
    },
  };
}

/** @implements REQ-ACC-002, INV-AUTH-003, ERR-INTERNAL-UNEXPECTED */
function confirmationTokenRepository(db: SqliteDatabase): ConfirmationTokenRepositoryPort {
  const replace = db.prepare(
    `INSERT INTO backup_confirmation_tokens (user_id, token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, expires_at = excluded.expires_at, used_at = NULL`,
  );
  const consume = db.prepare('UPDATE backup_confirmation_tokens SET used_at = ? WHERE token_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?');
  const remove = db.prepare('DELETE FROM backup_confirmation_tokens WHERE user_id = ?');
  return {
    async replaceForUser(userId, tokenHash, createdAt, expiresAt) {
      replace.run(userId, tokenHash, createdAt, expiresAt);
    },
    async consume(userId, tokenHash, nowIsoTimestamp) {
      return consume.run(nowIsoTimestamp, tokenHash, userId, nowIsoTimestamp).changes === 1;
    },
    async deleteForUser(userId) {
      remove.run(userId);
    },
  };
}

/** @implements ERR-RATE-LIMITED, ERR-INTERNAL-UNEXPECTED */
function rateLimitRepository(db: SqliteDatabase): RateLimitRepositoryPort {
  const insert = db.prepare('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)');
  const count = db.prepare<[string, string, string], { readonly n: number }>(
    'SELECT COUNT(*) AS n FROM rate_limit_events WHERE scope = ? AND subject_user_id = ? AND occurred_at > ?',
  );
  const remove = db.prepare('DELETE FROM rate_limit_events WHERE subject_user_id = ?');
  return {
    async record(event) {
      insert.run(event.id, event.scope, event.userId, event.occurredAt);
    },
    async countSince(scope, userId, sinceExclusive) {
      return count.get(scope, userId, sinceExclusive)!.n;
    },
    async deleteForUser(userId) {
      remove.run(userId);
    },
  };
}

/** @implements REQ-HOUSE2-001, INV-HOUSE-003, ERR-INTERNAL-UNEXPECTED */
function invitationRepository(db: SqliteDatabase): InvitationRepositoryPort {
  const columns = 'id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at';
  const open = db.prepare<[string, string], InvitationRow>(`SELECT ${columns} FROM household_invitations WHERE household_id = ? AND invitee_username = ? AND status = 'INVITED'`);
  const ofHousehold = db.prepare<[string], InvitationRow>(`SELECT ${columns} FROM household_invitations WHERE household_id = ?`);
  const upsert = db.prepare(
    `INSERT INTO household_invitations (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET household_id = excluded.household_id, invitee_username = excluded.invitee_username,
       invitee_user_id = excluded.invitee_user_id, invited_by_user_id = excluded.invited_by_user_id, role_on_join = excluded.role_on_join,
       status = excluded.status, created_at = excluded.created_at, responded_at = excluded.responded_at`,
  );
  const removeForUser = db.prepare('DELETE FROM household_invitations WHERE invited_by_user_id = ? OR invitee_user_id = ?');
  const removeForHousehold = db.prepare('DELETE FROM household_invitations WHERE household_id = ?');
  const toRecord = (row: InvitationRow): InvitationRecord => ({
    invitationId: row.id,
    householdId: row.household_id,
    inviteeUsername: row.invitee_username,
    inviteeUserId: row.invitee_user_id,
    roleOnJoin: row.role_on_join as InvitationRecord['roleOnJoin'],
    invitedByUserId: row.invited_by_user_id,
    status: row.status as InvitationRecord['status'],
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  });
  return {
    async findOpen(householdId, inviteeUsername) {
      const row = open.get(householdId, inviteeUsername);
      return row === undefined ? null : toRecord(row);
    },
    async save(invitation) {
      upsert.run(
        invitation.invitationId,
        invitation.householdId,
        invitation.inviteeUsername,
        invitation.inviteeUserId,
        invitation.invitedByUserId,
        invitation.roleOnJoin,
        invitation.status,
        invitation.createdAt,
        invitation.respondedAt,
      );
    },
    async listByHousehold(householdId) {
      return ofHousehold.all(householdId).map(toRecord);
    },
    async deleteForUser(userId) {
      removeForUser.run(userId, userId);
    },
    async deleteForHousehold(householdId) {
      removeForHousehold.run(householdId);
    },
  };
}

/**
 * Los repositorios sobre una conexión. Las sentencias se preparan una vez.
 * @implements INV-ARCH-005
 */
export function createSqliteRepositories(db: SqliteDatabase): RepositorySet {
  return {
    users: userRepository(db),
    sessions: sessionRepository(db),
    loginAttempts: loginAttemptRepository(db),
    pets: petRepository(db),
    records: recordRepository(db),
    households: householdRepository(db),
    confirmationTokens: confirmationTokenRepository(db),
    rateLimits: rateLimitRepository(db),
    invitations: invitationRepository(db),
  };
}
