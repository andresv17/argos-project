/**
 * T1180 (008, bloque I, `[GH:#21]`): `pets.biography` en memoria y SQLite (REQ-BIO8-001, REQ-BIO8-004, EDGE-008-043). La biografía se guarda en la columna y repetida en `data`
 * (cruzadas: una discrepancia es dato corrupto); sin biografía no hay clave; una fila anterior a 008 se lee sin ella; la restricción de la base rechaza más de 280 caracteres.
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
const BIO = 'Le teme a los truenos';
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

  it('[GH:#21][REQ-BIO8-004] la mascota sembrada sin biografía se lee sin la clave (la ficha la expone como null)', async () => {
    const e = await make();
    expect('biography' in (await read(e))!).toBe(false);
  });

  it('[GH:#21][REQ-BIO8-001] guardar con biografía la devuelve igual; guardar sin ella o con null la borra', async () => {
    const e = await make();
    await save(e, { ...ARGOS, biography: BIO });
    expect((await read(e))!.biography).toBe(BIO);
    const { biography: _b, ...without } = ARGOS as PetProfile & { biography?: string | null };
    await save(e, without as PetProfile);
    expect('biography' in (await read(e))!).toBe(false);
    await save(e, { ...ARGOS, biography: BIO });
    await save(e, { ...ARGOS, biography: null });
    expect('biography' in (await read(e))!).toBe(false);
  });

  it('[GH:#21][REQ-BIO8-001] el repositorio no guarda una biografía inválida (281 caracteres o caracteres de control) y la guardada no cambia', async () => {
    const e = await make();
    await save(e, { ...ARGOS, biography: BIO });
    for (const bad of ['a'.repeat(281), 'uno\ndos', 'uno\u0000dos']) {
      await expect(save(e, { ...ARGOS, biography: bad })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
    expect((await read(e))!.biography).toBe(BIO);
  });
}

describe('T1180 biografía de la mascota (memoria)', () => define(memory));
describe('T1180 biografía de la mascota (SQLite)', () => {
  define(sqlite);

  it('[GH:#21][REQ-BIO8-004] la columna y `data` repiten la biografía; una discrepancia es dato corrupto; las filas previas tienen la columna en NULL', async () => {
    const e = await sqlite();
    expect(e.db!.prepare('SELECT biography FROM pets WHERE id = ?').get(ARGOS.id)).toEqual({ biography: null });
    await e.uow.runInTransaction((r) => r.pets.save({ ...ARGOS, biography: BIO }));
    const row = e.db!.prepare('SELECT data, biography FROM pets WHERE id = ?').get(ARGOS.id) as { data: string; biography: string };
    expect([row.biography, (JSON.parse(row.data) as { biography: string }).biography]).toEqual([BIO, BIO]);
    e.db!.prepare("UPDATE pets SET data = json_set(data, '$.biography', 'otra') WHERE id = ?").run(ARGOS.id);
    await expect(e.uow.runInTransaction((r) => r.pets.findById(ARGOS.id))).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });

  it('[GH:#21][REQ-BIO8-004] la restricción de la base rechaza más de 280 caracteres aun fuera del repositorio y admite exactamente 280', async () => {
    const e = await sqlite();
    expect(() => e.db!.prepare('UPDATE pets SET biography = ? WHERE id = ?').run('a'.repeat(281), ARGOS.id)).toThrow(/CHECK/);
    e.db!.prepare('UPDATE pets SET biography = ? WHERE id = ?').run('a'.repeat(280), ARGOS.id);
    expect(e.db!.prepare('SELECT length(biography) AS n FROM pets WHERE id = ?').get(ARGOS.id)).toEqual({ n: 280 });
  });
});
