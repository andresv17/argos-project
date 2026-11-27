import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { DeterministicMalwareScannerAdapter, EICAR_TEST_STRING } from '../../../src/infrastructure/adapters/deterministic-malware-scanner.adapter.ts';
import { ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB_2, adminKit, adminLogin, type AdminKit } from '../../fixtures/admin-fixtures.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';

/**
 * T1636 (Feature 012, Bloque B, #23; `/keymaker`): rutas HTTP de reclamación y disputa de microchip y cola de arbitraje de `/admin` sobre la API real y SQLite. El OpenAPI de la 012 no está
 * cableado en el arnés de contrato de la 002/004, por eso las llamadas llevan `contract: false`.
 *
 * @implements REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-003, INV-CHP12-006, EDGE-012-043, SC-012-016, SC-012-019, SC-012-020, SC-012-104
 */
let api: Api;
let kit: AdminKit;
afterEach(async () => api.close());

const NC = { contract: false } as const;
const CHIP = '985112345678901';
const NOW = '2026-11-05T12:00:00.000Z';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const x of bytes) crc = crcTable[(crc ^ x) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
/** PNG válido mínimo 8x8 en escala de grises. */
function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(8)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const BOUNDARY = 'argosboundary7MA4YWxk';
/** Cuerpo multipart con un campo de texto opcional y archivos `evidence`. */
function form(parts: Array<{ name: string; value?: string; file?: Uint8Array; type?: string }>): Buffer {
  const out: Buffer[] = [];
  for (const part of parts) {
    out.push(Buffer.from(`--${BOUNDARY}\r\n`));
    if (part.file === undefined) out.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}\r\n`));
    else out.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"; filename="x"\r\nContent-Type: ${part.type ?? 'image/png'}\r\n\r\n`), Buffer.from(part.file), Buffer.from('\r\n'));
  }
  out.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(out);
}
const MULTIPART = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

async function setup(): Promise<{ andres: string; maria: string; petId: string }> {
  kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
  api = await createApi(canonicalState(), { admin: kit.admin, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS } });
  (api.deps as unknown as { malwareScanner: unknown }).malwareScanner = new DeterministicMalwareScannerAdapter();
  const andres = await api.login('andres');
  const maria = await api.login('maria.v');
  const created = await api.call('POST', '/api/pets', { cookie: maria, body: { ...NEW_PET, name: 'Luna', microchipId: CHIP } });
  expect(created.status).toBe(201);
  return { andres, maria, petId: String((created.json as { id: string }).id) };
}

describe('POST /api/chip-claims y GET /api/chip-requests (REQ-CHP12-003, INV-CHP12-003)', () => {
  it('[SC-012-016] 202 {status:RECEIVED} idéntico para chip libre, ocupado y propio; solo el ocupado deja fila, visible solo en «mis solicitudes» con chipLast4', async () => {
    const { andres, maria } = await setup();
    const free = await api.call('POST', '/api/chip-claims', { cookie: andres, body: { microchipId: '985112345678999' }, ...NC });
    const taken = await api.call('POST', '/api/chip-claims', { cookie: andres, body: { microchipId: CHIP, message: 'Es mía' }, ...NC });
    const own = await api.call('POST', '/api/chip-claims', { cookie: maria, body: { microchipId: CHIP }, ...NC });
    expect([free.status, taken.status, own.status]).toEqual([202, 202, 202]);
    expect([free.text, taken.text, own.text]).toEqual(['{"status":"RECEIVED"}', '{"status":"RECEIVED"}', '{"status":"RECEIVED"}']);
    expect(taken.headers['cache-control']).toBe('private, no-store');
    const mine = await api.call('GET', '/api/chip-requests', { cookie: andres, ...NC });
    const body = mine.json as { items: Array<{ action: string; chipLast4: string; status: string }>; nextCursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ action: 'CLAIM_CO_OWNERSHIP', chipLast4: '8901', status: 'PENDING' });
    expect(body.nextCursor).toBeNull();
    expect(mine.text).not.toContain(CHIP);
    expect(((await api.call('GET', '/api/chip-requests', { cookie: maria, ...NC })).json as { items: unknown[] }).items).toHaveLength(0);
  });

  it('[REQ-CHP12-002] formato inválido o campos extra = 422; sin sesión 401; cursor ajeno o inválido 422', async () => {
    const { andres, maria } = await setup();
    for (const body of [{ microchipId: '123' }, { microchipId: CHIP, petId: 'x' }, {}]) {
      expect(problemOf(await api.call('POST', '/api/chip-claims', { cookie: andres, body, ...NC }))).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    }
    expect((await api.call('POST', '/api/chip-claims', { cookie: null, body: { microchipId: CHIP }, ...NC })).status).toBe(401);
    await api.call('POST', '/api/chip-claims', { cookie: andres, body: { microchipId: CHIP }, ...NC });
    expect(problemOf(await api.call('GET', '/api/chip-requests?limit=0', { cookie: andres, ...NC })).status).toBe(422);
    expect(problemOf(await api.call('GET', '/api/chip-requests?cursor=zzz', { cookie: maria, ...NC })).status).toBe(422);
  });

  it('[REQ-CHP12-005] el undécimo intento con chip del mismo usuario responde 429 uniforme', async () => {
    const { andres } = await setup();
    let last = 0;
    for (let i = 0; i < 11; i += 1) last = (await api.call('POST', '/api/chip-claims', { cookie: andres, body: { microchipId: `98511234567${String(i).padStart(4, '0')}` }, ...NC })).status;
    expect(last).toBe(429);
  });
});

