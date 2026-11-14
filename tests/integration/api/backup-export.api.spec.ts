import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { validateBackupEnvelopeV3 } from '../../../src/generated/index.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { ARGOS_ID, LUNA_ID } from './api-fixtures.ts';

/**
 * T271 (fase roja, Rebanada 5, REQ-BACKUP2-001): exportación 3.0.0 por POST con X-Argos-Request, solo mascotas
 * propias, token en la cabecera X-Argos-Confirmation-Token (nunca en el archivo) y límite de ritmo ERR-RATE-LIMITED.
 *
 * @implements REQ-BACKUP2-001, REQ-RBAC-001, REQ-ACC-002, ERR-RATE-LIMITED
 */
let api: Api;
afterEach(async () => api.close());

const EXPORT = '/api/backup/export';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const exportAs = (cookie: string | null, extra: { csrf?: boolean } = {}) =>
  api.call('POST', EXPORT, { ...(cookie === null ? {} : { cookie }), ...extra, ...(extra.csrf === false ? { contract: false } : {}) });

describe('exportación 3.0.0 por POST (REQ-BACKUP2-001)', () => {
  it('[REQ-BACKUP2-001] 200 con sobre 3.0.0 válido, Cache-Control no-store, nombre argos-backup-AAAA-MM-DD.json y sin userId en el archivo', async () => {
    api = await createApi();
    const r = await exportAs(await api.login('andres'));
    const envelope = r.json as { schemaVersion?: string; pets?: Array<Record<string, unknown>> } & Record<string, unknown>;
    expect([
      r.status,
      r.headers['cache-control'],
      r.headers['content-disposition'],
      envelope.schemaVersion,
      validateBackupEnvelopeV3(r.json),
      'exportedByUserId' in envelope,
      envelope.pets?.some((p) => 'ownerUserId' in p || 'userId' in p),
    ]).toEqual([200, 'no-store', 'attachment; filename="argos-backup-2026-11-05.json"', '3.0.0', true, false, false]);
  });

  it('[REQ-BACKUP2-001][REQ-ACC-002] el token viaja en X-Argos-Confirmation-Token (43 caracteres base64url) y NUNCA dentro del archivo', async () => {
    api = await createApi();
    const r = await exportAs(await api.login('andres'));
    const token = String(r.headers['x-argos-confirmation-token'] ?? '');
    expect([r.status, TOKEN_PATTERN.test(token), token !== '' && r.text.includes(token)]).toEqual([200, true, false]);
  });

  it('[REQ-ACC-002] en la base solo queda el SHA-256 del token, nunca el token en claro', async () => {
    api = await createApi();
    const r = await exportAs(await api.login('andres'));
    const token = String(r.headers['x-argos-confirmation-token'] ?? '');
    const digest = createHash('sha256').update(token).digest('hex');
    expect([r.status, token !== '' && api.dump().includes(token), api.dump().includes(digest)]).toEqual([200, false, true]);
  });

  it('[REQ-ACC-002] cada exportación emite un token nuevo que reemplaza al anterior', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const first = await exportAs(cookie);
    const second = await exportAs(cookie);
    const [a, b] = [first, second].map((r) => String(r.headers['x-argos-confirmation-token'] ?? ''));
    expect([first.status, second.status, TOKEN_PATTERN.test(a!), TOKEN_PATTERN.test(b!), a !== b]).toEqual([200, 200, true, true, true]);
  });
});

