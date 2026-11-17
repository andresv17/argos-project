/**
 * T608 [US4] pruebas de subida a nivel de transporte HTTP (REQ-ARC-001; SC-ALM-005, SC-ALM-029; EDGE-019):
 *  - una conexión cortada a mitad o con `Content-Length` distinto de lo recibido recibe 400 del parser HTTP de Node/Fastify, sin `put` ni fila
 *    (error del transporte: NO es `ERR-SCHEMA-VALIDATION-FAILED`, que es del catálogo y responde 422);
 *  - un cuerpo de 32 MiB se corta en la lectura cerca de 10 MiB + 1 byte (413 sin `put`);
 *  - seis subidas simultáneas con límite de 4: las cuatro primeras avanzan y la quinta y la sexta reciben 429 `ERR-RATE-LIMITED`, con la memoria acotada.
 */
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, PDF } from '../../fixtures/media-harness.ts';
import { createApi, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const BASE = `/api/pets/${ARGOS.id}/media`;
const MIB = 1024 * 1024;

async function start(limits: Partial<typeof DEFAULT_LIMITS> = {}): Promise<{ port: number; cookie: string; storage: ControlledStorage; serverSockets: Socket[] }> {
  const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
  api = await createApi(undefined, { media: { storage, limits: { ...DEFAULT_LIMITS, ...limits } } });
  const cookie = await api.login('andres');
  const serverSockets: Socket[] = [];
  api.app.server.on('connection', (socket: Socket) => serverSockets.push(socket));
  await api.app.listen({ host: '127.0.0.1', port: 0 });
  return { port: (api.app.server.address() as { port: number }).port, cookie, storage, serverSockets };
}

function head(cookie: string, extra: string): string {
  return `POST ${BASE}?kind=FILE HTTP/1.1\r\nHost: x\r\nCookie: ${cookie}\r\nx-argos-request: 1\r\nx-argos-filename: a.pdf\r\ncontent-type: application/octet-stream\r\nconnection: close\r\n${extra}\r\n`;
}

/** Envía los fragmentos, cierra la escritura del cliente (media conexión) y devuelve la respuesta cruda del servidor hasta que cierra. */
function exchange(port: number, chunks: (Buffer | string)[], end: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = '';
    const socket = connect(port, '127.0.0.1', () => {
      for (const chunk of chunks) socket.write(chunk);
      if (end) socket.end();
    });
    socket.on('data', (data) => (received += data.toString('latin1')));
    socket.on('close', () => resolve(received));
    socket.on('error', () => resolve(received));
    setTimeout(() => {
      socket.destroy();
      reject(new Error('sin respuesta del servidor'));
    }, 5000).unref();
  });
}

const statusLine = (raw: string): string => raw.split('\r\n')[0] ?? '';

describe('T608 conexión cortada y Content-Length distinto de lo recibido (SC-ALM-029, EDGE-019)', () => {
  it('[SC-ALM-029] un cuerpo cortado a los 6 de 9 MiB (el cliente cierra su lado) recibe 400 del transporte HTTP, sin put ni fila', async () => {
    const { port, cookie, storage } = await start();
    const raw = await exchange(port, [head(cookie, `content-length: ${9 * MIB}\r\n`), Buffer.from(PDF(6 * MIB))], true);
    expect([statusLine(raw), raw.includes('ERR-SCHEMA-VALIDATION-FAILED'), await storage.keys(), storage.operations]).toEqual(['HTTP/1.1 400 Bad Request', false, [], []]);
  });

  it('[SC-ALM-029] un Content-Length mayor que lo enviado (cierre del cliente) recibe 400 del transporte y el servidor sigue atendiendo', async () => {
    const { port, cookie, storage } = await start();
    const raw = await exchange(port, [head(cookie, 'content-length: 5000\r\n'), Buffer.from(PDF(1200))], true);
    expect([statusLine(raw), raw.includes('ERR-SCHEMA-VALIDATION-FAILED'), await storage.keys()]).toEqual(['HTTP/1.1 400 Bad Request', false, []]);
    const after = await api.call('GET', BASE, { cookie });
    expect(after.status).toBe(200);
  });

  it('[SC-ALM-029] bytes de más que el Content-Length declarado no se suben: se sube solo lo enmarcado por el Content-Length y el sobrante es una petición mal formada (400)', async () => {
    const { port, cookie, storage } = await start();
    const pdf = Buffer.from(PDF(1200));
    const raw = await exchange(port, [head(cookie, `content-length: ${pdf.length - 200}\r\n`), pdf], true);
    // Primera petición: cuerpo recortado al Content-Length (el PDF solo se valida por firma) → un único put. El sobrante es otra petición mal
    // formada: el parser responde 400 (puede adelantarse a la respuesta de la primera) y nunca hay un segundo put.
    expect([raw.match(/HTTP\/1\.1 \d{3}/g)?.includes('HTTP/1.1 400'), storage.operations.length]).toEqual([true, 1]);
  });
});

