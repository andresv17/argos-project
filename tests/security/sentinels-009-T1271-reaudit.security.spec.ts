import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT_BLOCKS } from '../../src/domain/scene/prompt-blocks.ts';
import { ADMIN_EMAIL, OWN_ORIGIN, adminKit, adminLogin } from '../fixtures/admin-fixtures.ts';
import { canonicalState } from '../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../fixtures/media-harness.ts';
import { parameterKit } from '../fixtures/parameters-fixtures.ts';
import { sceneFixture } from '../fixtures/scene-services-fixtures.ts';
import { createApi, type Api, type ApiResponse } from '../integration/api/api-harness.ts';

/**
 * Reauditoría /sentinels T1271 (SEN-T1271-01 y SEN-T1271-02). Solo lectura sobre src/: prueba los casos de Origin y de bloques del prompt
 * que la suite previa no cubría. Un fallo es un HALLAZGO. Ningún caso debe escribir ni auditar cuando la respuesta es de rechazo.
 */

const NOW = '2026-11-23T12:00:00.000Z';
const ENABLED = 'scene.enabled';
const BLOCKS = 'scene.prompt.blocks';
const PUT_URL = `/api/admin/parameters/${encodeURIComponent(ENABLED)}`;
const RESET_URL = '/api/admin/parameters/scene-quota/reset';
const DUMMY_ETAG = '"abcdefgh01234567"';

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot() {
  const kit = adminKit([ADMIN_EMAIL]);
  const params = parameterKit();
  const fixture = sceneFixture({});
  const a = await createApi(canonicalState(), {
    admin: kit.admin,
    scene: fixture.services,
    media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS },
    platformParameters: params.port,
  });
  api = a;
  params.bind(a);
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  return { a, cookie: cookie! };
}

const snapshot = (a: Api): string => JSON.stringify(a.db.prepare('SELECT key, value, updated_at AS updatedAt, updated_by_user_id AS by FROM platform_parameters ORDER BY key').all());
const auditCount = (a: Api): number => (a.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_entries').get() as { n: number }).n;
const etagOf = async (a: Api, cookie: string): Promise<string> => {
  const r = await a.call('GET', '/api/admin/parameters', { cookie, contract: false });
  return (r.json as { items: { key: string; etag: string }[] }).items.find((i) => i.key === ENABLED)!.etag;
};
const put = (a: Api, cookie: string, value: string, etag: string, headers: Record<string, string>): Promise<ApiResponse> =>
  a.call('PUT', PUT_URL, { cookie, csrf: true, contract: false, raw: JSON.stringify({ value }), headers: { 'if-match': etag, ...headers } });

const BAD_ORIGINS = ['HTTP://LOCALHOST', 'http://LOCALHOST', 'Http://localhost', 'http://localhost/', 'http://localhost:8080', 'https://localhost', 'http://127.0.0.1', '', ' http://localhost', 'http://localhost.evil.example', 'null'];

describe('Reaudit SEN-T1271-01 - Origin en PUT y reinicio', () => {
  it('[O-1] Origin no exacto (mayúsculas, puerto ajeno, esquema ajeno, barra final, vacío, host parecido, null): 403 sin escribir ni auditar', async () => {
    const { a, cookie } = await boot();
    const before = snapshot(a);
    const audit = auditCount(a);
    const results: string[] = [];
    for (const origin of BAD_ORIGINS) {
      const r = await put(a, cookie, 'false', await etagOf(a, cookie), { origin });
      results.push(`${JSON.stringify(origin)}=${r.status}`);
      expect([origin, r.status]).toEqual([origin, 403]);
      const reset = await a.call('POST', RESET_URL, { cookie, csrf: true, contract: false, headers: { origin } });
      results.push(`reset ${JSON.stringify(origin)}=${reset.status}`);
      expect([origin, reset.status]).toEqual([origin, 403]);
    }
    expect(snapshot(a)).toBe(before);
    expect(auditCount(a)).toBe(audit);
    console.log('O-1 RESULTADOS', results.join(' | '));
  });

  it('[O-2] Referer ajeno SIN Origin: el código no lo verifica (solo Origin). Se registra el resultado real', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', PUT_URL, { cookie, csrf: true, contract: false, raw: JSON.stringify({ value: 'false' }), headers: { 'if-match': await etagOf(a, cookie), referer: 'https://evil.example/x' } });
    const reset = await a.call('POST', RESET_URL, { cookie, csrf: true, contract: false, headers: { referer: 'https://evil.example/x' } });
    console.log('O-2 RESULTADOS referer-only put=', r.status, 'reset=', reset.status);
  });

  it('[O-3] CONTROL: Origin propio exacto sigue en 200', async () => {
    const { a, cookie } = await boot();
    const r = await put(a, cookie, 'false', await etagOf(a, cookie), { origin: OWN_ORIGIN });
    expect(r.status).toBe(200);
  });

  it('[O-4] Métodos HEAD y OPTIONS sobre PUT y reinicio, con Origin ajeno y con sesión: sin escritura ni auditoría', async () => {
    const { a, cookie } = await boot();
    const before = snapshot(a);
    const audit = auditCount(a);
    const out: string[] = [];
    for (const method of ['HEAD', 'OPTIONS'] as const) {
      for (const url of [PUT_URL, RESET_URL]) {
        const r = await a.call(method, url, { cookie, csrf: true, contract: false, headers: { origin: 'https://evil.example', 'if-match': DUMMY_ETAG }, raw: JSON.stringify({ value: 'false' }) });
        out.push(`${method} ${url}=${r.status}`);
        expect(r.status).not.toBe(200);
      }
    }
    expect(snapshot(a)).toBe(before);
    expect(auditCount(a)).toBe(audit);
    console.log('O-4 RESULTADOS', out.join(' | '));
  });
});

