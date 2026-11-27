import { describe, expect, it } from 'vitest';
import { assertExpectedVersion, assertRoutineCapacity, planRoutineUpdate, validateCareRoutine } from '../../src/domain/care/care-routine.ts';
import { bogotaCivilDate, computeCareOccurrences } from '../../src/domain/care/care-occurrences.ts';
import { assertCanRevert, assertLogWindow, assertSkipNote, parseCareLogLimit, decideExistingEntry } from '../../src/domain/care/care-log.ts';
import { computeMyCareAccess } from '../../src/domain/care/care-permissions.ts';
import { canActOnPet } from '../../src/domain/access/can-act-on-pet.ts';
import * as limits from '../../src/domain/platform/feature-012-limits.ts';

/**
 * T1653 (Feature 012, Bloque C, #26; PRUEBAS ROJAS hasta T1655; `/keymaker`): dominio puro de cuidado `src/domain/care/{care-routine,care-occurrences,care-log,care-permissions}.ts` (sin reloj ni I/O: `now` por parámetro).
 * Fallan hoy porque esos módulos no existen (T1655 los crea) y porque `feature-012-limits.ts` aún no exporta las constantes de cuidado. Firma SUPUESTA por este archivo (el plan fija nombres de archivo, no firmas):
 * si T1655 necesita otra se ajusta aquí con el mismo comportamiento. Los errores se reconocen por forma (`DomainError` del catálogo fusionado 012, `src/generated/v38`).
 * Reglas tomadas de `care.openapi.yaml`, `care-routine.schema.json`, `care-log-entry.schema.json`, `caregiver-access.schema.json` (0.1.2) y `data-model.md` (Bloque C). Reloj de pruebas: jueves 2026-11-26 10:00 America/Bogota (UTC-5 fijo) = 15:00Z.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-002, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007, INV-SORT-001
 * Cubre SC-012-025, SC-012-026, SC-012-027, SC-012-028, SC-012-031, SC-012-032, SC-012-033, SC-012-034, SC-012-036, SC-012-037, SC-012-038, SC-012-077, SC-012-088.
 */
const isDomainError = (error: unknown): error is { code: string; status: number } => error instanceof Error && error.name === 'DomainError' && typeof (error as { code?: unknown }).code === 'string' && typeof (error as { status?: unknown }).status === 'number';
const codeOf = (action: () => unknown): [string, number] => {
  try {
    action();
  } catch (error) {
    if (isDomainError(error)) return [error.code, error.status];
    throw error;
  }
  throw new Error('no lanzó ningún DomainError');
};
const INVALID: [string, number] = ['ERR-SCHEMA-VALIDATION-FAILED', 422];
const CF = 'CANINE_FELINE' as const;
const NEW_ID = 'r2-nuevo';
const NOW = '2026-11-26T15:00:00.000Z'; // 10:00 Bogotá, jueves (ISO 4)

const med = (extra: Record<string, unknown> = {}) => ({
  kind: 'MEDICATION',
  title: 'Amoxicilina',
  instructions: 'Con comida',
  doseAmount: 250,
  doseUnit: 'MG',
  timesOfDay: ['08:00', '20:00'],
  daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  startDate: '2026-11-20',
  endDate: '2026-12-04',
  ...extra,
});

describe('T1653 [SC-012-088][REQ-CAR12-001] constantes de cuidado en feature-012-limits.ts (INV-ARCH-006: un solo lugar para los números)', () => {
  it('exporta los topes y ventanas del Bloque C con los valores aprobados', () => {
    const l = limits as unknown as Record<string, unknown>;
    expect({
      MAX_ROUTINES_PER_PET: l['MAX_ROUTINES_PER_PET'],
      MAX_ROUTINE_ROWS_PER_PET: l['MAX_ROUTINE_ROWS_PER_PET'],
      OVERDUE_GRACE_MINUTES: l['OVERDUE_GRACE_MINUTES'],
      CARE_LOG_BACKFILL_HOURS: l['CARE_LOG_BACKFILL_HOURS'],
      CARE_LOG_EARLY_TOLERANCE_MINUTES: l['CARE_LOG_EARLY_TOLERANCE_MINUTES'],
      CARE_LOG_UNDO_MINUTES: l['CARE_LOG_UNDO_MINUTES'],
      CARE_LOG_PAGE_MAX: l['CARE_LOG_PAGE_MAX'],
      CARE_LOG_WRITES_PER_USER_PER_HOUR: l['CARE_LOG_WRITES_PER_USER_PER_HOUR'],
      CARE_ROUTINE_WRITES_PER_USER_PER_HOUR: l['CARE_ROUTINE_WRITES_PER_USER_PER_HOUR'],
      CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR: l['CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR'],
    }).toEqual({
      MAX_ROUTINES_PER_PET: 20,
      MAX_ROUTINE_ROWS_PER_PET: 100,
      OVERDUE_GRACE_MINUTES: 60,
      CARE_LOG_BACKFILL_HOURS: 24,
      CARE_LOG_EARLY_TOLERANCE_MINUTES: 15,
      CARE_LOG_UNDO_MINUTES: 10,
      CARE_LOG_PAGE_MAX: 100,
      CARE_LOG_WRITES_PER_USER_PER_HOUR: 120,
      CARE_ROUTINE_WRITES_PER_USER_PER_HOUR: 60,
      CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR: 30,
    });
  });
});

