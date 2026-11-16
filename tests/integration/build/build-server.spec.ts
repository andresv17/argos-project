import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * T432 (REQ-CLD-001, H-03-04, D-07 = A): bundle de producción del servidor con esbuild.
 * `scripts/build-server.mjs --outdir <dir>` genera el ejecutable; `better-sqlite3` queda como `external` (no embebido),
 * sin secretos incrustados, y el bundle arranca y responde /healthz 200 sin Docker.
 * El directorio de salida va dentro del repositorio para que `better-sqlite3` (external) se resuelva con node_modules.
 */

const ROOT = process.cwd();
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-server.mjs');
let outDir = '';
let buildStatus: number | null = null;
let buildOutput = '';

function jsFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => join(dir, f)) : [];
}
function allBundleText(): string {
  return jsFiles(outDir).map((f) => readFileSync(f, 'utf8')).join('\n');
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

beforeAll(() => {
  outDir = mkdtempSync(join(ROOT, 'dist-server-test-'));
  const result = spawnSync(process.execPath, [BUILD_SCRIPT, '--outdir', outDir], { cwd: ROOT, encoding: 'utf8', timeout: 90_000 });
  buildStatus = result.status;
  buildOutput = `${result.stdout}${result.stderr}`;
}, 120_000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('bundle de producción del servidor (T432)', () => {
  it('[REQ-CLD-001] el script de build termina con exit 0 y genera server.js', () => {
    expect(buildOutput).not.toContain('Cannot find module');
    expect(buildStatus).toBe(0);
    expect(existsSync(join(outDir, 'server.js'))).toBe(true);
  });

  it('[H-03-04] el bundle es JavaScript: ningún .ts en la salida ni sintaxis de tipos', () => {
    expect(readdirSync(outDir).filter((f) => f.endsWith('.ts'))).toEqual([]);
    expect(readFileSync(join(outDir, 'server.js'), 'utf8')).not.toMatch(/^import type /m);
  });

  it('[REQ-CLD-001][REQ-PG-010] better-sqlite3 es external: se importa por nombre y su código no está embebido', () => {
    const text = allBundleText();
    expect(text).toMatch(/from\s*["']better-sqlite3["']/);
    // Código propio del paquete nativo (no debe estar dentro del bundle).
    expect(text).not.toContain('better_sqlite3.node');
    expect(text).not.toMatch(/function Database\(filenameGiven, options\)/);
  });

  it('[REQ-PG-010] la carga de SQLite queda en un fragmento aparte: el archivo de entrada no importa better-sqlite3', () => {
    const entry = readFileSync(join(outDir, 'server.js'), 'utf8');
    expect(entry).not.toMatch(/from\s*["']better-sqlite3["']/);
  });

  it('[REQ-SEC-005] el bundle no incrusta secretos: sin URL con credenciales ni asignaciones a process.env', () => {
    const text = allBundleText();
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toMatch(/postgres(?:ql)?:\/\/[^\s"'`/@:]+:[^\s"'`/@]+@/);
    expect(text).not.toMatch(/process\.env(?:\.[A-Za-z_]+|\[[^\]]+\])\s*=(?!=)/);
    expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  });

  it('[REQ-CLD-001] las migraciones SQLite viajan junto al bundle', () => {
    expect(readdirSync(join(outDir, 'migrations')).filter((f) => f.endsWith('.sql')).length).toBeGreaterThanOrEqual(5);
  });

  it('[REQ-CLD-001] el bundle arranca con SQLite local y /healthz responde 200 sin Docker', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'argos-t432-'));
    const port = await freePort();
    let child: ChildProcess | undefined;
    let stderr = '';
    try {
      child = spawn(process.execPath, [join(outDir, 'server.js')], {
        cwd: ROOT,
        env: { PATH: process.env['PATH'] ?? '', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: join(dataDir, 'argos.sqlite') },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      let status = 0;
      for (let attempt = 0; attempt < 100 && status !== 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.status, () => 0);
      }
      expect(stderr).toBe('');
      expect(status).toBe(200);
    } finally {
      child?.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 200));
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
});
