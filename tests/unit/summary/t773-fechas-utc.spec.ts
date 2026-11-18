/**
 * T771 / T773 [US5] fechas de calendario sin conversión y edad con la fecha UTC de `generatedAt` (REQ-SUM-002; SC-005-044; PN-10, EDGE-005-29): una vacuna aplicada
 * el `2026-11-03` sale `2026-11-03` con el reloj en cualquier zona horaria; solo `generatedAt` y `createdAt` de archivos llevan sufijo `Z`; con `generatedAt`
 * `2026-11-04T04:30:00Z` (23:30 del día 3 en Bogotá) la edad se calcula al `2026-11-04` y la vista muestra esa fecha de cálculo.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { buildClinicalSummary, type SummaryPetInput } from '../../../src/domain/summary/clinical-summary.ts';
import { SharedSummaryDocument } from '../../../src/presentation/web/components/SharedSummary.tsx';
import type { SharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ARGOS, canonicalState } from '../../fixtures/application-harness.ts';
import { upgradePet, upgradeRecords } from '../../fixtures/storage-upgrade.ts';

const OFF = { includeMicrochip: false, includeClinicalFiles: true } as const;
const FILE = { id: '99999999-9999-4999-8999-999999999901', mime: 'application/pdf' as const, sizeBytes: 2048, createdAt: '2026-11-10T10:00:00.000Z' };
const records = upgradeRecords(canonicalState().records);
const vaccination = { ...records.vaccinations.find((v) => v.petId === ARGOS.id)!, appliedAt: '2026-11-03', nextBoosterAt: '2027-11-03' };
const input = (birthDate: string): SummaryPetInput => ({
  pet: { ...upgradePet(ARGOS), birthDate },
  records: { weights: [], bodyMeasurements: [], vaccinations: [vaccination], dewormings: [], medicalVisits: [], customParameters: [] },
  files: [FILE],
});

const ORIGINAL_TZ = process.env['TZ'];
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

/** Todas las cadenas del resumen con sufijo `Z`, con su ruta. */
function zStrings(node: unknown, path: string, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (node.endsWith('Z')) out.push(`${path}=${node}`);
  } else if (Array.isArray(node)) node.forEach((child, i) => zStrings(child, `${path}[${i}]`, out));
  else if (node !== null && typeof node === 'object') for (const [key, child] of Object.entries(node)) zStrings(child, `${path}.${key}`, out);
  return out;
}

describe('T773 SC-005-044 fechas sin conversión UTC y edad en la fecha de la instancia (REQ-SUM-002, PN-10, EDGE-005-29)', () => {
  it('[SC-005-044][REQ-SUM-002] la vacuna del 2026-11-03 sale 2026-11-03 con el reloj del proceso en cualquier zona horaria y el JSON es idéntico byte a byte', () => {
    const outputs = ['America/Bogota', 'UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map((tz) => {
      process.env['TZ'] = tz;
      const summary = buildClinicalSummary('PET', [input('2024-11-04')], '2026-11-04T04:30:00.000Z', OFF);
      expect(summary.pets[0]!.vaccinations[0]).toMatchObject({ appliedAt: '2026-11-03', nextBoosterAt: '2027-11-03' });
      return JSON.stringify(summary);
    });
    expect(new Set(outputs).size).toBe(1);
  });

  it('[SC-005-044][REQ-SUM-002] solo generatedAt y el createdAt de cada archivo llevan sufijo Z; las fechas de calendario no', () => {
    const summary = buildClinicalSummary('PET', [input('2024-11-04')], '2026-11-04T04:30:00.000Z', OFF);
    expect(zStrings(summary, '$')).toEqual(['$.generatedAt=2026-11-04T04:30:00.000Z', '$.pets[0].clinicalFiles[0].createdAt=2026-11-10T10:00:00.000Z']);
  });

  it('[SC-005-044][PN-10][EDGE-005-29] con generatedAt 2026-11-04T04:30:00Z (23:30 del día 3 en Bogotá) la edad se calcula al 2026-11-04 y la vista muestra esa fecha de cálculo', () => {
    process.env['TZ'] = 'America/Bogota';
    const birthday = buildClinicalSummary('PET', [input('2024-11-04')], '2026-11-04T04:30:00.000Z', OFF);
    expect(birthday.pets[0]!.profile.age).toMatchObject({ years: 2, months: 0 });
    const eve = buildClinicalSummary('PET', [input('2024-11-04')], '2026-11-03T04:30:00.000Z', OFF);
    expect(eve.pets[0]!.profile.age).toMatchObject({ years: 1, months: 11 });
    const view = { summary: birthday, fileLabels: [{ fileId: FILE.id, displayName: 'Análisis.pdf' }], validUntil: null } as unknown as SharedSummaryView;
    const markup = renderToStaticMarkup(h(SharedSummaryDocument, { view, mode: 'PREVIEW', downloadHref: null, onPrint: () => undefined } as never));
    expect(markup).toContain('2 años y 0 meses al 4 nov 2026');
  });
});
