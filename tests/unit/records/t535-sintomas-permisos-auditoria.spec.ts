/**
 * T535 [US2] síntomas: permisos y auditoría (SC-CAT-026; REQ-SIN-002, REQ-SIN-001, INV-SIN-001): un síntoma VOMIT lo registra un Administrador,
 * lo edita el Propietario y lo borra el Administrador, con filas CREATE, UPDATE y DELETE de entityType CUSTOM_PARAMETER; el Cuidador y el
 * Lector reciben 403. El caso de uso no interpreta `title` ni `description`.
 */
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { AddCustomParameterUseCase, DeleteRecordUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { ANDRES, ARGOS, MARIA, canonicalState, createHarness } from '../../fixtures/application-harness.ts';

const SYMPTOM = { recordedAt: '2026-11-05', category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MODERATE', title: 'Vómito', description: 'Dos veces tras la comida.' };

function harnessWithRole(role: 'ADMIN' | 'CAREGIVER' | 'READER') {
  const state = canonicalState();
  const membership = state.memberships.find((m) => m.userId === MARIA)!;
  membership.role = role;
  return createHarness(state);
}
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('T535 permisos y auditoría de síntomas (SC-CAT-026, REQ-SIN-002)', () => {
  it('un Administrador registra, el Propietario edita y el Administrador borra: 3 operaciones aceptadas con filas CREATE, UPDATE y DELETE de CUSTOM_PARAMETER', async () => {
    const { deps, uow } = harnessWithRole('ADMIN');
    const created = await new AddCustomParameterUseCase(deps).execute(MARIA, ARGOS.id, SYMPTOM);
    expect([created.category, created.symptomType, created.severity]).toEqual(['SYMPTOM', 'VOMIT', 'MODERATE']);
    const updated = (await new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'custom-parameters', created.id, { collection: 'custom-parameters', severity: 'SEVERE' })) as typeof created;
    expect([updated.symptomType, updated.severity]).toEqual(['VOMIT', 'SEVERE']);
    await new DeleteRecordUseCase(deps).execute(MARIA, ARGOS.id, 'custom-parameters', created.id);
    const rows = uow.snapshot().auditLog.filter((r) => r.entityId === created.id);
    expect(rows.map((r) => [r.mutationType, r.entityType])).toEqual([['CREATE', 'CUSTOM_PARAMETER'], ['UPDATE', 'CUSTOM_PARAMETER'], ['DELETE', 'CUSTOM_PARAMETER']]);
    expect(uow.snapshot().records.customParameters.some((r) => r.id === created.id)).toBe(false);
  });

  it('un Cuidador y un Lector que intentan registrar un síntoma reciben ERR-ACC-FORBIDDEN y no se guarda nada', async () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      const { deps, uow } = harnessWithRole(role);
      const before = uow.snapshot().records.customParameters.length;
      expect(await codeOf(new AddCustomParameterUseCase(deps).execute(MARIA, ARGOS.id, SYMPTOM))).toBe('ERR-ACC-FORBIDDEN');
      expect(uow.snapshot().records.customParameters.length).toBe(before);
    }
  });

  it('un Cuidador y un Lector que intentan borrar un síntoma reciben ERR-ACC-FORBIDDEN y el síntoma sigue', async () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      const { deps, uow } = harnessWithRole(role);
      const created = await new AddCustomParameterUseCase(deps).execute(ANDRES, ARGOS.id, SYMPTOM);
      expect(await codeOf(new DeleteRecordUseCase(deps).execute(MARIA, ARGOS.id, 'custom-parameters', created.id))).toBe('ERR-ACC-FORBIDDEN');
      expect(uow.snapshot().records.customParameters.some((r) => r.id === created.id)).toBe(true);
    }
  });

  it('el caso de uso no interpreta title ni description: se guardan tal cual y la fila de auditoría no los lleva', async () => {
    const { deps, uow } = createHarness();
    const created = await new AddCustomParameterUseCase(deps).execute(ANDRES, ARGOS.id, { ...SYMPTOM, title: 'URGENTE: grave', description: 'dar 5 mg, administrar dosis' });
    expect([created.title, created.description]).toEqual(['URGENTE: grave', 'dar 5 mg, administrar dosis']);
    expect(JSON.stringify(uow.snapshot().auditLog)).not.toContain('administrar');
  });

  it('cambiar la categoría de un síntoma a otra sin anular tipo e intensidad se rechaza, y a la inversa', async () => {
    const { deps } = createHarness();
    const created = await new AddCustomParameterUseCase(deps).execute(ANDRES, ARGOS.id, SYMPTOM);
    const update = new UpdateRecordUseCase(deps);
    expect(await codeOf(update.execute(ANDRES, ARGOS.id, 'custom-parameters', created.id, { collection: 'custom-parameters', category: 'ALLERGY' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await codeOf(update.execute(ANDRES, ARGOS.id, 'custom-parameters', created.id, { collection: 'custom-parameters', category: 'ALLERGY', symptomType: null, severity: null }))).toBe('OK');
    expect(await codeOf(update.execute(ANDRES, ARGOS.id, 'custom-parameters', created.id, { collection: 'custom-parameters', symptomType: 'STOOL' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });
});
