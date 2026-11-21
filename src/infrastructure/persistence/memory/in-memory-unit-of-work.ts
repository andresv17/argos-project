/**
 * Repositorios en memoria detrás de UnitOfWorkPort.
 * - Cada transacción trabaja sobre una copia profunda del estado; si `work` termina y `beforeCommit` no lanza, la
 *   copia reemplaza al estado; si no, se descarta y la promesa se rechaza con el error original (INV-ARCH-005).
 * - Las transacciones se ejecutan en serie, en orden de llegada.
 * - Los objetos devueltos son copias: modificarlos no altera el estado guardado.
 * - Restricciones equivalentes a las de SQLite: id y username (sin distinguir mayúsculas) únicos en usuarios; id único por módulo de registros.
 *
 * @implements INV-ARCH-004, INV-ARCH-005
 */

import type { PetProfile } from '../../../domain/pet/pet-invariants.ts';
import { memorySceneConsentRepository, memorySceneRepository, type SceneMemoryState } from './in-memory-scene-repositories.ts';
import type { DeterministicFaultInjector } from '../fault-injector.ts';
import { DomainError, type Household } from '../../../generated/index.ts';
import type { AuditEntry } from '../../../generated/v31/index.ts';
import type { LegacyHouseholdMember } from '../../../domain/households/household-policies.ts';
import type {
  AuditLogRepositoryPort,
  ConfirmationTokenRepositoryPort,
  HouseholdRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
  PetAssignmentRecord,
  PetAssignmentRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetRepositoryPort,
  RateLimitEvent,
  RateLimitRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
  AvatarState,
  MediaDeletionEntry,
  MediaDeletionQueuePort,
  MediaDeletionReason,
  PetMediaRecord,
  PetMediaRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import { avatarObjectKey, mediaObjectKey } from '../../../domain/media/index.ts';
import { ShareLinkIdempotencyConflictError, type ShareAuditRecord, type ShareLinkAuditRepositoryPort, type ShareLinkRepositoryPort } from '../../../application/ports/share-link.port.ts';
import { EXPIRY_DAYS, type ShareLinkRecord, type ShareScope } from '../../../domain/sharing/share-link.ts';
import type { UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.ts';
import type { SessionRecord } from '../../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../../domain/records/record-invariants.ts';

const RECORD_MODULE_NAMES: readonly RecordModule[] = ['weights', 'bodyMeasurements', 'vaccinations', 'dewormings', 'medicalVisits', 'customParameters'];

export interface MemoryState extends SceneMemoryState {
  users: UserAccount[];
  sessions: Record<string, SessionRecord>;
  loginFailures: Record<string, string[]>;
  pets: PetProfile[];
  records: PetRecordCollections;
  households: Household[];
  memberships: LegacyHouseholdMember[];
  /** Token de confirmación de respaldo por usuario (una fila por usuario; solo el hash). */
  confirmationTokens: Record<string, StoredConfirmationToken>;
  rateEvents: RateLimitEvent[];
  invitations: InvitationRecord[];
  assignments: PetAssignmentRecord[];
  /** `pet_media` (REQ-GCS-005). */
  media: PetMediaRecord[];
  /** `media_deletion_queue` (REQ-GCS-004); sin relación con las mascotas, como en la base de datos. */
  mediaQueue: MediaDeletionEntry[];
  /** `avatar_version` y `avatar_object_id` por mascota; una mascota sin entrada tiene versión 0 y sin avatar. */
  avatars: Record<string, AvatarState>;
  /** Filas de auditoría en orden de inserción (REQ-AUD-001). */
  auditLog: AuditEntry[];
  /** `share_links` (feature 005, REQ-VET-*): solo el hash del token. */
  shareLinks: ShareLinkRecord[];
  /** `share_link_audit` (feature 005, REQ-VET-008). */
  shareAudit: ShareAuditRecord[];
  /** Escena del hogar (feature 006): `scenes`, `sceneAttempts`, `sceneConsents` y `sceneQuotaCarry` (opcionales; ausentes = vacías). */
}

export interface StoredConfirmationToken {
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export interface InMemoryUnitOfWorkOptions {
  /** Se ejecuta justo antes de confirmar; si lanza, la transacción se descarta (simula un fallo de commit). */
  readonly beforeCommit?: () => void;
  /** Fallo determinista de la escritura N de cada transacción (SC-004, T277). */
  readonly faultInjector?: DeterministicFaultInjector;
}

export function emptyMemoryState(): MemoryState {
  return {
    users: [],
    sessions: {},
    loginFailures: {},
    pets: [],
    records: { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] },
    households: [],
    memberships: [],
    confirmationTokens: {},
    rateEvents: [],
    invitations: [],
    assignments: [],
    media: [],
    mediaQueue: [],
    avatars: {},
    auditLog: [],
    shareLinks: [],
    shareAudit: [],
    scenes: [],
    sceneAttempts: [],
    sceneConsents: [],
    sceneQuotaCarry: [],
    householdPhotos: [],
  };
}

const copy = <T>(value: T): T => structuredClone(value);

function userRepository(state: MemoryState): UserRepositoryPort {
  return {
    async findById(userId) {
      return copy(state.users.find((u) => u.id === userId) ?? null);
    },
    async findByIdForUpdate(userId) {
      return copy(state.users.find((u) => u.id === userId) ?? null); // las transacciones de memoria van en serie
    },
    async findByUsername(username) {
      return copy(state.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null);
    },
    async listByEmail(normalizedEmail) {
      return copy(state.users.filter((u) => u.email !== null && u.email.toLowerCase() === normalizedEmail.toLowerCase()).slice(0, 2));
    },
    async listByIds(userIds) {
      return copy(state.users.filter((u) => userIds.includes(u.id)));
    },
    async insert(user) {
      if (state.users.some((u) => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase())) {
        throw new Error(`users: id o username duplicado (${user.id}, ${user.username})`);
      }
      state.users.push(copy(user));
    },
    async update(user) {
      const index = state.users.findIndex((u) => u.id === user.id && u.username === user.username);
      if (index < 0) throw new Error(`users: el usuario ${user.id} no existe`);
      state.users[index] = copy(user);
    },
    async delete(userId) {
      state.users = state.users.filter((u) => u.id !== userId);
      state.shareLinks = (state.shareLinks ?? []).filter((l) => l.createdByUserId !== userId); // como ON DELETE CASCADE
    },
    async countReferences(userId) {
      return (
        state.users.filter((u) => u.id === userId).length +
        state.pets.filter((p) => p.ownerUserId === userId).length +
        state.households.filter((h) => h.ownerUserId === userId).length +
        state.memberships.filter((m) => m.userId === userId).length +
        Object.values(state.sessions).filter((session) => session.userId === userId).length +
        state.invitations.filter((i) => i.invitedByUserId === userId || i.inviteeUserId === userId).length +
        (state.confirmationTokens[userId] === undefined ? 0 : 1) +
        state.rateEvents.filter((e) => e.userId === userId).length
      );
    },
  };
}

function sessionRepository(state: MemoryState): SessionRepositoryPort {
  return {
    async findByToken(token) {
      return copy(state.sessions[token] ?? null);
    },
    async save(token, session) {
      state.sessions[token] = copy(session);
    },
    async revokeOthers(userId, keepToken, nowIsoTimestamp) {
      let revoked = 0;
      for (const [token, session] of Object.entries(state.sessions)) {
        if (token === keepToken || session.userId !== userId || session.revokedAt !== null) continue;
        state.sessions[token] = { ...session, revokedAt: nowIsoTimestamp };
        revoked += 1;
      }
      return revoked;
    },
    async deleteByUser(userId) {
      for (const [token, session] of Object.entries(state.sessions)) if (session.userId === userId) delete state.sessions[token];
    },
  };
}

function loginAttemptRepository(state: MemoryState): LoginAttemptRepositoryPort {
  return {
    async listFailures(username) {
      return copy(state.loginFailures[username] ?? []);
    },
    async replaceFailures(username, failures) {
      state.loginFailures[username] = [...failures];
    },
    async deleteFailures(username) {
      delete state.loginFailures[username];
    },
  };
}

function confirmationTokenRepository(state: MemoryState): ConfirmationTokenRepositoryPort {
  return {
    async replaceForUser(userId, tokenHash, createdAt, expiresAt) {
      state.confirmationTokens[userId] = { tokenHash, createdAt, expiresAt, usedAt: null };
    },
    async consume(userId, tokenHash, nowIsoTimestamp) {
      const row = state.confirmationTokens[userId];
      if (row === undefined || row.tokenHash !== tokenHash || row.usedAt !== null || !(row.expiresAt > nowIsoTimestamp)) return false;
      state.confirmationTokens[userId] = { ...row, usedAt: nowIsoTimestamp };
      return true;
    },
    async deleteForUser(userId) {
      delete state.confirmationTokens[userId];
    },
  };
}

function rateLimitRepository(state: MemoryState): RateLimitRepositoryPort {
  return {
    async record(event) {
      state.rateEvents.push(copy(event));
    },
    async countSince(scope, userId, sinceExclusive) {
      return state.rateEvents.filter((e) => e.scope === scope && e.userId === userId && e.occurredAt > sinceExclusive).length;
    },
    async deleteForUser(userId) {
      state.rateEvents = state.rateEvents.filter((e) => e.userId !== userId);
    },
  };
}

function invitationRepository(state: MemoryState): InvitationRepositoryPort {
  return {
    async findOpen(householdId, inviteeUsername) {
      return copy(state.invitations.find((i) => i.householdId === householdId && i.inviteeUsername.toLowerCase() === inviteeUsername.toLowerCase() && i.status === 'INVITED') ?? null);
    },
    async save(invitation) {
      const clash = state.invitations.some(
        (i) => i.invitationId !== invitation.invitationId && invitation.status === 'INVITED' && i.status === 'INVITED' && i.householdId === invitation.householdId && i.inviteeUsername.toLowerCase() === invitation.inviteeUsername.toLowerCase(),
      );
      if (clash) throw new Error(`household_invitations: ya hay una invitación INVITED de ${invitation.inviteeUsername} en el hogar`);
      state.invitations = [...state.invitations.filter((i) => i.invitationId !== invitation.invitationId), copy(invitation)];
    },
    async listOpenForUser(userId) {
      return copy(
        state.invitations
          .filter((i) => i.inviteeUserId === userId && i.status === 'INVITED')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.householdId.localeCompare(b.householdId)),
      );
    },
    async listByHousehold(householdId) {
      return copy(state.invitations.filter((i) => i.householdId === householdId));
    },
    async deleteForUser(userId) {
      state.invitations = state.invitations.filter((i) => i.invitedByUserId !== userId && i.inviteeUserId !== userId);
    },
    async deleteForHousehold(householdId) {
      state.invitations = state.invitations.filter((i) => i.householdId !== householdId);
    },
  };
}

/** Como las columnas de 0014/0010 (REQ-FAL7-001): una mascota sembrada sin los campos nuevos se lee ALIVE, sin fecha y en versión 1. */
const withLifeFields = (pet: PetProfile): PetProfile => ({ ...pet, lifeStatus: pet.lifeStatus ?? 'ALIVE', deceasedAt: pet.deceasedAt ?? null, version: pet.version ?? 1 });

function petRepository(state: MemoryState): PetRepositoryPort {
  return {
    async findById(petId) {
      const found = state.pets.find((p) => p.id === petId);
      return found === undefined ? null : copy(withLifeFields(found));
    },
    async findByIdForUpdate(petId) {
      const found = state.pets.find((p) => p.id === petId); // las transacciones de memoria van en serie
      return found === undefined ? null : copy(withLifeFields(found));
    },
    async listByOwners(ownerUserIds) {
      return copy(state.pets.filter((p) => ownerUserIds.includes(p.ownerUserId)).map(withLifeFields));
    },
    async save(pet) {
      // Equivale a `pets_microchip_global` (REQ-PET4-001): el microchip no nulo es único en todo el sistema y la violación imita la de SQLite.
      if (pet.microchipId !== null && state.pets.some((p) => p.id !== pet.id && p.microchipId === pet.microchipId)) {
        throw Object.assign(new Error('UNIQUE constraint failed: pets.microchip_id'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
      }
      // Como el CHECK cruzado de 0014/0010 (REQ-FAL7-002): DECEASED <=> fecha de fallecimiento.
      if ((pet.lifeStatus === 'DECEASED') !== (pet.deceasedAt != null)) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Objeto inválido para pets (${pet.id}); no se guarda.`);
      // Como la columna y el CHECK de 0016/0012 (REQ-BIO8-001, REQ-BIO8-004): biografía de 0 a 280 caracteres, sin caracteres de control; nula o ausente = sin la clave.
      const { biography = null, ...profile } = pet;
      if (biography !== null && (biography.length > 280 || /[\u0000-\u001F\u007F]/u.test(biography))) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Objeto inválido para pets (${pet.id}); no se guarda.`);
      // Como las columnas de 0014/0010 (REQ-FAL7-001, REQ-FAL7-011): estado y fecha completos; sin `version` explícita, guardar sobre una fila existente la incrementa.
      const previous = state.pets.find((p) => p.id === pet.id);
      const version = pet.version ?? (previous === undefined ? 1 : (previous.version ?? 1) + 1);
      state.pets = [...state.pets.filter((p) => p.id !== pet.id), copy({ ...profile, lifeStatus: pet.lifeStatus ?? 'ALIVE', deceasedAt: pet.deceasedAt ?? null, version, ...(biography === null ? {} : { biography }) })];
    },
    async delete(petId) {
      state.pets = state.pets.filter((p) => p.id !== petId);
      state.assignments = state.assignments.filter((a) => a.petId !== petId); // como ON DELETE CASCADE
      state.media = state.media.filter((m) => m.petId !== petId); // como ON DELETE CASCADE (la cola no se toca: no tiene clave foránea)
      state.shareLinks = (state.shareLinks ?? []).filter((l) => l.petId !== petId); // como ON DELETE CASCADE
      delete state.avatars[petId];
    },
    async findAvatarVersions(petIds) {
      const wanted = new Set(petIds);
      return new Map(state.pets.filter((p) => wanted.has(p.id)).map((p) => [p.id, state.avatars[p.id]?.objectId != null ? state.avatars[p.id]!.version : null] as const));
    },
    async findAvatar(petId) {
      if (!state.pets.some((p) => p.id === petId)) return null;
      return copy(state.avatars[petId] ?? { version: 0, objectId: null });
    },
    async replaceAvatar(petId, objectId) {
      if (!state.pets.some((p) => p.id === petId)) throw new Error('FOREIGN KEY constraint failed');
      const next = { version: (state.avatars[petId]?.version ?? 0) + 1, objectId };
      state.avatars[petId] = next;
      return copy(next);
    },
    async clearAvatar(petId) {
      const current = state.avatars[petId];
      if (current !== undefined) state.avatars[petId] = { version: current.version, objectId: null };
    },
    async raiseAvatarVersion(petId, version) {
      if (!state.pets.some((p) => p.id === petId)) return;
      const current = state.avatars[petId] ?? { version: 0, objectId: null };
      if (version > current.version) state.avatars[petId] = { version, objectId: current.objectId };
    },
  };
}

function mediaRepository(state: MemoryState): PetMediaRepositoryPort {
  return {
    async insert(media) {
      if (!state.pets.some((p) => p.id === media.petId)) throw new Error('FOREIGN KEY constraint failed');
      if (state.media.some((m) => m.id === media.id)) throw new Error('UNIQUE constraint failed: pet_media.id');
      state.media = [...state.media, copy(media)];
    },
    async findById(petId, mediaId) {
      return copy(state.media.find((m) => m.id === mediaId && m.petId === petId) ?? null);
    },
    async listPage(petId, kind, limit, offset) {
      const all = state.media
        .filter((m) => m.petId === petId && (kind === null || m.kind === kind))
        .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
      return copy({ items: all.slice(offset, offset + limit), total: all.length });
    },
    async countByPetAndKind(petId, kind) {
      return state.media.filter((m) => m.petId === petId && m.kind === kind).length;
    },
    async countBytesOfOwner(ownerUserId) {
      const owned = new Set(state.pets.filter((p) => p.ownerUserId === ownerUserId).map((p) => p.id));
      const ownedHouseholds = new Set(state.households.filter((h) => h.ownerUserId === ownerUserId).map((h) => h.id));
      const photos = (state.householdPhotos ?? []).filter((h) => ownedHouseholds.has(h.householdId)).reduce((sum, h) => sum + h.sizeBytes, 0);
      return state.media.filter((m) => owned.has(m.petId)).reduce((sum, m) => sum + m.sizeBytes, 0) + photos;
    },
    async findInPets(petIds, mediaId) {
      const wanted = new Set(petIds);
      return copy(state.media.find((m) => m.id === mediaId && wanted.has(m.petId)) ?? null);
    },
    async remove(petId, mediaId) {
      const before = state.media.length;
      state.media = state.media.filter((m) => !(m.id === mediaId && m.petId === petId));
      return state.media.length < before;
    },
    async countObjectsOfPets(petIds) {
      const wanted = new Set(petIds);
      return state.media.filter((m) => wanted.has(m.petId)).length + [...wanted].filter((id) => state.pets.some((p) => p.id === id) && (state.avatars[id]?.objectId ?? null) !== null).length;
    },
  };
}

function mediaQueueRepository(state: MemoryState): MediaDeletionQueuePort {
  const upsert = (objectKey: string, reason: MediaDeletionReason, enqueuedAt: string) => {
    const existing = state.mediaQueue.find((e) => e.objectKey === objectKey);
    if (existing === undefined) state.mediaQueue = [...state.mediaQueue, { objectKey, reason, enqueuedAt, attempts: 0 }];
    else if (reason === 'DELETE' && existing.reason === 'INTENT') state.mediaQueue = state.mediaQueue.map((e) => (e.objectKey === objectKey ? { ...e, reason: 'DELETE' } : e));
  };
  return {
    async enqueue(objectKey, reason, enqueuedAt) {
      upsert(objectKey, reason, enqueuedAt);
    },
    async enqueueObjectsOfPet(petId, enqueuedAt) {
      const keys = state.media.filter((m) => m.petId === petId).map((m) => mediaObjectKey(petId, m.kind, m.id));
      const avatarId = state.avatars[petId]?.objectId ?? null;
      if (avatarId !== null) keys.push(avatarObjectKey(petId, avatarId));
      for (const key of keys) upsert(key, 'DELETE', enqueuedAt);
      return keys;
    },
    async findByKey(objectKey) {
      return copy(state.mediaQueue.find((e) => e.objectKey === objectKey) ?? null);
    },
    async listPending(limit) {
      return copy([...state.mediaQueue].sort((a, b) => (a.enqueuedAt === b.enqueuedAt ? (a.objectKey < b.objectKey ? -1 : 1) : a.enqueuedAt < b.enqueuedAt ? -1 : 1)).slice(0, limit));
    },
    async remove(objectKey) {
      state.mediaQueue = state.mediaQueue.filter((e) => e.objectKey !== objectKey);
    },
    async recordFailure(objectKey) {
      state.mediaQueue = state.mediaQueue.map((e) => (e.objectKey === objectKey ? { ...e, attempts: e.attempts + 1 } : e));
    },
    async promoteStaleIntents(olderThanExclusive) {
      let promoted = 0;
      state.mediaQueue = state.mediaQueue.map((e) => {
        if (e.reason !== 'INTENT' || !(e.enqueuedAt < olderThanExclusive)) return e;
        promoted += 1;
        return { ...e, reason: 'DELETE' };
      });
      return promoted;
    },
    async countOlderThan(cutoffExclusive) {
      return state.mediaQueue.filter((e) => e.enqueuedAt < cutoffExclusive).length;
    },
  };
}

function recordRepository(state: MemoryState): MedicalRecordRepositoryPort {
  return {
    async listForPet(petId) {
      const result = emptyMemoryState().records;
      for (const module of RECORD_MODULE_NAMES) {
        // `revision` siempre se devuelve (D-16 A): las filas anteriores a la 004 valen 0.
        (result[module] as unknown[]) = copy((state.records[module] as Array<{ petId: string; revision?: number }>).filter((r) => r.petId === petId)).map((r) => ({ ...r, revision: r.revision ?? 0 }));
      }
      return result;
    },
    async findPetIdOfRecord(recordId) {
      for (const module of RECORD_MODULE_NAMES) {
        const found = (state.records[module] as Array<{ id: string; petId: string }>).find((r) => r.id === recordId);
        if (found !== undefined) return found.petId;
      }
      return null;
    },
    async add<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const collection = state.records[module] as Array<RecordOf<M>>;
      if (collection.some((r) => r.id === record.id)) {
        throw new Error(`${module}: id duplicado (${record.id})`);
      }
      collection.push({ ...copy(record), revision: record.revision ?? 0 });
    },
    async replace<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const collection = state.records[module] as Array<RecordOf<M>>;
      const index = collection.findIndex((r) => r.id === record.id);
      if (index < 0) throw new Error(`${module}: registro inexistente (${record.id})`);
      collection[index] = { ...copy(record), revision: record.revision ?? 0 };
    },
    async remove(module, petId, recordId) {
      const collection = state.records[module] as Array<{ id: string; petId: string }>;
      const index = collection.findIndex((r) => r.id === recordId && r.petId === petId);
      if (index < 0) return false;
      collection.splice(index, 1);
      return true;
    },
    async deleteForPet(petId) {
      for (const module of RECORD_MODULE_NAMES) {
        (state.records[module] as unknown[]) = (state.records[module] as Array<{ petId: string }>).filter((r) => r.petId !== petId);
      }
    },
  };
}

