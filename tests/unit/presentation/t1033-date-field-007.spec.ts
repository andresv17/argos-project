/**
 * T1033 (007, Bloque A, [GH:#11]): `DateField` (tres segmentos numéricos que emiten ISO) y su uso desde `TextField type="date"`. Sin jsdom (OBS-3 de T923): marcado con
 * `renderToStaticMarkup` e inspección de la fuente para el foco; el comportamiento con teclado real lo cubre el E2E de T1035.
 * REQ-FEC7-001, REQ-FEC7-004, REQ-FEC7-005; SC-007-004.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DateField } from '../../../src/presentation/web/components/DateField.tsx';
import { TextField } from '../../../src/presentation/web/components/Field.tsx';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { RECORD_MODULES } from '../../../src/presentation/web/records.ts';

const noop = (): void => undefined;
const FIELD_SOURCE = readFileSync('src/presentation/web/components/Field.tsx', 'utf8');
const DATE_SOURCE = readFileSync('src/presentation/web/components/DateField.tsx', 'utf8');
const field = (value: string, errors: Record<string, string> = {}, required = true): string =>
  renderToStaticMarkup(h(DateField, { id: 'weights-recordedAt', label: 'Fecha', name: 'recordedAt', value, onChange: noop, errors, required }));
const inputs = (markup: string): string[] => markup.match(/<input\b[^>]*>/g) ?? [];

describe('T1033 DateField: estructura accesible (REQ-FEC7-001, REQ-FEC7-004)', () => {
  it('[SC-007-004] es un fieldset con la leyenda visible del campo y conserva el id del campo en el fieldset', () => {
    const markup = field('');
    expect(markup).toMatch(/^<fieldset id="weights-recordedAt"/);
    expect(markup).toMatch(/<legend[^>]*>Fecha/);
    expect(markup).toContain('</fieldset>');
  });

  it('[SC-007-004] tres segmentos Día, Mes, Año, cada uno con aria-label e inputMode numérico', () => {
    const found = inputs(field(''));
    expect(found).toHaveLength(3);
    expect(found.map((tag) => /aria-label="([^"]*)"/.exec(tag)?.[1])).toEqual(['Día', 'Mes', 'Año']);
    for (const tag of found) {
      expect(tag).toContain('inputMode="numeric"');
      expect(tag).toContain('autoComplete="off"');
    }
  });

  it('[REQ-FEC7-001] ningún segmento es un input type="date" y ninguno fuerza el teclado de texto', () => {
    for (const tag of inputs(field('2026-11-19'))) expect(tag).not.toContain('type="date"');
  });

  it('[REQ-FEC7-001] muestra los segmentos del valor ISO recibido y vacíos si no hay valor', () => {
    expect(inputs(field('2026-11-19')).map((tag) => /value="([^"]*)"/.exec(tag)?.[1])).toEqual(['19', '11', '2026']);
    expect(inputs(field('')).map((tag) => /value="([^"]*)"/.exec(tag)?.[1])).toEqual(['', '', '']);
  });

  it('[REQ-FEC7-004] longitud máxima 2, 2 y 4 por segmento', () => {
    expect(inputs(field('')).map((tag) => /maxLength="(\d)"/.exec(tag)?.[1])).toEqual(['2', '2', '4']);
  });

  it('[REQ-FEC7-004] objetivo táctil mínimo 44 px (min-h-12 = 48 px) y foco visible en cada segmento', () => {
    for (const tag of inputs(field(''))) {
      expect(tag).toContain('min-h-12');
      expect(tag).toContain('focus-visible:ring-2');
    }
  });

  it('[REQ-FEC7-004] el campo obligatorio marca el asterisco decorativo; el opcional no', () => {
    expect(field('', {}, true)).toContain('<span aria-hidden="true"> *</span>');
    expect(field('', {}, false)).not.toContain('aria-hidden="true"> *');
  });

  it('[REQ-FEC7-004] el error del campo se asocia a cada segmento con aria-describedby y aria-invalid, y se muestra una vez', () => {
    const markup = field('', { recordedAt: 'La fecha no es válida' });
    expect(markup.match(/La fecha no es válida/g)).toHaveLength(1);
    expect(markup).toContain('id="weights-recordedAt-error"');
    for (const tag of inputs(markup)) {
      expect(tag).toContain('aria-describedby="weights-recordedAt-error"');
      expect(tag).toContain('aria-invalid="true"');
    }
  });

  it('[REQ-FEC7-004] sin error no hay aria-invalid ni aria-describedby', () => {
    for (const tag of inputs(field(''))) expect(tag).not.toMatch(/aria-invalid|aria-describedby/);
  });
});

describe('T1033 DateField: foco y portapapeles (REQ-FEC7-002, REQ-FEC7-003, EDGE-007-001)', () => {
  it('[REQ-FEC7-002] delega el avance y el retroceso en las funciones puras de date-segments y no importa dependencias externas', () => {
    expect(DATE_SOURCE).toContain("from '../date-segments.ts'");
    expect(DATE_SOURCE).toContain('applySegmentEdit');
    expect(DATE_SOURCE).toContain('parseDateText');
    expect(DATE_SOURCE.match(/^import .* from '([^']+)'/gm)?.every((line) => /from '(react|\.\.?\/)/.test(line))).toBe(true);
  });

  it('[REQ-FEC7-003] Backspace se resuelve en keydown (M7-12) y solo se impide la acción por defecto cuando la función pura lo consume', () => {
    expect(DATE_SOURCE).toMatch(/onKeyDown/);
    expect(DATE_SOURCE).toMatch(/'Backspace'/);
    expect(DATE_SOURCE).toMatch(/consumed/);
    expect(DATE_SOURCE).not.toMatch(/beforeinput/i);
  });

  it('[EDGE-007-001] el pegado reparte los segmentos con onPaste', () => {
    expect(DATE_SOURCE).toMatch(/onPaste/);
    expect(DATE_SOURCE).toMatch(/clipboardData/);
  });

  it('[REQ-FEC7-002] al enfocar un segmento se selecciona su contenido, de modo que escribir sobre un segmento lleno lo reemplaza (hallazgo del E2E de T1035)', () => {
    expect(DATE_SOURCE).toMatch(/onFocus=\{\(e\) => e\.currentTarget\.select\(\)\}/);
  });

  it('[REQ-FEC7-002] el clic sobre un segmento no deshace la selección del foco (mouseup), para que escribir reemplace el contenido (hallazgo del E2E de T1035)', () => {
    expect(DATE_SOURCE).toMatch(/onMouseDown/);
    expect(DATE_SOURCE).toMatch(/onMouseUp/);
    expect(DATE_SOURCE).toMatch(/preventDefault/);
  });

  it('[REQ-FEC7-001] emite ISO o vacío por onChange(name, valor)', () => {
    expect(DATE_SOURCE).toMatch(/onChange\(name, /);
  });
});

describe('T1033 integración con Field.tsx, RecordForm y PetForm (REQ-FEC7-001, REQ-FEC7-005)', () => {
  it('[REQ-FEC7-005] TextField con type="date" delega en DateField (fieldset) y ya no renderiza <input type="date">', () => {
    const markup = renderToStaticMarkup(h(TextField, { id: 'x-birthDate', label: 'Fecha de nacimiento', name: 'birthDate', type: 'date', required: true, value: '2020-05-01', onChange: noop, errors: {} }));
    expect(markup).toContain('<fieldset id="x-birthDate"');
    expect(markup).not.toContain('type="date"');
    expect(FIELD_SOURCE).toContain("from './DateField.tsx'");
  });

  it('[REQ-FEC7-001] los módulos con fechas de RecordForm usan segmentos: Peso muestra el fieldset «Fecha» y ningún type="date"', () => {
    const weights = RECORD_MODULES.find((m) => m.id === 'weights')!;
    const markup = renderToStaticMarkup(h(RecordForm, { spec: weights, onSubmit: async () => undefined }));
    expect(markup).toContain('<fieldset id="weights-recordedAt"');
    expect(markup).not.toContain('type="date"');
    expect(markup.match(/aria-label="Día"/g)).toHaveLength(1);
  });

  it('[REQ-FEC7-005] sin dependencias nuevas: package.json no menciona librerías de fecha o máscara', () => {
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(/react-datepicker|date-fns|dayjs|moment|imask|react-input-mask|cleave/i);
  });
});
