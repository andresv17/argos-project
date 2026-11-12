import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { AUDIT_SECRET_HEX } from '../../fixtures/audit-fixtures.ts';

/**
 * T256 (fase ROJA) — el secreto de la seudonimización (REQ-AUD-001, SC-014, INV-ARCH-006).
 * Causa roja esperada: loadAppConfig aún no conoce ARGOS_AUDIT_HMAC_SECRET (devuelve configuración sin lanzar AppConfigError).
 * Supuesto de contrato: el modo de producción se declara con NODE_ENV=production; el secreto válido son >= 32 bytes en hexadecimal (64 caracteres).
 */
function errorOf(env: Record<string, string | undefined>): { variables: readonly string[]; leaked: boolean } | 'sin error' {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof AppConfigError) return { variables: error.variables, leaked: JSON.stringify(error.message).includes('mal-secreto') };
    throw error;
  }
  return 'sin error';
}

describe('ARGOS_AUDIT_HMAC_SECRET en la configuración (src/infrastructure/config/app-config.ts)', () => {
  it('[REQ-AUD-001][SC-014] en producción, sin ARGOS_AUDIT_HMAC_SECRET la aplicación no arranca: AppConfigError nombra solo esa variable', () => {
    expect(errorOf({ NODE_ENV: 'production' })).toEqual({ variables: ['ARGOS_AUDIT_HMAC_SECRET'], leaked: false });
  });

  it('[REQ-AUD-001][SC-014] en producción, un secreto vacío, corto (< 32 bytes) o no hexadecimal tampoco arranca, sin copiar el valor al mensaje de error', () => {
    const invalid = ['', 'mal-secreto', 'ab'.repeat(31), `${'zz'.repeat(32)}`];
    expect(invalid.map((v) => errorOf({ NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: v }))).toEqual(
      invalid.map(() => ({ variables: ['ARGOS_AUDIT_HMAC_SECRET'], leaked: false })),
    );
  });

  it('[REQ-AUD-001][SC-014] en producción, un secreto de 32 bytes en hexadecimal (64 caracteres) arranca', () => {
    expect(errorOf({ NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: AUDIT_SECRET_HEX })).toBe('sin error');
  });

  it('[REQ-AUD-001][INV-ARCH-006] en desarrollo y pruebas se admite arrancar sin secreto (valor fijo de prueba explícito), pero un secreto presente e inválido se rechaza también fuera de producción', () => {
    expect([errorOf({}), errorOf({ NODE_ENV: 'test' }), errorOf({ NODE_ENV: 'development' })]).toEqual(['sin error', 'sin error', 'sin error']);
    expect(errorOf({ NODE_ENV: 'test', ARGOS_AUDIT_HMAC_SECRET: 'mal-secreto' })).toEqual({ variables: ['ARGOS_AUDIT_HMAC_SECRET'], leaked: false });
  });
});
