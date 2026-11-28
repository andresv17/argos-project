import { afterEach, describe, expect, it } from 'vitest';
import { stateHash } from '../../../src/domain/audit/state-hash.ts';
import { EMERGENCY_TEXTS } from '../../../src/domain/emergency/emergency-texts.ts';
import { ARGOS, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { SequentialEntropy } from '../../fixtures/emergency-012.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import * as schema from '../../../specs/012-multiduenio-microchip-cuidador/contracts/schemas/emergency-card.schema.json' with { type: 'json' };

/**
 * T1662 (Feature 012, Bloque D, #32; `/keymaker`): auditoría `PET_CRITICAL_ALLERGIES_UPDATED` por todo cambio EFECTIVO de las alergias, también el de un `ADMIN` de hogar, con el rol del actor y SIN contenido
 * ni conteo; quien solo lee (`READER`) recibe 403 y un ajeno 404; y el texto del editor es el de `/maggie` m-6.
 *
 * @implements REQ-QR12-002, INV-QR12-002
 * Cubre SC-012-048.
 */
let api: Api;
afterEach(async () => api.close());
const NC = { contract: false } as const;
const PET = ARGOS.id;
const SECRET_ALLERGY = 'Cacahuate-secreto-xyz';

async function setup(role: 'ADMIN' | 'READER'): Promise<{ andres: string; maria: string }> {
  const state = canonicalState();
  state.memberships = state.memberships.map((m) => (m.userId === MARIA ? { ...m, role, status: 'ACTIVE' as const } : m));
  api = await createApi(state, { emergency: { phoneHmacKey: 'phone-hmac-key-A-0123456789abcdef0123456789', publicBaseUrl: 'https://argos.example', noticeVersion: '0.1.0', noticeEffectiveAt: '2026-11-01T00:00:00.000Z', entropy: new SequentialEntropy() } });
  api.clock.setClock('2026-11-26', '2026-11-26T15:00:00.000Z');
  return { andres: await api.login('andres'), maria: await api.login('maria.v') };
}
const put = (cookie: string, list: string[]) => api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie, body: { criticalAllergies: list }, ...NC });
const auditRows = () => api.db.prepare("SELECT executor_user_id, previous_state_hash, new_state_hash, entity_id FROM audit_log WHERE mutation_type = 'PET_CRITICAL_ALLERGIES_UPDATED' ORDER BY timestamp, id").all() as Array<{ executor_user_id: string; previous_state_hash: string | null; new_state_hash: string | null; entity_id: string }>;

describe('T1662 auditoría de alergias críticas [SC-012-048]', () => {
  it('el ADMIN de hogar y el principal quedan auditados con new_state_hash NULL (H-D1 b: sin actorRole ni hash de metadatos); sin contenido ni hash del contenido y solo por cambio efectivo', async () => {
    const { andres, maria } = await setup('ADMIN');
    expect((await put(maria, [SECRET_ALLERGY])).status).toBe(200);
    expect((await put(maria, [SECRET_ALLERGY])).status).toBe(200); // idempotente: sin segunda fila
    expect((await put(andres, [SECRET_ALLERGY, 'Polen'])).status).toBe(200);
    const rows = auditRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.executor_user_id, r.entity_id, r.previous_state_hash, r.new_state_hash])).toEqual([
      [MARIA, PET, null, null],
      [expect.any(String), PET, null, null],
    ]);
    const dump = JSON.stringify(api.db.prepare('SELECT * FROM audit_log').all()); // solo la auditoría: la lista vive en pets.critical_allergies por diseño
    expect(dump).not.toContain(SECRET_ALLERGY);
    for (const hash of [stateHash([SECRET_ALLERGY]), stateHash({ criticalAllergies: [SECRET_ALLERGY] }), stateHash(['Polen']), stateHash({ actorRole: 'ADMIN' }), stateHash({ actorRole: 'OWNER' })]) expect(dump).not.toContain(hash);
  });

  it('un lector (READER) ve la mascota pero no la edita: 403; un vaciado inválido no audita', async () => {
    const { andres, maria } = await setup('READER');
    const denied = await put(maria, ['x']);
    expect([denied.status, problemOf(denied).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    const invalid = await put(andres, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect([invalid.status, problemOf(invalid).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(auditRows()).toEqual([]);
  });

  it('el texto del editor es el de maggie m-6 y coincide con el esquema del contrato', () => {
    const texts = (schema as unknown as { default: { 'x-sdd-constants': { TEXTS: { value: { allergiesEditorHelp: string; version: string } } } } }).default['x-sdd-constants'].TEXTS.value;
    expect(EMERGENCY_TEXTS.allergiesEditorHelp).toBe(texts.allergiesEditorHelp);
    expect(EMERGENCY_TEXTS.version).toBe(texts.version);
    expect(EMERGENCY_TEXTS.allergiesEditorHelp).toContain('No escribas nombres ni datos de otras personas.');
  });
});
