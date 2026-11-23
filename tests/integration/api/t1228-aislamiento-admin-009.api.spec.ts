import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { ADMIN_COOKIE_PATTERN, ADMIN_SESSION_COOKIE, adminKit, adminLogin, observable, staticRootWithIndex } from '../../fixtures/admin-fixtures.ts';
import { createApi, type Api } from './api-harness.ts';

/**
 * T1228 (pruebas rojas, Feature 009, Fase 3, #19): aislamiento del portal `/admin`. Sin sesión de administración, `/api/admin/*` y toda ruta del portal distinta de
 * `GET /admin` y del inicio del flujo devuelven EL MISMO `404` que una ruta inexistente (cuerpo, cabeceras y secuencia de puertos); `GET /admin` sirve solo la pantalla de acceso.
 * REQ-ADM9-001, INV-ADM9-001, EDGE-009-008; SC-009-009. La app se monta como en producción (con estáticos): sin ellos el 404 de Fastify refleja la URL en el cuerpo.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

/** Registra la secuencia de métodos de repositorio que toca cada petición (`repositorio.método`), para comparar la secuencia de puertos. */
function recorder(): { log: string[]; wrap: (uow: UnitOfWorkPort) => UnitOfWorkPort } {
  const log: string[] = [];
  const wrap = (uow: UnitOfWorkPort): UnitOfWorkPort => ({
    ...uow,
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>) =>
      uow.runInTransaction((repositories) => {
        const spy = new Proxy(repositories, {
          get(target, name) {
            const repository = Reflect.get(target, name) as Record<string, unknown>;
            return new Proxy(repository, {
              get(inner, method) {
                const member = Reflect.get(inner, method);
                return typeof member === 'function' ? (...args: unknown[]) => { log.push(`${String(name)}.${String(method)}`); return (member as (...a: unknown[]) => unknown).apply(inner, args); } : member;
              },
            });
          },
        });
        return work(spy);
      }),
  });
  return { log, wrap };
}

async function boot(): Promise<{ a: Api; kit: ReturnType<typeof adminKit>; log: string[] }> {
  const kit = adminKit();
  const rec = recorder();
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithIndex(), wrapUow: rec.wrap });
  api = a;
  return { a, kit, log: rec.log };
}

const NOT_FOUND_REFERENCE = '/api/ruta-inexistente-zz';
const HIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['GET', '/api/admin/session'],
  ['DELETE', '/api/admin/session'],
  ['GET', '/api/admin/pending-count'],
  ['GET', '/api/admin/registrations'],
  ['POST', '/api/admin/registrations/00000000-0000-4000-8000-000000000001/approve'],
  ['GET', '/api/admin/parameters'],
  ['PUT', '/api/admin/parameters/scene.enabled'],
  ['GET', '/api/admin/lo/que/sea/profundo'],
  ['GET', '/api/admin'],
  ['GET', '/api/admin/'],
  ['POST', '/api/admin/auth/google/start'],
  ['GET', '/api/admin/auth/google'],
];

