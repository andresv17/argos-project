/**
 * T537 [US2] edición auditada de peso, cita médica y vacuna vigente (SC-CAT-012, SC-CAT-028; REQ-BOR-003, INV-REG-002), en memoria y en SQLite:
 * cada edición efectiva escribe 1 fila UPDATE con hashes distintos; sin cambios efectivos no hay fila; el Lector recibe 403; la edición que
 * dejaría al propio registro SUPERSEDED se rechaza con 409 y sin ningún cambio. El control de `If-Match` es de T613/T614.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AddMedicalVisitUseCase, AddVaccinationUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { ANDRES, ARGOS, MARIA, envelope } from '../../fixtures/application-harness.ts';
import { codeOf, createEngines, type Engine } from '../../fixtures/record-engines.ts';

const WEIGHT_ID = envelope.records.weights.find((w) => w.petId === ARGOS.id)!.id;
const VACCINE_ID = envelope.records.vaccinations.find((v) => v.petId === ARGOS.id)!.id;
const VISIT = { visitDate: '2026-10-20', reason: 'Control anual', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral', observations: 'Todo en orden.' };
const open: Engine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
const engines = async (role: 'ADMIN' | 'CAREGIVER' | 'READER' | null = null) => {
  const list = await createEngines(role);
  open.push(...list);
  return list;
};

describe.each(['memoria', 'SQLite'] as const)('T537 edición auditada (%s)', (name) => {
  const engineOf = async (role: 'ADMIN' | 'CAREGIVER' | 'READER' | null = null) => (await engines(role)).find((e) => e.name === name)!;

  it('[SC-CAT-012][REQ-BOR-003] editar un peso, una cita médica y la vacuna vigente deja una fila UPDATE por cada una, con hashes distintos y del tipo de entidad del módulo', async () => {
    const { deps, audit } = await engineOf();
    const update = new UpdateRecordUseCase(deps);
    const visit = await new AddMedicalVisitUseCase(deps).execute(ANDRES, ARGOS.id, VISIT);
    const weight = (await update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT_ID, { collection: 'weights', weightKg: 33 }, 0)) as { weightKg: number };
    const edited = (await update.execute(ANDRES, ARGOS.id, 'visits', visit.id, { collection: 'visits', observations: 'Control repetido.' }, 0)) as { observations: string };
    const vaccine = (await update.execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', batchOrClinic: 'Lote B-100' }, 0)) as { batchOrClinic: string };
    expect([weight.weightKg, edited.observations, vaccine.batchOrClinic]).toEqual([33, 'Control repetido.', 'Lote B-100']);
    for (const [id, type] of [[WEIGHT_ID, 'WEIGHT_RECORD'], [visit.id, 'APPOINTMENT_RECORD'], [VACCINE_ID, 'VACCINATION_RECORD']] as const) {
      const rows = (await audit(id)).filter((r) => r.mutationType === 'UPDATE');
      expect(rows.map((r) => r.entityType), id).toEqual([type]);
      expect(rows[0]!.previousStateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!.newStateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!.newStateHash).not.toBe(rows[0]!.previousStateHash);
    }
  });

  it('[SC-CAT-012] una edición sin cambios efectivos (mismos valores) responde con el registro, no escribe fila de auditoría y no cambia el estado', async () => {
    const { deps, audit, snapshot } = await engineOf();
    const before = snapshot();
    const same = (await new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT_ID, { collection: 'weights', weightKg: 32.4, notes: 'Peso estable de primavera' }, 0)) as { id: string; weightKg: number };
    expect([same.id, same.weightKg]).toEqual([WEIGHT_ID, 32.4]);
    expect(await audit(WEIGHT_ID)).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('[SC-CAT-012][ERR-ACC-FORBIDDEN] un Lector que edita un peso, una cita o una vacuna recibe 403 y no cambia nada', async () => {
    const { deps, snapshot } = await engineOf('READER');
    const visit = await new AddMedicalVisitUseCase(deps).execute(ANDRES, ARGOS.id, VISIT);
    const before = snapshot();
    const update = new UpdateRecordUseCase(deps);
    const codes = [
      await codeOf(update.execute(MARIA, ARGOS.id, 'weights', WEIGHT_ID, { collection: 'weights', weightKg: 33 }, 0)),
      await codeOf(update.execute(MARIA, ARGOS.id, 'visits', visit.id, { collection: 'visits', observations: 'x' }, 0)),
      await codeOf(update.execute(MARIA, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', notes: 'x' }, 0)),
    ];
    expect(codes).toEqual(Array(3).fill('ERR-ACC-FORBIDDEN'));
    expect(snapshot()).toBe(before);
  });

  it('[SC-CAT-028][INV-REG-002] la edición de fecha que dejaría a la vacuna vigente como SUPERSEDED se rechaza con ERR-REC-SUPERSEDED-IMMUTABLE, sin cambios ni fila', async () => {
    const { deps, audit, snapshot } = await engineOf();
    // La canónica «Séxtuple Canina» (2025-11-12) y una posterior (2026-03-01) de la misma clave: la posterior es la vigente.
    const newer = await new AddVaccinationUseCase(deps).execute(ANDRES, ARGOS.id, { vaccineName: 'Séxtuple Canina', appliedAt: '2026-03-01' });
    const before = snapshot();
    const update = new UpdateRecordUseCase(deps);
    expect(await codeOf(update.execute(ANDRES, ARGOS.id, 'vaccinations', newer.record.id, { collection: 'vaccinations', appliedAt: '2025-01-01' }, 0))).toBe('ERR-REC-SUPERSEDED-IMMUTABLE');
    expect(snapshot()).toBe(before);
    expect((await audit(newer.record.id)).map((r) => r.mutationType)).toEqual(['CREATE']);
    // Una edición que la deja vigente sí se acepta.
    expect(await codeOf(update.execute(ANDRES, ARGOS.id, 'vaccinations', newer.record.id, { collection: 'vaccinations', appliedAt: '2026-04-01' }, 0))).toBe('OK');
  });

  it('[REQ-REC2-003][SC-015] un registro que ya es SUPERSEDED sigue siendo inmutable (409) aunque la edición no cambie su fecha', async () => {
    const { deps, snapshot } = await engineOf();
    await new AddVaccinationUseCase(deps).execute(ANDRES, ARGOS.id, { vaccineName: 'Séxtuple Canina', appliedAt: '2026-03-01' });
    const before = snapshot();
    expect(await codeOf(new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', notes: 'tarde' }, 0))).toBe('ERR-REC-SUPERSEDED-IMMUTABLE');
    expect(snapshot()).toBe(before);
  });
});
