/**
 * T1022 (007, REQ-FAL7-009, EDGE-007-006, SC-007-030) interfaz de importación por reemplazo: con `lifeStatusChanges` que contienen `DECEASED → ALIVE` la vista previa avisa
 * cuántas fichas volverían a Vivo y exige una confirmación explícita (casilla) antes de habilitar «Importar respaldo»; sin ese cambio (o sin el campo) no hay aviso ni casilla.
 *
 * @implements REQ-FAL7-009
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canImportBackup, LifeRevivalConfirm, PreviewSummary } from '../../../src/presentation/web/pages/BackupPage.tsx';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '11111111-1111-4111-8111-111111111112';
const preview = (changes?: ReadonlyArray<{ petId: string; from: 'ALIVE' | 'DECEASED'; to: 'ALIVE' | 'DECEASED' }>) =>
  ({
    sourceSchemaVersion: '3.2.0',
    fileDigest: 'x',
    counts: { pets: 2, weights: 0, bodyMeasurements: 0, vaccinations: 0, dewormings: 0, medicalVisits: 0, customParameters: 0 },
    collisions: { petsReplacedCount: 2, sameIdPetsCount: 2 },
    affectedSharedPets: { petsCount: 0, householdsCount: 0 },
    ...(changes === undefined ? {} : { lifeStatusChanges: changes }),
  }) as never;
const REVIVED = [{ petId: ID_A, from: 'DECEASED', to: 'ALIVE' }] as const;

describe('T1022 importación con cambios de estado de vida (REQ-FAL7-009)', () => {
  it('[REQ-FAL7-009][SC-007-030] un cambio Fallecido → Vivo muestra el aviso con el recuento (singular y plural) y sin identificadores', () => {
    const one = renderToStaticMarkup(h(PreviewSummary, { preview: preview(REVIVED) }));
    expect(one).toContain('1 mascota fallecida volverá a figurar como viva');
    expect(one).not.toContain(ID_A);
    const two = renderToStaticMarkup(h(PreviewSummary, { preview: preview([...REVIVED, { petId: ID_B, from: 'DECEASED', to: 'ALIVE' }]) }));
    expect(two).toContain('2 mascotas fallecidas volverán a figurar como vivas');
  });

  it('[REQ-FAL7-009] sin el campo, con lista vacía o con cambios solo hacia Fallecido no hay aviso de reactivación', () => {
    for (const p of [preview(), preview([]), preview([{ petId: ID_A, from: 'ALIVE', to: 'DECEASED' }])]) {
      expect(renderToStaticMarkup(h(PreviewSummary, { preview: p }))).not.toContain('volverá');
      expect(renderToStaticMarkup(h(PreviewSummary, { preview: p }))).not.toContain('volverán');
    }
  });

  it('[REQ-FAL7-009][EDGE-007-004] la casilla repite la advertencia de alertas reactivadas y existe solo con N > 0', () => {
    const unchecked = renderToStaticMarkup(h(LifeRevivalConfirm, { count: 2, checked: false, onChange: () => undefined }));
    expect(unchecked).toContain('type="checkbox"');
    expect(unchecked).not.toContain('checked=""');
    expect(unchecked).toContain('Al volver a Vivo se reactivarán las alertas');
    expect(renderToStaticMarkup(h(LifeRevivalConfirm, { count: 2, checked: true, onChange: () => undefined }))).toContain('checked=""');
    expect(renderToStaticMarkup(h(LifeRevivalConfirm, { count: 0, checked: false, onChange: () => undefined }))).toBe('');
  });

  it('[REQ-FAL7-009] «Importar respaldo» exige la confirmación solo cuando hay Fallecido → Vivo (cancelar no escribe nada: el botón sigue inerte)', () => {
    const file = new Blob(['{}']);
    const base = { file, busy: false, mediaConfirmed: false } as const;
    expect(canImportBackup({ ...base, preview: preview(REVIVED), lifeConfirmed: false })).toBe(false);
    expect(canImportBackup({ ...base, preview: preview(REVIVED), lifeConfirmed: true })).toBe(true);
    expect(canImportBackup({ ...base, preview: preview([]), lifeConfirmed: false })).toBe(true);
    expect(canImportBackup({ ...base, preview: preview(), lifeConfirmed: false })).toBe(true);
  });
});
