/**
 * T754 / T755 / T756 / T757 / T762 / T768 / T769 [US4] casos de uso del enlace veterinario sobre memoria y SQLite: crear con `Idempotency-Key`
 * (REQ-VET-001, EDGE-005-16/17, SC-005-051), listar solo metadatos (SC-005-025), revocar con `EXPIRED` como no-op (STATE-SHARE-001, SC-005-019/046),
 * resolver el resumen con 404 uniforme y misma secuencia de puertos (REQ-VET-007, INV-005-007, SC-005-021), revalidación de la autoridad del creador
 * (REQ-VET-011, SC-005-037, PN-08), tope de 20 activos por alcance (REQ-VET-012, SC-005-038) y auditoría sin secretos (REQ-VET-008, SC-005-022).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import type { ShareScopeRef } from '../../../src/application/sharing/share-access.ts';
import { CreateShareLinkUseCase, ListShareLinksUseCase, RevokeShareLinkUseCase } from '../../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedFileUseCase, GetSharedSummaryUseCase, PreviewClinicalSummaryUseCase } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import { validateCreateShareLinkReplay, validateCreateShareLinkResult, validateShareLinkList, validateSharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ANDRES, ARGOS, HOUSEHOLD_ID, KEY, LUCIA, LUNA, MARIA, codeOf, createShareEngines, errorOf, type ShareEngine } from '../../fixtures/share-harness.ts';
import { PDF, PNG } from '../../fixtures/media-harness.ts';

const NOW = '2026-11-18T12:00:00.000Z';
const KIRA = '11111111-1111-4111-8111-111111111102';
const PET_REF: ShareScopeRef = { scope: 'PET', petId: ARGOS.id };
const HOUSE_REF: ShareScopeRef = { scope: 'HOUSEHOLD', householdId: HOUSEHOLD_ID };
const IP = '203.0.113.7';

let engines: ShareEngine[] = [];
afterEach(() => {
  for (const e of engines) e.close();
  engines = [];
});

/** Ejecuta la prueba en memoria y en SQLite con el rol de María indicado. */
async function eachEngine(role: 'ADMIN' | 'CAREGIVER' | 'READER' | null, test: (e: ShareEngine) => Promise<void>): Promise<void> {
  engines = await createShareEngines(role);
  for (const e of engines) {
    e.setNow(NOW);
    await test(e);
  }
}

const create = (e: ShareEngine, userId: string, ref: ShareScopeRef, key: unknown, body: unknown = {}) => new CreateShareLinkUseCase(e.deps).execute(userId, ref, key, body);
const summary = (e: ShareEngine, token: string, ip = IP) => new GetSharedSummaryUseCase(e.deps).execute(token, ip);
const revoke = (e: ShareEngine, userId: string, id: string) => new RevokeShareLinkUseCase(e.deps).execute(userId, id);
const list = (e: ShareEngine, userId: string, ref: ShareScopeRef) => new ListShareLinksUseCase(e.deps).execute(userId, ref);

async function created(e: ShareEngine, userId = ANDRES, ref: ShareScopeRef = PET_REF, n = 1, body: unknown = {}) {
  const result = await create(e, userId, ref, KEY(n), body);
  if (result.kind !== 'CREATED') throw new Error('se esperaba un enlace nuevo');
  return result;
}

