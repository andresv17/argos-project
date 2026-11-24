import { Gaxios, type GaxiosOptions, type GaxiosResponse } from 'gaxios';
import { GoogleAuth } from 'google-auth-library';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MediaStorageUnavailableError, type MediaStoragePort } from '../../../src/application/ports/media-storage.port.ts';
import { GcsMediaStorageAdapter, createGcsStorage } from '../../../src/infrastructure/adapters/gcs-media-storage.adapter.ts';
import { MemoryMediaStorageAdapter } from '../../../src/infrastructure/adapters/memory-media-storage.adapter.ts';
import { startGcsHttpDouble, type GcsHttpDouble } from '../../fixtures/gcs-http-double.ts';

/**
 * T570 (REQ-GCS-003, INV-ARC-003, INV-ARC-004, SC-ALM-010, SC-ALM-024): batería de conformidad del MediaStoragePort contra el adaptador
 * de memoria y contra el de GCS (SDK oficial) con un doble HTTP de la API JSON. Más las garantías propias de GCS: URL V4 por host
 * virtual, firma por `signBlob` sin llaves y errores saneados (C-7).
 */
const BUCKET = 'argos-test-media';
const PET = '3f1c0a52-7d3e-4b8a-9a61-0c2f4d5e6a71';
const ID_A = '8b2d9c10-5e47-4f3a-a1b6-7c9d0e1f2a34';
const ID_B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ID_C = '2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e';
const key = (id: string, folder = 'files'): string => `pets/${PET}/${folder}/${id}`;
const NOW = new Date('2099-11-17T12:00:00.000Z');
const SIGNER = 'argos-run@argos-test.iam.gserviceaccount.com';

class FakeAuth extends GoogleAuth {
  public readonly signed: string[] = [];
  public failWith: string | null = null;
  override async sign(blobToSign: string): Promise<string> {
    this.signed.push(blobToSign);
    if (this.failWith !== null) throw new Error(this.failWith);
    return Buffer.from('firma-de-prueba').toString('base64');
  }
  /** El SDK siempre pasa por authClient.request; el doble no pide token: se hace la petición HTTP tal cual. */
  override async request<T>(options: GaxiosOptions): Promise<GaxiosResponse<T>> {
    return new Gaxios().request<T>(options);
  }
  override async getCredentials(): Promise<{ client_email: string }> {
    return { client_email: SIGNER };
  }
}

let double: GcsHttpDouble;
const auth = new FakeAuth();
beforeAll(async () => {
  double = await startGcsHttpDouble(BUCKET);
});
afterAll(async () => {
  await double.close();
});
beforeEach(() => {
  double.objects.clear();
  double.requests.length = 0;
  double.failWith = null;
  auth.signed.length = 0;
  auth.failWith = null;
});

const adapters: ReadonlyArray<readonly [string, () => MediaStoragePort]> = [
  ['memory', () => new MemoryMediaStorageAdapter({ now: () => NOW })],
  ['gcs', () => new GcsMediaStorageAdapter({ storage: createGcsStorage({ apiEndpoint: double.endpoint, projectId: 'argos-test', authClient: auth, autoRetry: false }), bucket: BUCKET, now: () => NOW })],
];

