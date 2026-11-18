/**
 * T750 [US4] pruebas de seguridad de la superficie pública del enlace veterinario (REQ-VET-006, REQ-VET-007, INV-005-001, INV-005-002; SC-005-016,
 * SC-005-020, SC-005-021, SC-005-026): enumeración, 404 uniforme, `Referer`, caché, IDOR entre alcances, verbos distintos de `GET` y cookie inerte.
 * Diseño de la suite: informe T703 de /trinity (`.specify/memory/audits/trinity-T703-amenazas-005.md`, §4).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../fixtures/application-harness.ts';
import { PDF } from '../fixtures/media-harness.ts';
import { createShareApi, type ShareApi } from '../fixtures/share-api-harness.ts';
import { HOUSEHOLD_ID, KEY } from '../fixtures/share-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());
const KIRA = '11111111-1111-4111-8111-111111111102';
const tokenOf = (url: unknown) => String(url).split('/shared/')[1]!;

async function link(cookie: string, path: string, n: number, body: unknown = {}) {
  const r = await api.call('POST', path, { cookie, body, headers: { 'idempotency-key': KEY(n) } });
  expect(r.status).toBe(201);
  return { id: (r.json as { link: { id: string } }).link.id, token: tokenOf((r.json as { url: string }).url) };
}

describe('T750 enumeración y 404 uniforme (REQ-VET-007, INV-005-007, SC-005-021)', () => {
  it('[SC-005-021] cinco clases de token fallido producen respuestas profundamente idénticas (código, cuerpo, cabeceras sin fecha) y la misma secuencia de puertos', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const expired = await link(cookie, `/api/pets/${ARGOS.id}/share-links`, 1, { expiresInDays: 1 });
    const revoked = await link(cookie, `/api/pets/${ARGOS.id}/share-links`, 2);
    await api.call('DELETE', `/api/share-links/${revoked.id}`, { cookie });
    api.clock.setClock('2026-11-19', '2026-11-19T12:00:00.000Z');
    const classes: Record<string, string> = { inexistente: 'a'.repeat(43), 'mal formado': 'b'.repeat(7), 'alfabeto inválido': '*'.repeat(43), vencido: expired.token, revocado: revoked.token };
    const seen: Array<{ label: string; status: number; body: unknown; headers: Record<string, unknown>; sequence: string[] }> = [];
    for (const [label, token] of Object.entries(classes)) {
      api.limiter.reset();
      api.calls.length = 0;
      const response = await api.publicGet(`/api/shared/${token}/summary`);
      const { date: _date, 'content-length': _len, ...stable } = response.headers as Record<string, unknown>;
      seen.push({ label, status: response.status, body: response.json, headers: stable, sequence: [...api.calls] });
    }
    for (const entry of seen) {
      expect(entry.status, entry.label).toBe(404);
      expect(entry.body, entry.label).toEqual(seen[0]!.body);
      expect(entry.headers, entry.label).toEqual(seen[0]!.headers);
      expect(entry.sequence, entry.label).toEqual(seen[0]!.sequence);
    }
  });

  it('[REQ-VET-007] fuerza bruta de tokens secuenciales desde una IP: tras 20 fallos todo es 429 aunque el token acierte; X-Forwarded-For falsificado no cambia la clave (trustProxy cerrado)', async () => {
    api = await createShareApi();
    const good = await link(await api.login('andres'), `/api/pets/${ARGOS.id}/share-links`, 1);
    const attempts = [];
    for (let n = 0; n < 25; n += 1) attempts.push((await api.publicGet(`/api/shared/${String(n).padStart(43, '0')}/summary`, { 'x-forwarded-for': `10.9.9.${n}` })).status);
    expect(attempts.slice(0, 20)).toEqual(Array(20).fill(404));
    expect(attempts.slice(20)).toEqual(Array(5).fill(429));
    expect((await api.publicGet(`/api/shared/${good.token}/summary`, { 'x-forwarded-for': '10.1.2.3' })).status).toBe(429);
  });
});

describe('T750 Referer, caché y cabeceras (REQ-VET-006, SC-005-020)', () => {
  it('[SC-005-020] con cualquier Referer o Origin la respuesta mantiene no-referrer, no-store y noindex; no hay CORS ni cookie', async () => {
    api = await createShareApi();
    const good = await link(await api.login('andres'), `/api/pets/${ARGOS.id}/share-links`, 1);
    for (const path of [`/api/shared/${good.token}/summary`, `/api/shared/${'k'.repeat(43)}/summary`]) {
      const r = await api.publicGet(path, { referer: 'https://evil.example/ataque', origin: 'https://evil.example' });
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(r.headers['etag']).toBeUndefined();
      expect(r.headers['last-modified']).toBeUndefined();
    }
    const conditional = await api.publicGet(`/api/shared/${good.token}/summary`, { 'if-none-match': '*', 'if-modified-since': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    expect(conditional.status).toBe(200);
  });

  it('[REQ-VET-006] la creación y el listado autenticados tampoco se almacenan en caché (no-store) y el Referrer-Policy global sigue siendo no-referrer', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const created = await api.call('POST', `/api/pets/${ARGOS.id}/share-links`, { cookie, body: {}, headers: { 'idempotency-key': KEY(1) } });
    const listed = await api.call('GET', `/api/pets/${ARGOS.id}/share-links`, { cookie });
    for (const r of [created, listed]) {
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
    }
  });
});

describe('T750 IDOR entre alcances (INV-005-001, SC-005-016, SC-005-026)', () => {
  it('[SC-005-016] un enlace PET de Argos no entrega a Kira por ninguna vía: no hay parámetro de mascota, query ni cabecera que cambie el alcance', async () => {
    api = await createShareApi();
    const good = await link(await api.login('andres'), `/api/pets/${ARGOS.id}/share-links`, 1);
    for (const suffix of [`?petId=${KIRA}`, `?pet=${KIRA}&householdId=${HOUSEHOLD_ID}`, '?scope=HOUSEHOLD', '?includeMicrochip=true&includeClinicalFiles=true']) {
      const r = await api.publicGet(`/api/shared/${good.token}/summary${suffix}`, { 'x-pet-id': KIRA, 'x-household-id': HOUSEHOLD_ID });
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.json);
      expect(text).not.toContain('Kira');
      expect((r.json as { summary: { pets: unknown[]; disclosure: unknown } }).summary.pets).toHaveLength(1);
      expect((r.json as { summary: { disclosure: unknown } }).summary.disclosure).toEqual({ microchipIncluded: false, clinicalFilesIncluded: false });
    }
    expect((await api.publicGet(`/api/shared/${good.token}/files/${KIRA}`)).status).toBe(404);
  });

  it('[SC-005-016][INV-005-002] kind PHOTO, el álbum y el avatar nunca se sirven por la ruta pública, ni con includeClinicalFiles; un FILE de otra mascota tampoco', async () => {
    api = await createShareApi();
    const PHOTO = '88888888-8888-4888-8888-888888888802';
    const OTHER = '88888888-8888-4888-8888-888888888803';
    await api.deps.uow.runInTransaction(async (r) => {
      await r.media.insert({ id: PHOTO, petId: ARGOS.id, kind: 'PHOTO', mime: 'image/png', sizeBytes: 64, originalName: 'f.png', createdAt: '2026-11-10T10:00:00.000Z' });
      await r.media.insert({ id: OTHER, petId: KIRA, kind: 'FILE', mime: 'application/pdf', sizeBytes: 64, originalName: 'k.pdf', createdAt: '2026-11-10T10:00:00.000Z' });
    });
    await api.storage.put(`pets/${KIRA}/files/${OTHER}`, PDF(32), 'application/pdf');
    const cookie = await api.login('andres');
    const good = await link(cookie, `/api/pets/${ARGOS.id}/share-links`, 1, { includeClinicalFiles: true });
    for (const mediaId of [PHOTO, OTHER, ARGOS.id]) {
      api.limiter.reset();
      expect((await api.publicGet(`/api/shared/${good.token}/files/${mediaId}`)).status, mediaId).toBe(404);
    }
    api.limiter.reset();
    expect(JSON.stringify((await api.publicGet(`/api/shared/${good.token}/summary`)).json)).not.toContain(PHOTO);
  });

  it('[SC-005-016][SC-005-026] el alcance sale de la ruta autenticada: crear un enlace de una mascota ajena o de un hogar ajeno es 404 y no deja fila', async () => {
    api = await createShareApi();
    const lucia = await api.login('lucia');
    expect((await api.call('POST', `/api/pets/${ARGOS.id}/share-links`, { cookie: lucia, body: { petId: ARGOS.id }, headers: { 'idempotency-key': KEY(1) } })).status).toBe(404);
    expect((await api.call('POST', `/api/households/${HOUSEHOLD_ID}/share-links`, { cookie: lucia, body: {}, headers: { 'idempotency-key': KEY(2) } })).status).toBe(404);
    expect((await api.call('GET', `/api/pets/${ARGOS.id}/clinical-summary`, { cookie: lucia })).status).toBe(404);
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(0);
  });
});

describe('T750 verbos y cookie inerte (REQ-VET-006, INV-005-002, SC-005-020)', () => {
  it('[SC-005-020] POST, PUT, PATCH, DELETE, HEAD y OPTIONS no cambian nada y devuelven el 404 uniforme, también con X-Argos-Request y con cuerpo', async () => {
    api = await createShareApi();
    const good = await link(await api.login('andres'), `/api/pets/${ARGOS.id}/share-links`, 1);
    const before = api.dump();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE']) {
      for (const suffix of ['summary', `files/${KIRA}`]) {
        const r = await api.inject(method, `/api/shared/${good.token}/${suffix}`, { 'x-argos-request': '1' });
        expect(r.status, `${method} ${suffix}`).toBe(404);
        expect(r.headers['cache-control']).toBe('no-store');
      }
    }
    expect(api.dump()).toBe(before);
  });

  it('[SC-005-020] una cookie de sesión de otro usuario (o inválida) no cambia el resultado: no hay rama por sesión en la superficie pública', async () => {
    api = await createShareApi();
    const andres = await api.login('andres');
    const lucia = await api.login('lucia');
    const good = await link(andres, `/api/pets/${ARGOS.id}/share-links`, 1);
    const bodies = [];
    for (const cookie of [undefined, lucia, andres, 'argos_session=forjada']) {
      api.limiter.reset();
      const r = await api.publicGet(`/api/shared/${good.token}/summary`, cookie === undefined ? {} : { cookie });
      expect(r.status).toBe(200);
      bodies.push(JSON.stringify(r.json));
    }
    expect(new Set(bodies).size).toBe(1);
  });
});
