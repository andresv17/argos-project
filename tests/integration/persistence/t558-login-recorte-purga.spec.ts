/**
 * T558 [P] [US3] inicio de sesión: recorte del identificador, contador por cuenta resuelta y purga TTL de `login_attempts`
 * (SC-CAT-018, SC-CAT-030; REQ-LOG-001, INV-LOG-002), en memoria, SQLite y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL):
 *  - el identificador se recorta antes de resolverlo y de contar: «  ANA.PEREZ  » y «  Ana@Ejemplo.com  » entran a la misma cuenta;
 *  - los fallos escritos con el correo se acumulan bajo el username de la cuenta resuelta (nunca bajo el correo) y un éxito por cualquiera de
 *    los dos caminos los borra;
 *  - `purgeExpired` (SQLite y PostgreSQL; la memoria no purga) elimina las filas de `login_attempts` sin ningún fallo dentro de la ventana de
 *    bloqueo (INV-AUTH-005, 15 min: el TTL), conserva las que tienen alguno (frontera inclusiva) y no altera los cinco conteos de retención.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LoginUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { maintenanceCutoffs } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { ENGINE_NAMES, HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const ANA = idOf(1);
const at = (minutesAgo: number, extraMs = 0): string => new Date(Date.parse(NOW) - minutesAgo * 60_000 - extraMs).toISOString();

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
async function open(name: EngineName): Promise<IdentityEngine> {
  const engine = await openEngine(name, stateWith([account(ANA, 'Ana.Perez', 'Ana2026a', 'Ana@Ejemplo.com')]));
  disposers.push(engine.dispose);
  return engine;
}
async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe.each(ENGINE_NAMES)('T558 login: recorte, cuenta resuelta y purga (%s)', (name) => {
  const run = (title: string, work: () => Promise<void>) => it.skipIf(name === 'PostgreSQL' && !HAS_POSTGRES)(title, { timeout: 120_000 }, work);

  run('[SC-CAT-018][REQ-LOG-001] el identificador se recorta: «  ANA.PEREZ  » y «  Ana@Ejemplo.com  » entran a la misma cuenta y un fallo con espacios se cuenta bajo el identificador recortado en minúsculas', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    expect(await code(login.execute({ username: '  ANA.PEREZ  ', password: 'mala2026Clave!' }))).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([NOW]);
    expect(await engine.read((r) => r.loginAttempts.listFailures('  ana.perez  '))).toEqual([]);
    const byUser = await login.execute({ username: '  ANA.PEREZ  ', password: 'Ana2026a' });
    const byMail = await login.execute({ username: '  Ana@Ejemplo.com  ', password: 'Ana2026a' });
    expect([byUser.session.user.id, byMail.session.user.id]).toEqual([ANA, ANA]);
  });

  run('[SC-CAT-030][REQ-LOG-001] los fallos con el correo se guardan bajo el username de la cuenta resuelta (no bajo el correo) y un éxito por usuario o por correo los borra', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    await code(login.execute({ username: 'ANA@ejemplo.com', password: 'mala2026Clave!' }));
    await code(login.execute({ username: 'ana.perez', password: 'mala2026Clave!' }));
    await code(login.execute({ username: ' Ana@Ejemplo.com ', password: 'mala2026Clave!' }));
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([NOW, NOW, NOW]);
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana@ejemplo.com'))).toEqual([]);
    await login.execute({ username: 'ana@ejemplo.com', password: 'Ana2026a' });
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([]);
    await code(login.execute({ username: 'ana@ejemplo.com', password: 'mala2026Clave!' }));
    await login.execute({ username: 'ANA.PEREZ', password: 'Ana2026a' });
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([]);
  });

  it.skipIf(name === 'memoria' || (name === 'PostgreSQL' && !HAS_POSTGRES))('[SC-CAT-030][REQ-LOG-001] purgeExpired elimina de login_attempts las filas sin fallos dentro de la ventana de 15 min (frontera inclusiva), conserva las demás y no cambia los cinco conteos', { timeout: 120_000 }, async () => {
    const engine = await open(name);
    const seed: Array<[string, string[]]> = [
      ['vieja', [at(20), at(3 * 24 * 60)]],
      ['vacia', []],
      ['en-el-limite', [at(15), at(60)]],
      ['un-ms-fuera', [at(15, 1)]],
      ['reciente', [at(5)]],
      ['mixta', [at(90), at(1)]],
    ];
    for (const [username, failures] of seed) await engine.read((r) => r.loginAttempts.replaceFailures(username, failures));
    const counts = await engine.uow.purgeExpired!(maintenanceCutoffs(NOW));
    const left = ((await engine.rawQuery('SELECT username FROM login_attempts ORDER BY username')) ?? []).map((row) => String(row['username']));
    expect(left).toEqual(['en-el-limite', 'mixta', 'reciente']);
    expect(await engine.read((r) => r.loginAttempts.listFailures('mixta'))).toEqual([at(90), at(1)]);
    expect(Object.keys(counts).sort()).toEqual(['auditRowsPurged', 'confirmationTokensPurged', 'invitationsPurged', 'membershipsPurged', 'sessionsPurged']);
    // Una segunda pasada es idempotente.
    await engine.uow.purgeExpired!(maintenanceCutoffs(NOW));
    expect(((await engine.rawQuery('SELECT count(*) AS n FROM login_attempts')) ?? []).map((row) => Number(row['n']))).toEqual([3]);
  });
});