describe.each(adapters)('MediaStoragePort: conformidad (%s)', (_name, create) => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);

  it('put y get devuelven los mismos bytes y el tipo (binario completo 0..255)', async () => {
    const port = create();
    await port.put(key(ID_A), bytes, 'application/pdf');
    const found = await port.get(key(ID_A));
    expect([Array.from(found?.bytes ?? []), found?.contentType]).toEqual([Array.from(bytes), 'application/pdf']);
  });

  it('get de un objeto inexistente devuelve null', async () => {
    expect(await create().get(key(ID_A))).toBeNull();
  });

  it('put sobre una clave existente la reemplaza', async () => {
    const port = create();
    await port.put(key(ID_A), Uint8Array.from([1, 2, 3]), 'image/png');
    await port.put(key(ID_A), Uint8Array.from([9]), 'image/jpeg');
    const found = await port.get(key(ID_A));
    expect([Array.from(found?.bytes ?? []), found?.contentType]).toEqual([[9], 'image/jpeg']);
  });

  it('delete elimina; delete de un inexistente es éxito (idempotente) y repetirlo también', async () => {
    const port = create();
    await port.put(key(ID_A), bytes, 'image/png');
    await port.delete(key(ID_A));
    await expect(port.delete(key(ID_A))).resolves.toBeUndefined();
    await expect(port.delete(key(ID_B))).resolves.toBeUndefined();
    expect(await port.get(key(ID_A))).toBeNull();
  });

  it('list(prefix) devuelve clave y fecha de creación UTC, solo del prefijo, ordenado por clave y a través de varias páginas', async () => {
    const port = create();
    for (const id of [ID_C, ID_A, ID_B]) await port.put(key(id), Uint8Array.from([1]), 'image/png');
    await port.put(key(ID_A, 'photos'), Uint8Array.from([1]), 'image/png');
    await port.put(key(ID_B, 'avatar'), Uint8Array.from([1]), 'image/png');
    const listed = await port.list(`pets/${PET}/files/`);
    expect(listed.map((e) => e.key)).toEqual([key(ID_B), key(ID_C), key(ID_A)]);
    for (const entry of listed) expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await port.list('pets/')).length).toBe(5);
    expect(await port.list('pets/00000000-0000-4000-8000-000000000000/')).toEqual([]);
  });

  it('createReadUrl devuelve url y expiresAt = ahora + ttl', async () => {
    const port = create();
    await port.put(key(ID_A, 'photos'), bytes, 'image/jpeg');
    const result = await port.createReadUrl({ key: key(ID_A, 'photos'), contentType: 'image/jpeg', filename: 'foto.jpg', ttlSeconds: 300 });
    expect([typeof result.url, result.expiresAt]).toEqual(['string', '2099-11-17T12:05:00.000Z']);
  });

  it.each([29, 901, 0, -1, 30.5, Number.NaN])('createReadUrl rechaza un ttl fuera de 30-900 (%s)', async (ttlSeconds) => {
    await expect(create().createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds })).rejects.toThrow(RangeError);
  });

  it.each(['', 'a"b.pdf', 'a\r\nb.pdf', 'a/b.pdf', '../x.pdf', 'Análisis Luna.pdf', 'a;b.pdf', 'x'.repeat(65)])('createReadUrl rechaza el nombre no neutro %j', async (filename) => {
    await expect(create().createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename, ttlSeconds: 300 })).rejects.toThrow(RangeError);
  });

  it.each(['', 'x', '../x', `pets/${PET}/files/${ID_A}.pdf`, `pets/${PET}/files/Análisis Luna.pdf`, `/pets/${PET}/files/${ID_A}`, `pets/${PET}/docs/${ID_A}`])('toda operación rechaza la clave no válida %j sin repetirla', async (bad) => {
    const port = create();
    const calls: Array<() => Promise<unknown>> = [
      () => port.put(bad, bytes, 'image/png'),
      () => port.get(bad),
      () => port.delete(bad),
      () => port.createReadUrl({ key: bad, contentType: 'image/png', filename: 'foto.png', ttlSeconds: 300 }),
    ];
    for (const call of calls) {
      const error = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(RangeError);
      expect((error as Error).message).not.toContain(bad === '' ? '\u0000' : bad);
    }
    expect(double.requests).toEqual([]);
  });

  it('T1168 (008, REQ-UX8-002, SC-008-036): createReadUrl con disposition attachment acepta SOLO el nombre fijo argos-hogar-AAAA-MM-DD.png|jpg|webp (enmienda N2 JPEG de REQ-ESC6-035) y rechaza cualquier otro (incluido el neutro y nombres con PII)', async () => {
    const port = create();
    const sceneKey = `scenes/${PET}/images/${ID_A}`;
    await port.put(sceneKey, bytes, 'image/png');
    const ok = await port.createReadUrl({ key: sceneKey, contentType: 'image/png', filename: 'argos-hogar-2026-11-05.png', ttlSeconds: 300, disposition: 'attachment' });
    expect([typeof ok.url, ok.expiresAt]).toEqual(['string', '2099-11-17T12:05:00.000Z']);
    for (const extension of ['jpg', 'webp']) {
      await expect(port.createReadUrl({ key: sceneKey, contentType: 'image/png', filename: `argos-hogar-2026-11-05.${extension}`, ttlSeconds: 300, disposition: 'attachment' }), extension).resolves.toMatchObject({ expiresAt: '2099-11-17T12:05:00.000Z' });
    }
    for (const bad of ['escena.png', 'argos-hogar-2026-11-05.gif', 'argos-hogar-2026-11-05.jpeg', 'argos-hogar-Luna-2026-11-05.png', 'argos-hogar-2026-11-5.png', 'argos-hogar-2026-11-05.png"; x=1', '../argos-hogar-2026-11-05.png']) {
      await expect(port.createReadUrl({ key: sceneKey, contentType: 'image/png', filename: bad, ttlSeconds: 300, disposition: 'attachment' }), bad).rejects.toBeInstanceOf(RangeError);
    }
  });

  it('T1168 (008, REQ-UX8-002): el nombre fijo de la descarga no sirve en lectura inline (INV-ARC-004 se conserva) y disposition inline equivale a omitirla', async () => {
    const port = create();
    await port.put(key(ID_A), bytes, 'application/pdf');
    await expect(port.createReadUrl({ key: key(ID_A), contentType: 'image/png', filename: 'argos-hogar-2026-11-05.png', ttlSeconds: 300 })).rejects.toBeInstanceOf(RangeError);
    await expect(port.createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300, disposition: 'inline' })).resolves.toMatchObject({ expiresAt: '2099-11-17T12:05:00.000Z' });
  });

  it('T811 (006, N2-06 (b)): scenes/ y households/ son claves válidas: put, get, list por prefijo (ordenado, sin mezclarse con pets/), createReadUrl y delete idempotente', async () => {
    const port = create();
    const sceneKey = `scenes/${PET}/images/${ID_A}`;
    const otherScene = `scenes/${PET}/images/${ID_B}`;
    const photoKey = `households/${PET}/photo/${ID_C}`;
    await port.put(sceneKey, bytes, 'image/png');
    await port.put(otherScene, Uint8Array.from([7]), 'image/webp');
    await port.put(photoKey, Uint8Array.from([8]), 'image/png');
    await port.put(key(ID_A), Uint8Array.from([1]), 'application/pdf');
    const found = await port.get(sceneKey);
    expect([Array.from(found?.bytes ?? []), found?.contentType]).toEqual([Array.from(bytes), 'image/png']);
    expect((await port.list('scenes/')).map((e) => e.key)).toEqual([otherScene, sceneKey]);
    expect((await port.list(`scenes/${PET}/images/`)).length).toBe(2);
    expect((await port.list('households/')).map((e) => e.key)).toEqual([photoKey]);
    expect((await port.list('pets/')).map((e) => e.key)).toEqual([key(ID_A)]);
    const read = await port.createReadUrl({ key: photoKey, contentType: 'image/png', filename: 'foto.png', ttlSeconds: 300 });
    expect([typeof read.url, read.expiresAt]).toEqual(['string', '2099-11-17T12:05:00.000Z']);
    await port.delete(sceneKey);
    await expect(port.delete(sceneKey)).resolves.toBeUndefined();
    expect(await port.get(sceneKey)).toBeNull();
    expect((await port.list('scenes/')).map((e) => e.key)).toEqual([otherScene]);
  });

  it('T811 (006): una clave de escena con carpeta ajena o recorrido sigue rechazada con RangeError', async () => {
    const port = create();
    for (const bad of [`scenes/${PET}/files/${ID_A}`, `households/${PET}/images/${ID_A}`, `scenes/${PET}/images/${ID_A}.png`, `scenes/../images/${ID_A}`]) {
      await expect(port.put(bad, bytes, 'image/png'), bad).rejects.toBeInstanceOf(RangeError);
    }
    await expect(port.list('scenes/..')).rejects.toBeInstanceOf(RangeError);
  });
});

