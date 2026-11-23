import { describe, expect, it } from 'vitest';
import { AppConfigError, isValidGoogleRedirectUri, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * T1121 (Feature 008, REQ-SSO8-007, NFR-008-004): las tres variables `GOOGLE_OAUTH_*` se leen SOLO en `app-config.ts`; sin ellas la ruta queda desactivada (falla cerrado);
 * parciales o inválidas rechazan el arranque nombrando la variable, nunca su valor; el secreto no es enumerable (no sale en JSON, spread ni registros).
 */

const BASE = { NODE_ENV: 'test' } as const;
const FULL = {
  GOOGLE_OAUTH_CLIENT_ID: '000000000000-example.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secreto-de-prueba-nunca-real',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://argos.example.invalid/api/auth/google/callback',
} as const;

function variablesRejected(env: Record<string, string>): string[] {
  try {
    loadAppConfig({ ...BASE, ...env });
  } catch (error) {
    if (error instanceof AppConfigError) return [...error.variables];
    throw error;
  }
  return [];
}

describe('T1121 configuración de Google OAuth (REQ-SSO8-007)', () => {
  it('sin ninguna variable no hay configuración de Google (ruta desactivada)', () => {
    expect(loadAppConfig({ ...BASE }).google).toBeUndefined();
  });

  it('con las tres variables válidas expone client id y URI; el secreto existe pero no es enumerable', () => {
    const config = loadAppConfig({ ...BASE, ...FULL });
    expect(config.google).toMatchObject({ clientId: FULL.GOOGLE_OAUTH_CLIENT_ID, redirectUri: FULL.GOOGLE_OAUTH_REDIRECT_URI });
    expect(config.google!.clientSecret).toBe(FULL.GOOGLE_OAUTH_CLIENT_SECRET);
    expect(JSON.stringify(config)).not.toContain(FULL.GOOGLE_OAUTH_CLIENT_SECRET);
    expect(JSON.stringify({ ...config.google })).not.toContain(FULL.GOOGLE_OAUTH_CLIENT_SECRET);
    expect(Object.keys(config.google!)).toEqual(['clientId', 'redirectUri']);
  });

  it('un conjunto parcial rechaza el arranque nombrando las variables que faltan, sin sus valores', () => {
    expect(variablesRejected({ GOOGLE_OAUTH_CLIENT_ID: FULL.GOOGLE_OAUTH_CLIENT_ID })).toEqual(['GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI']);
    expect(variablesRejected({ GOOGLE_OAUTH_CLIENT_SECRET: FULL.GOOGLE_OAUTH_CLIENT_SECRET })).toEqual(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_REDIRECT_URI']);
    try {
      loadAppConfig({ ...BASE, GOOGLE_OAUTH_CLIENT_SECRET: FULL.GOOGLE_OAUTH_CLIENT_SECRET });
    } catch (error) {
      expect((error as Error).message).not.toContain(FULL.GOOGLE_OAUTH_CLIENT_SECRET);
    }
  });

  it('valores con espacios o comas, o una URI que no sea https (salvo localhost), se rechazan', () => {
    expect(variablesRejected({ ...FULL, GOOGLE_OAUTH_CLIENT_ID: 'con espacio' })).toEqual(['GOOGLE_OAUTH_CLIENT_ID']);
    expect(variablesRejected({ ...FULL, GOOGLE_OAUTH_CLIENT_SECRET: 'a,b' })).toEqual(['GOOGLE_OAUTH_CLIENT_SECRET']);
    expect(variablesRejected({ ...FULL, GOOGLE_OAUTH_REDIRECT_URI: 'http://argos.example.invalid/cb' })).toEqual(['GOOGLE_OAUTH_REDIRECT_URI']);
    expect(variablesRejected({ ...FULL, GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback' })).toEqual([]);
  });

  it('isValidGoogleRedirectUri rechaza consulta, fragmento, credenciales y espacios', () => {
    expect(['https://a.example/cb', 'https://a.example/cb?x=1', 'https://a.example/cb#f', 'https://u:p@a.example/cb', 'https://a.example/c b', 'ftp://a.example/cb'].map(isValidGoogleRedirectUri)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
