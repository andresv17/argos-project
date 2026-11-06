import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  calculatePetAge,
  diffInCalendarDays,
  getDaysInMonth,
  isIsoCalendarDate,
  isLeapYear,
  monthlyAnniversary,
  parseIsoCalendarDate,
  toEpochDays,
  validateBirthDateNotFuture,
  validateEventDateWindow,
} from '../../src/domain/shared/date-utils.ts';
import {
  getRecordEventDate,
  isCanonicalUtcTimestamp,
  matchesPetListFilter,
  normalizeForSearch,
  sortHistoricalRecords,
  sortPetsForListing,
} from '../../src/domain/sorting/deterministic-sorter.ts';
import { DeterministicIdAdapter } from '../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';

/** Ejecuta fn y devuelve el DomainError lanzado; falla la prueba si no lanza uno. */
function domainErrorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

describe('TASK-104: edad (src/domain/shared/date-utils.ts)', () => {
  it('[REQ-PET-002] cumple los dos ejemplos de la spec: 29-feb y día 31', () => {
    expect(calculatePetAge('2024-02-29', '2025-02-28')).toEqual({ years: 1, months: 0, totalDays: 365 });
    expect(calculatePetAge('2026-01-31', '2026-02-28')).toEqual({ years: 0, months: 1, totalDays: 28 });
  });

  it('[REQ-PET-002] el aniversario cae en el último día del mes y se calcula siempre desde el día original', () => {
    expect(calculatePetAge('2024-02-29', '2025-02-27')).toEqual({ years: 0, months: 11, totalDays: 364 });
    expect(calculatePetAge('2024-02-29', '2028-02-29')).toEqual({ years: 4, months: 0, totalDays: 1461 });
    expect(calculatePetAge('2024-02-29', '2024-03-28')).toEqual({ years: 0, months: 0, totalDays: 28 });
    expect(calculatePetAge('2024-02-29', '2024-03-29')).toEqual({ years: 0, months: 1, totalDays: 29 });
    expect(calculatePetAge('2026-01-31', '2026-03-30')).toEqual({ years: 0, months: 1, totalDays: 58 });
    expect(calculatePetAge('2026-01-31', '2026-03-31')).toEqual({ years: 0, months: 2, totalDays: 59 });
    expect(calculatePetAge('2026-01-31', '2026-04-30')).toEqual({ years: 0, months: 3, totalDays: 89 });
    expect(calculatePetAge('2025-03-31', '2025-04-30')).toEqual({ years: 0, months: 1, totalDays: 30 });
    expect(calculatePetAge('2025-12-31', '2026-01-30')).toEqual({ years: 0, months: 0, totalDays: 30 });
  });

  it('[REQ-PET-002][INV-ARCH-001] calcula la edad con la fecha de FixedClockAdapter (2026-11-05)', () => {
    const today = new FixedClockAdapter().todayIsoDate();
    expect(calculatePetAge('2022-05-10', today)).toEqual({ years: 4, months: 5, totalDays: 1640 });
    expect(calculatePetAge('2021-11-05', today)).toEqual({ years: 5, months: 0, totalDays: 1826 });
    expect(calculatePetAge(today, today)).toEqual({ years: 0, months: 0, totalDays: 0 });
  });

  it('[INV-PET-002][ERR-PET-FUTURE-BIRTHDATE] rechaza birthDate posterior a ClockPort.todayIsoDate() con 422', () => {
    const clock = new FixedClockAdapter('2026-11-05', '2026-11-05T12:00:00.000Z');
    const error = domainErrorOf(() => validateBirthDateNotFuture('2026-11-06', clock.todayIsoDate()));
    expect(error.code).toBe('ERR-PET-FUTURE-BIRTHDATE');
    expect(error.status).toBe(422);
    expect(error.invariantRef).toBe('INV-PET-002');
    expect(error.field).toBe('birthDate');
    expect(() => calculatePetAge('2026-11-06', clock.todayIsoDate())).toThrow(/ERR-PET-FUTURE-BIRTHDATE/);
  });

  it('[INV-PET-002][ERR-PET-FUTURE-BIRTHDATE] la misma birthDate pasa al avanzar el reloj un día', () => {
    const clock = new FixedClockAdapter('2026-11-05', '2026-11-05T12:00:00.000Z');
    expect(() => validateBirthDateNotFuture('2026-11-06', clock.todayIsoDate())).toThrow(/ERR-PET-FUTURE-BIRTHDATE/);
    clock.setClock('2026-11-06', '2026-11-06T00:00:00.000Z');
    expect(calculatePetAge('2026-11-06', clock.todayIsoDate())).toEqual({ years: 0, months: 0, totalDays: 0 });
  });

  it('[REQ-PET-002] rechaza fechas que no existen o con formato inválido con ERR-SCHEMA-VALIDATION-FAILED', () => {
    for (const bad of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-01', '2026-11-05T00:00:00Z', '']) {
      const error = domainErrorOf(() => parseIsoCalendarDate(bad, 'birthDate'));
      expect(error.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(error.field).toBe('birthDate');
    }
    expect(parseIsoCalendarDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('[REQ-PET-002] la diferencia en días cruza años bisiestos y cambia de signo', () => {
    expect(diffInCalendarDays('2026-11-05', '2022-05-10')).toBe(1640);
    expect(diffInCalendarDays('2022-05-10', '2026-11-05')).toBe(-1640);
    expect(diffInCalendarDays('2000-03-01', '2000-02-28')).toBe(2);
    expect(diffInCalendarDays('1900-03-01', '1900-02-28')).toBe(1);
    expect(diffInCalendarDays('1970-01-01', '1970-01-01')).toBe(0);
  });
});

describe('TASK-104: calendario gregoriano (src/domain/shared/date-utils.ts)', () => {
  it('[REQ-PET-002] aplica la regla gregoriana de bisiestos, incluidos los siglos', () => {
    expect([1900, 2000, 2023, 2024, 2100, 2400].map(isLeapYear)).toEqual([false, true, false, true, false, true]);
    expect(isIsoCalendarDate('1900-02-29')).toBe(false);
    expect(isIsoCalendarDate('2000-02-29')).toBe(true);
    expect(isIsoCalendarDate('2100-02-29')).toBe(false);
  });

  it('[REQ-PET-002] conoce los días de cada mes y rechaza un mes fuera de 1..12', () => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(months.map((m) => getDaysInMonth(2023, m))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    for (const bad of [0, 13, 1.5]) expect(() => getDaysInMonth(2024, bad)).toThrow(`Mes fuera de rango: ${bad}`);
  });

  it('[REQ-PET-002] valida el formato completo YYYY-MM-DD y los límites de mes y día', () => {
    for (const ok of ['2026-01-01', '2026-12-31', '2026-04-30', '0001-01-01']) expect(isIsoCalendarDate(ok)).toBe(true);
    for (const bad of [' 2026-11-05', '2026-11-05 ', 'x2026-11-05', '2026-11-05x', '2026-11-00', '2026-04-31', '2026-13-01', '2026-00-01', '20261-01-01']) {
      expect(isIsoCalendarDate(bad)).toBe(false);
    }
  });

  it('[REQ-PET-002] parseIsoCalendarDate usa "date" como campo por defecto y explica el error', () => {
    const error = domainErrorOf(() => parseIsoCalendarDate('2026-02-30'));
    expect(error.field).toBe('date');
    expect(error.detail).toBe('El campo date (2026-02-30) no es una fecha ISO-8601 YYYY-MM-DD válida.');
  });

  it('[REQ-PET-002] toEpochDays cuenta días desde 1970-01-01, también antes de 1970 y en marzo', () => {
    expect(toEpochDays('1970-01-01')).toBe(0);
    expect(toEpochDays('1969-12-31')).toBe(-1);
    expect(toEpochDays('2000-03-01')).toBe(11017);
    expect(toEpochDays('2026-11-05')).toBe(20762);
    expect(toEpochDays('1600-02-29')).toBe(-135081);
  });

  it('[REQ-PET-002] monthlyAnniversary cruza años y ajusta al último día del mes', () => {
    expect(monthlyAnniversary({ year: 2024, month: 11, day: 30 }, 3)).toEqual({ year: 2025, month: 2, day: 28 });
    expect(monthlyAnniversary({ year: 2024, month: 1, day: 31 }, 25)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(monthlyAnniversary({ year: 2024, month: 12, day: 15 }, 12)).toEqual({ year: 2025, month: 12, day: 15 });
    expect(monthlyAnniversary({ year: 2024, month: 2, day: 29 }, 0)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('[INV-PET-002][ERR-PET-FUTURE-BIRTHDATE] nombra el campo inválido y detalla la fecha futura', () => {
    expect(domainErrorOf(() => validateBirthDateNotFuture('2026-02-30', '2026-11-05')).field).toBe('birthDate');
    expect(domainErrorOf(() => validateBirthDateNotFuture('2026-01-01', '2026-11-31')).field).toBe('currentDate');
    expect(domainErrorOf(() => validateBirthDateNotFuture('2026-11-06', '2026-11-05')).detail).toBe(
      'La fecha de nacimiento (2026-11-06) no puede ser posterior a la fecha actual (2026-11-05).',
    );
    expect(validateBirthDateNotFuture('2024-02-29', '2026-11-05')).toEqual({
      birth: { year: 2024, month: 2, day: 29 },
      current: { year: 2026, month: 11, day: 5 },
    });
  });
});

describe('TASK-104: ventana temporal de eventos (src/domain/shared/date-utils.ts)', () => {
  it('[INV-REC-001][ERR-REC-DATE-BEFORE-BIRTH] rechaza un evento anterior al nacimiento (EDGE-004)', () => {
    const error = domainErrorOf(() => validateEventDateWindow('2023-12-01', '2024-02-14', '2026-11-05', 'recordedAt'));
    expect(error.code).toBe('ERR-REC-DATE-BEFORE-BIRTH');
    expect(error.status).toBe(422);
    expect(error.invariantRef).toBe('INV-REC-001');
    expect(error.field).toBe('recordedAt');
  });

  it('[INV-REC-001][ERR-REC-FUTURE-EVENT-DATE] rechaza un evento posterior a ClockPort.todayIsoDate()', () => {
    const today = new FixedClockAdapter().todayIsoDate();
    const error = domainErrorOf(() => validateEventDateWindow('2026-11-06', '2022-05-10', today, 'appliedAt'));
    expect(error.code).toBe('ERR-REC-FUTURE-EVENT-DATE');
    expect(error.status).toBe(422);
    expect(error.invariantRef).toBe('INV-REC-001');
    expect(error.field).toBe('appliedAt');
  });

  it('[INV-REC-001] valida el formato de las tres fechas, con recordedAt como campo por defecto, y detalla el error', () => {
    expect(domainErrorOf(() => validateEventDateWindow('2026-02-30', '2022-05-10', '2026-11-05')).field).toBe('recordedAt');
    expect(domainErrorOf(() => validateEventDateWindow('2026-02-30', '2022-05-10', '2026-11-05', 'visitDate')).field).toBe('visitDate');
    expect(domainErrorOf(() => validateEventDateWindow('2026-01-01', '2022-02-30', '2026-11-05')).field).toBe('birthDate');
    expect(domainErrorOf(() => validateEventDateWindow('2026-01-01', '2022-05-10', '2026-11-31')).field).toBe('currentDate');
    expect(domainErrorOf(() => validateEventDateWindow('2023-12-01', '2024-02-14', '2026-11-05')).detail).toBe(
      'La fecha del evento (2023-12-01) es anterior a la fecha de nacimiento de la mascota (2024-02-14).',
    );
    expect(domainErrorOf(() => validateEventDateWindow('2026-11-06', '2024-02-14', '2026-11-05')).detail).toBe(
      'La fecha del evento (2026-11-06) no puede ser posterior a la fecha actual (2026-11-05).',
    );
  });

  it('[INV-REC-001] acepta eventos exactamente en el nacimiento y exactamente hoy', () => {
    expect(validateEventDateWindow('2022-05-10', '2022-05-10', '2026-11-05')).toBeUndefined();
    expect(validateEventDateWindow('2026-11-05', '2022-05-10', '2026-11-05')).toBeUndefined();
  });
});

describe('TASK-104: orden de historiales (src/domain/sorting/deterministic-sorter.ts)', () => {
  it('[INV-SORT-001] ordena por fecha de evento DESC, createdAt DESC e id ASC sin modificar la entrada', () => {
    const unsorted = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', recordedAt: '2026-10-15', createdAt: '2026-10-15T10:00:00.000Z' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordedAt: '2026-10-15', createdAt: '2026-10-15T10:00:00.000Z' },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', recordedAt: '2026-10-15', createdAt: '2026-10-15T12:00:00.000Z' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', recordedAt: '2026-11-01', createdAt: '2026-11-01T08:00:00.000Z' },
    ];
    const sorted = sortHistoricalRecords(unsorted);
    expect(sorted.map((r) => r.id[0])).toEqual(['d', 'c', 'a', 'b']);
    expect(unsorted.map((r) => r.id[0])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('[INV-SORT-001] usa recordedAt, appliedAt o visitDate como fecha de evento, antes que createdAt', () => {
    expect(getRecordEventDate({ recordedAt: '2026-01-01' })).toBe('2026-01-01');
    expect(getRecordEventDate({ appliedAt: '2026-02-01' })).toBe('2026-02-01');
    expect(getRecordEventDate({ visitDate: '2026-03-01' })).toBe('2026-03-01');
    const sorted = sortHistoricalRecords([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', appliedAt: '2026-01-01', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', visitDate: '2026-06-01', createdAt: '2026-02-01T00:00:00.000Z' },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', recordedAt: '2026-03-01', createdAt: '2026-08-01T00:00:00.000Z' },
    ]);
    expect(sorted.map((r) => r.id[0])).toEqual(['b', 'c', 'a']);
  });

  it('[INV-SORT-001] reconoce el UTC canónico completo, con horas, minutos y segundos en rango', () => {
    for (const ok of ['2026-10-15T00:00:00.000Z', '2026-10-15T19:59:59.999Z', '2026-10-15T23:00:00.000Z', '2024-02-29T12:00:00.000Z']) {
      expect(isCanonicalUtcTimestamp(ok)).toBe(true);
    }
    for (const bad of ['x2026-10-15T10:00:00.000Z', '2026-10-15T10:00:00.000Zx', '2026-10-15T10:60:00.000Z', '2026-10-15T10:00:60.000Z', '2026-10-15T10:00:00.00Z', '2025-02-29T10:00:00.000Z']) {
      expect(isCanonicalUtcTimestamp(bad)).toBe(false);
    }
    expect(domainErrorOf(() => sortPetsForListing([{ id: 'a', name: 'A', createdAt: 'mal' }])).detail).toBe(
      'El campo createdAt (mal) no es un timestamp UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ.',
    );
  });

  it('[INV-SORT-001] rechaza createdAt que no sea UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ', () => {
    for (const bad of ['2026-10-15T10:00:00Z', '2026-10-15T10:00:00.000+00:00', '2026-02-30T10:00:00.000Z', '2026-10-15T24:00:00.000Z', '2026-10-15']) {
      const error = domainErrorOf(() =>
        sortHistoricalRecords([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordedAt: '2026-10-15', createdAt: bad }]),
      );
      expect(error.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(error.field).toBe('createdAt');
    }
  });
});

describe('TASK-104: listado de mascotas (src/domain/sorting/deterministic-sorter.ts)', () => {
  const pet = (id: string, name: string, createdAt = '2026-01-01T00:00:00.000Z') => ({
    id: `${id.repeat(8)}-${id.repeat(4)}-4${id.repeat(3)}-8${id.repeat(3)}-${id.repeat(12)}`,
    name,
    createdAt,
  });

  it('[REQ-PET-005] ordena por name con localeCompare es (ñ después de n) y sin distinguir mayúsculas ni tildes', () => {
    const pets = [
      pet('1', 'Zeus'),
      pet('2', 'Ñandú'),
      pet('3', 'Nzuri'),
      pet('4', 'óscar'),
      pet('5', 'Bruno'),
      pet('6', 'agata', '2026-03-01T00:00:00.000Z'),
      pet('7', 'Ágata', '2026-02-01T00:00:00.000Z'),
    ];
    expect(sortPetsForListing(pets).map((p) => p.name)).toEqual(['Ágata', 'agata', 'Bruno', 'Nzuri', 'Ñandú', 'óscar', 'Zeus']);
    expect(pets[0]?.name).toBe('Zeus');
  });

  it('[REQ-PET-005] desempata nombres iguales por createdAt ASC y luego id ASC', () => {
    const pets = [
      pet('c', 'Luna', '2026-05-01T00:00:00.000Z'),
      pet('b', 'luna', '2026-04-01T00:00:00.000Z'),
      pet('a', 'LUNA', '2026-05-01T00:00:00.000Z'),
    ];
    expect(sortPetsForListing(pets).map((p) => p.id[0])).toEqual(['b', 'a', 'c']);
  });

  it('[REQ-PET-005][INV-SORT-001] rechaza una mascota con createdAt no canónico', () => {
    const error = domainErrorOf(() => sortPetsForListing([pet('a', 'Luna', '2026-05-01 00:00:00')]));
    expect(error.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('[REQ-PET-005] el filtro q no distingue mayúsculas ni tildes (NFD sin \\p{M}) y species es exacta', () => {
    expect(normalizeForSearch('Ñandú ÁGATA')).toBe('nandu agata');
    expect(matchesPetListFilter({ name: 'Ñandú', species: 'DOG' }, { q: 'NANDU' })).toBe(true);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' }, { q: 'gát' })).toBe(true);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' }, { q: 'bruno' })).toBe(false);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' }, { species: 'DOG' })).toBe(false);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' }, { q: 'aga', species: 'CAT' })).toBe(true);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' }, { q: '   ' })).toBe(true);
    expect(matchesPetListFilter({ name: 'Ágata', species: 'CAT' })).toBe(true);
  });
});

describe('TASK-104: adaptadores deterministas (src/infrastructure/adapters/)', () => {
  it('[INV-ARCH-001] FixedClockAdapter devuelve la fecha y el timestamp fijados y cambia solo con setClock', () => {
    const clock = new FixedClockAdapter();
    expect([clock.todayIsoDate(), clock.nowIsoTimestamp()]).toEqual(['2026-11-05', '2026-11-05T12:00:00.000Z']);
    clock.setClock('2024-02-29', '2024-02-29T23:59:59.999Z');
    expect([clock.todayIsoDate(), clock.nowIsoTimestamp()]).toEqual(['2024-02-29', '2024-02-29T23:59:59.999Z']);
  });

  it('[INV-ARCH-001] FixedClockAdapter rechaza una fecha inexistente o un timestamp no canónico', () => {
    expect(() => new FixedClockAdapter('2025-02-29')).toThrow(/todayIsoDate no es YYYY-MM-DD válido/);
    expect(() => new FixedClockAdapter('2026-11-05', '2026-11-05T12:00:00Z')).toThrow(/nowIsoTimestamp no es UTC canónico/);
    const clock = new FixedClockAdapter();
    expect(() => clock.setClock('2026-11-31', '2026-11-05T12:00:00.000Z')).toThrow(/todayIsoDate no es YYYY-MM-DD válido/);
    expect(clock.todayIsoDate()).toBe('2026-11-05');
  });

  it('[INV-ARCH-002] DeterministicIdAdapter entrega la secuencia y luego UUID v4 deterministas', () => {
    const ids = new DeterministicIdAdapter(['11111111-1111-4111-8111-111111111101']);
    expect([ids.nextId(), ids.nextId(), ids.nextId()]).toEqual([
      '11111111-1111-4111-8111-111111111101',
      '99999999-9999-4999-8999-000000000002',
      '99999999-9999-4999-8999-000000000003',
    ]);
    expect(new DeterministicIdAdapter().nextId()).toBe('99999999-9999-4999-8999-000000000001');
    expect(() => new DeterministicIdAdapter(['no-es-uuid'])).toThrow(/no es UUID v4: no-es-uuid/);
  });
});
