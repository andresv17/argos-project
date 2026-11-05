import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  calculatePetAge,
  diffInCalendarDays,
  validateBirthDateNotFuture,
  validateEventDateWindow,
} from '../../src/domain/shared/date-utils.ts';
import { sortHistoricalRecords } from '../../src/domain/sorting/deterministic-sorter.ts';

const FIXED_TODAY = '2026-11-05';

describe('Domain: Date Arithmetic, Age Calculation & Deterministic Sorting [REQ-PET-002, INV-PET-002, INV-REC-001, INV-SORT-001]', () => {
  it('[REQ-PET-002][INV-ARCH-001] calcula la edad exacta en años, meses y días totales para las 4 mascotas canónicas en 2026-11-05', () => {
    // Argos: 2022-05-10 -> 2026-11-05 (4 años, 5 meses, 1640 días)
    const argosAge = calculatePetAge('2022-05-10', FIXED_TODAY);
    expect(argosAge).toEqual({
      years: 4,
      months: 5,
      totalDays: 1640,
    });

    // Nyx: 2021-11-05 -> 2026-11-05 (exactamente 5 años, 0 meses, 1826 días incluyendo bisiesto 2024)
    const nyxAge = calculatePetAge('2021-11-05', FIXED_TODAY);
    expect(nyxAge).toEqual({
      years: 5,
      months: 0,
      totalDays: 1826,
    });

    // Mascota nacida el mismo día actual
    const newbornAge = calculatePetAge(FIXED_TODAY, FIXED_TODAY);
    expect(newbornAge).toEqual({
      years: 0,
      months: 0,
      totalDays: 0,
    });
  });

  it('[INV-PET-002][ERR-PET-FUTURE-BIRTHDATE] rechaza fecha de nacimiento futura respecto a ClockPort.todayIsoDate()', () => {
    let caughtError: DomainError | null = null;
    try {
      validateBirthDateNotFuture('2026-11-06', FIXED_TODAY);
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }
    expect(caughtError?.code).toBe('ERR-PET-FUTURE-BIRTHDATE');
    expect(caughtError?.status).toBe(422);
    expect(caughtError?.invariantRef).toBe('INV-PET-002');
  });

  it('[INV-REC-001][ERR-REC-DATE-BEFORE-BIRTH] rechaza fecha de evento clínico anterior a la fecha de nacimiento de la mascota (EDGE-004)', () => {
    let caughtError: DomainError | null = null;
    try {
      validateEventDateWindow('2023-12-01', '2024-02-14', FIXED_TODAY, 'recordedAt');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }
    expect(caughtError?.code).toBe('ERR-REC-DATE-BEFORE-BIRTH');
    expect(caughtError?.status).toBe(422);
    expect(caughtError?.invariantRef).toBe('INV-REC-001');
  });

  it('[INV-REC-001][ERR-REC-FUTURE-EVENT-DATE] rechaza fecha de evento clínico ocurrida en el futuro respecto a ClockPort.todayIsoDate()', () => {
    let caughtError: DomainError | null = null;
    try {
      validateEventDateWindow('2026-11-06', '2022-05-10', FIXED_TODAY, 'appliedAt');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }
    expect(caughtError?.code).toBe('ERR-REC-FUTURE-EVENT-DATE');
    expect(caughtError?.status).toBe(422);
    expect(caughtError?.invariantRef).toBe('INV-REC-001');
  });

  it('[INV-REC-001] acepta eventos exactamente en la fecha de nacimiento y exactamente en la fecha actual', () => {
    validateEventDateWindow('2022-05-10', '2022-05-10', FIXED_TODAY);
    validateEventDateWindow(FIXED_TODAY, '2022-05-10', FIXED_TODAY);
    expect(diffInCalendarDays(FIXED_TODAY, '2022-05-10')).toBe(1640);
  });

  it('[INV-SORT-001] ordena registros por fecha de evento DESC, desempatando por createdAt DESC y finalmente por id ASC', () => {
    const unsorted = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        recordedAt: '2026-10-15',
        createdAt: '2026-10-15T10:00:00.000Z',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordedAt: '2026-10-15',
        createdAt: '2026-10-15T10:00:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        recordedAt: '2026-10-15',
        createdAt: '2026-10-15T12:00:00.000Z',
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        recordedAt: '2026-11-01',
        createdAt: '2026-11-01T08:00:00.000Z',
      },
    ];

    const sorted = sortHistoricalRecords(unsorted);
    expect(sorted.map((r) => r.id)).toEqual([
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    // Verifica inmutabilidad del arreglo original
    expect(unsorted[0]?.id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });
});
