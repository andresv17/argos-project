/**
 * T1046 (007, Bloque D, [GH:#14]): Opción B decidida por Neo solo para Peso, Medidas, Vacunas y Desparasitaciones. Sin registros y con permiso de escritura: formulario con
 * «Guardar» sin `<summary>` «Registrar …»; con 1 registro: `<details>` «Registrar …» plegado; sin permiso: nada. Consultas y Parámetros sin cambio. Predicado puro
 * `showsFormOpenByDefault` y render estático (sin jsdom). REQ-REG7-001, REQ-REG7-002, EDGE-007-007; SC-007-017, SC-007-018, SC-007-019, SC-007-020.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { OPTION_B_MODULES, RECORD_MODULES, showsBareForm, showsFormOpenByDefault, type RecordModule } from '../../../src/presentation/web/records.ts';
import type { PetDashboardView } from '../../../src/presentation/web/view-model.ts';
import { alert, dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const TS = '2026-11-01T10:00:00.000Z';
const OPTION_B: readonly RecordModule[] = ['weights', 'measurements', 'vaccinations', 'dewormings'];
const UNCHANGED: readonly RecordModule[] = ['visits', 'customParameters'];
const SUMMARY: Readonly<Record<RecordModule, string>> = {
  weights: 'Registrar peso',
  measurements: 'Registrar medidas',
  vaccinations: 'Registrar vacuna',
  dewormings: 'Registrar desparasitación',
  visits: 'Registrar consulta',
  customParameters: 'Registrar parámetro',
};

const base = dashboard('OWNER');
const petId = base.profile.id;
const oneRecord = (module: RecordModule): Partial<PetDashboardView> => {
  switch (module) {
    case 'weights':
      return { weights: [base.weights[0]!] };
    case 'measurements':
      return { bodyMeasurements: [{ id: 'm1', petId, recordedAt: '2026-02-10', neckCm: 30, chestCm: 50, backLengthCm: 40, waistCm: 45, notes: null, createdAt: TS }] } as never;
    case 'vaccinations':
      return { vaccinations: [base.vaccinations[0]!] };
    case 'dewormings':
      return { dewormings: [{ record: { id: 'd1', petId, productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-01-01', nextSuggestedDoseAt: '2026-04-01', notes: null, createdAt: TS }, alert: alert('UP_TO_DATE', 30, 'Al día', 'SUCCESS_GREEN') }] } as never;
    case 'visits':
      return { medicalVisits: [{ id: 'c1', petId, visitDate: '2026-02-10', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral', notes: null, createdAt: TS }] } as never;
    case 'customParameters':
      return { customParameters: [{ id: 'p1', petId, recordedAt: '2026-02-10', category: 'DIET_CHANGE', title: 'Pienso nuevo', description: 'Cambio gradual', createdAt: TS }] } as never;
  }
};
const empty: Partial<PetDashboardView> = { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] };
const render = (module: RecordModule, overrides: Partial<PetDashboardView>, role: 'OWNER' | 'READER' = 'OWNER'): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: { ...dashboard(role), ...empty, ...overrides }, activeTab: module, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop }));
const panel = (markup: string): string => /<section[^>]*role="tabpanel".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('T1046 predicado puro (REQ-REG7-002)', () => {
  it('[SC-007-017] showsFormOpenByDefault: true solo sin registros y con permiso de escritura', () => {
    for (const { id } of RECORD_MODULES) {
      expect(showsFormOpenByDefault(id, [], true)).toBe(true);
      expect(showsFormOpenByDefault(id, [], false)).toBe(false);
      expect(showsFormOpenByDefault(id, [{}], true)).toBe(false);
      expect(showsFormOpenByDefault(id, [{}, {}], false)).toBe(false);
    }
  });

  it('[REQ-REG7-001] la Opción B alcanza solo a Peso, Medidas, Vacunas y Desparasitaciones; Consultas y Parámetros quedan fuera', () => {
    expect([...OPTION_B_MODULES].sort()).toEqual([...OPTION_B].sort());
    for (const id of OPTION_B) expect(showsBareForm(id, [], true)).toBe(true);
    for (const id of UNCHANGED) expect(showsBareForm(id, [], true)).toBe(false);
  });

  it('[SC-007-018][SC-007-020] showsBareForm es falso con registros o sin permiso, en los cuatro módulos', () => {
    for (const id of OPTION_B) {
      expect(showsBareForm(id, [{}], true)).toBe(false);
      expect(showsBareForm(id, [], false)).toBe(false);
    }
  });
});

describe('T1046 los cuatro módulos de la Opción B (SC-007-017..020)', () => {
  for (const module of OPTION_B) {
    it(`[SC-007-017] ${module} sin registros: formulario abierto con «Guardar» y sin «${SUMMARY[module]}» como <summary>`, () => {
      const content = panel(render(module, {}));
      expect(content).toContain('<form');
      expect(content).toContain('>Guardar<');
      expect(content).not.toContain('<summary');
      expect(content).not.toContain('<details');
    });

    it(`[SC-007-018] ${module} con 1 registro: reaparece «${SUMMARY[module]}» como <details> plegado y el formulario sigue dentro`, () => {
      const content = panel(render(module, oneRecord(module)));
      expect(content).toMatch(/<details(?![^>]*\sopen)[^>]*>/);
      expect(content).toMatch(new RegExp(`<summary[^>]*>${SUMMARY[module]}</summary>`));
      expect(content).toContain('<form');
    });

    it(`[SC-007-019] ${module} al borrar el último registro vuelve al estado sin registros (formulario abierto, sin summary)`, () => {
      const after = panel(render(module, {}));
      expect(after).toContain('<form');
      expect(after).not.toContain('<summary');
    });

    it(`[SC-007-020][EDGE-007-007] ${module} con permiso de solo lectura: ni formulario ni botón, con y sin registros`, () => {
      for (const overrides of [{}, oneRecord(module)]) {
        const content = panel(render(module, overrides, 'READER'));
        expect(content).not.toContain('<form');
        expect(content).not.toContain('<summary');
        expect(content).not.toContain('>Guardar<');
      }
    });
  }
});

describe('T1046 Consultas y Parámetros sin cambio (REQ-REG7-001)', () => {
  for (const module of UNCHANGED) {
    it(`[REQ-REG7-001] ${module} sin registros conserva <details open> con «${SUMMARY[module]}»`, () => {
      const content = panel(render(module, {}));
      expect(content).toMatch(/<details[^>]*\sopen=""/);
      expect(content).toMatch(new RegExp(`<summary[^>]*>${SUMMARY[module]}</summary>`));
    });

    it(`[REQ-REG7-001] ${module} con 1 registro conserva <details> plegado con «${SUMMARY[module]}»`, () => {
      const content = panel(render(module, oneRecord(module)));
      expect(content).toMatch(/<details(?![^>]*\sopen)[^>]*>/);
      expect(content).toMatch(new RegExp(`<summary[^>]*>${SUMMARY[module]}</summary>`));
    });
  }

  it('[REQ-REG7-002] la regla frozenOpen se conserva y la fuente no introduce constante de opción (M7-09)', () => {
    const source = readFileSync('src/presentation/web/components/PetDashboard.tsx', 'utf8');
    expect(source).toContain('frozenOpen');
    expect(`${source}${readFileSync('src/presentation/web/records.ts', 'utf8')}`).not.toMatch(/REGISTER_OPTION|FORM_OPTION|OPTION_A\b/);
  });
});
