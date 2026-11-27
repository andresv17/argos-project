/**
 * Textos y reglas de presentación del Modo Cuidador (Feature 012, Bloque C, #26; T1656; REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-008, EDGE-012-049). Presentación pura, sin leer el servidor: la
 * pantalla solo ofrece lo que `access/me` dice que el servidor permite, y el servidor vuelve a comprobarlo en cada escritura.
 */
import { BRAND_NAME } from './brand.ts';
import type { CareKind, CareOccurrenceView, CaregiverLevel, ConflictInfo, DoseUnit, MyCareAccessView, OccurrenceState } from './care-api.ts';

/** Avisos de límites de producto (REQ-CAR12-008): sin consejo clínico (literal del contrato) y sin recordatorios. */
export const CARE_LIMITS_NOTICE = 'Las instrucciones las define el propietario; ante dudas consulta al veterinario';
/** Solo «Sin notificaciones» viene del contrato (REQ-CAR12-008); el resto de la frase es texto de producto. */
export const CARE_NO_REMINDERS_NOTICE = `${BRAND_NAME} no envía recordatorios ni notificaciones: revisa esta pantalla a la hora de cada tarea.`;
/** Advertencia de doble administración (maggie M-4, REQ-CAR12-003): literal del contrato. */
export const DOUBLE_DOSE_WARNING = 'Registrar la toma no la impide: verifica en el registro antes de darla';
/** Texto del editor de medicación (contrato `createCareRoutine`): literal. */
export const DOSE_DISCLAIMER = `${BRAND_NAME} registra la indicación que escribes; no calcula ni verifica dosis, ni interacciones. Sigue siempre la indicación de tu veterinario.`;
export const TIMEZONE_LABEL = 'Hora de Bogotá';
/** La misma etiqueta dentro de una frase («08:00 (hora de Bogotá)»): solo cambia la inicial; «Bogotá» conserva su mayúscula. */
export const TIMEZONE_INLINE = 'hora de Bogotá';
/** Ventana de deshacer del autor no titular (CARE_LOG_UNDO_MINUTES del dominio, espejo de presentación; el servidor decide). */
export const CARE_UNDO_MINUTES = 10;
/** 403 al deshacer: el motivo real es la ventana de 10 minutos o la autoría, no el nivel del cuidador. */
export const REVERT_FORBIDDEN_TEXT = `No puedes deshacer este registro. Quien lo hizo puede deshacerlo solo durante los primeros ${CARE_UNDO_MINUTES} minutos; pasado ese tiempo, solo un propietario puede hacerlo.`;

/** Ofrecer «Deshacer»: un titular siempre (pasados 10 minutos con motivo); el autor no titular solo dentro de la ventana, igual que el servidor (`assertCanRevert`). */
export function canOfferRevert(input: { readonly canLogCare: boolean; readonly canManageRoutines: boolean; readonly entry: { readonly performedByMe: boolean; readonly performedAt: string; readonly revertedAt: string | null } | null; readonly nowMs: number }): boolean {
  const { entry } = input;
  if (!input.canLogCare || entry === null || entry.revertedAt !== null) return false;
  if (input.canManageRoutines) return true;
  return entry.performedByMe && input.nowMs - Date.parse(entry.performedAt) <= CARE_UNDO_MINUTES * 60_000;
}

export const KIND_LABEL: Readonly<Record<CareKind, string>> = { MEDICATION: 'Medicina', MEAL: 'Comida', WALK: 'Paseo', OTHER: 'Otra tarea' };
export const UNIT_LABEL: Readonly<Record<DoseUnit, string>> = { MG: 'mg', MCG: 'mcg', ML: 'ml', IU: 'UI', TABLET: 'tableta(s)', DROP: 'gota(s)' };
export const STATE_LABEL: Readonly<Record<OccurrenceState, string>> = { PENDING: 'Pendiente', DONE: 'Hecho', SKIPPED: 'Omitido', OVERDUE: 'Atrasado' };
export const LEVEL_LABEL: Readonly<Record<CaregiverLevel, string>> = { VIEW_ONLY: 'Solo ver el cuidado', BASIC_LOG: 'Ver y registrar el cuidado' };
export const WEEKDAYS: ReadonlyArray<{ readonly n: number; readonly label: string }> = [
  { n: 1, label: 'Lunes' },
  { n: 2, label: 'Martes' },
  { n: 3, label: 'Miércoles' },
  { n: 4, label: 'Jueves' },
  { n: 5, label: 'Viernes' },
  { n: 6, label: 'Sábado' },
  { n: 7, label: 'Domingo' },
];

export const doseText = (amount: number | null, unit: DoseUnit | null): string | null => (amount === null || unit === null ? null : `${amount} ${UNIT_LABEL[unit]}`);

/** Hora de Bogotá `HH:MM` de un instante ISO (UTC-5 fijo, D12-12). */
export function bogotaTimeOf(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const minutesOfDay = Math.floor((((ms - 5 * 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000);
  return `${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:${String(minutesOfDay % 60).padStart(2, '0')}`;
}

/** Texto visible del conflicto de doble registro (REQ-CAR12-003): quién, a qué hora y en qué estado. */
export function conflictText(info: ConflictInfo | null): string {
  if (info === null) return 'Esa ocurrencia ya fue registrada por otra persona.';
  const state = info.status === 'DONE' ? 'como hecha' : 'como omitida';
  return `Ya la registró ${info.performedByDisplayName} a las ${bogotaTimeOf(info.performedAt)} (hora de Bogotá) ${state}. Revisa el registro antes de darla de nuevo.`;
}

/**
 * Descripción del nivel del cuidador (EDGE-012-049): `VIEW_ONLY` limita solo rutinas y registros de cuidado y NUNCA se presenta como «solo lectura» general, porque el rol
 * conserva sus permisos clínicos (pesos, medidas, eventos sanitarios, archivos y fotos).
 */
export function levelDescription(access: MyCareAccessView): string | null {
  if (!access.caregiver) return null;
  const clinical = access.clinicalPermissionsUnchanged ? ' Tus permisos para pesos, medidas, eventos sanitarios, archivos y fotos no cambian.' : '';
  if (access.canLogCare) return `Tu nivel en el Modo Cuidador: ver y registrar el cuidado (tomas, comidas y paseos).${clinical}`;
  const base = access.defaultedToViewOnly ? 'El propietario aún no te dio un nivel, así que en el Modo Cuidador solo ves las rutinas y los registros de cuidado; no puedes registrar.' : 'Tu nivel en el Modo Cuidador te deja ver las rutinas y los registros de cuidado, pero no registrar.';
  return `${base}${clinical}`;
}

/** Agrupa las ocurrencias por hora (el servidor ya las ordena cronológicamente, INV-SORT-001). */
export function groupByTime(items: readonly CareOccurrenceView[]): ReadonlyArray<{ readonly time: string; readonly items: readonly CareOccurrenceView[] }> {
  const groups: Array<{ time: string; items: CareOccurrenceView[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.time === item.occurrenceTime) last.items.push(item);
    else groups.push({ time: item.occurrenceTime, items: [item] });
  }
  return groups;
}

/** Horas «08:00, 20:30» a lista; lo que no sea HH:MM se deja para que el servidor lo rechace con 422. */
export const parseTimes = (text: string): string[] => text.split(/[\s,;]+/).filter((t) => t !== '').map((t) => (/^\d:\d{2}$/.test(t) ? `0${t}` : t));