function householdRepository(state: MemoryState): HouseholdRepositoryPort {
  return {
    async findById(householdId) {
      return copy(state.households.find((h) => h.id === householdId) ?? null);
    },
    async insert(household) {
      if (state.households.some((h) => h.id === household.id)) {
        throw new Error(`households: id duplicado (${household.id})`);
      }
      state.households.push(copy(household));
    },
    async deleteWithMemberships(householdId) {
      state.households = state.households.filter((h) => h.id !== householdId);
      state.memberships = state.memberships.filter((m) => m.householdId !== householdId);
      state.invitations = state.invitations.filter((i) => i.householdId !== householdId); // como ON DELETE CASCADE
      state.assignments = state.assignments.filter((a) => a.householdId !== householdId); // como ON DELETE CASCADE
      state.shareLinks = (state.shareLinks ?? []).filter((l) => l.householdId !== householdId); // como ON DELETE CASCADE
    },
    async listMemberships(householdId) {
      return copy(state.memberships.filter((m) => m.householdId === householdId));
    },
    async listMembershipsOfUsers(userIds) {
      return copy(state.memberships.filter((m) => userIds.includes(m.userId)));
    },
    async saveMembership(membership) {
      state.memberships = [...state.memberships.filter((m) => m.membershipId !== membership.membershipId), copy(membership)];
    },
    async deleteMembershipsOfUser(userId) {
      state.memberships = state.memberships.filter((m) => m.userId !== userId);
    },
    async updateOwner(householdId, ownerUserId) {
      const index = state.households.findIndex((h) => h.id === householdId);
      if (index < 0) throw new Error(`households: el hogar ${householdId} no existe`);
      state.households[index] = { ...state.households[index]!, ownerUserId };
    },
  };
}

