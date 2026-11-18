/**
 * Textos y reglas de presentación de los síntomas (REQ-SIN-001, REQ-SIN-003, INV-SIN-002; D-17 A). Solo presentación: el tipo elige su
 * rótulo y la intensidad se muestra como texto neutro. Nada aquí calcula alertas, semáforos, colores, íconos, orden ni filtros, y el servidor
 * no impone que «Vómito» se oculte en conejos ni pequeños mamíferos (los registros VOMIT existentes se siguen mostrando).
 *
 * @implements REQ-SIN-001, REQ-SIN-003, INV-SIN-001, INV-SIN-002
 */
import type { Species } from './view-model.ts';

export type SymptomType = 'VOMIT' | 'APPETITE' | 'STOOL' | 'ENERGY';
export type SymptomSeverity = 'MILD' | 'MODERATE' | 'SEVERE';

/** Orden de las opciones de «Tipo»: el vómito es el parámetro principal (REQ-SIN-001). */
export const SYMPTOM_TYPES: readonly SymptomType[] = ['VOMIT', 'APPETITE', 'STOOL', 'ENERGY'];
export const SYMPTOM_SEVERITIES: readonly SymptomSeverity[] = ['MILD', 'MODERATE', 'SEVERE'];

export const SYMPTOM_TYPE_LABEL: Readonly<Record<SymptomType, string>> = {
  VOMIT: 'Vómito',
  APPETITE: 'Apetito disminuido',
  STOOL: 'Heces (diarrea u otro cambio)',
  ENERGY: 'Energía disminuida',
};

export const SEVERITY_LABEL: Readonly<Record<SymptomSeverity, string>> = { MILD: 'Leve', MODERATE: 'Moderado', SEVERE: 'Intenso' };

/** Ayuda fija de cada nivel por tipo (borrador pendiente de veterinario humano, PE-01). No depende de la intensidad elegida. */
export const SYMPTOM_LEVEL_HELP: Readonly<Record<SymptomType, Readonly<Record<SymptomSeverity, string>>>> = {
  VOMIT: { MILD: '1 episodio aislado y el animal se comporta normal', MODERATE: '2 a 3 episodios en el día', SEVERE: 'más de 3 episodios o repetidos durante varios días' },
  APPETITE: { MILD: 'come algo menos', MODERATE: 'come aproximadamente la mitad', SEVERE: 'rechaza casi toda la comida' },
  STOOL: { MILD: '1 deposición blanda', MODERATE: 'varias blandas o líquidas', SEVERE: 'líquidas y frecuentes durante el día' },
  ENERGY: { MILD: 'algo más apagado pero responde', MODERATE: 'duerme o se mueve claramente menos', SEVERE: 'casi no se levanta ni responde a estímulos' },
};

export const SYMPTOM_FOOTER = 'Es tu observación; sirve para contarle al veterinario cómo evolucionó.';
export const SYMPTOM_DISCLAIMER = 'Este registro no sustituye la consulta veterinaria';
export const SYMPTOM_REFERRAL = 'Si tu mascota empeora o tienes dudas, consulta a tu veterinario.';
export const NO_VOMIT_NOTICE = 'Los conejos y los pequeños mamíferos no vomitan: si notas regurgitación o malestar, consulta a tu veterinario.';
export const SYMPTOM_DESCRIPTION_PLACEHOLDER = 'Qué observaste, cuándo y cuántas veces';

/** Especies para las que «Vómito» no se ofrece en el formulario (D-17 A). */
const NO_VOMIT_SPECIES: ReadonlySet<Species> = new Set<Species>(['RABBIT', 'SMALL_MAMMAL']);

export function hidesVomit(species: Species): boolean {
  return NO_VOMIT_SPECIES.has(species);
}

/** Opciones de «Tipo» para la especie: las 4 aprobadas, sin «Vómito» en conejos y pequeños mamíferos. */
export function symptomTypeOptions(species: Species): ReadonlyArray<{ readonly value: SymptomType; readonly label: string }> {
  return SYMPTOM_TYPES.filter((type) => type !== 'VOMIT' || !hidesVomit(species)).map((type) => ({ value: type, label: SYMPTOM_TYPE_LABEL[type] }));
}

export function isSymptomType(value: string): value is SymptomType {
  return (SYMPTOM_TYPES as readonly string[]).includes(value);
}

/**
 * `title` sigue al tipo solo si aún coincide con el rótulo del tipo anterior; si la persona lo editó, se conserva (REQ-SIN-001).
 * @implements REQ-SIN-001
 */
export function syncSymptomTitle(previous: SymptomType, next: SymptomType, title: string): string {
  return title === SYMPTOM_TYPE_LABEL[previous] ? SYMPTOM_TYPE_LABEL[next] : title;
}

/** Texto neutro de un síntoma para el listado: su tipo y su intensidad como rótulos; null si el registro no es un síntoma. */
export function symptomSummary(record: { readonly category: string; readonly symptomType?: SymptomType | null; readonly severity?: SymptomSeverity | null }): string | null {
  if (record.category !== 'SYMPTOM') return null;
  return `${SYMPTOM_TYPE_LABEL[record.symptomType!]} · Intensidad: ${SEVERITY_LABEL[record.severity!]}`;
}