describe('POST /api/chip-disputes (REQ-CHP12-004, REQ-CHP12-008)', () => {
  const open = (cookie: string, body: Buffer, headers: Record<string, string> = MULTIPART) => api.call('POST', '/api/chip-disputes', { cookie, raw: body, headers, ...NC });

  it('[SC-012-019] 202 {status:RECEIVED} con evidencia saneada; deja la fila UNDER_REVIEW solo si el chip existe; chip libre = mismo 202 sin fila', async () => {
    const { andres } = await setup();
    const real = await open(andres, form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]));
    const free = await open(andres, form([{ name: 'microchipId', value: '985112345678999' }, { name: 'evidence', file: png() }]));
    expect([real.status, real.text, free.status, free.text]).toEqual([202, '{"status":"RECEIVED"}', 202, '{"status":"RECEIVED"}']);
    const rows = (await api.call('GET', '/api/chip-requests', { cookie: andres, ...NC })).json as { items: Array<{ action: string; status: string }> };
    expect(rows.items.map((r) => [r.action, r.status])).toEqual([['CHIP_DISPUTE', 'UNDER_REVIEW']]);
  });

  it('[trinity M-1] tipo distinto de multipart 422; sin Content-Length o chunked 411; Content-Length sobre el tope 413: ninguno consume el contador multipart', async () => {
    const { andres } = await setup();
    expect(problemOf(await api.call('POST', '/api/chip-disputes', { cookie: andres, body: {}, ...NC })).status).toBe(422);
    const chunked = await api.call('POST', '/api/chip-disputes', { cookie: andres, raw: form([{ name: 'microchipId', value: CHIP }]), headers: { ...MULTIPART, 'transfer-encoding': 'chunked' }, ...NC });
    expect(chunked.status).toBe(411);
    const huge = await api.call('POST', '/api/chip-disputes', { cookie: andres, raw: form([{ name: 'microchipId', value: CHIP }]), headers: { ...MULTIPART, 'content-length': '15728641' }, ...NC });
    expect(huge.status).toBe(413);
    // Diez peticiones multipart que sí cuentan (422 por forma) y la undécima da 429: el 411/413 anteriores no gastaron cupo.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await open(andres, form([{ name: 'microchipId', value: CHIP }]))).status);
    expect(statuses).toEqual([...Array.from({ length: 10 }, () => 422), 429]);
  });

  it('[REQ-CHP12-008] partes desconocidas, repetidas, 0 o 6 archivos, EICAR e imagen falsa son 422 idénticos e independientes del chip', async () => {
    const { andres } = await setup();
    const cases: Buffer[] = [
      form([{ name: 'microchipId', value: CHIP }]),
      form([{ name: 'microchipId', value: CHIP }, { name: 'otra', value: 'x' }, { name: 'evidence', file: png() }]),
      form([{ name: 'microchipId', value: CHIP }, { name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]),
      form([{ name: 'microchipId', value: CHIP }, ...Array.from({ length: 6 }, () => ({ name: 'evidence', file: png() }))]),
    ];
    const statuses = [];
    for (const body of cases) statuses.push((await open(andres, body)).status);
    expect(statuses).toEqual([422, 422, 422, 422]);
    const infected = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(EICAR_TEST_STRING)]);
    expect((await open(andres, form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: infected, type: 'application/pdf' }]))).status).toBe(422);
    expect((await open(andres, form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: Buffer.from('<svg/>'), type: 'image/svg+xml' }]))).status).toBe(422);
  });

  it('[N-G] sin adaptador antimalware la apertura falla cerrada: 503 ERR-OWN12-RETRYABLE con Retry-After constante', async () => {
    const { andres } = await setup();
    (api.deps as unknown as { malwareScanner: unknown }).malwareScanner = undefined;
    const response = await open(andres, form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]));
    expect(problemOf(response)).toEqual({ status: 503, code: 'ERR-OWN12-RETRYABLE' });
    expect(response.headers['retry-after']).toBe('2');
  });
});