describe('T754 crear enlace (REQ-VET-001, SC-005-015, SC-005-025)', () => {
  it('[SC-005-015][REQ-VET-003][INV-005-005] crea el enlace: token de 43 caracteres devuelto una vez, en BD solo el SHA-256, valida contra CreateShareLinkResult', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(validateCreateShareLinkResult({ link: r.link, url: `https://argos.example/shared/${r.token}` })).toBe(true);
      expect(r.link).toMatchObject({ scope: 'PET', petId: ARGOS.id, householdId: null, status: 'ACTIVE', revokedAt: null, includeMicrochip: false, includeClinicalFiles: false, createdAt: NOW, expiresAt: '2026-11-25T12:00:00.000Z' });
      const rows = await e.rows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ tokenHash: hashToken(r.token), idempotencyKey: KEY(1), createdByUserId: ANDRES, petOwnerUserIdAtCreation: ANDRES, expiresInDays: 7 });
      expect(JSON.stringify([rows, await e.audit()])).not.toContain(r.token);
    });
  });

  it('[REQ-VET-004][SC-005-018] la caducidad por defecto es 7 días; admite 1 y 30; cualquier otro valor es ERR-SCHEMA-VALIDATION-FAILED y no escribe', async () => {
    await eachEngine(null, async (e) => {
      expect((await created(e, ANDRES, PET_REF, 1, { expiresInDays: 1 })).link.expiresAt).toBe('2026-11-19T12:00:00.000Z');
      expect((await created(e, ANDRES, PET_REF, 2, { expiresInDays: 30 })).link.expiresAt).toBe('2026-12-18T12:00:00.000Z');
      for (const [n, body] of [[3, { expiresInDays: 2 }], [4, { expiresInDays: 365 }], [5, { expiresInDays: '7' }], [6, { includeMicrochip: 'yes' }], [7, { tokenHash: 'x' }], [8, { expiresAt: NOW }], [9, 'texto'], [10, null]] as const) {
        expect(await codeOf(create(e, ANDRES, PET_REF, KEY(n), body)), `cuerpo ${JSON.stringify(body)}`).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      }
      expect(await e.rows()).toHaveLength(2);
    });
  });

  it('[D5-14][D5-21][SC-005-040] las casillas de microchip y archivos nacen desmarcadas y quedan guardadas inmutables', async () => {
    await eachEngine(null, async (e) => {
      const off = await created(e, ANDRES, PET_REF, 1, {});
      const on = await created(e, ANDRES, PET_REF, 2, { includeMicrochip: true, includeClinicalFiles: true });
      expect([off.link.includeMicrochip, off.link.includeClinicalFiles, on.link.includeMicrochip, on.link.includeClinicalFiles]).toEqual([false, false, true, true]);
    });
  });

  it('[SC-005-025][D5-10] el propietario y el ADMIN del hogar crean; CAREGIVER y READER reciben ERR-ACC-FORBIDDEN; quien no ve la mascota, ERR-PET-NOT-FOUND', async () => {
    for (const [role, expected] of [['ADMIN', 'OK'], ['CAREGIVER', 'ERR-ACC-FORBIDDEN'], ['READER', 'ERR-ACC-FORBIDDEN']] as const) {
      await eachEngine(role, async (e) => {
        expect(await codeOf(create(e, MARIA, PET_REF, KEY(1))), `María ${role}`).toBe(expected);
        expect(await codeOf(create(e, LUCIA, PET_REF, KEY(2)))).toBe('ERR-PET-NOT-FOUND');
        expect(await codeOf(create(e, ANDRES, PET_REF, KEY(3)))).toBe('OK');
      });
      for (const e of engines) e.close();
      engines = [];
    }
  });

  it('[SC-005-048][INV-ACC2-001] una mascota o un hogar inexistentes o ajenos son 404 sin escribir', async () => {
    await eachEngine('ADMIN', async (e) => {
      expect(await codeOf(create(e, ANDRES, { scope: 'PET', petId: '99999999-9999-4999-8999-999999999999' }, KEY(1)))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(create(e, ANDRES, { scope: 'HOUSEHOLD', householdId: '99999999-9999-4999-8999-999999999999' }, KEY(2)))).toBe('ERR-HOUSE-NOT-FOUND');
      expect(await codeOf(create(e, LUCIA, HOUSE_REF, KEY(3)))).toBe('ERR-HOUSE-NOT-FOUND');
      expect(await e.rows()).toHaveLength(0);
    });
  });

  it('[SC-005-051][EDGE-005-16] Idempotency-Key: el reintento con la misma clave y opciones responde REPLAY sin token, sin fila ni auditoría nuevas, incluso con 20 activos', async () => {
    await eachEngine(null, async (e) => {
      const first = await created(e, ANDRES, PET_REF, 1, { expiresInDays: 30, includeMicrochip: true });
      const auditBefore = (await e.audit()).length;
      const replay = await create(e, ANDRES, PET_REF, KEY(1), { expiresInDays: 30, includeMicrochip: true });
      expect(replay).toEqual({ kind: 'REPLAY', link: first.link });
      expect('token' in replay).toBe(false);
      expect(validateCreateShareLinkReplay({ link: replay.link, urlAvailable: false })).toBe(true);
      expect(await e.rows()).toHaveLength(1);
      expect(await e.audit()).toHaveLength(auditBefore);
      for (let n = 2; n <= 20; n += 1) await created(e, ANDRES, PET_REF, n);
      expect((await create(e, ANDRES, PET_REF, KEY(1), { expiresInDays: 30, includeMicrochip: true })).kind).toBe('REPLAY');
      expect(await codeOf(create(e, ANDRES, PET_REF, KEY(21)))).toBe('ERR-SHARE-LINK-LIMIT');
    });
  });

  it('[SC-005-051] la misma clave con otro alcance u otras opciones es 422; sin clave o con una clave que no es UUID v4 también', async () => {
    await eachEngine(null, async (e) => {
      await created(e, ANDRES, PET_REF, 1, { includeMicrochip: true });
      expect(await codeOf(create(e, ANDRES, PET_REF, KEY(1), { includeMicrochip: false }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(create(e, ANDRES, PET_REF, KEY(1), { includeMicrochip: true, expiresInDays: 1 }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(create(e, ANDRES, { scope: 'PET', petId: KIRA }, KEY(1), { includeMicrochip: true }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(create(e, ANDRES, HOUSE_REF, KEY(1), { includeMicrochip: true }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      for (const bad of [undefined, null, '', 'no-uuid', KEY(2).toUpperCase().replace('-4000-', '-1000-'), 42]) {
        expect(await codeOf(create(e, ANDRES, PET_REF, bad))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      }
      expect(await e.rows()).toHaveLength(1);
    });
  });

  it('[SC-005-051] dos creaciones simultáneas con la misma clave crean una sola fila', async () => {
    await eachEngine(null, async (e) => {
      const [a, b] = await Promise.all([create(e, ANDRES, PET_REF, KEY(1)), create(e, ANDRES, PET_REF, KEY(1))]);
      expect([a.kind, b.kind].sort()).toEqual(['CREATED', 'REPLAY']);
      expect(await e.rows()).toHaveLength(1);
    });
  });

  it('[REQ-VET-002][D5-19][SC-005-039] HOUSEHOLD: el propietario del hogar comparte sus mascotas; el ADMIN solo las que posee (Luna); ADMIN sin mascotas propias, ERR-ACC-FORBIDDEN', async () => {
    await eachEngine('ADMIN', async (e) => {
      const byOwner = await created(e, ANDRES, HOUSE_REF, 1);
      expect(byOwner.link).toMatchObject({ scope: 'HOUSEHOLD', petId: null, householdId: HOUSEHOLD_ID });
      expect(await e.rows().then((rows) => rows[0]!.petOwnerUserIdAtCreation)).toBeNull();
      expect((await created(e, MARIA, HOUSE_REF, 2)).link.scope).toBe('HOUSEHOLD');
      await e.run((r) => r.assignments.remove(LUNA.id, HOUSEHOLD_ID));
      expect(await codeOf(create(e, MARIA, HOUSE_REF, KEY(3)))).toBe('ERR-ACC-FORBIDDEN');
    });
  });

  it('[D5-10][SC-005-048] en HOUSEHOLD el permiso es el rol del usuario EN el hogar: CAREGIVER y READER reciben ERR-ACC-FORBIDDEN', async () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      await eachEngine(role, async (e) => {
        expect(await codeOf(create(e, MARIA, HOUSE_REF, KEY(1)))).toBe('ERR-ACC-FORBIDDEN');
      });
      for (const e of engines) e.close();
      engines = [];
    }
  });

  it('[REQ-VET-008][SC-005-022] la creación escribe una fila CREATED con el id del enlace y el actor, sin token, hash ni IP', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      const audit = await e.audit();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ eventType: 'CREATED', shareLinkId: r.link.id, actorUserId: ANDRES, ipHmac: null, failCount: 1, occurredAt: NOW });
      expect(JSON.stringify(audit)).not.toContain(hashToken(r.token));
    });
  });

  it('[EDGE-005-16] si la transacción falla, no queda fila ni auditoría ni el token se considera emitido', async () => {
    await eachEngine(null, async (e) => {
      const failing = { ...e.deps, auditIds: { nextId: () => { throw new Error('fallo simulado'); } } };
      await expect(new CreateShareLinkUseCase(failing).execute(ANDRES, PET_REF, KEY(1), {})).rejects.toThrow('fallo simulado');
      expect(await e.rows()).toHaveLength(0);
      expect(await e.audit()).toHaveLength(0);
    });
  });
});

describe('T768 multi-hogar: el rol efectivo y el rol en el hogar nunca se mezclan (REQ-VET-001, INV-ACC2-001, SC-005-048, SC-005-039)', () => {
  const HOUSE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  const KIRA_ID = '11111111-1111-4111-8111-111111111102';

  /** María es ADMIN de Casa Vallejo y CAREGIVER del hogar B (de Lucía), donde se asignó Kira (de Andrés) y de donde se retiró de Casa Vallejo. */
  async function twoHouseholds(e: ShareEngine): Promise<void> {
    await e.run(async (r) => {
      await r.households.insert({ id: HOUSE_B, name: 'Hogar B', ownerUserId: LUCIA, createdAt: NOW });
      await r.households.saveMembership({ membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc91', householdId: HOUSE_B, userId: LUCIA, role: 'OWNER', status: 'ACTIVE', joinedAt: NOW, firstJoinedAt: NOW, updatedAt: NOW });
      await r.households.saveMembership({ membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc92', householdId: HOUSE_B, userId: MARIA, role: 'CAREGIVER', status: 'ACTIVE', joinedAt: NOW, firstJoinedAt: NOW, updatedAt: NOW });
      await r.assignments.remove(KIRA_ID, HOUSEHOLD_ID);
      await r.assignments.save({ petId: KIRA_ID, householdId: HOUSE_B, assignedByUserId: ANDRES, assignedAt: NOW });
    });
  }

  it('[SC-005-048][INV-ACC2-001] ADMIN en un hogar y CAREGIVER en otro: ni el enlace PET de la mascota que solo ve por el segundo ni el HOUSEHOLD del segundo (ERR-ACC-FORBIDDEN); el HOUSEHOLD del primero sí', async () => {
    await eachEngine('ADMIN', async (e) => {
      await twoHouseholds(e);
      expect(await codeOf(create(e, MARIA, { scope: 'PET', petId: KIRA_ID }, KEY(1)))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(create(e, MARIA, { scope: 'HOUSEHOLD', householdId: HOUSE_B }, KEY(2)))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(list(e, MARIA, { scope: 'PET', petId: KIRA_ID }))).toBe('ERR-ACC-FORBIDDEN');
      const own = await created(e, MARIA, HOUSE_REF, 3);
      expect((await summary(e, own.token)).summary.pets.map((p) => p.profile.name)).toEqual(['Luna']);
    });
  });

  it('[SC-005-048][SC-005-039] un hogar que no es tuyo es 404 y el enlace de un hogar nunca entrega mascotas de otro; si pasa a ADMIN del segundo, el conjunto sigue siendo solo lo que posee', async () => {
    await eachEngine('ADMIN', async (e) => {
      await twoHouseholds(e);
      expect(await codeOf(create(e, ANDRES, { scope: 'HOUSEHOLD', householdId: HOUSE_B }, KEY(1)))).toBe('ERR-HOUSE-NOT-FOUND');
      await e.run(async (r) => {
        const m = (await r.households.listMembershipsOfUsers([MARIA])).find((x) => x.householdId === HOUSE_B)!;
        await r.households.saveMembership({ ...m, role: 'ADMIN' });
      });
      // María es ahora ADMIN de B, pero Kira es de Andrés: el conjunto del enlace HOUSEHOLD de B es vacío para ella (D5-19) y la PET de Kira sí es posible por su rol efectivo.
      expect(await codeOf(create(e, MARIA, { scope: 'HOUSEHOLD', householdId: HOUSE_B }, KEY(2)))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(create(e, MARIA, { scope: 'PET', petId: KIRA_ID }, KEY(3)))).toBe('OK');
      const viaKira = await e.run((r) => r.shareLinks.findByIdempotencyKey(MARIA, KEY(3)));
      expect(viaKira!.petOwnerUserIdAtCreation).toBe(ANDRES);
    });
  });
});

describe('T769 tope de 20 enlaces activos por alcance (REQ-VET-012, SC-005-038, EDGE-005-15)', () => {
  it('[SC-005-038] el 21.º es ERR-SHARE-LINK-LIMIT 409; vencidos y revocados no cuentan; revocar uno permite otro', async () => {
    await eachEngine(null, async (e) => {
      const ids: string[] = [];
      for (let n = 1; n <= 20; n += 1) ids.push((await created(e, ANDRES, PET_REF, n)).link.id);
      expect(await codeOf(create(e, ANDRES, PET_REF, KEY(21)))).toBe('ERR-SHARE-LINK-LIMIT');
      await revoke(e, ANDRES, ids[0]!);
      expect((await created(e, ANDRES, PET_REF, 22)).kind).toBe('CREATED');
      expect(await codeOf(create(e, ANDRES, PET_REF, KEY(23)))).toBe('ERR-SHARE-LINK-LIMIT');
      e.setNow('2026-11-26T12:00:00.000Z');
      expect((await created(e, ANDRES, PET_REF, 24)).kind).toBe('CREATED');
    });
  });

  it('[SC-005-038] el tope es por mascota: 20 enlaces de Argos no impiden uno de Kira', async () => {
    await eachEngine(null, async (e) => {
      for (let n = 1; n <= 20; n += 1) await created(e, ANDRES, PET_REF, n);
      expect(await codeOf(create(e, ANDRES, { scope: 'PET', petId: KIRA }, KEY(30)))).toBe('OK');
    });
  });

  it('[EDGE-005-15][SC-005-038] con 19 enlaces HOUSEHOLD, dos creadores distintos (propietario y ADMIN) que crean a la vez dejan exactamente 20 y el segundo recibe 409', async () => {
    await eachEngine('ADMIN', async (e) => {
      for (let n = 1; n <= 19; n += 1) await created(e, ANDRES, HOUSE_REF, n);
      const results = await Promise.allSettled([create(e, ANDRES, HOUSE_REF, KEY(100)), create(e, MARIA, HOUSE_REF, KEY(101))]);
      const codes = await Promise.all(results.map(async (r) => (r.status === 'fulfilled' ? 'OK' : r.reason instanceof Error && 'code' in r.reason ? String((r.reason as { code: unknown }).code) : 'otro')));
      expect(codes.sort()).toEqual(['ERR-SHARE-LINK-LIMIT', 'OK']);
      expect((await e.rows()).filter((row) => row.scope === 'HOUSEHOLD')).toHaveLength(20);
    });
  });
});

describe('T756 listado (REQ-VET-001, REQ-VET-005, SC-005-025)', () => {
  it('[SC-005-015][INV-005-005] lista solo metadatos (nunca token ni hash), con activeCount y maxActiveLinks, orden (createdAt DESC, id DESC)', async () => {
    await eachEngine(null, async (e) => {
      const first = await created(e, ANDRES, PET_REF, 1);
      e.setNow('2026-11-18T13:00:00.000Z');
      const second = await created(e, ANDRES, PET_REF, 2);
      const result = await list(e, ANDRES, PET_REF);
      expect(validateShareLinkList(result)).toBe(true);
      expect(result).toMatchObject({ activeCount: 2, maxActiveLinks: 20 });
      expect(result.items.map((i) => i.id)).toEqual([second.link.id, first.link.id]);
      const text = JSON.stringify(result);
      for (const secret of [first.token, second.token, hashToken(first.token), hashToken(second.token), 'tokenHash', 'idempotency']) expect(text).not.toContain(secret);
    });
  });

  it('[REQ-VET-013] incluye los activos y los vencidos o revocados de los últimos 30 días; descarta los anteriores; el estado se deriva del reloj', async () => {
    await eachEngine(null, async (e) => {
      const old = await created(e, ANDRES, PET_REF, 1, { expiresInDays: 1 });
      const keep = await created(e, ANDRES, PET_REF, 2, { expiresInDays: 7 });
      e.setNow('2026-12-20T12:00:00.000Z');
      expect((await list(e, ANDRES, PET_REF)).items.map((i) => [i.id, i.status])).toEqual([[keep.link.id, 'EXPIRED']]);
      e.setNow('2026-11-20T12:00:00.000Z');
      expect(new Map((await list(e, ANDRES, PET_REF)).items.map((i) => [i.id, i.status]))).toEqual(new Map([[old.link.id, 'EXPIRED'], [keep.link.id, 'ACTIVE']]));
      expect((await list(e, ANDRES, PET_REF)).activeCount).toBe(1);
    });
  });

  it('[SC-005-025][SC-005-048] listar exige CREATE_SHARE_LINK: CAREGIVER/READER 403; ajeno 404; el alcance HOUSEHOLD usa el rol en el hogar', async () => {
    await eachEngine('CAREGIVER', async (e) => {
      expect(await codeOf(list(e, MARIA, PET_REF))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(list(e, MARIA, HOUSE_REF))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(list(e, LUCIA, PET_REF))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(list(e, LUCIA, HOUSE_REF))).toBe('ERR-HOUSE-NOT-FOUND');
      expect(await codeOf(list(e, ANDRES, HOUSE_REF))).toBe('OK');
    });
  });
});

describe('T757 revocación (REQ-VET-005, STATE-SHARE-001, MIF-005-08)', () => {
  it('[SC-005-019] revocar marca revoked_at (no borra la fila), escribe REVOKED una sola vez y es idempotente', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      await revoke(e, ANDRES, r.link.id);
      const rows = await e.rows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.revokedAt).toBe(NOW);
      await revoke(e, ANDRES, r.link.id);
      const audit = (await e.audit()).filter((a) => a.eventType === 'REVOKED');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ shareLinkId: r.link.id, actorUserId: ANDRES, ipHmac: null });
      expect((await list(e, ANDRES, PET_REF)).items[0]!.status).toBe('REVOKED');
    });
  });

  it('[MIF-005-08][STATE-SHARE-001] revocar un enlace VENCIDO es un no-op: sin escritura ni auditoría y sigue VENCIDO', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e, ANDRES, PET_REF, 1, { expiresInDays: 1 });
      e.setNow('2026-11-19T12:00:00.000Z');
      const auditBefore = (await e.audit()).length;
      await expect(revoke(e, ANDRES, r.link.id)).resolves.toBeUndefined();
      expect((await e.rows())[0]!.revokedAt).toBeNull();
      expect(await e.audit()).toHaveLength(auditBefore);
      expect((await list(e, ANDRES, PET_REF)).items[0]!.status).toBe('EXPIRED');
    });
  });

  it('[SC-005-046] revocan el creador, el propietario legal (PET) y el propietario o ADMIN del hogar (HOUSEHOLD); un tercero y un inexistente reciben el mismo ERR-SHARE-NOT-FOUND', async () => {
    await eachEngine('ADMIN', async (e) => {
      const byMaria = await created(e, MARIA, PET_REF, 1);
      const byAndres = await created(e, ANDRES, HOUSE_REF, 2);
      const forLucia = await errorOf(revoke(e, LUCIA, byMaria.link.id));
      const missing = await errorOf(revoke(e, ANDRES, '99999999-9999-4999-8999-999999999999'));
      expect(forLucia.toProblemDetails('/x')).toEqual(missing.toProblemDetails('/x'));
      expect(forLucia.code).toBe('ERR-SHARE-NOT-FOUND');
      await revoke(e, ANDRES, byMaria.link.id); // propietario legal de Argos
      await revoke(e, MARIA, byAndres.link.id); // ADMIN del hogar
      expect((await e.rows()).every((row) => row.revokedAt === NOW)).toBe(true);
    });
  });

  it('[SC-005-046] un CAREGIVER del hogar ni siquiera ve la existencia del enlace de otro: ERR-SHARE-NOT-FOUND', async () => {
    await eachEngine('CAREGIVER', async (e) => {
      const r = await created(e, ANDRES, PET_REF, 1);
      expect(await codeOf(revoke(e, MARIA, r.link.id))).toBe('ERR-SHARE-NOT-FOUND');
      expect((await e.rows())[0]!.revokedAt).toBeNull();
    });
  });
});

