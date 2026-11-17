/**
 * Repositorios PostgreSQL detrás de los puertos de aplicación (misma firma que el adaptador SQLite). Solo se usan dentro de
 * `PostgresUnitOfWork.runInTransaction`, sobre el cliente de esa transacción.
 * - PARTE 1 (T422): usuarios, sesiones, intentos de acceso, límites de frecuencia y tokens de respaldo.
 * - PARTE 2 (T423): mascotas, pesos y los 5 módulos clínicos (cascadas por ON DELETE CASCADE; microchip único en todo el sistema
 *   impuesto por el índice parcial `pets_microchip_global` (0004, REQ-PET4-001), cuya violación 23505 el caso de uso mapea por su nombre
 *   exacto sin propagar `detail` ni `constraint` del driver).
 * - PARTE 3 (T424): hogares, membresías, invitaciones, asignaciones y auditoría; `createPostgresRepositories` compone las 3
 *   partes en el `RepositorySet` completo. Un solo propietario ACTIVE por hogar (INV-HOUSE2-001) y una sola invitación abierta
 *   por (hogar, username) (INV-HOUSE-003) los imponen los índices parciales; sus violaciones 23505 se propagan sin traducir.
 * - SQL siempre parametrizado con `$n` posicionales: ningún valor se interpola en el texto de la sentencia. Las únicas plantillas
 *   componen constantes SQL (la lista de columnas de `users`).
 * - Cada fila guarda el objeto del contrato en `data` (JSONB) y repite en columnas las claves y referencias. Frontera validada
 *   (INV-ARCH-004): al escribir y al leer el objeto se valida y las columnas deben coincidir con `data`; un dato inválido o
 *   corrupto produce ERR-INTERNAL-UNEXPECTED controlado, igual que en SQLite.
 * - `pg` entrega JSONB ya parseado y COUNT(*) como bigint en texto: ambos se normalizan aquí.
 * - INV-AUTH-003: el hash de la contraseña va en su columna, nunca en `data`; el token de sesión se guarda como SHA-256.
 * - Sin lectura del entorno (INV-ARCH-006) ni consulta a la tabla de migraciones (T464).
 *
 * @implements REQ-PG-002, INV-HOUSE-003, INV-HOUSE2-001, REQ-AUD-001, INV-PET-005, REQ-PET2-001, INV-ARCH-004, INV-AUTH-003, INV-AUTH2-002, REQ-AUTH2-003, REQ-ACC-001, REQ-ACC-002, ERR-INTERNAL-UNEXPECTED
 */

