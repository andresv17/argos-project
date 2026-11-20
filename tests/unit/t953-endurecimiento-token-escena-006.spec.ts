import { describe, expect, it } from 'vitest';
import { createMetadataTokenClient } from '../../src/infrastructure/adapters/metadata-token-client.ts';
import { redactSecrets } from '../../src/infrastructure/http/cloud-logging.ts';

/**
 * Endurecimiento del token de Vertex (006, Fase 14; /trinity H-F14-T1..T3; REQ-ESC6-031, NFR-ESC6-001): una sola petición de token con caché fría y generaciones
 * concurrentes; el cuerpo ilegible del metadata server no se repite en el error; `ya29.` y `Bearer` salen redactados de los registros. Todo con `fetch` simulado.
 */
const TOKEN = 'ya29.SYNTHETIC-TOKEN-0000000000000000000000'; // argos-scan:allow token sintetico de prueba
const jsonResponse = (token: string, expiresIn = 3600): Response => new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status: 200 });

describe('H-F14-T1: una sola petición de token con generaciones concurrentes', () => {
  it('dos llamadas simultáneas con caché fría hacen UN fetch y reciben el mismo token', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchSim = (async (): Promise<Response> => { calls += 1; await gate; return jsonResponse(TOKEN); }) as typeof fetch;
    const client = createMetadataTokenClient({ fetch: fetchSim, now: () => 0 });
    const a = client.getAccessToken();
    const b = client.getAccessToken();
    release();
    expect(await Promise.all([a, b])).toEqual([TOKEN, TOKEN]);
    expect(calls).toBe(1);
  });

  it('si la petición en vuelo falla, ambas fallan y la siguiente llamada reintenta (la promesa fallida no queda memoizada)', async () => {
    let calls = 0;
    const fetchSim = (async (): Promise<Response> => { calls += 1; return calls === 1 ? new Response('no', { status: 500 }) : jsonResponse(TOKEN); }) as typeof fetch;
    const client = createMetadataTokenClient({ fetch: fetchSim, now: () => 0 });
    const settled = await Promise.allSettled([client.getAccessToken(), client.getAccessToken()]);
    expect(settled.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(calls).toBe(1);
    expect(await client.getAccessToken()).toBe(TOKEN);
    expect(calls).toBe(2);
  });

  it('con el token vigente en caché no hay más peticiones; vencido, una nueva y única para llamadas concurrentes', async () => {
    let calls = 0;
    let clock = 0;
    const fetchSim = (async (): Promise<Response> => { calls += 1; return jsonResponse(`${TOKEN}${calls}`, 3600); }) as typeof fetch;
    const client = createMetadataTokenClient({ fetch: fetchSim, now: () => clock });
    await client.getAccessToken();
    await client.getAccessToken();
    expect(calls).toBe(1);
    clock = 56 * 60 * 1000;
    const pair = await Promise.all([client.getAccessToken(), client.getAccessToken()]);
    expect(calls).toBe(2);
    expect(pair[0]).toBe(`${TOKEN}2`);
    expect(pair[1]).toBe(`${TOKEN}2`);
  });
});

describe('H-F14-T2: cuerpo ilegible del metadata server', () => {
  it('un cuerpo no JSON produce el error literal sin repetir el cuerpo ni el mensaje del parser', async () => {
    const body = `<html>${TOKEN} secreto-del-cuerpo</html>`;
    const client = createMetadataTokenClient({ fetch: (async () => new Response(body, { status: 200 })) as typeof fetch, now: () => 0 });
    const error = await client.getAccessToken().then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe('token de metadatos no disponible');
    expect(message).not.toContain('secreto-del-cuerpo');
    expect(message).not.toContain(TOKEN);
    expect((error as Error).cause).toBeUndefined();
  });

  it('un token ilegible o ausente en un JSON válido da el mismo error literal', async () => {
    const client = createMetadataTokenClient({ fetch: (async () => new Response(JSON.stringify({ access_token: 'con espacios', expires_in: 3600 }), { status: 200 })) as typeof fetch, now: () => 0 });
    await expect(client.getAccessToken()).rejects.toThrow('token de metadatos no disponible');
  });
});

describe('H-F14-T3: redacción de ya29. y Bearer en registros', () => {
  it('redactSecrets elimina un token ya29. suelto y dentro de un mensaje', () => {
    const out = redactSecrets(`fallo con ${TOKEN} en la llamada`, undefined);
    expect(out).not.toContain('ya29.');
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('[REDACTED]');
  });

  it('redactSecrets elimina «Bearer <credencial>» (cabecera Authorization) sin importar mayúsculas', () => {
    for (const text of [`authorization: Bearer ${TOKEN}`, 'Authorization: bearer abc.def-123_456=', 'BEARER eyJhbGciOiJSUzI1NiJ9.payload.firma']) {
      const out = redactSecrets(text, undefined);
      expect(out).not.toMatch(/bearer\s+\S{6,}/i);
      expect(out).toContain('[REDACTED]');
    }
  });

  it('un texto sin credenciales queda igual', () => {
    expect(redactSecrets('generación terminada en 12 s', undefined)).toBe('generación terminada en 12 s');
  });
});
