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
import type { AboutContentRecord, AboutContentRepositoryPort } from '../../../application/ports/about.port.ts';
import type {
  AdminAuditRecord,
  AdminAuditRepositoryPort,
  AdminDelegateRecord,
  AdminDelegateRepositoryPort,
  AdminParameterRepositoryPort,
  AdminFlowStateRepositoryPort,
  AdminIdentityRepositoryPort,
  AdminSessionRepositoryPort,
  AdminFlowStateRecord,
  AdminIdentityRecord,
  AdminSessionRecord,
  RegistrationDecisionRepositoryPort,
} from '../../../application/ports/admin.port.ts';
import type {
  AuthIdentityRecord,
  AuthIdentityRepositoryPort,
  OAuthFlowStateRecord,
  OAuthFlowStateRepositoryPort,
} from '../../../application/ports/auth-identity.port.ts';
import type { SessionRecord } from '../../../domain/auth/auth-policies.ts';
import { NO_PASSWORD_SENTINEL } from '../../../domain/auth/password-sentinel.ts';
import { hashSessionToken } from '../../../domain/auth/session-policy.ts';
import type { PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type { OwnerRequestRecord, PetCoOwnerRecord } from '../../../application/ports/co-ownership.port.ts';
import { memoryDisputeEvidenceRepository, memoryIpRateEventRepository, type ChipMemoryState } from './in-memory-chip-repositories.ts';
import { memoryCoOwnerRepository, memoryOwnerRequestRepository, memoryOwnershipOps } from './in-memory-ownership-repositories.ts';
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
  /** `users.avatar_version` y `users.avatar_object_id` por usuario (feature 011, #78); opcional: ausente = nadie tiene foto. */
  userAvatars?: Record<string, AvatarState>;
  /** Filas de auditoría en orden de inserción (REQ-AUD-001). */
  auditLog: AuditEntry[];
  /** `share_links` (feature 005, REQ-VET-*): solo el hash del token. */
  shareLinks: ShareLinkRecord[];
  /** `share_link_audit` (feature 005, REQ-VET-008). */
  shareAudit: ShareAuditRecord[];
  /** `auth_identities` (feature 008, REQ-SSO8-001); opcional: ausente = vacía. */
  authIdentities?: AuthIdentityRecord[];
  /** `oauth_flow_states` (feature 008, REQ-SSO8-004); opcional: ausente = vacía. */
  oauthFlows?: OAuthFlowStateRecord[];
  /** Portal de administración (feature 009, Fase 3); opcionales: ausentes = vacías. */
  adminIdentities?: AdminIdentityRecord[];
  adminSessions?: AdminSessionRecord[];
  adminFlows?: AdminFlowStateRecord[];
  adminAudit?: AdminAuditRecord[];
  /** `admin_delegates` (feature 011); opcional: ausente = vacía. */
  adminDelegates?: AdminDelegateRecord[];
  /** Co-propiedad (feature 012, #22): `pet_co_owners`, `owner_requests` y `pets.ownership_version` (sin entrada = 1); opcionales: ausentes = vacíos. */
  coOwners?: PetCoOwnerRecord[];
  ownerRequests?: OwnerRequestRecord[];
  ownershipVersions?: Record<string, number>;
  /** Bloque B (#23): `ip_rate_events` y `dispute_evidence`; opcionales: ausentes = vacíos. */
  ipRateEvents?: ChipMemoryState['ipRateEvents'];
  disputeEvidence?: ChipMemoryState['disputeEvidence'];
  /** `about_content` (feature 010, T1430): singleton; opcional, ausente o `null` = sin contenido. */
  aboutContent?: AboutContentRecord | null;
  /** Decision de aprobacion por cuenta (T1247): instante y `adminId` de quien decidio. */
  userDecisions?: Record<string, { decidedAt: string; decidedBy: string }>;
  /** `platform_parameters` (T1264): clave -> fila; opcional, ausente = vacia. */
  platformParameters?: Record<string, { value: string; description: string; updatedAt: string }>;
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
    coOwners: [],
    ownerRequests: [],
    shareLinks: [],
    shareAudit: [],
    authIdentities: [],
    oauthFlows: [],
    adminIdentities: [],
    adminSessions: [],
    adminFlows: [],
    adminAudit: [],
    adminDelegates: [],
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
    async findVerifiedByEmail(normalizedEmail) {
      return copy(state.users.find((u) => u.emailVerifiedAt !== undefined && u.email !== null && u.email.toLowerCase() === normalizedEmail.toLowerCase()) ?? null);
    },
    async releaseUnverifiedEmail(normalizedEmail) {
      let released = 0;
      state.users = state.users.map((u) => {
        if (u.emailVerifiedAt !== undefined || u.email === null || u.email.toLowerCase() !== normalizedEmail.toLowerCase()) return u;
        released += 1;
        return { ...u, email: null };
      });
      return released;
    },
    async searchUsernamesByPrefix(lowerPrefix, limit) {
      return state.users
        .map((u) => u.username)
        .filter((name) => name.toLowerCase().startsWith(lowerPrefix))
        .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))
        .slice(0, limit);
    },
    async listByIds(userIds) {
      return copy(state.users.filter((u) => userIds.includes(u.id)));
    },
    async insert(user) {
      if (state.users.some((u) => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase())) {
        throw new Error(`users: id o username duplicado (${user.id}, ${user.username})`);
      }
      if (user.emailVerifiedAt !== undefined && user.email !== null && state.users.some((u) => u.emailVerifiedAt !== undefined && u.email?.toLowerCase() === user.email?.toLowerCase())) {
        throw new Error('users: el correo verificado ya tiene titular'); // índice único parcial users_email_verified_unique
      }
      state.users.push(copy(user));
    },
    async update(user) {
      const index = state.users.findIndex((u) => u.id === user.id && u.username === user.username);
      if (index < 0) throw new Error(`users: el usuario ${user.id} no existe`);
      const { emailVerifiedAt: _ignored, accountStatus: _status, adultDeclaredAt: _adultAt, adultNoticeVersion: _adultVersion, ...rest } = copy(user); // update nunca modifica email_verified_at, account_status (lo decide la aprobación, T1247) ni la declaración 18+ (010)
      const prior = state.users[index]!.emailVerifiedAt;
      const priorStatus = state.users[index]!.accountStatus;
      const priorAdultAt = state.users[index]!.adultDeclaredAt;
      const priorAdultVersion = state.users[index]!.adultNoticeVersion;
      state.users[index] = { ...rest, ...(prior === undefined ? {} : { emailVerifiedAt: prior }), ...(priorStatus === undefined ? {} : { accountStatus: priorStatus }), ...(priorAdultAt === undefined ? {} : { adultDeclaredAt: priorAdultAt }), ...(priorAdultVersion === undefined ? {} : { adultNoticeVersion: priorAdultVersion }) };
    },
    async delete(userId) {
      state.users = state.users.filter((u) => u.id !== userId);
      state.shareLinks = (state.shareLinks ?? []).filter((l) => l.createdByUserId !== userId); // como ON DELETE CASCADE
      state.authIdentities = (state.authIdentities ?? []).filter((i) => i.userId !== userId);
      state.oauthFlows = (state.oauthFlows ?? []).filter((f) => f.userId !== userId);
      if (state.userAvatars !== undefined) delete state.userAvatars[userId]; // la foto es una columna de `users`: cae con la fila
    },
    async findAvatar(userId) {
      if (!state.users.some((u) => u.id === userId)) return null;
      return copy(state.userAvatars?.[userId] ?? { version: 0, objectId: null });
    },
    async replaceAvatar(userId, objectId) {
      if (!state.users.some((u) => u.id === userId)) throw new Error('users: el usuario no existe');
      const avatars = (state.userAvatars ??= {});
      const next = { version: (avatars[userId]?.version ?? 0) + 1, objectId };
      avatars[userId] = next;
      return copy(next);
    },
    async clearAvatar(userId) {
      const current = state.userAvatars?.[userId];
      if (current !== undefined) state.userAvatars![userId] = { version: current.version, objectId: null };
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
        state.rateEvents.filter((e) => e.userId === userId).length +
        (state.authIdentities ?? []).filter((i) => i.userId === userId).length +
        (state.oauthFlows ?? []).filter((f) => f.userId === userId).length
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
    async findByTokenHash(tokenHash) {
      const token = Object.keys(state.sessions).find((t) => hashSessionToken(t) === tokenHash);
      return token === undefined ? null : copy(state.sessions[token]!);
    },
    async findLastActivityOfUser(userId) {
      return Object.values(state.sessions).filter((s) => s.userId === userId).map((s) => s.lastActivityAt).sort().at(-1) ?? null;
    },
    async revokeOthersByTokenHash(userId, keepTokenHash, nowIsoTimestamp) {
      let revoked = 0;
      for (const [token, session] of Object.entries(state.sessions)) {
        if (hashSessionToken(token) === keepTokenHash || session.userId !== userId || session.revokedAt !== null) continue;
        state.sessions[token] = { ...session, revokedAt: nowIsoTimestamp };
        revoked += 1;
      }
      return revoked;
    },
    async deleteByUser(userId) {
      for (const [token, session] of Object.entries(state.sessions)) if (session.userId === userId) delete state.sessions[token];
    },
    async findOwnerAccountStatus(userId) {
      const owner = state.users.find((u) => u.id === userId);
      return owner === undefined ? null : (owner.accountStatus ?? 'ACTIVE');
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
      if (biography !== null && ([...biography].length > 280 || /[\u0000-\u001F\u007F]/u.test(biography))) throw new DomainError('ERR-INTERNAL-UNEXPECTED', `Objeto inválido para pets (${pet.id}); no se guarda.`);
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
      if (state.coOwners !== undefined) state.coOwners = state.coOwners.filter((c) => c.petId !== petId); // como ON DELETE CASCADE de pet_co_owners
      if (state.ownerRequests !== undefined) state.ownerRequests = state.ownerRequests.map((r) => (r.petId === petId ? { ...r, petId: null } : r)); // como ON DELETE SET NULL (INV-CHP12-005)
      if (state.ownershipVersions !== undefined) delete state.ownershipVersions[petId];
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
    ...memoryOwnershipOps(state),
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
    async pseudonymizePetOwnerSnapshot(userId, pseudonym) {
      let changed = 0;
      state.shareLinks = links().map((l) => {
        if (l.petOwnerUserIdAtCreation !== userId) return l;
        changed += 1;
        return { ...l, petOwnerUserIdAtCreation: pseudonym };
      });
      return changed;
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

/** `auth_identities` (feature 008, REQ-SSO8-001): único por (provider, sub); el usuario debe existir (clave foránea). */
function authIdentityRepository(state: MemoryState): AuthIdentityRepositoryPort {
  const all = (): AuthIdentityRecord[] => (state.authIdentities ??= []);
  return {
    async findBySubject(provider, providerSubject) {
      return copy(all().find((i) => i.provider === provider && i.providerSubject === providerSubject) ?? null);
    },
    async listByUser(userId) {
      return copy(all().filter((i) => i.userId === userId));
    },
    async insertIfAbsent(identity) {
      if (!state.users.some((u) => u.id === identity.userId)) throw new Error('auth_identities: el usuario no existe');
      if (identity.providerSubject === '') throw new Error('auth_identities: provider_subject vacío');
      if (all().some((i) => i.provider === identity.provider && i.providerSubject === identity.providerSubject)) return false;
      all().push(copy(identity));
      return true;
    },
  };
}

/** Forma coherente de una fila de `oauth_flow_states` (los CHECK de la migración 0017/0013). */
function isCoherentFlow(f: OAuthFlowStateRecord): boolean {
  // 009 (0018): `pendingSubject` solo puede llevar valor en DELETE (marca de la prueba de titularidad).
  const authorization = f.phase === 'AUTHORIZATION' && f.state !== null && f.nonce !== null && f.codeVerifier !== null && (f.pendingSubject === null || f.intent === 'DELETE') && f.pendingEmail === null;
  const username = f.phase === 'USERNAME' && f.intent === 'LOGIN' && f.state === null && f.nonce === null && f.codeVerifier === null && f.pendingSubject !== null && f.pendingEmail !== null;
  const bound = f.intent === 'LINK' || f.intent === 'DELETE';
  const originOk = bound === (f.originSessionHash !== null) && (f.originSessionHash === null || f.originSessionHash.length === 64);
  return f.tokenHash.length === 64 && f.expiresAt > f.createdAt && (authorization || username) && bound === (f.userId !== null) && originOk;
}

/** `oauth_flow_states` (feature 008, REQ-SSO8-004): un solo uso por compare-and-set, vence a los 900 s. */
function oauthFlowRepository(state: MemoryState): OAuthFlowStateRepositoryPort {
  const all = (): OAuthFlowStateRecord[] => (state.oauthFlows ??= []);
  return {
    async insert(record) {
      if (!isCoherentFlow(record)) throw new Error('oauth_flow_states: fila incoherente');
      if (record.userId !== null && !state.users.some((u) => u.id === record.userId)) throw new Error('oauth_flow_states: el usuario no existe');
      if (all().some((f) => f.tokenHash === record.tokenHash)) throw new Error('oauth_flow_states: identificador duplicado');
      all().push(copy(record));
    },
    async findByTokenHash(tokenHash) {
      return copy(all().find((f) => f.tokenHash === tokenHash) ?? null);
    },
    async consume(tokenHash, nowIsoTimestamp, expectedPhase) {
      const index = all().findIndex((f) => f.tokenHash === tokenHash && f.phase === expectedPhase && f.consumedAt === null && f.expiresAt > nowIsoTimestamp);
      if (index < 0) return null;
      all()[index] = { ...all()[index]!, consumedAt: nowIsoTimestamp };
      return copy(all()[index]!);
    },
    async purgeExpired(nowIsoTimestamp) {
      const before = all().length;
      state.oauthFlows = all().filter((f) => f.expiresAt > nowIsoTimestamp);
      return before - state.oauthFlows.length;
    },
    async findDeletionProof(userId, originSessionHash, nowIsoTimestamp) {
      const proofs = all()
        .filter((f) => f.intent === 'DELETE' && f.userId === userId && f.originSessionHash === originSessionHash && f.consumedAt !== null && f.pendingSubject !== null && f.expiresAt > nowIsoTimestamp)
        .sort((a, b) => (b.consumedAt! < a.consumedAt! ? -1 : b.consumedAt! > a.consumedAt! ? 1 : a.tokenHash < b.tokenHash ? -1 : 1));
      return copy(proofs[0] ?? null);
    },
    async markDeletionProof(tokenHash, verifiedSubject) {
      const index = all().findIndex((f) => f.tokenHash === tokenHash && f.intent === 'DELETE' && f.consumedAt !== null && f.pendingSubject === null);
      if (index < 0) return false;
      all()[index] = { ...all()[index]!, pendingSubject: verifiedSubject };
      return true;
    },
    async consumeDeletionProof(tokenHash, nowIsoTimestamp) {
      const index = all().findIndex((f) => f.tokenHash === tokenHash && f.intent === 'DELETE' && f.consumedAt !== null && f.pendingSubject !== null && f.expiresAt > nowIsoTimestamp);
      if (index < 0) return false;
      all().splice(index, 1);
      return true;
    },
  };
}

/** `admin_identities` (feature 009, REQ-ADM9-003): única por (provider, sub) y por correo; sin relación con `users`. */
function adminIdentityRepository(state: MemoryState): AdminIdentityRepositoryPort {
  const all = (): AdminIdentityRecord[] => (state.adminIdentities ??= []);
  return {
    async findById(adminId) {
      return copy(all().find((i) => i.adminId === adminId) ?? null);
    },
    async findBySubject(provider, providerSubject) {
      return copy(all().find((i) => i.provider === provider && i.providerSubject === providerSubject) ?? null);
    },
    async findByEmail(email) {
      return copy(all().find((i) => i.email === email) ?? null);
    },
    async insertIfAbsent(identity) {
      if (identity.adminId.length !== 36 || identity.providerSubject === '' || identity.email.length < 3 || identity.email !== identity.email.toLowerCase()) throw new Error('admin_identities: fila incoherente');
      if (all().some((i) => i.adminId === identity.adminId || (i.provider === identity.provider && i.providerSubject === identity.providerSubject) || i.email === identity.email)) return false;
      all().push(copy(identity));
      return true;
    },
    async deleteById(adminId) {
      const before = all().length;
      state.adminIdentities = all().filter((i) => i.adminId !== adminId);
      // ON DELETE CASCADE de admin_sessions.
      state.adminSessions = (state.adminSessions ?? []).filter((session) => session.adminId !== adminId);
      return state.adminIdentities.length < before;
    },
  };
}

/** `admin_sessions` (feature 009, REQ-ADM9-002): solo el hash; revocación por compare-and-set; la actividad no se renueva si está revocada. */
function adminSessionRepository(state: MemoryState): AdminSessionRepositoryPort {
  const all = (): AdminSessionRecord[] => (state.adminSessions ??= []);
  return {
    async insert(record) {
      if (record.tokenHash.length !== 64) throw new Error('admin_sessions: hash incoherente');
      if (!(state.adminIdentities ?? []).some((i) => i.adminId === record.adminId)) throw new Error('admin_sessions: la identidad no existe');
      if (all().some((s) => s.tokenHash === record.tokenHash)) throw new Error('admin_sessions: identificador duplicado');
      all().push(copy(record));
    },
    async findByTokenHash(tokenHash) {
      return copy(all().find((s) => s.tokenHash === tokenHash) ?? null);
    },
    async touch(tokenHash, lastActivityAt) {
      const index = all().findIndex((s) => s.tokenHash === tokenHash && s.revokedAt === null);
      if (index >= 0) all()[index] = { ...all()[index]!, lastActivityAt };
    },
    async revoke(tokenHash, revokedAt) {
      const index = all().findIndex((s) => s.tokenHash === tokenHash && s.revokedAt === null);
      if (index < 0) return false;
      all()[index] = { ...all()[index]!, revokedAt };
      return true;
    },
    async purgeCreatedBefore(cutoff) {
      const before = all().length;
      state.adminSessions = all().filter((s) => s.createdAt > cutoff);
      return before - state.adminSessions.length;
    },
    async deleteByAdminId(adminId) {
      const before = all().length;
      state.adminSessions = all().filter((s) => s.adminId !== adminId);
      return before - state.adminSessions.length;
    },
  };
}

/**
 * `admin_delegates` (feature 011): paridad con SQLite/PostgreSQL. Único por correo solo entre filas vivas (`ACTIVE` | `INVITED`, ORA-1 b) y por `(provider, sub)` solo entre `ACTIVE`; todas las
 * escrituras son compare-and-set sobre el estado leído. La unidad de trabajo de memoria serializa por cola, de modo que `lockForGuard` no hace nada.
 */
function adminDelegateRepository(state: MemoryState): AdminDelegateRepositoryPort {
  const all = (): AdminDelegateRecord[] => (state.adminDelegates ??= []);
  const live = (record: Pick<AdminDelegateRecord, 'status'>): boolean => record.status === 'ACTIVE' || record.status === 'INVITED';
  const coherent = (r: AdminDelegateRecord): boolean =>
    r.adminId.length === 36 &&
    r.email.length >= 3 &&
    r.email === r.email.toLowerCase() &&
    ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'].includes(r.role) &&
    ['INVITED', 'ACTIVE', 'DISABLED'].includes(r.status) &&
    (r.provider === null) === (r.providerSubject === null);
  const conflicts = (candidate: AdminDelegateRecord, ignoreId: string | null): boolean =>
    all().some(
      (other) =>
        other.adminId !== ignoreId &&
        (other.adminId === candidate.adminId ||
          (live(other) && live(candidate) && other.email === candidate.email) ||
          (other.status === 'ACTIVE' && candidate.status === 'ACTIVE' && other.provider === candidate.provider && other.providerSubject === candidate.providerSubject)),
    );
  const ordered = (): AdminDelegateRecord[] => [...all()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.adminId < b.adminId ? -1 : a.adminId > b.adminId ? 1 : 0));
  return {
    async lockForGuard() {},
    async findById(adminId) {
      return copy(all().find((d) => d.adminId === adminId) ?? null);
    },
    async findLiveByEmail(email) {
      return copy(all().find((d) => live(d) && d.email === email) ?? null);
    },
    async list(limit) {
      return copy(ordered().slice(0, limit));
    },
    async countRows() {
      return all().length;
    },
    async countOccupied(now, excludeAdminId) {
      return all().filter((d) => d.adminId !== excludeAdminId && (d.status === 'ACTIVE' || (d.status === 'INVITED' && d.invitedExpiresAt !== null && d.invitedExpiresAt >= now))).length;
    },
    async countActiveSuperAdmins(excludeEmails, excludeAdminId) {
      return all().filter((d) => d.adminId !== excludeAdminId && d.status === 'ACTIVE' && d.role === 'SUPER_ADMIN' && !excludeEmails.includes(d.email)).length;
    },
    async insert(record) {
      if (!coherent(record) || conflicts(record, null)) return false;
      all().push(copy(record));
      return true;
    },
    async replace(next, expected) {
      const index = all().findIndex((d) => d.adminId === expected.adminId && d.status === expected.status && d.role === expected.role && d.updatedAt === expected.updatedAt && d.providerSubject === expected.providerSubject);
      if (index < 0 || !coherent(next) || conflicts(next, expected.adminId)) return false;
      all()[index] = copy(next);
      return true;
    },
    async anchor(adminId, provider, providerSubject, now) {
      const index = all().findIndex((d) => d.adminId === adminId && d.status === 'INVITED' && d.providerSubject === null && d.invitedExpiresAt !== null && d.invitedExpiresAt >= now);
      if (index < 0) return false;
      const next: AdminDelegateRecord = { ...all()[index]!, status: 'ACTIVE', provider, providerSubject, anchoredAt: now, invitedExpiresAt: null, updatedAt: now };
      if (conflicts(next, adminId)) return false;
      all()[index] = next;
      return true;
    },
    async purgeExpiredInvitations(invitedBefore) {
      const before = all().length;
      state.adminDelegates = all().filter((d) => !(d.status === 'INVITED' && d.invitedAt !== null && d.invitedAt < invitedBefore));
      return before - state.adminDelegates.length;
    },
    async anonymizeDisabledBefore(disabledBefore) {
      const done: string[] = [];
      state.adminDelegates = all().map((d) => {
        const marker = `anon-${d.adminId}@anonimizado.invalid`;
        if (d.status !== 'DISABLED' || d.disabledAt === null || !(d.disabledAt < disabledBefore) || (d.email === marker && d.providerSubject === null)) return d;
        done.push(d.adminId);
        return { ...d, email: marker, provider: null, providerSubject: null };
      });
      return done;
    },
  };
}

/** `admin_oauth_flow_states` (feature 009, REQ-ADM9-006): un solo uso por compare-and-set, vence a los 900 s. */
function adminFlowRepository(state: MemoryState): AdminFlowStateRepositoryPort {
  const all = (): AdminFlowStateRecord[] => (state.adminFlows ??= []);
  return {
    async insert(record) {
      if (record.tokenHash.length !== 64 || record.state === '' || record.nonce === '' || record.codeVerifier === '' || !(record.expiresAt > record.createdAt)) throw new Error('admin_oauth_flow_states: fila incoherente');
      if (all().some((f) => f.tokenHash === record.tokenHash)) throw new Error('admin_oauth_flow_states: identificador duplicado');
      all().push(copy(record));
    },
    async consume(tokenHash, nowIsoTimestamp) {
      const index = all().findIndex((f) => f.tokenHash === tokenHash && f.consumedAt === null && f.expiresAt > nowIsoTimestamp);
      if (index < 0) return null;
      all()[index] = { ...all()[index]!, consumedAt: nowIsoTimestamp };
      return copy(all()[index]!);
    },
    async purgeExpired(nowIsoTimestamp) {
      const before = all().length;
      state.adminFlows = all().filter((f) => f.expiresAt > nowIsoTimestamp);
      return before - state.adminFlows.length;
    },
  };
}

/** `admin_audit_entries` (feature 009, REQ-ADM9-004): auditoría propia, sin relación con `users` ni con la identidad. */
function adminAuditRepository(state: MemoryState): AdminAuditRepositoryPort {
  const all = (): AdminAuditRecord[] => (state.adminAudit ??= []);
  return {
    async insert(record) {
      if (record.id.length !== 36 || record.adminId.length !== 36 || record.action.length < 1 || record.action.length > 64) throw new Error('admin_audit_entries: fila incoherente');
      if (all().some((r) => r.id === record.id)) throw new Error('admin_audit_entries: identificador duplicado');
      all().push(copy(record));
    },
    async listByAdmin(adminId) {
      return copy(all().filter((r) => r.adminId === adminId).sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : 1)));
    },
  };
}