describe('adaptador de memoria (T571)', () => {
  it('createReadUrl apunta a la ruta de desarrollo /__dev/media/<clave>', async () => {
    const port = new MemoryMediaStorageAdapter({ now: () => NOW });
    const { url } = await port.createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300 });
    expect(url).toBe(`/__dev/media/${key(ID_A)}`);
  });

  it('T1168 (008, REQ-UX8-002, SC-008-037): con attachment la ruta de desarrollo lleva response-content-disposition con el nombre fijo; inline no cambia la URL', async () => {
    const port = new MemoryMediaStorageAdapter({ now: () => NOW });
    const attachment = await port.createReadUrl({ key: key(ID_A), contentType: 'image/png', filename: 'argos-hogar-2026-11-05.png', ttlSeconds: 300, disposition: 'attachment' });
    const inline = await port.createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300, disposition: 'inline' });
    const parsed = new URL(attachment.url, 'http://localhost');
    expect([parsed.pathname, parsed.searchParams.get('response-content-disposition'), inline.url]).toEqual([
      `/__dev/media/${key(ID_A)}`, 'attachment; filename="argos-hogar-2026-11-05.png"', `/__dev/media/${key(ID_A)}`,
    ]);
  });

  it('el estado guardado es una copia: mutar el arreglo original no altera el objeto', async () => {
    const port = new MemoryMediaStorageAdapter({ now: () => NOW });
    const source = Uint8Array.from([1, 2, 3]);
    await port.put(key(ID_A), source, 'image/png');
    source[0] = 99;
    const found = await port.get(key(ID_A));
    found!.bytes[1] = 77;
    expect(Array.from((await port.get(key(ID_A)))!.bytes)).toEqual([1, 2, 3]);
  });

  it('list usa la fecha de creación de la primera escritura (put posterior no la cambia)', async () => {
    let at = new Date('2099-11-17T10:00:00.000Z');
    const port = new MemoryMediaStorageAdapter({ now: () => at });
    await port.put(key(ID_A), Uint8Array.from([1]), 'image/png');
    at = new Date('2099-11-17T11:00:00.000Z');
    await port.put(key(ID_A), Uint8Array.from([2]), 'image/png');
    expect((await port.list('pets/')).map((e) => e.createdAt)).toEqual(['2099-11-17T10:00:00.000Z']);
  });
});

