import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R-1 de T411 (pruebas primero; las implementa T412): caché en memoria de 60 s de /readyz.
 * D-17 (Neo, 2026-11-15), REQ-CLD-004, T474. Éxito y fallo se cachean 60 s por instancia;
 * /healthz nunca se cachea ni toca checkReady.
 *
 * Contrato (el mismo de ops-http.spec.ts): src/infrastructure/http/routes/ops-routes.ts exporta
 * registerOpsRoutes(app, { checkReady }). La caché vive en la instancia (cierre del registro), no en el módulo.
 */

const OPS_ROUTES = join(process.cwd(), 'src', 'infrastructure', 'http', 'routes', 'ops-routes.ts');
type RegisterOpsRoutes = (app: FastifyInstance, options: { readonly checkReady: () => Promise<void> }) => Promise<void> | void;

async function buildApp(checkReady: () => Promise<void>): Promise<FastifyInstance> {
  const mod = (await import(/* @vite-ignore */ OPS_ROUTES)) as Record<string, unknown>;
  const registerOpsRoutes = mod.registerOpsRoutes as RegisterOpsRoutes;
  const instance = Fastify();
  await registerOpsRoutes(instance, { checkReady });
  await instance.ready();
  return instance;
}

let checkReady: ReturnType<typeof vi.fn<() => Promise<void>>>;
const apps: FastifyInstance[] = [];

async function newApp(): Promise<FastifyInstance> {
  const instance = await buildApp(checkReady);
  apps.push(instance);
  return instance;
}
const getReadyz = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/readyz' });

beforeEach(() => {
  vi.useFakeTimers();
  checkReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('/readyz caché de 60 s (D-17, REQ-CLD-004)', () => {
  it('dos GET /readyz en menos de 60 s provocan una sola llamada a checkReady', async () => {
    const app = await newApp();
    const first = await getReadyz(app);
    await vi.advanceTimersByTimeAsync(59_000);
    const second = await getReadyz(app);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: 'ready' });
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('un fallo de checkReady queda cacheado 60 s: el mismo 503 sin volver a llamar', async () => {
    checkReady.mockRejectedValue(new Error('neon caído'));
    const app = await newApp();
    const first = await getReadyz(app);
    await vi.advanceTimersByTimeAsync(30_000);
    checkReady.mockResolvedValue(undefined);
    const second = await getReadyz(app);
    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(503);
    expect(second.json<{ code: string }>().code).toBe('ERR-INTERNAL-UNEXPECTED');
    expect(second.headers['content-type']).toContain('application/problem+json');
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('la caché expira a los 61 s y vuelve a llamar a checkReady', async () => {
    const app = await newApp();
    await getReadyz(app);
    await vi.advanceTimersByTimeAsync(61_000);
    const res = await getReadyz(app);
    expect(res.statusCode).toBe(200);
    expect(checkReady).toHaveBeenCalledTimes(2);
  });

  it('tras expirar, un fallo cacheado se reevalúa y puede pasar a 200', async () => {
    checkReady.mockRejectedValueOnce(new Error('neon dormido'));
    const app = await newApp();
    expect((await getReadyz(app)).statusCode).toBe(503);
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await getReadyz(app)).statusCode).toBe(200);
    expect(checkReady).toHaveBeenCalledTimes(2);
  });

  it('/healthz nunca se cachea: no llama a checkReady y cada GET es independiente', async () => {
    const app = await newApp();
    await getReadyz(app);
    checkReady.mockClear();
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(checkReady).not.toHaveBeenCalled();
  });

  it('la caché es por instancia: una app nueva empieza sin caché', async () => {
    const appA = await newApp();
    await getReadyz(appA);
    expect(checkReady).toHaveBeenCalledTimes(1);
    const appB = await newApp();
    await getReadyz(appB);
    expect(checkReady).toHaveBeenCalledTimes(2);
    await getReadyz(appA);
    await getReadyz(appB);
    expect(checkReady).toHaveBeenCalledTimes(2);
  });
});
