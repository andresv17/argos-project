/**
 * Entrada HTTP antes de los casos de uso: cuerpo JSON en UTF-8 estricto y consulta de
 * `GET /pets`. Todo fallo es ERR-SCHEMA-VALIDATION-FAILED (422) con el campo afectado. Los esquemas
 * de los cuerpos los validan los casos de uso (con `x-sdd-error`); la importación recibe los bytes crudos
 * (STATE-BACKUP-001 decide).
 *
 * @implements INV-ARCH-004, REQ-PET-005
 */

import { DomainError, validateSpecies, type Species } from '../../generated/index.ts';
import type { PetListQuery } from '../../application/use-cases/pet-use-cases.ts';

const PET_QUERY_MAX_LENGTH = 50;

/** Cuerpo JSON: sin cuerpo → undefined (el caso de uso lo rechaza por esquema); UTF-8 o JSON inválidos → 422. */
export function jsonBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  const bytes = body as Uint8Array;
  if (bytes.byteLength === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'El cuerpo no es JSON válido en UTF-8.');
  }
}

/** Bytes crudos del cuerpo para la importación (vacío si no hay cuerpo). */
export function rawBody(body: unknown): Uint8Array {
  return body instanceof Uint8Array ? body : new Uint8Array();
}

/**
 * Consulta de `GET /pets` y `GET /households/{id}/pets`: `q` texto de hasta 50 caracteres y `species` del
 * enumerado; repetidos, desconocidos o inválidos → 422.
 * @implements REQ-PET-005
 */
export function petListQuery(query: unknown): PetListQuery {
  const { q, species, ...rest } = (query ?? {}) as Record<string, unknown>;
  const unknown = Object.keys(rest)[0];
  if (unknown !== undefined) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `Parámetro de consulta no permitido: ${unknown}.`, unknown);
  if (q !== undefined && (typeof q !== 'string' || [...q].length > PET_QUERY_MAX_LENGTH)) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `q debe ser un texto de hasta ${PET_QUERY_MAX_LENGTH} caracteres.`, 'q');
  }
  if (species !== undefined && !validateSpecies(species)) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'species no es una especie válida.', 'species');
  return { ...(q === undefined ? {} : { q: q as string }), ...(species === undefined ? {} : { species: species as Species }) };
}
