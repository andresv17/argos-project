import { afterEach, describe, expect, it } from 'vitest';
import { purgeCareData, runMaintenance } from '../../src/application/use-cases/maintenance-use-cases.ts';
import type { CareLogRecord, CareRoutineRecord } from '../../src/application/ports/care.port.ts';
import { CARE_ENGINE_FACTORIES, PET, type CareEngine } from '../fixtures/care-012.ts';

/**
 * T1661 (Feature 012, Bloque C, #26; `/keymaker`): purga por retención del Modo Cuidador en el mantenimiento existente, sobre memoria, SQLite y PostgreSQL (se OMITE sin `TEST_DATABASE_URL`).
 * Techo máximo (no piso): `MEDICATION` 1095 días y `MEAL`/`WALK`/`OTHER` 365 desde `occurrence_date`; revertidos 30 días desde `reverted_at`; rutinas inactivas 365 días desde su desactivación (`updated_at`).
 * Frontera: un dato con exactamente N días se conserva; con N + 1 se purga. Sin columna de retención: el corte sale de `kind`, `status`, `occurrence_date` y `reverted_at`.
 *
 * @implements REQ-CAR12-007
 * Cubre SC-012-089.
 */
let engine: CareEngine | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const DAY = 86_400_000;
const NOW = '2028-06-15T12:00:00.000Z';
const TODAY = '2028-06-15';
const dateAgo = (days: number): string => new Date(Date.parse(`${TODAY}T00:00:00.000Z`) - days * DAY).toISOString().slice(0, 10);
const instantAgo = (days: number, extraMs = 0): string => new Date(Date.parse(NOW) - days * DAY - extraMs).toISOString();
const ID = (n: number): string => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const routine = (n: number, over: Partial<CareRoutineRecord> = {}): CareRoutineRecord => ({
  id: ID(n), seriesId: ID(n), petId: PET, kind: 'MEAL', title: `R${n}`, instructions: null, doseAmount: null, doseUnit: null, timesOfDay: ['09:00'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2024-01-01', endDate: null, ongoing: true, active: true, effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: null, supersedesRoutineId: null, version: 1, createdByUserId: null,
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', ...over,
});
const medication = (n: number, over: Partial<CareRoutineRecord> = {}): CareRoutineRecord =>
  routine(n, { kind: 'MEDICATION', doseAmount: 5, doseUnit: 'MG', ongoing: false, endDate: '2030-01-01', ...over });
const entry = (n: number, routineId: string, occurrenceDate: string, over: Partial<CareLogRecord> = {}): CareLogRecord => ({
  id: ID(n), petId: PET, routineId, seriesId: routineId, occurrenceDate, occurrenceTime: '09:00', status: 'DONE', note: null, late: false, performedByUserId: null, performedAt: `${occurrenceDate}T14:00:00.000Z`,
  doseAmountAtTime: null, doseUnitAtTime: null, revertedAt: null, revertedByUserId: null, revertReason: null, ...over,
});
const logIds = async (e: CareEngine): Promise<string[]> => (await e.run((r) => r.careLog.listByPet(PET))).map((x) => x.id).sort();
const routineIds = async (e: CareEngine): Promise<string[]> => (await e.run((r) => r.careRoutines.listByPet(PET))).map((x) => x.id).sort();

for (const factory of CARE_ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1661 retención del Modo Cuidador (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-089] MEDICATION 1095 días y MEAL/WALK/OTHER 365 desde occurrence_date: N se conserva, N + 1 se purga', async () => {
      engine = await factory.make();
      await engine.run(async (r) => {
        await r.careRoutines.insert(medication(1));
        await r.careRoutines.insert(routine(2, { kind: 'MEAL' }));
        await r.careRoutines.insert(routine(3, { kind: 'WALK' }));
        await r.careRoutines.insert(routine(4, { kind: 'OTHER' }));
        await r.careLog.insert(entry(11, ID(1), dateAgo(1095)));
        await r.careLog.insert(entry(12, ID(1), dateAgo(1096)));
        await r.careLog.insert(entry(13, ID(1), dateAgo(366))); // MEDICATION con 366 días: sigue (techo de 1095)
        await r.careLog.insert(entry(21, ID(2), dateAgo(365)));
        await r.careLog.insert(entry(22, ID(2), dateAgo(366)));
        await r.careLog.insert(entry(31, ID(3), dateAgo(365)));
        await r.careLog.insert(entry(32, ID(3), dateAgo(366), { status: 'SKIPPED' }));
        await r.careLog.insert(entry(41, ID(4), dateAgo(365)));
        await r.careLog.insert(entry(42, ID(4), dateAgo(1000)));
      });
      engine.setNow(NOW);
      expect(await purgeCareData(engine.deps)).toEqual({ entriesPurged: 4, routinesPurged: 0 });
      expect(await logIds(engine)).toEqual([ID(11), ID(13), ID(21), ID(31), ID(41)].sort());
      expect(await purgeCareData(engine.deps)).toEqual({ entriesPurged: 0, routinesPurged: 0 }); // idempotente
    });

    it('[SC-012-089] los revertidos se purgan 30 días después de reverted_at (frontera), aunque la ocurrencia sea reciente', async () => {
      engine = await factory.make();
      await engine.run(async (r) => {
        await r.careRoutines.insert(routine(1));
        await r.careLog.insert(entry(11, ID(1), dateAgo(40), { occurrenceTime: '08:00', revertedAt: instantAgo(30), revertedByUserId: null, revertReason: 'error' }));
        await r.careLog.insert(entry(12, ID(1), dateAgo(40), { occurrenceTime: '09:00', revertedAt: instantAgo(30, 1), revertReason: 'error' }));
        await r.careLog.insert(entry(13, ID(1), dateAgo(40), { occurrenceTime: '10:00', revertedAt: instantAgo(1), revertReason: 'error' }));
        await r.careLog.insert(entry(14, ID(1), dateAgo(40), { occurrenceTime: '11:00' }));
      });
      engine.setNow(NOW);
      expect(await purgeCareData(engine.deps)).toEqual({ entriesPurged: 1, routinesPurged: 0 });
      expect(await logIds(engine)).toEqual([ID(11), ID(13), ID(14)].sort());
    });

    it('[SC-012-089] las rutinas inactivas se purgan a 365 días desde su desactivación con sus registros; las activas y las recientes no; una versión referenciada por otra se conserva hasta que su sucesora se purga', async () => {
      engine = await factory.make();
      await engine.run(async (r) => {
        await r.careRoutines.insert(routine(1, { active: false, updatedAt: instantAgo(365) })); // frontera: se conserva
        await r.careRoutines.insert(routine(2, { active: false, updatedAt: instantAgo(365, 1) })); // se purga con su registro
        await r.careRoutines.insert(routine(3, { active: true, updatedAt: instantAgo(900) })); // activa: nunca
        // cadena v1 (inactiva vieja) <- v2 (inactiva vieja) <- v3 (activa): solo se poda de la más nueva inactiva a la más vieja
        await r.careRoutines.insert(routine(4, { active: false, updatedAt: instantAgo(800), effectiveFrom: '2024-01-01T00:00:00.000Z' }));
        await r.careRoutines.insert(routine(5, { active: false, updatedAt: instantAgo(500), seriesId: ID(4), supersedesRoutineId: ID(4), effectiveFrom: '2024-02-01T00:00:00.000Z' }));
        await r.careRoutines.insert(routine(6, { active: true, seriesId: ID(4), supersedesRoutineId: ID(5), effectiveFrom: '2024-03-01T00:00:00.000Z' }));
        await r.careLog.insert(entry(21, ID(2), dateAgo(5)));
        await r.careLog.insert(entry(22, ID(1), dateAgo(5)));
      });
      engine.setNow(NOW);
      expect(await purgeCareData(engine.deps)).toEqual({ entriesPurged: 0, routinesPurged: 1 }); // solo ID(2); ID(4) e ID(5) están referenciadas
      expect(await routineIds(engine)).toEqual([ID(1), ID(3), ID(4), ID(5), ID(6)].sort());
      expect(await logIds(engine)).toEqual([ID(22)]);
    });

    it('[SC-012-089] runMaintenance incluye la purga de cuidado y devuelve los conteos de siempre', async () => {
      engine = await factory.make();
      await engine.run(async (r) => {
        await r.careRoutines.insert(routine(1));
        await r.careLog.insert(entry(11, ID(1), dateAgo(400)));
      });
      engine.setNow(NOW);
      await runMaintenance(engine.deps);
      expect(await logIds(engine)).toEqual([]);
    });
  });
}