describe('cola de disputas de /admin (REQ-CHP12-009, INV-CHP12-006, EDGE-012-043)', () => {
  const as = (cookie: string, method: string, url: string, body?: unknown) => api.call(method, url, { cookie, ...(body === undefined ? {} : { body }), ...NC });
  const setPerson = (email: string, personId: string) => api.db.prepare('UPDATE admin_identities SET person_id = ? WHERE email = ?').run(personId, email);

  async function twoAdmins(): Promise<{ one: string; two: string }> {
    const first = await adminLogin(api);
    kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL_2 };
    const second = await adminLogin(api, { ip: '10.0.0.2' });
    setPerson(ADMIN_EMAIL, 'persona_0001');
    setPerson(ADMIN_EMAIL_2, 'persona_0002');
    return { one: first.cookie!, two: second.cookie! };
  }

  it('[SC-012-104] flujo completo: cola, expediente seudonimizado, lectura de evidencia, step-up de un solo uso, resolve y confirm por un segundo administrador distinto', async () => {
    const { andres, petId } = await setup();
    const admins = await twoAdmins();
    expect((await api.call('POST', '/api/chip-disputes', { cookie: andres, raw: form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]), headers: MULTIPART, ...NC })).status).toBe(202);

    const queue = (await as(admins.one, 'GET', '/api/admin/disputes')).json as { items: Array<{ disputeId: string; chipLast4: string; decisionPhase: string; iAmParty: boolean }> };
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ chipLast4: '8901', decisionPhase: 'NONE', iAmParty: false });
    const id = queue.items[0]!.disputeId;

    const file = await as(admins.one, 'GET', `/api/admin/disputes/${id}`);
    const view = file.json as { parties: unknown[]; evidence: Array<{ evidenceId: string; readByMe: boolean }>; actorIdentities?: unknown };
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.text).not.toContain(CHIP);
    expect(file.text).not.toContain('Luna');
    expect(view.parties).toEqual([{ alias: 'Parte A', role: 'CLAIMANT' }, { alias: 'Parte B', role: 'OWNER' }]);
    expect(view.evidence[0]).toMatchObject({ readByMe: false });
    expect('actorIdentities' in view).toBe(false);

    // resolve sin grant: 403 genérico; con grant de otra acción: 403; nada cambia.
    const body = { resolution: 'ADD_CO_OWNER', reason: 'Documentos verificados', stepUpGrantId: 'grant-inexistente' };
    expect((await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, body)).status).toBe(403);
    const grant = (await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string; expiresAt: string };
    expect(grant.grantId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    const resolved = await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, { ...body, stepUpGrantId: grant.grantId });
    expect(resolved.status).toBe(200);
    expect(resolved.json).toMatchObject({ decisionPhase: 'AWAITING_CONFIRMATION', status: 'UNDER_REVIEW', resolution: 'ADD_CO_OWNER' });
    // el grant es de un solo uso
    expect((await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, { ...body, stepUpGrantId: grant.grantId })).status).toBe(403);

    // el mismo administrador no confirma; el segundo debe leer la evidencia antes.
    const own = (await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'confirm' })).json as { grantId: string };
    expect(problemOf(await as(admins.one, 'POST', `/api/admin/disputes/${id}/confirm`, { reason: 'Yo mismo', stepUpGrantId: own.grantId }))).toEqual({ status: 403, code: 'ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT' });
    const confirmGrant = (await as(admins.two, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'confirm' })).json as { grantId: string };
    expect((await as(admins.two, 'POST', `/api/admin/disputes/${id}/confirm`, { reason: 'Sin leer', stepUpGrantId: confirmGrant.grantId })).status).toBe(403);
    const read = await as(admins.two, 'GET', `/api/admin/disputes/${id}/evidence/${view.evidence[0]!.evidenceId}`);
    expect(read.status).toBe(200);
    expect((read.json as { url: string }).url).toMatch(/^https?:\/\//);
    const confirmGrant2 = (await as(admins.two, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'confirm' })).json as { grantId: string };
    const done = await as(admins.two, 'POST', `/api/admin/disputes/${id}/confirm`, { reason: 'Confirmado', stepUpGrantId: confirmGrant2.grantId });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ status: 'RESOLVED', decisionPhase: 'NONE' });
    // H-01 (a): el motivo de decisión vive SOLO en `admin_audit_entries.metadata` de los eventos de arbitraje (se purga con la auditoría); person_id nunca.
    const audit = api.db.prepare("SELECT action, metadata FROM admin_audit_entries WHERE action IN ('DISPUTE_DECISION_RECORDED', 'DISPUTE_DECISION_CONFIRMED') ORDER BY occurred_at, rowid").all() as Array<{ action: string; metadata: string | null }>;
    expect(audit).toEqual([
      { action: 'DISPUTE_DECISION_RECORDED', metadata: JSON.stringify({ reason: 'Documentos verificados' }) },
      { action: 'DISPUTE_DECISION_CONFIRMED', metadata: JSON.stringify({ reason: 'Confirmado' }) },
    ]);
    expect(JSON.stringify(api.db.prepare('SELECT * FROM admin_audit_entries').all())).not.toMatch(/persona_000/);
    expect((await api.call('GET', `/api/pets/${petId}/ownership`, { cookie: andres, ...NC })).status).toBe(200);
    // SUPER_ADMIN (raíz) ve los identificadores de los actores; el aviso al reclamante es solo el desenlace.
    const closed = (await as(admins.one, 'GET', `/api/admin/disputes/${id}`)).json as { actors: unknown[]; actorIdentities?: unknown[] };
    expect(closed.actors).toHaveLength(2);
    expect(closed.actorIdentities).toHaveLength(2);
    const mine = (await api.call('GET', '/api/chip-requests', { cookie: andres, ...NC })).json as { items: Array<{ outcome: string }> };
    expect(mine.items[0]!.outcome).toBe('RESOLVED_APPROVED');
  });

  it('[H-06][INV-CHP12-004] un administrador OPERATOR (delegado, no raíz) no recibe actorIdentities en una disputa cerrada con actores, y el SUPER_ADMIN sí', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    // El segundo administrador deja de ser raíz y pasa a delegado ACTIVE con rol OPERATOR (el rol se resuelve en cada petición).
    kit.emails.splice(kit.emails.indexOf(ADMIN_EMAIL_2), 1);
    const identity = api.db.prepare('SELECT admin_id FROM admin_identities WHERE email = ?').get(ADMIN_EMAIL_2) as { admin_id: string };
    const stamp = '2026-11-01T00:00:00.000Z';
    api.db
      .prepare("INSERT INTO admin_delegates (admin_id, email, role, status, provider, provider_subject, anchored_at, created_by_admin_id, created_at, updated_at) VALUES (?, ?, 'OPERATOR', 'ACTIVE', 'GOOGLE', ?, ?, ?, ?, ?)")
      .run(identity.admin_id, ADMIN_EMAIL_2, ADMIN_SUB_2, stamp, identity.admin_id, stamp, stamp);
    expect((await api.call('POST', '/api/chip-disputes', { cookie: andres, raw: form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]), headers: MULTIPART, ...NC })).status).toBe(202);
    const id = ((await as(admins.one, 'GET', '/api/admin/disputes')).json as { items: Array<{ disputeId: string }> }).items[0]!.disputeId;
    const evidenceId = ((await as(admins.one, 'GET', `/api/admin/disputes/${id}`)).json as { evidence: Array<{ evidenceId: string }> }).evidence[0]!.evidenceId;
    const grant = async (cookie: string, action: 'resolve' | 'confirm') => ((await as(cookie, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action })).json as { grantId: string }).grantId;
    expect((await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, { resolution: 'ADD_CO_OWNER', reason: 'Documentos verificados', stepUpGrantId: await grant(admins.one, 'resolve') })).status).toBe(200);
    expect((await as(admins.two, 'GET', `/api/admin/disputes/${id}/evidence/${evidenceId}`)).status).toBe(200);
    // El OPERATOR confirma y recibe la vista cerrada con los dos actores, sin `actorIdentities`.
    const done = await as(admins.two, 'POST', `/api/admin/disputes/${id}/confirm`, { reason: 'Confirmado', stepUpGrantId: await grant(admins.two, 'confirm') });
    expect(done.status).toBe(200);
    const operatorView = (await as(admins.two, 'GET', `/api/admin/disputes/${id}`)).json as { actors: Array<{ alias: string; role: string }>; actorIdentities?: unknown };
    expect(operatorView.actors).toEqual([{ alias: 'Resolutor', role: 'SUPER_ADMIN' }, { alias: 'Segundo aprobador', role: 'OPERATOR' }]);
    expect('actorIdentities' in operatorView).toBe(false);
    expect('actorIdentities' in (done.json as object)).toBe(false);
    expect(((await as(admins.one, 'GET', `/api/admin/disputes/${id}`)).json as { actorIdentities?: unknown[] }).actorIdentities).toHaveLength(2);
  });

  it('[H-06][REQ-CHP12-009] el step-up de resolve vence a los 5 minutos y un grant ajeno no sirve; ambos 403 genérico y la disputa no cambia', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    expect((await api.call('POST', '/api/chip-disputes', { cookie: andres, raw: form([{ name: 'microchipId', value: CHIP }, { name: 'evidence', file: png() }]), headers: MULTIPART, ...NC })).status).toBe(202);
    const id = ((await as(admins.one, 'GET', '/api/admin/disputes')).json as { items: Array<{ disputeId: string }> }).items[0]!.disputeId;
    const resolveWith = (cookie: string, grantId: string) => as(cookie, 'POST', `/api/admin/disputes/${id}/resolve`, { resolution: 'ADD_CO_OWNER', reason: 'Documentos verificados', stepUpGrantId: grantId });
    const issue = async (cookie: string) => ((await as(cookie, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;

    // grant ajeno: emitido al administrador dos, usado por el uno
    expect((await resolveWith(admins.one, await issue(admins.two))).status).toBe(403);

    // grant propio expirado: a 4 min 59 s aún vale (se prueba aparte); a 5 min exactos ya no
    const issuedAt = api.clock.nowIsoTimestamp();
    const expired = await issue(admins.one);
    const later = new Date(Date.parse(issuedAt) + 5 * 60_000).toISOString();
    api.clock.setClock(later.slice(0, 10), later);
    expect((await resolveWith(admins.one, expired)).status).toBe(403);
    api.clock.setClock(issuedAt.slice(0, 10), issuedAt);
    const stillValid = await issue(admins.one);
    const almost = new Date(Date.parse(issuedAt) + 5 * 60_000 - 1000).toISOString();
    api.clock.setClock(almost.slice(0, 10), almost);
    expect((await resolveWith(admins.one, stillValid)).status).toBe(200);
  });

  it('[deny-by-default] sin sesión de administración 404 uniforme; la cookie de usuario no autoriza /admin; cuerpos con campos extra 422', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    expect((await api.call('GET', '/api/admin/disputes', { cookie: null, ...NC })).status).toBe(404);
    expect((await api.call('GET', '/api/admin/disputes', { cookie: andres, ...NC })).status).toBe(404);
    const id = '11111111-1111-4111-8111-1111111111ff';
    expect((await as(admins.one, 'GET', `/api/admin/disputes/${id}`)).status).toBe(404);
    expect(problemOf(await as(admins.one, 'POST', `/api/admin/disputes/${id}/extend-freeze`, { reason: 'x', extra: 1 })).status).toBe(422);
    expect(problemOf(await as(admins.one, 'GET', '/api/admin/disputes?limit=500')).status).toBe(422);
  });
});
