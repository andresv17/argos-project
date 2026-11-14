import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**
 * D-T271-2 (decisión de Neo, opción b): POST /api/backup/export sin sesión → 401 ERR-AUTH-UNAUTHENTICATED y la base
 * queda igual (REQ-BACKUP2-001, REQ-RBAC-001).
 *
 * @implements REQ-BACKUP2-001, REQ-RBAC-001, ERR-AUTH-UNAUTHENTICATED
 */
let api: Api;
afterEach(async () => api.close());

describe('exportación sin sesión (D-T271-2)', () => {
  it('[REQ-BACKUP2-001][ERR-AUTH-UNAUTHENTICATED] sin sesión → 401 y base sin cambios', async () => {
    api = await createApi();
    const before = api.dump();
    const r = await api.call('POST', '/api/backup/export', {});
    expect([problemOf(r), api.dump() === before]).toEqual([{ status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' }, true]);
  });
});
