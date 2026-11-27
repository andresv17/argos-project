/**
 * Puertos de la co-propiedad (Feature 012, Bloque A, #22): `CoOwnerRepositoryPort` sobre `pet_co_owners` y `OwnerRequestRepositoryPort` sobre `owner_requests` (una sola tabla y una sola
 * máquina `STATE-OWNREQ12-001` para aprobaciones, reclamaciones y disputas). Solo se obtienen dentro de `UnitOfWorkPort.runInTransaction`. Filas en camelCase; marcas de tiempo ISO UTC (TEXT).
 * Las transiciones son condicionales (`UPDATE … WHERE id = ? AND status = esperado`): devuelven `false` si otra transacción ya movió la fila (REQ-OWN12-011).
 *
 * @implements REQ-OWN12-001, REQ-OWN12-004, REQ-OWN12-011, INV-OWN12-001, STATE-COOWN12-001, STATE-OWNREQ12-001
 */

import type { CoOwnerStatus, OwnerApproval, OwnerRequestAction, OwnerRequestStatus } from '../../domain/pet/co-ownership.ts';

export interface PetCoOwnerRecord {
  readonly id: string;
  readonly petId: string;
  readonly userId: string | null;
  readonly userPseudonym: string | null;
  readonly status: CoOwnerStatus;
  readonly invitedByUserId: string | null;
  readonly invitedAt: string;
  readonly expiresAt: string;
  readonly joinedAt: string | null;
  readonly leftAt: string | null;
  readonly promotionKind: 'DESIGNATED' | 'AUTO' | null;
  readonly promotionNoticeAckAt: string | null;
  readonly version: number;
}

/** Campos que una transición puede cambiar (`status` y `version` los fija el repositorio). */
export interface CoOwnerPatch {
  readonly status: CoOwnerStatus;
  readonly joinedAt?: string | null;
  readonly leftAt?: string | null;
  readonly promotionKind?: 'DESIGNATED' | 'AUTO' | null;
}

export interface CoOwnerRepositoryPort {
  /** Todas las filas de la mascota (cualquier estado), por `invitedAt` e `id`. */
  listByPet(petId: string): Promise<PetCoOwnerRecord[]>;
  findById(id: string): Promise<PetCoOwnerRecord | null>;
  /** Filas del usuario (cualquier estado), por `invitedAt` e `id`. */
  listByUser(userId: string): Promise<PetCoOwnerRecord[]>;
  /** Falla (UNIQUE parcial `pet_co_owners_live`) si el usuario ya tiene una fila `INVITED`/`ACTIVE` en la mascota. */
  insert(row: PetCoOwnerRecord): Promise<void>;
  /** `UPDATE … WHERE id = ? AND status = esperado`; `true` si afectó una fila. Sube `version`. */
  transition(id: string, expectedStatus: CoOwnerStatus, patch: CoOwnerPatch): Promise<boolean>;
  /** Reconoce el aviso derivado del sucesor (`promotion_notice_ack_at`); `true` si la fila estaba `PROMOTED` y sin reconocer. */
  acknowledgePromotion(id: string, at: string): Promise<boolean>;
  /** Supresión de cuenta: `user_id` → NULL con `user_pseudonym` en las filas del usuario y `invited_by_user_id` → NULL en las que él emitió (F-05/F-06, NFR-012-009). */
  pseudonymizeUser(userId: string, pseudonym: string): Promise<void>;
  /** Mantenimiento (NFR-012-009): borra filas terminales cuya fecha terminal (`COALESCE(left_at, expires_at)`) es anterior al corte; devuelve cuántas. */
  purgeTerminalBefore(cutoffExclusive: string): Promise<number>;
}

