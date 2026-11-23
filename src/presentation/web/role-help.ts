/**
 * Textos de ayuda de rol y aviso de hogar del enlace veterinario (feature 008, bloque K `[GH:#25]`, D8-13 aprobada por Neo): sin React y sin leer el servidor.
 *
 * La presentación no puede importar la matriz `can(rol, acción)` (INV-ARCH-004, solo `generated`), así que este catálogo cerrado declara, junto a cada frase, la lista de acciones
 * de la matriz que la frase afirma (`allows`) y niega (`denies`) con el fragmento exacto que las nombra. `tests/unit/presentation/t1196-ayuda-rol-008.spec.ts` compara el catálogo
 * con `can()` real: si la matriz cambia (se concede o se retira una acción a un rol) la prueba falla antes de que la ayuda mienta (EDGE-008-048). Las frases NO prometen lo que el
 * servidor niega y no modifican `can()`, `REQ-VET-001/002` ni el contrato de 005 (REQ-ROL8-003).
 *
 * @implements REQ-ROL8-001, REQ-ROL8-002, REQ-ROL8-003, EDGE-008-048, EDGE-008-049, REQ-RBAC-001, REQ-VET-001, REQ-VET-002
 */
import type { HouseholdRole } from './view-model.ts';

/** Acción de la matriz de permisos (mismos identificadores que `PetAction` del dominio; la prueba los compara con `can()`). */
export type RoleHelpAction =
  | 'EDIT_PET_BASICS'
  | 'WRITE_HEALTH_EVENTS'
  | 'WRITE_WEIGHTS_AND_MEASUREMENTS'
  | 'WRITE_MEDIA'
  | 'MANAGE_HOUSEHOLD_MEMBERS'
  | 'CREATE_SHARE_LINK';

/** Una acción de la matriz y el fragmento de la frase que la nombra. */
export interface RoleHelpMention {
  readonly action: RoleHelpAction;
  readonly fragment: string;
}

export interface RoleHelp {
  /** Frase aprobada por Neo (D8-13), literal. */
  readonly text: string;
  /** Acciones que la frase dice que el rol PUEDE hacer: `can(rol, acción)` debe ser verdadero. */
  readonly allows: readonly RoleHelpMention[];
  /** Acciones que la frase dice que el rol NO puede hacer: `can(rol, acción)` debe ser falso. */
  readonly denies: readonly RoleHelpMention[];
}

/** Acciones de solo lectura que ningún texto menciona porque «consultar» las cubre (no son escritura, REQ-RBAC-001): ver medios y exportar el respaldo propio. */
export const READ_ONLY_ACTIONS = ['READ_MEDIA', 'EXPORT_IMPORT_BACKUP'] as const;

/** Rol de hogar con ayuda aprobada: el Administrador no la tiene en 008 (D8-13 solo aprueba las de Cuidador y Lector). */
export type HelpedRole = Extract<HouseholdRole, 'CAREGIVER' | 'READER'>;

export const ROLE_HELP: Readonly<Record<HelpedRole, RoleHelp>> = {
  CAREGIVER: {
    text: 'Puede registrar pesos, medidas, eventos sanitarios y subir archivos y fotos. No puede editar el perfil de la mascota, invitar personas ni crear enlaces para el veterinario.',
    allows: [
      { action: 'WRITE_WEIGHTS_AND_MEASUREMENTS', fragment: 'registrar pesos, medidas' },
      { action: 'WRITE_HEALTH_EVENTS', fragment: 'eventos sanitarios' },
      { action: 'WRITE_MEDIA', fragment: 'subir archivos y fotos' },
    ],
    denies: [
      { action: 'EDIT_PET_BASICS', fragment: 'editar el perfil de la mascota' },
      { action: 'MANAGE_HOUSEHOLD_MEMBERS', fragment: 'invitar personas' },
      { action: 'CREATE_SHARE_LINK', fragment: 'crear enlaces para el veterinario' },
    ],
  },
  READER: {
    text: 'Solo puede consultar. No puede registrar ni editar nada.',
    allows: [],
    denies: [
      { action: 'WRITE_WEIGHTS_AND_MEASUREMENTS', fragment: 'registrar' },
      { action: 'WRITE_HEALTH_EVENTS', fragment: 'registrar' },
      { action: 'WRITE_MEDIA', fragment: 'registrar' },
      { action: 'EDIT_PET_BASICS', fragment: 'editar' },
    ],
  },
};

/** Frase de ayuda del rol de hogar, o `null` si el rol no tiene ayuda aprobada (Administrador). */
export function roleHelpText(role: HouseholdRole): string | null {
  return role === 'CAREGIVER' || role === 'READER' ? ROLE_HELP[role].text : null;
}

/**
 * Aviso de hogar del diálogo de crear enlace (REQ-ROL8-002, D8-13): solo en el diálogo de quien puede crear enlaces (propietario legal o `ADMIN`, REQ-VET-001) y sin
 * prometer mascotas ajenas (REQ-VET-002, EDGE-008-049).
 */
export const HOUSEHOLD_LINK_NOTICE =
  'Para compartir más de una mascota en un mismo enlace, agrúpalas en un hogar. Un enlace de hogar incluye solo las mascotas asignadas a ese hogar que sean tuyas.';
