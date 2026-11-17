/**
 * T534 [US2] síntomas, lado dominio y aplicación (SC-CAT-009, SC-CAT-011, SC-CAT-034; REQ-SIN-001, REQ-SIN-003, INV-SIN-001, INV-SIN-002):
 * catálogo cerrado, coherencia categoría/tipo, el servidor acepta VOMIT en RABBIT, sin efecto en alertas y búsqueda estática en dominio.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { AddCustomParameterUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { GetPetDashboardUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { validateRecord, validateRecordInput } from '../../../src/domain/records/record-invariants.ts';
import { ANDRES, ARGOS, canonicalState, createHarness } from '../../fixtures/application-harness.ts';

const TODAY = '2026-11-05';
const BIRTH = '2020-01-01';
const BASE = { recordedAt: TODAY, title: 'Vómito', description: 'Vomitó dos veces tras la comida.' };

function outcome(fn: () => unknown): string {
  try {
    fn();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}
const input = (extra: Record<string, unknown>) => validateRecordInput('customParameters', { ...BASE, ...extra }, BIRTH, TODAY);

describe('T534 catálogo cerrado y coherencia categoría/tipo (SC-CAT-009, INV-SIN-001)', () => {
  it('SYMPTOM con VOMIT y MODERATE se acepta; los 4 tipos y las 3 intensidades pasan', () => {
    expect(outcome(() => input({ category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MODERATE' }))).toBe('OK');
    for (const symptomType of ['VOMIT', 'APPETITE', 'STOOL', 'ENERGY']) for (const severity of ['MILD', 'MODERATE', 'SEVERE']) {
      expect(outcome(() => input({ category: 'SYMPTOM', symptomType, severity }))).toBe('OK');
    }
  });

  it('symptomType = FEVER, SYMPTOM sin tipo o sin intensidad y ALLERGY con symptomType se rechazan con ERR-SCHEMA-VALIDATION-FAILED', () => {
    const bad = [
      input.bind(null, { category: 'SYMPTOM', symptomType: 'FEVER', severity: 'MILD' }),
      input.bind(null, { category: 'SYMPTOM', severity: 'MILD' }),
      input.bind(null, { category: 'SYMPTOM', symptomType: 'VOMIT' }),
      input.bind(null, { category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'GRAVE' }),
      input.bind(null, { category: 'ALLERGY', symptomType: 'VOMIT', severity: 'MILD' }),
      input.bind(null, { category: 'ALLERGY', severity: 'MILD' }),
    ];
    for (const run of bad) expect(outcome(run).startsWith('ERR-SCHEMA-VALIDATION-FAILED@')).toBe(true);
  });

  it('las categorías que no son síntoma siguen aceptándose sin tipo ni intensidad, o con ambos nulos', () => {
    expect(outcome(() => input({ category: 'ALLERGY' }))).toBe('OK');
    expect(outcome(() => input({ category: 'ALLERGY', symptomType: null, severity: null }))).toBe('OK');
  });

  it('un registro guardado antes de la 004 (sin symptomType ni severity) sigue siendo válido al leerlo o importarlo', () => {
    const old = { id: 'a1000000-0000-4000-8000-0000000000bb', petId: ARGOS.id, ...BASE, category: 'ALLERGY', notes: null, createdAt: '2026-10-01T10:00:00.000Z' };
    expect(outcome(() => validateRecord('customParameters', old, BIRTH, TODAY))).toBe('OK');
    expect(outcome(() => validateRecord('customParameters', { ...old, category: 'SYMPTOM', symptomType: 'STOOL', severity: 'SEVERE' }, BIRTH, TODAY))).toBe('OK');
  });
});

describe('T534 el servidor no impone la presentación de D-17 A', () => {
  it('VOMIT se registra en una mascota RABBIT (solo la interfaz lo oculta)', async () => {
    const state = canonicalState();
    const rabbit = { ...ARGOS, id: '11111111-1111-4111-8111-111111111106', name: 'Nube', species: 'RABBIT' } as typeof ARGOS;
    state.pets.push(rabbit);
    const { deps, uow } = createHarness(state);
    const view = await new AddCustomParameterUseCase(deps).execute(ANDRES, rabbit.id, { ...BASE, category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MILD' });
    expect([view.symptomType, view.severity]).toEqual(['VOMIT', 'MILD']);
    expect(uow.snapshot().records.customParameters.at(-1)).toMatchObject({ category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MILD' });
  });
});

describe('T534 sin efecto en alertas (SC-CAT-011, SC-CAT-034, INV-SIN-002)', () => {
  it('5 síntomas SEVERE en un día no cambian el resumen de alertas ni el semáforo de la ficha', async () => {
    const before = createHarness();
    const dashBefore = await new GetPetDashboardUseCase(before.deps).execute(ANDRES, ARGOS.id);
    const { deps } = createHarness();
    const add = new AddCustomParameterUseCase(deps);
    for (const symptomType of ['VOMIT', 'VOMIT', 'APPETITE', 'STOOL', 'ENERGY']) {
      await add.execute(ANDRES, ARGOS.id, { ...BASE, category: 'SYMPTOM', symptomType, severity: 'SEVERE' });
    }
    const dashAfter = await new GetPetDashboardUseCase(deps).execute(ANDRES, ARGOS.id);
    expect(dashAfter.alertsSummary).toEqual(dashBefore.alertsSummary);
    expect([dashAfter.vaccinations, dashAfter.dewormings]).toEqual([dashBefore.vaccinations, dashBefore.dewormings]);
    expect((dashAfter.customParameters as ReadonlyArray<{ category: string }>).filter((c) => c.category === 'SYMPTOM')).toHaveLength(5);
  });

  it('una description «dar 5 mg» no genera alerta ni cambio de estado y se guarda tal cual', async () => {
    const before = createHarness();
    const dashBefore = await new GetPetDashboardUseCase(before.deps).execute(ANDRES, ARGOS.id);
    const { deps } = createHarness();
    const view = await new AddCustomParameterUseCase(deps).execute(ANDRES, ARGOS.id, { ...BASE, category: 'SYMPTOM', symptomType: 'APPETITE', severity: 'MILD', description: 'dar 5 mg de paracetamol' });
    expect(view.description).toBe('dar 5 mg de paracetamol');
    const dashAfter = await new GetPetDashboardUseCase(deps).execute(ANDRES, ARGOS.id);
    expect(dashAfter.alertsSummary).toEqual(dashBefore.alertsSummary);
  });
});

describe('T534 búsqueda estática en el dominio de alertas (SC-CAT-011)', () => {
  it('ningún módulo de src/domain/alerts/ referencia symptomType ni severity', () => {
    const dir = join(process.cwd(), 'src/domain/alerts');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/symptomType|severity|SYMPTOM/);
  });
});