describe('adaptador GCS (T572)', () => {
  const gcs = (): GcsMediaStorageAdapter => new GcsMediaStorageAdapter({ storage: createGcsStorage({ apiEndpoint: double.endpoint, projectId: 'argos-test', authClient: auth, autoRetry: false }), bucket: BUCKET, now: () => NOW });

  it('URL V4 GET por host virtual con X-Goog-Expires igual al TTL, tipo y disposición inline con nombre neutro firmados', async () => {
    const { url, expiresAt } = await gcs().createReadUrl({ key: key(ID_A, 'photos'), contentType: 'image/webp', filename: 'foto.webp', ttlSeconds: 300 });
    const parsed = new URL(url);
    expect([parsed.protocol, parsed.host, parsed.pathname]).toEqual(['https:', `${BUCKET}.storage.googleapis.com`, `/${key(ID_A, 'photos')}`]);
    expect(parsed.searchParams.get('X-Goog-Algorithm')).toBe('GOOG4-RSA-SHA256');
    expect(parsed.searchParams.get('X-Goog-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Goog-Date')).toBe('20991117T120000Z');
    expect(parsed.searchParams.get('X-Goog-SignedHeaders')).toBe('host');
    expect(parsed.searchParams.get('X-Goog-Credential')).toBe(`${SIGNER}/20991117/auto/storage/goog4_request`);
    expect(parsed.searchParams.get('response-content-type')).toBe('image/webp');
    expect(parsed.searchParams.get('response-content-disposition')).toBe('inline; filename="foto.webp"');
    expect(parsed.searchParams.get('X-Goog-Signature')).toBe(Buffer.from('firma-de-prueba').toString('hex'));
    expect(expiresAt).toBe('2099-11-17T12:05:00.000Z');
  });

  it('T1168 (008, REQ-UX8-002, SC-008-037, 006 3.5.0): con attachment la URL V4 firma response-content-disposition attachment con argos-hogar-AAAA-MM-DD.png; sin él sigue inline', async () => {
    const attachment = await gcs().createReadUrl({ key: key(ID_A, 'photos'), contentType: 'image/png', filename: 'argos-hogar-2026-11-05.png', ttlSeconds: 300, disposition: 'attachment' });
    const inline = await gcs().createReadUrl({ key: key(ID_A, 'photos'), contentType: 'image/png', filename: 'foto.png', ttlSeconds: 300 });
    const a = new URL(attachment.url).searchParams;
    expect([a.get('response-content-disposition'), a.get('response-content-type'), a.get('X-Goog-Expires'), a.get('X-Goog-SignedHeaders')]).toEqual([
      'attachment; filename="argos-hogar-2026-11-05.png"', 'image/png', '300', 'host',
    ]);
    expect(new URL(inline.url).searchParams.get('response-content-disposition')).toBe('inline; filename="foto.png"');
  });

  it('el TTL máximo (900) y el mínimo (30) llegan a X-Goog-Expires', async () => {
    const urls = await Promise.all([30, 900].map((ttlSeconds) => gcs().createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds })));
    expect(urls.map((r) => new URL(r.url).searchParams.get('X-Goog-Expires'))).toEqual(['30', '900']);
  });

  it('firma por signBlob sin llaves: una sola llamada a sign() con el bloque GOOG4-RSA-SHA256, sin tráfico al bucket y sin credenciales en la URL', async () => {
    const { url } = await gcs().createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300 });
    expect(auth.signed.length).toBe(1);
    expect(auth.signed[0]?.split('\n')[0]).toBe('GOOG4-RSA-SHA256');
    expect(double.requests).toEqual([]);
    expect(url).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY|access_token|GoogleAccessId=/);
  });

  it('el nombre original nunca llega a la URL: solo el nombre neutro', async () => {
    const { url } = await gcs().createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300 });
    expect(decodeURIComponent(url)).not.toMatch(/An.lisis|Luna/);
    expect(decodeURIComponent(url)).toContain('filename="archivo.pdf"');
  });

  it('put usa carga no reanudable y get consulta metadatos y contenido en el bucket configurado', async () => {
    const port = gcs();
    await port.put(key(ID_A), Uint8Array.from([1, 2]), 'image/png');
    await port.get(key(ID_A));
    const methods = double.requests.map((r: { method: string; path: string }) => `${r.method} ${r.path.replace(/\/o\/.*/, '/o/…')}`);
    expect(methods[0]).toBe(`POST /upload/storage/v1/b/${BUCKET}/o`);
    expect(methods.slice(1).every((m) => m.includes(`/b/${BUCKET}/o/`))).toBe(true);
    expect([...double.objects.keys()]).toEqual([key(ID_A)]);
  });

  it.each([
    ['put', (p: MediaStoragePort) => p.put(key(ID_A), Uint8Array.from([1]), 'image/png')],
    ['get', (p: MediaStoragePort) => p.get(key(ID_A))],
    ['delete', (p: MediaStoragePort) => p.delete(key(ID_A))],
    ['list', (p: MediaStoragePort) => p.list('pets/')],
  ] as const)('un fallo del almacenamiento en %s lanza MediaStorageUnavailableError sin clave, URL ni X-Goog (C-7, SC-ALM-024)', async (operation, run) => {
    double.objects.set(key(ID_A), { bytes: Buffer.from([1]), contentType: 'image/png', timeCreated: NOW.toISOString() });
    double.failWith = 500;
    const error = await run(gcs()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MediaStorageUnavailableError);
    expect((error as MediaStorageUnavailableError).operation).toBe(operation);
    const dump = JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack, own: Object.getOwnPropertyNames(error), cause: (error as Error).cause, json: JSON.stringify(error) });
    expect(dump).not.toMatch(/pets\/|X-Goog|deadbeef|iam\.gserviceaccount|127\.0\.0\.1|backend error/i);
    expect((error as Error).cause).toBeUndefined();
  });

  it('un fallo de signBlob lanza MediaStorageUnavailableError sin la firma ni la clave', async () => {
    auth.failWith = `iamcredentials 500 X-Goog-Signature=zzz object=${key(ID_A)} svc=${SIGNER}`;
    const error = await gcs()
      .createReadUrl({ key: key(ID_A), contentType: 'application/pdf', filename: 'archivo.pdf', ttlSeconds: 300 })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(MediaStorageUnavailableError);
    expect((error as MediaStorageUnavailableError).operation).toBe('createReadUrl');
    expect(JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack, cause: (error as Error).cause })).not.toMatch(/pets\/|X-Goog|zzz|iam\.gserviceaccount|iamcredentials/i);
  });

  it('la conexión rechazada también es no disponible, sin la dirección', async () => {
    const dead = new GcsMediaStorageAdapter({ storage: createGcsStorage({ apiEndpoint: 'http://127.0.0.1:1', projectId: 'argos-test', authClient: auth, autoRetry: false }), bucket: BUCKET, now: () => NOW });
    const error = await dead.get(key(ID_A)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MediaStorageUnavailableError);
    expect(JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack })).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|pets\//);
  });

  it('un nombre de bucket no válido se rechaza al construir', () => {
    expect(() => new GcsMediaStorageAdapter({ storage: createGcsStorage({ apiEndpoint: double.endpoint, projectId: 'p', authClient: auth, autoRetry: false }), bucket: 'Bucket Malo', now: () => NOW })).toThrow(RangeError);
  });
});