import {
  DomainError,
  validateHousehold,
  type AuditEntry,
  type Household,
  type UserPublicProfile,
} from '../../../generated/index.ts';
// 3.1.0 (feature 004): el `username` admite mayúsculas (REQ-LOG-002); el top-level generado sigue en 3.0.0.
import { validateUserPublicProfile } from '../../../generated/v31/index.ts';
import { isStoredPetProfile, type PetProfile, type PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type {
  AuditLogRepositoryPort,
  ConfirmationTokenRepositoryPort,
  HouseholdRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetAssignmentRecord,
  PetAssignmentRepositoryPort,
  PetRepositoryPort,
  RateLimitRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
  MediaDeletionEntry,
  MediaDeletionQueuePort,
  PetMediaRecord,
  PetMediaRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import { corruptData, encodeRecord, isSessionRecord, sessionTokenHash, withRevision } from '../sqlite/sqlite-repositories.ts';
import type { PoolClientLike } from './postgres-database.ts';
import { isLegacyHouseholdMember, isOwnerRow, type LegacyHouseholdMember } from '../../../domain/households/household-policies.ts';
import { STORED_RECORD_CHECKS, type RecordModule, type RecordOf } from '../../../domain/records/record-invariants.ts';
import { weightKgToGrams } from '../../../domain/records/weight-limits.ts';

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
    async findByIdForUpdate(userId) {
      // Candado del propietario (REQ-BOR-005): va antes que el de la mascota (orden usuario -> mascota).
      const { rows } = await client.query(`${USER_COLUMNS} WHERE id = $1 FOR UPDATE`, [userId]);
      return rows[0] === undefined ? null : toAccount(rows[0]);
    },
    async findByUsername(username) {
      const { rows } = await client.query(`${USER_COLUMNS} WHERE LOWER(username) = LOWER($1)`, [username]);
      return rows[0] === undefined ? null : toAccount(rows[0]);
    },
    async listByEmail(normalizedEmail) {
      const { rows } = await client.query(`${USER_COLUMNS} WHERE LOWER(email) = LOWER($1) LIMIT 2`, [normalizedEmail]);
      return rows.map(toAccount);
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

/** Tabla de cada módulo de registros y su validador generado (los nombres de tabla son constantes, nunca entrada). */
const RECORD_TABLES: { readonly [M in RecordModule]: { readonly table: string; readonly check: Check<RecordOf<M>> } } = {
  weights: { table: 'weights', check: STORED_RECORD_CHECKS.weights },
  bodyMeasurements: { table: 'body_measurements', check: STORED_RECORD_CHECKS.bodyMeasurements },
  vaccinations: { table: 'vaccinations', check: STORED_RECORD_CHECKS.vaccinations },
  dewormings: { table: 'dewormings', check: STORED_RECORD_CHECKS.dewormings },
  medicalVisits: { table: 'medical_visits', check: STORED_RECORD_CHECKS.medicalVisits },
  customParameters: { table: 'custom_parameters', check: STORED_RECORD_CHECKS.customParameters },
};
const RECORD_MODULE_NAMES = Object.keys(RECORD_TABLES) as RecordModule[];

const PET_COLUMNS = 'id, owner_user_id, data, species, species_other, neutered, microchip_id, birth_date_is_estimate';

/** @implements INV-ARCH-004, INV-PET-005, REQ-PET2-001, ERR-INTERNAL-UNEXPECTED */
function petRepository(client: PoolClientLike): PetRepositoryPort {
  const toPet = (row: Row): PetProfile => {
    const id = String(row['id']);
    const neutered = row['neutered'];
    return decode(
      'pets',
      id,
      row['data'],
      isStoredPetProfile,
      (p) =>
        p.id === row['id'] &&
        p.ownerUserId === row['owner_user_id'] &&
        p.species === row['species'] &&
        p.speciesOther === row['species_other'] &&
        p.neutered === (neutered === null ? null : Number(neutered) === 1) &&
        p.microchipId === row['microchip_id'] &&
        p.birthDateIsEstimate === (Number(row['birth_date_is_estimate']) === 1),
    );
  };
  return {
    async findById(petId) {
      const { rows } = await client.query(`SELECT ${PET_COLUMNS} FROM pets WHERE id = $1`, [petId]);
      return rows[0] === undefined ? null : toPet(rows[0]);
    },
    async findByIdForUpdate(petId) {
      // Candado de mascota (REQ-BOR-005, ADR-004-05): la fila queda bloqueada hasta el COMMIT o el ROLLBACK.
      const { rows } = await client.query(`SELECT ${PET_COLUMNS} FROM pets WHERE id = $1 FOR UPDATE`, [petId]);
      return rows[0] === undefined ? null : toPet(rows[0]);
    },
    async listByOwners(ownerUserIds) {
      const { rows } = await client.query(`SELECT ${PET_COLUMNS} FROM pets WHERE owner_user_id = ANY($1::text[])`, [[...ownerUserIds]]);
      return rows.map(toPet);
    },
    async save(pet) {
      // UPSERT (no REPLACE): reemplazar una mascota no dispara la cascada de sus registros. Un microchip repetido, propio o de
      // otro propietario, viola `pets_microchip_global` (23505): este adaptador no lo traduce; `mapMicrochipViolation` lo hace en el caso de uso
      // (INV-PET-005, REQ-PET4-001).
      await client.query(
        `INSERT INTO pets (${PET_COLUMNS}) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, data = EXCLUDED.data, species = EXCLUDED.species,
           species_other = EXCLUDED.species_other, neutered = EXCLUDED.neutered, microchip_id = EXCLUDED.microchip_id,
           birth_date_is_estimate = EXCLUDED.birth_date_is_estimate`,
        [
          pet.id,
          pet.ownerUserId,
          encode('pets', pet.id, pet, isStoredPetProfile),
          pet.species,
          pet.speciesOther,
          pet.neutered === null ? null : pet.neutered ? 1 : 0,
          pet.microchipId,
          pet.birthDateIsEstimate ? 1 : 0,
        ],
      );
    },
    async delete(petId) {
      // INV-PET-005: ON DELETE CASCADE borra en la misma sentencia los registros de los 6 módulos y las asignaciones.
      await client.query('DELETE FROM pets WHERE id = $1', [petId]);
    },
    async findAvatarVersions(petIds) {
      const { rows } = await client.query('SELECT id, avatar_version, avatar_object_id FROM pets WHERE id = ANY($1::text[])', [[...petIds]]);
      return new Map(rows.map((row) => [String(row['id']), row['avatar_object_id'] === null ? null : Number(row['avatar_version'])] as const));
    },
    async findAvatar(petId) {
      const { rows } = await client.query('SELECT avatar_version, avatar_object_id FROM pets WHERE id = $1', [petId]);
      return rows[0] === undefined ? null : { version: Number(rows[0]['avatar_version']), objectId: (rows[0]['avatar_object_id'] as string | null) ?? null };
    },
    async replaceAvatar(petId, objectId) {
      // Una sola sentencia: la versión solo crece (INV-AVA-001). Sin fila afectada, la mascota no existe.
      const { rows } = await client.query('UPDATE pets SET avatar_version = avatar_version + 1, avatar_object_id = $1 WHERE id = $2 RETURNING avatar_version, avatar_object_id', [objectId, petId]);
      if (rows[0] === undefined) throw new Error('FOREIGN KEY constraint failed: pets');
      return { version: Number(rows[0]['avatar_version']), objectId: rows[0]['avatar_object_id'] as string };
    },
    async clearAvatar(petId) {
      await client.query('UPDATE pets SET avatar_object_id = NULL WHERE id = $1', [petId]);
    },
    async raiseAvatarVersion(petId, version) {
      await client.query('UPDATE pets SET avatar_version = $1 WHERE id = $2 AND avatar_version < $1', [version, petId]);
    },
  };
}

const MEDIA_COLUMNS = 'id, pet_id, kind, mime, size_bytes, original_name, created_at';
/** Clave derivada del medio (INV-ARC-003), idéntica en SQL a `mediaObjectKey` del dominio. */
const DERIVED_MEDIA_KEY = "'pets/' || pet_id || '/' || CASE kind WHEN 'FILE' THEN 'files' ELSE 'photos' END || '/' || id";

const toMedia = (row: Row): PetMediaRecord => ({
  id: String(row['id']),
  petId: String(row['pet_id']),
  kind: row['kind'] as PetMediaRecord['kind'],
  mime: String(row['mime']),
  sizeBytes: Number(row['size_bytes']),
  originalName: String(row['original_name']),
  createdAt: String(row['created_at']),
});

/** `pet_media` (REQ-GCS-005): solo metadatos; la clave del objeto se deriva. @implements REQ-GCS-005, INV-ALB-001, REQ-ARC-005 */
function mediaRepository(client: PoolClientLike): PetMediaRepositoryPort {
  return {
    async insert(media) {
      await client.query(`INSERT INTO pet_media (${MEDIA_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        media.id, media.petId, media.kind, media.mime, media.sizeBytes, media.originalName, media.createdAt,
      ]);
    },
    async findById(petId, mediaId) {
      const { rows } = await client.query(`SELECT ${MEDIA_COLUMNS} FROM pet_media WHERE id = $1 AND pet_id = $2`, [mediaId, petId]);
      return rows[0] === undefined ? null : toMedia(rows[0]);
    },
    async listPage(petId, kind, limit, offset) {
      const { rows } = await client.query(`SELECT ${MEDIA_COLUMNS} FROM pet_media WHERE pet_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, [petId, kind, limit, offset]);
      const total = await client.query('SELECT COUNT(*) AS n FROM pet_media WHERE pet_id = $1 AND ($2::text IS NULL OR kind = $2)', [petId, kind]);
      return { items: rows.map(toMedia), total: count(total.rows[0]) };
    },
    async countBytesOfOwner(ownerUserId) {
      const { rows } = await client.query('SELECT COALESCE(SUM(m.size_bytes), 0) AS n FROM pet_media m JOIN pets p ON p.id = m.pet_id WHERE p.owner_user_id = $1', [ownerUserId]);
      return count(rows[0]);
    },
    async remove(petId, mediaId) {
      const result = await client.query('DELETE FROM pet_media WHERE id = $1 AND pet_id = $2', [mediaId, petId]);
      return result.rowCount === 1;
    },
    async countObjectsOfPets(petIds) {
      const { rows } = await client.query(
        'SELECT (SELECT COUNT(*) FROM pet_media WHERE pet_id = ANY($1::text[])) + (SELECT COUNT(*) FROM pets WHERE id = ANY($1::text[]) AND avatar_object_id IS NOT NULL) AS n',
        [[...petIds]],
      );
      return count(rows[0]);
    },
  };
}

const toQueueEntry = (row: Row): MediaDeletionEntry => ({
  objectKey: String(row['object_key']),
  reason: row['reason'] as MediaDeletionEntry['reason'],
  enqueuedAt: String(row['enqueued_at']),
  attempts: Number(row['attempts']),
});

/** `media_deletion_queue` (REQ-GCS-004, REQ-GCS-006): sin clave foránea. @implements REQ-GCS-004, REQ-GCS-006, INV-GCS-002 */
function mediaQueueRepository(client: PoolClientLike): MediaDeletionQueuePort {
  return {
    async enqueue(objectKey, reason, enqueuedAt) {
      await client.query(
        `INSERT INTO media_deletion_queue (object_key, reason, enqueued_at) VALUES ($1, $2, $3)
         ON CONFLICT (object_key) DO UPDATE SET reason = CASE WHEN EXCLUDED.reason = 'DELETE' THEN 'DELETE' ELSE media_deletion_queue.reason END`,
        [objectKey, reason, enqueuedAt],
      );
    },
    async enqueueObjectsOfPet(petId, enqueuedAt) {
      // INSERT … SELECT con las claves derivadas (medios y avatar) en la misma sentencia y la misma transacción (data-model.md §3).
      const { rows } = await client.query(
        `INSERT INTO media_deletion_queue (object_key, reason, enqueued_at)
         SELECT ${DERIVED_MEDIA_KEY}, 'DELETE', $2 FROM pet_media WHERE pet_id = $1
         UNION ALL SELECT 'pets/' || id || '/avatar/' || avatar_object_id, 'DELETE', $2 FROM pets WHERE id = $1 AND avatar_object_id IS NOT NULL
         ON CONFLICT (object_key) DO UPDATE SET reason = 'DELETE'
         RETURNING object_key`,
        [petId, enqueuedAt],
      );
      return rows.map((row) => String(row['object_key']));
    },
    async findByKey(objectKey) {
      const { rows } = await client.query('SELECT object_key, reason, enqueued_at, attempts FROM media_deletion_queue WHERE object_key = $1', [objectKey]);
      return rows[0] === undefined ? null : toQueueEntry(rows[0]);
    },
    async listPending(limit) {
      const { rows } = await client.query('SELECT object_key, reason, enqueued_at, attempts FROM media_deletion_queue ORDER BY enqueued_at, object_key LIMIT $1', [limit]);
      return rows.map(toQueueEntry);
    },
    async remove(objectKey) {
      await client.query('DELETE FROM media_deletion_queue WHERE object_key = $1', [objectKey]);
    },
    async recordFailure(objectKey) {
      await client.query('UPDATE media_deletion_queue SET attempts = attempts + 1 WHERE object_key = $1', [objectKey]);
    },
    async promoteStaleIntents(olderThanExclusive) {
      const result = await client.query("UPDATE media_deletion_queue SET reason = 'DELETE' WHERE reason = 'INTENT' AND enqueued_at < $1", [olderThanExclusive]);
      return result.rowCount ?? 0;
    },
    async countOlderThan(cutoffExclusive) {
      const { rows } = await client.query('SELECT COUNT(*) AS n FROM media_deletion_queue WHERE enqueued_at < $1', [cutoffExclusive]);
      return count(rows[0]);
    },
  };
}

/** @implements INV-ARCH-004, INV-PET-005, INV-REC2-002, ERR-INTERNAL-UNEXPECTED */
function recordRepository(client: PoolClientLike): MedicalRecordRepositoryPort {
  const isWeights = (module: RecordModule) => module === 'weights';
  const PET_OF_RECORD = RECORD_MODULE_NAMES.map((m) => `SELECT pet_id FROM ${RECORD_TABLES[m].table} WHERE id = $1`).join(' UNION ALL ') + ' LIMIT 1';
  return {
    async listForPet(petId) {
      const result = {} as Record<RecordModule, unknown[]>;
      for (const module of RECORD_MODULE_NAMES) {
        const { table, check } = RECORD_TABLES[module];
        const { rows } = await client.query(`SELECT id, pet_id, data, revision${isWeights(module) ? ', weight_grams' : ''} FROM ${table} WHERE pet_id = $1`, [petId]);
        result[module] = rows.map((row) =>
          decode(table, String(row['id']), withRevision(table, String(row['id']), row['data'], Number(row['revision'])), check as Check<{ id: string; petId: string; weightKg?: number }>, (r) =>
            r.id === row['id'] && r.petId === row['pet_id'] && (!isWeights(module) || Number(row['weight_grams']) === weightKgToGrams(r.weightKg!)),
          ),
        );
      }
      return result as unknown as PetRecordCollections;
    },
    async findPetIdOfRecord(recordId) {
      const { rows } = await client.query(PET_OF_RECORD, [recordId]);
      const row = rows[0];
      if (row === undefined) return null;
      if (typeof row['pet_id'] !== 'string') throw corruptData('records', recordId);
      return row['pet_id'];
    },
    async add<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const { table, check } = RECORD_TABLES[module];
      const { data, revision } = encodeRecord(table, record, check as Check<RecordOf<M>>);
      if (isWeights(module)) {
        await client.query('INSERT INTO weights (id, pet_id, data, revision, weight_grams) VALUES ($1, $2, $3::jsonb, $4, $5)', [
          record.id,
          record.petId,
          data,
          revision,
          weightKgToGrams((record as RecordOf<'weights'>).weightKg),
        ]);
      } else {
        await client.query(`INSERT INTO ${table} (id, pet_id, data, revision) VALUES ($1, $2, $3::jsonb, $4)`, [record.id, record.petId, data, revision]);
      }
    },
    async replace<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const { table, check } = RECORD_TABLES[module];
      const { data, revision } = encodeRecord(table, record, check as Check<RecordOf<M>>);
      const result = isWeights(module)
        ? await client.query('UPDATE weights SET data = $1::jsonb, revision = $2, weight_grams = $3 WHERE id = $4 AND pet_id = $5', [
            data,
            revision,
            weightKgToGrams((record as RecordOf<'weights'>).weightKg),
            record.id,
            record.petId,
          ])
        : await client.query(`UPDATE ${table} SET data = $1::jsonb, revision = $2 WHERE id = $3 AND pet_id = $4`, [data, revision, record.id, record.petId]);
      if (result.rowCount !== 1) throw corruptData(table, record.id);
    },
    async remove(module, petId, recordId) {
      const result = await client.query(`DELETE FROM ${RECORD_TABLES[module].table} WHERE id = $1 AND pet_id = $2`, [recordId, petId]);
      return result.rowCount === 1;
    },
    async deleteForPet(petId) {
      for (const module of RECORD_MODULE_NAMES) await client.query(`DELETE FROM ${RECORD_TABLES[module].table} WHERE pet_id = $1`, [petId]);
    },
  };
}

/** Repositorios de la parte 2 (T423): mascotas y registros clínicos. */
export type PostgresRepositoriesPart2 = Pick<RepositorySet, 'pets' | 'records' | 'media' | 'mediaQueue'>;

/** @implements REQ-PG-002, INV-ARCH-005 */
export function createPostgresRepositoriesPart2(client: PoolClientLike): PostgresRepositoriesPart2 {
  return { pets: petRepository(client), records: recordRepository(client), media: mediaRepository(client), mediaQueue: mediaQueueRepository(client) };
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

const MEMBERSHIP_COLUMNS = 'membership_id, household_id, user_id, status, first_joined_at, data';
const INVITATION_COLUMNS = 'id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at, responded_at';
const ASSIGNMENT_COLUMNS = 'pet_id, household_id, assigned_by_user_id, assigned_at';

/** @implements INV-ARCH-004, INV-HOUSE-003, INV-HOUSE2-001, ERR-INTERNAL-UNEXPECTED */
function householdRepository(client: PoolClientLike): HouseholdRepositoryPort {
  const toHousehold = (row: Row): Household =>
    decode('households', String(row['id']), row['data'], validateHousehold, (h) => h.id === row['id'] && h.ownerUserId === row['owner_user_id']);
  const toMembership = (row: Row): LegacyHouseholdMember =>
    decode<LegacyHouseholdMember>(
      'household_members',
      String(row['membership_id']),
      row['data'],
      isLegacyHouseholdMember,
      (m) =>
        m.membershipId === row['membership_id'] &&
        m.householdId === row['household_id'] &&
        m.userId === row['user_id'] &&
        m.status === row['status'] &&
        m.firstJoinedAt === row['first_joined_at'],
    );
  return {
    async findById(householdId) {
      const { rows } = await client.query('SELECT id, owner_user_id, data FROM households WHERE id = $1', [householdId]);
      return rows[0] === undefined ? null : toHousehold(rows[0]);
    },
    async insert(household) {
      await client.query('INSERT INTO households (id, owner_user_id, data) VALUES ($1, $2, $3::jsonb)', [
        household.id,
        household.ownerUserId,
        encode('households', household.id, household, validateHousehold),
      ]);
    },
    async deleteWithMemberships(householdId) {
      // C5: ON DELETE CASCADE borra membresías, invitaciones y asignaciones del hogar; las mascotas no se tocan.
      await client.query('DELETE FROM households WHERE id = $1', [householdId]);
    },
    async listMemberships(householdId) {
      const { rows } = await client.query(`SELECT ${MEMBERSHIP_COLUMNS} FROM household_members WHERE household_id = $1`, [householdId]);
      return rows.map(toMembership);
    },
    async listMembershipsOfUsers(userIds) {
      const { rows } = await client.query(`SELECT ${MEMBERSHIP_COLUMNS} FROM household_members WHERE user_id = ANY($1::text[])`, [[...userIds]]);
      return rows.map(toMembership);
    },
    async saveMembership(membership) {
      const data = encode('household_members', membership.membershipId, membership, isLegacyHouseholdMember);
      // role e is_household_owner reflejan el rol de data; household_members_one_owner (índice parcial) exige un único propietario ACTIVE.
      const owner = isOwnerRow(membership);
      const role = owner ? 'ADMIN' : membership.role === 'MEMBER' ? 'READER' : membership.role;
      await client.query(
        `INSERT INTO household_members (${MEMBERSHIP_COLUMNS}, role, is_household_owner) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (membership_id) DO UPDATE SET household_id = EXCLUDED.household_id, user_id = EXCLUDED.user_id,
           status = EXCLUDED.status, first_joined_at = EXCLUDED.first_joined_at, data = EXCLUDED.data,
           role = EXCLUDED.role, is_household_owner = EXCLUDED.is_household_owner`,
        [membership.membershipId, membership.householdId, membership.userId, membership.status, membership.firstJoinedAt, data, role, owner ? 1 : 0],
      );
    },
    async deleteMembershipsOfUser(userId) {
      await client.query('DELETE FROM household_members WHERE user_id = $1', [userId]);
    },
    async updateOwner(householdId, ownerUserId) {
      // La columna y data.ownerUserId cambian juntos (la lectura comprueba que coincidan).
      const result = await client.query(
        "UPDATE households SET owner_user_id = $1, data = jsonb_set(data, '{ownerUserId}', to_jsonb($1::text)) WHERE id = $2",
        [ownerUserId, householdId],
      );
      if (result.rowCount !== 1) throw new Error(`households: el hogar ${householdId} no existe`);
    },
  };
}

/** @implements REQ-HOUSE2-001, INV-HOUSE-003 */
function invitationRepository(client: PoolClientLike): InvitationRepositoryPort {
  const toRecord = (row: Row): InvitationRecord => ({
    invitationId: row['id'] as string,
    householdId: row['household_id'] as string,
    inviteeUsername: row['invitee_username'] as string,
    inviteeUserId: row['invitee_user_id'] as string | null,
    roleOnJoin: row['role_on_join'] as InvitationRecord['roleOnJoin'],
    invitedByUserId: row['invited_by_user_id'] as string,
    status: row['status'] as InvitationRecord['status'],
    createdAt: row['created_at'] as string,
    respondedAt: row['responded_at'] as string | null,
  });
  return {
    async findOpen(householdId, inviteeUsername) {
      const { rows } = await client.query(
        `SELECT ${INVITATION_COLUMNS} FROM household_invitations WHERE household_id = $1 AND LOWER(invitee_username) = LOWER($2) AND status = 'INVITED'`,
        [householdId, inviteeUsername],
      );
      return rows[0] === undefined ? null : toRecord(rows[0]);
    },
    async save(invitation) {
      // INV-HOUSE-003: household_invitations_one_open (hogar, LOWER(invitee_username)) rechaza una segunda INVITED con 23505 (REQ-LOG-002).
      await client.query(
        `INSERT INTO household_invitations (${INVITATION_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET household_id = EXCLUDED.household_id, invitee_username = EXCLUDED.invitee_username,
           invitee_user_id = EXCLUDED.invitee_user_id, invited_by_user_id = EXCLUDED.invited_by_user_id, role_on_join = EXCLUDED.role_on_join,
           status = EXCLUDED.status, created_at = EXCLUDED.created_at, responded_at = EXCLUDED.responded_at`,
        [
          invitation.invitationId,
          invitation.householdId,
          invitation.inviteeUsername,
          invitation.inviteeUserId,
          invitation.invitedByUserId,
          invitation.roleOnJoin,
          invitation.status,
          invitation.createdAt,
          invitation.respondedAt,
        ],
      );
    },
    async listOpenForUser(userId) {
      const { rows } = await client.query(
        `SELECT ${INVITATION_COLUMNS} FROM household_invitations WHERE invitee_user_id = $1 AND status = 'INVITED' ORDER BY created_at ASC, household_id ASC`,
        [userId],
      );
      return rows.map(toRecord);
    },
    async listByHousehold(householdId) {
      const { rows } = await client.query(`SELECT ${INVITATION_COLUMNS} FROM household_invitations WHERE household_id = $1`, [householdId]);
      return rows.map(toRecord);
    },
    async deleteForUser(userId) {
      await client.query('DELETE FROM household_invitations WHERE invited_by_user_id = $1 OR invitee_user_id = $1', [userId]);
    },
    async deleteForHousehold(householdId) {
      await client.query('DELETE FROM household_invitations WHERE household_id = $1', [householdId]);
    },
  };
}

/** @implements REQ-HOUSE2-003 */
function assignmentRepository(client: PoolClientLike): PetAssignmentRepositoryPort {
  const toRecord = (row: Row): PetAssignmentRecord => ({
    petId: row['pet_id'] as string,
    householdId: row['household_id'] as string,
    assignedByUserId: row['assigned_by_user_id'] as string,
    assignedAt: row['assigned_at'] as string,
  });
  return {
    async listByHousehold(householdId) {
      const { rows } = await client.query(`SELECT ${ASSIGNMENT_COLUMNS} FROM pet_assignments WHERE household_id = $1 ORDER BY pet_id`, [householdId]);
      return rows.map(toRecord);
    },
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${ASSIGNMENT_COLUMNS} FROM pet_assignments WHERE pet_id = $1 ORDER BY household_id`, [petId]);
      return rows.map(toRecord);
    },
    async save(assignment) {
      await client.query(
        `INSERT INTO pet_assignments (${ASSIGNMENT_COLUMNS}) VALUES ($1, $2, $3, $4)
         ON CONFLICT (pet_id, household_id) DO UPDATE SET assigned_by_user_id = EXCLUDED.assigned_by_user_id, assigned_at = EXCLUDED.assigned_at`,
        [assignment.petId, assignment.householdId, assignment.assignedByUserId, assignment.assignedAt],
      );
    },
    async remove(petId, householdId) {
      await client.query('DELETE FROM pet_assignments WHERE pet_id = $1 AND household_id = $2', [petId, householdId]);
    },
    async deleteForHousehold(householdId) {
      await client.query('DELETE FROM pet_assignments WHERE household_id = $1', [householdId]);
    },
    async deleteForPet(petId) {
      await client.query('DELETE FROM pet_assignments WHERE pet_id = $1', [petId]);
    },
  };
}

/**
 * `audit_log` (data-model §2.12): sin claves foráneas; los CHECK de la tabla rechazan valores fuera de los enums cerrados.
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-005
 */
function auditLogRepository(client: PoolClientLike): AuditLogRepositoryPort {
  return {
    async insert(entry: AuditEntry) {
      await client.query(
        'INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [entry.id, entry.timestamp, entry.executorUserId, entry.mutationType, entry.entityType, entry.entityId, entry.previousStateHash, entry.newStateHash],
      );
    },
    async pseudonymizeUser(userId, hmac) {
      await client.query(
        'UPDATE audit_log SET executor_user_id = CASE WHEN executor_user_id = $1 THEN $2 ELSE executor_user_id END, entity_id = CASE WHEN entity_id = $1 THEN $2 ELSE entity_id END WHERE executor_user_id = $1 OR entity_id = $1',
        [userId, hmac],
      );
    },
  };
}

/** Repositorios de la parte 3 (T424): hogares, invitaciones, asignaciones y auditoría. */
export type PostgresRepositoriesPart3 = Pick<RepositorySet, 'households' | 'invitations' | 'assignments' | 'auditLog'>;

/** @implements REQ-PG-002, INV-ARCH-005 */
export function createPostgresRepositoriesPart3(client: PoolClientLike): PostgresRepositoriesPart3 {
  return {
    households: householdRepository(client),
    invitations: invitationRepository(client),
    assignments: assignmentRepository(client),
    auditLog: auditLogRepository(client),
  };
}

/**
 * Fábrica completa: el `RepositorySet` de las 3 partes sobre el cliente de la transacción (se pasa a `PostgresUnitOfWork`).
 * @implements REQ-PG-002, INV-ARCH-005
 */
export function createPostgresRepositories(client: PoolClientLike): RepositorySet {
  return { ...createPostgresRepositoriesPart1(client), ...createPostgresRepositoriesPart2(client), ...createPostgresRepositoriesPart3(client) };
}
