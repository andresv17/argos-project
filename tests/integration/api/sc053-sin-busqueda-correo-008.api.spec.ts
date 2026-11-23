import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { account, idOf, stateWith } from '../../fixtures/identity-engines.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';

/**
 * SC-008-053 (008, bloque J, `[GH:#24]`, `D8-10` = A): la ruta de autocompletado `GET /households/{householdId}/invitees?q=` NO busca por correo.
 * Un `q` con forma de correo (arroba) se rechaza con 422 antes de consultar usuarios, invitaciones o perfiles, y la respuesta no refleja el correo.
 * REQ-INV8-001, REQ-INV8-002 (descartado), REQ-HOUSE2-001; SC-008-053.
 */
let api: Api;
afterEach(async () => api?.close());

const EMAIL = 'pedro.a@example.test';
const PEOPLE = ['pedro.a', 'pedro.b'].map((u, i) => account(idOf(100 + i), u, 'Clave2026x!', `${u}@example.test`));

/** Espía de lecturas: registra `repositorio.método` de cada llamada hecha dentro de la transacción (excepto sesiones). */
function spyOnReads(): string[] {
  const log: string[] = [];
  const original = api.deps.uow;
  const trace = (repositories: RepositorySet): RepositorySet =>
    new Proxy(repositories, {
      get(target, name) {
        const repository: unknown = Reflect.get(target, name);
        if (typeof name !== 'string' || typeof repository !== 'object' || repository === null) return repository;
        return new Proxy(repository, {
          get(inner, method) {
            const member: unknown = Reflect.get(inner, method);
            if (typeof method !== 'string' || typeof member !== 'function') return member;
            return (...args: unknown[]) => {
              if (name !== 'sessions') log.push(`${name}.${method}`);
              return member.apply(inner, args);
            };
          },
        });
      },
    });
  const spied: UnitOfWorkPort = Object.assign(Object.create(original) as UnitOfWorkPort, {
    runInTransaction: <T,>(work: (repositories: RepositorySet) => Promise<T>) => original.runInTransaction((repositories) => work(trace(repositories))),
  });
  (api.deps as { uow: UnitOfWorkPort }).uow = spied;
  return log;
}

describe('sin búsqueda por correo en el autocompletado (D8-10 = A)', () => {
  it('[REQ-INV8-001][SC-008-053] un q con forma de correo da 422 ERR-SCHEMA-VALIDATION-FAILED sin consultar usuarios ni invitaciones y sin reflejar el correo', async () => {
    api = await createApi(stateWith(PEOPLE));
    const andres = await api.login('andres');
    const hid = ((await api.call('POST', '/api/households', { cookie: andres, body: { name: 'Casa correo' } })).json as { household: { id: string } }).household.id;
    const reads = spyOnReads();
    const outcomes: Array<[string, { status: number; code?: string | undefined }, string[], boolean]> = [];
    for (const q of [EMAIL, 'ana@x.com', 'PEDRO.A@EXAMPLE.TEST', 'ped@']) {
      reads.length = 0;
      const response = await api.call('GET', `/api/households/${hid}/invitees?q=${encodeURIComponent(q)}`, { cookie: andres });
      const reflected = response.text.toLowerCase().includes(q.toLowerCase()) || /example\.test|pedro\.a|pedro\.b/i.test(response.text);
      outcomes.push([q, problemOf(response), [...reads], reflected]);
    }
    const rejected = { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' };
    // Solo se lee la membresía (el permiso va antes que el prefijo); nunca users.*, invitations.* ni perfiles.
    expect(outcomes).toEqual([EMAIL, 'ana@x.com', 'PEDRO.A@EXAMPLE.TEST', 'ped@'].map((q) => [q, rejected, ['households.listMemberships'], false]));
  });
});