/**
 * Decision de aprobacion en memoria (T1247). Todo el JavaScript de una transicion corre sin cesion, asi que comprobar y fijar en un solo paso es atomico (paridad con el
 * `UPDATE ... WHERE account_status = 'PENDING'` de SQLite y PostgreSQL). La decision (`decidedAt`, `decidedBy`) queda en `state.userDecisions`.
 */
function registrationRepository(state: MemoryState): RegistrationDecisionRepositoryPort {
  const recent = (createdAfter: string): UserAccount[] => state.users.filter((u) => u.accountStatus === 'PENDING' && u.createdAt > createdAfter);
  const byAge = (a: UserAccount, b: UserAccount): number => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);
  return {
    async countPending(createdAfter) {
      return recent(createdAfter).length;
    },
    async listPending(createdAfter, limit, after) {
      return recent(createdAfter)
        .sort(byAge)
        .filter((u) => after === null || u.createdAt > after.requestedAt || (u.createdAt === after.requestedAt && u.id > after.registrationId))
        .slice(0, limit)
        .map((u) => ({ registrationId: u.id, username: u.username, requestedAt: u.createdAt, method: u.passwordHash === NO_PASSWORD_SENTINEL ? ('GOOGLE' as const) : ('PASSWORD' as const) }));
    },
    async decide(registrationId, to, decidedBy, decidedAt, createdAfter) {
      const index = state.users.findIndex((u) => u.id === registrationId && u.accountStatus === 'PENDING' && u.createdAt > createdAfter);
      if (index < 0) return false;
      state.users[index] = { ...state.users[index]!, accountStatus: to };
      (state.userDecisions ??= {})[registrationId] = { decidedAt, decidedBy };
      return true;
    },
  };
}

