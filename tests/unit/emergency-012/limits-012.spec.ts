import { describe, expect, it } from 'vitest';
import * as limitsModule from '../../../src/domain/platform/feature-012-limits.ts';

const limits = limitsModule as Record<string, unknown>;

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675): constantes de `feature-012-limits.ts` fijadas por `emergency-card.schema.json` (`x-sdd-constants`, 0.3.0). Fallan hoy porque el archivo no las exporta.
 *
 * @implements REQ-QR12-003, REQ-QR12-004, REQ-QR12-005, REQ-QR12-007
 * Cubre SC-012-050, SC-012-087, SC-012-106.
 */
describe('T1674 constantes del Bloque D (fuente única: x-sdd-constants)', () => {
  it('[SC-012-106] topes por usuario: 20 por hora (activar+regenerar+desactivar) y 60 por hora (consentimiento, alergias y teléfono)', () => {
    expect(limits.QR_CARD_MUTATIONS_PER_USER_PER_HOUR).toBe(20);
    expect(limits.QR_PRIVATE_WRITES_PER_USER_PER_HOUR).toBe(60);
  });
  it('[SC-012-087] forma de la ficha: 5 alergias, 2 teléfonos, URL de 106 bytes, 30 lecturas por IP y minuto, historial de 90 días', () => {
    expect(limits.MAX_CRITICAL_ALLERGIES).toBe(5);
    expect(limits.MAX_EMERGENCY_PHONES).toBe(2);
    expect(limits.QR_URL_MAX_BYTES).toBe(106);
    expect(limits.QR_SCAN_MAX_PER_IP_PER_MINUTE).toBe(30);
    expect(limits.EMERGENCY_HISTORY_RETENTION_DAYS).toBe(90);
    expect(limits.EMERGENCY_NOTICE_WAIT_DAYS).toBe(90);
    expect(limits.QR_LAST_SCANNED_GRANULARITY_MINUTES).toBe(60);
  });
  it('[SC-012-050] el aviso vigente es 0.1.0 y su fecha de entrada en vigor es un instante ISO UTC', () => {
    expect(limits.EMERGENCY_NOTICE_VERSION).toBe('0.1.0');
    expect(limits.EMERGENCY_NOTICE_EFFECTIVE_AT).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  it('la instancia pública constante de los 404 y 429 es «/emergency»', () => {
    expect(limits.PUBLIC_PROBLEM_INSTANCE).toBe('/emergency');
  });
});
