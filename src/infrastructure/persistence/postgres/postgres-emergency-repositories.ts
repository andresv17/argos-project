/**
 * Repositorios PostgreSQL de la ficha QR de la 012 (#32; T1675): `pet_emergency_cards`, `pet_emergency_phone_consents` y `pets.critical_allergies` (migración 0037). Mismo contrato que SQLite y memoria.
 * SQL siempre parametrizado con `$n`. El token nunca se guarda en claro (solo `token_hash`) ni el teléfono (solo `phone_hmac`).
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-ARCH-005
 */
import type { EmergencyCardRepositoryPort, EmergencyConsentRepositoryPort } from '../../../application/ports/emergency.port.ts';
import { EMERGENCY_CARD_COLUMNS, EMERGENCY_CONSENT_COLUMNS, decodeAllergies, toEmergencyCard, toEmergencyConsent } from '../sqlite/sqlite-emergency-repositories.ts';
import type { PoolClientLike } from './postgres-database.ts';

export function postgresEmergencyCardRepository(client: PoolClientLike): EmergencyCardRepositoryPort {
  return {
    async findByPet(petId) {
      const { rows } = await client.query(`SELECT ${EMERGENCY_CARD_COLUMNS} FROM pet_emergency_cards WHERE pet_id = $1`, [petId]);
      return rows[0] === undefined ? null : toEmergencyCard(rows[0]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await client.query(`SELECT ${EMERGENCY_CARD_COLUMNS} FROM pet_emergency_cards WHERE token_hash = $1`, [tokenHash]);
      return rows[0] === undefined ? null : toEmergencyCard(rows[0]);
    },
    async save(r) {
      await client.query(
        `INSERT INTO pet_emergency_cards (${EMERGENCY_CARD_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (pet_id) DO UPDATE SET status = EXCLUDED.status, status_reason = EXCLUDED.status_reason, status_changed_at = EXCLUDED.status_changed_at, token_hash = EXCLUDED.token_hash,
           token_rotated_at = EXCLUDED.token_rotated_at, consent_notice_version = EXCLUDED.consent_notice_version, consented_by_user_id = EXCLUDED.consented_by_user_id,
           activated_at = EXCLUDED.activated_at, last_scanned_at = EXCLUDED.last_scanned_at, version = EXCLUDED.version`,
        [r.petId, r.status, r.statusReason, r.statusChangedAt, r.tokenHash, r.tokenRotatedAt, r.consentNoticeVersion, r.consentedByUserId, r.activatedAt, r.lastScannedAt, r.version],
      );
    },
    async switchOffIfOn(petId, reason, now) {
      const result = await client.query(
        `UPDATE pet_emergency_cards SET status = 'OFF', status_reason = $1, status_changed_at = $2, token_hash = NULL, consented_by_user_id = NULL, last_scanned_at = NULL, version = version + 1
         WHERE pet_id = $3 AND status = 'ON'`,
        [reason, now, petId],
      );
      return result.rowCount === 1;
    },
    async touchLastScanned(petId, tokenHash, at) {
      await client.query("UPDATE pet_emergency_cards SET last_scanned_at = $1 WHERE pet_id = $2 AND status = 'ON' AND token_hash = $3", [at, petId, tokenHash]);
    },
    async listOnPetIds() {
      const { rows } = await client.query("SELECT pet_id FROM pet_emergency_cards WHERE status = 'ON' ORDER BY pet_id");
      return rows.map((r) => String(r['pet_id']));
    },
    async clearHistoryBefore(cutoffExclusive) {
      const result = await client.query(
        `UPDATE pet_emergency_cards SET status_reason = NULL, status_changed_at = NULL, consented_by_user_id = NULL, activated_at = NULL, token_rotated_at = NULL, consent_notice_version = NULL
         WHERE status = 'OFF' AND status_changed_at IS NOT NULL AND status_changed_at < $1`,
        [cutoffExclusive],
      );
      return result.rowCount ?? 0;
    },
    async findAllergies(petId) {
      const { rows } = await client.query('SELECT critical_allergies FROM pets WHERE id = $1', [petId]);
      return rows[0] === undefined ? [] : decodeAllergies(rows[0]['critical_allergies']);
    },
    async setAllergies(petId, list) {
      const result = await client.query('UPDATE pets SET critical_allergies = $1 WHERE id = $2', [JSON.stringify([...list]), petId]);
      if (result.rowCount !== 1) throw new Error('FOREIGN KEY constraint failed: pets');
    },
  };
}

export function postgresEmergencyConsentRepository(client: PoolClientLike): EmergencyConsentRepositoryPort {
  return {
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents WHERE pet_id = $1 ORDER BY user_id`, [petId]);
      return rows.map(toEmergencyConsent);
    },
    async listByUser(userId) {
      const { rows } = await client.query(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents WHERE user_id = $1 ORDER BY pet_id`, [userId]);
      return rows.map(toEmergencyConsent);
    },
    async listAll() {
      const { rows } = await client.query(`SELECT ${EMERGENCY_CONSENT_COLUMNS} FROM pet_emergency_phone_consents ORDER BY pet_id, user_id`);
      return rows.map(toEmergencyConsent);
    },
    async upsert(r) {
      await client.query(
        `INSERT INTO pet_emergency_phone_consents (${EMERGENCY_CONSENT_COLUMNS}) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pet_id, user_id) DO UPDATE SET consented_at = EXCLUDED.consented_at, notice_version = EXCLUDED.notice_version, phone_hmac = EXCLUDED.phone_hmac`,
        [r.petId, r.userId, r.consentedAt, r.noticeVersion, r.phoneHmac],
      );
    },
    async delete(petId, userId) {
      const result = await client.query('DELETE FROM pet_emergency_phone_consents WHERE pet_id = $1 AND user_id = $2', [petId, userId]);
      return result.rowCount === 1;
    },
    async deleteByPet(petId) {
      const result = await client.query('DELETE FROM pet_emergency_phone_consents WHERE pet_id = $1', [petId]);
      return result.rowCount ?? 0;
    },
  };
}
