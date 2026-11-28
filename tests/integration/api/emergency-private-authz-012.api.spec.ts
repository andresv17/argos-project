import { afterEach, describe, expect, it } from 'vitest';
import type { EmergencyServices } from '../../../src/application/use-cases/use-case-support.ts';
import { ARGOS, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { SequentialEntropy } from '../../fixtures/emergency-012.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**
 * Autorización y robustez de las 7 rutas privadas de la ficha QR (Feature 012, #32; hallazgos S-1, S-2, S-3 de /seraph y B-01 de /trinity):
 * un miembro de hogar que no es titular (ADMIN, CAREGIVER o READER) recibe el 404 uniforme y no escribe nada; sin sesión 401 y sin `X-Argos-Request` 403 en TODAS las rutas;
 * tras regenerar el token anterior da 404 y el nuevo 200; y `Host`/`X-Forwarded-Host` forjados no alteran la URL generada (solo cuenta `publicBaseUrl`).
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, INV-QR12-001, INV-QR12-002, SC-012-083, SC-012-109, SC-012-126
 */
let api: Api;
afterEach(async () => api.close());

const NC = { contract: false } as const;
const NOW = '2026-11-26T15:00:00.000Z';
const PET = ARGOS.id;
const NOTICE = '0.1.0';
const BASE = 'https://argos.example';
const config = (): EmergencyServices => ({ phoneHmacKey: 'phone-hmac-key-A-0123456789abcdef0123456789', publicBaseUrl: BASE, noticeVersion: NOTICE, noticeEffectiveAt: '2026-11-01T00:00:00.000Z', entropy: new SequentialEntropy() });
const ON = { consentAccepted: true, noticeVersion: NOTICE };

async function setup(role: 'ADMIN' | 'CAREGIVER' | 'READER' = 'ADMIN'): Promise<{ andres: string; maria: string }> {
  const state = canonicalState();
  state.memberships = state.memberships.map((m) => (m.userId === MARIA ? { ...m, role, status: 'ACTIVE' as const } : m));
  api = await createApi(state, { emergency: config() });
  api.clock.setClock(NOW.slice(0, 10), NOW);
  return { andres: await api.login('andres'), maria: await api.login('maria.v') };
}

const count = (table: string): number => (api.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const auditCount = (): number => (api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE mutation_type LIKE 'EMERGENCY%'").get() as { n: number }).n;

/** Las 7 rutas privadas con un cuerpo válido (lo que el titular podría mandar). */
const ROUTES = [
  ['GET', `/api/pets/${PET}/emergency-card`, undefined],
  ['POST', `/api/pets/${PET}/emergency-card/activate`, ON],
  ['POST', `/api/pets/${PET}/emergency-card/regenerate`, ON],
  ['POST', `/api/pets/${PET}/emergency-card/deactivate`, undefined],
  ['PUT', `/api/pets/${PET}/emergency-card/phone-consent`, { visible: true, noticeVersion: NOTICE }],
  ['PUT', `/api/pets/${PET}/critical-allergies`, { criticalAllergies: ['Penicilina'] }],
  ['PUT', '/api/account/phone', { phone: '+573001112233' }],
] as const;

// Las alergias críticas tienen su propia regla de rol (ADMIN escribe, CAREGIVER y READER 403) y no forman parte de este 404 uniforme.
describe('S-1: el miembro de hogar que no es titular recibe 404 uniforme y no escribe nada', () => {
  it.each(['ADMIN', 'CAREGIVER', 'READER'] as const)('[SC-012-083] %s del hogar: estado, activar, regenerar, desactivar, y consentimiento dan 404 ERR-PET-NOT-FOUND sin escritura', async (role) => {
    const { andres, maria } = await setup(role);
    // BAJA-1: ficha ON del titular ANTES del bucle, para que el 404 sea por autorización y no por «sin ficha».
    expect((await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina'] }, ...NC })).status).toBe(200);
    expect((await api.call('POST', `/api/pets/${PET}/emergency-card/activate`, { cookie: andres, body: ON, ...NC })).status).toBe(201);
    const statusOf = () => api.db.prepare('SELECT status FROM pet_emergency_cards WHERE pet_id = ?').get(PET) as { status: string } | undefined;
    expect(statusOf()?.status).toBe('ON');
    const before = { cards: count('pet_emergency_cards'), consents: count('pet_emergency_phone_consents'), audits: auditCount() };
    for (const [method, url, body] of ROUTES.filter(([, u]) => u.includes('/emergency-card'))) {
      const res = await api.call(method, url, { cookie: maria, ...(body === undefined ? {} : { body }), ...NC });
      expect([res.status, problemOf(res).code], `${method} ${url}`).toEqual([404, 'ERR-PET-NOT-FOUND']);
    }
    expect({ cards: count('pet_emergency_cards'), consents: count('pet_emergency_phone_consents'), audits: auditCount() }).toEqual(before);
    expect(statusOf()?.status).toBe('ON'); // ningún intento ajeno apagó ni tocó la ficha
  });

  it('[SC-012-083] CAREGIVER recibe 403 ERR-ACC-FORBIDDEN en PUT critical-allergies y no escribe', async () => {
    const { maria } = await setup('CAREGIVER');
    const before = auditCount();
    const res = await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: maria, body: { criticalAllergies: ['Penicilina'] }, ...NC });
    expect([res.status, problemOf(res).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    expect(auditCount()).toBe(before);
    expect((api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE mutation_type = 'PET_CRITICAL_ALLERGIES_UPDATED'").get() as { n: number }).n).toBe(0);
  });
});

describe('S-2: sin sesión 401 y sin X-Argos-Request 403 en las 7 rutas privadas', () => {
  it.each(ROUTES)('[SC-012-083] %s %s sin sesión da 401', async (method, url, body) => {
    await setup();
    const res = await api.call(method, url, { cookie: null, ...(body === undefined ? {} : { body }), ...NC });
    expect(res.status).toBe(401);
  });

  // Solo las escrituras llevan guarda CSRF (el GET de estado no).
  it.each(ROUTES.filter(([method]) => method !== 'GET'))('[SC-012-083] %s %s sin X-Argos-Request da 403 aun con sesión válida y no escribe', async (method, url, body) => {
    const { andres } = await setup();
    const before = { cards: count('pet_emergency_cards'), consents: count('pet_emergency_phone_consents'), audits: auditCount() };
    const res = await api.call(method, url, { cookie: andres, csrf: false, ...(body === undefined ? {} : { body }), ...NC });
    expect(res.status).toBe(403);
    expect({ cards: count('pet_emergency_cards'), consents: count('pet_emergency_phone_consents'), audits: auditCount() }).toEqual(before);
  });
});

describe('S-3: regenerar invalida el token anterior', () => {
  it('[SC-012-051][SC-012-109] tras regenerar, el token anterior da 404 en /api/emergency y el nuevo 200', async () => {
    const { andres } = await setup();
    const call = (method: string, url: string, body?: unknown) => api.call(method, `/api/pets/${PET}${url}`, { cookie: andres, ...(body === undefined ? {} : { body }), ...NC });
    await call('PUT', '/critical-allergies', { criticalAllergies: ['Penicilina'] });
    const first = (await call('POST', '/emergency-card/activate', ON)).json as { token: string };
    expect((await api.call('GET', `/api/emergency/${first.token}`, { cookie: null, csrf: false, ...NC })).status).toBe(200);
    const second = (await call('POST', '/emergency-card/regenerate', ON)).json as { token: string };
    expect(second.token).not.toBe(first.token);
    const old = await api.call('GET', `/api/emergency/${first.token}`, { cookie: null, csrf: false, ...NC });
    expect([old.status, problemOf(old).code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
    const fresh = await api.call('GET', `/api/emergency/${second.token}`, { cookie: null, csrf: false, ...NC });
    expect(fresh.status).toBe(200);
    expect(fresh.json).toMatchObject({ criticalAllergies: ['Penicilina'] });
  });
});

describe('B-01: Host y X-Forwarded-Host forjados no alteran la URL generada', () => {
  it.each(['activate', 'regenerate'] as const)('[SC-012-109] %s: la URL y el QR salen de publicBaseUrl aunque Host y X-Forwarded-Host digan otra cosa', async (action) => {
    const { andres } = await setup();
    await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina'] }, ...NC });
    const forged = { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http', forwarded: 'host=evil.example;proto=http' };
    if (action === 'regenerate') await api.call('POST', `/api/pets/${PET}/emergency-card/activate`, { cookie: andres, body: ON, ...NC });
    const res = await api.call('POST', `/api/pets/${PET}/emergency-card/${action}`, { cookie: andres, body: ON, headers: forged, ...NC });
    expect(res.status).toBe(201);
    const issued = res.json as { token: string; url: string; qrSvg: string };
    expect(issued.url).toBe(`${BASE}/e/${issued.token}`);
    expect(res.text).not.toContain('evil.example');
  });
});
