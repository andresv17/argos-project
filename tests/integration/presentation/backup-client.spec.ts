import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256HexOfBytes } from '../../../src/domain/audit/sha256.ts';
import { createWebApi, CSRF_PARAMS, type ApiClient } from '../../../src/presentation/web/api.ts';
import { fileDigestOf, importBackupFile, requestBackupExport } from '../../../src/presentation/web/pages/BackupPage.tsx';
import { PASSWORDS } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from '../api/api-harness.ts';

/** [REQ-UI-004][REQ-BACKUP2-001][REQ-BACKUP2-002] La SPA exporta con POST y X-Argos-Request, lee el token e importa con el fileDigest. */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

interface Seen {
  readonly method: string;
  readonly path: string;
  readonly csrf: string | null;
  readonly confirm: string | null;
}

async function client(seen: Seen[]): Promise<ApiClient> {
  api = await createApi();
  await api.app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = api.app.server.address() as AddressInfo;
  const c = createWebApi(`http://127.0.0.1:${port}/api`);
  const login = await c.POST('/auth/login', { params: CSRF_PARAMS, body: { username: 'andres', password: PASSWORDS['andres']! } });
  const cookie = (login.response.headers.get('set-cookie') ?? '').split(';')[0]!;
  c.use({
    onRequest({ request }) {
      request.headers.set('cookie', cookie);
      seen.push({
        method: request.method,
        path: new URL(request.url).pathname,
        csrf: request.headers.get('X-Argos-Request'),
        confirm: request.headers.get('X-Argos-Import-Confirm'),
      });
      return request;
    },
  });
  return c;
}

describe('cliente de respaldo de la SPA (T271, T272)', () => {
  it('[REQ-BACKUP2-001] exporta con POST y X-Argos-Request: 1, sin GET, y lee el token de X-Argos-Confirmation-Token', async () => {
    const seen: Seen[] = [];
    const c = await client(seen);
    const out = await requestBackupExport(c);
    const calls = seen.filter((s) => s.path.endsWith('/backup/export'));
    expect([calls.map((s) => [s.method, s.csrf]), out.token.length > 0, out.fileName.endsWith('.json'), (await out.blob.text()).includes(out.token)]).toEqual([
      [['POST', '1']],
      true,
      true,
      false,
    ]);
  });

  it('[REQ-BACKUP2-002] importa enviando en X-Argos-Import-Confirm el SHA-256 hexadecimal en minúsculas de los bytes del archivo', async () => {
    const seen: Seen[] = [];
    const c = await client(seen);
    const text = await (await requestBackupExport(c)).blob.text();
    const file = new Blob([text], { type: 'application/json' });
    const expected = sha256HexOfBytes(new TextEncoder().encode(text));
    const result = await importBackupFile(c, file);
    const imp = seen.filter((s) => s.path.endsWith('/backup/import'));
    expect([imp.map((s) => [s.method, s.confirm]), result.sourceSchemaVersion, await fileDigestOf(await file.arrayBuffer())]).toEqual([
      [['POST', expected]],
      '3.0.0',
      expected,
    ]);
  });
});
