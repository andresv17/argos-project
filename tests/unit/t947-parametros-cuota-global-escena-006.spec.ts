import { describe, expect, it, vi } from 'vitest';
import type { PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';
import type { SceneGlobalQuotaPort } from '../../src/application/ports/scene-global-quota.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import {
  SCENE_ALLOWED_LOCATIONS,
  SCENE_DEFAULT_GLOBAL_QUOTA_MAX,
  SCENE_DEFAULT_LOCATION,
  SCENE_DEFAULT_MODEL,
  SCENE_GLOBAL_QUOTA_USED_PREFIX,
  SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
  SCENE_PARAM_MODEL_KEY,
  SceneParameterError,
  resolveSceneProviderParameters,
} from '../../src/domain/scene/provider-parameters.ts';
import { AppConfigError, loadAppConfig, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';
import { loadSceneProviderParameters, createSceneGlobalQuotaMaxReader } from '../../src/infrastructure/config/scene-provider-parameters.ts';
import { SqlSceneGlobalQuota } from '../../src/infrastructure/persistence/scene-global-quota.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T947 (006, Fase 14, D6-22, N2-02 = A): `ARGOS_SCENE_GLOBAL_QUOTA_MAX`, modelo y región se leen de `platform_parameters` con respaldo en `ARGOS_SCENE_GLOBAL_QUOTA_MAX`,
 * `ARGOS_SCENE_MODEL` y `ARGOS_SCENE_LOCATION`; por defecto `5`, `gemini-2.5-flash-image` y `us-central1`; fuera de lista cerrada o regex rechazan el arranque; el contador
 * global mensual se descuenta con `UPDATE ... WHERE usado < max` atómico (concurrencia y cambio de mes); agotada la cuota devuelve el error tipado vigente y no llama al
 * proveedor. REQ-ESC6-017, REQ-ESC6-031. PostgreSQL real: lo cubre `npm run test:gate` (aquí SQLite real y un doble de `query` para la forma de la sentencia).
 */
const NO_DB = { globalQuotaMax: null, model: null } as const;
const NO_ENV = { globalQuotaMax: null, model: null, location: null } as const;

describe('valores por defecto y precedencia (fila > entorno > defecto)', () => {
  it('[REQ-ESC6-017] los valores por defecto del código son 5, gemini-2.5-flash-image y us-central1', () => {
    expect([SCENE_DEFAULT_GLOBAL_QUOTA_MAX, SCENE_DEFAULT_MODEL, SCENE_DEFAULT_LOCATION]).toEqual([5, 'gemini-2.5-flash-image', 'us-central1']);
    expect(resolveSceneProviderParameters({ db: NO_DB, env: NO_ENV })).toEqual({ globalQuotaMax: 5, model: 'gemini-2.5-flash-image', location: 'us-central1' });
  });

  it('[REQ-ESC6-017] sin fila rige el respaldo de entorno', () => {
    expect(resolveSceneProviderParameters({ db: NO_DB, env: { globalQuotaMax: 7, model: 'gemini-3.1-flash-image', location: 'us-east4' } })).toEqual({ globalQuotaMax: 7, model: 'gemini-3.1-flash-image', location: 'global' }); // D9-29: la region de entorno ya no manda; se deriva del modelo
  });

  it('[REQ-ESC6-017] la fila de platform_parameters prevalece sobre el entorno', () => {
    expect(resolveSceneProviderParameters({ db: { globalQuotaMax: '9', model: 'gemini-3.1-flash-image' }, env: { globalQuotaMax: 7, model: 'gemini-2.5-flash-image', location: 'us-east4' } })).toEqual({
      globalQuotaMax: 9,
      model: 'gemini-3.1-flash-image',
      location: 'global',
    });
  });

  it.each(['0', '-1', '1001', '5.5', 'cinco', '', ' 5', '5 ', '05', '1e2'])('[REQ-ESC6-031] una cuota global %j fuera de rango o ilegible rechaza el arranque y nombra solo la clave', (raw) => {
    expect(() => resolveSceneProviderParameters({ db: { ...NO_DB, globalQuotaMax: raw }, env: NO_ENV })).toThrow(SceneParameterError);
    try {
      resolveSceneProviderParameters({ db: { ...NO_DB, globalQuotaMax: raw }, env: NO_ENV });
    } catch (error) {
      expect((error as SceneParameterError).keys).toEqual([SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]);
      expect((error as Error).message.includes(raw) && raw !== '').toBe(false);
    }
  });

  it.each(['gemini-2.5-flash-image-x', 'gemini-3-pro-image', 'gemini-3.1-flash-image-preview'])('[REQ-ESC6-031][D9-29] el modelo %j sin par con coste (la region se deriva del modelo) rechaza el arranque y nombra solo la clave del modelo', (raw) => {
    expect(() => resolveSceneProviderParameters({ db: { ...NO_DB, model: raw }, env: NO_ENV })).toThrow(new SceneParameterError([SCENE_PARAM_MODEL_KEY]));
  });

  it.each(['../x', 'gpt-4', 'gemini/x', 'gemini-a?b', ''])('[REQ-ESC6-031] el modelo %j de la fila fuera de la regex rechaza el arranque', (raw) => {
    expect(() => resolveSceneProviderParameters({ db: { ...NO_DB, model: raw }, env: NO_ENV })).toThrow(new SceneParameterError([SCENE_PARAM_MODEL_KEY]));
  });

  it('[REQ-ESC6-031] varias filas inválidas se listan todas, sin valores', () => {
    try {
      resolveSceneProviderParameters({ db: { globalQuotaMax: 'x', model: '../y' }, env: NO_ENV });
      throw new Error('debía lanzar');
    } catch (error) {
      expect((error as SceneParameterError).keys).toEqual([SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY, SCENE_PARAM_MODEL_KEY]);
    }
  });

  it('[REQ-ESC6-031] la lista cerrada contiene us-central1 y ninguna entrada con barra, punto ni mayúscula', () => {
    expect(SCENE_ALLOWED_LOCATIONS.includes('us-central1')).toBe(true);
    expect(SCENE_ALLOWED_LOCATIONS.every((l) => /^[a-z]+-[a-z]+[0-9]+$/.test(l))).toBe(true);
  });
});

describe('lectura desde el repositorio de platform_parameters', () => {
  const repo = (rows: Record<string, string>): PlatformParameterRepositoryPort & { reads: string[] } => {
    const reads: string[] = [];
    return {
      reads,
      async findValue(key) {
        reads.push(key);
        return rows[key] ?? null;
      },
    };
  };
  const scene = { globalQuotaMax: 5, model: null, location: null } as const;

  it('[REQ-ESC6-017] lee solo las dos claves cerradas (D9-29: sin region) y combina con el entorno', async () => {
    const r = repo({ [SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]: '3', 'scene.provider_location': 'us-east4' }); // la fila heredada de region NO se lee
    expect(await loadSceneProviderParameters(r, { globalQuotaMax: 5, model: 'gemini-2.5-flash-image', location: null })).toEqual({ globalQuotaMax: 3, model: 'gemini-2.5-flash-image', location: 'us-central1' });
    expect(r.reads.sort()).toEqual([SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY, SCENE_PARAM_MODEL_KEY].sort());
  });

  it('[REQ-ESC6-017] sin filas y sin entorno rigen los valores por defecto', async () => {
    expect(await loadSceneProviderParameters(repo({}), scene)).toEqual({ globalQuotaMax: 5, model: 'gemini-2.5-flash-image', location: 'us-central1' });
  });

  it('[REQ-ESC6-031] una fila inválida hace fallar el arranque (rechaza) con la clave y sin el valor', async () => {
    await expect(loadSceneProviderParameters(repo({ [SCENE_PARAM_MODEL_KEY]: 'gemini-evil-example' }), scene)).rejects.toThrow(new SceneParameterError([SCENE_PARAM_MODEL_KEY]));
  });

  it('[REQ-ESC6-017] el lector del tope vuelve a leer la fila en cada llamada (editable desde el portal admin) y una fila inválida lanza', async () => {
    const rows: Record<string, string> = { [SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]: '2' };
    const read = createSceneGlobalQuotaMaxReader(repo(rows), 5);
    expect(await read()).toBe(2);
    rows[SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY] = '4';
    expect(await read()).toBe(4);
    rows[SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY] = 'x';
    await expect(read()).rejects.toThrow(SceneParameterError);
    delete rows[SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY];
    expect(await read()).toBe(5);
  });
});

describe('respaldo en variables de entorno (app-config.ts, único lector)', () => {
  const REAL = {
    NODE_ENV: 'test',
    ARGOS_SCENE_DRIVER: 'real',
    ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image',
    ARGOS_SCENE_LOCATION: 'us-central1',
    ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
  } as const;
  const load = (env: EnvironmentSource): ReturnType<typeof loadAppConfig> => loadAppConfig(env, { sceneRealDriverActivated: true });
  const failing = (env: EnvironmentSource): readonly string[] => {
    try {
      load(env);
    } catch (error) {
      if (error instanceof AppConfigError) return error.variables;
      throw error;
    }
    return ['sin error'];
  };

  it('[REQ-ESC6-017] sin ARGOS_SCENE_GLOBAL_QUOTA_MAX la cuota global es 5 y sin región o modelo el valor es null (los defaults los aplica el resolvedor)', () => {
    const scene = loadAppConfig({ NODE_ENV: 'test' }).scene;
    expect([scene.globalQuotaMax, scene.location, scene.model]).toEqual([5, null, null]);
  });

  it('[REQ-ESC6-017] ARGOS_SCENE_GLOBAL_QUOTA_MAX, ARGOS_SCENE_MODEL y ARGOS_SCENE_LOCATION se exponen en la configuración con real', () => {
    const scene = load({ ...REAL, ARGOS_SCENE_GLOBAL_QUOTA_MAX: '8', ARGOS_SCENE_LOCATION: 'us-east4' }).scene;
    expect([scene.globalQuotaMax, scene.location, scene.model]).toEqual([8, 'us-east4', 'gemini-2.5-flash-image']);
  });

  it.each(['0', '1001', 'x', '5.0', '-3', '05'])('[REQ-ESC6-031] ARGOS_SCENE_GLOBAL_QUOTA_MAX=%j rechaza el arranque y nombra solo esa variable', (value) => {
    expect(failing({ ...REAL, ARGOS_SCENE_GLOBAL_QUOTA_MAX: value })).toEqual(['ARGOS_SCENE_GLOBAL_QUOTA_MAX']);
  });

  it.each(['evil.com', 'US-CENTRAL1', 'mars-1', 'us-central1/x'])('[REQ-ESC6-031] ARGOS_SCENE_LOCATION=%j fuera de la lista cerrada rechaza el arranque', (value) => {
    expect(failing({ ...REAL, ARGOS_SCENE_LOCATION: value })).toEqual(['ARGOS_SCENE_LOCATION']);
  });

  it('[REQ-ESC6-031] el error de arranque no incluye el valor inválido', () => {
    try {
      load({ ...REAL, ARGOS_SCENE_LOCATION: 'evil.example' });
    } catch (error) {
      expect(String((error as Error).message).includes('evil.example')).toBe(false);
      return;
    }
    throw new Error('debía lanzar');
  });
});

describe('contador global mensual atómico (N2-02 = A) sobre SQLite real', () => {
  const NOW = '2026-11-05T12:00:00.000Z';
  const make = (max: number | (() => Promise<number>) = 5) => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const readMax = typeof max === 'function' ? max : async (): Promise<number> => max;
    return { db, quota: SqlSceneGlobalQuota.forSqlite(db, { readMax, now: () => NOW }) };
  };
  const used = (db: ReturnType<typeof make>['db'], window: string): string | undefined =>
    (db.prepare('SELECT value FROM platform_parameters WHERE key = ?').get(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}${window}`) as { value: string } | undefined)?.value;

  it('[REQ-ESC6-017] concede exactamente 5 de 8 intentos secuenciales y el resto devuelve false', async () => {
    const { db, quota } = make(5);
    const results = [];
    for (let i = 0; i < 8; i += 1) results.push(await quota.tryConsume('2026-11'));
    expect(results).toEqual([true, true, true, true, true, false, false, false]);
    expect(used(db, '2026-11')).toBe('5');
  });

  it('[REQ-ESC6-017] con 50 llamadas concurrentes se conceden exactamente `max` y el contador nunca lo supera', async () => {
    const { db, quota } = make(5);
    const results = await Promise.all(Array.from({ length: 50 }, () => quota.tryConsume('2026-11')));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(used(db, '2026-11')).toBe('5');
  });

  it('[REQ-ESC6-017] el cambio de mes abre una ventana nueva sin tocar la anterior', async () => {
    const { db, quota } = make(2);
    expect([await quota.tryConsume('2026-11'), await quota.tryConsume('2026-11'), await quota.tryConsume('2026-11')]).toEqual([true, true, false]);
    expect([await quota.tryConsume('2026-12'), await quota.tryConsume('2026-12')]).toEqual([true, true]);
    expect(await quota.tryConsume('2026-12')).toBe(false);
    expect([used(db, '2026-11'), used(db, '2026-12')]).toEqual(['2', '2']);
  });

  it('[REQ-ESC6-017] el tope se lee en cada llamada: bajarlo en la fila corta de inmediato y subirlo concede de nuevo', async () => {
    let max = 3;
    const { quota } = make(async () => max);
    expect([await quota.tryConsume('2026-11'), await quota.tryConsume('2026-11')]).toEqual([true, true]);
    max = 2;
    expect(await quota.tryConsume('2026-11')).toBe(false);
    max = 4;
    expect(await quota.tryConsume('2026-11')).toBe(true);
  });

  it('[REQ-ESC6-031] si el tope no se puede leer (fila inválida) falla cerrado: false y sin tocar el contador', async () => {
    const { db, quota } = make(async () => {
      throw new SceneParameterError([SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]);
    });
    expect(await quota.tryConsume('2026-11')).toBe(false);
    expect(used(db, '2026-11')).toBeUndefined();
  });

  it.each(['2026-13', '2026-1', '26-11', '2026-11-01', '', 'x'])('[REQ-ESC6-031] la ventana %j inválida devuelve false sin escribir ninguna fila', async (window) => {
    const { db, quota } = make(5);
    expect(await quota.tryConsume(window)).toBe(false);
    expect((db.prepare("SELECT COUNT(*) AS n FROM platform_parameters WHERE key LIKE 'scene.global_quota_used.%'").get() as { n: number }).n).toBe(0);
  });

  it('[REQ-ESC6-017] la fila se crea con descripción y fecha y no altera la fila album.max_photos_per_pet', async () => {
    const { db, quota } = make(5);
    await quota.tryConsume('2026-11');
    const row = db.prepare('SELECT value, description, updated_at FROM platform_parameters WHERE key = ?').get(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}2026-11`) as { value: string; description: string; updated_at: string };
    expect(row).toMatchObject({ value: '1', updated_at: NOW });
    expect(row.description.length).toBeGreaterThan(5);
    expect((db.prepare("SELECT value FROM platform_parameters WHERE key = 'album.max_photos_per_pet'").get() as { value: string }).value).toBe('10');
  });
});