describe('T1653 [SC-012-025][SC-012-088] validateCareRoutine: catálogo de unidades, paso y umbrales de confirmación (guarda anti-tecleo)', () => {
  it('[SC-012-025] una rutina de medicina válida se acepta y normaliza el orden de timesOfDay', () => {
    const out = validateCareRoutine(med({ timesOfDay: ['20:00', '08:00'] }), CF);
    expect(out.timesOfDay).toEqual(['08:00', '20:00']);
    expect(out.doseAmount).toBe(250);
    expect(out.doseUnit).toBe('MG');
  });

  it('[SC-012-088] UNIT e IU NO existen en el catálogo (se retiran): se rechazan; MG, MCG, ML, TABLET y DROP se aceptan', () => {
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: 'UNIT', doseAmount: 5 }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: 'IU', doseAmount: 4.5 }), CF))).toEqual(INVALID);
    for (const [unit, amount] of [['MG', 10], ['MCG', 10], ['ML', 2], ['TABLET', 0.5], ['DROP', 3]] as const) {
      expect(validateCareRoutine(med({ doseUnit: unit, doseAmount: amount }), CF).doseUnit).toBe(unit);
    }
  });

  it.each([
    ['MG', 500, 500.001],
    ['MCG', 500, 501],
    ['ML', 20, 20.001],
    ['TABLET', 4, 4.25],
    ['DROP', 10, 11],
  ] as const)('[SC-012-088] %s: hasta %s se acepta sin confirmar; %s exige confirmHighDose = true (422 sin ella; con ella se acepta)', (unit, atLimit, above) => {
    expect(validateCareRoutine(med({ doseUnit: unit, doseAmount: atLimit }), CF).doseAmount).toBe(atLimit);
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: unit, doseAmount: above }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: unit, doseAmount: above, confirmHighDose: false }), CF))).toEqual(INVALID);
    expect(validateCareRoutine(med({ doseUnit: unit, doseAmount: above, confirmHighDose: true }), CF).doseAmount).toBe(above);
  });

  it('[SC-012-088][maggie M-2] TABLET: múltiplos de 0,25 con mínimo 0,25; 0,125, 0,1, 0 y negativos se rechazan', () => {
    for (const ok of [0.25, 0.5, 0.75, 1, 2.25]) expect(validateCareRoutine(med({ doseUnit: 'TABLET', doseAmount: ok }), CF).doseAmount).toBe(ok);
    for (const bad of [0.125, 0.1, 0.3, 0, -0.25, 1.1]) expect(codeOf(() => validateCareRoutine(med({ doseUnit: 'TABLET', doseAmount: bad }), CF))).toEqual(INVALID);
  });

  it('[SC-012-088] DROP: entero ≥ 1 (1,5 y 0 se rechazan); MG/MCG/ML: > 0 con 3 decimales como máximo (0,0001 y 0 se rechazan, 0,001 se acepta)', () => {
    expect(validateCareRoutine(med({ doseUnit: 'DROP', doseAmount: 1 }), CF).doseAmount).toBe(1);
    for (const bad of [1.5, 0, 0.5]) expect(codeOf(() => validateCareRoutine(med({ doseUnit: 'DROP', doseAmount: bad }), CF))).toEqual(INVALID);
    for (const unit of ['MG', 'MCG', 'ML']) {
      expect(validateCareRoutine(med({ doseUnit: unit, doseAmount: 0.001 }), CF).doseAmount).toBe(0.001);
      expect(codeOf(() => validateCareRoutine(med({ doseUnit: unit, doseAmount: 0.0001 }), CF))).toEqual(INVALID);
      expect(codeOf(() => validateCareRoutine(med({ doseUnit: unit, doseAmount: 0 }), CF))).toEqual(INVALID);
    }
  });

  it('[F1][SC-012-088] OTHER_SPECIES: 600 MG se acepta sin confirmHighDose (cifras pendientes de veterinario humano); CANINE_FELINE conserva su umbral', () => {
    expect(validateCareRoutine(med({ doseUnit: 'MG', doseAmount: 600 }), 'OTHER_SPECIES').doseAmount).toBe(600);
    expect(validateCareRoutine(med({ doseUnit: 'TABLET', doseAmount: 8 }), 'OTHER_SPECIES').doseAmount).toBe(8);
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: 'MG', doseAmount: 600 }), CF))).toEqual(INVALID);
    const other = { id: 'r1', seriesId: 'se1', petId: 'p1', ...validateCareRoutine(med(), 'OTHER_SPECIES'), active: true, effectiveFrom: '2026-11-20T05:00:00.000Z', effectiveTo: null, supersedesRoutineId: null, version: 1 };
    expect(planRoutineUpdate(other, { doseAmount: 600 }, NOW, 'OTHER_SPECIES', NEW_ID).next.doseAmount).toBe(600);
  });

  it('[R-8][SC-012-088] tope DoseAmount: 100000 se acepta y 100000,001 se rechaza incluso con confirmHighDose (en ambos grupos de especie)', () => {
    for (const group of ['CANINE_FELINE', 'OTHER_SPECIES'] as const) {
      expect(validateCareRoutine(med({ doseAmount: 100000, confirmHighDose: true }), group).doseAmount).toBe(100000);
      expect(codeOf(() => validateCareRoutine(med({ doseAmount: 100000.001, confirmHighDose: true }), group))).toEqual(INVALID);
    }
  });

  it('[SC-012-088] MEDICATION exige dosis y unidad; MEAL/WALK/OTHER no llevan dosis', () => {
    expect(codeOf(() => validateCareRoutine(med({ doseAmount: undefined }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ doseUnit: undefined }), CF))).toEqual(INVALID);
    for (const kind of ['MEAL', 'WALK', 'OTHER']) {
      expect(codeOf(() => validateCareRoutine(med({ kind }), CF))).toEqual(INVALID);
      expect(validateCareRoutine(med({ kind, doseAmount: undefined, doseUnit: undefined }), CF).doseAmount).toBeNull();
    }
  });

  it('[SC-012-088][maggie A-3] una medicina sin endDate ni ongoing se rechaza; con ambos también (XOR); endDate < startDate se rechaza; ongoing sin endDate se acepta', () => {
    expect(codeOf(() => validateCareRoutine(med({ endDate: undefined }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ endDate: '2026-12-04', ongoing: true }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ endDate: '2026-11-19' }), CF))).toEqual(INVALID);
    expect(validateCareRoutine(med({ endDate: undefined, ongoing: true }), CF).ongoing).toBe(true);
  });

  it('[SC-012-025] límites de forma: título 1–60, instrucciones ≤ 300, 1–6 horas HH:MM sin repetir, 1–7 días ISO sin repetir', () => {
    expect(codeOf(() => validateCareRoutine(med({ title: '' }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ title: 'x'.repeat(61) }), CF))).toEqual(INVALID);
    expect(validateCareRoutine(med({ title: 'x'.repeat(60) }), CF).title).toHaveLength(60);
    expect(codeOf(() => validateCareRoutine(med({ instructions: 'x'.repeat(301) }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ timesOfDay: [] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ timesOfDay: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ timesOfDay: ['08:00', '08:00'] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ timesOfDay: ['24:00'] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ daysOfWeek: [0] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ daysOfWeek: [8] }), CF))).toEqual(INVALID);
    expect(codeOf(() => validateCareRoutine(med({ daysOfWeek: [1, 1] }), CF))).toEqual(INVALID);
  });
});

