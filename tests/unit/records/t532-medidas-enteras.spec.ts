/**
 * T532 [US2] medidas en centímetros enteros (SC-CAT-007, SC-CAT-008; REQ-MDC-001): contrato 3.1.0, invariante de dominio,
 * formulario con `step=1` y conservación de los registros ya guardados con decimales.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { validateCreateBodyMeasurementInput, validateUpdateBodyMeasurementInput } from '../../../src/generated/v31/schemas/validators.mjs';
import { AddBodyMeasurementUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { GetPetDashboardUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { ExportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { applyRecordUpdate, validateRecord, validateRecordInput } from '../../../src/domain/records/record-invariants.ts';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { RECORD_MODULES } from '../../../src/presentation/web/records.ts';
import { validateInput } from '../../../src/presentation/web/validation.ts';
import { ANDRES, ARGOS, createHarness } from '../../fixtures/application-harness.ts';
import { validBackupState } from '../../fixtures/backup-harness.ts';

const TODAY = '2026-11-05';
const BIRTH = '2020-01-01';
const FIELDS = ['neckCm', 'chestCm', 'backLengthCm', 'waistCm'] as const;
const INPUT = { recordedAt: '2026-11-05', neckCm: 32, chestCm: 40, backLengthCm: 65, waistCm: 58 };
const OLD = { id: 'a1000000-0000-4000-8000-0000000000aa', petId: ARGOS.id, recordedAt: '2026-10-01', neckCm: 32.25, chestCm: 40.25, backLengthCm: 65.5, waistCm: 58.75, notes: null, createdAt: '2026-10-01T10:00:00.000Z' };

function outcome(fn: () => unknown): string {
  try {
    fn();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}

describe('T532 contrato 3.1.0 (SC-CAT-007)', () => {
  it('las 4 medidas aceptan enteros de 1 a 250 y rechazan decimales en la entrada de alta y en la de edición', () => {
    for (const f of FIELDS) {
      expect(validateCreateBodyMeasurementInput({ ...INPUT, [f]: 32 })).toBe(true);
      expect(validateCreateBodyMeasurementInput({ ...INPUT, [f]: 32.5 })).toBe(false);
      expect(validateUpdateBodyMeasurementInput({ collection: 'measurements', [f]: 32.5 })).toBe(false);
      expect(validateUpdateBodyMeasurementInput({ collection: 'measurements', [f]: 33 })).toBe(true);
    }
  });
});

describe('T532 invariante de dominio (SC-CAT-007)', () => {
  it('32.5 de cuello se rechaza con ERR-REC-MEASUREMENT-OUT-OF-RANGE y 32 se acepta, en cada una de las 4 medidas', () => {
    for (const f of FIELDS) {
      expect(outcome(() => validateRecordInput('bodyMeasurements', { ...INPUT, [f]: 32.5 }, BIRTH, TODAY))).toBe(`ERR-REC-MEASUREMENT-OUT-OF-RANGE@${f}`);
      expect(outcome(() => validateRecordInput('bodyMeasurements', { ...INPUT, [f]: 32 }, BIRTH, TODAY))).toBe('OK');
    }
  });

  it('un valor que solo es entero por redondeo de flotantes (46.0000000000001) también se rechaza', () => {
    expect(outcome(() => validateRecordInput('bodyMeasurements', { ...INPUT, neckCm: 46.0000000000001 }, BIRTH, TODAY))).toBe('ERR-REC-MEASUREMENT-OUT-OF-RANGE@neckCm');
  });
});

describe('T532 conservación de registros con decimales (SC-CAT-008)', () => {
  it('un registro guardado con decimales sigue siendo válido al leerlo o importarlo', () => {
    expect(outcome(() => validateRecord('bodyMeasurements', OLD, BIRTH, TODAY))).toBe('OK');
  });

  it('editar solo notes conserva 40.25 y editar chestCm a 40.5 se rechaza; a 41 se acepta', () => {
    const edited = applyRecordUpdate('bodyMeasurements', OLD, { collection: 'measurements', notes: 'Control' }, BIRTH, TODAY);
    expect([edited.chestCm, edited.neckCm, edited.notes]).toEqual([40.25, 32.25, 'Control']);
    expect(outcome(() => applyRecordUpdate('bodyMeasurements', OLD, { collection: 'measurements', chestCm: 40.5 }, BIRTH, TODAY))).toBe('ERR-REC-MEASUREMENT-OUT-OF-RANGE@chestCm');
    expect(applyRecordUpdate('bodyMeasurements', OLD, { collection: 'measurements', chestCm: 41 }, BIRTH, TODAY).chestCm).toBe(41);
  });

  it('con casos de uso: el registro con 40.25 se lista, se exporta y se edita en notes sin cambio; chestCm 40.5 no pasa', async () => {
    const state = validBackupState();
    state.records.bodyMeasurements.push(OLD as never);
    const { deps } = createHarness(state);
    const dash = await new GetPetDashboardUseCase(deps).execute(ANDRES, ARGOS.id);
    expect(dash.bodyMeasurements.find((m) => m.id === OLD.id)?.chestCm).toBe(40.25);
    const exported = await new ExportBackupUseCase(deps).execute(ANDRES);
    expect(exported.envelope.records.bodyMeasurements.find((m) => m.id === OLD.id)?.chestCm).toBe(40.25);
    const update = new UpdateRecordUseCase(deps);
    const updated = (await update.execute(ANDRES, ARGOS.id, 'measurements', OLD.id, { collection: 'measurements', notes: 'ok' }, 0)) as { chestCm: number };
    expect(updated.chestCm).toBe(40.25);
    await expect(update.execute(ANDRES, ARGOS.id, 'measurements', OLD.id, { collection: 'measurements', chestCm: 40.5 }, 1)).rejects.toMatchObject({ code: 'ERR-REC-MEASUREMENT-OUT-OF-RANGE', field: 'chestCm' });
    await expect(new AddBodyMeasurementUseCase(deps).execute(ANDRES, ARGOS.id, { ...INPUT, neckCm: 32.5 })).rejects.toMatchObject({ code: 'ERR-REC-MEASUREMENT-OUT-OF-RANGE', field: 'neckCm' });
  });
});

describe('T532 formulario (SC-CAT-007)', () => {
  const spec = RECORD_MODULES.find((m) => m.id === 'measurements')!;
  const markup = renderToStaticMarkup(h(RecordForm, { spec, onSubmit: async () => undefined }));

  it('los 4 campos de medida usan step="1" e inputmode="numeric"; el peso conserva su paso decimal', () => {
    for (const f of FIELDS) {
      const input = new RegExp(`<input[^>]*name="${f}"[^>]*>`).exec(markup)![0];
      expect(input).toContain('step="1"');
      expect(input).toContain('inputMode="numeric"');
    }
    expect(RECORD_MODULES.find((m) => m.id === 'weights')!.fields.find((f) => f.name === 'weightKg')!.step).toBe('0.01');
  });

  it('la validación del cliente rechaza 32.5 con el mensaje del catálogo y acepta 32', () => {
    expect(Object.keys(validateInput('CreateBodyMeasurementInput', { ...INPUT, neckCm: 32.5 }))).toEqual(['neckCm']);
    expect(validateInput('CreateBodyMeasurementInput', { ...INPUT, neckCm: 32 })).toEqual({});
  });
});