function assignmentRepository(state: MemoryState): PetAssignmentRepositoryPort {
  return {
    async listByHousehold(householdId) {
      return copy(state.assignments.filter((a) => a.householdId === householdId));
    },
    async listByPet(petId) {
      return copy(state.assignments.filter((a) => a.petId === petId));
    },
    async save(assignment) {
      state.assignments = [...state.assignments.filter((a) => !(a.petId === assignment.petId && a.householdId === assignment.householdId)), copy(assignment)];
    },
    async remove(petId, householdId) {
      state.assignments = state.assignments.filter((a) => !(a.petId === petId && a.householdId === householdId));
    },
    async deleteForHousehold(householdId) {
      state.assignments = state.assignments.filter((a) => a.householdId !== householdId);
    },
    async deleteForPet(petId) {
      state.assignments = state.assignments.filter((a) => a.petId !== petId);
    },
  };
}

function auditLogRepository(state: MemoryState): AuditLogRepositoryPort {
  return {
    async insert(entry) {
      state.auditLog.push(copy(entry));
    },
    async pseudonymizeUser(userId, hmac) {
      state.auditLog = state.auditLog.map((e) => ({
        ...e,
        executorUserId: e.executorUserId === userId ? hmac : e.executorUserId,
        entityId: e.entityId === userId ? hmac : e.entityId,
      }));
    },
  };
}