describe('T755 resolver y resumen público (REQ-VET-002, REQ-VET-006, INV-005-001, SC-005-016/017)', () => {
  it('[SC-005-016][INV-005-001] un enlace PET de Argos devuelve solo a Argos: envoltorio SharedSummaryView válido, validUntil y un único now', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      e.resetCalls();
      const view = await summary(e, r.token);
      expect(e.clockReads()).toBe(1);
      expect(validateSharedSummaryView(view)).toBe(true);
      expect(view.summary).toMatchObject({ scope: 'PET', generatedAt: NOW, disclosure: { microchipIncluded: false, clinicalFilesIncluded: false } });
      expect(view.summary.pets.map((p) => p.profile.name)).toEqual(['Argos']);
      expect(view).toMatchObject({ fileLabels: [], validUntil: '2026-11-25T12:00:00.000Z' });
    });
  });

  it('[REQ-VET-002][D5-05][SC-005-017] HOUSEHOLD es dinámico: nuevas mascotas entran, las retiradas salen al instante y con el conjunto vacío responde 404', async () => {
    await eachEngine('ADMIN', async (e) => {
      const r = await created(e, MARIA, HOUSE_REF, 1);
      expect((await summary(e, r.token)).summary.pets.map((p) => p.profile.name)).toEqual(['Luna']);
      await e.run((r2) => r2.assignments.remove(LUNA.id, HOUSEHOLD_ID));
      expect(await codeOf(summary(e, r.token))).toBe('ERR-SHARE-NOT-FOUND');
      await e.run((r2) => r2.assignments.save({ petId: LUNA.id, householdId: HOUSEHOLD_ID, assignedByUserId: MARIA, assignedAt: NOW }));
      expect((await summary(e, r.token)).summary.pets.map((p) => p.profile.name)).toEqual(['Luna']);
      const owner = await created(e, ANDRES, HOUSE_REF, 2);
      expect((await summary(e, owner.token)).summary.pets.map((p) => p.profile.name)).toEqual(['Argos', 'Kira', 'Milo', 'Nyx', 'Toby']);
      await e.run((r2) => r2.assignments.remove(KIRA, HOUSEHOLD_ID));
      expect((await summary(e, owner.token)).summary.pets.map((p) => p.profile.name)).not.toContain('Kira');
    });
  });

  it('[SC-005-016] el token de una mascota nunca entrega a otra mascota del mismo propietario (no hay selector ni petId del cliente)', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      const view = await summary(e, r.token);
      expect(JSON.stringify(view)).not.toContain('Kira');
      expect(view.summary.pets).toHaveLength(1);
    });
  });

  it('[REQ-VET-007][INV-005-007][SC-005-021] inexistente, mal formado, vencido, revocado y creador sin autoridad dan el mismo error, el mismo cuerpo y la misma secuencia de puertos', async () => {
    await eachEngine('ADMIN', async (e) => {
      const live = await created(e, MARIA, PET_REF, 1);
      const expired = await created(e, MARIA, PET_REF, 2, { expiresInDays: 1 });
      const revoked = await created(e, MARIA, PET_REF, 3);
      await revoke(e, MARIA, revoked.link.id);
      e.setNow('2026-11-19T12:00:00.000Z');
      // el creador pierde autoridad: se degrada a READER
      const lost = await created(e, MARIA, PET_REF, 4);
      await e.run(async (r) => {
        const membership = (await r.households.listMembershipsOfUsers([MARIA])).find((m) => m.householdId === HOUSEHOLD_ID)!;
        await r.households.saveMembership({ ...membership, role: 'READER' });
      });
      const tokens = { 'inexistente': 'x'.repeat(43), 'mal formado': 'corto', 'vencido': expired.token, 'revocado': revoked.token, 'sin autoridad': lost.token, 'vacío': '', 'largo': 'y'.repeat(300) };
      const outcomes: Array<{ label: string; error: ReturnType<typeof errorOf> extends Promise<infer T> ? T : never; sequence: string[] }> = [];
      for (const [label, token] of Object.entries(tokens)) {
        e.limiter.reset();
        e.resetCalls();
        const error = await errorOf(summary(e, token));
        outcomes.push({ label, error, sequence: [...e.calls] });
      }
      void live;
      const reference = outcomes[0]!;
      for (const o of outcomes) {
        expect(o.error.code, o.label).toBe('ERR-SHARE-NOT-FOUND');
        expect(o.error.toProblemDetails('/shared'), o.label).toEqual(reference.error.toProblemDetails('/shared'));
        expect(o.sequence, `${o.label}: misma secuencia de puertos`).toEqual(reference.sequence);
      }
      expect(reference.sequence).toContain('shareLinks.findByTokenHash');
    });
  });

  it('[REQ-VET-011][SC-005-037] el creador degradado, retirado del hogar o con la mascota transferida da 404 sin borrar la fila; si recupera la autoridad vuelve a resolver', async () => {
    await eachEngine('ADMIN', async (e) => {
      const r = await created(e, MARIA, PET_REF, 1);
      expect((await summary(e, r.token)).summary.pets).toHaveLength(1);
      const setRole = (role: 'ADMIN' | 'READER') =>
        e.run(async (rr) => {
          const m = (await rr.households.listMembershipsOfUsers([MARIA])).find((x) => x.householdId === HOUSEHOLD_ID)!;
          await rr.households.saveMembership({ ...m, role });
        });
      await setRole('READER');
      expect(await codeOf(summary(e, r.token))).toBe('ERR-SHARE-NOT-FOUND');
      expect(await e.rows()).toHaveLength(1);
      await setRole('ADMIN');
      expect((await summary(e, r.token)).summary.pets).toHaveLength(1);
      await e.run(async (rr) => {
        const m = (await rr.households.listMembershipsOfUsers([MARIA])).find((x) => x.householdId === HOUSEHOLD_ID)!;
        await rr.households.saveMembership({ ...m, status: 'LEFT' });
      });
      expect(await codeOf(summary(e, r.token))).toBe('ERR-SHARE-NOT-FOUND');
    });
  });

  it('[PN-08][EDGE-005-20][SC-005-037] el enlace PET muere con la transferencia de propiedad aunque el ex-propietario conserve rol ADMIN (creado como OWNER o como ADMIN)', async () => {
    await eachEngine('ADMIN', async (e) => {
      const byOwner = await created(e, ANDRES, PET_REF, 1);
      const byAdmin = await created(e, MARIA, PET_REF, 2);
      expect((await summary(e, byOwner.token)).summary.pets).toHaveLength(1);
      expect((await summary(e, byAdmin.token)).summary.pets).toHaveLength(1);
      await e.run(async (r) => {
        const pet = (await r.pets.findById(ARGOS.id))!;
        await r.pets.save({ ...pet, ownerUserId: MARIA });
        const andres = (await r.households.listMembershipsOfUsers([ANDRES])).find((m) => m.householdId === HOUSEHOLD_ID)!;
        await r.households.saveMembership({ ...andres, role: 'ADMIN', isHouseholdOwner: false });
      });
      expect(await codeOf(summary(e, byOwner.token))).toBe('ERR-SHARE-NOT-FOUND');
      expect(await codeOf(summary(e, byAdmin.token))).toBe('ERR-SHARE-NOT-FOUND');
      expect(await e.rows()).toHaveLength(2);
    });
  });

  it('[STATE-SHARE-001][SC-005-018] el instante exacto de caducidad ya responde 404; un milisegundo antes sirve', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e, ANDRES, PET_REF, 1, { expiresInDays: 1 });
      e.setNow('2026-11-19T11:59:59.999Z');
      expect((await summary(e, r.token)).summary.pets).toHaveLength(1);
      e.setNow('2026-11-19T12:00:00.000Z');
      expect(await codeOf(summary(e, r.token))).toBe('ERR-SHARE-NOT-FOUND');
    });
  });

  it('[D5-14][SC-005-040] el microchip aparece solo si el enlace lo incluyó; sin archivos, fileLabels es [] y disclosure lo refleja', async () => {
    await eachEngine(null, async (e) => {
      await e.run(async (r) => r.pets.save({ ...(await r.pets.findById(ARGOS.id))!, microchipId: '982000123456789' }));
      const off = await created(e, ANDRES, PET_REF, 1);
      const on = await created(e, ANDRES, PET_REF, 2, { includeMicrochip: true });
      expect(JSON.stringify(await summary(e, off.token))).not.toContain('982000123456789');
      const withChip = await summary(e, on.token);
      expect(withChip.summary.pets[0]!.profile.microchipId).toBe('982000123456789');
      expect(withChip.summary.disclosure).toEqual({ microchipIncluded: true, clinicalFilesIncluded: false });
    });
  });
});

