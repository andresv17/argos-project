import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { prepareDisputeEvidence } from '../../src/application/use-cases/chip-evidence.ts';
import { OpenChipDisputeUseCase } from '../../src/application/use-cases/chip-dispute-use-cases.ts';
import { ListMyChipRequestsUseCase } from '../../src/application/use-cases/chip-claim-use-cases.ts';
import {
  AdminForbiddenError,
  CloseChipDisputeMootUseCase,
  ConfirmChipDisputeDecisionUseCase,
  ReadDisputeEvidenceUseCase,
  ResolveChipDisputeUseCase,
  assertStepUpGrant,
  decisionPhaseOf,
  type ArbiterActor,
} from '../../src/application/use-cases/chip-dispute-admin-use-cases.ts';
import { expireLapsedDisputes, purgeExpiredDisputeEvidence, sweepOrphanDisputeEvidence } from '../../src/application/use-cases/chip-dispute-retention.ts';
import { assertMicrochipAvailable } from '../../src/application/use-cases/chip-uniqueness.ts';
import { DeterministicMalwareScannerAdapter, EICAR_TEST_STRING } from '../../src/infrastructure/adapters/deterministic-malware-scanner.adapter.ts';
import { ANDRES, CARLOS, ENGINE_FACTORIES, MARIA, requestRows, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, codeOfChip } from '../fixtures/chip-012.ts';

