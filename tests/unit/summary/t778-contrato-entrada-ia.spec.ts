/**
 * T778 [US5] el contrato del resumen como entrada de Fase 5 (REQ-SUM-006; SC-005-033): versionado, de esquema cerrado, sin datos de contacto, sin cambios en `package.json`
 * y compilando con Ajv 2020 junto a los esquemas anteriores. No se integra ningún proveedor de IA en 005 (cualquier envío a terceros es Nivel 2 y requiere `/rama`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary, CLINICAL_SUMMARY_VERSION } from '../../../src/domain/summary/clinical-summary.ts';
import { ARGOS, canonicalState } from '../../fixtures/application-harness.ts';
import { upgradePet, upgradeRecords } from '../../fixtures/storage-upgrade.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
/**
 * SHA-256 de `package.json` y `package-lock.json` tal como estaban en el último commit de la feature 004 (44c83e0), fijados a mano (NFR-005-004).
 * El contrato «sin SDK de IA ni dependencia nueva en 005» es el estado de 004. No se usa git en tiempo de ejecución porque el checkout de CI es superficial
 * (fetch-depth 1) y 44c83e0 no existe allí. Cualquier cambio legítimo de dependencias debe actualizar estos hashes de forma consciente y autorizada.
 * Se obtuvieron con `git show 44c83e0:<archivo> | shasum -a 256`.
 */
const PINNED_SHA256 = {
  // T805 (N2-08, Neo): único cambio autorizado de package.json tras 44c83e0, el script test:gate (compile y trazabilidad 006). El hash anterior era ca9158d5...; dependencias y lock siguen intactos (lo demuestra el hash del lock y t805-test-gate-006.spec.ts).
  'package.json': 'd239eba5b5285391a0e1c03efd88f8cd6f8d1568ace687bf57bb5c56544c063c',
  'package-lock.json': 'cb1c84443f10107c56e0486b3084aba191a0d95fcbe490a95779c1232038ef25',
} as const;
const SCHEMA_FILE = join(ROOT, 'specs/005-album-archivos-clinicos/contracts/schemas/clinical-summary.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as Record<string, unknown>;

/** Recorre el esquema y devuelve cada nodo de tipo `object` con su ruta. */
function objectNodes(node: unknown, path: string, out: Array<{ path: string; node: Record<string, unknown> }> = []): Array<{ path: string; node: Record<string, unknown> }> {
  if (Array.isArray(node)) node.forEach((child, i) => objectNodes(child, `${path}[${i}]`, out));
  else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record['type'] === 'object') out.push({ path, node: record });
    for (const [key, child] of Object.entries(record)) objectNodes(child, `${path}/${key}`, out);
  }
  return out;
}

/** Nombres de propiedad de todo el esquema. */
function propertyNames(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => propertyNames(child, out));
  else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const props = record['properties'];
    if (props !== null && typeof props === 'object') Object.keys(props).forEach((k) => out.add(k));
    Object.values(record).forEach((child) => propertyNames(child, out));
  }
  return out;
}

describe('T778 contrato del resumen versionado y cerrado (REQ-SUM-006, SC-005-033)', () => {
  it('[REQ-SUM-006][SC-005-033] la versión del esquema, la constante del dominio y el campo summaryVersion del resumen construido coinciden', () => {
    const state = canonicalState();
    const records = upgradeRecords(state.records);
    const pet = upgradePet(ARGOS);
    const collections = {
      weights: records.weights.filter((r) => r.petId === pet.id),
      bodyMeasurements: records.bodyMeasurements.filter((r) => r.petId === pet.id),
      vaccinations: records.vaccinations.filter((r) => r.petId === pet.id),
      dewormings: records.dewormings.filter((r) => r.petId === pet.id),
      medicalVisits: records.medicalVisits.filter((r) => r.petId === pet.id),
      customParameters: records.customParameters.filter((r) => r.petId === pet.id),
    };
    const summary = buildClinicalSummary('PET', [{ pet, records: collections, files: [] }], '2026-11-18T12:00:00.000Z', { includeMicrochip: false, includeClinicalFiles: false });
    expect((schema['x-sdd-metadata'] as { version: string }).version).toBe(CLINICAL_SUMMARY_VERSION);
    expect(summary.summaryVersion).toBe(CLINICAL_SUMMARY_VERSION);
    expect(CLINICAL_SUMMARY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('[REQ-SUM-006][SC-005-033] todo objeto del esquema es cerrado (additionalProperties false): un campo nuevo no entra sin una versión nueva', () => {
    const open = objectNodes(schema, '#').filter(({ node }) => node['additionalProperties'] !== false).map(({ path }) => path);
    expect(open).toEqual([]);
  });

  it('[REQ-SUM-006][SC-005-033] el esquema no tiene datos de contacto ni identidad de usuario (correo, teléfono, dirección, usuario, hogar, nombres de archivo ni claves)', () => {
    const forbidden = /^(email|e-?mail|correo|phone|telefono|teléfono|mobile|celular|address|direccion|dirección|username|userId|ownerUserId|householdId|originalName|objectKey|storageKey|avatar|photo|contact.*)$/i;
    expect([...propertyNames(schema)].filter((name) => forbidden.test(name))).toEqual([]);
  });

  it('[REQ-SUM-006][SC-005-033] no hay dependencia nueva: package.json es idéntico al de la feature 004 y no se integra ningún proveedor de IA', () => {
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    expect(pkg).not.toMatch(/openai|@anthropic-ai|@google\/generative-ai|@google-cloud\/vertexai|langchain|cohere|mistral/i);
    for (const [file, expected] of Object.entries(PINNED_SHA256)) {
      const actual = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
      expect({ file, sha256: actual }).toEqual({ file, sha256: expected });
    }
  });

  it('[REQ-SUM-006][SC-005-033] los cuatro esquemas de la 005 compilan con Ajv 2020 estricto junto a los de la 004 y sus $ref externos resuelven', () => {
    const ajv = new Ajv2020({ strict: true, strictTypes: true, allowUnionTypes: true, allErrors: true, multipleOfPrecision: 10 });
    addFormats(ajv);
    for (const keyword of ['x-sdd-metadata', 'x-sdd-status', 'x-sdd-error', '$anchor']) ajv.addKeyword(keyword);
    const loaded = new Set<string>();
    for (const feature of ['002', '003', '004', '005']) {
      const dir = readdirSync(join(ROOT, 'specs')).find((d) => d.startsWith(`${feature}-`));
      const schemasDir = dir === undefined ? '' : join(ROOT, 'specs', dir, 'contracts/schemas');
      if (!existsSync(schemasDir)) continue;
      for (const file of readdirSync(schemasDir).filter((f) => f.endsWith('.schema.json')).sort()) {
        const doc = JSON.parse(readFileSync(join(schemasDir, file), 'utf8')) as { $id: string };
        if (loaded.has(doc.$id)) continue;
        loaded.add(doc.$id);
        ajv.addSchema(doc, doc.$id);
      }
    }
    for (const file of ['clinical-summary', 'share-link', 'album', 'platform-parameter']) {
      const id = `https://argos.local/contracts/schemas/${file}.schema.json`;
      expect(loaded.has(id), id).toBe(true);
      expect(typeof ajv.getSchema(id), id).toBe('function');
    }
  });
});
