import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { SequentialEntropy } from '../../fixtures/emergency-012.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**
 * Hueco 1 de T1676 (Feature 012, anexo aditivo §1): `phone` aparece SOLO en la sesión de su titular (`GET /api/auth/me`, `null` sin teléfono) y `criticalAllergies` en la ficha de la mascota
 * (`GET /api/pets/{id}/dashboard`) solo para quien ya la lee; un tercero sin acceso recibe 404 uniforme y nunca ve ninguno de los dos.
 *
 * @implements REQ-QR12-001, REQ-QR12-002
 */
let api: Api;
afterEach(async () => api.close());
const NC = { contract: false } as const;
const PET = ARGOS.id;
const PHONE = '+573001112233';

async function setup(): Promise<{ andres: string; maria: string }> {
  const state = canonicalState();
  state.memberships = state.memberships.map((m) => (m.userId === MARIA ? { ...m, role: 'ADMIN' as const, status: 'ACTIVE' as const } : m));
  api = await createApi(state, { emergency: { phoneHmacKey: 'phone-hmac-key-A-0123456789abcdef0123456789', publicBaseUrl: 'https://argos.example', noticeVersion: '0.1.0', noticeEffectiveAt: '2026-11-01T00:00:00.000Z', entropy: new SequentialEntropy() } });
  api.clock.setClock('2026-11-26', '2026-11-26T15:00:00.000Z');
  return { andres: await api.login('andres'), maria: await api.login('maria.v') };
}
const me = async (cookie: string) => ((await api.call('GET', '/api/auth/me', { cookie, ...NC })).json as { user: Record<string, unknown> }).user;
const dashboardProfile = async (cookie: string) => ((await api.call('GET', `/api/pets/${PET}/dashboard`, { cookie, ...NC })).json as { profile: Record<string, unknown> }).profile;

describe('campos aditivos de la 012 en las vistas de cuenta y mascota (hueco 1 de T1676)', () => {
  it('phone: null sin teléfono, el valor E.164 para su titular y nunca el de otro usuario', async () => {
    const { andres, maria } = await setup();
    expect((await me(andres))['phone']).toBeNull();
    expect((await api.call('PUT', '/api/account/phone', { cookie: andres, body: { phone: PHONE }, ...NC })).json).toEqual({ phone: PHONE });
    expect((await me(andres))['phone']).toBe(PHONE);
    expect((await me(maria))['phone']).toBeNull();
    expect(JSON.stringify(await dashboardProfile(maria))).not.toContain(PHONE);
    expect(JSON.stringify((await api.call('GET', `/api/pets/${PET}/dashboard`, { cookie: maria, ...NC })).json)).not.toContain(PHONE);
  });

  it('criticalAllergies: lista vacía por defecto, la guardada para el titular y el ADMIN de hogar, y 404 uniforme para un tercero sin acceso', async () => {
    const { andres, maria } = await setup();
    expect((await dashboardProfile(andres))['criticalAllergies']).toEqual([]);
    expect((await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina', 'Polen'] }, ...NC })).status).toBe(200);
    expect((await dashboardProfile(andres))['criticalAllergies']).toEqual(['Penicilina', 'Polen']);
    expect((await dashboardProfile(maria))['criticalAllergies']).toEqual(['Penicilina', 'Polen']);
    const outsider = await api.login('carlos_88');
    const res = await api.call('GET', `/api/pets/${PET}/dashboard`, { cookie: outsider, ...NC });
    expect([res.status, problemOf(res).code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
    expect(res.text).not.toContain('Penicilina');
  });
});
