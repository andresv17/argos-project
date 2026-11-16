import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG_DEFAULTS, AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

function configError(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadAppConfig({ NODE_ENV: 'test', ...env });
  } catch (error) {
    if (error instanceof AppConfigError) return error.variables;
    throw error;
  }
  return ['sin error'];
}

describe('configuración (src/infrastructure/config/app-config.ts)', () => {
  it('[INV-ARCH-006] sin variables se usan los valores por defecto, que coinciden con .env.example', () => {
    const example = Object.fromEntries(
      readFileSync('.env.example', 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => l.split('=') as [string, string]),
    );
    expect([loadAppConfig({ NODE_ENV: 'test' }), example]).toEqual([
      {
        port: 3100,
        host: '127.0.0.1',
        databasePath: './data/argos.sqlite',
        appTimezone: 'America/Bogota',
        cookieSecure: false,
        exportMaxPerWindow: 5,
        exportWindowMinutes: 15,
        inviteMaxPerWindow: 20,
        inviteWindowMinutes: 15,
        auditRetentionDays: 730,
        auditHmacSecret: null,
      },
      APP_CONFIG_DEFAULTS,
    ]);
  });

  it('[INV-ARCH-006] las variables válidas se convierten a sus tipos; las vacías toman el valor por defecto', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', PORT: '65535', HOST: '127.0.0.1', DATABASE_PATH: '/tmp/argos/test.sqlite', APP_TIMEZONE: 'Europe/Madrid', COOKIE_SECURE: 'true', OTRA: 'x' });
    expect([config, loadAppConfig({ NODE_ENV: 'test', PORT: '', APP_TIMEZONE: '' })]).toEqual([
      { ...loadAppConfig({ NODE_ENV: 'test' }), port: 65535, databasePath: '/tmp/argos/test.sqlite', appTimezone: 'Europe/Madrid', cookieSecure: true },
      loadAppConfig({ NODE_ENV: 'test' }),
    ]);
  });

  it('[INV-ARCH-006][ERR-RATE-LIMITED] los límites de frecuencia salen de EXPORT_MAX_PER_WINDOW, EXPORT_WINDOW_MINUTES, INVITE_MAX_PER_WINDOW e INVITE_WINDOW_MINUTES y se convierten a enteros', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', EXPORT_MAX_PER_WINDOW: '2', EXPORT_WINDOW_MINUTES: '60', INVITE_MAX_PER_WINDOW: '100', INVITE_WINDOW_MINUTES: '5' });
    expect([config.exportMaxPerWindow, config.exportWindowMinutes, config.inviteMaxPerWindow, config.inviteWindowMinutes]).toEqual([2, 60, 100, 5]);
  });

  it.each([
    [{ PORT: '0' }, ['PORT']],
    [{ PORT: '65536' }, ['PORT']],
    [{ PORT: '3000.5' }, ['PORT']],
    [{ PORT: '03000' }, ['PORT']],
    [{ HOST: '0.0.0.0' }, ['HOST']],
    [{ HOST: '0.0.0.0', ARGOS_DB_DRIVER: 'sqlite' }, ['HOST']],
    [{ HOST: '0.0.0.0', NODE_ENV: 'development', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32) }, ['HOST']],
    [{ HOST: '0.0.0.0', NODE_ENV: 'staging', ARGOS_DB_DRIVER: 'memory', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32) }, ['HOST']],
    [{ DATABASE_PATH: '   ' }, ['DATABASE_PATH']],
    [{ APP_TIMEZONE: 'Marte/Olympus' }, ['APP_TIMEZONE']],
    [{ APP_TIMEZONE: '../etc' }, ['APP_TIMEZONE']],
    [{ COOKIE_SECURE: 'yes' }, ['COOKIE_SECURE']],
    [{ PORT: 'x', HOST: 'localhost', COOKIE_SECURE: '1' }, ['PORT', 'HOST', 'COOKIE_SECURE']],
    [{ EXPORT_MAX_PER_WINDOW: '0' }, ['EXPORT_MAX_PER_WINDOW']],
    [{ EXPORT_WINDOW_MINUTES: '-5' }, ['EXPORT_WINDOW_MINUTES']],
    [{ INVITE_MAX_PER_WINDOW: '2.5' }, ['INVITE_MAX_PER_WINDOW']],
    [{ INVITE_WINDOW_MINUTES: 'quince' }, ['INVITE_WINDOW_MINUTES']],
    [{ INVITE_MAX_PER_WINDOW: '010' }, ['INVITE_MAX_PER_WINDOW']],
    [{ EXPORT_MAX_PER_WINDOW: '0', INVITE_WINDOW_MINUTES: '0' }, ['EXPORT_MAX_PER_WINDOW', 'INVITE_WINDOW_MINUTES']],
  ])('[INV-ARCH-006] una variable inválida se rechaza con AppConfigError que la nombra: %j', (env, variables) => {
    expect(configError(env)).toEqual(variables);
  });

  it('[INV-ARCH-006] el mensaje de AppConfigError nombra las variables y no arranca con valores silenciosos', () => {
    let message = '';
    try {
      loadAppConfig({ NODE_ENV: 'test', PORT: '99999' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('Configuración inválida: PORT. Revisa .env.example.');
  });

  // T409 (D-26, enmienda 3.3.0, REQ-CLD-003): sustituyen la aserción única «HOST=0.0.0.0 se rechaza» por la regla completa.
  const PROD_SECRET = '1f'.repeat(32);
  const PG_URL = 'postgres://argos:clave@db.example.internal:5432/argos?sslmode=require';

  it('[REQ-CLD-003][D-26] HOST=0.0.0.0 se acepta con NODE_ENV=production y host queda en 0.0.0.0', () => {
    const config = loadAppConfig({ NODE_ENV: 'production', HOST: '0.0.0.0', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET });
    expect(config.host).toBe('0.0.0.0');
  });

  it('[REQ-CLD-003][D-26] HOST=0.0.0.0 se acepta con ARGOS_DB_DRIVER=postgres aunque NODE_ENV no sea production', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', HOST: '0.0.0.0', ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL });
    expect(config.host).toBe('0.0.0.0');
  });

  it.each([
    ['production', { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET }],
    ['postgres', { ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL }],
  ])('[REQ-CLD-003][D-26] con %s se siguen rechazando "::", "localhost", 10.x y espacios en HOST', (_caso, entorno) => {
    const rechazos = ['::', 'localhost', '10.0.0.1', '10.255.255.255', ' '].map((host) => configError({ ...entorno, HOST: host }));
    expect(rechazos).toEqual([['HOST'], ['HOST'], ['HOST'], ['HOST'], ['HOST']]);
  });

  it.each(['::', 'localhost', '10.0.0.1', '10.255.255.255', '::1', '1.1.1.1'])('[REQ-CLD-003][D-26] HOST=%s se rechaza fuera de production y postgres', (host) => {
    expect(configError({ HOST: host })).toEqual(['HOST']);
  });

  it('[REQ-CLD-003][D-26] sin HOST, o con HOST vacío, el valor es 127.0.0.1 también en production y con postgres', () => {
    const production = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET };
    const postgres = { ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL };
    expect([
      loadAppConfig({ NODE_ENV: 'test' }).host,
      loadAppConfig({ NODE_ENV: 'test', HOST: '' }).host,
      loadAppConfig(production).host,
      loadAppConfig({ ...production, HOST: '' }).host,
      loadAppConfig({ NODE_ENV: 'test', ...postgres }).host,
    ]).toEqual(['127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1']);
  });

  it('[REQ-CLD-003][D-26] el rechazo de HOST no nombra el valor rechazado en el mensaje', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'test', HOST: '10.0.0.1' })).toThrow('Configuración inválida: HOST. Revisa .env.example.');
  });
});
