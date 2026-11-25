/**
 * Puerto del singleton `about_content` de «Acerca de» (feature 010, Bloque E, T1430; REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, EDGE-010-006).
 * Sin fila no hay contenido (versión 0). `replace` es compare-and-set: con `expectedVersion = 0` inserta solo si no hay fila; si no, actualiza solo si `version = expectedVersion`.
 * Devuelve el registro con `version + 1`, o `null` si perdió la carrera (el llamador lo traduce a 412). La clave del objeto de la foto no sale nunca en una vista.
 *
 * @implements REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, EDGE-010-006
 */

export interface AboutContentRecord {
  readonly bodyMarkdown: string;
  /** Clave `about/photo/<uuid>` (sin EXIF) o `null` si no hay foto. Nunca sale en respuestas. */
  readonly photoObjectKey: string | null;
  readonly photoAlt: string;
  readonly version: number;
  readonly updatedAt: string;
  /** Id opaco del administrador (no es un `userId`). */
  readonly updatedBy: string;
}

export type AboutContentNext = Omit<AboutContentRecord, 'version'>;

export interface AboutContentRepositoryPort {
  get(): Promise<AboutContentRecord | null>;
  replace(next: AboutContentNext, expectedVersion: number): Promise<AboutContentRecord | null>;
}
