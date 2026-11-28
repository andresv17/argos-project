/**
 * Repositorios en memoria de la ficha QR de la 012 (#32; T1675): `pet_emergency_cards`, `pet_emergency_phone_consents` y `pets.critical_allergies`. Mismas reglas observables que SQLite y PostgreSQL:
 * `token_hash` único, CHECK cruzados de la fila (ON <=> token; razón solo con OFF; `consented_by_user_id` y `last_scanned_at` solo con ON) y FK a la mascota.
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-ARCH-005
 */
import type { EmergencyCardRecord, EmergencyCardRepositoryPort, EmergencyConsentRecord, EmergencyConsentRepositoryPort } from '../../../application/ports/emergency.port.ts';

/** Parte del estado de memoria del Bloque D (opcional: ausente = vacía). */
export interface EmergencyMemoryState {
  emergencyCards?: EmergencyCardRecord[] | undefined;
  emergencyConsents?: EmergencyConsentRecord[] | undefined;
  /** `pets.critical_allergies` por mascota; sin entrada = lista vacía. */
  petAllergies?: Record<string, string[]> | undefined;
  /** Mascotas existentes: las filas de la ficha y los consentimientos exigen la FK. */
  pets?: ReadonlyArray<{ readonly id: string }> | undefined;
}

const copy = <T>(value: T): T => structuredClone(value);
const constraint = (message: string): Error => Object.assign(new Error(message), { code: 'SQLITE_CONSTRAINT' });

function assertCoherent(row: EmergencyCardRecord): void {
  if ((row.status === 'ON') !== (row.tokenHash !== null)) throw constraint('CHECK constraint failed: pet_emergency_cards token');
  if (row.status === 'ON' && row.statusReason !== null) throw constraint('CHECK constraint failed: pet_emergency_cards status_reason');
  if (row.status !== 'ON' && (row.consentedByUserId !== null || row.lastScannedAt !== null)) throw constraint('CHECK constraint failed: pet_emergency_cards on_only');
  if (row.tokenHash !== null && row.tokenHash.length !== 64) throw constraint('CHECK constraint failed: pet_emergency_cards token_hash');
}

export function memoryEmergencyCardRepository(state: EmergencyMemoryState): EmergencyCardRepositoryPort {
  const rows = (): EmergencyCardRecord[] => (state.emergencyCards ??= []);
  const petExists = (petId: string): boolean => state.pets === undefined || state.pets.some((p) => p.id === petId);
  return {
    async findByPet(petId) {
      return copy(rows().find((r) => r.petId === petId) ?? null);
    },
    async findByTokenHash(tokenHash) {
      return copy(rows().find((r) => r.tokenHash === tokenHash) ?? null);
    },
    async save(record) {
      assertCoherent(record);
      if (!petExists(record.petId)) throw constraint('FOREIGN KEY constraint failed: pet_emergency_cards');
      if (record.tokenHash !== null && rows().some((r) => r.petId !== record.petId && r.tokenHash === record.tokenHash)) throw constraint('UNIQUE constraint failed: pet_emergency_cards.token_hash');
      state.emergencyCards = [...rows().filter((r) => r.petId !== record.petId), copy(record)];
    },
    async switchOffIfOn(petId, reason, now) {
      const index = rows().findIndex((r) => r.petId === petId && r.status === 'ON');
      if (index < 0) return false;
      const current = rows()[index]!;
      rows()[index] = { ...current, status: 'OFF', statusReason: reason, statusChangedAt: now, tokenHash: null, consentedByUserId: null, lastScannedAt: null, version: current.version + 1 };
      return true;
    },
    async touchLastScanned(petId, tokenHash, at) {
      const index = rows().findIndex((r) => r.petId === petId && r.status === 'ON' && r.tokenHash === tokenHash);
      if (index >= 0) rows()[index] = { ...rows()[index]!, lastScannedAt: at };
    },
    async listOnPetIds() {
      return rows()
        .filter((r) => r.status === 'ON')
        .map((r) => r.petId)
        .sort();
    },
    async clearHistoryBefore(cutoffExclusive) {
      let cleared = 0;
      state.emergencyCards = rows().map((r) => {
        if (r.status !== 'OFF' || r.statusChangedAt === null || r.statusChangedAt >= cutoffExclusive) return r;
        cleared += 1;
        return { ...r, statusReason: null, statusChangedAt: null, consentedByUserId: null, activatedAt: null, tokenRotatedAt: null, consentNoticeVersion: null };
      });
      return cleared;
    },
    async findAllergies(petId) {
      return copy(state.petAllergies?.[petId] ?? []);
    },
    async setAllergies(petId, allergies) {
      if (!petExists(petId)) throw constraint('FOREIGN KEY constraint failed: pets');
      (state.petAllergies ??= {})[petId] = [...allergies];
    },
  };
}

export function memoryEmergencyConsentRepository(state: EmergencyMemoryState): EmergencyConsentRepositoryPort {
  const rows = (): EmergencyConsentRecord[] => (state.emergencyConsents ??= []);
  const byKey = (a: EmergencyConsentRecord, b: EmergencyConsentRecord) => (a.petId < b.petId ? -1 : a.petId > b.petId ? 1 : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
  return {
    async listByPet(petId) {
      return copy(rows().filter((r) => r.petId === petId).sort(byKey));
    },
    async listByUser(userId) {
      return copy(rows().filter((r) => r.userId === userId).sort(byKey));
    },
    async listAll() {
      return copy([...rows()].sort(byKey));
    },
    async upsert(record) {
      if (record.phoneHmac.length !== 64) throw constraint('CHECK constraint failed: pet_emergency_phone_consents phone_hmac');
      state.emergencyConsents = [...rows().filter((r) => !(r.petId === record.petId && r.userId === record.userId)), copy(record)];
    },
    async delete(petId, userId) {
      const before = rows().length;
      state.emergencyConsents = rows().filter((r) => !(r.petId === petId && r.userId === userId));
      return state.emergencyConsents.length < before;
    },
    async deleteByPet(petId) {
      const before = rows().length;
      state.emergencyConsents = rows().filter((r) => r.petId !== petId);
      return before - state.emergencyConsents.length;
    },
  };
}
