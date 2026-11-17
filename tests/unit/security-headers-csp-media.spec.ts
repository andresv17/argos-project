import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, mediaBucketHost, registerSecurityHeaders } from '../../src/infrastructure/http/plugins/security-headers.ts';

/**
 * T563 (SC-ALM-012, REQ-ARC-003, E3-03, D-19 A): la CSP incluye exactamente el host del bucket de medios en `img-src` y
 * `frame-src`, sin comodines ni `https:` genérico, y mantiene `object-src 'none'`.
 */
const BUCKET = 'argos-argos-prod-1234-media';
const HOST = `${BUCKET}.storage.googleapis.com`;
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function cspOf(mediaHost?: string): Promise<string> {
  app = Fastify();
  registerSecurityHeaders(app, mediaHost === undefined ? undefined : { mediaHost });
  app.get('/x', async () => 'ok');
  const res = await app.inject({ method: 'GET', url: '/x' });
  return String(res.headers['content-security-policy']);
}
const directive = (csp: string, name: string): string[] => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) ?? []).slice(1);

describe('CSP con el host del bucket de medios (T563)', () => {
  it('mediaBucketHost deriva <bucket>.storage.googleapis.com del nombre del bucket', () => {
    expect(mediaBucketHost(BUCKET)).toBe(HOST);
  });

  it.each(['', 'Bucket', 'a b', 'a;b', "a'b", 'a/b', '*', 'a.b.c.evil.com/x', '-x', 'x'.repeat(64)])('mediaBucketHost rechaza el nombre no válido %j', (name) => {
    expect(() => mediaBucketHost(name)).toThrow('Nombre de bucket de medios no válido.');
  });

  it('img-src queda en self, data: y exactamente el host; frame-src es solo ese host', async () => {
    const csp = await cspOf(HOST);
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:', `https://${HOST}`]);
    expect(directive(csp, 'frame-src')).toEqual([`https://${HOST}`]);
  });

  it("object-src 'none', frame-ancestors 'none' y default-src 'self' se mantienen", async () => {
    const csp = await cspOf(HOST);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
  });

  it('sin comodines ni https: genérico en ninguna directiva', async () => {
    const csp = await cspOf(HOST);
    expect(csp).not.toMatch(/\*|\bhttps:(?!\/\/)|\bhttp:|unsafe-/);
    expect(csp.match(/https:\/\/[^\s;]+/g)).toEqual([`https://${HOST}`, `https://${HOST}`]);
  });

  it('sin host de medios (driver memory) la CSP base no cambia y no abre frame-src', async () => {
    const csp = await cspOf();
    expect(csp).toBe(CONTENT_SECURITY_POLICY);
    expect(directive(csp, 'frame-src')).toEqual([]);
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:']);
  });

  it('un host que no es <bucket>.storage.googleapis.com se rechaza al registrar (sin inyección de directivas)', () => {
    for (const bad of ['evil.example.com', `${HOST}; script-src *`, 'storage.googleapis.com', '*.storage.googleapis.com', `${HOST}/x`]) {
      expect(() => registerSecurityHeaders(Fastify(), { mediaHost: bad })).toThrow('Host de medios no válido para la CSP.');
    }
  });
});
