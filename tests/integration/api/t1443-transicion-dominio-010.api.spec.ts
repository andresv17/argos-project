import { afterEach, describe, expect, it } from 'vitest';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { PASSWORDS } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from './api-harness.ts';

/**
 * T1443 (Feature 010, EDGE-010-003, REQ-TIP10-004): tras migrar de dominio, la cookie de sesión es host-only (sin `Domain`) y el callback OAuth antiguo
 * (sin la cookie `argos_oauth` del dominio nuevo) falla con el mismo mensaje uniforme, sin redirección ni bucle.
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

describe('T1443 transición de dominio (EDGE-010-003)', () => {
  it('[REQ-TIP10-004] la cookie de sesión no fija Domain (host-only): una sesión del dominio anterior no viaja al nuevo', async () => {
    api = await createApi(canonicalState());
    const response = await api.call('POST', '/api/auth/login', { body: { username: 'maria.v', password: PASSWORDS['maria.v'] } });
    expect(response.status).toBe(200);
    expect(response.setCookie).toMatch(/^argos_session=/);
    expect(response.setCookie).not.toMatch(/domain=/i);
  });

  it('[EDGE-010-003] sesión del dominio anterior ausente: la API responde 401 uniforme (sin 3xx, sin bucle de redirección)', async () => {
    api = await createApi(canonicalState());
    const response = await api.call('GET', '/api/auth/me', { csrf: false, cookie: null, contract: false });
    expect(response.status).toBe(401);
    expect(response.headers['location']).toBeUndefined();
  });

  it('[EDGE-010-003] callback OAuth antiguo (sin cookie argos_oauth): 400 con mensaje claro, sin Location ni cookie de sesión', async () => {
    api = await createApi(canonicalState());
    const response = await api.call('GET', '/api/auth/google/callback?code=codigo-antiguo&state=estado-antiguo', { csrf: false, cookie: null, contract: false });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.headers['location']).toBeUndefined();
    expect(response.setCookie ?? '').not.toMatch(/argos_session=[^;]/);
    expect(response.text).not.toMatch(/codigo-antiguo|estado-antiguo/);
  });
});
