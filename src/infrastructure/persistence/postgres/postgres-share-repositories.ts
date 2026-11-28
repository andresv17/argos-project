/**
 * Repositorios PostgreSQL del enlace veterinario (feature 005, US4): `share_links` y `share_link_audit`, con paridad con SQLite (migración 0008 = 0012).
 * SQL parametrizado `$n` sin interpolación. `lockScope` toma `SELECT … FOR UPDATE` de la fila de la mascota (PET) o del hogar (HOUSEHOLD): el candado es del
 * ALCANCE, nunca del usuario creador (EDGE-005-15). Solo `token_hash` en la base (INV-005-005); fallos agregados por `(ip_hmac, ventana)` con un índice
 * único parcial y `ON CONFLICT`.
 *
 * @implements REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-008, REQ-VET-010, REQ-VET-012, REQ-VET-013, INV-005-005, SC-005-024, SC-005-038, SC-005-042
 */
import type { PetRepositoryPort } from '../../../application/ports/repositories.port.ts';
import { ShareLinkIdempotencyConflictError, type ShareAuditRecord, type ShareLinkAuditRepositoryPort, type ShareLinkPetRepositoryPort, type ShareLinkRepositoryPort } from '../../../application/ports/share-link.port.ts';
import type { PetProfile } from '../../../domain/pet/pet-invariants.ts';
import type { ShareLinkRecord } from '../../../domain/sharing/share-link.ts';
import { orderPetsForSummary } from '../../../domain/summary/clinical-summary.ts';
import type { PoolClientLike } from './postgres-database.ts';

type Row = Record<string, unknown>;

const LINK_COLUMNS =
  'id, token_hash, scope, pet_id, household_id, created_by_user_id, created_at, expires_in_days, expires_at, revoked_at, include_microchip, include_clinical_files, include_deceased_at, idempotency_key, pet_owner_user_id_at_creation';

const nullable = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const toLink = (row: Row): ShareLinkRecord => ({
  id: String(row['id']),
  tokenHash: String(row['token_hash']),
  scope: row['scope'] as ShareLinkRecord['scope'],
  petId: nullable(row['pet_id']),
  householdId: nullable(row['household_id']),
  createdByUserId: String(row['created_by_user_id']),
  createdAt: String(row['created_at']),
  expiresInDays: Number(row['expires_in_days']),
  expiresAt: String(row['expires_at']),
  revokedAt: nullable(row['revoked_at']),
  includeMicrochip: Number(row['include_microchip']) === 1,
  includeClinicalFiles: Number(row['include_clinical_files']) === 1,
  includeDeceasedAt: Number(row['include_deceased_at']) === 1,
  idempotencyKey: String(row['idempotency_key']),
  petOwnerUserIdAtCreation: nullable(row['pet_owner_user_id_at_creation']),
});

const scopeColumn = (scope: ShareLinkRecord['scope']): string => (scope === 'PET' ? 'pet_id' : 'household_id');