describe('T762 auditoría de accesos (REQ-VET-008, SC-005-022)', () => {
  it('[SC-005-022] un acceso válido escribe ACCESS_OK con el HMAC de la IP (nunca la IP, el token ni el hash); los fallos se agregan por (ip_hmac, ventana)', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      await summary(e, r.token);
      for (let n = 0; n < 3; n += 1) await codeOf(summary(e, 'nope'.repeat(11)));
      const audit = await e.audit();
      const ok = audit.filter((a) => a.eventType === 'ACCESS_OK');
      const failed = audit.filter((a) => a.eventType === 'ACCESS_FAILED');
      expect(ok).toHaveLength(1);
      expect(ok[0]).toMatchObject({ shareLinkId: r.link.id, actorUserId: null });
      expect(ok[0]!.ipHmac).toMatch(/^[0-9a-f]{64}$/);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ shareLinkId: null, failCount: 3, occurredAt: '2026-11-18T12:00:00.000Z' });
      const text = JSON.stringify(audit);
      for (const secret of [IP, r.token, hashToken(r.token), 'nope'.repeat(11)]) expect(text).not.toContain(secret);
    });
  });

  it('[REQ-VET-008] si la auditoría de un acceso válido falla, no se sirve el resumen (fail-closed, error interno)', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      const failing = { ...e.deps, auditIds: { nextId: () => { throw new Error('auditoría caída'); } } };
      await expect(new GetSharedSummaryUseCase(failing).execute(r.token, IP)).rejects.toThrow('auditoría caída');
    });
  });

  it('[REQ-VET-007] 20 fallos desde una IP dejan pasar el 21.º como ERR-SHARE-RATE-LIMITED sin resolver el token ni escribir; otra IP no se ve afectada', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e);
      for (let n = 0; n < 20; n += 1) expect(await codeOf(summary(e, `${n}`.padStart(43, 'z')))).toBe('ERR-SHARE-NOT-FOUND');
      e.resetCalls();
      expect(await codeOf(summary(e, r.token))).toBe('ERR-SHARE-RATE-LIMITED');
      expect(e.calls).toEqual([]);
      expect((await summary(e, r.token, '198.51.100.9')).summary.pets).toHaveLength(1);
    });
  });
});

