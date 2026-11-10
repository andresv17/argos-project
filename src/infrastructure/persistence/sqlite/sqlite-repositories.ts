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
 * @implements INV-ARCH-004, INV-ARCH-005, INV-AUTH-003, INV-PET-005, INV-HOUSE-003, ERR-INTERNAL-UNEXPECTED
 */

import { createHash } from 'node:crypto';
import {
  DomainError,
  validateBodyMeasurementRecord,
  validateCustomParameterRecord,
  validateDewormingRecord,
  validateHousehold,
  validateHouseholdMember,
  validateMedicalVisitRecord,
  validatePetProfile,
  validateUserPublicProfile,
  validateVaccinationRecord,
  validateWeightRecord,
  type Household,
  type HouseholdMember,
  type PetProfile,
  type UserPublicProfile,
} from '../../../generated/index.ts';
import type {
  HouseholdRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import type { SessionRecord } from '../../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../../domain/records/record-invariants.ts';
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
    Object.keys(v).sort().join(',') === 'createdAt,expiresAt,revokedAt,userId' &&
    typeof v['userId'] === 'string' &&
    timestamp(v['createdAt']) &&
    timestamp(v['expiresAt']) &&
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
  readonly data: string;
}
interface KeyedRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly data: string;
}
interface RecordRow {
  readonly id: string;
  readonly pet_id: string;
  readonly data: string;
}
interface ModuleStatements {
  readonly byPet: Database.Statement<[string], RecordRow>;
  readonly insert: Database.Statement<[string, string, string]>;
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

/** @implements INV-ARCH-004, INV-AUTH-003, ERR-INTERNAL-UNEXPECTED */
function userRepository(db: SqliteDatabase): UserRepositoryPort {
  const select = 'SELECT id, username, password_hash, data FROM users';
  const byId = db.prepare<[string], UserRow>(`${select} WHERE id = ?`);
  const byUsername = db.prepare<[string], UserRow>(`${select} WHERE username = ?`);
  const byIds = db.prepare<[string], UserRow>(`${select} WHERE id IN (SELECT value FROM json_each(?))`);
  const insert = db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)');
  const toAccount = (row: UserRow): UserAccount => {
    const profile = decode('users', row.id, row.data, validateUserPublicProfile, (u) => u.id === row.id && u.username === row.username);
    if (typeof row.password_hash !== 'string' || row.password_hash === '') throw corruptData('users', row.id);
    return { ...profile, passwordHash: row.password_hash };
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
      const { passwordHash, ...profile } = user;
      if (passwordHash === '') throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Usuario sin hash de contraseña (${user.id}); no se guarda.`);
      insert.run(user.id, user.username, passwordHash, encode<UserPublicProfile>('users', user.id, profile, validateUserPublicProfile));
    },
  };
}

/** @implements INV-AUTH-003, ERR-INTERNAL-UNEXPECTED */
function sessionRepository(db: SqliteDatabase): SessionRepositoryPort {
  const byHash = db.prepare<[string], { readonly user_id: string; readonly data: string }>('SELECT user_id, data FROM sessions WHERE token_hash = ?');
  const upsert = db.prepare(
    'INSERT INTO sessions (token_hash, user_id, data) VALUES (?, ?, ?) ON CONFLICT (token_hash) DO UPDATE SET user_id = excluded.user_id, data = excluded.data',
  );
  return {
    async findByToken(token) {
      const hash = sessionTokenHash(token);
      const row = byHash.get(hash);
      return row === undefined ? null : decode('sessions', hash.slice(0, 12), row.data, isSessionRecord, (s) => s.userId === row.user_id);
    },
    async save(token, session) {
      const hash = sessionTokenHash(token);
      upsert.run(hash, session.userId, encode('sessions', hash.slice(0, 12), session, isSessionRecord));
    },
  };
}

/** @implements ERR-INTERNAL-UNEXPECTED */
function loginAttemptRepository(db: SqliteDatabase): LoginAttemptRepositoryPort {
  const byUsername = db.prepare<[string], { readonly failures: string }>('SELECT failures FROM login_attempts WHERE username = ?');
  const upsert = db.prepare('INSERT INTO login_attempts (username, failures) VALUES (?, ?) ON CONFLICT (username) DO UPDATE SET failures = excluded.failures');
  return {
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
  const byId = db.prepare<[string], KeyedRow>('SELECT id, owner_user_id, data FROM pets WHERE id = ?');
  const byOwners = db.prepare<[string], KeyedRow>('SELECT id, owner_user_id, data FROM pets WHERE owner_user_id IN (SELECT value FROM json_each(?))');
  const upsert = db.prepare(
    'INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET owner_user_id = excluded.owner_user_id, data = excluded.data',
  );
  // INV-PET-005: ON DELETE CASCADE borra en la misma sentencia los registros de los 6 módulos.
  const remove = db.prepare('DELETE FROM pets WHERE id = ?');
  const toPet = (row: KeyedRow): PetProfile => decode('pets', row.id, row.data, validatePetProfile, (p) => p.id === row.id && p.ownerUserId === row.owner_user_id);
  return {
    async findById(petId) {
      const row = byId.get(petId);
      return row === undefined ? null : toPet(row);
    },
    async listByOwners(ownerUserIds) {
      return byOwners.all(list(ownerUserIds)).map(toPet);
    },
    async save(pet) {
      upsert.run(pet.id, pet.ownerUserId, encode('pets', pet.id, pet, validatePetProfile));
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
      byPet: db.prepare<[string], RecordRow>(`SELECT id, pet_id, data FROM ${table} WHERE pet_id = ?`),
      insert: db.prepare<[string, string, string]>(`INSERT INTO ${table} (id, pet_id, data) VALUES (?, ?, ?)`),
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
          .map((row) => decode(table, row.id, row.data, check as Check<{ id: string; petId: string }>, (r) => r.id === row.id && r.petId === row.pet_id));
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
      statements[module].insert.run(record.id, record.petId, encode(table, record.id, record, check as Check<RecordOf<M>>));
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
  const toHousehold = (row: KeyedRow): Household =>
    decode('households', row.id, row.data, validateHousehold, (h) => h.id === row.id && h.ownerUserId === row.owner_user_id);
  const toMembership = (row: MembershipRow): HouseholdMember =>
    decode(
      'household_members',
      row.membership_id,
      row.data,
      validateHouseholdMember,
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
      const data = encode('household_members', membership.membershipId, membership, validateHouseholdMember);
      upsertMembership.run(membership.membershipId, membership.householdId, membership.userId, membership.status, membership.firstJoinedAt, data);
    },
  };
}

/**
 * Los 6 repositorios sobre una conexión. Las sentencias se preparan una vez.
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
  };
}
