import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootEnv, changeRole, delegateOf, disable, emailOf, fillSlots, invite, loginRoot, onboard, problemCode, type Backend, type Env, type Resp } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): cada `ERR-ADM11-*` del catálogo 1.1.0 tiene al menos una prueba que lo PRODUCE por HTTP con el estado del catálogo y
 * `application/problem+json`; el catálogo no gana códigos sin prueba. `ERR-ADM11-LAST-SUPER-ADMIN` no es alcanzable por HTTP con H-6 (un delegado no toca a otro `SUPER_ADMIN` y la raíz, mientras la lista
 * no esté vacía, siempre cuenta): su evidencia es la guarda serializada del servicio de dominio único (prueba estática de que el código la produce y las carreras de `t1525-carreras-*`).
 *
 * @implements REQ-ADM11-001, REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, INV-ADM11-001, INV-ADM11-002, EDGE-011-001, EDGE-011-002, EDGE-011-009, EDGE-011-011
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const CATALOG = JSON.parse(readFileSync('specs/011-pulido-portal-hogares-admin/contracts/errors/error-catalog.json', 'utf8')) as { version: string; errors: Record<string, { type: string; status: number }> };
const ADM11 = Object.values(CATALOG.errors).filter((e) => e.type.includes('ERR-ADM11-')).map((e) => ({ code: e.type.slice('urn:argos:error:'.length), status: e.status }));
const statusOf = (code: string): number => ADM11.find((e) => e.code === code)!.status;

interface Cast {
  readonly root: string;
  readonly sa: Awaited<ReturnType<typeof onboard>>;
  readonly op: Awaited<ReturnType<typeof onboard>>;
}
async function cast(e: Env): Promise<Cast> {
  const root = await loginRoot(e);
  const sa = await onboard(e, root, 'super@example.test', 'SUPER_ADMIN');
  const op = await onboard(e, root, 'operador@example.test', 'OPERATOR');
  return { root, sa, op };
}
const etagOf = async (e: Env, cookie: string | null, email: string): Promise<string> => (await delegateOf(e, cookie, email))!.etag;

const PRODUCERS: Record<string, (e: Env) => Promise<Resp>> = {
  'ERR-ADM11-ROLE-NOT-AUTHORIZED': async (e) => e.call('GET', '/api/admin/administrators', { cookie: (await cast(e)).op.cookie }),
  'ERR-ADM11-GRANT-FORBIDDEN': async (e) => invite(e, (await cast(e)).sa.cookie, 'nuevo.super@example.test', 'SUPER_ADMIN'),
  'ERR-ADM11-SELF-MODIFICATION-FORBIDDEN': async (e) => {
    const c = await cast(e);
    return disable(e, c.sa.cookie, c.sa.adminId!, await etagOf(e, c.root, 'super@example.test'));
  },
  'ERR-ADM11-DELEGATE-LIMIT-REACHED': async (e) => {
    const root = await loginRoot(e);
    await fillSlots(e, root, 20);
    return invite(e, root, emailOf(99), 'SUPPORT');
  },
  'ERR-ADM11-ROOT-PROTECTED': async (e) => {
    const c = await cast(e);
    e.kit.emails.push('operador@example.test');
    return disable(e, c.root, c.op.adminId!, await etagOf(e, c.root, 'operador@example.test'));
  },
  'ERR-ADM11-INVALID-TRANSITION': async (e) => {
    const c = await cast(e);
    const first = await disable(e, c.root, c.op.adminId!, await etagOf(e, c.root, 'operador@example.test'));
    return disable(e, c.root, c.op.adminId!, (first.json as { etag: string }).etag);
  },
  'ERR-ADM11-DELEGATE-NOT-FOUND': async (e) => changeRole(e, (await cast(e)).root, '50000000-0000-4000-8000-000000000001', '"abcdefgh12"', 'SUPPORT'),
  'ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH': async (e) => invite(e, await loginRoot(e), 'uno@example.test', 'SUPPORT', 'dos@example.test'),
  'ERR-ADM11-PRECONDITION-FAILED': async (e) => {
    const c = await cast(e);
    const stale = await etagOf(e, c.root, 'operador@example.test');
    await changeRole(e, c.root, c.op.adminId!, stale, 'SUPPORT');
    return changeRole(e, c.root, c.op.adminId!, stale, 'OPERATOR');
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === 'generated' ? [] : sourceFiles(path)) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('T1525 el catálogo de errores 011 (1.3.0) tiene una prueba que produce cada código', () => {
  it('[INV-ADM11-001] el catálogo trae exactamente los diez ERR-ADM11-* acordados y cada uno tiene su productor (o es el de la guarda de dominio)', () => {
    expect(CATALOG.version).toBe('1.3.0'); // 1.3.0 (T1553): suma ERR-PRF11-AVATAR-NOT-FOUND y ERR-PRF11-AVATAR-INVALID-IMAGE; 1.2.0 (T1548): suma ERR-HOG11-HOUSEHOLD-LIMIT-REACHED; los diez ERR-ADM11-* no cambian
    expect(ADM11.map((e) => e.code).sort()).toEqual([...Object.keys(PRODUCERS), 'ERR-ADM11-LAST-SUPER-ADMIN'].sort());
  });

  it('[REQ-ADM11-005][EDGE-011-002][EDGE-011-011] ERR-ADM11-LAST-SUPER-ADMIN: el código de la aplicación produce el error de la guarda del último SUPER_ADMIN (409) fuera de src/generated', () => {
    const producers = sourceFiles('src').filter((file) => readFileSync(file, 'utf8').includes('ERR-ADM11-LAST-SUPER-ADMIN'));
    expect(producers.length).toBeGreaterThan(0);
    expect(statusOf('ERR-ADM11-LAST-SUPER-ADMIN')).toBe(409);
  });
});

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 cada ERR-ADM11-* se produce por HTTP con su estado del catálogo (${backend})`, { timeout: 60_000 }, () => {
    for (const [code, produce] of Object.entries(PRODUCERS)) {
      it(`[INV-ADM11-001][REQ-ADM11-003] ${code} responde ${statusOf(code)} application/problem+json con ese code`, async () => {
        env = await bootEnv(backend);
        const r = await produce(env);
        expect([r.status, problemCode(r), String(r.headers['content-type'])]).toEqual([statusOf(code), code, expect.stringMatching(/^application\/problem\+json/)]);
        expect(r.text).not.toMatch(/@example\.test/);
      });
    }
  });
}