describe('T763 archivos clínicos por el enlace (REQ-VET-009, SC-005-023, SC-005-035, SC-005-036, EDGE-005-23)', () => {
  const FILE_ID = '88888888-8888-4888-8888-888888888801';
  const PHOTO_ID = '88888888-8888-4888-8888-888888888802';
  const KIRA_FILE = '88888888-8888-4888-8888-888888888803';

  async function seedMedia(e: ShareEngine) {
    await e.run(async (r) => {
      await r.media.insert({ id: FILE_ID, petId: ARGOS.id, kind: 'FILE', mime: 'application/pdf', sizeBytes: 2048, originalName: 'Análisis Luna.pdf', createdAt: '2026-11-10T10:00:00.000Z' });
      await r.media.insert({ id: PHOTO_ID, petId: ARGOS.id, kind: 'PHOTO', mime: 'image/png', sizeBytes: 1024, originalName: 'foto.png', createdAt: '2026-11-10T10:01:00.000Z' });
      await r.media.insert({ id: KIRA_FILE, petId: KIRA, kind: 'FILE', mime: 'application/pdf', sizeBytes: 512, originalName: 'otra.pdf', createdAt: '2026-11-10T10:02:00.000Z' });
    });
    await e.base.storage.put(`pets/${ARGOS.id}/files/${FILE_ID}`, PDF(32), 'application/pdf');
    await e.base.storage.put(`pets/${ARGOS.id}/photos/${PHOTO_ID}`, PNG(32), 'image/png');
  }
  const file = (e: ShareEngine, token: string, mediaId: string) => new GetSharedFileUseCase(e.deps).execute(token, mediaId, IP);

  it('[SC-005-035][INV-005-009] con includeClinicalFiles el resumen lista el archivo SIN nombre y fileLabels lleva {fileId, displayName}; nunca el álbum', async () => {
    await eachEngine(null, async (e) => {
      await seedMedia(e);
      const r = await created(e, ANDRES, PET_REF, 1, { includeClinicalFiles: true });
      const view = await summary(e, r.token);
      expect(validateSharedSummaryView(view)).toBe(true);
      expect(view.summary.pets[0]!.clinicalFiles.map((f) => f.id)).toEqual([FILE_ID]);
      expect(view.fileLabels).toEqual([{ fileId: FILE_ID, displayName: 'Análisis Luna.pdf' }]);
      expect(JSON.stringify(view.summary)).not.toContain('Análisis Luna');
      expect(JSON.stringify(view)).not.toContain(PHOTO_ID);
      const plain = await created(e, ANDRES, PET_REF, 2);
      expect(await summary(e, plain.token)).toMatchObject({ fileLabels: [] });
    });
  });

  it('[EDGE-005-27] un nombre vacío tras el saneado se rotula «Archivo» en fileLabels', async () => {
    await eachEngine(null, async (e) => {
      await seedMedia(e);
      await e.run(async (r) => {
        await r.media.remove(ARGOS.id, FILE_ID);
        await r.media.insert({ id: FILE_ID, petId: ARGOS.id, kind: 'FILE', mime: 'application/pdf', sizeBytes: 2048, originalName: '‮​  ', createdAt: '2026-11-10T10:00:00.000Z' });
      });
      const r = await created(e, ANDRES, PET_REF, 1, { includeClinicalFiles: true });
      expect((await summary(e, r.token)).fileLabels).toEqual([{ fileId: FILE_ID, displayName: 'Archivo' }]);
    });
  });

  it('[SC-005-023][SC-005-036][INV-005-008] el FILE del alcance devuelve una URL firmada nueva con TTL 300 s; sin la casilla, PHOTO, de otra mascota o inexistente = mismo 404', async () => {
    await eachEngine(null, async (e) => {
      await seedMedia(e);
      const withFiles = await created(e, ANDRES, PET_REF, 1, { includeClinicalFiles: true });
      const without = await created(e, ANDRES, PET_REF, 2);
      const { url } = await file(e, withFiles.token, FILE_ID);
      expect(url).toMatch(/^https:\/\/.+X-Goog-Expires=300$/);
      expect(url).not.toContain('Análisis');
      const errors = [];
      for (const [token, mediaId] of [[withFiles.token, PHOTO_ID], [withFiles.token, KIRA_FILE], [withFiles.token, 'no-es-uuid'], [without.token, FILE_ID], ['x'.repeat(43), FILE_ID]] as const) {
        errors.push(await errorOf(file(e, token, mediaId)));
        e.limiter.reset();
      }
      for (const err of errors) expect(err.toProblemDetails('/shared')).toEqual(errors[0]!.toProblemDetails('/shared'));
      expect(errors[0]!.code).toBe('ERR-SHARE-NOT-FOUND');
    });
  });

  it('[EDGE-005-23] X-Goog-Expires = min(300, restante) con mínimo 1 s; con menos de 1 s restante no se emite URL y responde el 404 uniforme', async () => {
    await eachEngine(null, async (e) => {
      await seedMedia(e);
      const r = await created(e, ANDRES, PET_REF, 1, { includeClinicalFiles: true, expiresInDays: 1 });
      e.setNow('2026-11-19T11:55:00.000Z');
      expect((await file(e, r.token, FILE_ID)).url).toMatch(/X-Goog-Expires=300$/);
      e.setNow('2026-11-19T11:57:30.000Z');
      expect((await file(e, r.token, FILE_ID)).url).toMatch(/X-Goog-Expires=150$/);
      e.setNow('2026-11-19T11:59:59.000Z');
      expect((await file(e, r.token, FILE_ID)).url).toMatch(/X-Goog-Expires=1$/);
      e.setNow('2026-11-19T11:59:59.500Z');
      expect(await codeOf(file(e, r.token, FILE_ID))).toBe('ERR-SHARE-NOT-FOUND');
    });
  });

  it('[INV-005-002] la ruta de archivos re-resuelve el token sin construir el resumen: no lee registros clínicos', async () => {
    await eachEngine(null, async (e) => {
      await seedMedia(e);
      const r = await created(e, ANDRES, PET_REF, 1, { includeClinicalFiles: true });
      e.resetCalls();
      await file(e, r.token, FILE_ID);
      expect(e.calls.filter((c) => c.startsWith('records.'))).toEqual([]);
    });
  });
});

