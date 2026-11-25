import { afterEach, describe, expect, it } from 'vitest';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { adminKit } from '../fixtures/admin-fixtures.ts';
import { canonicalState, createDeps } from '../fixtures/application-harness.ts';
import { SpyPasswordHasher } from '../fixtures/test-doubles.ts';
import { TTL_72H_MS, DELEGATE_ROOT_EMAIL, delegateOf, envOverUow, invite, loginRoot, problemCode, reinvite, type Env } from '../fixtures/admin-delegates-011.ts';

/**
 * T1526 (011, Bloque D, #63; `/keymaker`), I1 (`/trinity`): si `replace` devuelve `false` con la fila INTACTA (el índice único parcial por correo vivo rechazó la escritura, EDGE-011-019),
 * la respuesta es 409 `ERR-ADM11-INVALID-TRANSITION` (código existente más cercano del catálogo 1.1.0; no se inventa uno nuevo), no 412. Si la fila cambió, sigue siendo 412 `ERR-ADM11-PRECONDITION-FAILED`.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-005, EDGE-011-019
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

type Mode = 'real' | 'index' | 'raced';
function forcedReplace(uow: UnitOfWorkPort, control: { mode: Mode }): UnitOfWorkPort {
  const wrap = (repositories: RepositorySet): RepositorySet =>
    new Proxy(repositories, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (prop !== 'adminDelegates') return value;
        const delegates = value as RepositorySet['adminDelegates'];
        return new Proxy(delegates, {
          get(inner, name, innerReceiver) {
            if (name === 'replace' && control.mode !== 'real') {
              return async (next: Parameters<typeof delegates.replace>[0], expected: Parameters<typeof delegates.replace>[1]) => {
                // `raced`: otra escritura gana antes (la fila cambia de verdad); `index`: la fila queda intacta.
                if (control.mode === 'raced') await delegates.replace({ ...next, updatedAt: '2030-01-01T00:00:00.000Z' }, expected);
                return false;
              };
            }
            const member = Reflect.get(inner, name, innerReceiver) as unknown;
            return typeof member === 'function' ? (member as (...a: unknown[]) => unknown).bind(inner) : member;
          },
        });
      },
    });
  return { runInTransaction: (work) => uow.runInTransaction((r) => work(wrap(r))) };
}

async function boot(control: { mode: Mode }): Promise<Env> {
  const kit = adminKit([DELEGATE_ROOT_EMAIL]);
  const clock = new FixedClockAdapter();
  const base = new InMemoryUnitOfWork(canonicalState());
  const deps = createDeps(base, clock, new SpyPasswordHasher());
  return envOverUow('memory-forced-replace', forcedReplace(base, control), kit, clock, deps);
}

describe('replace rechazado: índice (409) frente a carrera (412)', () => {
  it('[EDGE-011-019] fila intacta tras el rechazo -> 409 ERR-ADM11-INVALID-TRANSITION', async () => {
    const control = { mode: 'real' as Mode };
    env = await boot(control);
    const rootOld = await loginRoot(env);
    await invite(env, rootOld, 'delegada.indice@example.test', 'SUPPORT');
    const row = (await delegateOf(env, rootOld, 'delegada.indice@example.test'))!;
    env.at(TTL_72H_MS + 1000);
    const root = await loginRoot(env);
    control.mode = 'index';
    const r = await reinvite(env, root, row.adminId, row.etag);
    expect([r.status, problemCode(r)]).toEqual([409, 'ERR-ADM11-INVALID-TRANSITION']);
  });

  it('[REQ-ADM11-005] la fila cambió por otra escritura -> sigue siendo 412 ERR-ADM11-PRECONDITION-FAILED', async () => {
    const control = { mode: 'real' as Mode };
    env = await boot(control);
    const rootOld = await loginRoot(env);
    await invite(env, rootOld, 'delegada.carrera@example.test', 'SUPPORT');
    const row = (await delegateOf(env, rootOld, 'delegada.carrera@example.test'))!;
    env.at(TTL_72H_MS + 1000);
    const root = await loginRoot(env);
    control.mode = 'raced';
    const r = await reinvite(env, root, row.adminId, row.etag);
    expect([r.status, problemCode(r)]).toEqual([412, 'ERR-ADM11-PRECONDITION-FAILED']);
  });
});
