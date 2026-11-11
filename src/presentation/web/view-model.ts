/**
 * Modelo de presentación puro de la SPA (sin React, sin red, sin reloj).
 * Traduce las vistas del contrato a textos, clases y geometría. No calcula reglas de negocio:
 * alertas, edades, deltas, permisos (`canEdit`) y colores de dueño (`colorToken`) llegan calculados por la API.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-006, REQ-UI-007, STATE-ALERT-001, INV-ARCH-004
 */
import type { components } from '../../generated/api/openapi-types.ts';
import { STATE_ALERT_001 } from '../../generated/machines/sanitary-alert.machine.ts';

export type Schemas = components['schemas'];
export type PetCardView = Schemas['PetCardView'];
export type PetDashboardView = Schemas['PetDashboardView'];
export type PetProfile = Schemas['PetProfile'];
export type OwnerTag = Schemas['OwnerTag'];
export type OwnerColorToken = Schemas['OwnerColorToken'];
export type AlertStateMetadata = Schemas['AlertStateMetadata'];
export type AlertStatus = Schemas['AlertStatus'];
export type WeightEntryView = Schemas['WeightEntryView'];
export type HouseholdView = Schemas['HouseholdView'];
export type HouseholdMemberView = Schemas['HouseholdMemberView'];
export type MembershipStatus = HouseholdMemberView['membership']['status'];
export type Species = Schemas['Species'];
export type ComputedAge = Schemas['ComputedAge'];
export type ActiveSanitaryAlertsSummary = Schemas['ActiveSanitaryAlertsSummary'];

// ---------------------------------------------------------------------------
// REQ-UI-003 / STATE-ALERT-001: semáforo 1:1 con la máquina del contrato
// ---------------------------------------------------------------------------

type UiBadge = AlertStateMetadata['uiBadge'];

/** Color del semáforo por `uiBadge` del contrato. Texto oscuro sobre fondo claro: contraste AA. */
export const UI_BADGE_STYLE: Readonly<Record<UiBadge, { readonly color: string; readonly className: string }>> = {
  DANGER_RED: { color: 'Rojo', className: 'bg-red-100 text-red-900 border-red-700' },
  WARNING_AMBER: { color: 'Ámbar', className: 'bg-amber-100 text-amber-900 border-amber-700' },
  SUCCESS_GREEN: { color: 'Verde', className: 'bg-emerald-100 text-emerald-900 border-emerald-700' },
  NEUTRAL_GRAY: { color: 'Gris', className: 'bg-slate-100 text-slate-800 border-slate-500' },
};

export interface AlertBadgeModel {
  readonly status: AlertStatus;
  readonly uiBadge: UiBadge;
  readonly color: string;
  readonly className: string;
  readonly text: string;
}

const days = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Insignia de una alerta: el `uiBadge` sale de la máquina STATE-ALERT-001 para el `status` recibido. */
export function alertBadge(alert: AlertStateMetadata): AlertBadgeModel {
  const uiBadge = STATE_ALERT_001.states[alert.status].uiBadge;
  const style = UI_BADGE_STYLE[uiBadge];
  const suffix =
    alert.status === 'OVERDUE'
      ? `${days(-alert.daysRemaining)} de retraso`
      : alert.status === 'SUPERSEDED'
        ? 'reemplazada por un registro posterior'
        : alert.daysRemaining === 0
          ? 'vence hoy'
          : `${days(alert.daysRemaining)} ${alert.daysRemaining === 1 ? 'restante' : 'restantes'}`;
  return { status: alert.status, uiBadge, color: style.color, className: style.className, text: `${alert.label} · ${suffix}` };
}

/** Contador de alertas de una tarjeta (REQ-UI-001): solo OVERDUE y DUE_SOON. */
export function alertCounters(summary: ActiveSanitaryAlertsSummary): string {
  return `${summary.overdueCount} vencidas · ${summary.dueSoonCount} próximas`;
}

// ---------------------------------------------------------------------------
// REQ-UI-007: distinción del dueño (texto siempre; color solo en hogar)
// ---------------------------------------------------------------------------