/** Edicion de parametros en memoria (T1264): comprobar y fijar en un solo paso sin cesion es atomico (paridad con el compare-and-set de SQLite y PostgreSQL). */
function adminParameterRepository(state: MemoryState): AdminParameterRepositoryPort {
  const rows = (): Record<string, { value: string; description: string; updatedAt: string }> => (state.platformParameters ??= {});
  return {
    async find(key) {
      const row = rows()[key];
      return row === undefined ? null : { value: row.value, updatedAt: row.updatedAt };
    },
    async compareAndSet(key, description, next, expected) {
      const current = rows()[key];
      if (expected === null) {
        if (current !== undefined) return false;
      } else if (current === undefined || current.value !== expected.value || current.updatedAt !== expected.updatedAt) return false;
      rows()[key] = { value: next.value, description: current?.description ?? description, updatedAt: next.updatedAt };
      return true;
    },
    async lastEditor(action, key) {
      const entries = (state.adminAudit ??= []).filter((r) => r.action === action && r.objectRef === key);
      return entries.length === 0 ? null : entries.reduce((a, b) => (b.occurredAt >= a.occurredAt ? b : a)).adminId;
    },
    async listAdminAccountUserIds(subjects, emails) {
      const wanted = new Set(emails.map((e) => e.toLowerCase()));
      const linked = new Set((state.authIdentities ?? []).filter((i) => i.provider === 'GOOGLE' && subjects.includes(i.providerSubject)).map((i) => i.userId));
      return state.users.filter((u) => linked.has(u.id) || (u.emailVerifiedAt !== undefined && u.email !== null && wanted.has(u.email.toLowerCase()))).map((u) => u.id);
    },
    async resetAdminAccountsSceneQuota(subjects, emails, resetAt) {
      const wanted = new Set(emails.map((e) => e.toLowerCase()));
      const linked = new Set((state.authIdentities ?? []).filter((i) => i.provider === 'GOOGLE' && subjects.includes(i.providerSubject)).map((i) => i.userId));
      const ids = new Set(state.users.filter((u) => linked.has(u.id) || (u.emailVerifiedAt !== undefined && u.email !== null && wanted.has(u.email.toLowerCase()))).map((u) => u.id));
      const ownedHouseholds = new Set(state.households.filter((h) => ids.has(h.ownerUserId)).map((h) => h.id));
      const inScope = (s: { ownerUserId: string | null; householdId: string | null }): boolean => (s.ownerUserId !== null && ids.has(s.ownerUserId)) || (s.householdId !== null && ownedHouseholds.has(s.householdId));
      const sceneIds = new Set((state.scenes ?? []).filter(inScope).map((s) => s.id));
      state.scenes = (state.scenes ?? []).map((s) => {
        if (!inScope(s)) return s;
        const cleared = s.runState === 'failed' ? { runState: null, currentAttemptId: null, leaseExpiresAt: null } : {};
        return { ...s, ...cleared, consumedGenerations: 0 };
      });
      state.sceneQuotaCarry = (state.sceneQuotaCarry ?? []).filter((c) => !ids.has(c.ownerUserId));
      // D9-31: marcas de reinicio por escena y por actor; scene_attempts NO se reescribe.
      state.sceneLimitResets = { ...(state.sceneLimitResets ?? {}), ...Object.fromEntries([...sceneIds].map((id) => [id, resetAt])) };
      state.actorLimitResets = { ...(state.actorLimitResets ?? {}), ...Object.fromEntries([...ids].map((id) => [id, resetAt])) };
      return { accountsReset: ids.size };
    },
    async listSceneSpendAttempts(window) {
      return (state.sceneAttempts ?? []).filter((a) => a.quotaWindow === window).map((a) => ({ providerModel: a.providerModel ?? null, providerLocation: a.providerLocation ?? null, providerCallStartedAt: a.providerCallStartedAt }));
    },
  };
}

