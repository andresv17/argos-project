import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG_DEFAULTS, AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

function configError(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadAppConfig(env);
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
    expect([loadAppConfig({}), example]).toEqual([
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
        auditHmacSecret: null,
      },
      APP_CONFIG_DEFAULTS,
    ]);
  });

  it('[INV-ARCH-006] las variables válidas se convierten a sus tipos; las vacías toman el valor por defecto', () => {
    const config = loadAppConfig({ PORT: '65535', HOST: '127.0.0.1', DATABASE_PATH: '/tmp/argos/test.sqlite', APP_TIMEZONE: 'Europe/Madrid', COOKIE_SECURE: 'true', OTRA: 'x' });
    expect([config, loadAppConfig({ PORT: '', APP_TIMEZONE: '' })]).toEqual([
      { ...loadAppConfig({}), port: 65535, databasePath: '/tmp/argos/test.sqlite', appTimezone: 'Europe/Madrid', cookieSecure: true },
      loadAppConfig({}),
    ]);
  });

  it('[INV-ARCH-006][ERR-RATE-LIMITED] los límites de frecuencia salen de EXPORT_MAX_PER_WINDOW, EXPORT_WINDOW_MINUTES, INVITE_MAX_PER_WINDOW e INVITE_WINDOW_MINUTES y se convierten a enteros', () => {
    const config = loadAppConfig({ EXPORT_MAX_PER_WINDOW: '2', EXPORT_WINDOW_MINUTES: '60', INVITE_MAX_PER_WINDOW: '100', INVITE_WINDOW_MINUTES: '5' });
    expect([config.exportMaxPerWindow, config.exportWindowMinutes, config.inviteMaxPerWindow, config.inviteWindowMinutes]).toEqual([2, 60, 100, 5]);
  });

  it.each([
    [{ PORT: '0' }, ['PORT']],
    [{ PORT: '65536' }, ['PORT']],
    [{ PORT: '3000.5' }, ['PORT']],
    [{ PORT: '03000' }, ['PORT']],
    [{ HOST: '0.0.0.0' }, ['HOST']],
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
      loadAppConfig({ PORT: '99999' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('Configuración inválida: PORT. Revisa .env.example.');
  });
});
