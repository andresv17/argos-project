/**
 * Repositorios SQLite de la ficha QR de la 012 (#32; T1675): `pet_emergency_cards`, `pet_emergency_phone_consents` y `pets.critical_allergies` (migración 0041). Mismo contrato que PostgreSQL y memoria.
 * El token nunca se guarda en claro (solo `token_hash`, SHA-256) y el teléfono tampoco (solo `phone_hmac`).
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-ARCH-005
 */
import type { EmergencyCardRecord, EmergencyCardRepositoryPort, EmergencyConsentRecord, EmergencyConsentRepositoryPort } from '../../../application/ports/emergency.port.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

type Row = Record<string, unknown>;
const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const toEmergencyCard = (r: Row): EmergencyCardRecord => ({
  petId: String(r['pet_id']),
  status: r['status'] as EmergencyCardRecord['status'],
  statusReason: text(r['status_reason']) as EmergencyCardRecord['statusReason'],
  statusChangedAt: text(r['status_changed_at']),
  tokenHash: text(r['token_hash']),
  tokenRotatedAt: text(r['token_rotated_at']),
  consentNoticeVersion: text(r['consent_notice_version']),
  consentedByUserId: text(r['consented_by_user_id']),
  activatedAt: text(r['activated_at']),
  lastScannedAt: text(r['last_scanned_at']),
  version: Number(r['version']),
});

export const toEmergencyConsent = (r: Row): EmergencyConsentRecord => ({
  petId: String(r['pet_id']),
  userId: String(r['user_id']),
  consentedAt: String(r['consented_at']),
  noticeVersion: String(r['notice_version']),
  phoneHmac: String(r['phone_hmac']),
});

/** Decodifica `pets.critical_allergies` (arreglo JSON de textos); un valor ilegible se trata como lista vacía (falla cerrada: no se publica nada). */
export function decodeAllergies(raw: unknown): string[] {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export const EMERGENCY_CARD_COLUMNS = 'pet_id, status, status_reason, status_changed_at, token_hash, token_rotated_at, consent_notice_version, consented_by_user_id, activated_at, last_scanned_at, version';
export const EMERGENCY_CONSENT_COLUMNS = 'pet_id, user_id, consented_at, notice_version, phone_hmac';

export function sqliteEmergencyCardRepository(db: SqliteDatabase): EmergencyCardRepositoryPort {
  const byPet = db.prepare<[string], Row>(`SELECT ${EMERGENCY_CARD_COLUMNS} FROM pet_emergency_cards WHERE pet_id = ?`);
  const byHash = db.prepare<[string], Row>(`SELECT ${EMERGENCY_CARD_COLUMNS} FROM pet_emergency_cards WHERE token_hash = ?`);
  const upsert = db.prepare(
    `INSERT INTO pet_emergency_cards (${EMERGENCY_CARD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (pet_id) DO UPDATE SET status = excluded.status, status_reason = excluded.status_reason, status_changed_at = excluded.status_changed_at, token_hash = excluded.token_hash,
       token_rotated_at = excluded.token_rotated_at, consent_notice_version = excluded.consent_notice_version, consented_by_user_id = excluded.consented_by_user_id,
       activated_at = excluded.activated_at, last_scanned_at = excluded.last_scanned_at, version = excluded.version`,
  );
  const switchOff = db.prepare(
    `UPDATE pet_emergency_cards SET status = 'OFF', status_reason = ?, status_changed_at = ?, token_hash = NULL, consented_by_user_id = NULL, last_scanned_at = NULL, version = version + 1
     WHERE pet_id = ? AND status = 'ON'`,
  );
  const touch = db.prepare("UPDATE pet_emergency_cards SET last_scanned_at = ? WHERE pet_id = ? AND status = 'ON' AND token_hash = ?");
  const onPets = db.prepare<[], Row>("SELECT pet_id FROM pet_emergency_cards WHERE status = 'ON' ORDER BY pet_id");
  const clear = db.prepare(
    `UPDATE pet_emergency_cards SET status_reason = NULL, status_changed_at = NULL, consented_by_user_id = NULL, activated_at = NULL, token_rotated_at = NULL, consent_notice_version = NULL
     WHERE status = 'OFF' AND status_changed_at IS NOT NULL AND status_changed_at < ?`,
  );
  const allergies = db.prepare<[string], Row>('SELECT critical_allergies FROM pets WHERE id = ?');
  const writeAllergies = db.prepare('UPDATE pets SET critical_allergies = ? WHERE id = ?');
  return {
    async findByPet(petId) {
      const row = byPet.get(petId);
      return row === undefined ? null : toEmergencyCard(row);
    },
    async findByTokenHash(tokenHash) {
      const row = byHash.get(tokenHash);
      return row === undefined ? null : toEmergencyCard(row);
    },
    async save(r) {
      upsert.run(r.petId, r.status, r.statusReason, r.statusChangedAt, r.tokenHash, r.tokenRotatedAt, r.consentNoticeVersion, r.consentedByUserId, r.activatedAt, r.lastScannedAt, r.version);
    },
    async switchOffIfOn(petId, reason, now) {
      return switchOff.run(reason, now, petId).changes === 1;
    },
    async touchLastScanned(petId, tokenHash, at) {
      touch.run(at, petId, tokenHash);
    },
    async listOnPetIds() {
      return onPets.all().map((r) => String(r['pet_id']));
    },
    async clearHistoryBefore(cutoffExclusive) {
      return clear.run(cutoffExclusive).changes;
    },
    async findAllergies(petId) {
      const row = allergies.get(petId);
      return row === undefined ? [] : decodeAllergies(row['critical_allergies']);
    },
    async setAllergies(petId, list) {
      if (writeAllergies.run(JSON.stringify([...list]), petId).changes !== 1) throw new Error('FOREIGN KEY constraint failed: pets');
    },
  };
}

export function sqliteEmergencyConsentRepository(db: SqliteDatabase): EmergencyConsentRepositoryPort {
  const byPet = db.prepare<[string], Row>(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents WHERE pet_id = ? ORDER BY user_id`);
  const byUser = db.prepare<[string], Row>(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents WHERE user_id = ? ORDER BY pet_id`);
  const all = db.prepare<[], Row>(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents ORDER BY pet_id, user_id`);
  const upsert = db.prepare(
    `INSERT INTO pet_emergency_phone_consents (${EMERGENCY_CONSENT_COLUMNS}) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (pet_id, user_id) DO UPDATE SET consented_at = excluded.consented_at, notice_version = excluded.notice_version, phone_hmac = excluded.phone_hmac`,
  );
  const remove = db.prepare('DELETE FROM pet_emergency_phone_consents WHERE pet_id = ? AND user_id = ?');
  const removeByPet = db.prepare('DELETE FROM pet_emergency_phone_consents WHERE pet_id = ?');
  return {
    async listByPet(petId) {
      return byPet.all(petId).map(toEmergencyConsent);
    },
    async listByUser(userId) {
      return byUser.all(userId).map(toEmergencyConsent);
    },
    async listAll() {
      return all.all().map(toEmergencyConsent);
    },
    async upsert(r) {
      upsert.run(r.petId, r.userId, r.consentedAt, r.noticeVersion, r.phoneHmac);
    },
    async delete(petId, userId) {
      return remove.run(petId, userId).changes === 1;
    },
    async deleteByPet(petId) {
      return removeByPet.run(petId).changes;
    },
  };
}
