import { afterEach, describe, expect, it } from 'vitest';
import { runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { ARGOS, canonicalState } from '../../fixtures/application-harness.ts';
import { SequentialEntropy } from '../../fixtures/emergency-012.ts';
import { createApi, type Api } from './api-harness.ts';

/**
 * H-D2 (Bloque D, #32; `/keymaker`): `runMaintenance` engancha el barrido de la ficha QR (`RunEmergencyMaintenanceUseCase`) y el recálculo de la rotación de clave (`RotatePhoneHmacKeyUseCase`); la prueba
 * observa la purga de los eventos de tope `QR_*` de más de 2 h, que solo ocurre si el barrido de la ficha corrió. Sin la ficha configurada el mantenimiento no la toca.
 *
 * @implements REQ-QR12-006, REQ-QR12-010
 * Cubre SC-012-122, SC-012-124.
 */
let api: Api;
afterEach(async () => api.close());
const countQrEvents = () => (api.db.prepare("SELECT COUNT(*) AS n FROM rate_limit_events WHERE scope = 'QR_PRIVATE_WRITE'").get() as { n: number }).n;

describe('enganche de la ficha QR en el mantenimiento diario', () => {
  it('con la ficha configurada, runMaintenance purga los eventos QR_* de más de 2 h', async () => {
    api = await createApi(canonicalState(), { emergency: { phoneHmacKey: 'phone-hmac-key-A-0123456789abcdef0123456789', publicBaseUrl: 'https://argos.example', noticeVersion: '0.1.0', noticeEffectiveAt: '2026-11-01T00:00:00.000Z', entropy: new SequentialEntropy() } });
    api.clock.setClock('2026-11-26', '2026-11-26T15:00:00.000Z');
    const cookie = await api.login('andres');
    expect((await api.call('PUT', `/api/pets/${ARGOS.id}/critical-allergies`, { cookie, body: { criticalAllergies: ['Polen'] }, contract: false })).status).toBe(200);
    expect(countQrEvents()).toBe(1);
    api.clock.setClock('2026-11-26', '2026-11-26T18:00:00.000Z');
    await runMaintenance(api.deps);
    expect(countQrEvents()).toBe(0);
  });
});
