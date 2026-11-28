import { afterEach, describe, expect, it } from 'vitest';
import { purgeOwnershipData, runMaintenance } from '../../src/application/use-cases/maintenance-use-cases.ts';
import type { OwnerRequestRecord, PetCoOwnerRecord } from '../../src/application/ports/co-ownership.port.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, LUCIA, MARIA, PET, allRequestRows, coOwnerRows, type Engine012 } from '../fixtures/co-ownership-012.ts';

/**
 * T1623 (Feature 012, Bloque A, #22; `/keymaker`): purga de mantenimiento de `pet_co_owners` y `owner_requests` terminales a 90 días (NFR-012-009) sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`).
 * H-08 de `trinity` T1612 (`P-2`): la purga EXCLUYE toda solicitud referenciada por `trigger_request_ids` de una disputa no terminal, y su retención de 90 días cuenta desde el `RESOLVED` de la disputa; con una disputa
 * abierta la solicitud sellada sobrevive a T0 + 97 días (`TRIGGER_LOST` no puede originarse en la purga).
 *
 * @implements NFR-012-009, REQ-OWN12-009, EDGE-012-062
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const DAY = 86_400_000;
const T0 = '2026-01-01T00:00:00.000Z';
const at = (days: number): string => new Date(Date.parse(T0) + days * DAY).toISOString();
const ID = (n: number): string => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const request = (id: string, over: Partial<OwnerRequestRecord>): OwnerRequestRecord => ({
  id, action: 'INVITE_CO_OWNER', petId: PET, petVersion: 1, requesterUserId: ANDRES, requesterPseudonym: null, targetUserId: null, targetUsernameSealed: null, targetResponse: null, triggerRequestIds: null,
  status: 'EXPIRED', approverSet: [MARIA], approvals: [], rejectedBy: null, rejectedByPseudonym: null, message: null, createdAt: T0, expiresAt: at(7), decidedAt: at(7), staleReason: null, disputeReason: null,
  chipLast4: null, chipHmac: null, frozenUntil: null, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null, resolvedAt: null, resolution: null, mootReason: null, resolvedByUserId: null, secondApproverUserId: null,
  executesAfter: null, version: 1, ...over,
});
const coOwner = (id: string, userId: string, status: PetCoOwnerRecord['status'], over: Partial<PetCoOwnerRecord> = {}): PetCoOwnerRecord => ({
  id, petId: PET, userId, userPseudonym: null, status, invitedByUserId: ANDRES, invitedAt: T0, expiresAt: at(7), joinedAt: status === 'ACTIVE' ? T0 : null, leftAt: null, promotionKind: null, promotionNoticeAckAt: null, version: 1, ...over,
});
const ids = async (e: Engine012): Promise<string[]> => (await allRequestRows(e)).map((r) => r['id'] as string).sort();

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1623 purga de co-propiedad (${factory.name})`, { timeout: 60_000 }, () => {
    it('[NFR-012-009] filas terminales de pet_co_owners y solicitudes no disputa a 90 días; ACTIVE e INVITED y las recientes nunca se purgan', async () => {
      engine = await factory.make();
      await engine.run(async (r) => {
        await r.coOwners.insert(coOwner(ID(1), MARIA, 'LEFT', { joinedAt: T0, leftAt: at(10) }));
        await r.coOwners.insert(coOwner(ID(2), CARLOS, 'DECLINED', { leftAt: at(80) }));
        await r.coOwners.insert(coOwner(ID(3), LUCIA, 'ACTIVE'));
        await r.ownerRequests.insert(request(ID(11), { action: 'DELETE_PET', status: 'REJECTED', decidedAt: at(10), expiresAt: at(7) }));
        await r.ownerRequests.insert(request(ID(12), { action: 'TRANSFER_PRINCIPAL', status: 'EXPIRED', decidedAt: at(80), expiresAt: at(80) }));
        await r.ownerRequests.insert(request(ID(13), { action: 'CHANGE_PRINCIPAL', status: 'PENDING', decidedAt: null, expiresAt: at(30) }));
      });
      engine.setNow(at(101)); // corte = día 11 (estrictamente anterior): LEFT (día 10) y REJECTED (día 10) ya superan los 90 días; EXPIRED (día 80) y PENDING (vence el día 30) no
      expect(await purgeOwnershipData(engine.deps)).toEqual({ coOwnersPurged: 1, requestsPurged: 1 });
      expect((await coOwnerRows(engine, PET)).map((c) => c['id']).sort()).toEqual([ID(2), ID(3)]);
      expect(await ids(engine)).toEqual([ID(12), ID(13)]);
      engine.setNow(at(171)); // corte = día 81: DECLINED y EXPIRED (día 80) y la PENDING vencida el día 30 (cuenta desde su vencimiento); ACTIVE nunca
      expect(await purgeOwnershipData(engine.deps)).toEqual({ coOwnersPurged: 1, requestsPurged: 2 });
      expect((await coOwnerRows(engine, PET)).map((c) => c['id'])).toEqual([ID(3)]);
      expect(await ids(engine)).toEqual([]);
    });

    it('[H-08][P-2] con una disputa de ausencia abierta, las solicitudes selladas por trigger_request_ids sobreviven a T0 + 97 y su retención cuenta desde el RESOLVED de la disputa', async () => {
      engine = await factory.make();
      const dispute = request(ID(30), {
        action: 'CHIP_DISPUTE', status: 'UNDER_REVIEW', disputeReason: 'CO_OWNER_ABSENT_OR_BLOCKING', requesterUserId: ANDRES, targetUserId: MARIA, approverSet: [], triggerRequestIds: [ID(21), ID(22)], createdAt: at(60),
        expiresAt: at(120), decidedAt: null, frozenUntil: at(90),
      });
      await engine.run(async (r) => {
        await r.ownerRequests.insert(request(ID(21), { createdAt: T0, expiresAt: at(7), decidedAt: at(7) }));
        await r.ownerRequests.insert(request(ID(22), { action: 'TRANSFER_PRINCIPAL', createdAt: at(7), expiresAt: at(14), decidedAt: at(14) }));
        await r.ownerRequests.insert(request(ID(23), { action: 'DELETE_PET', status: 'CANCELLED', decidedAt: at(5) })); // no sellada por la disputa: se purga
        await r.ownerRequests.insert(dispute);
      });
      engine.setNow(at(97));
      expect(await purgeOwnershipData(engine.deps)).toMatchObject({ requestsPurged: 1 });
      expect(await ids(engine)).toEqual([ID(21), ID(22), ID(30)]); // la solicitud sellada sobrevive con la disputa abierta
      // La disputa se resuelve el día 100: la retención de las selladas cuenta desde ahí (hasta el día 190).
      await engine.run((r) => r.ownerRequests.update({ ...dispute, status: 'RESOLVED', resolution: 'REJECT', resolvedAt: at(100), decidedAt: at(100), frozenUntil: at(90) }, 'UNDER_REVIEW'));
      engine.setNow(at(150));
      expect(await purgeOwnershipData(engine.deps)).toMatchObject({ requestsPurged: 0 });
      expect(await ids(engine)).toEqual([ID(21), ID(22), ID(30)]);
      engine.setNow(at(191));
      expect(await purgeOwnershipData(engine.deps)).toMatchObject({ requestsPurged: 3 }); // las dos selladas y la disputa (90 días tras su RESOLVED, DISPUTE_ABSENCE_RETENTION_DAYS)
      expect(await ids(engine)).toEqual([]);
    });

    it('[NFR-012-009] el mantenimiento diario existente ejecuta la purga sin cambiar los 5 conteos del contrato de 003 y sin lanzar', async () => {
      engine = await factory.make();
      await engine.run((r) => r.coOwners.insert(coOwner(ID(40), MARIA, 'EXPIRED', { expiresAt: at(7) })));
      engine.setNow(at(200));
      const counts = await runMaintenance(engine.deps);
      expect(Object.keys(counts).sort()).toEqual(['auditRowsPurged', 'confirmationTokensPurged', 'invitationsPurged', 'membershipsPurged', 'sessionsPurged']);
      expect(await coOwnerRows(engine, PET)).toEqual([]);
    });
  });
}
