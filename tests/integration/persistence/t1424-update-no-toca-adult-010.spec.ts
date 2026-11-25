/**
 * T1424 (regresión, OBS-1 de /oracle, Feature 010, Bloque D): `UserRepositoryPort.update` NUNCA modifica `adult_declared_at` ni `adult_notice_version`
 * (solo `insert` las escribe), con la MISMA batería sobre memoria, SQLite y PostgreSQL 17 real (esta última se OMITE sin TEST_DATABASE_URL).
 * Es una prueba de regresión del comportamiento ya implementado: pasa en verde y falla si `update` empieza a escribir esas columnas.
 *
 * @implements REQ-MEN10-001, REQ-MEN10-002, SC-010-022, SC-010-024
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RegisterUserUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import type { UserAccount } from '../../../src/application/ports/repositories.port.ts';
import { ANDRES } from '../../fixtures/application-harness.ts';
import { ENGINE_NAMES, HAS_POSTGRES, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const PASSWORD = 'Clave2026x!';
const BODY = { username: 'solicitante.t1424', displayName: 'Solicitante', password: PASSWORD, confirmPassword: PASSWORD, adultDeclaration: true };
const FORGED_AT = '2020-01-01T00:00:00.000Z';
const FORGED_VERSION = '9.9.9';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
async function open(name: EngineName): Promise<IdentityEngine> {
  const engine = await openEngine(name, stateWith([]));
  disposers.push(engine.dispose);
  return engine;
}
const userOf = async (engine: IdentityEngine, username: string): Promise<UserAccount> => {
  const found = await engine.read((r) => r.users.findByUsername(username));
  if (found === null) throw new Error(`falta el usuario ${username}`);
  return found;
};
const update = (engine: IdentityEngine, user: UserAccount): Promise<void> => engine.uow.runInTransaction((r) => r.users.update(user));

describe.each(ENGINE_NAMES)('T1424 update no toca la declaración 18+ (%s)', (name) => {
  const skip = name === 'PostgreSQL' && !HAS_POSTGRES;
  const placeholder = name === 'PostgreSQL' ? '$1' : '?';

  it.skipIf(skip)('[REQ-MEN10-001][SC-010-022] update con otros valores de adult_declared_at/adult_notice_version cambia el perfil pero conserva la declaración original', async () => {
    const engine = await open(name);
    await new RegisterUserUseCase(engine.deps).execute(BODY);
    const before = await userOf(engine, BODY.username);
    expect(before.adultDeclaredAt).toBe(NOW);
    await update(engine, { ...before, displayName: 'Nombre Nuevo', adultDeclaredAt: FORGED_AT, adultNoticeVersion: FORGED_VERSION });
    const after = await userOf(engine, BODY.username);
    expect(after.displayName).toBe('Nombre Nuevo');
    expect(after.adultDeclaredAt).toBe(NOW);
    expect(after.adultNoticeVersion).toBe(before.adultNoticeVersion);
    expect(after.adultNoticeVersion).not.toBe(FORGED_VERSION);
    const rows = await engine.rawQuery(`SELECT adult_declared_at, adult_notice_version FROM users WHERE id = ${placeholder}`, [before.id]);
    if (rows !== null) {
      expect(rows).toHaveLength(1);
      expect(new Date(rows[0]!['adult_declared_at'] as string | Date).toISOString()).toBe(NOW);
      expect(rows[0]!['adult_notice_version']).toBe(before.adultNoticeVersion);
    }
  }, 120_000);

  it.skipIf(skip)('[REQ-MEN10-001] update con una entidad SIN los campos de declaración (omitidos) no los borra', async () => {
    const engine = await open(name);
    await new RegisterUserUseCase(engine.deps).execute(BODY);
    const before = await userOf(engine, BODY.username);
    const { adultDeclaredAt: _a, adultNoticeVersion: _v, ...withoutAdult } = before;
    await update(engine, { ...withoutAdult, displayName: 'Sin Campos' });
    const after = await userOf(engine, BODY.username);
    expect(after.displayName).toBe('Sin Campos');
    expect(after.adultDeclaredAt).toBe(NOW);
    expect(after.adultNoticeVersion).toBe(before.adultNoticeVersion);
  }, 120_000);

  it.skipIf(skip)('[REQ-MEN10-002][SC-010-024] update NO fabrica una declaración retroactiva: una cuenta anterior sigue con ambos campos nulos aunque la entidad los traiga', async () => {
    const engine = await open(name);
    const before = await userOf(engine, 'andres');
    expect(before.id).toBe(ANDRES);
    expect(before.adultDeclaredAt ?? null).toBeNull();
    await update(engine, { ...before, displayName: 'Andres Editado', adultDeclaredAt: FORGED_AT, adultNoticeVersion: FORGED_VERSION });
    const after = await userOf(engine, 'andres');
    expect(after.displayName).toBe('Andres Editado');
    expect(after.adultDeclaredAt ?? null).toBeNull();
    expect(after.adultNoticeVersion ?? null).toBeNull();
    const rows = await engine.rawQuery(`SELECT adult_declared_at, adult_notice_version FROM users WHERE id = ${placeholder}`, [ANDRES]);
    if (rows !== null) expect(rows).toEqual([{ adult_declared_at: null, adult_notice_version: null }]);
  }, 120_000);
});
