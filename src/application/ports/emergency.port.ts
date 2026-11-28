/**
 * Puertos de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1675; `data-model.md`): `pet_emergency_cards`, `pet_emergency_phone_consents` y la columna `pets.critical_allergies`.
 * Solo se obtienen dentro de `UnitOfWorkPort.runInTransaction`. Mismo contrato en memoria, SQLite y PostgreSQL. Nunca guardan el token en claro (solo su SHA-256) ni el teléfono en claro (solo su HMAC).
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-001, INV-QR12-003, INV-ARCH-005
 */

export type EmergencyCardStatus = 'OFF' | 'ON';
export type EmergencyStatusReason = 'USER_DEACTIVATED' | 'AUTO_GUARD_LOST' | 'AUTO_PET_DECEASED' | 'AUTO_NOTICE_CHANGED';

/** Fila de `pet_emergency_cards`: una por mascota; `ON` exige `tokenHash`; `statusReason` solo con `OFF`; `consentedByUserId` y `lastScannedAt` solo con `ON`. */
export interface EmergencyCardRecord {
  readonly petId: string;
  readonly status: EmergencyCardStatus;
  readonly statusReason: EmergencyStatusReason | null;
  readonly statusChangedAt: string | null;
  /** SHA-256 hexadecimal (64) del token; `null` con `OFF`. */
  readonly tokenHash: string | null;
  readonly tokenRotatedAt: string | null;
  readonly consentNoticeVersion: string | null;
  readonly consentedByUserId: string | null;
  readonly activatedAt: string | null;
  readonly lastScannedAt: string | null;
  readonly version: number;
}

export interface EmergencyCardRepositoryPort {
  findByPet(petId: string): Promise<EmergencyCardRecord | null>;
  /** La ficha cuyo `token_hash` coincide (índice único); la comparación en tiempo constante la hace quien llama sobre el valor devuelto. */
  findByTokenHash(tokenHash: string): Promise<EmergencyCardRecord | null>;
  /** Inserta o reemplaza la fila de la mascota (`INSERT … ON CONFLICT (pet_id) DO UPDATE`). */
  save(record: EmergencyCardRecord): Promise<void>;
  /**
   * `UPDATE pet_emergency_cards SET status = 'OFF', status_reason = :motivo, status_changed_at = :ahora, token_hash = NULL, token_rotated_at = token_rotated_at, consented_by_user_id = NULL, last_scanned_at = NULL, version = version + 1
   * WHERE pet_id = :id AND status = 'ON'` (LAZY_RECONCILIATION): `true` solo si afectó una fila, de modo que dos reconciliaciones concurrentes emiten un único evento.
   */
  switchOffIfOn(petId: string, reason: EmergencyStatusReason, now: string): Promise<boolean>;
  /** `last_scanned_at = :at` solo si la ficha sigue `ON` con ese `token_hash` (una escritura por intervalo; el llamador decide la granularidad). */
  touchLastScanned(petId: string, tokenHash: string, at: string): Promise<void>;
  /** Mascotas con la ficha `ON`: el barrido de mantenimiento las reconcilia. */
  listOnPetIds(): Promise<string[]>;
  /** Filas `OFF` con `status_changed_at` anterior al corte: `status_reason`, `status_changed_at`, `consented_by_user_id`, `activated_at`, `token_rotated_at` y `consent_notice_version` pasan a NULL (rama N-06). */
  clearHistoryBefore(cutoffExclusive: string): Promise<number>;
  /** `pets.critical_allergies` ya decodificado (0 a 5 textos); `[]` si la mascota no existe. */
  findAllergies(petId: string): Promise<string[]>;
  /** Reemplaza `pets.critical_allergies` (el dominio ya normalizó la lista). No toca `pets.data` ni `version`. */
  setAllergies(petId: string, allergies: readonly string[]): Promise<void>;
}

/** Fila de `pet_emergency_phone_consents`: consentimiento de teléfono POR MASCOTA y titular, ligado a `phone_hmac` (HMAC-SHA-256 con clave propia). */
export interface EmergencyConsentRecord {
  readonly petId: string;
  readonly userId: string;
  readonly consentedAt: string;
  readonly noticeVersion: string;
  readonly phoneHmac: string;
}

export interface EmergencyConsentRepositoryPort {
  listByPet(petId: string): Promise<EmergencyConsentRecord[]>;
  listByUser(userId: string): Promise<EmergencyConsentRecord[]>;
  /** Todas las filas (barrido de rotación y de espera vencida del mantenimiento). */
  listAll(): Promise<EmergencyConsentRecord[]>;
  /** Inserta o reemplaza por `(pet_id, user_id)`. */
  upsert(record: EmergencyConsentRecord): Promise<void>;
  /** Borra la fila de `(pet_id, user_id)`; `true` si existía. */
  delete(petId: string, userId: string): Promise<boolean>;
  /** Borra todos los consentimientos de la mascota (toda transición a `OFF`); devuelve cuántos. */
  deleteByPet(petId: string): Promise<number>;
}
