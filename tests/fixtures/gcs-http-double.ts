import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Doble HTTP mínimo de la API JSON de GCS (T570): subida multipart, metadatos, descarga, borrado y listado paginado de 2 en 2.
 * Registra cada petición (método y ruta) para comprobar qué hizo el adaptador. `failWith` simula un almacenamiento caído con un
 * cuerpo que filtraría la clave y parámetros firmados si el adaptador lo propagara.
 */
export interface DoubleObject {
  bytes: Buffer;
  contentType: string;
  timeCreated: string;
}

export interface GcsHttpDouble {
  readonly endpoint: string;
  readonly objects: Map<string, DoubleObject>;
  readonly requests: Array<{ method: string; path: string }>;
  failWith: number | null;
  close(): Promise<void>;
}

const LEAKY_BODY = (name: string): string => JSON.stringify({ error: { code: 500, message: `backend error for ${name} X-Goog-Signature=deadbeef X-Goog-Credential=svc@x.iam.gserviceaccount.com` } });

async function bodyOf(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function parseMultipartRelated(body: Buffer, contentType: string): { name: string | undefined; contentType: string; bytes: Buffer } {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const marker = Buffer.from(`--${boundary?.[1] ?? boundary?.[2] ?? ''}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(body.subarray(start + marker.length, next));
    start = next;
  }
  const split = (part: Buffer): { headers: string; content: Buffer } => {
    const at = part.indexOf('\r\n\r\n');
    return { headers: part.subarray(0, at).toString('latin1'), content: part.subarray(at + 4, part.length - 2) };
  };
  const meta = JSON.parse(split(parts[0]!).content.toString('utf8')) as { name?: string; contentType?: string };
  const media = split(parts[1]!);
  const mediaType = /content-type:\s*([^\r\n]+)/i.exec(media.headers)?.[1] ?? 'application/octet-stream';
  return { name: meta.name, contentType: meta.contentType ?? mediaType, bytes: media.content };
}

export async function startGcsHttpDouble(bucket: string): Promise<GcsHttpDouble> {
  const objects = new Map<string, DoubleObject>();
  const requests: GcsHttpDouble['requests'] = [];
  const state = { failWith: null as number | null };
  const resource = (name: string, object: DoubleObject): Record<string, string> => ({
    kind: 'storage#object',
    bucket,
    name,
    id: `${bucket}/${name}/1`,
    generation: '1',
    contentType: object.contentType,
    size: String(object.bytes.length),
    md5Hash: createHash('md5').update(object.bytes).digest('base64'),
    timeCreated: object.timeCreated,
    updated: object.timeCreated,
  });
  const json = (response: ServerResponse, status: number, payload: unknown): void => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  };
  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://double');
    const method = request.method ?? 'GET';
    requests.push({ method, path: url.pathname });
    const body = await bodyOf(request);
    const objectPath = new RegExp(`^/(?:storage/v1|download/storage/v1)/b/${bucket}/o/(.+)$`).exec(url.pathname);
    if (state.failWith !== null) {
      response.writeHead(state.failWith, { 'content-type': 'application/json' });
      response.end(LEAKY_BODY(objectPath ? decodeURIComponent(objectPath[1]!) : 'x'));
      return;
    }
    if (method === 'POST' && url.pathname === `/upload/storage/v1/b/${bucket}/o`) {
      const parsed = parseMultipartRelated(body, String(request.headers['content-type'] ?? ''));
      const name = url.searchParams.get('name') ?? parsed.name ?? '';
      const stored: DoubleObject = { bytes: parsed.bytes, contentType: parsed.contentType, timeCreated: objects.get(name)?.timeCreated ?? new Date().toISOString() };
      objects.set(name, stored);
      json(response, 200, resource(name, stored));
      return;
    }
    if (objectPath !== null) {
      const name = decodeURIComponent(objectPath[1]!);
      const found = objects.get(name);
      if (method === 'DELETE') {
        if (found === undefined) return json(response, 404, { error: { code: 404, message: `No such object: ${bucket}/${name}` } });
        objects.delete(name);
        response.writeHead(204).end();
        return;
      }
      if (found === undefined) return json(response, 404, { error: { code: 404, message: `No such object: ${bucket}/${name}` } });
      if (url.searchParams.get('alt') === 'media') {
        response.writeHead(200, { 'content-type': found.contentType, 'content-length': String(found.bytes.length), 'x-goog-hash': `md5=${createHash('md5').update(found.bytes).digest('base64')}` });
        response.end(found.bytes);
        return;
      }
      return json(response, 200, resource(name, found));
    }
    if (method === 'GET' && url.pathname === `/storage/v1/b/${bucket}/o`) {
      const prefix = url.searchParams.get('prefix') ?? '';
      const names = [...objects.keys()].filter((n) => n.startsWith(prefix)).sort();
      const offset = Number(url.searchParams.get('pageToken') ?? '0');
      const page = names.slice(offset, offset + 2);
      json(response, 200, { kind: 'storage#objects', items: page.map((n) => resource(n, objects.get(n)!)), ...(offset + 2 < names.length ? { nextPageToken: String(offset + 2) } : {}) });
      return;
    }
    json(response, 404, { error: { code: 404, message: 'ruta no soportada por el doble' } });
  };
  const server: Server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    objects,
    requests,
    get failWith() {
      return state.failWith;
    },
    set failWith(value: number | null) {
      state.failWith = value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