describe('solo mascotas propias y roles (REQ-BACKUP2-001, REQ-RBAC-001)', () => {
  it('[REQ-BACKUP2-001] Andrés exporta sus 5 mascotas y ni rastro de Luna; María exporta solo Luna', async () => {
    api = await createApi();
    const andres = await exportAs(await api.login('andres'));
    const maria = await exportAs(await api.login('maria.v'));
    const idsOf = (r: { json: unknown }) => (r.json as { pets: Array<{ id: string }> }).pets.map((p) => p.id);
    expect([
      andres.status,
      idsOf(andres).length,
      andres.text.includes(LUNA_ID),
      maria.status,
      idsOf(maria),
      maria.text.includes(ARGOS_ID),
    ]).toEqual([200, 5, false, 200, [LUNA_ID], false]);
  });

  it('[REQ-RBAC-001][REQ-BACKUP2-001] los cuatro roles de hogar exportan: 200 con archivo válido, aunque no tengan mascotas propias', async () => {
    api = await createApi();
    const out: Record<string, [number, boolean]> = {};
    for (const user of ['andres', 'maria.v', 'carlos_88', 'lucia.r']) {
      const r = await exportAs(await api.login(user));
      out[user] = [r.status, validateBackupEnvelopeV3(r.json)];
    }
    expect(out).toEqual({ andres: [200, true], 'maria.v': [200, true], carlos_88: [200, true], 'lucia.r': [200, true] });
  });

  it('[REQ-BACKUP2-001] un usuario sin mascotas propias obtiene un archivo 3.0.0 válido con pets vacío', async () => {
    api = await createApi();
    const r = await exportAs(await api.login('lucia.r'));
    expect([r.status, validateBackupEnvelopeV3(r.json), (r.json as { pets?: unknown[] }).pets]).toEqual([200, true, []]);
  });

  it('[REQ-BACKUP2-001] la exportación nunca incluye hogares, asignaciones, sesiones ni credenciales', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const r = await exportAs(cookie);
    const keys = Object.keys((r.json as Record<string, unknown>) ?? {}).sort();
    expect([r.status, keys, /household|assignment|session|password|hash/i.test(r.text), r.text.includes(cookie.split('=')[1]!)]).toEqual([
      200,
      ['exportedAt', 'pets', 'records', 'schemaVersion'],
      false,
      false,
    ]);
  });
});

describe('cabeceras y sesión (INV-AUTH-007, D-T271-1, D-T271-2)', () => {
  it('[INV-AUTH-007][D-T271-2] sin X-Argos-Request → 403 ERR-AUTH-CSRF-REJECTED y la base queda igual; sin sesión → 401', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = api.dump();
    const noCsrf = await exportAs(cookie, { csrf: false });
    const noSession = await exportAs(null);
    expect([problemOf(noCsrf), problemOf(noSession), api.dump() === before]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      true,
    ]);
  });

  it('[D-T271-1][REQ-BACKUP2-001] el GET heredado ya no exporta (el cambio de estado exige POST con CSRF)', async () => {
    api = await createApi();
    const r = await api.call('GET', EXPORT, { cookie: await api.login('andres'), contract: false });
    expect([404, 405]).toContain(r.status);
  });
});

describe('límite de ritmo de la exportación (ERR-RATE-LIMITED)', () => {
  it('[ERR-RATE-LIMITED] 5 exportaciones por ventana de 15 min; la 6.ª → 429 con Retry-After, sin token nuevo y la base sin cambios', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await exportAs(cookie)).status);
    const before = api.dump();
    const sixth = await exportAs(cookie);
    expect([statuses, problemOf(sixth), sixth.headers['x-argos-confirmation-token'], api.dump() === before]).toEqual([
      [200, 200, 200, 200, 200],
      { status: 429, code: 'ERR-RATE-LIMITED' },
      undefined,
      true,
    ]);
  });

  it('[ERR-RATE-LIMITED] el límite es por usuario: María exporta aunque Andrés ya agotó su cupo', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    for (let i = 0; i < 5; i += 1) await exportAs(andres);
    const maria = await exportAs(await api.login('maria.v'));
    expect(maria.status).toBe(200);
  });

  it('[ERR-RATE-LIMITED] pasada la ventana (15 min) el cupo se recupera', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    for (let i = 0; i < 5; i += 1) await exportAs(cookie);
    const blocked = await exportAs(cookie);
    api.clock.setClock('2026-11-05', '2026-11-05T12:16:00.000Z');
    const later = await exportAs(cookie);
    expect([blocked.status, later.status]).toEqual([429, 200]);
  });
});