/** Fondos de `OWNER_COLOR_1..8` con texto blanco; cada par cumple contraste >= 4.5:1. */
export const OWNER_COLORS: Readonly<Record<OwnerColorToken, string>> = {
  OWNER_COLOR_1: '#1d4ed8',
  OWNER_COLOR_2: '#047857',
  OWNER_COLOR_3: '#b91c1c',
  OWNER_COLOR_4: '#7e22ce',
  OWNER_COLOR_5: '#b45309',
  OWNER_COLOR_6: '#0f766e',
  OWNER_COLOR_7: '#be185d',
  OWNER_COLOR_8: '#4338ca',
};
export const OWNER_TEXT_COLOR = '#ffffff';
export const READ_ONLY_LABEL = 'Solo lectura';

export interface OwnerBadgeModel {
  readonly text: string;
  readonly style: { readonly backgroundColor: string; readonly color: string } | null;
}

/** Insignia del dueño: el nombre siempre; el color solo si la API envía `colorToken` (contexto de hogar). */
export function ownerBadge(owner: OwnerTag): OwnerBadgeModel {
  return {
    text: `Dueño: ${owner.displayName}`,
    style: owner.colorToken === null ? null : { backgroundColor: OWNER_COLORS[owner.colorToken], color: OWNER_TEXT_COLOR },
  };
}

/** Acciones de una mascota según `canEdit` de la API: ajenas en solo lectura y sin editar/eliminar. */
export function petActions(view: { readonly canEdit: boolean }): { readonly canEdit: boolean; readonly readOnlyLabel: string | null } {
  return { canEdit: view.canEdit, readOnlyLabel: view.canEdit ? null : READ_ONLY_LABEL };
}

// ---------------------------------------------------------------------------
// Textos de perfil
// ---------------------------------------------------------------------------

export const SPECIES_LABEL: Readonly<Record<Species, string>> = {
  CANINE: 'Perro',
  FELINE: 'Gato',
  RABBIT: 'Conejo',
  FERRET: 'Hurón',
  BIRD: 'Ave',
  REPTILE: 'Reptil',
  SMALL_MAMMAL: 'Pequeño mamífero',
  OTHER: 'Otro',
};
export const SEX_LABEL: Readonly<Record<PetProfile['sex'], string>> = { MALE: 'Macho', FEMALE: 'Hembra' };

/** Edad calculada por la API (REQ-PET-002), solo formateada. */
export function formatAge(age: ComputedAge): string {
  const years = `${age.years} ${age.years === 1 ? 'año' : 'años'}`;
  const months = `${age.months} ${age.months === 1 ? 'mes' : 'meses'}`;
  return `${years}, ${months}`;
}

export function formatKg(value: number | null): string {
  return value === null ? 'Sin peso' : `${value.toFixed(2)} kg`;
}

