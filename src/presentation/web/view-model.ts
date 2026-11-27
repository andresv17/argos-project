/**
 * Modelo de presentación puro de la SPA (sin React, sin red, sin reloj).
 * Traduce las vistas del contrato a textos, clases y geometría. No calcula reglas de negocio:
 * alertas, edades, deltas, permisos (`canEdit`) y colores de dueño (`colorToken`) llegan calculados por la API.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-006, REQ-UI-007, STATE-ALERT-001, INV-ARCH-004
 */
import type { components, paths } from '../../generated/api/openapi-types.ts';
import { STATE_ALERT_001 } from '../../generated/machines/sanitary-alert.machine.ts';

export type Schemas = components['schemas'];
export type PetCardView = Schemas['PetCardView'];
export type PetDashboardView = Schemas['PetDashboardView'];
/** Perfil de la mascota; `breedCode` (feature 004) es nulo en mascotas anteriores y puede faltar en datos de la 002. */
export type PetProfile = Schemas['PetProfile'] & { readonly breedCode?: string | null };
export type OwnerTag = Schemas['OwnerTag'];
/** Parámetro adicional de la ficha con los campos de síntoma de la 004 (nulos o ausentes fuera de la categoría «Síntoma»). */
export type CustomParameterView = Omit<Schemas['CustomParameterRecord'], 'category'> & {
  readonly category: Schemas['CustomParameterRecord']['category'] | 'SYMPTOM';
  readonly symptomType?: 'VOMIT' | 'APPETITE' | 'STOOL' | 'ENERGY' | null;
  readonly severity?: 'MILD' | 'MODERATE' | 'SEVERE' | null;
};
export type OwnerColorToken = Schemas['OwnerColorToken'];
export type AlertStateMetadata = Schemas['AlertStateMetadata'];
export type AlertStatus = Schemas['AlertStatus'];
export type WeightEntryView = Schemas['WeightEntryView'];
export type HouseholdView = Schemas['HouseholdView'];
export type HouseholdMemberView = Schemas['HouseholdMemberView'];
export type HouseholdRole = Schemas['HouseholdRole'];
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

/** Texto visible de una alerta reemplazada (T289, REQ-UI-003): el registro posterior la sustituye. */
export const SUPERSEDED_TEXT = 'Reemplazada por registro posterior';

const days = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Insignia de una alerta: el `uiBadge` sale de la máquina STATE-ALERT-001 para el `status` recibido. */
export function alertBadge(alert: AlertStateMetadata): AlertBadgeModel {
  const uiBadge = STATE_ALERT_001.states[alert.status].uiBadge;
  const style = UI_BADGE_STYLE[uiBadge];
  const suffix =
    alert.status === 'SUPERSEDED'
      ? SUPERSEDED_TEXT
      : alert.status === 'OVERDUE'
      ? `${days(-alert.daysRemaining)} de retraso`
      : alert.daysRemaining === 0
          ? 'vence hoy'
          : `${days(alert.daysRemaining)} ${alert.daysRemaining === 1 ? 'restante' : 'restantes'}`;
  const text = alert.status === 'SUPERSEDED' ? suffix : `${alert.label} · ${suffix}`;
  return { status: alert.status, uiBadge, color: style.color, className: style.className, text };
}

/** Contador de alertas de una tarjeta (REQ-UI-001): solo OVERDUE y DUE_SOON. */
export function alertCounters(summary: ActiveSanitaryAlertsSummary): string {
  return countersText(summary.overdueCount, summary.dueSoonCount);
}

/** Concordancia de número (OBS-1 Sati T1573): «1 vencida» / «2 vencidas», «1 próxima» / «2 próximas». */
export function countersText(overdue: number, dueSoon: number): string {
  return `${overdue} ${overdue === 1 ? 'vencida' : 'vencidas'} · ${dueSoon} ${dueSoon === 1 ? 'próxima' : 'próximas'}`;
}

export type AlertTone = 'DANGER' | 'WARNING' | 'NEUTRAL';