describe('T1653 [SC-012-037] assertRoutineCapacity: 20 activas y 100 filas totales por mascota', () => {
  it('con 19 activas se puede crear; con 20, ERR-CAR12-ROUTINE-LIMIT 409; con 100 filas totales también', () => {
    expect(() => assertRoutineCapacity({ activeCount: 19, totalRows: 19, replacing: false })).not.toThrow(Error);
    expect(codeOf(() => assertRoutineCapacity({ activeCount: 20, totalRows: 20, replacing: false }))).toEqual(['ERR-CAR12-ROUTINE-LIMIT', 409]);
    expect(codeOf(() => assertRoutineCapacity({ activeCount: 3, totalRows: 100, replacing: false }))).toEqual(['ERR-CAR12-ROUTINE-LIMIT', 409]);
  });

  it('una versión nueva que sustituye a la anterior NO suma al tope de activas (las versiones sustituidas no cuentan)', () => {
    expect(() => assertRoutineCapacity({ activeCount: 20, totalRows: 40, replacing: true })).not.toThrow(Error);
    expect(codeOf(() => assertRoutineCapacity({ activeCount: 20, totalRows: 100, replacing: true }))).toEqual(['ERR-CAR12-ROUTINE-LIMIT', 409]);
  });
});

describe('T1653 [SC-012-026][SC-012-088] planRoutineUpdate y assertExpectedVersion: versionado de dosis (M-7, A-04) y ERR-CAR12-ROUTINE-STALE (H-C2)', () => {
  const current = { id: 'r1', seriesId: 'se1', petId: 'p1', ...validateCareRoutine(med(), CF), active: true, effectiveFrom: '2026-11-20T05:00:00.000Z', effectiveTo: null, supersedesRoutineId: null, version: 3 };

  it('cambiar dosis, unidad u horarios inserta una fila nueva (mismo seriesId, supersedesRoutineId, effectiveFrom = ahora) y cierra la anterior', () => {
    for (const patch of [{ doseAmount: 300 }, { doseUnit: 'ML', doseAmount: 5 }, { timesOfDay: ['09:00'] }]) {
      const plan = planRoutineUpdate(current, patch, NOW, CF, NEW_ID);
      expect(plan.versioned).toBe(true);
      expect(plan.next.id).toBe(NEW_ID);
      expect(plan.next.version).toBe(1);
      expect(plan.next.seriesId).toBe('se1');
      expect(plan.next.supersedesRoutineId).toBe('r1');
      expect(plan.next.effectiveFrom).toBe(NOW);
      expect(plan.next.effectiveTo).toBeNull();
      expect(plan.next.active).toBe(true);
      expect(plan.closed).toMatchObject({ id: 'r1', active: false, effectiveTo: NOW });
    }
  });

  it('cambiar solo título, instrucciones, días o endDate edita en el sitio (misma fila, sin cerrar nada)', () => {
    const plan = planRoutineUpdate(current, { title: 'Amoxicilina 250', daysOfWeek: [1, 3] }, NOW, CF, NEW_ID);
    expect(plan.versioned).toBe(false);
    expect(plan.closed).toBeNull();
    expect(plan.next).toMatchObject({ id: 'r1', seriesId: 'se1', title: 'Amoxicilina 250', daysOfWeek: [1, 3], active: true, version: 4 }); // la edición en el sitio incrementa version (3 -> 4)
  });

  it('enviar la misma dosis y los mismos horarios no versiona; una dosis nueva por encima del umbral exige confirmHighDose también al editar', () => {
    expect(planRoutineUpdate(current, { doseAmount: 250, timesOfDay: ['08:00', '20:00'] }, NOW, CF, NEW_ID).versioned).toBe(false);
    expect(codeOf(() => planRoutineUpdate(current, { doseAmount: 600 }, NOW, CF, NEW_ID))).toEqual(INVALID);
    expect(planRoutineUpdate(current, { doseAmount: 600, confirmHighDose: true }, NOW, CF, NEW_ID).next.doseAmount).toBe(600);
  });

  it('[H-C2] expectedVersion distinta, fila ya sustituida o rutina inactiva: ERR-CAR12-ROUTINE-STALE 409; con la versión vigente no lanza', () => {
    expect(() => assertExpectedVersion(current, 3)).not.toThrow(Error);
    expect(codeOf(() => assertExpectedVersion(current, 2))).toEqual(['ERR-CAR12-ROUTINE-STALE', 409]);
    expect(codeOf(() => assertExpectedVersion({ ...current, active: false, effectiveTo: NOW }, 3))).toEqual(['ERR-CAR12-ROUTINE-STALE', 409]);
  });
});