export function shareLinkRepository(client: PoolClientLike): ShareLinkRepositoryPort {
  return {
    async lockScope(scope, scopeId) {
      await client.query(scope === 'PET' ? 'SELECT id FROM pets WHERE id = $1 FOR UPDATE' : 'SELECT id FROM households WHERE id = $1 FOR UPDATE', [scopeId]);
    },
    async lockLink(shareLinkId) {
      await client.query('SELECT id FROM share_links WHERE id = $1 FOR UPDATE', [shareLinkId]);
    },
    async listPetsByHousehold(householdId, retainedSince) {
      const { rows } = await client.query(
        `SELECT ${LINK_COLUMNS} FROM share_links WHERE scope = 'PETS' AND household_id = $1 AND expires_at >= $2 AND (revoked_at IS NULL OR revoked_at >= $2) ORDER BY created_at DESC, id DESC`,
        [householdId, retainedSince],
      );
      return rows.map(toLink);
    },
    async listActivePetsByCreator(householdId, createdByUserId, now) {
      const { rows } = await client.query(
        `SELECT ${LINK_COLUMNS} FROM share_links WHERE scope = 'PETS' AND household_id = $1 AND created_by_user_id = $2 AND revoked_at IS NULL AND expires_at > $3 ORDER BY id`,
        [householdId, createdByUserId, now],
      );
      return rows.map(toLink);
    },
    async insert(link) {
      await client
        .query(`INSERT INTO share_links (${LINK_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
        link.id,
        link.tokenHash,
        link.scope,
        link.petId,
        link.householdId,
        link.createdByUserId,
        link.createdAt,
        link.expiresInDays,
        link.expiresAt,
        link.revokedAt,
        link.includeMicrochip ? 1 : 0,
        link.includeClinicalFiles ? 1 : 0,
        link.includeDeceasedAt ? 1 : 0,
        link.idempotencyKey,
        link.petOwnerUserIdAtCreation,
      ])
        .catch((error: unknown) => {
          const { code, constraint } = error as { code?: unknown; constraint?: unknown };
          if (code === '23505' && typeof constraint === 'string' && constraint.includes('idempotency_key')) throw new ShareLinkIdempotencyConflictError();
          throw error;
        });
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await client.query(`SELECT ${LINK_COLUMNS} FROM share_links WHERE token_hash = $1`, [tokenHash]);
      return rows[0] === undefined ? null : toLink(rows[0]);
    },
    async findById(id) {
      const { rows } = await client.query(`SELECT ${LINK_COLUMNS} FROM share_links WHERE id = $1`, [id]);
      return rows[0] === undefined ? null : toLink(rows[0]);
    },
    async findByIdempotencyKey(userId, idempotencyKey) {
      const { rows } = await client.query(`SELECT ${LINK_COLUMNS} FROM share_links WHERE created_by_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey]);
      return rows[0] === undefined ? null : toLink(rows[0]);
    },
    async listByScope(scope, scopeId, retainedSince) {
      if (scope === 'PETS') return []; // los `PETS` viven en `listPetsByHousehold` (annex §5.5)
      const { rows } = await client.query(
        `SELECT ${LINK_COLUMNS} FROM share_links WHERE scope = $1 AND ${scopeColumn(scope)} = $2 AND expires_at >= $3 AND (revoked_at IS NULL OR revoked_at >= $3) ORDER BY created_at DESC, id DESC`,
        [scope, scopeId, retainedSince],
      );
      return rows.map(toLink);
    },
    async countActive(scope, scopeId, now) {
      // ENM-005-E §5.5 (D12-21): el tope del hogar cuenta HOUSEHOLD y PETS de todos los creadores.
      const scopes = scope === 'PET' ? ['PET'] : ['HOUSEHOLD', 'PETS'];
      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM share_links WHERE scope = ANY($1::text[]) AND ${scopeColumn(scope)} = $2 AND revoked_at IS NULL AND expires_at > $3`, [scopes, scopeId, now]);
      return Number(rows[0]!['n']);
    },
    async revoke(id, now) {
      const result = await client.query('UPDATE share_links SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL AND expires_at > $1', [now, id]);
      return result.rowCount === 1;
    },
    async purge(cutoffExclusive) {
      const result = await client.query('DELETE FROM share_links WHERE expires_at < $1 OR revoked_at < $1', [cutoffExclusive]);
      return result.rowCount ?? 0;
    },
    async pseudonymizePetOwnerSnapshot(userId, pseudonym) {
      const result = await client.query('UPDATE share_links SET pet_owner_user_id_at_creation = $1 WHERE pet_owner_user_id_at_creation = $2', [pseudonym, userId]);
      return result.rowCount ?? 0;
    },
    async listAll() {
      const { rows } = await client.query(`SELECT ${LINK_COLUMNS} FROM share_links ORDER BY id`);
      return rows.map(toLink);
    },
  };
}

const OWNED = `(p.owner_user_id = $USER OR EXISTS (SELECT 1 FROM pet_co_owners c WHERE c.pet_id = p.id AND c.user_id = $USER AND c.status = 'ACTIVE'))`;

/**
 * `share_link_pets` (ENM-005-E, feature 012), con paridad con SQLite: la elegibilidad y la revalidación son UNA sentencia acotada a 20 ids; los perfiles se cargan con el lector de mascotas de la misma
 * transacción y se ordenan por `(name ASC, id ASC)` en memoria (el mismo comparador en los tres motores).
 * @implements REQ-VET12-001, REQ-VET12-003, INV-VET12-001, INV-VET12-002
 */
export function shareLinkPetRepository(client: PoolClientLike, pets: PetRepositoryPort): ShareLinkPetRepositoryPort {
  const load = async (ids: readonly string[]): Promise<PetProfile[]> => {
    const found: PetProfile[] = [];
    for (const id of ids) {
      const pet = await pets.findById(id);
      if (pet !== null) found.push(pet);
    }
    return orderPetsForSummary(found);
  };
  return {
    async insertMany(shareLinkId, petIds) {
      for (const petId of petIds) await client.query('INSERT INTO share_link_pets (share_link_id, pet_id) VALUES ($1, $2)', [shareLinkId, petId]);
    },
    async listPetIds(shareLinkId) {
      const { rows } = await client.query('SELECT pet_id FROM share_link_pets WHERE share_link_id = $1 ORDER BY pet_id', [shareLinkId]);
      return rows.map((r) => String(r['pet_id']));
    },
    async listPetIdsOfLinks(shareLinkIds) {
      const out = new Map<string, string[]>();
      if (shareLinkIds.length === 0) return out;
      const { rows } = await client.query('SELECT share_link_id, pet_id FROM share_link_pets WHERE share_link_id = ANY($1::text[]) ORDER BY share_link_id, pet_id', [[...shareLinkIds]]);
      for (const row of rows) out.set(String(row['share_link_id']), [...(out.get(String(row['share_link_id'])) ?? []), String(row['pet_id'])]);
      return out;
    },
    async listLinkIdsByPet(petId) {
      const { rows } = await client.query('SELECT share_link_id FROM share_link_pets WHERE pet_id = $1 ORDER BY share_link_id', [petId]);
      return rows.map((r) => String(r['share_link_id']));
    },
    async deleteRow(shareLinkId, petId) {
      const result = await client.query('DELETE FROM share_link_pets WHERE share_link_id = $1 AND pet_id = $2', [shareLinkId, petId]);
      return result.rowCount === 1;
    },
    async resolveEligible({ userId, householdId, petIds }) {
      const { rows } = await client.query(
        `SELECT p.id AS id, (p.id = ANY($3::text[])) AS requested
           FROM pets p JOIN pet_assignments a ON a.pet_id = p.id AND a.household_id = $2
          WHERE ${OWNED.replaceAll('$USER', '$1')}`,
        [userId, householdId, [...petIds]],
      );
      return { eligible: await load(rows.filter((r) => r['requested'] === true).map((r) => String(r['id']))), hasAnyEligibleInHousehold: rows.length > 0 };
    },
    async revalidateEligible({ shareLinkId, householdId, creatorUserId }) {
      const { rows } = await client.query(
        `SELECT p.id AS id
           FROM share_link_pets sp
           JOIN pets p ON p.id = sp.pet_id
           JOIN pet_assignments a ON a.pet_id = p.id AND a.household_id = $2
          WHERE sp.share_link_id = $1 AND ${OWNED.replaceAll('$USER', '$3')}`,
        [shareLinkId, householdId, creatorUserId],
      );
      return load(rows.map((r) => String(r['id'])));
    },
  };
}

const AUDIT_COLUMNS = 'id, share_link_id, event_type, occurred_at, actor_user_id, ip_hmac, fail_count';

export function shareAuditRepository(client: PoolClientLike): ShareLinkAuditRepositoryPort {
  return {
    async insert(row) {
      await client.query(`INSERT INTO share_link_audit (${AUDIT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [row.id, row.shareLinkId, row.eventType, row.occurredAt, row.actorUserId, row.ipHmac, row.failCount]);
    },
    async recordFailure(id, ipHmac, windowStart) {
      await client.query(
        `INSERT INTO share_link_audit (${AUDIT_COLUMNS}) VALUES ($1, NULL, 'ACCESS_FAILED', $2, NULL, $3, 1)
         ON CONFLICT (ip_hmac, occurred_at) WHERE event_type = 'ACCESS_FAILED' DO UPDATE SET fail_count = share_link_audit.fail_count + 1`,
        [id, windowStart, ipHmac],
      );
    },
    async clearActor(userId) {
      await client.query('UPDATE share_link_audit SET actor_user_id = NULL WHERE actor_user_id = $1', [userId]);
    },
    async purge({ withoutIpBefore, withIpBefore }) {
      const result = await client.query('DELETE FROM share_link_audit WHERE (ip_hmac IS NULL AND occurred_at < $1) OR (ip_hmac IS NOT NULL AND occurred_at < $2)', [withoutIpBefore, withIpBefore]);
      return result.rowCount ?? 0;
    },
    async listAll() {
      const { rows } = await client.query(`SELECT ${AUDIT_COLUMNS} FROM share_link_audit ORDER BY id`);
      return rows.map(
        (r): ShareAuditRecord => ({
          id: String(r['id']),
          shareLinkId: nullable(r['share_link_id']),
          eventType: r['event_type'] as ShareAuditRecord['eventType'],
          occurredAt: String(r['occurred_at']),
          actorUserId: nullable(r['actor_user_id']),
          ipHmac: nullable(r['ip_hmac']),
          failCount: Number(r['fail_count']),
        }),
      );
    },
  };
}