/** Línea de alertas de una opción del riel (blueprint §4.2): siempre ambos números, también con 0. */
export function alertsLine(summary: ActiveSanitaryAlertsSummary): string {
  return `Alertas: ${alertCounters(summary)}`;
}

/** Tono de la línea de alertas: rojo si hay vencidas, ámbar si solo hay próximas, neutro si no hay ninguna. */
export function alertTone(summary: ActiveSanitaryAlertsSummary): AlertTone {
  return summary.overdueCount > 0 ? 'DANGER' : summary.dueSoonCount > 0 ? 'WARNING' : 'NEUTRAL';
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

export type PetPermissions = Schemas['PetPermissions'];

/** «Solo lectura» (REQ-UI2-003): ninguna de las escrituras de la matriz está permitida; el Cuidador, que registra, no lo ve. */
export function isReadOnly(permissions: PetPermissions): boolean {
  return !permissions.editPetBasics && !permissions.writeHealthEvents && !permissions.writeWeightsAndMeasurements && !permissions.writeAppointmentsAndParameters;
}

// ---------------------------------------------------------------------------
// Avatar (REQ-AVA-001..003, D-19 A): imagen cargada por el proxy de la misma origen, o letras iniciales; `avatarUrl` solo como enlace
// ---------------------------------------------------------------------------

/** Ruta del avatar cargado: proxy autenticado de la misma origen con `?v=<avatarVersion>` (caché inmutable por versión); null sin avatar. @implements REQ-AVA-001 */
export function avatarImagePath(petId: string, avatarVersion: number | null): string | null {
  return avatarVersion === null ? null : `/api/pets/${petId}/avatar?v=${avatarVersion}`;
}

/** Ruta de la foto de perfil de la PROPIA cuenta: proxy autenticado de la misma origen con `?v=<avatarVersion>` y sin id de usuario; null sin foto. @implements REQ-PRF11-001, REQ-PRF11-002 */
export function userAvatarImagePath(avatarVersion: number | null): string | null {
  return avatarVersion === null ? null : `/api/account/avatar?v=${avatarVersion}`;
}

/** `avatarVersion` del perfil (entero >= 1) o null; el tipo 002 de la SPA aún no lo declara, por eso se lee sin suponer su forma. @implements REQ-AVA-001 */
export function avatarVersionOf(profile: object): number | null {
  const value: unknown = Reflect.get(profile, 'avatarVersion');
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * `avatarUrl` solo se ofrece como enlace de texto y solo con http(s): `javascript:`, `data:` y cualquier otro esquema se descartan. Nunca se usa como
 * `src` de una imagen (la CSP estricta lo impide, D-19 A). @implements REQ-AVA-002, REQ-AVA-003
 */
export function externalAvatarLink(avatarUrl: string | null | undefined): string | null {
  const trimmed = avatarUrl?.trim() ?? '';
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

/** Primera letra de las dos primeras palabras del nombre, en mayúscula. */
export function petInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => (word[0] ?? '').toLocaleUpperCase('es'))
    .join('');
}

// ---------------------------------------------------------------------------
// Filtros del directorio (REQ-UI2-002, REQ-PET2-002): los cinco valores del contrato
// ---------------------------------------------------------------------------

export type PetFilterValue = NonNullable<NonNullable<paths['/pets']['get']['parameters']['query']>['filter']>;

/** Opciones en el orden del contrato: Todos, Perros, Gatos, Otros y Con alertas sanitarias. */
export const PET_FILTER_OPTIONS: ReadonlyArray<{ readonly value: PetFilterValue; readonly label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CANINE', label: 'Perros' },
  { value: 'FELINE', label: 'Gatos' },
  { value: 'OTHERS', label: 'Otros' },
  { value: 'WITH_ALERTS', label: 'Con alertas sanitarias' },
];

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
/** Rol dentro de un hogar (REQ-HOUSE2-001), tal como lo muestra la interfaz. */
export const HOUSEHOLD_ROLE_LABEL: Readonly<Record<Schemas['HouseholdRole'], string>> = { ADMIN: 'Administrador', CAREGIVER: 'Cuidador', READER: 'Lector' };
export const SEX_LABEL: Readonly<Record<PetProfile['sex'], string>> = { MALE: 'Macho', FEMALE: 'Hembra' };

/** Edad calculada por la API (REQ-PET-002), solo formateada. */
export function formatAge(age: ComputedAge): string {
  const years = `${age.years} ${age.years === 1 ? 'año' : 'años'}`;
  const months = `${age.months} ${age.months === 1 ? 'mes' : 'meses'}`;
  return `${years}, ${months}`;
}

/** Estado de vida de la ficha (007, REQ-FAL7-003): una ficha anterior a la 007 no trae el campo y se lee `ALIVE`. */
export const LIFE_STATUS_LABEL: Readonly<Record<'ALIVE' | 'DECEASED', string>> = { ALIVE: 'Vivo', DECEASED: 'Fallecido' };
/** Texto de la confirmación al pasar de Fallecido a Vivo, fijado por Neo (REQ-FAL7-003, EDGE-007-016). */
export const REVIVE_CONFIRMATION_TEXT = 'Al volver a Vivo se reactivarán las alertas';
/** Aviso al creador al marcar Fallecido (007, T1026, SC-007-016, REQ-FAL7-008): los enlaces veterinarios activos NO se revocan automáticamente. */
export const DECEASED_LINKS_NOTICE = 'Los enlaces veterinarios activos de esta mascota no se revocan al marcarla como fallecida. Si no quieres que sigan visibles, revócalos desde «Compartir».';

export const isDeceased = (profile: Pick<PetProfile, 'lifeStatus'>): boolean => profile.lifeStatus === 'DECEASED';

/** `YYYY-MM-DD` → `DD/MM/AAAA` sin pasar por `Date` (sin zonas horarias ni cálculo de calendario). */
export function formatIsoDateEs(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match === null ? iso : `${match[3]}/${match[2]}/${match[1]}`;
}

/** Insignia «Fallecido · DD/MM/AAAA»; `null` si la mascota está viva (REQ-FAL7-003). */
export function deceasedBadgeText(profile: Pick<PetProfile, 'lifeStatus' | 'deceasedAt'>): string | null {
  if (!isDeceased(profile)) return null;
  return typeof profile.deceasedAt === 'string' ? `Fallecido · ${formatIsoDateEs(profile.deceasedAt)}` : 'Fallecido';
}

/** «Vivió …» con la edad que entrega la API (hasta `deceasedAt`, REQ-FAL7-007); «aprox.» si la fecha de nacimiento es estimada. `null` si está viva. */
export function livedText(profile: Pick<PetProfile, 'lifeStatus' | 'birthDateIsEstimate'>, age: ComputedAge): string | null {
  if (!isDeceased(profile)) return null;
  return `Vivió ${profile.birthDateIsEstimate === true ? 'aprox. ' : ''}${formatAge(age)}`;
}

/** Solo Fallecido → Vivo exige confirmación explícita (REQ-FAL7-003). */
export function requiresReviveConfirmation(profile: Pick<PetProfile, 'lifeStatus'> | null, next: string): boolean {
  return profile !== null && isDeceased(profile) && next === 'ALIVE';
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

/** `/elige-usuario` (008, T1122; `CHOOSE_USERNAME_ROUTE`) es pública: el flujo de Google aún no tiene sesión; con sesión vuelve a `/`. */
export const PUBLIC_PATHS: readonly string[] = ['/login', '/register', '/elige-usuario', '/solicitud-en-revision', '/solicitud-no-aprobada'];

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

/**
 * REQ-HOUSE2-002: el propietario o un ADMIN cambian el rol de un miembro ACTIVE que no sea el propietario;
 * un ADMIN no cambia el suyo. La API aplica la regla; la UI solo oculta lo que rechazaría.
 */
export function canChangeRole(view: HouseholdView, member: HouseholdMemberView, myUserId: string): boolean {
  if (member.membership.status !== 'ACTIVE' || member.membership.isHouseholdOwner) return false;
  if (view.isHouseholdOwner) return true;
  return view.myRole === 'ADMIN' && member.membership.userId !== myUserId;
}

/** REQ-HOUSE2-002 (TRANSFER_OWNERSHIP): solo el propietario, hacia otro miembro ACTIVE. */
export function canTransferHousehold(view: HouseholdView, member: HouseholdMemberView, myUserId: string): boolean {
  return view.isHouseholdOwner && member.membership.status === 'ACTIVE' && member.membership.userId !== myUserId;
}

export function canDeleteHousehold(view: HouseholdView): boolean {
  return view.isHouseholdOwner;
}

/** «1 mascota» / «2 mascotas»: cantidad con el sustantivo en singular cuando es exactamente 1. */
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// REQ-HOG11-008 (opción B): datos cortos del hogar, solo con lo que ya llega en HouseholdView y PetCardView
// ---------------------------------------------------------------------------

/** «Perro · Labrador · Macho»: especie, raza y sexo de la ficha (sin avatar). */
export function petIdentityLine(profile: Pick<PetProfile, 'species' | 'breed' | 'sex'>): string {
  return [SPECIES_LABEL[profile.species], profile.breed, SEX_LABEL[profile.sex]].filter((part) => typeof part === 'string' && part !== '').join(' · ');
}

/** «3 años, 2 meses · 12.40 kg»: edad calculada por el servidor (o «Vivió …» si falleció) y último peso. */
export function petAgeWeightLine(card: Pick<PetCardView, 'profile' | 'computedAge' | 'latestWeightKg'>): string {
  return `${livedText(card.profile, card.computedAge) ?? formatAge(card.computedAge)} · ${formatKg(card.latestWeightKg)}`;
}

/** Miembros ACTIVE por rol, «1 Administrador · 2 Cuidadores · 1 Lector»; sin nombres ni usuarios. */
export function membersByRoleText(members: readonly HouseholdMemberView[]): string {
  const PLURAL: Readonly<Record<HouseholdRole, readonly [string, string]>> = { ADMIN: ['Administrador', 'Administradores'], CAREGIVER: ['Cuidador', 'Cuidadores'], READER: ['Lector', 'Lectores'] };
  const active = members.filter((m) => m.membership.status === 'ACTIVE');
  return (['ADMIN', 'CAREGIVER', 'READER'] as const)
    .map((role) => ({ role, n: active.filter((m) => m.membership.role === role).length }))
    .filter((r) => r.n > 0)
    .map((r) => `${r.n} ${PLURAL[r.role][r.n === 1 ? 0 : 1]}`)
    .join(' · ');
}

/** Mascotas por especie, «Perro: 2 · Gato: 1», en el orden del catálogo de especies. */
export function petsBySpeciesText(pets: ReadonlyArray<Pick<PetCardView, 'profile'>>): string {
  return (Object.keys(SPECIES_LABEL) as Species[])
    .map((sp) => ({ sp, n: pets.filter((p) => p.profile.species === sp).length }))
    .filter((r) => r.n > 0)
    .map((r) => `${SPECIES_LABEL[r.sp]}: ${r.n}`)
    .join(' · ');
}

/** Alertas agregadas solo de mascotas vivas (las fallecidas no aportan, REQ-FAL7-004). */
export function householdAlertsText(pets: ReadonlyArray<Pick<PetCardView, 'profile' | 'alertsSummary'>>): string {
  const alive = pets.filter((p) => !isDeceased(p.profile));
  const overdue = alive.reduce((sum, p) => sum + p.alertsSummary.overdueCount, 0);
  const dueSoon = alive.reduce((sum, p) => sum + p.alertsSummary.dueSoonCount, 0);
  return overdue === 0 && dueSoon === 0 ? 'Ninguna mascota requiere atención' : `Alertas: ${countersText(overdue, dueSoon)}`;
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