describe('T1653 [SC-012-027][SC-012-028] computeCareOccurrences: función pura rutina × día civil de Bogotá (REQ-CAR12-002)', () => {
  const routine = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    seriesId: `s-${id}`,
    kind: 'MEDICATION',
    title: `Rutina ${id}`,
    instructions: `Instrucción ${id}`,
    doseAmount: 5,
    doseUnit: 'MG',
    timesOfDay: ['08:00'],
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startDate: '2026-11-01',
    endDate: null,
    ongoing: true,
    active: true,
    effectiveFrom: '2026-11-01T05:00:00.000Z',
    effectiveTo: null,
    ...extra,
  });
  const compute = (routines: unknown[], entries: unknown[] = [], now = NOW, date = '2026-11-26') => computeCareOccurrences({ routines, entries, date, now } as never);

  it('[SC-012-027] respeta daysOfWeek (jueves = 4), startDate, endDate inclusivo y ongoing', () => {
    const out = compute([
      routine('a', { daysOfWeek: [4] }),
      routine('b', { daysOfWeek: [1, 2, 3, 5, 6, 7] }),
      routine('c', { startDate: '2026-11-27' }),
      routine('d', { startDate: '2026-11-01', endDate: '2026-11-26', ongoing: false }),
      routine('e', { startDate: '2026-11-01', endDate: '2026-11-25', ongoing: false }),
      routine('f', { endDate: null, ongoing: true }),
    ]);
    expect(out.items.map((i) => i.routineId)).toEqual(['a', 'd', 'f']);
  });

  it('[SC-012-027] ordena por hora y, a igual hora, conserva el orden de entrada (estable, INV-SORT-001); varias horas por rutina generan una ocurrencia por hora', () => {
    const out = compute([routine('z', { timesOfDay: ['20:00', '08:00'] }), routine('y', { timesOfDay: ['08:00'] }), routine('x', { timesOfDay: ['12:30'] })]);
    expect(out.items.map((i) => `${i.occurrenceTime}/${i.routineId}`)).toEqual(['08:00/z', '08:00/y', '12:30/x', '20:00/z']);
  });

  it('[SC-012-027] cabecera: fecha civil, zona America/Bogota y gracia de 60 min', () => {
    const out = compute([routine('a')]);
    expect({ date: out.date, timezone: out.timezone, graceMinutes: out.graceMinutes }).toEqual({ date: '2026-11-26', timezone: 'America/Bogota', graceMinutes: 60 });
  });

  it('[SC-012-028] PENDING hasta hora + 60 min; después OVERDUE y SIN texto de instrucción (instructions = null); PENDING conserva la instrucción', () => {
    const at = (iso: string) => compute([routine('a', { timesOfDay: ['08:00'] })], [], iso).items[0]!;
    expect(at('2026-11-26T12:00:00.000Z')).toMatchObject({ state: 'PENDING', instructions: 'Instrucción a' }); // 07:00 Bogotá
    expect(at('2026-11-26T13:59:00.000Z')).toMatchObject({ state: 'PENDING', instructions: 'Instrucción a' }); // 08:59
    const overdue = at('2026-11-26T14:01:00.000Z'); // 09:01
    expect(overdue.state).toBe('OVERDUE');
    expect(overdue.instructions).toBeNull();
  });

  it('[R-2][SC-012-027] la v1 (sin supersedesRoutineId) rige desde startDate 00:00 Bogotá aunque se creara después: una toma del mismo día anterior a la creación sale con v1; una v2 solo rige desde su effectiveFrom', () => {
    const created = '2026-11-26T15:00:00.000Z'; // 10:00 Bogotá
    const v1 = routine('v1', { seriesId: 'S', timesOfDay: ['06:00', '09:00'], startDate: '2026-11-26', effectiveFrom: created });
    expect(compute([v1], [], '2026-11-26T20:00:00.000Z').items.map((i) => `${i.occurrenceTime}:${i.routineId}`)).toEqual(['06:00:v1', '09:00:v1']);
    const v2 = routine('v2', { seriesId: 'S', timesOfDay: ['06:00', '09:00'], startDate: '2026-11-26', supersedesRoutineId: 'v1', effectiveFrom: created });
    expect(compute([v2], [], '2026-11-26T20:00:00.000Z').items).toEqual([]);
  });

  it('[SC-012-028] frontera exacta de 60 min: a hora + 59 min 59 s sigue PENDING; a hora + 60 min exactos pasa a OVERDUE', () => {
    const at = (iso: string) => compute([routine('a', { timesOfDay: ['08:00'] })], [], iso).items[0]!.state;
    expect(at('2026-11-26T13:59:59.000Z')).toBe('PENDING'); // 08:59:59 Bogotá
    expect(at('2026-11-26T14:00:00.000Z')).toBe('OVERDUE'); // 09:00:00
  });

  it('[SC-012-028] DONE y SKIPPED salen con su entrada y conservan su estado aunque pase la gracia; una entrada revertida no cuenta', () => {
    const entry = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'e1', routineId: 'a', seriesId: 's-a', occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status, late: false, revertedAt: null, ...extra });
    const late = '2026-11-26T20:00:00.000Z';
    expect(compute([routine('a')], [entry('DONE')], late).items[0]).toMatchObject({ state: 'DONE', logEntry: { id: 'e1', status: 'DONE' } });
    expect(compute([routine('a')], [entry('SKIPPED')], late).items[0]).toMatchObject({ state: 'SKIPPED', logEntry: { id: 'e1', status: 'SKIPPED' } });
    const reverted = compute([routine('a')], [entry('DONE', { revertedAt: '2026-11-26T14:00:00.000Z' })], late).items[0]!;
    expect(reverted.state).toBe('OVERDUE');
    expect(reverted.logEntry).toBeNull();
  });

  it('[SC-012-088][M-7][A-04] con un cambio de dosis, cada ocurrencia usa la versión que la cubre por instante, no la vigente; la entrada de la serie sigue ligada aunque se registrara contra la fila anterior', () => {
    const v1 = routine('v1', { seriesId: 'S', doseAmount: 5, timesOfDay: ['08:00', '12:00'], active: false, effectiveFrom: '2026-11-01T05:00:00.000Z', effectiveTo: '2026-11-26T14:00:00.000Z' }); // cierra a las 09:00 Bogotá
    const v2 = routine('v2', { seriesId: 'S', doseAmount: 10, timesOfDay: ['08:00', '12:00'], supersedesRoutineId: 'v1', effectiveFrom: '2026-11-26T14:00:00.000Z' });
    const entry = { id: 'e1', routineId: 'v1', seriesId: 'S', occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE', late: false, revertedAt: null };
    const out = compute([v1, v2], [entry], '2026-11-26T20:00:00.000Z');
    expect(out.items.map((i) => `${i.occurrenceTime}:${i.routineId}:${i.doseAmount}:${i.state}`)).toEqual(['08:00:v1:5:DONE', '12:00:v2:10:OVERDUE']);
  });

  it('una rutina desactivada antes del día no genera ocurrencias; desactivada hoy a las 09:00 conserva las anteriores a ese instante', () => {
    const closedYesterday = routine('old', { active: false, effectiveTo: '2026-11-25T20:00:00.000Z' });
    const closedToday = routine('mid', { active: false, effectiveTo: '2026-11-26T14:00:00.000Z', timesOfDay: ['08:00', '12:00'] });
    expect(compute([closedYesterday, closedToday]).items.map((i) => `${i.routineId}@${i.occurrenceTime}`)).toEqual(['mid@08:00']);
  });

  it('es pura: misma entrada, misma salida, y no muta rutinas ni entradas (congeladas)', () => {
    const rs = Object.freeze([Object.freeze(routine('a')), Object.freeze(routine('b', { timesOfDay: ['07:00'] }))]);
    const es = Object.freeze([]);
    const first = computeCareOccurrences({ routines: rs, entries: es, date: '2026-11-26', now: NOW } as never);
    const second = computeCareOccurrences({ routines: rs, entries: es, date: '2026-11-26', now: NOW } as never);
    expect(second).toEqual(first);
    expect(first.items.map((i) => i.routineId)).toEqual(['b', 'a']);
  });
});