describe('T608 corte de lectura y memoria acotada (SC-ALM-005, SC-ALM-029)', () => {
  it('[SC-ALM-005] un cuerpo de 32 MiB sin Content-Length (chunked) se corta cerca de 10 MiB + 1: 413 sin put y el servidor lee a lo sumo el tope más un margen de fragmentos', async () => {
    const { port, cookie, storage, serverSockets } = await start();
    const outcome = await new Promise<{ raw: string; written: number }>((resolve) => {
      let raw = '';
      let written = 0;
      const socket = connect(port, '127.0.0.1');
      socket.on('data', (data) => (raw += data.toString('latin1')));
      socket.on('close', () => resolve({ raw, written }));
      socket.on('error', () => undefined);
      socket.write(head(cookie, 'transfer-encoding: chunked\r\n'));
      const piece = Buffer.concat([Buffer.from(`${(64 * 1024).toString(16)}\r\n`), Buffer.alloc(64 * 1024, 0x41), Buffer.from('\r\n')]);
      const pump = (): void => {
        while (written < 32 * MIB && !socket.destroyed) {
          written += 64 * 1024;
          if (!socket.write(piece)) return void socket.once('drain', pump);
        }
        if (!socket.destroyed) socket.end('0\r\n\r\n');
      };
      pump();
      setTimeout(() => socket.destroy(), 4000).unref();
    });
    const read = serverSockets[0]?.bytesRead ?? Number.POSITIVE_INFINITY;
    // El servidor corta y cierra con el cuerpo sin leer: el cliente puede recibir un RST antes de leer la respuesta, así que el 413 solo se
    // observa si llegó; lo vinculante es que no hay put y que la lectura quedó acotada (el 413 con Content-Length declarado se prueba abajo).
    expect([['', 'HTTP/1.1 413 Payload Too Large'].includes(statusLine(outcome.raw)), storage.operations, outcome.written < 32 * MIB]).toEqual([true, [], true]);
    // Margen: cabeceras, enmarcado chunked y los fragmentos ya en vuelo en los búferes del núcleo (T609 acota la lectura del flujo).
    expect(read).toBeLessThanOrEqual(10 * MIB + 1 + 4 * MIB);
  });

  it('[SC-ALM-005] un Content-Length de 32 MiB se rechaza con 413 ERR-MEDIA-TOO-LARGE antes de leer el cuerpo (lectura de a lo sumo cabeceras) y sin put', async () => {
    const { port, cookie, storage, serverSockets } = await start();
    const raw = await exchange(port, [head(cookie, `content-length: ${32 * MIB}\r\n`)], false);
    expect([statusLine(raw), raw.includes('ERR-MEDIA-TOO-LARGE'), storage.operations, (serverSockets[0]?.bytesRead ?? 0) < 4096]).toEqual(['HTTP/1.1 413 Payload Too Large', true, [], true]);
  });

  it('[SC-ALM-029] seis subidas lentas de 10 MiB con límite de 4: cuatro avanzan, la quinta y la sexta reciben 429 ERR-RATE-LIMITED y la memoria no supera 4 × 10 MiB más el margen', async () => {
    const { port, cookie, storage } = await start({ maxConcurrentUploads: 4 });
    const baseline = process.memoryUsage().rss;
    let peak = baseline;
    const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 5);
    const body = Buffer.from(PDF(10 * MIB));
    const upload = (): Promise<string> =>
      new Promise((resolve) => {
        let raw = '';
        const socket = connect(port, '127.0.0.1', () => {
          socket.write(head(cookie, `content-length: ${body.length}\r\n`));
          // Mitad del cuerpo ahora; el resto tras un instante, para que las cuatro primeras sigan "en vuelo" cuando llegan la quinta y la sexta.
          socket.write(body.subarray(0, body.length / 2));
          setTimeout(() => socket.write(body.subarray(body.length / 2)), 300);
        });
        socket.on('data', (data) => (raw += data.toString('latin1')));
        socket.on('close', () => resolve(statusLine(raw)));
        socket.on('error', () => resolve(statusLine(raw)));
      });
    const firstFour = Array.from({ length: 4 }, upload);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const lastTwo = [upload(), upload()];
    const results = await Promise.all([...firstFour, ...lastTwo]);
    clearInterval(sampler);
    const tally = (code: string): number => results.filter((line) => line.includes(code)).length;
    expect([tally('201'), tally('429'), storage.operations.length]).toEqual([4, 2, 4]);
    // RSS acotada: 4 cuerpos de 10 MiB + copias transitorias del proceso (V8, Buffer, validación) con un margen amplio y fijo.
    expect(peak - baseline).toBeLessThanOrEqual(4 * 10 * MIB + 160 * MIB);
  }, 20_000);
});
