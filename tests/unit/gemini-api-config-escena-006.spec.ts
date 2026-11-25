import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig, SCENE_REAL_DRIVER_ACTIVATED, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';
import { PROD_SCENE } from '../fixtures/scene-config-fixtures.ts';

/**
 * T890 (006, tramo `gemini-api`): configuración del driver local privado. `gemini-api` solo fuera de producción; exige `GEMINI_API_KEY` (20..256, sin espacios ni
 * saltos de línea) y `ARGOS_SCENE_GEMINI_MODEL`; el error nombra solo la variable y nunca el valor; `fake` y `real` ignoran la clave; `real` sigue sin arrancar.
 * La clave es SINTÉTICA (centinela), no existe en ningún proveedor. REQ-ESC6-037; INV-ESC6-020; SC-ESC6-097.
 */
const SENTINEL_KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const MODEL = 'gemini-2.5-flash-image';
const PROD_BASE = { NODE_ENV: 'production', ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' };
const DEV = { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: SENTINEL_KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL } as const;

function failing(env: EnvironmentSource): { readonly variables: readonly string[]; readonly message: string } {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof AppConfigError) return { variables: error.variables, message: error.message };
    throw error;
  }
  return { variables: ['sin error'], message: '' };
}

describe('configuración del driver gemini-api (T890, REQ-ESC6-037, SC-ESC6-097)', () => {
  it('[REQ-ESC6-037] fuera de producción con clave y modelo válidos arranca con driver gemini-api, modelo y clave en la configuración de la escena', () => {
    for (const nodeEnv of ['development', 'test']) {
      const scene = loadAppConfig({ ...DEV, NODE_ENV: nodeEnv }).scene;
      expect(scene.driver).toBe('gemini-api');
      expect(scene.geminiModel).toBe(MODEL);
      expect(scene.geminiApiKey).toBe(SENTINEL_KEY);
    }
  });

  it('[INV-ESC6-020][SC-ESC6-097] con NODE_ENV=production gemini-api no arranca y el error nombra solo ARGOS_SCENE_DRIVER (igual que fake)', () => {
    const withGemini = failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: SENTINEL_KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL });
    expect(withGemini.variables).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(withGemini.message).not.toContain(SENTINEL_KEY);
    expect(failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'fake' }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'gemini-api' }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[SC-ESC6-097] sin GEMINI_API_KEY (ausente o vacía) el error nombra solo GEMINI_API_KEY', () => {
    const { GEMINI_API_KEY: _k, ...sinClave } = DEV;
    expect(failing(sinClave).variables).toEqual(['GEMINI_API_KEY']);
    expect(failing({ ...DEV, GEMINI_API_KEY: '' }).variables).toEqual(['GEMINI_API_KEY']);
  });

  it('[SC-ESC6-097] sin ARGOS_SCENE_GEMINI_MODEL o con un modelo fuera del patrón (../, espacios, ?, /) el error nombra solo ARGOS_SCENE_GEMINI_MODEL', () => {
    const { ARGOS_SCENE_GEMINI_MODEL: _m, ...sinModelo } = DEV;
    expect(failing(sinModelo).variables).toEqual(['ARGOS_SCENE_GEMINI_MODEL']);
    for (const bad of ['../models/x', 'gemini 2', 'gemini?key=1', 'gemini/x', 'gemini..x', 'x'.repeat(65), '-gemini']) {
      expect(failing({ ...DEV, ARGOS_SCENE_GEMINI_MODEL: bad }).variables).toEqual(['ARGOS_SCENE_GEMINI_MODEL']);
    }
  });

  it('[SC-ESC6-097] la clave debe medir 20..256 caracteres, sin espacios ni saltos de línea; el mensaje de error jamás contiene su valor', () => {
    const accepted = ['A'.repeat(20), 'A'.repeat(256), SENTINEL_KEY];
    for (const key of accepted) expect(loadAppConfig({ ...DEV, GEMINI_API_KEY: key }).scene.geminiApiKey).toBe(key);
    const rejected = ['A'.repeat(19), 'A'.repeat(257), `${'A'.repeat(25)} ${'B'.repeat(5)}`, `${'A'.repeat(25)}\n`, `${'A'.repeat(25)}\r\nx-evil: 1`, `\t${'A'.repeat(25)}`];
    for (const key of rejected) {
      const result = failing({ ...DEV, GEMINI_API_KEY: key });
      expect(result.variables).toEqual(['GEMINI_API_KEY']);
      expect(result.message).not.toContain(key.trim() === '' ? 'AAAA' : key.trim().slice(0, 25));
    }
  });

  it('[SC-ESC6-097] ningún mensaje de error, de ninguna de las fallas anteriores, contiene el valor de la clave centinela', () => {
    const { ARGOS_SCENE_GEMINI_MODEL: _m, ...sinModelo } = DEV;
    const messages = [failing(sinModelo).message, failing({ ...DEV, ARGOS_SCENE_GEMINI_MODEL: '../x' }).message, failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: SENTINEL_KEY }).message];
    for (const message of messages) {
      expect(message).not.toContain(SENTINEL_KEY);
      expect(message).not.toContain('AIza');
    }
  });

  it('[REQ-ESC6-037] la configuración no expone la clave a ningún serializador: JSON.stringify y las claves enumerables de scene no la contienen', () => {
    const config = loadAppConfig(DEV);
    expect(JSON.stringify(config)).not.toContain(SENTINEL_KEY);
    expect(JSON.stringify(config.scene)).not.toContain(SENTINEL_KEY);
    expect(Object.values(config.scene as unknown as Record<string, unknown>)).not.toContain(SENTINEL_KEY);
    expect(String(Object.entries(config.scene))).not.toContain(SENTINEL_KEY);
  });

  it('[REQ-ESC6-037] con fake o real la clave y el modelo gemini se ignoran: ni se validan ni llegan a la configuración', () => {
    const fake = loadAppConfig({ NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: DEV.ARGOS_AUDIT_HMAC_SECRET, ARGOS_SCENE_DRIVER: 'fake', GEMINI_API_KEY: 'corta', ARGOS_SCENE_GEMINI_MODEL: '../x' });
    expect(fake.scene.driver).toBe('fake');
    expect(fake.scene.geminiApiKey).toBeNull();
    expect(fake.scene.geminiModel).toBeNull();
    const defaulted = loadAppConfig({ NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: DEV.ARGOS_AUDIT_HMAC_SECRET, GEMINI_API_KEY: SENTINEL_KEY });
    expect(defaulted.scene.driver).toBe('fake');
    expect(defaulted.scene.geminiApiKey).toBeNull();
    const real = loadAppConfig({ NODE_ENV: 'test', ...PROD_SCENE, GEMINI_API_KEY: SENTINEL_KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL }, { sceneRealDriverActivated: true });
    expect(real.scene.driver).toBe('real');
    expect(real.scene.geminiApiKey).toBe(SENTINEL_KEY); // T1314 (D9-30): con real la clave es opcional y habilita el proveedor gemini-api; no es enumerable
    expect(JSON.stringify(real.scene)).not.toContain(SENTINEL_KEY);
    expect(real.scene.geminiModel).toBeNull();
  });

  it('[REQ-ESC6-031] SCENE_REAL_DRIVER_ACTIVATED es true (T885), gemini-api no lo usa y real con las variables de gemini-api presentes las ignora (sin clave en la configuración)', () => {
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(true);
    expect(loadAppConfig(DEV).scene.driver).toBe('gemini-api');
    expect(loadAppConfig({ NODE_ENV: 'test', ...PROD_SCENE, GEMINI_API_KEY: SENTINEL_KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL }).scene.geminiApiKey).toBe(SENTINEL_KEY);
    expect(failing({ NODE_ENV: 'test', ...PROD_SCENE, GEMINI_API_KEY: SENTINEL_KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL }).variables).toEqual(['sin error']);
  });

  it('[REQ-ESC6-037] ARGOS_SCENE_DRIVER fuera de {fake, gemini-api, real} no arranca y nombra solo ARGOS_SCENE_DRIVER', () => {
    expect(failing({ ...DEV, ARGOS_SCENE_DRIVER: 'GEMINI-API' }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ ...DEV, ARGOS_SCENE_DRIVER: 'vertex' }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
  });
});
