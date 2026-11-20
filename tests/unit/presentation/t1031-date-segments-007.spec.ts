/**
 * T1031 (007, Bloque A, [GH:#11]): funciones puras de `date-segments` (sin DOM). `applySegmentEdit` (entrada tecleada, avance y retroceso) y `parseDateText`
 * (ISO o `DD/MM/AAAA` a segmentos). REQ-FEC7-002, REQ-FEC7-003, REQ-FEC7-005; EDGE-007-001; SC-007-001, SC-007-002, SC-007-003, SC-007-004.
 */
import { describe, expect, it } from 'vitest';
import { applySegmentEdit, parseDateText, type DateSegments } from '../../../src/presentation/web/date-segments.ts';

const seg = (day = '', month = '', year = ''): DateSegments => ({ day, month, year });
const typed = (segments: DateSegments, segment: 'day' | 'month' | 'year', value: string, deleting = false) => applySegmentEdit(segments, segment, { kind: 'input', value, deleting });
const backspace = (segments: DateSegments, segment: 'day' | 'month' | 'year') => applySegmentEdit(segments, segment, { kind: 'backspace' });

describe('T1031 avance al teclear (REQ-FEC7-002)', () => {
  it('[SC-007-001] el segundo dígito del día lleva el foco a Mes', () => {
    const result = typed(seg(), 'day', '15');
    expect(result.segments).toEqual(seg('15'));
    expect(result.focus).toBe('month');
  });

  it('[SC-007-002] un primer dígito de día 4..9 se completa con cero y avanza; 1, 2 y 3 se quedan en Día', () => {
    for (const digit of ['4', '5', '6', '7', '8', '9']) {
      const result = typed(seg(), 'day', digit);
      expect(result.segments.day).toBe(`0${digit}`);
      expect(result.focus).toBe('month');
    }
    for (const digit of ['0', '1', '2', '3']) {
      const result = typed(seg(), 'day', digit);
      expect(result.segments.day).toBe(digit);
      expect(result.focus).toBeNull();
    }
  });

  it('[SC-007-001] el segundo dígito del mes lleva el foco a Año', () => {
    const result = typed(seg('15'), 'month', '11');
    expect(result.segments).toEqual(seg('15', '11'));
    expect(result.focus).toBe('year');
  });

  it('[SC-007-002] un primer dígito de mes 2..9 se completa con cero y avanza; 0 y 1 se quedan en Mes', () => {
    for (const digit of ['2', '3', '4', '5', '6', '7', '8', '9']) {
      const result = typed(seg('15'), 'month', digit);
      expect(result.segments.month).toBe(`0${digit}`);
      expect(result.focus).toBe('year');
    }
    for (const digit of ['0', '1']) {
      const result = typed(seg('15'), 'month', digit);
      expect(result.segments.month).toBe(digit);
      expect(result.focus).toBeNull();
    }
  });

  it('[REQ-FEC7-002] el año no avanza (último segmento) y se limita a 4 dígitos', () => {
    expect(typed(seg('15', '11'), 'year', '2').focus).toBeNull();
    expect(typed(seg('15', '11'), 'year', '2026').focus).toBeNull();
    expect(typed(seg('15', '11'), 'year', '20261').segments.year).toBe('2026');
  });

  it('[REQ-FEC7-002] solo se aceptan dígitos: cualquier otro carácter se descarta', () => {
    expect(typed(seg(), 'day', 'a1b5').segments.day).toBe('15');
    const onlyLetters = typed(seg(), 'day', 'ab');
    expect(onlyLetters.segments.day).toBe('');
    expect(onlyLetters.focus).toBeNull();
    expect(typed(seg(), 'year', '2o26').segments.year).toBe('226');
  });

  it('[REQ-FEC7-002] un tercer dígito en un segmento lleno se recorta al máximo del segmento', () => {
    expect(typed(seg(), 'day', '153').segments.day).toBe('15');
    expect(typed(seg('15'), 'month', '123').segments.month).toBe('12');
  });

  it('[REQ-FEC7-003] al borrar con el teclado (deleting) no se completa con cero ni se mueve el foco', () => {
    const deleted = typed(seg('05'), 'day', '5', true);
    expect(deleted.segments.day).toBe('5');
    expect(deleted.focus).toBeNull();
    expect(typed(seg('15', '05'), 'month', '0', true)).toMatchObject({ segments: seg('15', '0'), focus: null });
  });
});

