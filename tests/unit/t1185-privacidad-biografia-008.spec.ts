/**
 * T1185 (008, bloque I, `[GH:#21]`, parte de `/rama`): privacidad de la biografía (texto libre con posible PII).
 * (a) ni el valor ni su fragmento aparecen en errores de validación de dominio ni en la auditoría (solo el nombre del campo y la huella);
 * (b) el respaldo 3.3.0 la lleva SOLO al propio dueño (REQ-BIO8-004) y el sobre rechaza caracteres de control y más de 280; el resumen veterinario NUNCA la incluye;
 * (c) la escena (payload y prompt) nunca la recibe (D8-12 = A, REQ-BIO8-003): esa prueba end-to-end con centinela vive en t1182 (no se duplica aquí, porque un snapshot sin el texto daría una prueba vacía).
 * Además: la ficha la muestra como texto (nunca HTML) y ningún módulo que la maneja escribe en consola o en el registro de la aplicación (guarda estática).
 * REQ-BIO8-002, REQ-BIO8-003, REQ-BIO8-004, NFR-008-004, EDGE-008-041, EDGE-008-042; SC-008-043..046.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary } from '../../src/domain/summary/clinical-summary.ts';
import { normalizeBiographyInput, updatePetProfile, type PetProfile } from '../../src/domain/pet/pet-invariants.ts';
import { ExportBackupUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import { UpdatePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { validateBackupEnvelopeV33 } from '../../src/generated/v31/index.ts';
import { PetDashboard } from '../../src/presentation/web/components/PetDashboard.tsx';
import { ANDRES, ARGOS, MARIA, canonicalState, createHarness, envelope } from '../fixtures/application-harness.ts';
import { validBackupState } from '../fixtures/backup-harness.ts';
import { dashboard } from './presentation/presentation-fixtures.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const SENTINEL = 'SECRETO-T1185-Calle-Falsa-123';
const ROOT = resolve(fileURLToPath(new URL('../../src', import.meta.url)));

const validBackupWith = (biography: string) => {
  const state = validBackupState();
  state.pets = state.pets.map((p) => (p.id === ARGOS.id ? { ...p, biography } : p));
  return state;
};

const withBiography = (biography: string) => {
  const state = canonicalState();
  state.pets = state.pets.map((p) => (p.id === ARGOS.id ? { ...p, biography } : p));
  return state;
};

const captured = (run: () => unknown): { message: string; field: unknown; code: unknown; own: string } => {
  try {
    run();
  } catch (error) {
    const e = error as { message?: string; field?: unknown; code?: unknown };
    return { message: String(e.message ?? ''), field: e.field, code: e.code, own: JSON.stringify({ ...(error as object), message: e.message, stack: (error as Error).stack ?? '' }) };
  }
  throw new Error('se esperaba un error de validación');
};

describe('T1185(a) la biografía no se repite en errores de validación ni en auditoría', () => {
  it('[REQ-BIO8-001][EDGE-008-041] carácter de control: el error nombra solo el campo y no contiene el texto', () => {
    const err = captured(() => updatePetProfile({ pet: ARGOS as PetProfile, input: { biography: `${SENTINEL}\u0001cola`, }, today: '2026-11-05', nowIsoTimestamp: NOW, recordEventDates: [] }));
    expect(err.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(err.field).toBe('biography');
    expect(err.message).not.toContain(SENTINEL);
    expect(err.own).not.toContain(SENTINEL);
    expect(err.own).not.toContain('cola');
  });

  it('[REQ-BIO8-001][EDGE-008-041] más de 280 caracteres: el error no repite ni el prefijo del valor', () => {
    const long = `${SENTINEL}${'x'.repeat(300)}`;
    const err = captured(() => updatePetProfile({ pet: ARGOS as PetProfile, input: { biography: long }, today: '2026-11-05', nowIsoTimestamp: NOW, recordEventDates: [] }));
    expect(err.field).toBe('biography');
    expect(err.message).not.toContain(SENTINEL);
    expect(err.own).not.toContain(SENTINEL);
  });

  it('[REQ-BIO8-001] el normalizador no lanza ni repite el valor al recortar', () => {
    const out = normalizeBiographyInput({ biography: `  ${SENTINEL}  ` });
    expect(out).toEqual({ biography: SENTINEL });
    expect(JSON.stringify(normalizeBiographyInput({ biography: 7 }))).not.toContain(SENTINEL);
  });

  it('[NFR-008-004][REQ-BIO8-002] la auditoría de una edición guarda solo huellas: el texto no aparece en filas de auditoría', async () => {
    const h0 = createHarness(canonicalState());
    const update = new UpdatePetUseCase(h0.deps);
    await update.execute(ANDRES, ARGOS.id, { biography: SENTINEL }, 1);
    const snap = h0.uow.snapshot();
    expect(snap.pets.find((p) => p.id === ARGOS.id)?.biography).toBe(SENTINEL); // la mascota sí la guarda (ficha)
    expect(snap.auditLog.length).toBeGreaterThan(0);
    expect(JSON.stringify(snap.auditLog)).not.toContain(SENTINEL);
  });

  it('[REQ-BIO8-002] un intento inválido por la API no escribe nada ni deja rastro del texto', async () => {
    const h0 = createHarness(withBiography('original'));
    const before = JSON.stringify(h0.uow.snapshot());
    await expect(new UpdatePetUseCase(h0.deps).execute(ANDRES, ARGOS.id, { biography: `${SENTINEL}\nx` }, 1)).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    expect(JSON.stringify(h0.uow.snapshot())).toBe(before);
    expect(JSON.stringify(h0.uow.snapshot())).not.toContain(SENTINEL);
  });
});

describe('T1185(b) respaldo y resumen veterinario', () => {
  it('[REQ-BIO8-004] el respaldo del dueño la lleva; el de otra cuenta NO contiene la biografía ajena', async () => {
    const h0 = createHarness(validBackupWith(SENTINEL));
    const own = await new ExportBackupUseCase(h0.deps).execute(ANDRES);
    expect(own.json).toContain(SENTINEL); // coherente con REQ-BIO8-004 (3.3.0 transporta biography)
    const other = await new ExportBackupUseCase(createHarness(validBackupWith(SENTINEL)).deps).execute(MARIA);
    expect(other.json).not.toContain(SENTINEL);
  });

  it('[REQ-BIO8-004][EDGE-008-041] el sobre 3.3.0 exportado valida; con control de caracteres o más de 280 se rechaza', async () => {
    const h0 = createHarness(validBackupWith('Texto corto'));
    const envelope = (await new ExportBackupUseCase(h0.deps).execute(ANDRES)).envelope as unknown as { pets: Array<Record<string, unknown>> };
    expect(validateBackupEnvelopeV33(envelope)).toBe(true);
    const pet = envelope.pets.find((p) => p['name'] === 'Argos') ?? envelope.pets[0]!;
    const withField = (value: string) => ({ ...envelope, pets: envelope.pets.map((p) => (p === pet ? { ...p, biography: value } : p)) });
    expect(validateBackupEnvelopeV33(withField(`${SENTINEL}\u0000`))).toBe(false);
    expect(validateBackupEnvelopeV33(withField(`${SENTINEL}\nlinea2`))).toBe(false);
    expect(validateBackupEnvelopeV33(withField('x'.repeat(281)))).toBe(false);
    expect(validateBackupEnvelopeV33(withField('x'.repeat(280)))).toBe(true);
  });

  it('[REQ-BIO8-002][EDGE-008-042] el resumen veterinario (ClinicalSummary) no contiene la biografía ni con todas las opciones', () => {
    const pet = { ...(ARGOS as PetProfile), biography: SENTINEL } as PetProfile;
    const records = Object.fromEntries(Object.keys(envelope.records).map((k) => [k, []])) as never;
    const summary = buildClinicalSummary('PET', [{ pet, records, files: [] }], NOW, { includeMicrochip: true, includeClinicalFiles: true, includeDeceasedAt: true });
    expect(JSON.stringify(summary)).not.toContain(SENTINEL);
    expect(JSON.stringify(summary)).not.toMatch(/biography/);
  });
});

describe('T1185 presentación y guarda estática de registros', () => {
  it('[REQ-BIO8-002][EDGE-008-042] la ficha muestra la biografía como texto escapado, nunca como HTML', () => {
    const base = dashboard('OWNER');
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const markup = renderToStaticMarkup(h(PetDashboard, { dashboard: { ...base, profile: { ...base.profile, biography: payload } as never }, activeTab: 'weights', onTabChange: () => undefined, onAddRecord: async () => undefined, onEdit: () => undefined, onDelete: () => undefined }));
    expect(markup).not.toContain('<img src=x');
    expect(markup).not.toContain('<script>alert(2)');
    expect(markup).toContain('&lt;img');
  });

  it('[NFR-008-004] ningún módulo que maneja la biografía escribe en consola ni en el registro de la aplicación', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { if (!/generated/.test(full)) walk(full); } else if (/\.(ts|tsx)$/.test(name)) files.push(full);
      }
    };
    walk(ROOT);
    const touching = files.filter((f) => readFileSync(f, 'utf8').includes('biography'));
    expect(touching.length).toBeGreaterThan(5);
    const offenders = touching.filter((f) => /console\.|\.log\.(info|warn|error|debug)\(|logger\./.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