describe('T1228 [REQ-ADM9-001] [EDGE-009-008] sin sesión de administración todo /api/admin/* es indistinguible de una ruta inexistente', () => {
  it('[SC-009-009] estado, cuerpo y cabeceras idénticos a los de una ruta inexistente de /api/ (text/plain "Not Found")', async () => {
    const { a } = await boot();
    for (const [method, path] of HIDDEN) {
      const hidden = await a.call(method, path, { contract: false });
      const reference = await a.call(method, NOT_FOUND_REFERENCE, { contract: false });
      expect(reference.status, `${method} ${path}: la referencia debe ser el 404 de una ruta inexistente`).toBe(404);
      expect(reference.text).toBe('Not Found');
      expect(observable(hidden), `${method} ${path}`).toEqual(observable(reference));
    }
  });

  it('[SC-009-009] sin la cabecera CSRF una mutación recibe el mismo 403 que una ruta inexistente (mismo código, cabeceras y cuerpo salvo la propia ruta en `instance`)', async () => {
    const { a } = await boot();
    const shape = (r: Awaited<ReturnType<Api['call']>>) => {
      const { instance, ...problem } = r.json as Record<string, unknown>;
      const { 'content-length': _length, ...headers } = observable(r).headers;
      return { status: r.status, problem, headers, instanceIsOwnPath: typeof instance === 'string' };
    };
    for (const [method, path] of [['DELETE', '/api/admin/session'], ['POST', '/api/admin/registrations/x/approve']] as const) {
      const hidden = await a.call(method, path, { csrf: false, contract: false });
      const reference = await a.call(method, NOT_FOUND_REFERENCE, { csrf: false, contract: false });
      expect(hidden.status).toBe(403);
      expect(shape(hidden), `${method} ${path}`).toEqual(shape(reference));
    }
  });

  it('[EDGE-009-008] el 404 no usa application/problem+json ni lleva código ERR-*', async () => {
    const { a } = await boot();
    const r = await a.call('GET', '/api/admin/session', { contract: false });
    expect(r.status).toBe(404);
    expect(String(r.headers['content-type'])).toMatch(/^text\/plain/);
    expect(r.text).not.toMatch(/ERR-|problem/i);
  });

  it('[EDGE-009-008] [INV-ADM9-002] una cookie de USUARIO (argos_session) no abre nada: mismo 404', async () => {
    const { a } = await boot();
    const userCookie = await a.login('andres');
    const withUser = await a.call('GET', '/api/admin/session', { cookie: userCookie, contract: false });
    const reference = await a.call('GET', NOT_FOUND_REFERENCE, { cookie: userCookie, contract: false });
    expect(observable(withUser)).toEqual(observable(reference));
  });

  it('[EDGE-009-008] cookie de administración mal formada, desconocida, vencida o revocada = el mismo 404', async () => {
    const { a } = await boot();
    const reference = observable(await a.call('GET', NOT_FOUND_REFERENCE, { contract: false }));
    const { cookie } = await adminLogin(a);
    expect(cookie).toMatch(ADMIN_COOKIE_PATTERN);
    // revocada por cierre explícito
    const closed = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: 'http://localhost' }, contract: false });
    expect(closed.status).toBe(204);
    const candidates = [`${ADMIN_SESSION_COOKIE}=basura`, `${ADMIN_SESSION_COOKIE}=${'A'.repeat(43)}`, `${ADMIN_SESSION_COOKIE}=`, cookie!];
    for (const candidate of candidates) {
      expect(observable(await a.call('GET', '/api/admin/session', { cookie: candidate, contract: false })), candidate).toEqual(reference);
    }
  });

  it('[EDGE-009-008] [LCK-18] la SECUENCIA DE PUERTOS es la misma sin cookie, con cookie ajena, desconocida, mal formada, de usuario, revocada o vencida', async () => {
    const { a, log } = await boot();
    const userCookie = await a.login('andres');
    const { cookie: adminCookie } = await adminLogin(a);
    await a.call('DELETE', '/api/admin/session', { cookie: adminCookie, headers: { origin: 'http://localhost' }, contract: false });
    const sequenceOf = async (path: string, cookie: string | null): Promise<string[]> => {
      log.length = 0;
      const r = await a.call('GET', path, { cookie, contract: false });
      expect(r.status).toBe(404);
      return [...log];
    };
    const variants: Array<string | null> = [null, userCookie, `${ADMIN_SESSION_COOKIE}=basura`, `${ADMIN_SESSION_COOKIE}=${'B'.repeat(43)}`, adminCookie];
    const sessionRoute = await Promise.all(variants.map((cookie) => sequenceOf('/api/admin/session', cookie)));
    for (const seq of sessionRoute) expect(seq).toEqual(sessionRoute[0]);
    // una ruta del portal que NO existe o que existe pero no se ha implementado recorre la misma secuencia que una que sí existe
    const hiddenRoute = await Promise.all(variants.map((cookie) => sequenceOf('/api/admin/registrations', cookie)));
    for (const seq of hiddenRoute) expect(seq).toEqual(sessionRoute[0]);
  });

  it('[EDGE-009-008] [REQ-ADM9-001] con sesión de administración válida una ruta del portal inexistente sigue siendo el 404 uniforme', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    expect(cookie).toMatch(ADMIN_COOKIE_PATTERN);
    const reference = observable(await a.call('GET', NOT_FOUND_REFERENCE, { contract: false }));
    const unknown = await a.call('GET', '/api/admin/ruta-que-no-existe', { cookie, contract: false });
    expect(observable(unknown)).toEqual(reference);
  });
});

describe('T1228 [REQ-ADM9-001] [SC-009-009] las páginas del portal: solo GET /admin se sirve', () => {
  it('GET /admin sirve la pantalla de acceso (el index del bundle) sin necesitar sesión ni cookie', async () => {
    const { a } = await boot();
    const r = await a.call('GET', '/admin', { contract: false });
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toMatch(/^text\/html/);
    expect(r.text).toContain('<title>ARGOS</title>');
  });

  it('cualquier subruta de /admin (la cookie Path=/api/admin nunca viaja a ellas) responde el mismo 404 que una ruta inexistente de /api/', async () => {
    const { a } = await boot();
    const reference = observable(await a.call('GET', NOT_FOUND_REFERENCE, { contract: false }));
    for (const path of ['/admin/', '/admin/pendientes', '/admin/parametros/escena', '/admin/x/y/z']) {
      expect(observable(await a.call('GET', path, { contract: false })), path).toEqual(reference);
    }
  });

  it('el inicio del flujo de Google de administración es la única ruta de /api/admin/ que responde sin sesión (302 a Google)', async () => {
    const { a } = await boot();
    const r = await a.call('GET', '/api/admin/auth/google/start', { csrf: false, contract: false });
    expect(r.status).toBe(302);
    expect(String(r.headers['location'])).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});
