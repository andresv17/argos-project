import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_NAMES, HAS_POSTGRES, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

/**
 * T1264 (Feature 009, Fase 5a, #20): repositorio de edicion de parametros sobre los tres motores (memoria, SQLite y, con TEST_DATABASE_URL, PostgreSQL 17). El compare-and-set es UNA
 * sentencia (`INSERT ... ON CONFLICT DO NOTHING` con la fila ausente o `UPDATE ... WHERE key, value, updated_at`) con la fila afectada como veredicto: dos escrituras SIMULTANEAS con el mismo
 * estado esperado dan exactamente una `true`. `updated_by_user_id` queda `NULL`. Se usa `scene.provider_model`, clave del catalogo que ningun motor siembra (la fila ausente se inserta).
 * @implements REQ-CFG9-001, REQ-CFG9-007, EDGE-009-016, SC-009-019
 */
const KEY = 'scene.provider_model';
const T0 = '2026-11-23T12:00:00.000Z';
const T1 = '2026-11-23T12:01:00.000Z';
const ADMIN_A = '00000000-0000-4000-8000-0000000000a1';
const ADMIN_B = '00000000-0000-4000-8000-0000000000b2';
const ENGINES: EngineName[] = ENGINE_NAMES.filter((n) => n !== 'PostgreSQL' || HAS_POSTGRES);

describe.each(ENGINES)('T1264 [REQ-CFG9-007] compare-and-set de parametros y autor de la ultima edicion sobre %s', (name) => {
  let engine: IdentityEngine | null = null;
  afterEach(async () => {
    await engine?.dispose();
    engine = null;
  });
  const run = <T>(e: IdentityEngine, work: (r: Parameters<Parameters<IdentityEngine['uow']['runInTransaction']>[0]>[0]) => Promise<T>): Promise<T> => e.uow.runInTransaction(work);
  const open = (): Promise<IdentityEngine> => openEngine(name, stateWith([]));

  it('fila ausente: find devuelve null; el primer compareAndSet(null) inserta y un segundo, con la fila ya creada, no escribe', async () => {
    engine = await open();
    expect(await run(engine, (r) => r.adminParameters.find(KEY))).toBeNull();
    expect(await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'gemini-2.5-flash-image', updatedAt: T0 }, null))).toBe(true);
    expect(await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'otro', updatedAt: T1 }, null))).toBe(false);
    expect(await run(engine, (r) => r.adminParameters.find(KEY))).toEqual({ value: 'gemini-2.5-flash-image', updatedAt: T0 });
  });

  it('actualiza solo si valor y fecha esperados coinciden; el desfasado no escribe; updated_by_user_id queda NULL', async () => {
    engine = await open();
    await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'a', updatedAt: T0 }, null));
    expect(await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'b', updatedAt: T1 }, { value: 'a', updatedAt: T0 }))).toBe(true);
    expect(await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'c', updatedAt: T1 }, { value: 'a', updatedAt: T0 }))).toBe(false);
    expect(await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'd', updatedAt: T1 }, { value: 'b', updatedAt: T0 }))).toBe(false);
    expect(await run(engine, (r) => r.adminParameters.find(KEY))).toEqual({ value: 'b', updatedAt: T1 });
    if (name !== 'memoria') {
      const q = name === 'PostgreSQL' ? '$1' : '?';
      const row = (await engine.rawQuery(`SELECT updated_by_user_id AS by FROM platform_parameters WHERE key = ${q}`, [KEY]))![0]!;
      expect(row['by']).toBeNull();
    }
  });

  it('lastEditor devuelve el administrador de la ULTIMA entrada de la accion y la clave; sin entradas, null', async () => {
    engine = await open();
    expect(await run(engine, (r) => r.adminParameters.lastEditor('ADMIN_PARAMETER_UPDATE', KEY))).toBeNull();
    await run(engine, async (r) => {
      await r.adminAudit.insert({ id: '10000000-0000-4000-8000-000000000001', adminId: ADMIN_A, action: 'ADMIN_PARAMETER_UPDATE', objectRef: KEY, occurredAt: T0 });
      await r.adminAudit.insert({ id: '10000000-0000-4000-8000-000000000002', adminId: ADMIN_B, action: 'ADMIN_PARAMETER_UPDATE', objectRef: KEY, occurredAt: T1 });
      await r.adminAudit.insert({ id: '10000000-0000-4000-8000-000000000003', adminId: ADMIN_A, action: 'ADMIN_PARAMETER_UPDATE', objectRef: 'scene.enabled', occurredAt: '2026-11-23T13:00:00.000Z' });
    });
    expect(await run(engine, (r) => r.adminParameters.lastEditor('ADMIN_PARAMETER_UPDATE', KEY))).toBe(ADMIN_B);
    expect(await run(engine, (r) => r.adminParameters.lastEditor('ADMIN_REGISTRATION_APPROVE', KEY))).toBeNull();
  });

  it('[EDGE-009-016] dos escrituras simultaneas con el mismo estado esperado: exactamente una gana', async () => {
    engine = await open();
    await run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'a', updatedAt: T0 }, null));
    const results = await Promise.all([
      run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'x', updatedAt: T1 }, { value: 'a', updatedAt: T0 })),
      run(engine, (r) => r.adminParameters.compareAndSet(KEY, 'Modelo', { value: 'y', updatedAt: T1 }, { value: 'a', updatedAt: T0 })),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = (await run(engine, (r) => r.adminParameters.find(KEY)))!.value;
    expect(['x', 'y']).toContain(winner);
  });
});
