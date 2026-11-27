/**
 * Repositorios en memoria de la co-propiedad (Feature 012, Bloque A, #22): mismas reglas observables que SQLite y PostgreSQL (UNIQUE parciales, transiciones condicionales, `ownership_version`).
 * Las transacciones de memoria van en serie, así que el «bloqueo por mascota» es implícito (REQ-OWN12-011).
 *
 * @implements REQ-OWN12-001, REQ-OWN12-004, REQ-OWN12-011, STATE-COOWN12-001, STATE-OWNREQ12-001
 */

import type { CoOwnerRepositoryPort, OwnerRequestRecord, OwnerRequestRepositoryPort, PetCoOwnerRecord } from '../../../application/ports/co-ownership.port.ts';
import type { OwnershipState, PetRepositoryPort } from '../../../application/ports/repositories.port.ts';
import type { PetProfile } from '../../../domain/pet/pet-invariants.ts';
import { TERMINAL_CO_OWNER_STATUSES, mentionsUser, scrubUserFromRequest } from '../ownership-rows.ts';

/** Parte del estado de memoria que usa la co-propiedad (opcional: ausente = vacía). */
export interface OwnershipMemoryState {
  pets: PetProfile[];
  coOwners?: PetCoOwnerRecord[];
  ownerRequests?: OwnerRequestRecord[];
  /** `pets.ownership_version` por mascota; sin entrada = 1. */
  ownershipVersions?: Record<string, number>;
}

