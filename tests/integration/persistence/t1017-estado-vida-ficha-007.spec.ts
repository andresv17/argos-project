/**
 * T1017/T1019 (007): `life_status`, `deceased_at` y `version` de `pets` en memoria y SQLite (REQ-FAL7-001, REQ-FAL7-002, REQ-FAL7-011, EDGE-007-009).
 * `data` repite estado y fecha (cruzados con las columnas); `version` solo vive en la columna; una fila anterior a 007 se lee ALIVE, sin fecha y en versión 1.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetProfile } from '../../../src/generated/index.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ARGOS as ARGOS_001, canonicalState } from '../../fixtures/application-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';

const ARGOS = upgradePet(ARGOS_001);
const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
});

interface Engine {
  readonly uow: UnitOfWorkPort;
  readonly db: SqliteDatabase | null;
}
const memory = async (): Promise<Engine> => ({ uow: new InMemoryUnitOfWork(canonicalState()), db: null });
const sqlite = async (): Promise<Engine> => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow);
  return { uow, db };
};

function define(make: () => Promise<Engine>): void {
  const read = (e: Engine) => e.uow.runInTransaction((r) => r.pets.findById(ARGOS.id));
  const save = (e: Engine, pet: PetProfile) => e.uow.runInTransaction((r) => r.pets.save(pet));

  it('[REQ-FAL7-001] la mascota sembrada sin los campos nuevos se lee ALIVE, sin fecha y en versión 1', async () => {
    const e = await make();
    expect(await read(e)).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: null, version: 1 });
  });

  it('[REQ-FAL7-011] guardar sin version explícita sobre una fila existente la incrementa en 1; con version explícita guarda exactamente esa', async () => {
    const e = await make();
    await save(e, { ...ARGOS, name: 'Argos II' });
    expect((await read(e))!.version).toBe(2);
    await save(e, { ...ARGOS, name: 'Argos III' });
    expect((await read(e))!.version).toBe(3);
    await save(e, { ...ARGOS, version: 10 });
    expect((await read(e))!.version).toBe(10);
  });

  it('[REQ-FAL7-001][REQ-FAL7-002] una fallecida con fecha se guarda y se lee igual; volver a ALIVE con fecha nula la borra', async () => {
    const e = await make();
    await save(e, { ...ARGOS, lifeStatus: 'DECEASED', deceasedAt: '2026-10-01', version: 4 });
    expect(await read(e)).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: '2026-10-01', version: 4 });
    await save(e, { ...ARGOS, lifeStatus: 'ALIVE', deceasedAt: null, version: 5 });
    expect(await read(e)).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: null, version: 5 });
  });

  it('[REQ-FAL7-002] el repositorio no guarda una ficha incoherente: Fallecido sin fecha o Vivo con fecha', async () => {
    const e = await make();
    for (const bad of [{ lifeStatus: 'DECEASED', deceasedAt: null }, { lifeStatus: 'ALIVE', deceasedAt: '2026-10-01' }]) {
      await expect(save(e, { ...ARGOS, ...bad } as PetProfile)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
    expect(await read(e)).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: null });
  });
}

describe('T1017 estado de vida y versión de la ficha (memoria)', () => define(memory));
describe('T1017 estado de vida y versión de la ficha (SQLite)', () => {
  define(sqlite);

  it('[REQ-FAL7-001] `data` repite estado y fecha, no la versión; la columna manda y una discrepancia entre columna y data es dato corrupto', async () => {
    const e = await sqlite();
    await e.uow.runInTransaction((r) => r.pets.save({ ...ARGOS, lifeStatus: 'DECEASED', deceasedAt: '2026-10-01', version: 7 } as PetProfile));
    const row = e.db!.prepare('SELECT data, life_status, deceased_at, version FROM pets WHERE id = ?').get(ARGOS.id) as { data: string; life_status: string; deceased_at: string; version: number };
    expect([row.life_status, row.deceased_at, row.version]).toEqual(['DECEASED', '2026-10-01', 7]);
    expect(JSON.parse(row.data)).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: '2026-10-01' });
    expect(Object.keys(JSON.parse(row.data) as object)).not.toContain('version');
    e.db!.prepare("UPDATE pets SET data = json_set(data, '$.deceasedAt', '2026-09-30') WHERE id = ?").run(ARGOS.id);
    await expect(e.uow.runInTransaction((r) => r.pets.findById(ARGOS.id))).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });

  it('[REQ-FAL7-001] las restricciones de la base rechazan un estado inválido o la fecha sin Fallecido aun fuera del repositorio', async () => {
    const e = await sqlite();
    expect(() => e.db!.prepare("UPDATE pets SET life_status = 'DECEASED' WHERE id = ?").run(ARGOS.id)).toThrow(/CHECK/);
    expect(() => e.db!.prepare("UPDATE pets SET deceased_at = '2026-10-01' WHERE id = ?").run(ARGOS.id)).toThrow(/CHECK/);
  });
});