const withBlock = (name: keyof typeof DEFAULT_PROMPT_BLOCKS, text: string): string => JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, [name]: text });

describe('Reaudit SEN-T1271-02 - caracteres de control y formato en bloques del prompt', () => {
  const RAW_BAD: Record<string, string> = {
    'U+FEFF (BOM)': '﻿',
    'U+200B (ZWSP)': '​',
    'U+202E (RLO)': '‮',
    'U+2066 (LRI)': '⁦',
    'U+2028 (LS)': ' ',
    'U+2029 (PS)': ' ',
    'U+0085 (NEL, C1)': '\u0085',
    'U+009F (C1)': '\u009F',
    'U+007F (DEL)': '\u007F',
    'U+0000 (NUL)': '\u0000',
    'U+200D (ZWJ)': '‍',
  };

  it('[B-1] bloques con formato/controles (raw en el valor): 422 y ninguna fila escrita', async () => {
    const { a, cookie } = await boot();
    const before = snapshot(a);
    const audit = auditCount(a);
    const out: string[] = [];
    for (const [label, ch] of Object.entries(RAW_BAD)) {
      for (const name of ['STYLE_BASE_TEXT', 'STYLE_CLOSING'] as const) {
        const value = withBlock(name, `texto ${ch} fin`);
        const r = await a.call('PUT', `/api/admin/parameters/${encodeURIComponent(BLOCKS)}`, { cookie, csrf: true, contract: false, raw: JSON.stringify({ value }), headers: { 'if-match': await etagOf2(a, cookie) } });
        out.push(`${label}/${name}=${r.status}`);
        expect([label, name, r.status]).toEqual([label, name, 422]);
      }
    }
    expect(snapshot(a)).toBe(before);
    expect(auditCount(a)).toBe(audit);
    console.log('B-1 RESULTADOS', out.join(' | '));
  });

  it('[B-2] mismos caracteres escapados en JSON (\\uFEFF, \\u200B, \\u202E) dentro del valor: 422 sin escribir', async () => {
    const { a, cookie } = await boot();
    const before = snapshot(a);
    const escaped = ['\\uFEFF', '\\u200B', '\\u202E', '\\u2028', '\\u0000'];
    const out: string[] = [];
    for (const esc of escaped) {
      const inner = `texto ${esc} fin`;
      const innerJson = JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, STYLE_BASE_TEXT: 'PH' }).replace('"PH"', `"texto ${esc} fin"`);
      expect(innerJson.includes(esc)).toBe(true);
      const raw = JSON.stringify({ value: innerJson });
      const r = await a.call('PUT', `/api/admin/parameters/${encodeURIComponent(BLOCKS)}`, { cookie, csrf: true, contract: false, raw, headers: { 'if-match': await etagOf2(a, cookie) } });
      out.push(`${esc}=${r.status}`);
      expect([inner, r.status]).toEqual([inner, 422]);
    }
    expect(snapshot(a)).toBe(before);
    console.log('B-2 RESULTADOS', out.join(' | '));
  });

  it('[B-3] CONTROL: bloque válido con tabulador y salto de línea (permitidos) y acentos: 200', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', `/api/admin/parameters/${encodeURIComponent(BLOCKS)}`, { cookie, csrf: true, contract: false, raw: JSON.stringify({ value: withBlock('STYLE_BASE_TEXT', 'línea uno\n\tlínea dos') }), headers: { 'if-match': await etagOf2(a, cookie) } });
    console.log('B-3 RESULTADOS control status=', r.status);
    expect(r.status).toBe(200);
  });
});

async function etagOf2(a: Api, cookie: string): Promise<string> {
  const r = await a.call('GET', '/api/admin/parameters', { cookie, contract: false });
  return (r.json as { items: { key: string; etag: string }[] }).items.find((i) => i.key === BLOCKS)!.etag;
}
