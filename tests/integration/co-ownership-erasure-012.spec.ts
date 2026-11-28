import { afterEach, describe, expect, it } from 'vitest';
import { CreateShareLinkUseCase } from '../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../src/application/use-cases/shared-view-use-cases.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, NOW, PET, allRequestRows, cases, codeOf, makeCoOwners, unshare, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { HOUSEHOLD_ID, KEY } from '../fixtures/share-harness.ts';

/**
 * T1622 (Feature 012, Bloque A, #22; `/keymaker`): `eraseAccountInTransaction` con co-propiedad sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`): sucesión del principal, `LEFT` del co-propietario,
 * seudonimización de `share_links.pet_owner_user_id_at_creation` de OTROS creadores (rama R-04, SC-012-108), enlaces del propio creador borrados por la cascada de 005 (P-7) y solicitudes `PENDING` de una mascota
 * eliminada en `CANCELLED` con las identidades seudonimizadas y retenidas 90 días (lock R-12). Las carreras de supresión viven en `co-ownership-races-012.spec.ts`.
 *
 * @implements REQ-OWN12-006, REQ-OWN12-008, REQ-OWN12-011, NFR-012-009, SC-012-076, SC-012-099, SC-012-108
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const IP = '203.0.113.9';
const linksOf = (e: Engine012) => e.run((r) => r.shareLinks.listAll());

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1622 supresión de cuenta con co-propiedad (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-108][R-04] el enlace PET de un co-propietario sobrevive a la supresión del principal y el ID del principal desaparece de pet_owner_user_id_at_creation (seudónimo HMAC)', async (ctx) => {
      engine = await factory.make();
      if (!engine.sharing) return ctx.skip();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      await new CreateShareLinkUseCase(engine.deps).execute(MARIA, { scope: 'PET', petId: PET }, KEY(1), { expiresInDays: 7 });
      const token = engine.tokens().at(-1)!;
      expect(await codeOf(use.erase(ANDRES))).toBe('OK');
      const links = await linksOf(engine);
      expect(links).toHaveLength(1);
      expect(links[0]!.petOwnerUserIdAtCreation).toBe(engine.deps.auditPseudonym.hmacUserId(ANDRES, engine.deps.auditHmacSecret));
      expect(JSON.stringify(links)).not.toContain(ANDRES);
      expect(await codeOf(new GetSharedSummaryUseCase(engine.deps).execute(token, IP))).toBe('OK'); // la autoridad es la condición viva del creador (ENM-005-A): MARIA ya es la principal
    });

    it('[SC-012-108][P-7] los enlaces que creó la cuenta suprimida caen con ella: no queda fila ni ID en claro', async (ctx) => {
      engine = await factory.make();
      if (!engine.sharing) return ctx.skip();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      await new CreateShareLinkUseCase(engine.deps).execute(ANDRES, { scope: 'PET', petId: PET }, KEY(2), { expiresInDays: 7 });
      expect(await linksOf(engine)).toHaveLength(1);
      expect(await codeOf(use.erase(ANDRES))).toBe('OK');
      expect(await linksOf(engine)).toEqual([]);
    });

    it('[NFR-012-009][lock R-12] las solicitudes PENDING de una mascota que se elimina con su último propietario quedan CANCELLED, sin mascota ni identidades en claro', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      engine.setNow(NOW);
      const request = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      expect(await codeOf(use.erase(MARIA))).toBe('OK'); // MARIA sale (LEFT); su voto pendiente deja de contar
      expect(await codeOf(use.erase(ANDRES))).toBe('OK'); // el último propietario: REQ-PET-004
      const stored = (await allRequestRows(engine)).find((r) => r['id'] === request.id)!;
      expect(stored).toMatchObject({ status: 'CANCELLED', petId: null, requesterUserId: null });
      expect(JSON.stringify(stored)).not.toMatch(new RegExp(`${ANDRES}|${MARIA}`));
      expect(stored['requesterPseudonym']).toBe(engine.deps.auditPseudonym.hmacUserId(ANDRES, engine.deps.auditHmacSecret));
    });

    it('[REQ-OWN12-008 (c)] un co-propietario que borra su cuenta queda LEFT con seudónimo, sin invitaciones emitidas y sin asignaciones a su nombre; la mascota sigue con su principal', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      expect(await codeOf(use.erase(MARIA))).toBe('OK');
      const pseudonym = engine.deps.auditPseudonym.hmacUserId(MARIA, engine.deps.auditHmacSecret);
      const rows = await engine.run((r) => r.coOwners.listByPet(PET));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'LEFT', userId: null, userPseudonym: pseudonym });
      expect(JSON.stringify(rows)).not.toContain(MARIA);
      expect((await engine.run((r) => r.pets.findById(PET)))?.ownerUserId).toBe(ANDRES);
    });

    it('[SC-012-076][NFR-012-009] ninguna columna de usuario del Bloque A conserva el ID de la cuenta suprimida: pet_co_owners, owner_requests (incl. rejected_by, resolved_by, second_approver, approver_set, approvals), pet_assignments y share_links', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps);
      await makeCoOwners(engine, [MARIA, CARLOS]);
      engine.setNow(NOW);
      await use.request(CARLOS, PET, { action: 'DELETE_PET' }); // CARLOS solicitante; aprobadores sellados [ANDRES, MARIA]
      await engine.run(async (r) => {
        await r.assignments.save({ petId: PET, householdId: HOUSEHOLD_ID, assignedByUserId: CARLOS, assignedAt: NOW });
        await r.ownerRequests.insert({
          id: '92000000-0000-4000-8000-000000000001', action: 'CHANGE_PRINCIPAL', petId: PET, petVersion: 1, requesterUserId: CARLOS, requesterPseudonym: null, targetUserId: CARLOS, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
          status: 'REJECTED', approverSet: [ANDRES, CARLOS], approvals: [{ u: CARLOS, at: NOW }], rejectedBy: CARLOS, rejectedByPseudonym: null, message: null, createdAt: NOW, expiresAt: NOW, decidedAt: NOW, staleReason: null,
          disputeReason: null, chipLast4: null, chipHmac: null, frozenUntil: null, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: null, resolution: null, mootReason: null, resolvedByUserId: CARLOS, secondApproverUserId: CARLOS, executesAfter: null, version: 1,
        });
      });
      if (engine.sharing) await new CreateShareLinkUseCase(engine.deps).execute(CARLOS, { scope: 'PET', petId: PET }, KEY(3), { expiresInDays: 7 });
      expect(await codeOf(use.erase(CARLOS))).toBe('OK');
      const everything = JSON.stringify([
        await engine.run((r) => r.coOwners.listByPet(PET)),
        await allRequestRows(engine),
        await engine.run((r) => r.assignments.listByPet(PET)),
        engine.sharing ? await linksOf(engine) : [],
      ]);
      expect(everything).not.toContain(CARLOS);
      const pseudonym = engine.deps.auditPseudonym.hmacUserId(CARLOS, engine.deps.auditHmacSecret);
      const stored = (await allRequestRows(engine)).find((r) => r['id'] === '92000000-0000-4000-8000-000000000001')!;
      expect(stored).toMatchObject({ requesterUserId: null, targetUserId: null, rejectedBy: null, resolvedByUserId: null, secondApproverUserId: null, requesterPseudonym: pseudonym, rejectedByPseudonym: pseudonym });
    });
  });
}
