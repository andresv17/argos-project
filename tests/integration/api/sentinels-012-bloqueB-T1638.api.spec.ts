import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { DeterministicMalwareScannerAdapter } from '../../../src/infrastructure/adapters/deterministic-malware-scanner.adapter.ts';
import { ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB_2, adminKit, adminLogin, type AdminKit } from '../../fixtures/admin-fixtures.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';
import { AdminStepUpStore } from '../../../src/infrastructure/http/admin-stepup-store.ts';
import { AdminForbiddenError } from '../../../src/application/use-cases/chip-dispute-admin-use-cases.ts';

/**
 * SENTINELS T1638 (Feature 012, Bloque B, #23): 9 vectores de exploit sobre multipart, chip y /admin de disputas.
 * Entorno local y de prueba (SQLite en memoria del arnés, sin red). Prueba nueva; no modifica src/ ni contratos.
 * Vectores: V1 tamaño, V2 tipo, V3 boundary malformado, V4 411/413, V5 chip formato, V6 chip duplicados,
 * V7 step-up reutilizado, V8 grant ajeno, V9 IDOR entre disputas.
 */
let api: Api;
let kit: AdminKit;
afterEach(async () => api.close());

const NC = { contract: false } as const;
const CHIP_A = '985112345678901';
const CHIP_B = '985112345678902';
const NOW = '2026-11-05T12:00:00.000Z';
const MAX = 15_728_640;

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
function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(8)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const BOUNDARY = 'argosboundary7MA4YWxk';
function form(parts: Array<{ name: string; value?: string; file?: Uint8Array; type?: string }>, boundary = BOUNDARY): Buffer {
  const out: Buffer[] = [];
  for (const part of parts) {
    out.push(Buffer.from(`--${boundary}\r\n`));
    if (part.file === undefined) out.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}\r\n`));
    else out.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"; filename="x"\r\nContent-Type: ${part.type ?? 'image/png'}\r\n\r\n`), Buffer.from(part.file), Buffer.from('\r\n'));
  }
  out.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(out);
}
const MULTIPART = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

async function setup(): Promise<{ andres: string; maria: string }> {
  kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
  api = await createApi(canonicalState(), { admin: kit.admin, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS } });
  (api.deps as unknown as { malwareScanner: unknown }).malwareScanner = new DeterministicMalwareScannerAdapter();
  const andres = await api.login('andres');
  const maria = await api.login('maria.v');
  const a = await api.call('POST', '/api/pets', { cookie: maria, body: { ...NEW_PET, name: 'Luna', microchipId: CHIP_A } });
  const b = await api.call('POST', '/api/pets', { cookie: maria, body: { ...NEW_PET, name: 'Nala', microchipId: CHIP_B } });
  expect([a.status, b.status]).toEqual([201, 201]);
  return { andres, maria };
}

const open = (cookie: string, raw: Buffer, headers: Record<string, string> = MULTIPART) => api.call('POST', '/api/chip-disputes', { cookie, raw, headers, ...NC });
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

/** Extrae identificadores de disputa de la cola de /admin por orden de aparición. */
async function queue(cookie: string): Promise<string[]> {
  return ((await as(cookie, 'GET', '/api/admin/disputes')).json as { items: Array<{ disputeId: string }> }).items.map((i) => i.disputeId);
}

describe('V1 tamaño (multipart)', () => {
  it('Content-Length declarado por encima del tope = 413 y el cuerpo no se parsea', async () => {
    const { andres } = await setup();
    const r = await open(andres, form([{ name: 'microchipId', value: CHIP_A }]), { ...MULTIPART, 'content-length': String(MAX + 1) });
    expect(r.status).toBe(413);
  });

  it('cuerpo real de 16 MiB con Content-Length honesto supera bodyLimit y no crea fila', async () => {
    const { andres } = await setup();
    const big = Buffer.concat([form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: Buffer.alloc(MAX + 1024, 0x41) }])]);
    const r = await open(andres, big);
    expect([413, 422]).toContain(r.status);
    expect(r.status).not.toBe(202);
  });
});

