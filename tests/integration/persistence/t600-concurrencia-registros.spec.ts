/**
 * T600 [P] [US2] concurrencia de registros con DOS conexiones intercaladas, en SQLite (archivo, dos conexiones) y PostgreSQL 17 real
 * (se OMITE sin TEST_DATABASE_URL) (SC-CAT-028; REQ-BOR-005, INV-REG-003, REQ-BOR-002; EDGE-017, EDGE-018):
 *  - dos DELETE simultáneos del mismo registro: uno responde OK, el otro ERR-PET-NOT-FOUND y queda UNA sola fila DELETE;
 *  - una edición simultánea con la creación de una vacuna POSTERIOR (la misma clave) no muta un registro que quede SUPERSEDED:
 *    si la edición llega primero se aplica (una fila UPDATE) y la vacuna nueva se crea; si llega después de la creación, 409 sin cambios ni fila.
 * La conexión A queda retenida con su candado a mitad de transacción (`holdBeforeCommit`) y B llega mientras tanto: B NO termina antes de
 * que A confirme, y solo entonces lee el estado ya confirmado.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AddVaccinationUseCase, DeleteRecordUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { ANDRES, ARGOS, envelope } from '../../fixtures/application-harness.ts';
import {
  createPostgresConcurrentEngine,
  createSqliteConcurrentEngine,
  gate,
  holdBeforeCommit,
  TEST_DATABASE_URL,
  type ConcurrentEngine,
} from '../../fixtures/concurrent-engines.ts';

const LAST_WEIGHT = envelope.records.weights.filter((w) => w.petId === ARGOS.id).at(-1)!;
const VACCINE_ID = envelope.records.vaccinations.find((v) => v.petId === ARGOS.id)!.id;
const NEWER_VACCINE = { vaccineName: 'Séxtuple Canina', appliedAt: '2026-03-01' };

const open: ConcurrentEngine[] = [];
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Arranca A retenida a mitad de transacción y devuelve la promesa de A y la llave que la libera. */
async function startHeldA<T>(engine: ConcurrentEngine, run: (deps: ReturnType<ConcurrentEngine['depsA']>) => Promise<T>) {
  const entered = gate();
  const hold = gate();
  const a = run(engine.depsA(holdBeforeCommit(engine.uowA, entered.open, hold.promise)));
  const outcome = codeOf(a);
  await Promise.race([entered.promise, a.then(() => undefined, () => undefined)]); // A llegó a su candado y no confirma
  return { a, outcome, release: hold.open };
}

function suite(name: 'SQLite' | 'PostgreSQL', create: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T600 concurrencia con dos conexiones intercaladas (${name})`, { timeout: 60_000 }, () => {
    const engineOf = async () => {
      const engine = await create();
      open.push(engine);
      return engine;
    };

    it('[SC-CAT-028][REQ-BOR-001][EDGE-018] dos DELETE simultáneos del mismo registro: uno OK, el otro ERR-PET-NOT-FOUND y una sola fila DELETE', async () => {
      const engine = await engineOf();
      const held = await startHeldA(engine, (deps) => new DeleteRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id));
      let bDone = false;
      const b = engine.asClientB((deps) => new DeleteRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', LAST_WEIGHT.id));
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect(bDone, 'B no puede terminar mientras A retiene su candado sin confirmar').toBe(false);
      expect(b.workStarts(), 'B no llega a leer nada mientras A retiene su candado').toBe(0);
      held.release();
      expect(await held.outcome).toBe('OK');
      expect(await bOutcome).toBe('ERR-PET-NOT-FOUND');
      expect(await engine.audit(LAST_WEIGHT.id)).toEqual([['DELETE', 'WEIGHT_RECORD']]);
    });

    it('[SC-CAT-028][INV-REG-003][REQ-BOR-005] la edición llega ANTES de la creación de la vacuna posterior: la edición se aplica (una fila UPDATE) y la vacuna nueva se crea', async () => {
      const engine = await engineOf();
      const held = await startHeldA(engine, (deps) =>
        new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', notes: 'editada antes' }),
      );
      let bDone = false;
      const b = engine.asClientB((deps) => new AddVaccinationUseCase(deps).execute(ANDRES, ARGOS.id, NEWER_VACCINE));
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect(bDone, 'la creación no termina mientras la edición retiene el candado').toBe(false);
      expect(b.workStarts(), 'la creación no llega a leer nada mientras la edición retiene el candado').toBe(0);
      held.release();
      expect(await held.outcome).toBe('OK');
      expect(await bOutcome).toBe('OK');
      expect(await engine.audit(VACCINE_ID)).toEqual([['UPDATE', 'VACCINATION_RECORD']]);
      const stored = await engine.uowA.runInTransaction((r) => r.records.listForPet(ARGOS.id));
      expect(stored.vaccinations.find((v) => v.id === VACCINE_ID)!.notes).toBe('editada antes');
    });

    it('[SC-CAT-028][INV-REG-003][INV-REG-002] la creación de la vacuna posterior llega ANTES: la edición recibe 409 ERR-REC-SUPERSEDED-IMMUTABLE, sin cambios ni fila de auditoría', async () => {
      const engine = await engineOf();
      const before = (await engine.uowA.runInTransaction((r) => r.records.listForPet(ARGOS.id))).vaccinations.find((v) => v.id === VACCINE_ID)!;
      const held = await startHeldA(engine, (deps) => new AddVaccinationUseCase(deps).execute(ANDRES, ARGOS.id, NEWER_VACCINE));
      let bDone = false;
      const b = engine.asClientB((deps) =>
        new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'vaccinations', VACCINE_ID, { collection: 'vaccinations', notes: 'editada despues' }),
      );
      const bOutcome = codeOf(b.result).then((code) => ((bDone = true), code));
      await pause(150);
      expect(bDone, 'la edición no termina mientras la creación retiene el candado').toBe(false);
      expect(b.workStarts(), 'la edición no llega a leer nada mientras la creación retiene el candado').toBe(0);
      held.release();
      expect(await held.outcome).toBe('OK');
      expect(await bOutcome).toBe('ERR-REC-SUPERSEDED-IMMUTABLE');
      expect(await engine.audit(VACCINE_ID)).toEqual([]);
      const after = (await engine.uowA.runInTransaction((r) => r.records.listForPet(ARGOS.id))).vaccinations.find((v) => v.id === VACCINE_ID)!;
      expect(after).toEqual(before);
    });
  });
}

suite('SQLite', createSqliteConcurrentEngine, false);
suite('PostgreSQL', createPostgresConcurrentEngine, !TEST_DATABASE_URL);
