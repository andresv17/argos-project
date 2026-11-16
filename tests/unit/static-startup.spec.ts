import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// T404 (R-1): prueba de arranque de @fastify/static 10.1.8 con Fastify 5.12.8.
describe('arranque de @fastify/static con Fastify', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'argos-static-'));
    writeFileSync(join(dir, 'index.html'), '<h1>argos</h1>');
    writeFileSync(join(dir, '.env'), 'SECRETO=1');
    app = Fastify();
    await app.register(fastifyStatic, { root: dir, dotfiles: 'deny' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sirve un archivo del directorio raíz con 200 y su contenido', async () => {
    const res = await app.inject({ method: 'GET', url: '/index.html' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<h1>argos</h1>');
  });

  it('niega los dotfiles (/.env) con 403 o 404 sin filtrar su contenido', async () => {
    const res = await app.inject({ method: 'GET', url: '/.env' });
    expect([403, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain('SECRETO');
  });
});