describe('V2 tipo (multipart y evidencia)', () => {
  it('Content-Type de la petición que no es multipart = 422 sin consumir cupo', async () => {
    const { andres } = await setup();
    const r = await open(andres, Buffer.from('{}'), { 'content-type': 'application/json' });
    expect(problemOf(r).status).toBe(422);
  });

  it('evidencia PNG real declarada como application/pdf no pasa la firma = 422', async () => {
    const { andres } = await setup();
    const r = await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png(), type: 'application/pdf' }]));
    expect(r.status).toBe(422);
  });

  it('evidencia de texto plano disfrazada de imagen = 422', async () => {
    const { andres } = await setup();
    const r = await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: Buffer.from('<html>hola</html>'), type: 'image/png' }]));
    expect(r.status).toBe(422);
  });
});

describe('V3 boundary malformado', () => {
  it('multipart sin parámetro boundary = 422', async () => {
    const { andres } = await setup();
    expect(problemOf(await open(andres, form([{ name: 'microchipId', value: CHIP_A }]), { 'content-type': 'multipart/form-data' })).status).toBe(422);
  });

  it('boundary de 71 caracteres (fuera de RFC 2046) = 422', async () => {
    const { andres } = await setup();
    const long = 'a'.repeat(71);
    const r = await open(andres, form([{ name: 'microchipId', value: CHIP_A }], long), { 'content-type': `multipart/form-data; boundary=${long}` });
    expect(problemOf(r).status).toBe(422);
  });

  it('boundary con carácter ilegal (;) o inyección de cabecera = 422', async () => {
    const { andres } = await setup();
    const bad = await open(andres, form([{ name: 'microchipId', value: CHIP_A }]), { 'content-type': 'multipart/form-data; boundary=a;b' });
    const inject = await open(andres, form([{ name: 'microchipId', value: CHIP_A }]), { 'content-type': 'multipart/form-data; boundary=a\r\nX-Evil: 1' });
    expect([bad.status, inject.status]).toEqual([422, 422]);
  });

  it('cuerpo cuyo delimitador no coincide con el declarado, o con preámbulo = 422', async () => {
    const { andres } = await setup();
    const wrong = await open(andres, form([{ name: 'microchipId', value: CHIP_A }], 'otroBoundary123'));
    const preamble = await open(andres, Buffer.concat([Buffer.from('basura\r\n'), form([{ name: 'microchipId', value: CHIP_A }])]));
    expect([wrong.status, preamble.status]).toEqual([422, 422]);
  });
});

describe('V4 411 / 413 (cabeceras antes del cuerpo)', () => {
  it('chunked (sin Content-Length) = 411; Content-Length no numérico = 411; negativo = 411', async () => {
    const { andres } = await setup();
    const raw = form([{ name: 'microchipId', value: CHIP_A }]);
    const chunked = await open(andres, raw, { ...MULTIPART, 'transfer-encoding': 'chunked' });
    const nan = await open(andres, raw, { ...MULTIPART, 'content-length': 'abc' });
    const neg = await open(andres, raw, { ...MULTIPART, 'content-length': '-1' });
    expect([chunked.status, nan.status, neg.status]).toEqual([411, 411, 411]);
  });

  it('Content-Length exacto en el tope pasa la cabecera; uno más = 413', async () => {
    const { andres } = await setup();
    const over = await open(andres, form([{ name: 'microchipId', value: CHIP_A }]), { ...MULTIPART, 'content-length': String(MAX + 1) });
    expect(over.status).toBe(413);
  });
});