const copy = <T>(value: T): T => structuredClone(value);
const unique = (message: string): Error => Object.assign(new Error(message), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
const byCreated = (a: OwnerRequestRecord, b: OwnerRequestRecord): number => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const byInvited = (a: PetCoOwnerRecord, b: PetCoOwnerRecord): number => a.invitedAt.localeCompare(b.invitedAt) || a.id.localeCompare(b.id);
const LIVE_ACTIONS: readonly string[] = ['DELETE_PET', 'TRANSFER_PRINCIPAL', 'CHANGE_PRINCIPAL', 'INVITE_CO_OWNER'];

export function memoryCoOwnerRepository(state: OwnershipMemoryState): CoOwnerRepositoryPort {
  const rows = (): PetCoOwnerRecord[] => state.coOwners ?? [];
  const replace = (next: PetCoOwnerRecord): void => {
    state.coOwners = rows().map((row) => (row.id === next.id ? next : row));
  };
  return {
    async listByPet(petId) {
      return copy(rows().filter((r) => r.petId === petId).sort(byInvited));
    },
    async findById(id) {
      const found = rows().find((r) => r.id === id);
      return found === undefined ? null : copy(found);
    },
    async listByUser(userId) {
      return copy(rows().filter((r) => r.userId === userId).sort(byInvited));
    },
    async insert(row) {
      if (rows().some((r) => r.id === row.id)) throw unique('UNIQUE constraint failed: pet_co_owners.id');
      if ((row.status === 'INVITED' || row.status === 'ACTIVE') && row.userId !== null && rows().some((r) => r.petId === row.petId && r.userId === row.userId && (r.status === 'INVITED' || r.status === 'ACTIVE'))) {
        throw unique('UNIQUE constraint failed: pet_co_owners.pet_id, pet_co_owners.user_id');
      }
      if (!state.pets.some((p) => p.id === row.petId)) throw new Error('FOREIGN KEY constraint failed: pet_co_owners');
      state.coOwners = [...rows(), copy(row)];
    },
    async transition(id, expectedStatus, patch) {
      const current = rows().find((r) => r.id === id);
      if (current === undefined || current.status !== expectedStatus) return false;
      replace({
        ...current,
        status: patch.status,
        joinedAt: patch.joinedAt === undefined ? current.joinedAt : patch.joinedAt,
        leftAt: patch.leftAt === undefined ? current.leftAt : patch.leftAt,
        promotionKind: patch.promotionKind === undefined ? current.promotionKind : patch.promotionKind,
        version: current.version + 1,
      });
      return true;
    },
    async acknowledgePromotion(id, at) {
      const current = rows().find((r) => r.id === id);
      if (current === undefined || current.status !== 'PROMOTED' || current.promotionNoticeAckAt !== null) return false;
      replace({ ...current, promotionNoticeAckAt: at, version: current.version + 1 });
      return true;
    },
    async pseudonymizeUser(userId, pseudonym) {
      state.coOwners = rows().map((row) => ({
        ...row,
        userId: row.userId === userId ? null : row.userId,
        userPseudonym: row.userId === userId ? pseudonym : row.userPseudonym,
        invitedByUserId: row.invitedByUserId === userId ? null : row.invitedByUserId,
        version: row.userId === userId ? row.version + 1 : row.version,
      }));
    },
    async purgeTerminalBefore(cutoffExclusive) {
      const terminal = new Set<string>(TERMINAL_CO_OWNER_STATUSES);
      const before = rows().length;
      state.coOwners = rows().filter((r) => !(terminal.has(r.status) && (r.leftAt ?? r.expiresAt) < cutoffExclusive));
      return before - rows().length;
    },
  };
}

export function memoryOwnerRequestRepository(state: OwnershipMemoryState): OwnerRequestRepositoryPort {
  const rows = (): OwnerRequestRecord[] => state.ownerRequests ?? [];
  return {
    async listByPet(petId) {
      return copy(rows().filter((r) => r.petId === petId).sort(byCreated));
    },
    async listByPets(petIds) {
      const wanted = new Set(petIds);
      return copy(rows().filter((r) => r.petId !== null && wanted.has(r.petId)).sort(byCreated));
    },
    async listByRequester(userId) {
      return copy(rows().filter((r) => r.requesterUserId === userId).sort(byCreated));
    },
    async listAll() {
      return copy([...rows()].sort(byCreated));
    },
    async listOpenDisputes(now) {
      return copy(rows().filter((r) => r.action === 'CHIP_DISPUTE' && r.status === 'UNDER_REVIEW' && r.slaDueAt !== null && r.expiresAt > now).sort((a, b) => (a.slaDueAt! < b.slaDueAt! ? -1 : a.slaDueAt! > b.slaDueAt! ? 1 : a.id < b.id ? -1 : 1)));
    },
    async findById(id) {
      const found = rows().find((r) => r.id === id);
      return found === undefined ? null : copy(found);
    },
    async insert(row) {
      if (rows().some((r) => r.id === row.id)) throw unique('UNIQUE constraint failed: owner_requests.id');
      if (row.status === 'PENDING' && LIVE_ACTIONS.includes(row.action) && rows().some((r) => r.petId === row.petId && r.action === row.action && r.status === 'PENDING')) {
        throw unique('UNIQUE constraint failed: owner_requests.pet_id, owner_requests.action');
      }
      state.ownerRequests = [...rows(), copy(row)];
    },
    async update(row, expectedStatus) {
      const current = rows().find((r) => r.id === row.id);
      if (current === undefined || current.status !== expectedStatus) return false;
      state.ownerRequests = rows().map((r) => (r.id === row.id ? { ...copy(row), version: current.version + 1 } : r));
      return true;
    },
    async pseudonymizeUser(userId, pseudonym) {
      state.ownerRequests = rows().map((r) => (mentionsUser(r, userId) ? scrubUserFromRequest(r, userId, pseudonym) : r));
    },
    async hasOpenChipReservation(chipHmac, nowIso) {
      return rows().some((r) => r.chipHmac === chipHmac && r.action === 'CHIP_DISPUTE' && r.disputeReason === 'CHIP_APPROPRIATION' && r.status === 'UNDER_REVIEW' && r.expiresAt > nowIso);
    },
    async listByChipHmac(chipHmac) {
      return copy(rows().filter((r) => r.chipHmac === chipHmac).sort(byCreated));
    },
    async deleteByIds(ids) {
      const wanted = new Set(ids);
      const before = rows().length;
      state.ownerRequests = rows().filter((r) => !wanted.has(r.id));
      return before - rows().length;
    },
  };
}

/** Operaciones de propiedad de `pets` en memoria. */
export function memoryOwnershipOps(state: OwnershipMemoryState): Pick<PetRepositoryPort, 'findOwnership' | 'findOwnershipForUpdate' | 'compareAndSetOwner' | 'bumpOwnershipVersion' | 'findMicrochipHolder'> {
  const versions = (): Record<string, number> => (state.ownershipVersions ??= {}); // solo en escrituras
  const read = (petId: string): OwnershipState | null => {
    const pet = state.pets.find((p) => p.id === petId);
    return pet === undefined ? null : { ownerUserId: pet.ownerUserId, ownershipVersion: state.ownershipVersions?.[petId] ?? 1 };
  };
  return {
    async findOwnership(petId) {
      return read(petId);
    },
    async findOwnershipForUpdate(petId) {
      return read(petId);
    },
    async compareAndSetOwner(petId, expectedOwnerUserId, expectedOwnershipVersion, newOwnerUserId) {
      const current = read(petId);
      if (current === null || current.ownerUserId !== expectedOwnerUserId || current.ownershipVersion !== expectedOwnershipVersion) return 0;
      state.pets = state.pets.map((p) => (p.id === petId ? { ...p, ownerUserId: newOwnerUserId } : p));
      versions()[petId] = expectedOwnershipVersion + 1;
      return 1;
    },
    async findMicrochipHolder(microchipId) {
      const pet = state.pets.find((p) => p.microchipId === microchipId);
      return pet === undefined ? null : { petId: pet.id, ownerUserId: pet.ownerUserId };
    },
    async bumpOwnershipVersion(petId, expectedOwnershipVersion) {
      const current = read(petId);
      if (current === null || current.ownershipVersion !== expectedOwnershipVersion) return 0;
      versions()[petId] = expectedOwnershipVersion + 1;
      return 1;
    },
  };
}