const constraint = (message: string): Error => Object.assign(new Error(message), { code: 'SQLITE_CONSTRAINT' });

function shareLinkRepository(state: MemoryState): ShareLinkRepositoryPort {
  const links = (): ShareLinkRecord[] => (state.shareLinks ??= []);
  const byId = (a: ShareLinkRecord, b: ShareLinkRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const inScope = (scope: ShareScope, scopeId: string) => (l: ShareLinkRecord) => l.scope === scope && (scope === 'PET' ? l.petId === scopeId : l.householdId === scopeId);
  return {
    async lockScope() {
      // las transacciones de memoria van en serie: ya son el candado
    },
    async insert(link) {
      const rows = links();
      const coherent =
        (link.scope === 'PET' && link.petId !== null && link.householdId === null && link.petOwnerUserIdAtCreation !== null) ||
        (link.scope === 'HOUSEHOLD' && link.householdId !== null && link.petId === null && link.petOwnerUserIdAtCreation === null);
      if (!coherent) throw constraint('CHECK constraint failed: share_links scope');
      if (!(EXPIRY_DAYS as readonly number[]).includes(link.expiresInDays)) throw constraint('CHECK constraint failed: share_links expires_in_days');
      if (!(link.expiresAt > link.createdAt)) throw constraint('CHECK constraint failed: share_links expires_at');
      if (link.tokenHash.length !== 64) throw constraint('CHECK constraint failed: share_links token_hash');
      if (rows.some((l) => l.id === link.id || l.tokenHash === link.tokenHash)) throw constraint('UNIQUE constraint failed: share_links.token_hash');
      if (rows.some((l) => l.createdByUserId === link.createdByUserId && l.idempotencyKey === link.idempotencyKey)) throw new ShareLinkIdempotencyConflictError();
      if (!state.users.some((u) => u.id === link.createdByUserId)) throw constraint('FOREIGN KEY constraint failed');
      if (link.petId !== null && !state.pets.some((p) => p.id === link.petId)) throw constraint('FOREIGN KEY constraint failed');
      if (link.householdId !== null && !state.households.some((h) => h.id === link.householdId)) throw constraint('FOREIGN KEY constraint failed');
      state.shareLinks = [...rows, copy(link)];
    },
    async findByTokenHash(tokenHash) {
      return copy(links().find((l) => l.tokenHash === tokenHash) ?? null);
    },
    async findById(id) {
      return copy(links().find((l) => l.id === id) ?? null);
    },
    async findByIdempotencyKey(userId, idempotencyKey) {
      return copy(links().find((l) => l.createdByUserId === userId && l.idempotencyKey === idempotencyKey) ?? null);
    },
    async listByScope(scope, scopeId, retainedSince) {
      const rows = links().filter(inScope(scope, scopeId)).filter((l) => !(l.expiresAt < retainedSince || (l.revokedAt !== null && l.revokedAt < retainedSince)));
      return copy(rows.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)));
    },
    async countActive(scope, scopeId, now) {
      return links().filter(inScope(scope, scopeId)).filter((l) => l.revokedAt === null && l.expiresAt > now).length;
    },
    async revoke(id, now) {
      const link = links().find((l) => l.id === id);
      if (link === undefined || link.revokedAt !== null || !(link.expiresAt > now)) return false;
      state.shareLinks = links().map((l) => (l.id === id ? { ...l, revokedAt: now } : l));
      return true;
    },
    async purge(cutoffExclusive) {
      const before = links().length;
      state.shareLinks = links().filter((l) => !(l.expiresAt < cutoffExclusive || (l.revokedAt !== null && l.revokedAt < cutoffExclusive)));
      return before - state.shareLinks.length;
    },
    async listAll() {
      return copy([...links()].sort(byId));
    },
  };
}

