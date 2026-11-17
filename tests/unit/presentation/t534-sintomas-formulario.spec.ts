/**
 * T534 [US2] síntomas, lado presentación (SC-CAT-010, SC-CAT-011, SC-CAT-034; REQ-SIN-001, REQ-SIN-003, INV-SIN-002; D-17 A):
 * rótulos, «Vómito» oculto con aviso en RABBIT y SMALL_MAMMAL, ayuda de nivel, `title` sincronizado, leyenda fija en formulario, listado y
 * exportación, palabras prohibidas y búsqueda estática de `severity` en clases, estilos, orden y texto condicional de src/presentation/.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { ExportSection } from '../../../src/presentation/web/pages/BackupPage.tsx';
import { RECORD_MODULES } from '../../../src/presentation/web/records.ts';
import {
  NO_VOMIT_NOTICE,
  SYMPTOM_DISCLAIMER,
  SYMPTOM_FOOTER,
  SYMPTOM_LEVEL_HELP,
  SYMPTOM_REFERRAL,
  SYMPTOM_TYPE_LABEL,
  symptomTypeOptions,
  syncSymptomTitle,
} from '../../../src/presentation/web/symptoms.ts';
import { dashboard } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const spec = RECORD_MODULES.find((m) => m.id === 'customParameters')!;
const form = (species: string, initial: Record<string, string> = { category: 'SYMPTOM' }): string =>
  html(h(RecordForm, { spec, species: species as never, initial, onSubmit: asyncNoop }));
const options = (markup: string, name: string): string[] => {
  const select = new RegExp(`<select[^>]*name="${name}"[^>]*>(.*?)</select>`, 's').exec(markup);
  if (!select) throw new Error(`no hay selector ${name}`);
  return [...select[1]!.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]!);
};
const text = (markup: string): string => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const FORBIDDEN = /\b(tratamiento|medicamento|medicamentos|dosis|dar|administrar)\b/i;

describe('T534 rótulos y catálogo (SC-CAT-010, D-17 A)', () => {
  it('«Tipo» ofrece exactamente 4 opciones con los rótulos de D-17 A', () => {
    expect(options(form('CANINE'), 'symptomType')).toEqual(['Vómito', 'Apetito disminuido', 'Heces (diarrea u otro cambio)', 'Energía disminuida']);
    expect(SYMPTOM_TYPE_LABEL).toEqual({ VOMIT: 'Vómito', APPETITE: 'Apetito disminuido', STOOL: 'Heces (diarrea u otro cambio)', ENERGY: 'Energía disminuida' });
  });

  it('«Intensidad» ofrece Leve, Moderado e Intenso (no «Grave»)', () => {
    const markup = form('FELINE');
    expect(options(markup, 'severity')).toEqual(['Leve', 'Moderado', 'Intenso']);
    expect(text(markup)).not.toContain('Grave');
  });

  it('la categoría «Síntoma» existe entre las categorías del formulario de parámetros', () => {
    const category = spec.fields.find((f) => f.name === 'category')!;
    expect(category.options?.map((o) => [o.value, o.label])).toContainEqual(['SYMPTOM', 'Síntoma']);
  });
});

describe('T534 «Vómito» oculto con aviso en RABBIT y SMALL_MAMMAL (SC-CAT-010, D-17 A; solo presentación)', () => {
  it('con RABBIT y SMALL_MAMMAL «Vómito» no se ofrece y aparece el aviso fijo en su lugar', () => {
    for (const species of ['RABBIT', 'SMALL_MAMMAL']) {
      const markup = form(species);
      expect(options(markup, 'symptomType')).toEqual(['Apetito disminuido', 'Heces (diarrea u otro cambio)', 'Energía disminuida']);
      expect(text(markup)).toContain('Los conejos y los pequeños mamíferos no vomitan: si notas regurgitación o malestar, consulta a tu veterinario.');
    }
    expect(NO_VOMIT_NOTICE).toBe('Los conejos y los pequeños mamíferos no vomitan: si notas regurgitación o malestar, consulta a tu veterinario.');
  });

  it('con las demás especies «Vómito» se ofrece y el aviso no aparece', () => {
    for (const species of ['CANINE', 'FELINE', 'FERRET', 'BIRD', 'REPTILE', 'OTHER']) {
      const markup = form(species);
      expect(options(markup, 'symptomType')[0]).toBe('Vómito');
      expect(text(markup)).not.toContain('no vomitan');
    }
    expect(symptomTypeOptions('RABBIT').map((o) => o.value)).toEqual(['APPETITE', 'STOOL', 'ENERGY']);
    expect(symptomTypeOptions('CANINE').map((o) => o.value)).toEqual(['VOMIT', 'APPETITE', 'STOOL', 'ENERGY']);
  });

  it('un registro VOMIT existente de un conejo se lista sin cambio', () => {
    const view = dashboard('OWNER');
    const record = { id: 'c1', petId: view.profile.id, recordedAt: '2026-02-01', category: 'SYMPTOM', title: 'Vómito', description: 'Regurgitó.', notes: null, createdAt: '2026-02-01T10:00:00.000Z', symptomType: 'VOMIT', severity: 'MILD' };
    const markup = html(h(PetDashboard, { dashboard: { ...view, profile: { ...view.profile, species: 'RABBIT' }, customParameters: [record] } as never, activeTab: 'customParameters', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect(text(markup)).toContain('Vómito');
  });
});

describe('T534 ayuda de nivel, texto de pie y placeholder (SC-CAT-010)', () => {
  it('bajo «Intensidad» se muestra la ayuda fija de los 3 niveles del tipo elegido y el texto de pie', () => {
    const markup = text(form('CANINE'));
    expect(SYMPTOM_LEVEL_HELP['VOMIT']).toEqual({ MILD: '1 episodio aislado y el animal se comporta normal', MODERATE: '2 a 3 episodios en el día', SEVERE: 'más de 3 episodios o repetidos durante varios días' });
    expect(SYMPTOM_LEVEL_HELP['APPETITE']).toEqual({ MILD: 'come algo menos', MODERATE: 'come aproximadamente la mitad', SEVERE: 'rechaza casi toda la comida' });
    expect(SYMPTOM_LEVEL_HELP['STOOL']).toEqual({ MILD: '1 deposición blanda', MODERATE: 'varias blandas o líquidas', SEVERE: 'líquidas y frecuentes durante el día' });
    expect(SYMPTOM_LEVEL_HELP['ENERGY']).toEqual({ MILD: 'algo más apagado pero responde', MODERATE: 'duerme o se mueve claramente menos', SEVERE: 'casi no se levanta ni responde a estímulos' });
    for (const line of Object.values(SYMPTOM_LEVEL_HELP['VOMIT']!)) expect(markup).toContain(line);
    expect(markup).not.toContain('come algo menos');
    expect(markup).toContain('Es tu observación; sirve para contarle al veterinario cómo evolucionó.');
    expect(SYMPTOM_FOOTER).toBe('Es tu observación; sirve para contarle al veterinario cómo evolucionó.');
  });

  it('la ayuda sigue al tipo (APPETITE) y es idéntica con cualquier intensidad elegida', () => {
    const mild = text(form('CANINE', { category: 'SYMPTOM', symptomType: 'APPETITE', severity: 'MILD' }));
    const severe = text(form('CANINE', { category: 'SYMPTOM', symptomType: 'APPETITE', severity: 'SEVERE' }));
    expect(mild).toContain('come algo menos');
    expect(mild.replace(/selected/g, '')).toBe(severe.replace(/selected/g, ''));
  });

  it('el placeholder de «Descripción» es «Qué observaste, cuándo y cuántas veces» y no sugiere medicación', () => {
    expect(form('CANINE')).toMatch(/<input[^>]*name="description"[^>]*placeholder="Qué observaste, cuándo y cuántas veces"/);
  });

  it('el título se precarga con el rótulo del tipo; con RABBIT, con el del primer tipo ofrecido', () => {
    expect(form('CANINE')).toMatch(/<input[^>]*name="title"[^>]*value="Vómito"/);
    expect(form('RABBIT')).toMatch(/<input[^>]*name="title"[^>]*value="Apetito disminuido"/);
  });

  it('sin la categoría Síntoma el formulario no muestra tipo, intensidad ni leyenda', () => {
    const markup = form('CANINE', { category: 'ALLERGY' });
    expect([markup.includes('name="symptomType"'), markup.includes('name="severity"'), text(markup).includes('no sustituye')]).toEqual([false, false, false]);
  });
});

describe('T534 `title` sincronizado al cambiar el tipo (SC-CAT-010)', () => {
  it('de VOMIT a STOOL con title «Vómito» pasa al rótulo nuevo; si la persona lo editó, se conserva', () => {
    expect(syncSymptomTitle('VOMIT', 'STOOL', 'Vómito')).toBe('Heces (diarrea u otro cambio)');
    expect(syncSymptomTitle('VOMIT', 'STOOL', 'Vómito de hoy')).toBe('Vómito de hoy');
    expect(syncSymptomTitle('STOOL', 'ENERGY', 'Heces (diarrea u otro cambio)')).toBe('Energía disminuida');
    expect(syncSymptomTitle('VOMIT', 'VOMIT', 'Vómito')).toBe('Vómito');
  });
});

describe('T534 aviso y derivación fijos en formulario, listado y exportación (SC-CAT-034, REQ-SIN-003)', () => {
  const disclaimer = 'Este registro no sustituye la consulta veterinaria';
  const referral = 'Si tu mascota empeora o tienes dudas, consulta a tu veterinario.';
  const list = (severity: string): string => {
    const view = dashboard('OWNER');
    const record = { id: 'c1', petId: view.profile.id, recordedAt: '2026-02-01', category: 'SYMPTOM', title: 'Vómito', description: 'dar 5 mg', notes: null, createdAt: '2026-02-01T10:00:00.000Z', symptomType: 'VOMIT', severity };
    return text(html(h(PetDashboard, { dashboard: { ...view, customParameters: [record] } as never, activeTab: 'customParameters', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop })));
  };

  it('el texto exacto vive en constantes y aparece en el formulario con las dos intensidades preseleccionadas', () => {
    expect([SYMPTOM_DISCLAIMER, SYMPTOM_REFERRAL]).toEqual([disclaimer, referral]);
    for (const severity of ['MILD', 'SEVERE']) {
      const markup = text(form('CANINE', { category: 'SYMPTOM', symptomType: 'VOMIT', severity }));
      expect([markup.includes(disclaimer), markup.includes(referral)]).toEqual([true, true]);
    }
  });

  it('el listado muestra el tipo, la intensidad como texto neutro y la leyenda, igual con MILD que con SEVERE', () => {
    const mild = list('MILD');
    const severe = list('SEVERE');
    for (const markup of [mild, severe]) expect([markup.includes(disclaimer), markup.includes(referral), markup.includes('Vómito')]).toEqual([true, true, true]);
    expect(mild).toContain('Leve');
    expect(severe).toContain('Intenso');
    expect(mild.replace('Leve', '#')).toBe(severe.replace('Intenso', '#'));
  });

  it('la sección de exportación muestra la misma leyenda', () => {
    const markup = text(html(h(ExportSection, { onDownload: noop })));
    expect([markup.includes(disclaimer), markup.includes(referral), markup.includes('Descargar respaldo')]).toEqual([true, true, true]);
  });

  it('el listado sin síntomas no muestra la leyenda', () => {
    const view = dashboard('OWNER');
    const markup = text(html(h(PetDashboard, { dashboard: { ...view, customParameters: [] } as never, activeTab: 'customParameters', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop })));
    expect(markup).not.toContain(disclaimer);
  });
});

describe('T534 sin las palabras de medicación en la interfaz de síntoma (SC-CAT-034)', () => {
  it('el formulario, la ayuda, los avisos y las constantes no contienen «tratamiento», «medicamento», «dosis», «dar» ni «administrar»', () => {
    const everything = [
      text(form('CANINE')),
      text(form('RABBIT')),
      ...Object.values(SYMPTOM_TYPE_LABEL),
      ...Object.values(SYMPTOM_LEVEL_HELP).flatMap((levels) => Object.values(levels)),
      SYMPTOM_FOOTER,
      SYMPTOM_DISCLAIMER,
      SYMPTOM_REFERRAL,
      NO_VOMIT_NOTICE,
    ].join(' ');
    expect(everything).not.toMatch(FORBIDDEN);
  });
});

describe('T534 búsqueda estática de severity y symptomType en src/presentation/ (SC-CAT-011, INV-SIN-002)', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') || f.endsWith('.tsx') ? [join(dir, f)] : []));
  const sources = files(join(process.cwd(), 'src/presentation')).map((file) => ({ file, lines: readFileSync(file, 'utf8').split('\n') }));
  /** Una referencia neutra solo busca un texto por clave (`TABLA[valor]`) o nombra el campo; nunca decide clases, estilos, orden, filtros ni textos. */
  const DECIDES = /className|style=|\.sort\(|\.filter\(|\.find\(|\.some\(|\.every\(|\.map\(\([^)]*\) =>[^;]*\?|&&|\|\||===|!==|\bif \(|\bswitch\b|\bcase\b|\? [^.]/;

  it('ninguna línea que use severity decide clases, estilos, color, ícono, orden, filtro o texto condicional', () => {
    const offenders = sources.flatMap(({ file, lines }) => lines.flatMap((line, i) => (/severity/i.test(line) && DECIDES.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])));
    expect(offenders).toEqual([]);
  });

  it('ninguna línea que use symptomType decide clases, estilos, orden o filtros', () => {
    const offenders = sources.flatMap(({ file, lines }) => lines.flatMap((line, i) => (/symptomType/.test(line) && /className|style=|\.sort\(|\.filter\(/.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])));
    expect(offenders).toEqual([]);
  });

  it('el listado se ordena solo por recordedAt: el módulo de síntomas no ordena', () => {
    const symptoms = sources.find((s) => s.file.endsWith('web/symptoms.ts'));
    expect(symptoms?.file.endsWith('symptoms.ts')).toBe(true);
    expect(symptoms?.lines.join('\n')).not.toMatch(/\.sort\(|\.toSorted\(/);
  });
});