/**
 * T1641, T1642, T1645 y T1646 (Feature 012, Bloque B, #23): saneo y antimalware de la evidencia, ciclo de vida (orden de purga, huérfanos, vencimiento), control dual, step-up y no fuga de identidad.
 * @implements REQ-CHP12-004, REQ-CHP12-008, REQ-CHP12-009, REQ-CHP12-010, INV-CHP12-004, INV-CHP12-005, INV-CHP12-006, INV-CHP12-009, SC-012-082, SC-012-090, SC-012-104, SC-012-118, SC-012-120
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const NOW = '2026-11-26T10:00:00.000Z';
const REG = (name: string, microchipId: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', microchipId });
const day = (days: number): string => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();
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
/** PNG válido de `width` x `height` con un chunk `tEXt` (metadato que el saneo debe quitar) y datos polígloto tras IEND. */
function png(width: number, height: number, withTail = true): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const rows = Buffer.concat(Array.from({ length: Math.min(height, 2) }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(Math.min(width, 2))])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Author\0Maria Perez')),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
    withTail ? Buffer.from('PK\x03\x04<html>') : Buffer.alloc(0),
  ]);
}
const pdf = (extra = ''): Uint8Array => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${extra} >> endobj\n2 0 obj << /Author (Maria Perez) /Title (Mi gato) >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`, 'latin1');
const media = { limits: { maxBytes: 10_485_760 } } as never;
const scanner = new DeterministicMalwareScannerAdapter();

describe('T1641 saneo y antimalware de la evidencia (sin motor)', () => {
  it('[SC-012-082] la imagen válida se reescribe sin metadatos ni cola polígloto; el tipo declarado distinto de la firma se rechaza', async () => {
    const [clean] = await prepareDisputeEvidence({ media, malwareScanner: scanner } as never, [{ declaredContentType: 'image/png', bytes: png(8, 8) }]);
    const text = Buffer.from(clean!.bytes).toString('latin1');
    expect(clean!.contentType).toBe('image/png');
    expect(text).not.toContain('Maria');
    expect(text).not.toContain('<html>');
    await expect(prepareDisputeEvidence({ media, malwareScanner: scanner } as never, [{ declaredContentType: 'image/jpeg', bytes: png(8, 8) }])).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });

  it('[H-A4] una imagen sobre 16 MP, SVG y HTML se rechazan con el mismo 422', async () => {
    const deps = { media, malwareScanner: scanner } as never;
    for (const bytes of [png(5000, 4000), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('<html><script>1</script></html>')]) {
      await expect(prepareDisputeEvidence(deps, [{ bytes }])).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    }
  });

  it('[B-N2] un PDF con JavaScript, OpenAction o nombres ofuscados se rechaza; uno limpio conserva su largo y pierde Info', async () => {
    const deps = { media, malwareScanner: scanner } as never;
    for (const extra of ['/OpenAction << /S /JavaScript /JS (app.alert(1)) >>', '/Names << /JavaScript 3 0 R >>', '/Java#53cript 3 0 R', '/AcroForm 4 0 R /Widget']) {
      await expect(prepareDisputeEvidence(deps, [{ bytes: pdf(extra) }])).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    }
    const [clean] = await prepareDisputeEvidence(deps, [{ bytes: pdf() }]);
    expect(clean!.bytes.length).toBe(pdf().length);
    expect(Buffer.from(clean!.bytes).toString('latin1')).not.toContain('Maria');
  });

  it('[N-G] el antimalware detecta EICAR (422); sin análisis disponible falla CERRADO con ERR-OWN12-RETRYABLE (503)', async () => {
    const infected = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(EICAR_TEST_STRING)]);
    await expect(prepareDisputeEvidence({ media, malwareScanner: scanner } as never, [{ bytes: infected }])).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    await expect(prepareDisputeEvidence({ media, malwareScanner: new DeterministicMalwareScannerAdapter({ unavailable: true }) } as never, [{ bytes: pdf() }])).rejects.toMatchObject({ code: 'ERR-OWN12-RETRYABLE' });
    await expect(prepareDisputeEvidence({ media } as never, [{ bytes: pdf() }])).rejects.toMatchObject({ code: 'ERR-OWN12-RETRYABLE' });
  });
});

describe('T1642 step-up (sin motor)', () => {
  const grant = { grantId: 'grant_0001', adminId: 'adm_0001', disputeId: 'disp_0001', action: 'resolve', issuedAt: NOW, usedAt: null } as const;
  const expected = { adminId: 'adm_0001', disputeId: 'disp_0001', action: 'resolve' } as const;

  it('[SC-012-104] el grant vale 5 minutos, es de un solo uso y va ligado a (admin, disputa, acción); sin grant vigente 403 genérico', () => {
    expect(assertStepUpGrant(grant, expected, day(0)).usedAt).toBe(day(0));
    expect(() => assertStepUpGrant(grant, expected, '2026-11-26T10:05:00.000Z')).toThrow(AdminForbiddenError);
    expect(() => assertStepUpGrant({ ...grant, usedAt: NOW }, expected, NOW)).toThrow(AdminForbiddenError);
    expect(() => assertStepUpGrant(grant, { ...expected, action: 'confirm' }, NOW)).toThrow(AdminForbiddenError);
    expect(() => assertStepUpGrant(grant, { ...expected, adminId: 'otro' }, NOW)).toThrow(AdminForbiddenError);
    expect(() => assertStepUpGrant(null, expected, NOW)).toThrow(AdminForbiddenError);
  });
});

const A1: ArbiterActor = { adminId: '00000000-0000-4000-8000-0000000000a1', role: 'OPERATOR', personId: 'persona_0001' };
const A2: ArbiterActor = { adminId: '00000000-0000-4000-8000-0000000000a2', role: 'SUPER_ADMIN', personId: 'persona_0002' };
const SAME_PERSON: ArbiterActor = { adminId: '00000000-0000-4000-8000-0000000000a3', role: 'OPERATOR', personId: 'persona_0001' };
const PNG_EVIDENCE = [{ contentType: 'image/png', bytes: png(4, 4, false) }];

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1641/T1642/T1645/T1646 disputa de chip de punta a punta (${factory.name})`, { timeout: 60_000 }, () => {
    async function open() {
      engine = await factory.make();
      engine.setNow(NOW);
      const luna = await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      await new OpenChipDisputeUseCase(engine.deps).execute(ANDRES, { microchipId: CHIP_A, evidence: PNG_EVIDENCE });
      const [dispute] = (await requestRows(engine, luna.id)).filter((r) => r['action'] === 'CHIP_DISPUTE');
      return { e: engine, luna, id: String(dispute!['id']) };
    }

    it('[SC-012-104][INV-CHP12-006] control dual: resolve registra y NO ejecuta; el mismo humano (otra cuenta) no confirma; el segundo debe haber leído la evidencia; confirm ejecuta y libera la reserva', async () => {
      const { e, luna, id } = await open();
      const resolve = new ResolveChipDisputeUseCase(e.deps);
      const confirm = new ConfirmChipDisputeDecisionUseCase(e.deps);
      const waiting = await resolve.execute(A1, id, { resolution: 'ADD_CO_OWNER', reason: 'Documentación coincide' });
      expect(decisionPhaseOf(waiting)).toBe('AWAITING_CONFIRMATION');
      expect(await e.run((r) => r.coOwners.listByPet(luna.id))).toHaveLength(0); // cero transferencia automática
      expect(await codeOfChip(resolve.execute(A2, id, { resolution: 'REJECT' }))).toBe('ERR-OWN12-STALE'); // ya hay decisión registrada
      expect(await codeOfChip(confirm.execute(SAME_PERSON, id, {}))).toBe('ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT'); // otra cuenta, mismo person_id
      expect(await codeOfChip(confirm.execute({ ...A2, personId: null }, id, {}))).toBe('ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT'); // sin person_id: falla cerrada
      await expect(confirm.execute(A2, id, {})).rejects.toBeInstanceOf(AdminForbiddenError); // sin lectura previa de la evidencia
      const evidence = await e.run((r) => r.disputeEvidence.listByRequest(id));
      expect(evidence).toHaveLength(1);
      await new ReadDisputeEvidenceUseCase(e.deps).execute(A2, id, evidence[0]!.id);
      const closed = await confirm.execute(A2, id, { reason: 'Confirmo' });
      expect(closed.status).toBe('RESOLVED');
      expect((await e.run((r) => r.coOwners.listByPet(luna.id))).map((c) => [c.userId, c.status])).toEqual([[ANDRES, 'ACTIVE']]);
      // La reserva se libera al cerrarse: el chip ya solo lo ocupa la mascota.
      expect(await codeOfChip(e.run((r) => assertMicrochipAvailable(e.deps, r, CARLOS, CHIP_A)))).toBe('ERR-CHP12-MICROCHIP-REGISTERED');
    });

    it('[SC-012-090][T1645] el reclamante solo ve el desenlace cerrado: sin identidad del otro dueño, del árbitro, de la mascota ni motivo', async () => {
      const { e, id } = await open();
      await new ResolveChipDisputeUseCase(e.deps).execute(A1, id, { resolution: 'REJECT', reason: 'No hay prueba. Maria Perez es la dueña.' });
      const mine = await new ListMyChipRequestsUseCase(e.deps).execute(ANDRES);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ action: 'CHIP_DISPUTE', status: 'RESOLVED', outcome: 'RESOLVED_REJECTED', resolution: 'REJECT', disputeReason: 'CHIP_APPROPRIATION' });
      const serialized = JSON.stringify(mine);
      for (const secret of [MARIA, A1.adminId, A1.personId!, 'Luna', 'maria', 'prueba', CHIP_A]) expect(serialized).not.toContain(secret);
    });

    it('[EDGE-012-064][P-1] a los 60 días la disputa vence EXPIRED sin cooldown, libera la reserva y deja la evidencia con delete_after = vencimiento + 365 días', async () => {
      const { e, luna, id } = await open();
      e.setNow(day(61));
      expect(await expireLapsedDisputes(e.deps)).toBe(1);
      const row = (await requestRows(e, luna.id)).find((r) => r['id'] === id)!;
      expect(row['status']).toBe('EXPIRED');
      expect(row['resolution']).toBeNull();
      const [evidence] = await e.run((r) => r.disputeEvidence.listByRequest(id));
      expect(evidence!.deleteAfter).toBe(new Date(Date.parse(String(row['expiresAt'])) + 365 * 86_400_000).toISOString());
      const mine = await new ListMyChipRequestsUseCase(e.deps).execute(ANDRES);
      expect(mine[0]).toMatchObject({ status: 'EXPIRED', outcome: 'EXPIRED' });
      // Sin cooldown: puede volver a abrir de inmediato.
      expect(await codeOfChip(new OpenChipDisputeUseCase(e.deps).execute(ANDRES, { microchipId: CHIP_A, evidence: PNG_EVIDENCE }))).toBe('OK');
    });

    it('[SC-012-118] la purga borra primero las filas de evidencia y encola sus claves en la misma unidad; solo después el expediente puede purgarse (RESTRICT)', async () => {
      const { e, id } = await open();
      await new CloseChipDisputeMootUseCase(e.deps).execute(A1, id, { mootReason: 'PET_GONE' });
      const [evidence] = await e.run((r) => r.disputeEvidence.listByRequest(id));
      expect(await purgeExpiredDisputeEvidence(e.deps)).toBe(0); // aún no vence
      e.setNow(day(366));
      expect(await purgeExpiredDisputeEvidence(e.deps)).toBe(1);
      expect(await e.run((r) => r.disputeEvidence.listByRequest(id))).toHaveLength(0);
      expect(await e.run((r) => r.mediaQueue.findByKey(evidence!.objectKey))).toMatchObject({ reason: 'DELETE' });
    });

    it('[SC-012-120] el barrido borra los objetos del área de espera sin fila con más de 24 h y respeta los que tienen fila', async () => {
      const { e, id } = await open();
      const storage = e.deps.media!.storage;
      const orphan = 'claims/5a5a5a5a-0000-4000-8000-000000000001/5a5a5a5a-0000-4000-8000-000000000002';
      await storage.put(orphan, new Uint8Array([1]), 'image/png');
      const [kept] = await e.run((r) => r.disputeEvidence.listByRequest(id));
      expect(await sweepOrphanDisputeEvidence(e.deps)).toBe(0); // recién subidos: dentro del TTL
      e.setNow(day(2));
      expect(await sweepOrphanDisputeEvidence(e.deps)).toBe(1);
      expect(await storage.get(orphan)).toBeNull();
      expect((await storage.get(kept!.objectKey))?.contentType).toBe('image/png');
    });

    it('[EDGE-012-043] SUPPORT no arbitra (deny-by-default) y el cierre sin efecto no activa el cooldown', async () => {
      const { e, id } = await open();
      expect(await codeOfChip(new ResolveChipDisputeUseCase(e.deps).execute({ ...A1, role: 'SUPPORT' }, id, { resolution: 'REJECT' }))).toBe('ERR-ADM11-ROLE-NOT-AUTHORIZED');
      await new CloseChipDisputeMootUseCase(e.deps).execute(A1, id, { mootReason: 'PET_GONE' });
      expect(await codeOfChip(new OpenChipDisputeUseCase(e.deps).execute(ANDRES, { microchipId: CHIP_A, evidence: PNG_EVIDENCE }))).toBe('OK');
    });
  });
}