describe('T1653 [SC-012-034] bogotaCivilDate: día civil de America/Bogota (UTC-5 fijo, D12-12)', () => {
  it('23:59:59 de Bogotá sigue siendo el día; 00:00:00 de Bogotá es el siguiente', () => {
    expect(bogotaCivilDate('2026-11-27T04:59:59.000Z')).toBe('2026-11-26');
    expect(bogotaCivilDate('2026-11-27T05:00:00.000Z')).toBe('2026-11-27');
    expect(bogotaCivilDate('2026-11-26T03:00:00.000Z')).toBe('2026-11-25');
  });
});

describe('T1653 [SC-012-034] assertLogWindow: ventana de registro de 24 h, DONE hasta 15 min tras la ocurrencia, SKIPPED no anticipado', () => {
  const win = (occurrenceDate: string, occurrenceTime: string, status: 'DONE' | 'SKIPPED') => () => assertLogWindow({ occurrenceDate, occurrenceTime, status, now: NOW });
  const OUT: [string, number] = ['ERR-CAR12-OUT-OF-WINDOW', 422];

  it('hacia atrás: exactamente 24 h se acepta; 24 h y 1 min, ERR-CAR12-OUT-OF-WINDOW (todos los estados)', () => {
    expect(() => win('2026-11-25', '10:00', 'DONE')()).not.toThrow(Error);
    expect(codeOf(win('2026-11-25', '09:59', 'DONE'))).toEqual(OUT);
    expect(codeOf(win('2026-11-25', '09:59', 'SKIPPED'))).toEqual(OUT);
    expect(codeOf(win('2026-11-20', '08:00', 'DONE'))).toEqual(OUT);
  });

  it('DONE de una ocurrencia futura: hasta 15 min después de ahora se acepta (tolerancia); 16 min, fuera de ventana; una fecha futura también', () => {
    expect(() => win('2026-11-26', '10:15', 'DONE')()).not.toThrow(Error);
    expect(codeOf(win('2026-11-26', '10:16', 'DONE'))).toEqual(OUT);
    expect(codeOf(win('2026-11-27', '08:00', 'DONE'))).toEqual(OUT);
  });

  it('SKIPPED anticipado (cualquier ocurrencia aún no llegada) es ERR-CAR12-OUT-OF-WINDOW; en la hora exacta o pasada se acepta', () => {
    expect(codeOf(win('2026-11-26', '10:01', 'SKIPPED'))).toEqual(OUT);
    expect(codeOf(win('2026-11-26', '10:15', 'SKIPPED'))).toEqual(OUT);
    expect(() => win('2026-11-26', '10:00', 'SKIPPED')()).not.toThrow(Error);
    expect(() => win('2026-11-26', '08:00', 'SKIPPED')()).not.toThrow(Error);
  });

  it('[R-8] fronteras en segundos: 24 h exactas se aceptan y 24 h + 1 s no; DONE a 15 min exactos se acepta y a 15 min + 1 s no; late cambia exactamente a los 60 min', () => {
    const w = (occurrenceDate: string, occurrenceTime: string, status: 'DONE' | 'SKIPPED', now: string) => () => assertLogWindow({ occurrenceDate, occurrenceTime, status, now });
    expect(() => w('2026-11-25', '10:00', 'DONE', NOW)()).not.toThrow(Error);
    expect(codeOf(w('2026-11-25', '10:00', 'DONE', '2026-11-26T15:00:01.000Z'))).toEqual(OUT);
    expect(() => w('2026-11-26', '10:15', 'DONE', NOW)()).not.toThrow(Error);
    expect(codeOf(w('2026-11-26', '10:15', 'DONE', '2026-11-26T14:59:59.000Z'))).toEqual(OUT);
    expect(assertLogWindow({ occurrenceDate: '2026-11-26', occurrenceTime: '09:00', status: 'DONE', now: NOW }).late).toBe(true); // exactamente 60 min
    expect(assertLogWindow({ occurrenceDate: '2026-11-26', occurrenceTime: '09:00', status: 'DONE', now: '2026-11-26T14:59:59.000Z' }).late).toBe(false);
  });

  it('late: false hasta hora + 60 min, true después (ocurrencia OVERDUE dentro de la ventana, M-04)', () => {
    expect(assertLogWindow({ occurrenceDate: '2026-11-26', occurrenceTime: '09:01', status: 'DONE', now: NOW }).late).toBe(false); // hace 59 min
    expect(assertLogWindow({ occurrenceDate: '2026-11-26', occurrenceTime: '08:59', status: 'DONE', now: NOW }).late).toBe(true); // hace 61 min
    expect(assertLogWindow({ occurrenceDate: '2026-11-25', occurrenceTime: '12:00', status: 'SKIPPED', now: NOW }).late).toBe(true);
  });
});

