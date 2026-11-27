import { afterEach, describe, expect, it } from 'vitest';
import { OpenAbsenceDisputeUseCase, RespondAbsenceDisputeUseCase } from '../../src/application/use-cases/absence-dispute-use-cases.ts';
import type { OwnerRequestRecord } from '../../src/application/ports/co-ownership.port.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, PET, allRequestRows, cases, codeOf, makeCoOwners, requestRows, unshare, type Engine012 } from '../fixtures/co-ownership-012.ts';

/**
 * T1627 (Feature 012, Bloque A, #22; `/keymaker`): disparador y ancla de la disputa por ausencia sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`) con el reloj de pruebas: apertura con el disparador
 * SELLADO, 404 uniforme a quien no es propietario ACTIVE, `ERR-CHP12-ABSENCE-NOT-ELIGIBLE` sin causa, ancla `(pet_id, target_user_id)`, congelación por `pet_id` que permite `LEAVE` (`moot_reason = TARGET_LEFT`),
 * condición de sesión del `target` y respuesta única (≤ 280 puntos de código).
 *
 * @implements REQ-OWN12-009, REQ-OWN12-011, INV-OWN12-004, INV-OWN12-006, SC-012-091, SC-012-092, SC-012-093, SC-012-102, SC-012-114, SC-012-115
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const DAY = 86_400_000;
const B = '2027-01-01T00:00:00.000Z';
const at = (days: number): string => new Date(Date.parse(B) + days * DAY).toISOString();
const NOW = at(30);
const ID = (n: number): string => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TOKEN = 'sesion-del-target-012';

const expired = (id: string, over: Partial<OwnerRequestRecord> = {}): OwnerRequestRecord => ({
  id, action: 'INVITE_CO_OWNER', petId: PET, petVersion: 1, requesterUserId: ANDRES, requesterPseudonym: null, targetUserId: null, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
  status: 'EXPIRED', approverSet: [MARIA], approvals: [], rejectedBy: null, rejectedByPseudonym: null, message: null, createdAt: B, expiresAt: at(7), decidedAt: at(7), staleReason: null, disputeReason: null,
  chipLast4: null, chipHmac: null, frozenUntil: null, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: null, resolution: null, mootReason: null, resolvedByUserId: null, secondApproverUserId: null,
  executesAfter: null, version: 1, ...over,
});

/** ANDRES principal, MARIA co-propietaria y dos solicitudes secuenciales ya vencidas por TTL con MARIA como aprobadora; el reloj queda en `NOW` (B + 30 días). */
async function scenario(e: Engine012, options: { second?: boolean; mariaActiveAt?: string | null } = {}): Promise<void> {
  await unshare(e.deps);
  await makeCoOwners(e, [MARIA]);
  await e.run(async (r) => {
    await r.ownerRequests.insert(expired(ID(1)));
    if (options.second !== false) await r.ownerRequests.insert(expired(ID(2), { action: 'TRANSFER_PRINCIPAL', createdAt: at(7), expiresAt: at(14), decidedAt: at(14) }));
    if (options.mariaActiveAt !== undefined && options.mariaActiveAt !== null) await r.sessions.save(TOKEN, { userId: MARIA, createdAt: options.mariaActiveAt, lastActivityAt: options.mariaActiveAt, revokedAt: null });
  });
  e.setNow(NOW);
}
const open = (e: Engine012, actor: string, targetUserId: string, disputeReason = 'CO_OWNER_ABSENT_OR_BLOCKING' as 'CO_OWNER_ABSENT_OR_BLOCKING' | 'PRINCIPAL_ABSENT') =>
  new OpenAbsenceDisputeUseCase(e.deps).execute(actor, PET, { targetUserId, disputeReason });
