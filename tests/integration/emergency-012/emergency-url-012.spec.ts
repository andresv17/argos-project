import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, ENGINE_FACTORIES, PET, cardRow, codeOf, emergencyCases, emergencyDeps, type Engine012 } from '../../fixtures/emergency-012.ts';

/**
 * T1684 (Feature 012, Bloque D, #32; `/keymaker`): una base pública que no cabe en `QR_URL_MAX_BYTES` o no es ASCII hace fallar la activación con `422 ERR-QR12-URL-TOO-LONG` y NO activa nada ni consume el aviso
 * (en los tres motores); la URL del QR sale solo de la configuración.
 *
 * @implements REQ-QR12-005, INV-QR12-005
 * Cubre SC-012-087.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});
const ON = { consentAccepted: true, noticeVersion: '0.1.0' };

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1684 URL del QR (${factory.name})`, { timeout: 60_000 }, () => {
    it.each([
      ['demasiado larga', `https://${'a'.repeat(70)}.example`],
      ['no ASCII', 'https://ñandú.example'],
    ])('[SC-012-087] la base %s da 422 ERR-QR12-URL-TOO-LONG, no activa la ficha y deja el estado intacto', async (_name, publicBaseUrl) => {
      engine = await factory.make();
      engine.setNow('2026-11-26T11:00:00.000Z');
      const good = emergencyCases(emergencyDeps(engine));
      await good.updateAllergies(ANDRES, PET, ['Polen']);
      const use = emergencyCases(emergencyDeps(engine, { publicBaseUrl }));
      expect(await codeOf(use.activate(ANDRES, PET, ON))).toBe('ERR-QR12-URL-TOO-LONG');
      expect(await cardRow(engine)).toBeNull();
      expect(await engine.auditTypes(PET)).not.toContain('EMERGENCY_CARD_ACTIVATED');
      expect((await good.activate(ANDRES, PET, ON))['status']).toBe('ON');
    });
  });
}