describe('T1653 [SC-012-029][SC-012-088] assertSkipNote: SKIPPED con nota obligatoria en MEDICATION', () => {
  it('SKIPPED de MEDICATION sin nota, vacía o solo espacios: 422; con nota de 1–140 se acepta; 141 se rechaza', () => {
    for (const note of [undefined, '', '   ']) expect(codeOf(() => assertSkipNote({ kind: 'MEDICATION', status: 'SKIPPED', note }))).toEqual(INVALID);
    expect(() => assertSkipNote({ kind: 'MEDICATION', status: 'SKIPPED', note: 'Vomitó' })).not.toThrow(Error);
    expect(() => assertSkipNote({ kind: 'MEDICATION', status: 'SKIPPED', note: 'x'.repeat(140) })).not.toThrow(Error);
    expect(codeOf(() => assertSkipNote({ kind: 'MEDICATION', status: 'SKIPPED', note: 'x'.repeat(141) }))).toEqual(INVALID);
  });

  it('SKIPPED de MEAL/WALK/OTHER y DONE de MEDICATION no exigen nota, pero toda nota de más de 140 se rechaza', () => {
    for (const kind of ['MEAL', 'WALK', 'OTHER']) expect(() => assertSkipNote({ kind, status: 'SKIPPED', note: undefined })).not.toThrow(Error);
    expect(() => assertSkipNote({ kind: 'MEDICATION', status: 'DONE', note: undefined })).not.toThrow(Error);
    expect(codeOf(() => assertSkipNote({ kind: 'MEAL', status: 'DONE', note: 'x'.repeat(141) }))).toEqual(INVALID);
  });
});

