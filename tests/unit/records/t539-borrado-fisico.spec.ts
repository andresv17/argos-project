/**
 * T539 [US2] borrado físico (SC-CAT-013, SC-CAT-014; REQ-BOR-001, REQ-BOR-002, INV-REG-001, INV-REG-002), en memoria y en SQLite:
 * el registro desaparece de la base (sin borrado lógico), con una fila DELETE de auditoría en la misma transacción (si la auditoría
 * falla, el registro sigue); el segundo borrado da ERR-PET-NOT-FOUND; un registro SUPERSEDED no se borra ni se edita (409);
 * el registro borrado no aparece en el listado, el tablero, la exportación ni el cálculo (serie de peso, resumen de alertas).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ExportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { GetPetDashboardUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { AddVaccinationUseCase, DeleteRecordUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { ANDRES, ARGOS, envelope } from '../../fixtures/application-harness.ts';
import { codeOf, createEngines, type Engine } from '../../fixtures/record-engines.ts';

const WEIGHTS = envelope.records.weights.filter((w) => w.petId === ARGOS.id);
const LAST_WEIGHT = WEIGHTS.at(-1)!;
const VACCINE_ID = envelope.records.vaccinations.find((v) => v.petId === ARGOS.id)!.id;
const open: Engine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));

describe.each(['memoria', 'SQLite'] as const)('T539 borrado físico (%s)', (name) => {
  const engineOf = async () => {
    const list = await createEngines();
    open.push(...list);
    return list.find((e) => e.name === name)!;
  };

  it('[SC-CAT-013][REQ-BOR-001] borrar un peso lo elimina de la base y escribe 1 fila DELETE (hash anterior, sin hash nuevo); no hay ninguna columna de borrado lógico', async () => {
    const engine = await engineOf();
    expect(engine.recordIds('weights')).toContain(LAST_WEIGHT.id);
    await new DeleteRecordUseCase(engine.deps).execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id);
    expect(engine.recordIds('weights')).not.toContain(LAST_WEIGHT.id);
    const rows = await engine.audit(LAST_WEIGHT.id);
    expect(rows.map((r) => [r.mutationType, r.entityType])).toEqual([['DELETE', 'WEIGHT_RECORD']]);
    expect(rows[0]!.previousStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.newStateHash).toBeNull();
  });

  it('[SC-CAT-013][INV-REG-001] si la fila de auditoría falla, el borrado se revierte: el registro sigue y el estado es idéntico', async () => {
    const engine = await engineOf();
    const before = engine.snapshot();
    const failing = { ...engine.deps, auditLog: { ...engine.deps.auditLog, append: () => Promise.reject(new Error('auditoria inyectada')) } };
    await expect(new DeleteRecordUseCase(failing).execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id)).rejects.toThrow('auditoria inyectada');
    expect(engine.snapshot()).toBe(before);
    expect(engine.recordIds('weights')).toContain(LAST_WEIGHT.id);
  });

  it('[SC-CAT-013][REQ-BOR-001] el segundo borrado del mismo registro da ERR-PET-NOT-FOUND y no escribe otra fila', async () => {
    const engine = await engineOf();
    const del = new DeleteRecordUseCase(engine.deps);
    await del.execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id);
    const after = engine.snapshot();
    expect(await codeOf(del.execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id))).toBe('ERR-PET-NOT-FOUND');
    expect(engine.snapshot()).toBe(after);
    expect((await engine.audit(LAST_WEIGHT.id)).length).toBe(1);
  });

  it('[SC-CAT-014][REQ-BOR-002][INV-REG-002] un registro SUPERSEDED no se borra ni se edita (409); borrar el posterior devuelve el anterior a vigente y entonces sí se borra', async () => {
    const engine = await engineOf();
    const newer = await new AddVaccinationUseCase(engine.deps).execute(ANDRES, ARGOS.id, { vaccineName: 'Séxtuple Canina', appliedAt: '2026-03-01' });
    const before = engine.snapshot();
    const del = new DeleteRecordUseCase(engine.deps);
    expect(await codeOf(del.execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID))).toBe('ERR-REC-SUPERSEDED-IMMUTABLE');
    expect(await codeOf(new UpdateRecordUseCase(engine.deps).execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', notes: 'x' }))).toBe('ERR-REC-SUPERSEDED-IMMUTABLE');
    expect(engine.snapshot()).toBe(before);
    expect(engine.recordIds('vaccinations')).toContain(VACCINE_ID);
    await del.execute(ANDRES, ARGOS.id, 'vaccinations', newer.record.id);
    expect(await codeOf(del.execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID))).toBe('OK');
    expect(engine.recordIds('vaccinations')).not.toContain(VACCINE_ID);
  });

  it('[SC-CAT-013][REQ-BOR-001] el peso borrado sale del tablero, de la serie de evolución y de la exportación; la vacuna borrada sale del resumen de alertas', async () => {
    const engine = await engineOf();
    const dashboard = () => new GetPetDashboardUseCase(engine.deps).execute(ANDRES, ARGOS.id);
    const exported = async () => (await new ExportBackupUseCase(engine.deps).execute(ANDRES)).envelope as unknown as { records: { weights: Array<{ id: string }>; vaccinations: Array<{ id: string }> } };
    expect((await dashboard()).weights.map((w) => w.record.id)).toContain(LAST_WEIGHT.id);
    expect((await dashboard()).alertsSummary.totalActiveAlerts).toBe(1);
    const del = new DeleteRecordUseCase(engine.deps);
    await del.execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id);
    await del.execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID);
    const view = await dashboard();
    expect(view.weights.map((w) => w.record.id)).toEqual(WEIGHTS.slice(0, -1).map((w) => w.id));
    expect([view.vaccinations.length, view.alertsSummary.totalActiveAlerts]).toEqual([0, 0]);
    const file = await exported();
    expect(file.records.weights.map((w) => w.id)).not.toContain(LAST_WEIGHT.id);
    expect(file.records.vaccinations.map((v) => v.id)).not.toContain(VACCINE_ID);
  });
});
