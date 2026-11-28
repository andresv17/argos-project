import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { bootEnv, loginRoot, observable, type Env } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): PRUEBA META de H-7 (REQ-ADM11-003, anexo §1 regla 1): enumera las rutas `/api/admin/*` realmente MONTADAS por Fastify y falla si alguna no
 * figura en el registro central (la matriz `x-sdd-role-matrix` del contrato y el único módulo de `infrastructure/http/` que la declara en código), o si el registro lista una ruta que no está montada.
 * Una ruta `/api/admin/*` sin declaración responde el 404 uniforme (deny-by-default). El conjunto cerrado de métodos es GET/POST/PUT/PATCH/DELETE (HEAD/OPTIONS/TRACE los añade Fastify).
 *
 * @implements REQ-ADM11-003, INV-ADM11-001, INV-ADM9-002, EDGE-009-008
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const OPENAPI = parseYaml(readFileSync('specs/011-pulido-portal-hogares-admin/contracts/openapi/admin.openapi.yaml', 'utf8')) as { info: { 'x-sdd-role-matrix': { operations: Array<{ method: string; path: string; roles: string[] }> } } };
const MATRIX = OPENAPI.info['x-sdd-role-matrix'].operations;
const shape = (path: string): string => path.replace(/\{[A-Za-z]+\}|:[A-Za-z]+/g, ':p');
// Feature 012 (T1636): la cola de disputas de /admin vive en su propio contrato APPROVED (`admin-disputes.openapi.yaml`, sin editar la 011): sus 9 operaciones se suman a lo declarado y se exigen en el registro.
const DISPUTES = parseYaml(readFileSync('specs/012-multiduenio-microchip-cuidador/contracts/openapi/admin-disputes.openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { operationId?: string }>> };
const DISPUTE_OPS = Object.entries(DISPUTES.paths).flatMap(([path, item]) => Object.keys(item).filter((m) => METHODS.has(m.toUpperCase())).map((m) => ({ method: m.toUpperCase(), path: `/api${path}` })));
const MATRIX_KEYS = [...MATRIX.map((o) => `${o.method} ${shape(o.path)}`), ...DISPUTE_OPS.map((o) => `${o.method} ${shape(o.path)}`)].sort();

/** Lee el árbol de `printRoutes` (`├── /about (GET, HEAD, PUT)`, hijos con sangría) y devuelve `METODO /ruta/completa` de las rutas bajo /api/admin, sin el comodín de respaldo. */
function mountedAdminRoutes(tree: string): string[] {
  const stack: string[] = [];
  const found: string[] = [];
  for (const line of tree.split('\n')) {
    const m = /^((?:[│ ]   )*)[├└]── (\S+) \(([^)]*)\)/.exec(line);
    if (m === null) continue;
    const depth = m[1]!.length / 4;
    stack.length = depth;
    stack[depth] = m[2]!;
    const full = stack.join('');
    if (!full.startsWith('/api/admin') || full === '/api/admin' || full.endsWith('*')) continue;
    for (const method of m[3]!.split(',').map((x) => x.trim())) if (METHODS.has(method)) found.push(`${method} ${shape(full)}`);
  }
  return found.sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('T1525 prueba meta: las rutas /api/admin/* montadas coinciden con el registro central de roles (H-7)', { timeout: 60_000 }, () => {
  it('[REQ-ADM11-003] toda ruta /api/admin/* montada figura en el registro y todo lo declarado en el registro está montado (ni huérfanas ni fantasmas)', async () => {
    env = await bootEnv('memory');
    const mounted = mountedAdminRoutes(env.app.printRoutes({ commonPrefix: false }));
    const declared = MATRIX_KEYS.filter((key) => !key.endsWith('/auth/google/start') && !key.endsWith('/auth/google/callback'));
    const publicRoutes = ['GET /api/admin/auth/google/callback', 'GET /api/admin/auth/google/start'];
    expect(mounted.filter((key) => !declared.includes(key) && !publicRoutes.includes(key))).toEqual([]);
    expect(declared.filter((key) => !mounted.includes(key))).toEqual([]);
    expect(publicRoutes.filter((key) => !mounted.includes(key))).toEqual([]);
  });

  it('[REQ-ADM11-003][H-7] existe UN ÚNICO módulo de infrastructure/http/ que declara el registro de roles por ruta (marcador PUBLIC_PRE_SESSION) y contiene todas las rutas de la matriz', () => {
    const holders = sourceFiles('src/infrastructure/http').filter((file) => readFileSync(file, 'utf8').includes('PUBLIC_PRE_SESSION'));
    expect(holders).toHaveLength(1);
    const text = readFileSync(holders[0]!, 'utf8');
    for (const op of MATRIX) expect([op.method, op.path, text.includes(op.path)]).toEqual([op.method, op.path, true]);
    for (const op of DISPUTE_OPS) expect([op.method, op.path, text.includes(op.path)]).toEqual([op.method, op.path, true]);
  });

  it('[REQ-ADM11-003][H-7] ninguna ruta /api/admin/* literal de infrastructure/http/ queda fuera de la matriz (salvo el respaldo con comodín que responde el 404 uniforme)', () => {
    const literal = /\bapp\.(?:get|post|put|patch|delete|all)(?:<[^>]*>)?\(\s*[`'"](\/api\/admin[^`'"]*)[`'"]/g;
    const orphans: string[] = [];
    const known = new Set([...MATRIX, ...DISPUTE_OPS].map((o) => shape(o.path)));
    for (const file of sourceFiles('src/infrastructure/http')) {
      for (const m of readFileSync(file, 'utf8').matchAll(literal)) {
        // Una ruta con plantilla (`${action}`) no se puede leer del literal: la cubre la primera prueba (rutas montadas).
        if (m[1]!.includes('${')) continue;
        const route = shape(m[1]!);
        if (route === '/api/admin' || route.endsWith('*')) continue;
        if (!known.has(route)) orphans.push(`${file}: ${m[1]}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('[REQ-ADM11-003][EDGE-009-008] una ruta /api/admin/* sin declaración se rechaza con el 404 uniforme, con y sin sesión, igual que una ruta inexistente de /api/', async () => {
    env = await bootEnv('memory');
    const root = await loginRoot(env);
    const reference = observable(await env.call('GET', '/api/ruta-que-no-existe', {}));
    for (const [method, url] of [['GET', '/api/admin/ruta-sin-declarar'], ['POST', '/api/admin/administrators/42/eliminar'], ['PUT', '/api/admin/roles'], ['DELETE', '/api/admin/administrators']] as const) {
      for (const cookie of [root, null]) {
        const r = await env.call(method, url, { cookie, body: method === 'GET' ? undefined : {} });
        expect([method, url, r.status, r.text]).toEqual([method, url, 404, 'Not Found']);
        expect(observable(r).headers['content-type']).toBe(reference.headers['content-type']);
      }
    }
  });

  it('[REQ-ADM11-003][H-7] la matriz declara exactamente los tres roles cerrados y el marcador público solo en el inicio y el callback de Google', () => {
    const roles = new Set(MATRIX.flatMap((o) => o.roles));
    expect([...roles].sort()).toEqual(['OPERATOR', 'PUBLIC_PRE_SESSION', 'SUPER_ADMIN', 'SUPPORT']);
    expect(MATRIX.filter((o) => o.roles.includes('PUBLIC_PRE_SESSION')).map((o) => o.path).sort()).toEqual(['/api/admin/auth/google/callback', '/api/admin/auth/google/start']);
    expect(MATRIX.every((o) => o.roles.includes('SUPER_ADMIN') || o.roles.includes('PUBLIC_PRE_SESSION'))).toBe(true);
  });
});