function signed(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)} ${unit}`;
}

// ---------------------------------------------------------------------------
// REQ-UI-002: tabla y gráfico SVG determinista de peso
// ---------------------------------------------------------------------------

export interface WeightRow {
  readonly id: string;
  readonly date: string;
  readonly weight: string;
  readonly deltaKg: string;
  readonly deltaPercent: string;
}

/** Filas en el orden de la API (INV-SORT-001); `deltaKg` y `deltaPercent` vienen calculados por la API. */
export function weightRows(entries: readonly WeightEntryView[]): WeightRow[] {
  return entries.map((e) => ({
    id: e.record.id,
    date: e.record.recordedAt,
    weight: formatKg(e.record.weightKg),
    deltaKg: e.deltaKg === null ? '—' : signed(e.deltaKg, 'kg'),
    // T284 PENDIENTE: la 002 retira deltaPercent del contrato; la UI nueva decide cómo mostrar la variación.
    deltaPercent: '—',
  }));
}

export interface WeightChartModel {
  readonly width: number;
  readonly height: number;
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number; readonly label: string }>;
  readonly path: string;
  readonly minLabel: string;
  readonly maxLabel: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Geometría del gráfico: puntos equiespaciados en orden cronológico (inverso al de la API) y escala lineal en kg.
 * Mismo input → mismo SVG. No usa fechas ni reloj.
 */
export function weightChart(entries: readonly WeightEntryView[], width = 600, height = 220, padding = 32): WeightChartModel {
  const chronological = [...entries].reverse();
  const values = chronological.map((e) => e.record.weightKg);
  const min = values.length === 0 ? 0 : Math.min(...values);
  const max = values.length === 0 ? 0 : Math.max(...values);
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const points = chronological.map((e, i) => ({
    x: round2(chronological.length === 1 ? width / 2 : padding + (i * innerW) / (chronological.length - 1)),
    y: round2(max === min ? height / 2 : padding + ((max - e.record.weightKg) * innerH) / (max - min)),
    label: `${e.record.recordedAt}: ${formatKg(e.record.weightKg)}`,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return { width, height, points, path, minLabel: formatKg(values.length === 0 ? null : min), maxLabel: formatKg(values.length === 0 ? null : max) };
}

// ---------------------------------------------------------------------------
// REQ-UI-001: contextos, filtro y navegación por teclado
// ---------------------------------------------------------------------------

export type ViewContext = { readonly kind: 'MINE' } | { readonly kind: 'HOUSEHOLD'; readonly householdId: string };

export interface ContextOption {
  readonly id: string;
  readonly label: string;
  readonly context: ViewContext;
}

export const MINE_CONTEXT_ID = 'mine';

/** "Mis mascotas" y cada hogar que devuelve `listMyHouseholds` (solo membresías ACTIVE). */
export function contextOptions(households: readonly HouseholdView[]): ContextOption[] {
  return [
    { id: MINE_CONTEXT_ID, label: 'Mis mascotas', context: { kind: 'MINE' } },
    ...households.map((h) => ({ id: h.household.id, label: h.household.name, context: { kind: 'HOUSEHOLD' as const, householdId: h.household.id } })),
  ];
}

/** Índice siguiente según el patrón WAI-ARIA APG: flechas con ciclo, Inicio y Fin. `null` si la tecla no navega. */
export function nextFocusIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// REQ-UI-005: guardia de rutas
// ---------------------------------------------------------------------------

export const PUBLIC_PATHS: readonly string[] = ['/login', '/register'];

/** Redirección de una ruta: protegida sin sesión → `/login`; pública con sesión → `/`; en otro caso `null`. */
export function routeRedirect(authenticated: boolean, path: string): string | null {
  const isPublic = PUBLIC_PATHS.includes(path);
  if (!authenticated && !isPublic) return '/login';
  if (authenticated && isPublic) return '/';
  return null;
}

// ---------------------------------------------------------------------------
// REQ-UI-006: hogares
// ---------------------------------------------------------------------------

export const MEMBERSHIP_LABEL: Readonly<Record<MembershipStatus, string>> = {
  ACTIVE: 'Activo',
  LEFT: 'Abandonó',
  REMOVED: 'Retirado',
};

export type MemberAction = 'REMOVE' | 'CANCEL_INVITATION' | 'LEAVE';

export const MEMBER_ACTION_LABEL: Readonly<Record<MemberAction, string>> = {
  REMOVE: 'Retirar',
  CANCEL_INVITATION: 'Cancelar invitación',
  LEAVE: 'Abandonar hogar',
};

/**
 * Botones de una fila de miembro según `myRole` de la API. La API aplica INV-HOUSE-002; la UI solo oculta
 * lo que la API rechazaría.
 */
export function memberActions(view: HouseholdView, member: HouseholdMemberView, myUserId: string): MemberAction[] {
  const isMe = member.membership.userId === myUserId;
  // T238 PENDIENTE: las invitaciones viven en view.pendingInvitations; CANCEL_INVITATION se atiende allí.
  if (view.isHouseholdOwner) {
    if (isMe) return [];
    if (member.membership.status === 'ACTIVE') return ['REMOVE'];
    return [];
  }
  return isMe && member.membership.status === 'ACTIVE' ? ['LEAVE'] : [];
}

export function canDeleteHousehold(view: HouseholdView): boolean {
  return view.isHouseholdOwner;
}

export function invitationsLabel(count: number): string {
  return count === 1 ? '1 invitación pendiente' : `${count} invitaciones pendientes`;
}

// ---------------------------------------------------------------------------
// REQ-PET-004 en la UI: confirmación escribiendo el nombre
// ---------------------------------------------------------------------------

/** La eliminación se habilita solo si el texto escrito coincide exactamente con el nombre de la mascota. */
export function isDeleteConfirmed(typed: string, petName: string): boolean {
  return typed === petName;
}
