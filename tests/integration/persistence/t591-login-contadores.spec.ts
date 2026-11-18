/**
 * H-T591-2 [US3] contadores de login independientes (REQ-LOG-001, INV-LOG-002, SC-CAT-019, SC-CAT-030) en memoria, SQLite y PostgreSQL (se OMITE sin TEST_DATABASE_URL):
 *  - 5 fallos con un correo existente, inexistente o ambiguo dan el MISMO bloqueo (429, cuerpo, campo, cero verificaciones de hash);
 *  - el usuario de una cuenta cuyo correo está bloqueado sigue entrando (401 con contraseña mala, sesión con la buena);
 *  - simetría: 5 fallos con el username no bloquean el correo y viceversa; un éxito limpia solo su propia clave.
 * El tiempo de respuesta del bloqueo no se asevera (un intento bloqueado no verifica ni escribe, INV-AUTH-005): se afirma por las llamadas al hash.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LoginUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { ENGINE_NAMES, HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const BAD = 'incorrecta1!';
const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
async function open(name: EngineName): Promise<IdentityEngine> {
  const engine = await openEngine(
    name,
    stateWith([account(idOf(1), 'Ana.Perez', 'Ana2026a', 'Ana@Ejemplo.com'), account(idOf(2), 'compartido1', 'Comp2026a', 'casa@ejemplo.com'), account(idOf(3), 'compartido2', 'Comp2026b', 'Casa@Ejemplo.com')]),
  );
  disposers.push(engine.dispose);
  return engine;
}
async function failureOf(promise: Promise<unknown>): Promise<DomainError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
}
const shape = (e: DomainError | null | undefined) => (e == null ? null : [e.code, e.status, e.message, e.field, e.detail]);

describe.each(ENGINE_NAMES)('H-T591-2 contadores de login independientes (%s)', (name) => {
  const run = (title: string, work: () => Promise<void>) => it.skipIf(name === 'PostgreSQL' && !HAS_POSTGRES)(title, { timeout: 120_000 }, work);

  run('[SC-CAT-019][INV-LOG-002][REQ-LOG-001] 5 fallos con correo existente, inexistente y ambiguo dan el mismo 429 con el mismo cuerpo y sin verificar el hash', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    const identifiers = ['ana@ejemplo.com', 'nadie@ejemplo.com', 'casa@ejemplo.com'];
    for (const identifier of identifiers) {
      for (let i = 0; i < 5; i += 1) expect((await failureOf(login.execute({ username: identifier, password: BAD })))?.code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    }
    const blocked: Array<DomainError | null> = [];
    for (const identifier of identifiers) {
      engine.hasher.reset();
      blocked.push(await failureOf(login.execute({ username: identifier, password: 'Ana2026a' })));
      expect(engine.hasher.calls).toEqual([]);
    }
    expect(blocked[0]!.code).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    expect(blocked[0]!.status).toBe(429);
    expect(shape(blocked[1])).toEqual(shape(blocked[0]));
    expect(shape(blocked[2])).toEqual(shape(blocked[0]));
  });

  run('[SC-CAT-030][REQ-LOG-001] con el correo bloqueado, el login por username sigue: 401 con contraseña mala y sesión con la buena (sin contador cruzado)', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    for (let i = 0; i < 5; i += 1) await failureOf(login.execute({ username: 'ana@ejemplo.com', password: BAD }));
    expect((await failureOf(login.execute({ username: 'ana@ejemplo.com', password: 'Ana2026a' })))?.code).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    expect((await failureOf(login.execute({ username: 'ana.perez', password: BAD })))?.code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect((await login.execute({ username: 'ANA.PEREZ', password: 'Ana2026a' })).session.user.id).toBe(idOf(1));
  });

  run('[SC-CAT-030] simetría: 5 fallos con el username no bloquean el correo; un éxito por correo limpia solo la clave del correo', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    for (let i = 0; i < 5; i += 1) await failureOf(login.execute({ username: 'Ana.Perez', password: BAD }));
    expect((await failureOf(login.execute({ username: 'ana.perez', password: 'Ana2026a' })))?.code).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    expect((await login.execute({ username: 'ana@ejemplo.com', password: 'Ana2026a' })).session.user.id).toBe(idOf(1));
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toHaveLength(5);
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana@ejemplo.com'))).toEqual([]);
  });

  run('[SC-CAT-030] un éxito por username limpia solo su clave y deja intactos los fallos del correo (3 fallos de cada uno, ninguno bloquea)', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    for (let i = 0; i < 3; i += 1) {
      await failureOf(login.execute({ username: 'ana.perez', password: BAD }));
      await failureOf(login.execute({ username: 'ana@ejemplo.com', password: BAD }));
    }
    await login.execute({ username: 'ana.perez', password: 'Ana2026a' });
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([]);
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana@ejemplo.com'))).toEqual([NOW, NOW, NOW]);
  });
});
