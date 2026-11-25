import { describe, expect, it } from 'vitest';
import { AppConfigError } from '../../src/infrastructure/config/app-config.ts';
import { PROD_SCENE, loadAppConfigActivated } from '../fixtures/scene-config-fixtures.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): F-03 / H-2b (`REQ-ADM11-005` (c), `EDGE-011-011`, `INV-ADM11-002`): con `NODE_ENV=production` el arranque RECHAZA
 * `ARGOS_ADMIN_EMAILS` vacía o ausente (de modo que siempre hay al menos un `SUPER_ADMIN` raíz); en desarrollo y pruebas se permite vacía. El error nombra solo la variable, nunca un valor.
 *
 * @implements REQ-ADM11-005, EDGE-011-011, INV-ADM11-002, INV-ARCH-006
 */
const PROD = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media', ...PROD_SCENE } as const;

function failure(env: Record<string, string | undefined>): { name: string; variables: readonly string[]; message: string } | null {
  try {
    loadAppConfigActivated(env);
    return null;
  } catch (error) {
    const e = error as AppConfigError;
    return { name: e.name, variables: e.variables, message: e.message };
  }
}

describe('T1525 arranque con la lista raíz (F-03, EDGE-011-011)', () => {
  it('[REQ-ADM11-005][EDGE-011-011] con NODE_ENV=production y ARGOS_ADMIN_EMAILS ausente el arranque se rechaza y nombra solo ARGOS_ADMIN_EMAILS', () => {
    expect(failure({ ...PROD })).toEqual({ name: 'AppConfigError', variables: ['ARGOS_ADMIN_EMAILS'], message: 'Configuración inválida: ARGOS_ADMIN_EMAILS. Revisa .env.example.' });
  });

  it.each(['', '   '])('[REQ-ADM11-005][EDGE-011-011] con NODE_ENV=production y ARGOS_ADMIN_EMAILS=%j (vacía) el arranque se rechaza', (value) => {
    expect(failure({ ...PROD, ARGOS_ADMIN_EMAILS: value })?.variables).toEqual(['ARGOS_ADMIN_EMAILS']);
  });

  it('[REQ-ADM11-005][EDGE-011-011] con NODE_ENV=production y al menos un correo raíz válido el arranque prospera y la lista queda en minúsculas', () => {
    const config = loadAppConfigActivated({ ...PROD, ARGOS_ADMIN_EMAILS: 'Admin.Raiz@Example.Test' });
    expect(config.adminEmails).toEqual(['admin.raiz@example.test']);
  });

  it.each([['test', {}], ['development', {}], ['test', { ARGOS_ADMIN_EMAILS: '' }]] as const)('[REQ-ADM11-005][EDGE-011-011] con NODE_ENV=%s la lista raíz vacía se permite (dev y pruebas)', (nodeEnv, extra) => {
    expect(loadAppConfigActivated({ NODE_ENV: nodeEnv, ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ...extra }).adminEmails).toEqual([]);
  });

  it('[REQ-ADM11-005][INV-ARCH-006] el mensaje de rechazo no repite ningún correo de la lista (el error nombra la variable, no el valor)', () => {
    const e = failure({ ...PROD, ARGOS_ADMIN_EMAILS: 'no-es-un-correo, tampoco' });
    expect(e?.variables).toEqual(['ARGOS_ADMIN_EMAILS']);
    expect(e?.message).not.toContain('tampoco');
  });
});
