import { afterEach, describe, expect, it } from 'vitest';
import { UpdatePetUseCase, ListMyPetsUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { computeFileDigest } from '../../src/domain/backup/file-digest.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import { CreateShareLinkUseCase } from '../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../src/application/use-cases/shared-view-use-cases.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, LUCIA, MARIA, NOW, PET, allRequestRows, cases, codeOf, coOwnerRows, makeCoOwners, principalOf, requestRows, unshare, usernameOf, withZeroRowOwnerWrites, type Engine012, type Row } from '../fixtures/co-ownership-012.ts';
import { HOUSEHOLD_ID, KEY } from '../fixtures/share-harness.ts';

/**
 * T1615 (Feature 012, Bloque A, #22; PRUEBAS ROJAS hasta T1616 y T1622; `/keymaker`): paridad Memoria / SQLite / PostgreSQL de la co-propiedad por casos de uso: invitar (respuesta uniforme), aceptar,
 * salir, `LEAVE` del principal con promoción, aprobaciones de acciones distintas, expiración, enlace `PET` tras la salida, eliminación de cuenta con sucesión y seudonimización, y respaldo con chip ya registrado.
 * Las carreras `LEAVE`/`LEAVE`/supresión y las combinaciones de SC-012-095 viven en `co-ownership-races-012.spec.ts` (dos conexiones). PostgreSQL real se OMITE sin `TEST_DATABASE_URL`.
 *
 * Alcance de la seudonimización: las columnas de usuario que EXISTEN en el Bloque A (`pet_co_owners.user_id/invited_by_user_id`, `owner_requests.requester_user_id/target_user_id/rejected_by/resolved_by_user_id/
 * second_approver_user_id`, `pet_assignments.assigned_by_user_id`, más `approver_set`/`approvals`). Las de `care_*`, `pet_caregiver_access` y `pet_emergency_cards` de SC-012-076 llegan con #26 y #32 (sus pruebas rojas).
 *
 * @implements REQ-OWN12-002, REQ-OWN12-004, REQ-OWN12-005, REQ-OWN12-006, REQ-OWN12-008, REQ-OWN12-011, INV-OWN12-004, INV-OWN12-005, NFR-012-006
 * Cubre SC-012-001..003, SC-012-008..011, SC-012-024, SC-012-071..076, SC-012-094, SC-012-099 (paridad).
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const FOUR_DAYS = '2026-11-30T10:00:00.000Z';
const EIGHT_DAYS = '2026-12-04T10:00:00.000Z';
const NOBODY = 'zz.nadie.existe';
const rowOf = (rows: Row[], userId: string, status: string): Row => rows.find((r) => r['userId'] === userId && r['status'] === status)!;
const idsIn = (value: unknown): string => JSON.stringify(value);

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1615 paridad de co-propiedad (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-001][SC-012-002] A invita a B: B sigue sin acceso (404) hasta aceptar; al aceptar ambos ven la mascota en «Mis mascotas» y ambos editan datos básicos', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps); // T1616: el estado canónico comparte ARGOS con MARIA por el hogar; aquí el único acceso posible es la co-propiedad
      engine.setNow(NOW);
      expect(await use.invite(ANDRES, PET, usernameOf(MARIA))).toEqual({ status: 'RECEIVED' });
      const invited = rowOf(await coOwnerRows(engine, PET), MARIA, 'INVITED');
      expect(await codeOf(use.ownership(MARIA, PET))).toBe('ERR-PET-NOT-FOUND');
      expect((await new ListMyPetsUseCase(engine.deps).execute(MARIA)).map((c) => c.profile.id)).not.toContain(PET);
      await use.accept(MARIA, invited['id'] as string);
      expect(rowOf(await coOwnerRows(engine, PET), MARIA, 'ACTIVE')['joinedAt']).toBe(NOW);
      for (const user of [ANDRES, MARIA]) {
        expect((await new ListMyPetsUseCase(engine.deps).execute(user)).map((c) => c.profile.id)).toContain(PET);
        const version = await engine.run(async (r) => (await r.pets.findById(PET))!.version ?? null);
        const updated = await new UpdatePetUseCase(engine.deps).execute(user, PET, { name: `Argos ${usernameOf(user)}` }, version);
        expect(updated.name).toBe(`Argos ${usernameOf(user)}`);
      }
      expect((await use.ownership(MARIA, PET)).principal.userId).toBe(ANDRES);
    });

    it('[SC-012-075][INV-OWN12-004] invitar a un username inexistente o existente da la MISMA respuesta y solo el existente crea fila; ERR-OWN12-ALREADY-OWNER solo si ya es propietario de ESA mascota', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      engine.setNow(NOW);
      const missing = await use.invite(ANDRES, PET, NOBODY);
      const existing = await use.invite(ANDRES, PET, usernameOf(MARIA));
      expect(missing).toEqual(existing);
      expect((await coOwnerRows(engine, PET)).map((r) => r['userId'])).toEqual([MARIA]);
      expect(await codeOf(use.invite(ANDRES, PET, usernameOf(MARIA)))).toBe('ERR-OWN12-ALREADY-OWNER');
      expect(await codeOf(use.invite(ANDRES, PET, usernameOf(ANDRES)))).toBe('ERR-OWN12-ALREADY-OWNER');
    });

    it('[SC-012-075][H-02] todo intento cuenta (inexistente, existente, ya propietario): el sexto del día responde 429 ERR-RATE-LIMITED sin resolver el username', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      engine.setNow(NOW);
      await use.invite(ANDRES, PET, NOBODY);
      await use.invite(ANDRES, PET, usernameOf(MARIA));
      await codeOf(use.invite(ANDRES, PET, usernameOf(MARIA)));
      await codeOf(use.invite(ANDRES, PET, usernameOf(ANDRES)));
      await use.invite(ANDRES, PET, `${NOBODY}.2`);
      const before = (await coOwnerRows(engine, PET)).length;
      expect(await codeOf(use.invite(ANDRES, PET, usernameOf(CARLOS)))).toBe('ERR-RATE-LIMITED');
      expect((await coOwnerRows(engine, PET)).length).toBe(before);
    });

    it('[SC-012-003] una invitación que supera CO_OWNER_INVITE_TTL_DAYS (7) se lee EXPIRED y B no obtiene acceso ni puede aceptarla', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      engine.setNow(NOW);
      await use.invite(ANDRES, PET, usernameOf(MARIA));
      const invited = rowOf(await coOwnerRows(engine, PET), MARIA, 'INVITED');
      engine.setNow(EIGHT_DAYS);
      expect(await codeOf(use.accept(MARIA, invited['id'] as string))).not.toBe('OK');
      expect(await codeOf(use.ownership(MARIA, PET))).toBe('ERR-PET-NOT-FOUND');
      expect((await use.ownership(ANDRES, PET)).coOwners.map((c: { userId: string; status: string }) => [c.userId, c.status])).toEqual([[MARIA, 'EXPIRED']]);
    });

    it('[SC-012-008] un co-propietario que sale (LEFT) pierde el acceso al instante, se retiran sus asignaciones a hogares y la mascota sigue con el resto', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      await engine.run((r) => r.assignments.save({ petId: PET, householdId: HOUSEHOLD_ID, assignedByUserId: MARIA, assignedAt: NOW }));
      const versionBefore = (await use.ownership(ANDRES, PET)).ownershipVersion;
      const result = await use.leave(MARIA, PET);
      expect(result.principal.userId).toBe(ANDRES);
      expect(await codeOf(use.ownership(MARIA, PET))).toBe('ERR-PET-NOT-FOUND');
      expect((await new ListMyPetsUseCase(engine.deps).execute(MARIA)).map((c) => c.profile.id)).not.toContain(PET);
      expect((await engine.run((r) => r.assignments.listByPet(PET))).filter((a) => a.assignedByUserId === MARIA)).toEqual([]);
      expect((await use.ownership(ANDRES, PET)).ownershipVersion).toBe(versionBefore + 1);
      expect(rowOf(await coOwnerRows(engine, PET), MARIA, 'LEFT')['leftAt']).toBe('2026-11-26T11:00:00.000Z');
    });

    it('[SC-012-071][SC-012-094] LEAVE del principal sin designar: sale sin aprobación, el ACTIVE de menor joined_at pasa a principal (PROMOTED AUTO), ownership_version +1 y aviso derivado hasta reconocerlo', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA, CARLOS]);
      const before = (await use.ownership(ANDRES, PET)).ownershipVersion;
      expect((await use.leave(ANDRES, PET)).principal.userId).toBe(MARIA);
      expect(await principalOf(engine, PET)).toBe(MARIA);
      expect(await codeOf(use.ownership(ANDRES, PET))).toBe('ERR-PET-NOT-FOUND');
      const promoted = rowOf(await coOwnerRows(engine, PET), MARIA, 'PROMOTED');
      expect([promoted['promotionKind'], promoted['promotionNoticeAckAt']]).toEqual(['AUTO', null]);
      const view = await use.ownership(MARIA, PET);
      expect([view.ownershipVersion, view.promotionNotice.pending]).toEqual([before + 1, true]);
      await use.ackPromotion(MARIA, PET);
      expect((await use.ownership(MARIA, PET)).promotionNotice.pending).toBe(false);
      expect(await engine.auditTypes(PET)).toContain('PRINCIPAL_AUTO_PROMOTED');
    });

    it('[SC-012-094] LEAVE del principal designando a un co-propietario ACTIVE válido: ese pasa a principal (DESIGNATED) y se audita PRINCIPAL_SUCCESSOR_DESIGNATED', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA, CARLOS]);
      expect((await use.leave(ANDRES, PET, CARLOS)).principal.userId).toBe(CARLOS);
      expect(rowOf(await coOwnerRows(engine, PET), CARLOS, 'PROMOTED')['promotionKind']).toBe('DESIGNATED');
      expect(await engine.auditTypes(PET)).toContain('PRINCIPAL_SUCCESSOR_DESIGNATED');
    });

    it('[SC-012-094] designaciones inválidas (inexistente, no miembro de la mascota, uno mismo, invitación caducada): las cuatro respuestas de LEAVE son idénticas entre sí y no auditan PRINCIPAL_SUCCESSOR_DESIGNATED', async () => {
      const outcomes: unknown[] = [];
      for (const designated of ['00000000-0000-4000-8000-0000000000ff', LUCIA, ANDRES, 'expired']) {
        engine = await factory.make();
        const use = cases(engine.deps);
        await makeCoOwners(engine, [MARIA]);
        let successor = designated;
        if (designated === 'expired') {
          engine.setNow(NOW);
          await use.invite(ANDRES, PET, usernameOf(CARLOS));
          engine.setNow(EIGHT_DAYS);
          successor = CARLOS;
        }
        outcomes.push(await use.leave(ANDRES, PET, successor));
        expect(await principalOf(engine, PET)).toBe(MARIA);
        expect(await engine.auditTypes(PET)).not.toContain('PRINCIPAL_SUCCESSOR_DESIGNATED');
        await engine.dispose();
        engine = null;
      }
      for (const outcome of outcomes) expect(outcome).toEqual(outcomes[0]);
    });

    it('[SC-012-009] el último propietario no sale: ERR-OWN12-LAST-OWNER y la mascota sigue con su principal; con solo una invitación pendiente también', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      expect(await codeOf(use.leave(ANDRES, PET))).toBe('ERR-OWN12-LAST-OWNER');
      engine.setNow(NOW);
      await use.invite(ANDRES, PET, usernameOf(MARIA));
      expect(await codeOf(use.leave(ANDRES, PET))).toBe('ERR-OWN12-LAST-OWNER');
      expect(await principalOf(engine, PET)).toBe(ANDRES);
    });

    it('[SC-012-005][SC-012-010][SC-012-074] dos acciones críticas distintas aprobadas a la vez: exactamente una surte efecto (APPROVED) y la otra queda EXPIRED con ERR-OWN12-STALE; ownership_version sube una sola vez', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      const transfer = await use.request(ANDRES, PET, { action: 'CHANGE_PRINCIPAL', targetUserId: MARIA });
      const remove = await use.request(MARIA, PET, { action: 'DELETE_PET' });
      expect([transfer.status, remove.status]).toEqual(['PENDING', 'PENDING']);
      const before = (await use.ownership(ANDRES, PET)).ownershipVersion;
      const settled = await Promise.allSettled([use.approve(MARIA, transfer.id), use.approve(ANDRES, remove.id)]);
      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
      const failure = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
      expect((failure.reason as { code?: string }).code).toBe('ERR-OWN12-STALE');
      const statuses = (await requestRows(engine, PET)).map((r) => r['status']).sort();
      expect(statuses).toEqual(['APPROVED', 'EXPIRED']);
      expect((await requestRows(engine, PET)).find((r) => r['status'] === 'EXPIRED')!['staleReason']).toBe('ERR-OWN12-STALE');
      const principal = await principalOf(engine, PET);
      expect(principal === null || [ANDRES, MARIA].includes(principal)).toBe(true);
      if (principal !== null) expect((await use.ownership(principal, PET)).ownershipVersion).toBe(before + 1);
    });

    it('[SC-012-005] A solicita eliminar la mascota con B como co-propietario: queda PENDING, la mascota intacta y B la ve; solo al aprobar B se elimina', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      const request = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      expect(request.status).toBe('PENDING');
      expect(await principalOf(engine, PET)).toBe(ANDRES);
      expect((await use.myRequests(MARIA)).map((r: { id: string; canVote: boolean }) => [r.id, r.canVote])).toContainEqual([request.id, true]);
      expect((await use.approve(MARIA, request.id)).status).toBe('APPROVED');
      expect(await principalOf(engine, PET)).toBeNull();
    });

    it('[SC-012-006][SC-012-103] una solicitud sin respuesta vence a los 7 días: el voto en la frontera exacta se rechaza con ERR-OWN12-APPROVAL-EXPIRED, queda EXPIRED y no se ejecuta nada; un «no» explícito queda REJECTED', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      engine.setNow(NOW);
      const first = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      expect(first.expiresAt).toBe('2026-12-03T10:00:00.000Z');
      engine.setNow(first.expiresAt);
      expect(await codeOf(use.approve(MARIA, first.id))).toBe('ERR-OWN12-APPROVAL-EXPIRED');
      expect((await requestRows(engine, PET)).find((r) => r['id'] === first.id)!['status']).toBe('EXPIRED');
      expect(await principalOf(engine, PET)).toBe(ANDRES);
      engine.setNow(FOUR_DAYS);
      const second = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      await use.reject(MARIA, second.id);
      expect((await requestRows(engine, PET)).find((r) => r['id'] === second.id)!['status']).toBe('REJECTED');
      expect(await principalOf(engine, PET)).toBe(ANDRES);
    });

    it('[SC-012-073] si entra un nuevo co-propietario antes de que B vote, la solicitud queda EXPIRED con ERR-OWN12-STALE y sin ejecución', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      const request = await use.request(ANDRES, PET, { action: 'DELETE_PET' });
      await makeCoOwners(engine, [CARLOS]);
      expect(await codeOf(use.approve(MARIA, request.id))).toBe('ERR-OWN12-STALE');
      expect((await requestRows(engine, PET)).find((r) => r['id'] === request.id)).toMatchObject({ status: 'EXPIRED', staleReason: 'ERR-OWN12-STALE' });
      expect(await principalOf(engine, PET)).toBe(ANDRES);
    });

    it('[SC-012-011][REQ-OWN12-008] un enlace PET creado por un co-propietario que luego sale responde 404 uniforme (el mismo cuerpo que un token inexistente)', async (ctx) => {
      engine = await factory.make();
      if (!engine.sharing) return ctx.skip();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA]);
      await new CreateShareLinkUseCase(engine.deps).execute(MARIA, { scope: 'PET', petId: PET }, KEY(1), { expiresInDays: 7 });
      const token = engine.tokens().at(-1)!;
      expect(await codeOf(new GetSharedSummaryUseCase(engine.deps).execute(token, '203.0.113.7'))).toBe('OK');
      await use.leave(MARIA, PET);
      const afterExit = await codeOf(new GetSharedSummaryUseCase(engine.deps).execute(token, '203.0.113.7'));
      const unknown = await codeOf(new GetSharedSummaryUseCase(engine.deps).execute('token-que-nunca-existio', '203.0.113.7'));
      expect(afterExit).not.toBe('OK');
      expect(afterExit).toBe(unknown);
    });

    it('[SC-012-076][SC-012-099] eliminación de cuenta del principal con co-propietario ACTIVE: la mascota NO se borra, hereda el de menor joined_at, se cancelan invitaciones y no queda ningún ID de la cuenta en claro', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps); // T1616: sin hogar compartido que bloquee la supresión por 002
      await makeCoOwners(engine, [MARIA]);
      engine.setNow(NOW);
      await use.invite(MARIA, PET, usernameOf(CARLOS)); // aprobada por el principal: queda como solicitud con ANDRES en el conjunto sellado
      const request = (await requestRows(engine, PET)).find((r) => r['action'] === 'INVITE_CO_OWNER');
      await engine.run((r) => r.assignments.save({ petId: PET, householdId: HOUSEHOLD_ID, assignedByUserId: ANDRES, assignedAt: NOW }));
      expect(await codeOf(use.erase(ANDRES))).toBe('OK');
      expect(await principalOf(engine, PET)).toBe(MARIA);
      expect(rowOf(await coOwnerRows(engine, PET), MARIA, 'PROMOTED')['promotionKind']).toBe('AUTO');
      const everything = JSON.stringify([await coOwnerRows(engine, PET), await requestRows(engine, PET), await engine.run((r) => r.assignments.listByPet(PET))]);
      expect(everything).not.toContain(ANDRES);
      const rows = await coOwnerRows(engine, PET);
      for (const column of ['invitedByUserId']) expect(rows.every((r) => r[column] !== ANDRES)).toBe(true);
      // T1616: se relee la solicitud DESPUÉS de la supresión (la copia anterior conserva el ID previo a la seudonimización).
      const stored = (await requestRows(engine, PET)).find((r) => r['id'] === request?.['id']);
      if (stored !== undefined) expect([stored['requesterUserId'], idsIn(stored['approverSet']), idsIn(stored['approvals'])].join('|')).not.toContain(ANDRES);
      expect(await engine.auditTypes(PET)).toContain('PRINCIPAL_AUTO_PROMOTED');
    });

    it('[SC-012-076] seudonimización de las columnas de usuario de una solicitud decidida: requester, target, rejected_by, resolved_by y second_approver pasan a NULL con seudónimo; approver_set y approvals no conservan el ID', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await makeCoOwners(engine, [MARIA, CARLOS]);
      const pseudonym = engine.deps.auditPseudonym.hmacUserId(CARLOS, engine.deps.auditHmacSecret);
      await engine.run((r) =>
        r.ownerRequests.insert({
          id: '90000000-0000-4000-8000-000000000001', action: 'CHANGE_PRINCIPAL', petId: PET, petVersion: 1, requesterUserId: CARLOS, requesterPseudonym: null, targetUserId: CARLOS, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
          status: 'REJECTED', approverSet: [ANDRES, CARLOS], approvals: [{ u: CARLOS, at: NOW }], rejectedBy: CARLOS, rejectedByPseudonym: null, message: null, createdAt: NOW, expiresAt: EIGHT_DAYS, decidedAt: NOW, staleReason: null,
          disputeReason: null, chipLast4: null, chipHmac: null, frozenUntil: null, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: null, resolution: null, mootReason: null, resolvedByUserId: CARLOS, secondApproverUserId: CARLOS, executesAfter: null, version: 1,
        }),
      );
      await use.leave(CARLOS, PET);
      expect(await codeOf(use.erase(CARLOS))).toBe('OK');
      const stored = (await requestRows(engine, PET)).find((r) => r['id'] === '90000000-0000-4000-8000-000000000001')!;
      expect([stored['requesterUserId'], stored['targetUserId'], stored['rejectedBy'], stored['resolvedByUserId'], stored['secondApproverUserId']]).toEqual([null, null, null, null, null]);
      expect([stored['requesterPseudonym'], stored['rejectedByPseudonym']]).toEqual([pseudonym, pseudonym]);
      expect(idsIn([stored['approverSet'], stored['approvals']])).not.toContain(CARLOS);
      expect(JSON.stringify(await coOwnerRows(engine, PET))).not.toContain(CARLOS);
      expect((await coOwnerRows(engine, PET)).find((r) => r['status'] === 'LEFT' && r['userPseudonym'] === pseudonym)).toMatchObject({ userId: null });
    });

    it('[SC-012-099] principal SIN co-propietario ACTIVE con la mascota compartida en los términos de la 002: ERR-ACCOUNT-OWNS-SHARED-PETS exactamente como hoy; 012 no añade supuestos', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await engine.run((r) => r.assignments.save({ petId: PET, householdId: HOUSEHOLD_ID, assignedByUserId: ANDRES, assignedAt: NOW }));
      engine.setNow(NOW);
      await use.invite(ANDRES, PET, usernameOf(CARLOS)); // solo INVITED: no hay sucesor
      expect(await codeOf(use.erase(ANDRES))).toBe('ERR-ACCOUNT-OWNS-SHARED-PETS');
      expect(await principalOf(engine, PET)).toBe(ANDRES);
    });

    it('[N2-R2][INV-CHP12-005][SC-012-095] supresión del ÚNICO propietario con una disputa de apropiación abierta: procede (REQ-PET-004), la mascota se elimina, el expediente y su chip_hmac sobreviven con pet_id nulo y la cuenta no deja ID en claro', async () => {
      engine = await factory.make();
      const use = cases(engine.deps);
      await unshare(engine.deps); // T1616: sin hogar compartido que bloquee la supresión por 002
      await engine.run(async (r) => {
        for (const assignment of await r.assignments.listByPet(PET)) await r.assignments.remove(PET, assignment.householdId);
        await r.ownerRequests.insert({
          id: '90000000-0000-4000-8000-000000000002', action: 'CHIP_DISPUTE', petId: PET, petVersion: 1, requesterUserId: CARLOS, requesterPseudonym: null, targetUserId: null, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
          status: 'UNDER_REVIEW', approverSet: [], approvals: [], rejectedBy: null, rejectedByPseudonym: null, message: null, createdAt: NOW, expiresAt: EIGHT_DAYS, decidedAt: null, staleReason: null,
          disputeReason: 'CHIP_APPROPRIATION', chipLast4: '8901', chipHmac: 'c'.repeat(64), frozenUntil: EIGHT_DAYS, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: null, resolution: null, mootReason: null, resolvedByUserId: null, secondApproverUserId: null, executesAfter: null, version: 1,
        });
      });
      expect(await codeOf(use.erase(ANDRES))).toBe('OK');
      expect(await principalOf(engine, PET)).toBeNull();
      const dispute = (await allRequestRows(engine)).find((r) => r['id'] === '90000000-0000-4000-8000-000000000002')!;
      expect(dispute).toMatchObject({ status: 'UNDER_REVIEW', petId: null, chipHmac: 'c'.repeat(64), chipLast4: '8901', requesterUserId: CARLOS });
    });

    it('[REQ-OWN12-011][NFR-012-008] si el UPDATE … WHERE del cambio de principal afecta 0 filas, se reevalúa UNA sola vez; la segunda vez es rollback con ERR-OWN12-RETRYABLE (503), sin escritura parcial y sin bucle', async () => {
      engine = await factory.make();
      await makeCoOwners(engine, [MARIA]);
      const faulty = withZeroRowOwnerWrites(engine.deps);
      const before = JSON.stringify([await coOwnerRows(engine, PET), await principalOf(engine, PET), await engine.auditTypes(PET)]);
      expect(await codeOf(cases(faulty.deps).leave(ANDRES, PET))).toBe('ERR-OWN12-RETRYABLE');
      expect(faulty.attempts()).toBe(2);
      expect(JSON.stringify([await coOwnerRows(engine, PET), await principalOf(engine, PET), await engine.auditTypes(PET)])).toBe(before);
    });

    it('[REQ-OWN12-008 (b)][EDGE-012-044] importar un respaldo con un chip ya registrado falla cerrada con ERR-CHP12-MICROCHIP-REGISTERED, sin crear ni sobrescribir nada', async () => {
      engine = await factory.make();
      const chip = '985112345678901';
      const version = await engine.run(async (r) => (await r.pets.findById(PET))!.version ?? null);
      await new UpdatePetUseCase(engine.deps).execute(ANDRES, PET, { microchipId: chip }, version);
      const exported = await new ExportBackupUseCase(engine.deps).execute(ANDRES);
      const snapshot = JSON.stringify(await engine.run((r) => r.pets.listByOwners([ANDRES, CARLOS])));
      const bytes = new TextEncoder().encode(exported.json);
      const outcome = await codeOf(new ImportBackupUseCase(engine.deps).execute(CARLOS, bytes, computeFileDigest(bytes)));
      expect(outcome).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
      expect(JSON.stringify(await engine.run((r) => r.pets.listByOwners([ANDRES, CARLOS])))).toBe(snapshot);
    });
  });
}
