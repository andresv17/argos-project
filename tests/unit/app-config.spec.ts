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

  it('[REQ-CLD-003][D-26] sin HOST el valor es 127.0.0.1 también en production y con postgres', () => {
    const production = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET };
    const postgres = { ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL };
    expect([loadAppConfig({ NODE_ENV: 'test' }).host, loadAppConfig(production).host, loadAppConfig({ NODE_ENV: 'test', ...postgres }).host]).toEqual(['127.0.0.1', '127.0.0.1', '127.0.0.1']);
  });

  it('[REQ-CLD-003][D-26] HOST="" explícito se rechaza (orden de Neo) en test, production y postgres; solo la variable ausente toma 127.0.0.1', () => {
    const production = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET };
    const postgres = { ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL };
    expect([configError({ HOST: '' }), configError({ ...production, HOST: '' }), configError({ ...postgres, HOST: '' }), configError({ HOST: ' ' })]).toEqual([['HOST'], ['HOST'], ['HOST'], ['HOST']]);
  });

  it('[REQ-CLD-003][D-26] el rechazo de HOST no nombra el valor rechazado en el mensaje', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'test', HOST: '10.0.0.1' })).toThrow('Configuración inválida: HOST. Revisa .env.example.');
  });

  // T409 (REQ-CLD-003, REQ-CLD-005, REQ-PG-010, REQ-SEC-003): ARGOS_DB_DRIVER, DATABASE_URL y ARGOS_PG_POOL_MAX.
  // Supuesto de nombres para T410: las propiedades de AppConfig serán `dbDriver` y `pgPoolMax`.
  const field = (config: unknown, name: string): unknown => (config as Record<string, unknown>)[name];
  const SECRET_PASSWORD = 'S3cr3t-P4ss-no-filtrar';
  const LEAKY_URL = `postgres://argos:${SECRET_PASSWORD}@db.example.internal:5432/argos`;

  it('[REQ-PG-010] ARGOS_DB_DRIVER por defecto es sqlite y queda en la configuración', () => {
    expect([field(loadAppConfig({ NODE_ENV: 'test' }), 'dbDriver'), field(loadAppConfig({ NODE_ENV: 'test', ARGOS_DB_DRIVER: 'sqlite' }), 'dbDriver')]).toEqual(['sqlite', 'sqlite']);
  });

  it('[REQ-PG-010] ARGOS_DB_DRIVER=postgres se acepta con DATABASE_URL válida y queda en la configuración', () => {
    expect(field(loadAppConfig({ NODE_ENV: 'test', ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL }), 'dbDriver')).toBe('postgres');
  });

  it.each([
    ['mysql', { ARGOS_DB_DRIVER: 'mysql' }],
    ['cadena vacía', { ARGOS_DB_DRIVER: '' }],
    ['mayúsculas', { ARGOS_DB_DRIVER: 'POSTGRES', DATABASE_URL: PG_URL }],
    ['memory en development', { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'memory', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET }],
    ['memory en production', { NODE_ENV: 'production', ARGOS_DB_DRIVER: 'memory', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET }],
  ])('[REQ-PG-010] ARGOS_DB_DRIVER inválido se rechaza nombrando solo la variable: %s', (_caso, env) => {
    expect(configError(env)).toEqual(['ARGOS_DB_DRIVER']);
  });

  it('[REQ-PG-010] memory se admite en test y staging', () => {
    expect([
      field(loadAppConfig({ NODE_ENV: 'test', ARGOS_DB_DRIVER: 'memory' }), 'dbDriver'),
      field(loadAppConfig({ NODE_ENV: 'staging', ARGOS_DB_DRIVER: 'memory', ARGOS_AUDIT_HMAC_SECRET: PROD_SECRET }), 'dbDriver'),
    ]).toEqual(['memory', 'memory']);
  });

  it('[REQ-CLD-005] DATABASE_URL es obligatoria con ARGOS_DB_DRIVER=postgres y no con sqlite', () => {
    expect([configError({ ARGOS_DB_DRIVER: 'postgres' }), configError({ ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: '' }), configError({ ARGOS_DB_DRIVER: 'sqlite' })]).toEqual([['DATABASE_URL'], ['DATABASE_URL'], ['sin error']]);
  });

  it.each([
    ['sin sslmode', LEAKY_URL],
    ['sslmode=disable', `${LEAKY_URL}?sslmode=disable`],
    ['sslmode=prefer', `${LEAKY_URL}?sslmode=prefer`],
  ])('[REQ-CLD-005] con postgres la DATABASE_URL debe contener sslmode=require: se rechaza %s', (_caso, url) => {
    expect(configError({ ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: url })).toEqual(['DATABASE_URL']);
  });

  it('[REQ-SEC-003] ante fallo de DATABASE_URL el mensaje, las propiedades y el error serializado no incluyen la URL ni la contraseña', () => {
    let caught: unknown;
    try {
      loadAppConfig({ NODE_ENV: 'test', ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: `${LEAKY_URL}?sslmode=disable` });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppConfigError);
    const error = caught as AppConfigError;
    const volcado = [error.message, error.stack ?? '', JSON.stringify(error), JSON.stringify(Object.getOwnPropertyNames(error).map((n) => (error as unknown as Record<string, unknown>)[n])), String(error)].join('\n');
    expect(error.message).toBe('Configuración inválida: DATABASE_URL. Revisa .env.example.');
    expect(volcado).not.toContain(SECRET_PASSWORD);
    expect(volcado).not.toContain('db.example.internal');
    expect(volcado).not.toContain('postgres://');
  });

  it('[REQ-PG-010] ARGOS_PG_POOL_MAX por defecto es 5 y acepta los extremos 1 y 10', () => {
    const postgres = { ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: PG_URL };
    expect([
      field(loadAppConfig({ NODE_ENV: 'test' }), 'pgPoolMax'),
      field(loadAppConfig({ NODE_ENV: 'test', ...postgres, ARGOS_PG_POOL_MAX: '1' }), 'pgPoolMax'),
      field(loadAppConfig({ NODE_ENV: 'test', ...postgres, ARGOS_PG_POOL_MAX: '10' }), 'pgPoolMax'),
    ]).toEqual([5, 1, 10]);
  });

  it.each([['0'], ['-1'], ['11'], ['100'], ['2.5'], ['abc'], ['05'], [' 3'], ['1e1']])('[REQ-PG-010] ARGOS_PG_POOL_MAX=%j se rechaza', (valor) => {
    expect(configError({ ARGOS_PG_POOL_MAX: valor })).toEqual(['ARGOS_PG_POOL_MAX']);
  });
});
