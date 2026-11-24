import type { PlatformParameterPort } from '../../src/application/ports/platform-parameter.port.ts';
import { createCachedPlatformParameterPort } from '../../src/application/platform-parameters/cached-platform-parameter.ts';
import type { ClockPort } from '../../src/application/ports/clock.port.ts';
import type { Api } from '../integration/api/api-harness.ts';

/**
 * Parametros de plataforma de la Feature 009 (Fase 5a, #20): el MISMO puerto con cache de <= 60 s por instancia que usa `server.ts`
 * (`createCachedPlatformParameterPort`), leyendo la fila de `platform_parameters` de la base de la prueba. `Api` aun no existe cuando se arma `createApi`,
 * asi que el repositorio y el reloj se resuelven en perezoso con `bind(api)`.
 * Como se usa la fabrica real, las ampliaciones del puerto (T1264/T1266) viajan solas a estas pruebas.
 */
export interface ParameterKit {
  readonly port: PlatformParameterPort;
  bind(api: Api): void;
  /** Avanza el reloj fijo de la API (para que expire la cache de 60 s). */
  advanceSeconds(api: Api, seconds: number): void;
  readonly warnings: Array<{ key: string; reason: string }>;
}

export function parameterKit(ttlMs?: number): ParameterKit {
  let bound: Api | null = null;
  const warnings: Array<{ key: string; reason: string }> = [];
  const clock: ClockPort = {
    get timeZone() {
      return bound!.clock.timeZone;
    },
    todayIsoDate: () => bound!.clock.todayIsoDate(),
    nowIsoTimestamp: () => bound!.clock.nowIsoTimestamp(),
  } as ClockPort;
  const port = createCachedPlatformParameterPort({
    repository: {
      async findValue(key: string): Promise<string | null> {
        const row = bound!.db.prepare('SELECT value FROM platform_parameters WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value ?? null;
      },
    },
    clock,
    ...(ttlMs === undefined ? {} : { ttlMs }),
    warn: (w) => warnings.push({ key: w.key, reason: w.reason }),
  });
  return {
    port,
    warnings,
    bind: (api) => {
      bound = api;
    },
    advanceSeconds: (api, seconds) => {
      const next = new Date(Date.parse(api.clock.nowIsoTimestamp()) + seconds * 1000).toISOString();
      api.clock.setClock(next.slice(0, 10), next);
    },
  };
}