describe('T1653 [SC-012-031][SC-012-032] decideExistingEntry: mismo autor 200 con mismo status; 409 ERR-CAR12-ALREADY-LOGGED en cualquier otro caso (sin idempotency_key)', () => {
  const existing = { id: 'e1', status: 'DONE', performedByUserId: 'u1' };
  it('sin entrada vigente se inserta', () => {
    expect(decideExistingEntry({ existing: null, actorUserId: 'u1', status: 'DONE' })).toEqual({ action: 'INSERT' });
  });
  it('[SC-012-032] mismo autor y mismo status: devuelve la fila existente (200) sin insertar', () => {
    expect(decideExistingEntry({ existing, actorUserId: 'u1', status: 'DONE' })).toEqual({ action: 'RETURN_EXISTING', entry: existing });
  });
  it('[SC-012-032][M-02] mismo autor con status distinto: 409 ERR-CAR12-ALREADY-LOGGED (corregir = revertir y volver a registrar)', () => {
    expect(codeOf(() => decideExistingEntry({ existing, actorUserId: 'u1', status: 'SKIPPED' }))).toEqual(['ERR-CAR12-ALREADY-LOGGED', 409]);
  });
  it('[SC-012-031] otro usuario, con el mismo o distinto status: 409 ERR-CAR12-ALREADY-LOGGED (no hay replay entre usuarios)', () => {
    expect(codeOf(() => decideExistingEntry({ existing, actorUserId: 'u2', status: 'DONE' }))).toEqual(['ERR-CAR12-ALREADY-LOGGED', 409]);
    expect(codeOf(() => decideExistingEntry({ existing, actorUserId: 'u2', status: 'SKIPPED' }))).toEqual(['ERR-CAR12-ALREADY-LOGGED', 409]);
  });
  it('[SC-012-031] una entrada cuyo autor fue seudonimizado (null) nunca coincide con un actor: 409', () => {
    expect(codeOf(() => decideExistingEntry({ existing: { ...existing, performedByUserId: null }, actorUserId: 'u1', status: 'DONE' }))).toEqual(['ERR-CAR12-ALREADY-LOGGED', 409]);
  });
});

describe('T1653 [SC-012-033] assertCanRevert: deshacer 10 min para el autor o un titular; después solo un titular con revert_reason', () => {
  const entry = { performedByUserId: 'author', performedAt: '2026-11-26T14:55:00.000Z' }; // hace 5 min
  const old = { performedByUserId: 'author', performedAt: '2026-11-26T14:49:00.000Z' }; // hace 11 min
  const caregiver = (userId: string, level: 'BASIC_LOG' | 'VIEW_ONLY' | null = 'BASIC_LOG') => ({ userId, titular: false, level });
  const titular = (userId: string) => ({ userId, titular: true, level: null });
  const FORBIDDEN: [string, number] = ['ERR-ACC-FORBIDDEN', 403];

  it('el autor BASIC_LOG dentro de 10 min revierte sin motivo', () => {
    expect(() => assertCanRevert({ actor: caregiver('author'), entry, now: NOW })).not.toThrow(Error);
  });
  it('el autor BASIC_LOG pasados 10 min: 403 ERR-ACC-FORBIDDEN', () => {
    expect(codeOf(() => assertCanRevert({ actor: caregiver('author'), entry: old, now: NOW, reason: 'me equivoqué' }))).toEqual(FORBIDDEN);
  });
  it('un cuidador que no es el autor, aunque sea dentro del plazo, y uno VIEW_ONLY o sin nivel: 403', () => {
    expect(codeOf(() => assertCanRevert({ actor: caregiver('otro'), entry, now: NOW }))).toEqual(FORBIDDEN);
    expect(codeOf(() => assertCanRevert({ actor: caregiver('author', 'VIEW_ONLY'), entry, now: NOW }))).toEqual(FORBIDDEN);
    expect(codeOf(() => assertCanRevert({ actor: caregiver('author', null), entry, now: NOW }))).toEqual(FORBIDDEN);
  });
  it('un titular dentro de 10 min revierte cualquier registro sin motivo; fuera de plazo exige reason (sin él o en blanco: 422 ERR-SCHEMA-VALIDATION-FAILED)', () => {
    expect(() => assertCanRevert({ actor: titular('t1'), entry, now: NOW })).not.toThrow(Error);
    expect(codeOf(() => assertCanRevert({ actor: titular('t1'), entry: old, now: NOW }))).toEqual(INVALID);
    expect(codeOf(() => assertCanRevert({ actor: titular('t1'), entry: old, now: NOW, reason: '   ' }))).toEqual(INVALID);
    expect(() => assertCanRevert({ actor: titular('t1'), entry: old, now: NOW, reason: 'Dosis registrada en la mascota equivocada' })).not.toThrow(Error);
  });
  it('quien no es titular ni cuidador (ADMIN, MEMBER, READER del hogar) no revierte jamás: 403', () => {
    expect(codeOf(() => assertCanRevert({ actor: { userId: 'adm', titular: false, level: null }, entry, now: NOW, reason: 'x' }))).toEqual(FORBIDDEN);
  });
});

describe('T1653 [SC-012-038] parseCareLogLimit: paginación de 100 como máximo (50 por defecto)', () => {
  it('por defecto 50; 1 y 100 se aceptan; 0, 101, negativos y no enteros se rechazan con 422', () => {
    expect(parseCareLogLimit(undefined)).toBe(50);
    expect(parseCareLogLimit(1)).toBe(1);
    expect(parseCareLogLimit(100)).toBe(100);
    for (const bad of [0, 101, -5, 2.5, Number.NaN]) expect(codeOf(() => parseCareLogLimit(bad))).toEqual(INVALID);
  });
});