const disputes = async (e: Engine012) => (await allRequestRows(e)).filter((r) => r['action'] === 'CHIP_DISPUTE');

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1627 disputa por ausencia (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-091][N2-R1] con el disparador cumplido se abre UNDER_REVIEW, se SELLAN los ids de las solicitudes y se congela 30 días con SLA de 15 días hábiles', async () => {
      engine = await factory.make();
      await scenario(engine);
      const result = await open(engine, ANDRES, MARIA);
      expect(result).toEqual({ status: 'UNDER_REVIEW', frozenUntil: at(60), slaDueAt: '2027-02-19T00:00:00.000Z' }); // 2027-01-31 es domingo: +15 hábiles = viernes 2027-02-19
      const [dispute] = await disputes(engine);
      expect(dispute).toMatchObject({ status: 'UNDER_REVIEW', disputeReason: 'CO_OWNER_ABSENT_OR_BLOCKING', requesterUserId: ANDRES, targetUserId: MARIA, petId: PET, triggerRequestIds: [ID(1), ID(2)], chipHmac: null, chipLast4: null, approverSet: [], expiresAt: at(90) });
      expect(await engine.auditTypes(PET)).toContain('ABSENCE_DISPUTE_OPENED');
    });

    it('[SC-012-091] sin disparador (una sola solicitud expirada) o con una sesión del target posterior a la más antigua: ERR-CHP12-ABSENCE-NOT-ELIGIBLE y no se crea fila', async () => {
      engine = await factory.make();
      await scenario(engine, { second: false });
      expect(await codeOf(open(engine, ANDRES, MARIA))).toBe('ERR-CHP12-ABSENCE-NOT-ELIGIBLE');
      await engine.dispose();
      engine = await factory.make();
      await scenario(engine, { mariaActiveAt: at(20) });
      expect(await codeOf(open(engine, ANDRES, MARIA))).toBe('ERR-CHP12-ABSENCE-NOT-ELIGIBLE');
      expect(await disputes(engine)).toEqual([]);
      await engine.dispose();
      engine = await factory.make();
      await scenario(engine, { mariaActiveAt: at(-3) }); // última sesión ANTES de la primera solicitud: cumple
      expect(await codeOf(open(engine, ANDRES, MARIA))).toBe('OK');
    });

    it('[INV-OWN12-004][H-04] quien no es propietario ACTIVE, o un target que no es de esa mascota, recibe el MISMO 404 uniforme; el 409 de inelegibilidad solo llega a propietarios', async () => {
      engine = await factory.make();
      await scenario(engine);
      expect(await codeOf(open(engine, CARLOS, MARIA))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(open(engine, CARLOS, ID(9)))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(open(engine, ANDRES, CARLOS))).toBe('ERR-PET-NOT-FOUND'); // existe como usuario pero no es de esa mascota
      expect(await codeOf(open(engine, ANDRES, ANDRES))).toBe('ERR-CHP12-ABSENCE-NOT-ELIGIBLE');
      expect(await codeOf(open(engine, ANDRES, MARIA, 'PRINCIPAL_ABSENT'))).toBe('ERR-CHP12-ABSENCE-NOT-ELIGIBLE'); // la variante no corresponde al target
      expect(await disputes(engine)).toEqual([]);
    });

    it('[SC-012-092] la ancla (pet_id, target_user_id) es única: una segunda apertura es ERR-CHP12-ABSENCE-NOT-ELIGIBLE', async () => {
      engine = await factory.make();
      await scenario(engine);
      await open(engine, ANDRES, MARIA);
      expect(await codeOf(open(engine, ANDRES, MARIA))).toBe('ERR-CHP12-ABSENCE-NOT-ELIGIBLE');
      expect(await disputes(engine)).toHaveLength(1);
    });

    it('[SC-012-092] mientras la disputa está UNDER_REVIEW se congela la mascota (crear solicitud, invitar, aprobar) pero LEAVE sigue permitido y, si sale el target, la disputa queda sin efecto (TARGET_LEFT, sin cooldown)', async () => {
      engine = await factory.make();
      await scenario(engine);
      const use = cases(engine.deps);
      engine.setNow(at(29));
      const pending = await use.request(ANDRES, PET, { action: 'DELETE_PET' }); // creada ANTES de la disputa; DELETE_PET no cuenta para el disparador
      engine.setNow(NOW);
      await open(engine, ANDRES, MARIA);
      expect(await codeOf(use.request(ANDRES, PET, { action: 'CHANGE_PRINCIPAL', targetUserId: MARIA }))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect(await codeOf(use.invite(ANDRES, PET, 'zz.nadie'))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect(await codeOf(use.approve(MARIA, pending.id))).toBe('ERR-CHP12-CHIP-FROZEN');
      expect((await requestRows(engine, PET)).find((r) => r['id'] === pending.id)).toMatchObject({ status: 'PENDING' });
      expect(await codeOf(use.leave(MARIA, PET))).toBe('OK'); // la congelación permite LEAVE
      expect((await disputes(engine))[0]).toMatchObject({ status: 'RESOLVED', resolution: 'REJECT', mootReason: 'TARGET_LEFT', targetResponse: null });
      expect(await codeOf(use.request(ANDRES, PET, { action: 'DELETE_PET' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED'); // ya sin co-propietarios y sin congelación: un único propietario no crea solicitudes
    });

    it('[SC-012-093] variante PRINCIPAL_ABSENT: un co-propietario abre la disputa contra el principal cuando las solicitudes lo tenían como aprobador y el principal no votó', async () => {
      engine = await factory.make();
      await scenario(engine);
      await engine.run(async (r) => {
        for (const id of [ID(1), ID(2)]) await r.ownerRequests.update({ ...(await r.ownerRequests.findById(id))!, requesterUserId: MARIA, approverSet: [ANDRES] }, 'EXPIRED');
      });
      expect(await codeOf(open(engine, MARIA, ANDRES, 'PRINCIPAL_ABSENT'))).toBe('OK');
      expect((await disputes(engine))[0]).toMatchObject({ disputeReason: 'PRINCIPAL_ABSENT', requesterUserId: MARIA, targetUserId: ANDRES });
    });

    it('[SC-012-102][N2-R1] el target deja UNA respuesta (≤ 280 puntos de código); la segunda es 409 ERR-OWN12-STALE sin sobrescribir; quien no es el target recibe 404; 281 puntos se rechazan', async () => {
      engine = await factory.make();
      await scenario(engine);
      await open(engine, ANDRES, MARIA);
      const respond = (actor: string, response: string) => new RespondAbsenceDisputeUseCase(engine!.deps).execute(actor, PET, { response });
      expect(await codeOf(respond(ANDRES, 'hola'))).toBe('ERR-PET-NOT-FOUND'); // solo el target de la disputa
      expect(await codeOf(respond(CARLOS, 'hola'))).toBe('ERR-PET-NOT-FOUND');
      expect(await codeOf(respond(MARIA, '😀'.repeat(281)))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await codeOf(respond(MARIA, 'a‮b'))).toBe('ERR-SCHEMA-VALIDATION-FAILED'); // bidi rechazado
      expect(await codeOf(respond(MARIA, '😀'.repeat(280)))).toBe('OK'); // 280 puntos de código (560 unidades UTF-16)
      expect(await codeOf(respond(MARIA, 'otra'))).toBe('ERR-OWN12-STALE');
      expect((await disputes(engine))[0]!['targetResponse']).toBe('😀'.repeat(280));
    });

    it('[REQ-OWN12-009] el aviso derivado: el target ve open/respondable/frozenUntil sin la identidad del solicitante; el resto de propietarios ve la disputa abierta pero no puede responder', async () => {
      engine = await factory.make();
      await scenario(engine);
      const use = cases(engine.deps);
      expect((await use.ownership(MARIA, PET)).absenceNotice).toEqual({ open: false, respondable: false, frozenUntil: null });
      await open(engine, ANDRES, MARIA);
      expect((await use.ownership(MARIA, PET)).absenceNotice).toEqual({ open: true, respondable: true, frozenUntil: at(60) });
      expect((await use.ownership(ANDRES, PET)).absenceNotice).toEqual({ open: true, respondable: false, frozenUntil: at(60) });
      expect(JSON.stringify((await use.ownership(MARIA, PET)).absenceNotice)).not.toContain(ANDRES);
    });
  });
}