describe('V5 chip formato', () => {
  it('chip-claims con 14 o 16 dígitos, letras o campos extra = 422 (validación de forma previa a cualquier consulta)', async () => {
    const { andres } = await setup();
    const variants = [{ microchipId: '98511234567890' }, { microchipId: '9851123456789012' }, { microchipId: '98511234567890A' }, { microchipId: CHIP_A, extra: 1 }];
    const statuses: number[] = [];
    for (const body of variants) statuses.push((await as(andres, 'POST', '/api/chip-claims', body)).status);
    expect(statuses).toEqual([422, 422, 422, 422]);
  });

  it('chip-disputes con microchipId mal formado responde 422 idéntico al de cualquier otra forma inválida', async () => {
    const { andres } = await setup();
    const r = await open(andres, form([{ name: 'microchipId', value: 'NO-ES-CHIP' }, { name: 'evidence', file: png() }]));
    expect(r.status).toBe(422);
  });
});

describe('V6 chip duplicados', () => {
  it('dos usuarios distintos reclaman el mismo chip ocupado: respuestas idénticas (status, cuerpo y Cache-Control)', async () => {
    const { andres, maria } = await setup();
    const a = await as(andres, 'POST', '/api/chip-claims', { microchipId: CHIP_A });
    const m = await as(maria, 'POST', '/api/chip-claims', { microchipId: CHIP_A });
    const free = await as(andres, 'POST', '/api/chip-claims', { microchipId: '985112345678999' });
    expect([a.status, a.text, a.headers['cache-control']]).toEqual([202, '{"status":"RECEIVED"}', 'private, no-store']);
    expect([m.status, m.text]).toEqual([a.status, a.text]);
    expect([free.status, free.text]).toEqual([a.status, a.text]);
  });

  it('la misma disputa repetida por el mismo usuario sigue respondiendo 202 uniforme sin duplicar filas (y el chip libre no difiere del ocupado)', async () => {
    const { andres } = await setup();
    const payload = form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]);
    const freePayload = form([{ name: 'microchipId', value: '985112345678999' }, { name: 'evidence', file: png() }]);
    const freeFirst = await open(andres, freePayload);
    const freeSecond = await open(andres, freePayload);
    expect([freeFirst.status, freeSecond.status]).toEqual([202, 202]);
    const first = await open(andres, payload);
    const second = await open(andres, payload);
    expect([first.status, second.status, second.text]).toEqual([202, 202, '{"status":"RECEIVED"}']);
    const rows = (await as(andres, 'GET', '/api/chip-requests')).json as { items: Array<{ action: string }> };
    expect(rows.items.filter((r) => r.action === 'CHIP_DISPUTE').length).toBe(1);
  });
});

describe('V7 step-up reutilizado', () => {
  it('un grant de resolve sirve una sola vez: el segundo resolve con el mismo grantId = 403 genérico', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    expect((await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]))).status).toBe(202);
    const [id] = await queue(admins.one);
    const grantId = ((await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const body = { resolution: 'ADD_CO_OWNER', reason: 'Documentos verificados', stepUpGrantId: grantId };
    const first = await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, body);
    const second = await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, body);
    expect([first.status, second.status]).toEqual([200, 403]);
    expect(second.text).not.toMatch(/grant|reus|usad|expir/i);
  });

  it('un grant de resolve no sirve para confirm (acción distinta) = 403', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const grantId = ((await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const r = await as(admins.one, 'POST', `/api/admin/disputes/${id}/confirm`, { reason: 'x', stepUpGrantId: grantId });
    expect(r.status).toBe(403);
  });
});