function shareAuditRepository(state: MemoryState): ShareLinkAuditRepositoryPort {
  const rows = (): ShareAuditRecord[] => (state.shareAudit ??= []);
  return {
    async insert(row) {
      if (!['CREATED', 'REVOKED', 'ACCESS_OK', 'ACCESS_FAILED'].includes(row.eventType)) throw constraint('CHECK constraint failed: share_link_audit event_type');
      if (row.ipHmac !== null && row.ipHmac.length !== 64) throw constraint('CHECK constraint failed: share_link_audit ip_hmac');
      if (rows().some((r) => r.id === row.id)) throw constraint('UNIQUE constraint failed: share_link_audit.id');
      state.shareAudit = [...rows(), copy(row)];
    },
    async recordFailure(id, ipHmac, windowStart) {
      const existing = rows().find((r) => r.eventType === 'ACCESS_FAILED' && r.ipHmac === ipHmac && r.occurredAt === windowStart);
      if (existing !== undefined) {
        state.shareAudit = rows().map((r) => (r === existing ? { ...r, failCount: r.failCount + 1 } : r));
        return;
      }
      state.shareAudit = [...rows(), { id, shareLinkId: null, eventType: 'ACCESS_FAILED', occurredAt: windowStart, actorUserId: null, ipHmac, failCount: 1 }];
    },
    async clearActor(userId) {
      state.shareAudit = rows().map((r) => (r.actorUserId === userId ? { ...r, actorUserId: null } : r));
    },
    async purge({ withoutIpBefore, withIpBefore }) {
      const before = rows().length;
      state.shareAudit = rows().filter((r) => !(r.ipHmac === null ? r.occurredAt < withoutIpBefore : r.occurredAt < withIpBefore));
      return before - state.shareAudit.length;
    },
    async listAll() {
      return copy([...rows()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    },
  };
}

function repositoriesOver(state: MemoryState): RepositorySet {
  return {
    users: userRepository(state),
    sessions: sessionRepository(state),
    loginAttempts: loginAttemptRepository(state),
    pets: petRepository(state),
    records: recordRepository(state),
    households: householdRepository(state),
    confirmationTokens: confirmationTokenRepository(state),
    rateLimits: rateLimitRepository(state),
    invitations: invitationRepository(state),
    assignments: assignmentRepository(state),
    media: mediaRepository(state),
    mediaQueue: mediaQueueRepository(state),
    auditLog: auditLogRepository(state),
    shareLinks: shareLinkRepository(state),
    shareAudit: shareAuditRepository(state),
    scenes: memorySceneRepository(state),
    sceneConsents: memorySceneConsentRepository(state),
  };
}

/** @implements INV-ARCH-005 */
export class InMemoryUnitOfWork implements UnitOfWorkPort {
  private state: MemoryState;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    initialState: MemoryState = emptyMemoryState(),
    private readonly options: InMemoryUnitOfWorkOptions = {},
  ) {
    this.state = copy(initialState);
  }

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft = copy(this.state);
      this.options.faultInjector?.beginTransaction();
      const repositories = repositoriesOver(draft);
      const result = await work(this.options.faultInjector?.wrap(repositories) ?? repositories);
      this.options.beforeCommit?.();
      this.state = draft;
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Lectura sobre una copia que se descarta: nada de lo escrito dentro llega al estado (feature 005, REQ-VET-006). */
  runReadOnly<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => work(repositoriesOver(copy(this.state))));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Copia del estado confirmado (para pruebas). */
  snapshot(): MemoryState {
    return copy(this.state);
  }
}
