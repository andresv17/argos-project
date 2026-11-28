import { describe, expect, it } from 'vitest';
import { buildEmergencyUrl, normalizePublicBaseUrl } from '../../../src/domain/emergency/emergency-url.ts';
import { QR_URL_MAX_BYTES } from '../../../src/domain/platform/feature-012-limits.ts';
import { EmergencyConfigError, isValidQrPublicBaseUrl, loadEmergencyServices } from '../../../src/infrastructure/config/emergency-config.ts';
import { domainErrorOf } from './_support.ts';

/**
 * T1684 (Feature 012, Bloque D, #32; `/keymaker`): `ARGOS_PUBLIC_BASE_URL` es la ÚNICA fuente de la URL del QR (nunca `Host` ni `X-Forwarded-*`), ASCII y a lo sumo `QR_URL_MAX_BYTES` = 106 bytes con el token;
 * `PHONE_HMAC_KEY` es la clave dedicada y sin ella la ficha no se conecta. Los errores de configuración nombran solo la variable, jamás el valor.
 *
 * @implements REQ-QR12-005, REQ-QR12-006, INV-QR12-005, INV-ARCH-006
 * Cubre SC-012-087, SC-012-122.
 */
const TOKEN = 'A'.repeat(43);
const KEY = 'phone-hmac-key-A-0123456789abcdef0123456789';

describe('T1684 URL del QR [SC-012-087]', () => {
  it('base + /e/ + token; la barra final de la base se normaliza', () => {
    expect(buildEmergencyUrl('https://argos.example', TOKEN)).toBe(`https://argos.example/e/${TOKEN}`);
    expect(buildEmergencyUrl('https://argos.example///', TOKEN)).toBe(`https://argos.example/e/${TOKEN}`);
  });

  it('el límite es exacto: 106 bytes pasa y 107 da 422 ERR-QR12-URL-TOO-LONG', () => {
    const fixed = '/e/'.length + 43;
    const atLimit = `https://${'a'.repeat(QR_URL_MAX_BYTES - fixed - 'https://'.length)}`;
    expect(Buffer.byteLength(buildEmergencyUrl(atLimit, TOKEN), 'utf8')).toBe(QR_URL_MAX_BYTES);
    const error = domainErrorOf(() => buildEmergencyUrl(`${atLimit}a`, TOKEN));
    expect([error.code, error.status]).toEqual(['ERR-QR12-URL-TOO-LONG', 422]);
  });

  it.each(['https://ñandú.example', 'https://argos.example/ruta con espacio', 'ftp://argos.example', 'argos.example', 'https://argos.example?x=1', 'https://argos.example#a', '', '   '])(
    'una base no ASCII o que no es http(s) absoluta (%j) da ERR-QR12-URL-TOO-LONG',
    (base) => {
      expect(normalizePublicBaseUrl(base)).toBeNull();
      expect(domainErrorOf(() => buildEmergencyUrl(base, TOKEN)).code).toBe('ERR-QR12-URL-TOO-LONG');
    },
  );
});

describe('T1684 configuración de la ficha', () => {
  it('sin PHONE_HMAC_KEY la ficha no se conecta (null) y no se valida nada más', () => {
    expect(loadEmergencyServices({}, null)).toBeNull();
    expect(loadEmergencyServices({ PHONE_HMAC_KEY: '' }, 'no-es-url')).toBeNull();
  });

  it('con la clave y una base válida devuelve los servicios con el aviso vigente y la entropía real de 32 bytes', () => {
    const services = loadEmergencyServices({ PHONE_HMAC_KEY: KEY }, 'https://argos.example/')!;
    expect([services.phoneHmacKey, services.publicBaseUrl, services.noticeVersion]).toEqual([KEY, 'https://argos.example', '0.1.0']);
    const a = services.entropy.next32();
    expect(a).toHaveLength(32);
    expect(services.entropy.next32()).not.toEqual(a);
  });

  it('una clave corta o con espacios y una base ausente, no ASCII o demasiado larga fallan nombrando SOLO la variable', () => {
    for (const [env, base, variable] of [
      [{ PHONE_HMAC_KEY: 'corta' }, 'https://argos.example', 'PHONE_HMAC_KEY'],
      [{ PHONE_HMAC_KEY: `${KEY} con espacio` }, 'https://argos.example', 'PHONE_HMAC_KEY'],
      [{ PHONE_HMAC_KEY: KEY }, null, 'ARGOS_PUBLIC_BASE_URL'],
      [{ PHONE_HMAC_KEY: KEY }, 'https://ñandú.example', 'ARGOS_PUBLIC_BASE_URL'],
      [{ PHONE_HMAC_KEY: KEY }, `https://${'a'.repeat(70)}.example`, 'ARGOS_PUBLIC_BASE_URL'],
    ] as const) {
      let caught: unknown;
      try {
        loadEmergencyServices(env, base);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EmergencyConfigError);
      expect((caught as EmergencyConfigError).invalidVariables).toEqual([variable]);
      expect((caught as Error).message).not.toContain(env.PHONE_HMAC_KEY);
      if (base !== null) expect((caught as Error).message).not.toContain(base);
    }
  });

  it('isValidQrPublicBaseUrl respeta el mismo límite exacto de 106 bytes', () => {
    expect(isValidQrPublicBaseUrl(`https://${'a'.repeat(60 - 'https://'.length)}`)).toBe(true);
    expect(isValidQrPublicBaseUrl(`https://${'a'.repeat(61 - 'https://'.length)}`)).toBe(false);
    expect(isValidQrPublicBaseUrl(null)).toBe(false);
  });
});
