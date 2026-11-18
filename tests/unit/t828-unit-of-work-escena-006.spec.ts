import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENE_LOCK_ORDER } from '../../src/application/ports/scene-repositories.port.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { createPostgresRepositories } from '../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { fakeClient } from '../fixtures/pg-fake-client.ts';

/**
 * T828 (006, Fase 3): `SceneRepository` y `SceneConsentRepository` forman parte del `UnitOfWork` existente (ADR-006-07, H-MERO-006-16) con implementación nula:
 * memoria, SQLite y PostgreSQL los entregan en cada transacción, sin escribir filas ni cambiar nada de 001..005, y el orden de candados de la 006 es
 * propietario -> mascota -> hogar -> escena (INV-ESC6-003, INV-ESC6-012; REQ-ESC6-012; EDGE-ESC6-024; SC-ESC6-053).
 */
describe('orden de candados de la 006 (T828, ADR-006-07, INV-ESC6-003)', () => {
  it('[INV-ESC6-003] SCENE_LOCK_ORDER es propietario -> mascota -> hogar -> escena, con la escena al final', () => {
    expect([...SCENE_LOCK_ORDER]).toEqual(['OWNER', 'PET', 'HOUSEHOLD', 'SCENE']);
    expect(SCENE_LOCK_ORDER.at(-1)).toBe('SCENE');
  });

  it('[INV-ESC6-003] el orden declarado en el código es el mismo que ratifica plan.md (ADR-006-07)', () => {
    const plan = readFileSync('specs/006-escena-hogar-pixel-art/plan.md', 'utf8');
    expect(plan).toMatch(/propietario → mascota → hogar → escena/);
  });
});

describe('UnitOfWork con repositorios de escena nulos (T828, INV-ESC6-012, SC-ESC6-053)', () => {
  it('[INV-ESC6-012] memoria: runInTransaction entrega scenes y sceneConsents nulos y no cambia el estado', async () => {
    const { uow } = createHarness();
    const before = JSON.stringify(uow.snapshot());
    const found = await uow.runInTransaction(async (r) => [await r.scenes.findById('s1'), await r.sceneConsents.findByUserId('u1')]);
    expect(found).toEqual([null, null]);
    expect(JSON.stringify(uow.snapshot())).toBe(before);
  });

  it('[INV-ESC6-012] memoria: runReadOnly también entrega los repositorios de escena', async () => {
    const uow = new InMemoryUnitOfWork(canonicalState());
    const keys = await uow.runReadOnly((r) => Promise.resolve(Object.keys(r).filter((k) => k.startsWith('scene')).sort()));
    expect(keys).toEqual(['sceneConsents', 'scenes']);
  });

  it('[INV-ESC6-012] SQLite: runInTransaction entrega scenes y sceneConsents nulos', async () => {
    const uow = new SqliteUnitOfWork(openSqliteDatabase(IN_MEMORY_DATABASE));
    const found = await uow.runInTransaction(async (r) => [await r.scenes.findById('s1'), await r.sceneConsents.findByUserId('u1')]);
    expect(found).toEqual([null, null]);
  });

  it('[INV-ESC6-012] PostgreSQL: la fábrica entrega scenes y sceneConsents nulos sin emitir una sola sentencia', async () => {
    const client = fakeClient();
    const set = createPostgresRepositories(client);
    expect([await set.scenes.findById('s1'), await set.sceneConsents.findByUserId('u1')]).toEqual([null, null]);
    expect(client.calls).toEqual([]);
  });

  it('[EDGE-ESC6-024] los repositorios de escena viajan en el mismo RepositorySet de la transacción, junto a pets y households (misma transacción)', async () => {
    const { uow } = createHarness();
    const keys = await uow.runInTransaction((r) => Promise.resolve(Object.keys(r)));
    expect(keys.indexOf('pets')).toBeLessThan(keys.indexOf('scenes'));
    expect(keys.indexOf('households')).toBeLessThan(keys.indexOf('scenes'));
    expect(keys.filter((k) => k.startsWith('scene')).sort()).toEqual(['sceneConsents', 'scenes']);
  });
});