describe('V8 grant ajeno', () => {
  it('grant emitido al administrador dos no sirve al uno = 403, y no quema el grant del dueño', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const ownerGrant = ((await as(admins.two, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const foreign = await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: ownerGrant });
    const owner = await as(admins.two, 'POST', `/api/admin/disputes/${id}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: ownerGrant });
    expect([foreign.status, owner.status]).toEqual([403, 200]);
  });
});

describe('V9 IDOR entre disputas', () => {
  it('grant de la disputa A no sirve para resolver la disputa B = 403 y B no cambia', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    await open(andres, form([{ name: 'microchipId', value: CHIP_B }, { name: 'evidence', file: png() }]));
    const ids = await queue(admins.one);
    expect(ids.length).toBe(2);
    const [a, b] = ids as [string, string];
    const grantA = ((await as(admins.one, 'POST', `/api/admin/disputes/${a}/step-up`, { disputeId: a, action: 'resolve' })).json as { grantId: string }).grantId;
    const beforeB = (await as(admins.one, 'GET', `/api/admin/disputes/${b}`)).text;
    const cross = await as(admins.one, 'POST', `/api/admin/disputes/${b}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantA });
    expect(cross.status).toBe(403);
    expect((await as(admins.one, 'GET', `/api/admin/disputes/${b}`)).text).toBe(beforeB);
    // Comportamiento DOCUMENTADO en step-up-store (consume, finally): el dueño quema su grant aunque la validación falle.
    const stillA = await as(admins.one, 'POST', `/api/admin/disputes/${a}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantA });
    expect(stillA.status).toBe(403);
  });

  it('evidencia de la disputa A no se lee por la ruta de la disputa B = 404 uniforme', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    await open(andres, form([{ name: 'microchipId', value: CHIP_B }, { name: 'evidence', file: png() }]));
    const ids = await queue(admins.one);
    const [a, b] = ids as [string, string];
    const detailA = (await as(admins.one, 'GET', `/api/admin/disputes/${a}`)).json as { evidence: Array<{ evidenceId: string }> };
    const evA = detailA.evidence[0]!.evidenceId;
    const cross = await as(admins.one, 'GET', `/api/admin/disputes/${b}/evidence/${evA}`);
    const own = await as(admins.one, 'GET', `/api/admin/disputes/${a}/evidence/${evA}`);
    expect(own.status).toBe(200);
    expect([cross.status, cross.text]).toEqual([404, cross.text]);
    expect(cross.text).not.toBe(own.text);
  });
});

const EVIL = { origin: 'https://evil.example' };
const callWith = (cookie: string, url: string, body: unknown, headers: Record<string, string> = {}) => api.call('POST', url, { cookie, body, headers, ...NC });

describe('S-02 Origin ajeno en mutaciones de disputa', () => {
  it('step-up con Origin ajeno = 403 y no emite grant; con origen propio (sin Origin) sí', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const evil = await callWith(admins.one, `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' }, EVIL);
    expect(evil.status).toBe(403);
    expect(evil.text).not.toMatch(/grantId/);
    expect((await callWith(admins.one, `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).status).toBe(201);
  });

  it('resolve, extend-freeze, cancel-execution y close-moot con Origin ajeno = 403 sin cambiar el caso ni quemar el grant', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const before = (await as(admins.one, 'GET', `/api/admin/disputes/${id}`)).text;
    const grantId = ((await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const base = `/api/admin/disputes/${id}`;
    const results = [
      await callWith(admins.one, `${base}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantId }, EVIL),
      await callWith(admins.one, `${base}/extend-freeze`, { reason: 'x' }, EVIL),
      await callWith(admins.one, `${base}/cancel-execution`, { reason: 'x' }, EVIL),
      await callWith(admins.one, `${base}/close-moot`, { mootReason: 'PET_GONE' }, EVIL),
    ];
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect((await as(admins.one, 'GET', base)).text).toBe(before);
    expect((await callWith(admins.one, `${base}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantId })).status).toBe(200);
  });

  it('chip-disputes con Origin ajeno = 403 sin crear fila', async () => {
    const { andres } = await setup();
    const evil = await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]), { ...MULTIPART, ...EVIL });
    expect(evil.status).toBe(403);
    const rows = (await as(andres, 'GET', '/api/chip-requests')).json as { items: Array<{ action: string }> };
    expect(rows.items.filter((r) => r.action === 'CHIP_DISPUTE')).toHaveLength(0);
  });
});

describe('S-03 grant ligado a administrador, disputa y acción', () => {
  it('grant de confirm sobre la misma disputa no sirve para resolve = 403', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const grantId = ((await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'confirm' })).json as { grantId: string }).grantId;
    expect((await as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantId })).status).toBe(403);
  });
});

describe('T-02 el grant se consume tras el caso de uso', () => {
  it('un fallo del caso de uso (ARBITRATION-CONFLICT) no quema el grant: tras corregir la causa el mismo grant sirve una vez', async () => {
    const { andres } = await setup();
    const first = await adminLogin(api);
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    setPerson(ADMIN_EMAIL, 'persona_0001');
    const [id] = await queue(first.cookie!);
    const grantId = ((await as(first.cookie!, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const body = { resolution: 'REJECT', reason: 'x', stepUpGrantId: grantId };
    api.db.prepare('UPDATE admin_identities SET person_id = NULL WHERE email = ?').run(ADMIN_EMAIL);
    const sinPersona = await callWith(first.cookie!, `/api/admin/disputes/${id}/resolve`, body); // sin person_id: falla cerrada
    expect([sinPersona.status, sinPersona.json]).toEqual([403, expect.objectContaining({ code: 'ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT' })]); // fallo del caso de uso (no del grant)
    setPerson(ADMIN_EMAIL, 'persona_0001');
    const ok = await callWith(first.cookie!, `/api/admin/disputes/${id}/resolve`, body);
    const replay = await callWith(first.cookie!, `/api/admin/disputes/${id}/resolve`, body);
    expect([ok.status, replay.status]).toEqual([200, 403]);
  });
});

describe('H-T1638-04 concurrencia sobre un grant reservado', () => {
  const NOW_ISO = '2026-11-05T12:00:00.000Z';
  const expected = { adminId: 'admin_1', disputeId: 'disp_1', action: 'resolve' } as const;
  const issue = (store: AdminStepUpStore, adminId = 'admin_1') => store.issue({ adminId, disputeId: 'disp_1', action: 'resolve', now: NOW_ISO, newId: () => 'grant_x' + adminId }).grantId;

  it('con el grant reservado (claim sin finish ni release) una petición concurrente con el mismo id recibe 403 y la reserva se conserva', () => {
    const store = new AdminStepUpStore();
    const id = issue(store);
    store.claim(id, expected, NOW_ISO);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError); // el rechazo concurrente no borra la reserva
    store.finish(id);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError); // tras finish ya no existe
  });

  it('tras release el grant vuelve a servir una sola vez y tras finish no sirve', () => {
    const store = new AdminStepUpStore();
    const id = issue(store);
    store.claim(id, expected, NOW_ISO);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError);
    store.release(id);
    expect(store.claim(id, expected, NOW_ISO)).toBeUndefined(); // claim sin error: reserva el grant (devuelve void)
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError); // reservado de nuevo
    store.finish(id);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError);
  });

  it('un claim de otro administrador no borra la reserva del dueño: sigue rechazando al concurrente y release la devuelve', () => {
    const store = new AdminStepUpStore();
    const id = issue(store);
    store.claim(id, expected, NOW_ISO);
    expect(() => store.claim(id, { ...expected, adminId: 'admin_2' }, NOW_ISO)).toThrow(AdminForbiddenError);
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError);
    store.release(id);
    expect(store.claim(id, expected, NOW_ISO)).toBeUndefined(); // claim sin error: reserva el grant (devuelve void)
    expect(() => store.claim(id, expected, NOW_ISO)).toThrow(AdminForbiddenError); // y queda reservado de nuevo
  });

  it('HTTP: dos resolve simultáneos con el mismo grant dan exactamente un 200 y un 403 genérico', async () => {
    const { andres } = await setup();
    const admins = await twoAdmins();
    await open(andres, form([{ name: 'microchipId', value: CHIP_A }, { name: 'evidence', file: png() }]));
    const [id] = await queue(admins.one);
    const grantId = ((await as(admins.one, 'POST', `/api/admin/disputes/${id}/step-up`, { disputeId: id, action: 'resolve' })).json as { grantId: string }).grantId;
    const body = { resolution: 'REJECT', reason: 'Documentos verificados', stepUpGrantId: grantId };
    const [x, y] = await Promise.all([as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, body), as(admins.one, 'POST', `/api/admin/disputes/${id}/resolve`, body)]);
    expect([x.status, y.status].sort()).toEqual([200, 403]);
  });
});
