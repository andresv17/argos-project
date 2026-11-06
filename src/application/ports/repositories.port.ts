/**
 * Puertos de repositorio (plan §3, INV-ARCH-005). Todas las operaciones devuelven Promise. Los repositorios solo
 * se obtienen dentro de `UnitOfWorkPort.runInTransaction`, de modo que toda lectura y escritura es transaccional.
 * Ninguna lista garantiza orden: los casos de uso ordenan con las reglas de dominio (INV-SORT-001, REQ-PET-005,
 * INV-HOUSE-005).
 *
 * @implements INV-ARCH-004, INV-ARCH-005, INV-PET-003
 */

import type { Household, HouseholdMember, PetProfile, UserPublicProfile } from '../../generated/index.ts';
import type { SessionRecord } from '../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../domain/records/record-invariants.ts';

/** Usuario persistido: perfil público más el hash de su contraseña (INV-AUTH-003: nunca en claro). */
export interface UserAccount extends UserPublicProfile {
  readonly passwordHash: string;
}

export interface UserRepositoryPort {
  findById(userId: string): Promise<UserAccount | null>;
  /** Búsqueda exacta por username ya normalizado (recortado y en minúsculas, INV-AUTH-001). */
  findByUsername(username: string): Promise<UserAccount | null>;
  listByIds(userIds: readonly string[]): Promise<UserAccount[]>;
  /** Falla si el id o el username ya existen. */
  insert(user: UserAccount): Promise<void>;
}

export interface SessionRepositoryPort {
  findByToken(token: string): Promise<SessionRecord | null>;
  /** Inserta o reemplaza la sesión del token. */
  save(token: string, session: SessionRecord): Promise<void>;
}

export interface LoginAttemptRepositoryPort {
  /** Instantes de los fallos registrados para el username normalizado (INV-AUTH-005). */
  listFailures(username: string): Promise<string[]>;
  replaceFailures(username: string, failures: readonly string[]): Promise<void>;
}

export interface PetRepositoryPort {
  findById(petId: string): Promise<PetProfile | null>;
  listByOwners(ownerUserIds: readonly string[]): Promise<PetProfile[]>;
  /** Inserta o reemplaza por id. */
  save(pet: PetProfile): Promise<void>;
  delete(petId: string): Promise<void>;
}

export interface MedicalRecordRepositoryPort {
  /** Las 6 colecciones de la mascota; vacías si no tiene registros. */
  listForPet(petId: string): Promise<PetRecordCollections>;
  /** Falla si el id ya existe en el módulo. */
  add<M extends RecordModule>(module: M, record: RecordOf<M>): Promise<void>;
  deleteForPet(petId: string): Promise<void>;
}

export interface HouseholdRepositoryPort {
  findById(householdId: string): Promise<Household | null>;
  insert(household: Household): Promise<void>;
  /** Borra el hogar y todas sus membresías; las mascotas no se tocan (REQ-HOUSE-004). */
  deleteWithMemberships(householdId: string): Promise<void>;
  listMemberships(householdId: string): Promise<HouseholdMember[]>;
  /** Todas las membresías (cualquier estado) de cualquiera de los usuarios, sin duplicados. */
  listMembershipsOfUsers(userIds: readonly string[]): Promise<HouseholdMember[]>;
  /** Inserta o reemplaza por membershipId. */
  saveMembership(membership: HouseholdMember): Promise<void>;
}

export interface RepositorySet {
  readonly users: UserRepositoryPort;
  readonly sessions: SessionRepositoryPort;
  readonly loginAttempts: LoginAttemptRepositoryPort;
  readonly pets: PetRepositoryPort;
  readonly records: MedicalRecordRepositoryPort;
  readonly households: HouseholdRepositoryPort;
}