export interface OwnerRequestRecord {
  readonly id: string;
  readonly action: OwnerRequestAction;
  readonly petId: string | null;
  readonly petVersion: number;
  readonly requesterUserId: string | null;
  readonly requesterPseudonym: string | null;
  readonly targetUserId: string | null;
  readonly targetUsernameSealed: string | null;
  readonly targetResponse: string | null;
  readonly triggerRequestIds: readonly string[] | null;
  readonly status: OwnerRequestStatus;
  readonly approverSet: readonly string[];
  readonly approvals: readonly OwnerApproval[];
  readonly rejectedBy: string | null;
  readonly rejectedByPseudonym: string | null;
  readonly message: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
  readonly staleReason: string | null;
  readonly disputeReason: 'CHIP_APPROPRIATION' | 'CO_OWNER_ABSENT_OR_BLOCKING' | 'PRINCIPAL_ABSENT' | null;
  readonly chipLast4: string | null;
  readonly chipHmac: string | null;
  readonly frozenUntil: string | null;
  readonly freezeExtendedAt: string | null;
  readonly slaDueAt: string | null;
  readonly escalatedAt: string | null;
  readonly resolvedAt: string | null;
  readonly resolution: 'REJECT' | 'ADD_CO_OWNER' | 'REQUEST_CHANGE_PRINCIPAL' | 'END_CO_OWNERSHIP' | null;
  readonly mootReason: 'TARGET_LEFT' | 'TARGET_NOT_ACTIVE' | 'REQUESTER_NOT_ACTIVE' | 'TRIGGER_LOST' | 'PET_GONE' | null;
  readonly resolvedByUserId: string | null;
  readonly secondApproverUserId: string | null;
  readonly executesAfter: string | null;
  /**
   * Arbitraje de `/admin` (T1648, migración 0037/0033): administradores que decidieron/confirmaron y copia seudónima de su `person_id` (sin FK). Opcionales: una fila sin arbitraje las omite (= null).
   * Nunca se exponen al reclamante ni a los propietarios (INV-CHP12-006).
   */
  readonly resolvedByAdminId?: string | null;
  readonly secondApproverAdminId?: string | null;
  readonly resolvedByPersonId?: string | null;
  readonly secondApproverPersonId?: string | null;
  readonly secondApprovedAt?: string | null;
  readonly version: number;
}

export interface OwnerRequestRepositoryPort {
  /** Solicitudes de la mascota (cualquier estado), por `createdAt` e `id`. */
  listByPet(petId: string): Promise<OwnerRequestRecord[]>;
  /** Solicitudes de cualquiera de esas mascotas (UNA lectura), por `createdAt` e `id`. */
  listByPets(petIds: readonly string[]): Promise<OwnerRequestRecord[]>;
  /** Solicitudes cuyo solicitante es el usuario (cualquier mascota, incluida una ya eliminada): límite de disputas abiertas y cooldown del solicitante (REQ-CHP12-004). */
  listByRequester(userId: string): Promise<OwnerRequestRecord[]>;
  /** Todas las solicitudes, incluidas las de mascota ya eliminada (`petId` nulo): expedientes que sobreviven a la mascota (INV-CHP12-005). */
  listAll(): Promise<OwnerRequestRecord[]>;
  findById(id: string): Promise<OwnerRequestRecord | null>;
  /** Falla si viola un UNIQUE parcial (una sola solicitud viva por `(pet, action)`). */
  insert(row: OwnerRequestRecord): Promise<void>;
  /** Reemplaza las columnas mutables de la fila `id` solo si su `status` sigue siendo el esperado; `true` si afectó una fila. Sube `version`. */
  update(row: OwnerRequestRecord, expectedStatus: OwnerRequestStatus): Promise<boolean>;
  /** Supresión de cuenta: columnas de usuario → NULL con seudónimo y `approver_set`/`approvals` sin el ID (rama R-04, SC-012-076, SC-012-108). */
  pseudonymizeUser(userId: string, pseudonym: string): Promise<void>;
  /** Mantenimiento: borra por id las filas indicadas; devuelve cuántas. */
  deleteByIds(ids: readonly string[]): Promise<number>;
  /**
   * Reserva del chip (INV-CHP12-009, T1646): ¿hay una `CHIP_DISPUTE` `CHIP_APPROPRIATION` en `UNDER_REVIEW` con ese `chip_hmac` y `expires_at > now`? SIEMPRE se ejecuta, con o sin mascota (la reserva
   * sobrevive a la eliminación de la mascota y a la caducidad de la congelación; se libera al cerrarse la disputa por `RESOLVED` o `EXPIRED`).
   */
  hasOpenChipReservation(chipHmac: string, nowIso: string): Promise<boolean>;
  /** Solicitudes con ese ancla `chip_hmac` (reclamaciones y disputas), por `createdAt` e `id`: la ancla sobrevive a la mascota (SC-012-079). */
  listByChipHmac(chipHmac: string): Promise<OwnerRequestRecord[]>;
}