describe('T1653 [SC-012-030][SC-012-036][SC-012-077] computeMyCareAccess: titulares, niveles de cuidador, careUntil inclusivo y permisos clínicos intactos', () => {
  const PET = 'pet-1';
  const H = 'h-1';
  const pet = { id: PET, ownerUserId: 'principal', coOwners: [{ userId: 'co', status: 'ACTIVE' }, { userId: 'invited', status: 'INVITED' }] };
  const member = (userId: string, role: string, status = 'ACTIVE') => ({ userId, householdId: H, role, status });
  const households = (memberships: unknown[], assigned = true) => ({ memberships, assignments: assigned ? [{ petId: PET, householdId: H }] : [] });
  const access = (userId: string, ms: unknown[], rows: unknown[] = [], now = NOW, assigned = true) => computeMyCareAccess({ userId, pet, households: households(ms, assigned), accessRows: rows, now } as never);
  const row = (userId: string, level: string, careUntil: string | null = null) => ({ petId: PET, userId, level, careUntil, version: 1 });

  it('principal y co-propietario ACTIVE: titulares con todo (caregiver = false, canManageRoutines = true); co-propietario INVITED no', () => {
    for (const userId of ['principal', 'co']) {
      expect(access(userId, [])).toMatchObject({ caregiver: false, level: null, canViewRoutines: true, canLogCare: true, canManageRoutines: true });
    }
    expect(access('invited', [])).toMatchObject({ caregiver: false, canViewRoutines: false, canLogCare: false, canManageRoutines: false });
  });

  it('[SC-012-026][T-C5] ADMIN, MEMBER y READER del hogar (aunque la mascota esté asignada): sin lectura, registro ni gestión de rutinas', () => {
    for (const role of ['ADMIN', 'MEMBER', 'READER']) {
      expect(access('u', [member('u', role)])).toMatchObject({ caregiver: false, level: null, canViewRoutines: false, canLogCare: false, canManageRoutines: false });
    }
  });

  it('[SC-012-030] CAREGIVER sin fila de nivel: VIEW_ONLY por defecto (defaultedToViewOnly), lee pero no registra ni gestiona', () => {
    expect(access('c', [member('c', 'CAREGIVER')])).toMatchObject({ caregiver: true, level: 'VIEW_ONLY', defaultedToViewOnly: true, canViewRoutines: true, canLogCare: false, canManageRoutines: false });
  });

  it('[SC-012-029][SC-012-030] CAREGIVER con BASIC_LOG registra pero nunca gestiona rutinas; con VIEW_ONLY solo lee', () => {
    expect(access('c', [member('c', 'CAREGIVER')], [row('c', 'BASIC_LOG')])).toMatchObject({ caregiver: true, level: 'BASIC_LOG', defaultedToViewOnly: false, canViewRoutines: true, canLogCare: true, canManageRoutines: false });
    expect(access('c', [member('c', 'CAREGIVER')], [row('c', 'VIEW_ONLY')])).toMatchObject({ level: 'VIEW_ONLY', defaultedToViewOnly: false, canViewRoutines: true, canLogCare: false, canManageRoutines: false });
  });

  it('[SC-012-036][T-C3] careUntil es INCLUSIVO: rige hasta las 23:59:59 de Bogotá del día indicado y a las 00:00:00 del siguiente el cuidador cae a VIEW_ONLY por defecto', () => {
    const rows = [row('c', 'BASIC_LOG', '2026-11-26')];
    const ms = [member('c', 'CAREGIVER')];
    expect(access('c', ms, rows, '2026-11-27T04:59:59.000Z')).toMatchObject({ level: 'BASIC_LOG', canLogCare: true, defaultedToViewOnly: false });
    const expired = access('c', ms, rows, '2026-11-27T05:00:00.000Z');
    expect(expired).toMatchObject({ caregiver: true, level: 'VIEW_ONLY', defaultedToViewOnly: true, canViewRoutines: true, canLogCare: false, canManageRoutines: false });
  });

  it('[T-C2] la fila de nivel no vale si el cuidador ya no es CAREGIVER ACTIVE de un hogar con la mascota asignada (salió, cambió de rol o se desasignó)', () => {
    const rows = [row('c', 'BASIC_LOG')];
    expect(access('c', [member('c', 'CAREGIVER', 'LEFT')], rows)).toMatchObject({ caregiver: false, canViewRoutines: false, canLogCare: false });
    expect(access('c', [member('c', 'MEMBER')], rows)).toMatchObject({ caregiver: false, canViewRoutines: false, canLogCare: false });
    expect(access('c', [member('c', 'CAREGIVER')], rows, NOW, false)).toMatchObject({ caregiver: false, canViewRoutines: false, canLogCare: false });
  });

  it('[SC-012-077][D12-10 = A] VIEW_ONLY NO resta permisos clínicos del rol CAREGIVER: clinicalPermissionsUnchanged y eventos sanitarios y pesos siguen permitidos', () => {
    const ms = [member('c', 'CAREGIVER')];
    const mine = access('c', ms, [row('c', 'VIEW_ONLY')]);
    expect(mine.clinicalPermissionsUnchanged).toBe(true);
    for (const action of ['WRITE_HEALTH_EVENTS', 'WRITE_WEIGHTS_AND_MEASUREMENTS'] as const) {
      expect(canActOnPet({ id: 'c' }, pet, action, households(ms) as unknown as Parameters<typeof canActOnPet>[3])).toBe(true);
    }
    expect(access('principal', []).clinicalPermissionsUnchanged).toBe(true);
  });
});
