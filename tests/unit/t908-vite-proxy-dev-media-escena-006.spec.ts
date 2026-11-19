import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * T908 (006, Fase 10): aserción estática sobre `vite.config.ts` (sin red, sin arrancar Vite). El proxy de desarrollo reenvía `/__dev/media` a la API local (la misma
 * ruta que registra `registerDevMediaRoutes`, T571) para que la imagen de escena, que responde 302 hacia `/__dev/media/...`, se vea en `vite dev`; solo dos claves
 * (`/api` y `/__dev/media`), ambas a `127.0.0.1`, y dentro de `server.proxy` (no entra en `vite build` ni en producción). REQ-ESC6-037 (coherencia con INV-ESC6-020).
 */
const config = readFileSync('vite.config.ts', 'utf8');
const proxyBlock = /proxy:\s*\{([\s\S]*?)\n\s{4}\},/.exec(config)?.[1] ?? '';

describe('T908 proxy de desarrollo /__dev/media (REQ-ESC6-037)', () => {
  it('[REQ-ESC6-037] server.proxy declara exactamente las claves /api y /__dev/media, ambas hacia 127.0.0.1 con el puerto de la API local', () => {
    expect(proxyBlock).not.toBe('');
    const keys = [...proxyBlock.matchAll(/^\s{6}'([^']+)':\s*\{/gm)].map((m) => m[1]);
    expect(keys).toEqual(['/api', '/__dev/media']);
    const targets = [...proxyBlock.matchAll(/target:\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(targets).toHaveLength(2);
    for (const target of targets) expect(target).toBe("http://127.0.0.1:${process.env['E2E_API_PORT'] ?? 3100}");
  });

  it('[INV-ESC6-020] el proxy vive solo en server (vite dev): la sección build no menciona /__dev/media', () => {
    const afterServer = config.slice(config.indexOf('build:'));
    expect(afterServer.includes('__dev')).toBe(false);
    expect(config.indexOf('/__dev/media')).toBeLessThan(config.indexOf('build:'));
  });
});