describe('T776 vista previa autenticada del propietario (D5-15, REQ-SUM-004)', () => {
  it('[REQ-SUM-004][D5-15] la vista previa refleja las casillas, no crea fila ni auditoría, validUntil es null y exige CREATE_SHARE_LINK (404 si ajena)', async () => {
    await eachEngine('CAREGIVER', async (e) => {
      const preview = new PreviewClinicalSummaryUseCase(e.deps);
      const view = await preview.execute(ANDRES, PET_REF, { includeMicrochip: 'true', includeClinicalFiles: 'false' });
      expect(validateSharedSummaryView(view)).toBe(true);
      expect(view.validUntil).toBeNull();
      expect(view.summary.disclosure).toEqual({ microchipIncluded: true, clinicalFilesIncluded: false });
      expect(await codeOf(preview.execute(MARIA, PET_REF, {}))).toBe('ERR-ACC-FORBIDDEN');
      expect(await codeOf(preview.execute(LUCIA, PET_REF, {}))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(preview.execute(LUCIA, HOUSE_REF, {}))).toBe('ERR-HOUSE-NOT-FOUND');
      expect(await codeOf(preview.execute(ANDRES, PET_REF, { includeMicrochip: 'maybe' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await e.rows()).toHaveLength(0);
      expect(await e.audit()).toHaveLength(0);
      const household = await preview.execute(ANDRES, HOUSE_REF, {});
      expect(household.summary.scope).toBe('HOUSEHOLD');
      expect(household.summary.pets.map((p) => p.profile.name)).toEqual(['Argos', 'Kira', 'Milo', 'Nyx', 'Toby']);
    });
  });

  it('[MIF-005-04] la vista previa y la ruta pública comparten el mismo camino: el mismo conjunto y las mismas listas para el mismo instante', async () => {
    await eachEngine(null, async (e) => {
      const r = await created(e, ANDRES, PET_REF, 1);
      const real = await summary(e, r.token);
      const preview = await new PreviewClinicalSummaryUseCase(e.deps).execute(ANDRES, PET_REF, {});
      expect(preview.summary).toEqual(real.summary);
    });
  });
});