/** `about_content` en memoria (T1430): singleton con compare-and-set (comprobar y fijar sin cesión es atómico; paridad con SQLite y PostgreSQL). */
function aboutContentRepository(state: MemoryState): AboutContentRepositoryPort {
  return {
    async get() {
      return state.aboutContent == null ? null : copy(state.aboutContent);
    },
    async replace(next, expectedVersion) {
      const current = state.aboutContent ?? null;
      if ((current?.version ?? 0) !== expectedVersion) return null;
      const written: AboutContentRecord = { ...next, version: expectedVersion + 1 };
      state.aboutContent = written;
      return copy(written);
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
    authIdentities: authIdentityRepository(state),
    oauthFlows: oauthFlowRepository(state),
    adminIdentities: adminIdentityRepository(state),
    adminSessions: adminSessionRepository(state),
    adminFlows: adminFlowRepository(state),
    adminAudit: adminAuditRepository(state),
    adminDelegates: adminDelegateRepository(state),
    registrations: registrationRepository(state),
    adminParameters: adminParameterRepository(state),
    aboutContent: aboutContentRepository(state),
    coOwners: memoryCoOwnerRepository(state),
    ownerRequests: memoryOwnerRequestRepository(state),
    ipRateEvents: memoryIpRateEventRepository(state),
    disputeEvidence: memoryDisputeEvidenceRepository(state),
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
