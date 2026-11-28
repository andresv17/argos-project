/**
 * Comprobador ÚNICO de unicidad y reserva del microchip (Feature 012, Bloque B, #23, T1635/T1646; REQ-CHP12-001, REQ-CHP12-002, INV-CHP12-001, INV-CHP12-002, INV-CHP12-009, EDGE-012-044).
 * Toda ruta que escribe `pets.microchip_id` (alta, edición, importación de respaldo, restauración, `/admin`, semillas) pasa por `assertMicrochipAvailable`:
 * - consulta TODAS las mascotas con ese chip (fallecidas incluidas) con `pets.findMicrochipHolder`, sin depender del predicado de un índice;
 * - consulta SIEMPRE la reserva por disputa abierta (`ownerRequests.hasOpenChipReservation`), exista o no la mascota: libre, ocupado, reservado con mascota y reservado sin mascota ejecutan
 *   las MISMAS llamadas al repositorio, en el mismo orden (el tiempo no se mide);
 * - split de error (ENM-002-MINOR-012-CHIP): mascota del MISMO dueño -> `ERR-PET-MICROCHIP-DUPLICATE` (004); cualquier otro caso -> `ERR-CHP12-MICROCHIP-REGISTERED` (409, cuerpo uniforme sin
 *   campo ni dato de la mascota, del dueño, del hogar ni de la fecha).
 * El índice `pets_microchip_global` permanece como red de seguridad ante carreras (`mapMicrochipViolation`). El chip nunca se registra completo: solo `last4`.
 *
 * @implements REQ-CHP12-001, REQ-CHP12-002, INV-CHP12-001, INV-CHP12-002, INV-CHP12-009, EDGE-012-044, NFR-012-006
 */

import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import { DomainError as DomainErrorV31 } from '../../generated/v31/index.ts';
import { DomainError } from '../../generated/v38/index.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Formato único del chip (REQ-CHP12-002): exactamente 15 dígitos ASCII. */
export const CHIP_FORMAT = /^[0-9]{15}$/;

export const isChipFormat = (value: unknown): value is string => typeof value === 'string' && CHIP_FORMAT.test(value);
export const chipLast4 = (chip: string): string => chip.slice(-4);

type HmacDeps = Pick<ApplicationDeps, 'auditPseudonym' | 'auditHmacSecret'>;

/** Ancla `chip_hmac`: HMAC con prefijo de dominio `chip:` (distinto del de IP y del de usuario, trinity R-04/R-05); nunca el chip. */
export const chipHmacOf = (deps: HmacDeps, chip: string): string => deps.auditPseudonym.hmacUserId(`chip:${chip}`, deps.auditHmacSecret);

/**
 * @throws `ERR-PET-MICROCHIP-DUPLICATE` si el chip lo tiene una mascota del propio usuario; `ERR-CHP12-MICROCHIP-REGISTERED` si lo tiene otra cuenta o está reservado por una disputa abierta.
 */
export async function assertMicrochipAvailable(
  deps: Pick<ApplicationDeps, 'clock' | 'auditPseudonym' | 'auditHmacSecret'>,
  repositories: RepositorySet,
  actorUserId: string,
  chip: string,
  /** Mascotas que la operación va a REEMPLAZAR (importación de respaldo): su ocupación del chip no cuenta. La reserva por disputa sí. */
  replacing: ReadonlySet<string> = new Set(),
): Promise<void> {
  const found = await repositories.pets.findMicrochipHolder(chip);
  const holder = found !== null && replacing.has(found.petId) ? null : found;
  const reserved = await repositories.ownerRequests.hasOpenChipReservation(chipHmacOf(deps, chip), deps.clock.nowIsoTimestamp());
  if (holder !== null && isPrincipalOfPet(actorUserId, holder)) throw new DomainErrorV31('ERR-PET-MICROCHIP-DUPLICATE', undefined, 'microchipId');
  if (holder !== null || reserved) throw new DomainError('ERR-CHP12-MICROCHIP-REGISTERED');
}