describe('T1031 retroceso fluido (REQ-FEC7-003)', () => {
  it('[SC-007-003] Backspace en Mes vacío lleva el foco a Día y borra un dígito', () => {
    const result = backspace(seg('15', ''), 'month');
    expect(result).toMatchObject({ segments: seg('1'), focus: 'day', consumed: true });
  });

  it('[SC-007-003] Backspace en Año vacío lleva el foco a Mes y borra un dígito', () => {
    expect(backspace(seg('15', '11', ''), 'year')).toMatchObject({ segments: seg('15', '1'), focus: 'month', consumed: true });
  });

  it('[REQ-FEC7-003] con el segmento no vacío no se consume: el navegador borra un dígito y el foco no se mueve', () => {
    const result = backspace(seg('15', '1'), 'month');
    expect(result).toMatchObject({ segments: seg('15', '1'), focus: null, consumed: false });
  });

  it('[REQ-FEC7-003] el primer segmento no retrocede', () => {
    expect(backspace(seg(), 'day')).toMatchObject({ segments: seg(), focus: null, consumed: false });
  });

  it('[REQ-FEC7-003] si el segmento anterior también está vacío, el foco retrocede sin borrar nada', () => {
    expect(backspace(seg('', ''), 'month')).toMatchObject({ segments: seg(), focus: 'day', consumed: true });
    expect(backspace(seg('15', '', ''), 'year')).toMatchObject({ segments: seg('15'), focus: 'month', consumed: true });
  });

  it('[REQ-FEC7-003] borrar el único dígito del segmento anterior lo deja vacío', () => {
    expect(backspace(seg('1', ''), 'month')).toMatchObject({ segments: seg(), focus: 'day', consumed: true });
  });
});

describe('T1031 valor ISO emitido (REQ-FEC7-001, SC-007-004)', () => {
  it('[SC-007-004] con los tres segmentos completos emite YYYY-MM-DD', () => {
    expect(typed(seg('19', '11'), 'year', '2026').iso).toBe('2026-11-19');
  });

  it('[SC-007-004] con cualquier segmento incompleto emite cadena vacía', () => {
    expect(typed(seg('19', '11'), 'year', '202').iso).toBe('');
    expect(typed(seg('19', ''), 'year', '2026').iso).toBe('');
    expect(typed(seg('', '11', '2026'), 'day', '1').iso).toBe('');
  });

  it('[EDGE-007-001] 29 de febrero, mes 13 y día 00 no se validan aquí: se emiten tal cual y valida el esquema', () => {
    expect(typed(seg('29', '02'), 'year', '2025').iso).toBe('2025-02-29');
    expect(typed(seg('19', '13'), 'year', '2026').iso).toBe('2026-13-19');
    expect(typed(seg('00', '11'), 'year', '2026').iso).toBe('2026-11-00');
  });

  it('[EDGE-007-001] el avance por 2 dígitos no depende de la validez: mes 13 avanza igual', () => {
    expect(typed(seg('19'), 'month', '13').focus).toBe('year');
  });
});

describe('T1031 análisis de texto pegado (REQ-FEC7-005, EDGE-007-001)', () => {
  it('[EDGE-007-001] ISO YYYY-MM-DD reparte los segmentos', () => {
    expect(parseDateText('2026-11-19')).toEqual({ segments: seg('19', '11', '2026'), iso: '2026-11-19' });
  });

  it('[EDGE-007-001] DD/MM/AAAA reparte los segmentos', () => {
    expect(parseDateText('19/11/2026')).toEqual({ segments: seg('19', '11', '2026'), iso: '2026-11-19' });
  });

  it('[EDGE-007-001] D/M/AAAA de un dígito se rellena con cero y se ignoran los espacios alrededor', () => {
    expect(parseDateText(' 5/3/2026 ')).toEqual({ segments: seg('05', '03', '2026'), iso: '2026-03-05' });
  });

  it('[REQ-FEC7-005] la cadena vacía da segmentos vacíos (valor inicial sin fecha)', () => {
    expect(parseDateText('')).toEqual({ segments: seg(), iso: '' });
  });

  it('[REQ-FEC7-005] texto que no es fecha (dígitos sueltos, otros separadores, ISO con hora) devuelve null', () => {
    for (const text of ['15', '19-11-2026', '2026/11/19', '2026-11-19T00:00:00Z', 'hola', '19/11/26', '1/1/20260']) {
      expect(parseDateText(text)).toBeNull();
    }
  });

  it('[EDGE-007-001] no valida el calendario: 31/02/2026 se reparte y valida el esquema', () => {
    expect(parseDateText('31/02/2026')).toEqual({ segments: seg('31', '02', '2026'), iso: '2026-02-31' });
  });
});
