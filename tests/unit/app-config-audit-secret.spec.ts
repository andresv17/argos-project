import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * D-1 de Neo (T269): ARGOS_AUDIT_HMAC_SECRET es obligatoria en cualquier entorno salvo NODE_ENV=test.
 * @implements REQ-AUD-001, SC-014, INV-ARCH-006
 */
const VALID_SECRET = 'ab'.repeat(32);

describe('ARGOS_AUDIT_HMAC_SECRET obligatoria fuera de pruebas (src/infrastructure/config/app-config.ts)', () => {
  it.each(['development', 'production', undefined])('[REQ-AUD-001][SC-014] con NODE_ENV=%s y sin la variable, AppConfigError cita solo su nombre', (nodeEnv) => {
    let caught: unknown;
    try {
      loadAppConfig(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppConfigError);
    expect([(caught as AppConfigError).variables, (caught as AppConfigError).message]).toEqual([
      ['ARGOS_AUDIT_HMAC_SECRET'],
      'Configuración inválida: ARGOS_AUDIT_HMAC_SECRET. Revisa .env.example.',
    ]);
  });

  it('[REQ-AUD-001] con NODE_ENV=test y sin la variable, la configuración carga (el servidor aplica la clave fija de prueba)', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).auditHmacSecret).toBeNull();
  });

  it('[REQ-AUD-001][SC-014] con la variable presente se usa su valor, en desarrollo y en pruebas', () => {
    expect([
      loadAppConfig({ NODE_ENV: 'development', ARGOS_AUDIT_HMAC_SECRET: VALID_SECRET }).auditHmacSecret,
      loadAppConfig({ NODE_ENV: 'test', ARGOS_AUDIT_HMAC_SECRET: VALID_SECRET }).auditHmacSecret,
    ]).toEqual([VALID_SECRET, VALID_SECRET]);
  });

  it('[REQ-AUD-001][SC-014] un valor inválido no se copia al mensaje de error', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'development', ARGOS_AUDIT_HMAC_SECRET: 'mal-secreto' })).toThrowError(/^Configuración inválida: ARGOS_AUDIT_HMAC_SECRET\. Revisa \.env\.example\.$/);
  });
});
