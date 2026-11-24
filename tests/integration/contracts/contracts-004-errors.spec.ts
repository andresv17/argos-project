/**
 * T512: catálogo de errores de la feature 004 (RFC 9457). Desbloquea verify-traceability.sh --feature 004.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const CONTRACTS = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts');

interface Entry {
  type: string;
  status: number;
  title: string;
  invariantRef: string;
  detailTemplate: string;
  requirementRef: string;
  pendingId?: boolean;
}
const catalog = JSON.parse(readFileSync(join(CONTRACTS, 'errors/error-catalog.json'), 'utf8')) as {
  errors: Record<string, Entry>;
  'x-sdd-metadata': { version: string; status: string; supersedes: string; added: string[] };
};
const entry = (code: string): Entry => {
  const found = catalog.errors[code];
  if (!found) throw new Error(`falta ${code}`);
  return found;
};

describe('T512 catálogo de errores 004', () => {
  it('REQ-ARC-001: el catálogo pasa a 3.3.0 MINOR en DRAFT (009 T1241) y lista los 12 errores añadidos (6 de 004, ERR-PET-VERSION-CONFLICT de 007, 2 de Google de 008 y ERR-ACCOUNT-PENDING, ERR-ACCOUNT-REJECTED y ERR-ACCOUNT-REGISTRATION-RATE-LIMITED de 009)', () => {
    expect(catalog['x-sdd-metadata']).toEqual(expect.objectContaining({ version: '3.3.0', status: 'DRAFT', supersedes: '3.2.0' }));
    expect(catalog['x-sdd-metadata'].added.sort()).toEqual(
      ['ERR-MEDIA-NOT-FOUND', 'ERR-MEDIA-QUOTA-EXCEEDED', 'ERR-MEDIA-STORAGE-UNAVAILABLE', 'ERR-MEDIA-TOO-LARGE', 'ERR-MEDIA-TYPE-NOT-ALLOWED', 'ERR-REC-CONFLICT', 'ERR-PET-VERSION-CONFLICT', 'ERR-AUTH-GOOGLE-FAILED', 'ERR-AUTH-GOOGLE-LINK-CONFLICT', 'ERR-ACCOUNT-PENDING', 'ERR-ACCOUNT-REJECTED', 'ERR-ACCOUNT-REGISTRATION-RATE-LIMITED'].sort(),
    );
  });

  it.each([
    ['ERR-MEDIA-TOO-LARGE', 413, 'REQ-ARC-001'],
    ['ERR-MEDIA-TYPE-NOT-ALLOWED', 415, 'REQ-ARC-001'],
    ['ERR-MEDIA-QUOTA-EXCEEDED', 409, 'REQ-ARC-005'],
    ['ERR-MEDIA-NOT-FOUND', 404, 'REQ-ARC-002'],
    ['ERR-MEDIA-STORAGE-UNAVAILABLE', 502, 'REQ-GCS-004'],
    ['ERR-REC-CONFLICT', 409, 'REQ-BOR-005'],
  ] as const)('REQ-ARC-001: %s tiene status %i, type RFC 9457 y requirementRef %s', (code, status, requirement) => {
    const found = entry(code);
    expect(found.status).toBe(status);
    expect(found.type).toBe(`urn:argos:error:${code}`);
    expect(found.requirementRef).toContain(requirement);
    expect(found.title.length).toBeGreaterThan(0);
    expect(found.detailTemplate.length).toBeGreaterThan(0);
    expect(found.invariantRef).toMatch(/^(INV|REQ)-[A-Z0-9]+-\d{3}$/);
    expect(found.pendingId).toBeUndefined();
  });

  it('REQ-PET4-001: ERR-PET-MICROCHIP-DUPLICATE queda oficial con el detalle sin datos de terceros', () => {
    const found = entry('ERR-PET-MICROCHIP-DUPLICATE');
    expect(found.status).toBe(409);
    expect(found.pendingId).toBeUndefined();
    expect(found.detailTemplate).toBe('Este microchip ya está registrado en ARGOS. Si es tuyo, contacta al administrador.');
    expect(found.requirementRef).toContain('REQ-PET4-001');
    expect(found.invariantRef).toBe('INV-PET4-001');
  });

  it('REQ-PET4-002: ERR-RATE-LIMITED cita los requisitos de microchip y subida', () => {
    const found = entry('ERR-RATE-LIMITED');
    expect(found.status).toBe(429);
    expect(found.requirementRef).toContain('REQ-PET4-002');
    expect(found.requirementRef).toContain('REQ-ARC-001');
  });

  it('REQ-BOR-005: los errores heredados que citan los contratos 004 existen y no hay retirados', () => {
    for (const code of ['ERR-REC-SUPERSEDED-IMMUTABLE', 'ERR-PET-NOT-FOUND', 'ERR-SCHEMA-VALIDATION-FAILED', 'ERR-AUTH-USERNAME-TAKEN', 'ERR-AUTH-TOO-MANY-ATTEMPTS']) {
      expect(catalog.errors[code]?.status, code).toBeGreaterThanOrEqual(400);
    }
    expect(catalog.errors['ERR-AUTH-USER-NOT-FOUND']).toEqual(undefined);
  });

  it('REQ-ARC-001: todo x-sdd-error de los esquemas 004 existe en el catálogo', () => {
    const dir = join(CONTRACTS, 'schemas');
    const used = new Set<string>();
    for (const file of readdirSync(dir)) {
      for (const match of readFileSync(join(dir, file), 'utf8').matchAll(/"x-sdd-error": "(ERR-[A-Z0-9-]+)"/g)) used.add(match[1] as string);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const code of used) expect(catalog.errors[code], code).toEqual(expect.objectContaining({ status: expect.any(Number) }));
  });

  it('REQ-GCS-004: verify-traceability.sh --feature 004 ya no aborta por ausencia del catálogo', () => {
    const res = spawnSync('bash', [join(ROOT, 'scripts/verify-traceability.sh'), '--feature', '004'], { cwd: ROOT, encoding: 'utf8' });
    expect(`${res.stdout}${res.stderr}`).not.toContain('Fuente ausente');
  });
});