describe('contador global en PostgreSQL: forma de la sentencia (doble de query)', () => {
  it('[REQ-ESC6-017] ejecuta INSERT ... ON CONFLICT DO NOTHING y luego UPDATE ... WHERE usado < max en una sola sentencia atómica, con parámetros (sin interpolar)', async () => {
    const statements: Array<{ text: string; values: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values: unknown[] = []) => {
        statements.push({ text, values });
        return { rows: [], rowCount: text.startsWith('UPDATE') ? 1 : 0 };
      }),
    };
    const quota = SqlSceneGlobalQuota.forPostgres(client, { readMax: async () => 5, now: () => '2026-11-05T12:00:00.000Z' });
    expect(await quota.tryConsume('2026-11')).toBe(true);
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(/^INSERT INTO platform_parameters .* ON CONFLICT \(key\) DO NOTHING$/s);
    expect(statements[1]?.text).toMatch(/^UPDATE platform_parameters SET value = .* WHERE key = \$\d AND CAST\(value AS INTEGER\) < \$\d$/s);
    expect(statements[1]?.values).toContain(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}2026-11`);
    expect(statements[1]?.values).toContain(5);
    for (const s of statements) expect(s.text.includes('2026-11')).toBe(false);
  });

  it('[REQ-ESC6-017] rowCount 0 del UPDATE (cuota agotada) devuelve false', async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    const quota = SqlSceneGlobalQuota.forPostgres(client, { readMax: async () => 5, now: () => '2026-11-05T12:00:00.000Z' });
    expect(await quota.tryConsume('2026-11')).toBe(false);
  });

  it('[REQ-ESC6-031] un error de la base se propaga como false (falla cerrado) sin eco del mensaje', async () => {
    const client = {
      query: vi.fn(async () => {
        throw new Error('connection SECRETO');
      }),
    };
    const quota = SqlSceneGlobalQuota.forPostgres(client, { readMax: async () => 5, now: () => '2026-11-05T12:00:00.000Z' });
    expect(await quota.tryConsume('2026-11')).toBe(false);
  });
});

describe('worker: cuota global agotada no llama al proveedor', () => {
  const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
  const NOW = '2026-11-05T12:00:00.000Z';
  const key = 'b0000000-0000-4000-8000-000000000001';

  function setup(globalQuota: SceneGlobalQuotaPort | undefined) {
    const h = createHarness(canonicalState());
    const fixture = sceneFixture();
    const base = withScene(h.deps, fixture);
    const deps: ApplicationDeps = {
      ...base,
      scene: { ...base.scene!, ...(globalQuota === undefined ? {} : { globalQuota }) },
      media: { storage: new ControlledStorage(() => new Date(NOW)), limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
    };
    return { h, fixture, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps) };
  }
  const jobOf = (t: ReturnType<typeof setup>) => ({ sceneId: t.h.uow.snapshot().sceneAttempts?.[0]?.sceneId ?? '', attemptId: t.h.uow.snapshot().sceneAttempts?.[0]?.id ?? '' });

  it('[REQ-ESC6-017][REQ-ESC6-031] con tryConsume=false el intento falla con ERR-SCENE-GENERATION-FAILED, el generador recibe 0 llamadas y no se descuenta la cuota por usuario', async () => {
    const tryConsume = vi.fn(async () => false);
    const t = setup({ tryConsume, refund: async () => undefined, isExhausted: async () => false });
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key);
    const outcome = await t.run.execute(jobOf(t), new AbortController().signal);
    expect(outcome).toBe('FAILED');
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(tryConsume).toHaveBeenCalledTimes(1);
    expect(tryConsume).toHaveBeenCalledWith('2026-11');
    const snapshot = t.h.uow.snapshot();
    expect(snapshot.sceneAttempts?.[0]).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED' });
    expect(snapshot.scenes?.[0]).toMatchObject({ consumedGenerations: 0, image: null });
  });

  it('[REQ-ESC6-017] con tryConsume=true se genera y se publica, y el contador global se consulta una sola vez por intento', async () => {
    const tryConsume = vi.fn(async () => true);
    const t = setup({ tryConsume, refund: async () => undefined, isExhausted: async () => false });
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key);
    expect(await t.run.execute(jobOf(t), new AbortController().signal)).toBe('PUBLISHED');
    expect(t.fixture.generator.calls).toHaveLength(1);
    expect(tryConsume).toHaveBeenCalledTimes(1);
  });

  it('[REQ-ESC6-017] un tryConsume que lanza se trata como cuota agotada (falla cerrado) y no llama al proveedor', async () => {
    const t = setup({
      refund: async () => undefined,
      isExhausted: async () => false,
      tryConsume: async () => {
        throw new Error('db caída');
      },
    });
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key);
    expect(await t.run.execute(jobOf(t), new AbortController().signal)).toBe('FAILED');
    expect(t.fixture.generator.calls).toHaveLength(0);
  });

  it('[REQ-ESC6-017] sin puerto de cuota global (driver simulado) el worker no lo exige y publica', async () => {
    const t = setup(undefined);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key);
    expect(await t.run.execute(jobOf(t), new AbortController().signal)).toBe('PUBLISHED');
  });
});
