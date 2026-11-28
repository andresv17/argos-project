/**
 * Límite de duplicados de microchip por usuario en una ventana deslizante (REQ-PET4-002, SC-CAT-029, ADR-004-04; ERR-RATE-LIMITED, 429).
 * - Chequeo previo (`assertMicrochipWithinLimit`): antes de guardar CUALQUIER alta, edición (solo si cambia `microchipId`) o importación con un
 *   microchip no nulo, si el usuario ya acumula el máximo de eventos en la ventana la operación responde 429 sin guardar, sea el chip nuevo o repetido
 *   (así el 429 no delata qué chips existen). Va dentro de la transacción de la operación: al lanzar se deshace todo.
 * - Registro (`recordMicrochipDuplicate`): solo cuando la operación falló por duplicado, DESPUÉS de que su transacción terminó (en Postgres la
 *   violación 23505 la aborta), en una transacción nueva e independiente y best effort: si falla, el duplicado se responde igual con 409. No se
 *   registra ni se loguea el identificador ni el microchip: el evento solo guarda ámbito, usuario e instante.
 * El chequeo cuenta los eventos del propio usuario; no consulta la existencia del chip, de modo que no reintroduce la consulta previa por
 * propietario que REQ-PET4-001 prohíbe.
 *
 * @implements REQ-PET4-002, ERR-RATE-LIMITED, INV-LOG-001, INV-ARCH-001, INV-ARCH-005
 */
import { DomainError } from '../../generated/index.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

type LimitDeps = Pick<ApplicationDeps, 'rateLimiter' | 'clock' | 'uow'>;

/** @returns el ERR-RATE-LIMITED que debe lanzarse, o null si no hay microchip que guardar o aún hay cupo. */
export async function microchipLimitError(deps: LimitDeps, repositories: RepositorySet, userId: string, hasMicrochip: boolean): Promise<DomainError | null> {
  if (!hasMicrochip) return null;
  const exhausted = await deps.rateLimiter.isExhausted(repositories, 'MICROCHIP_DUPLICATE', userId, deps.clock.nowIsoTimestamp());
  return exhausted ? new DomainError('ERR-RATE-LIMITED') : null;
}

/** Lanza ERR-RATE-LIMITED si el cupo está agotado y hay microchip que guardar (alta y edición). */
export async function assertMicrochipWithinLimit(deps: LimitDeps, repositories: RepositorySet, userId: string, hasMicrochip: boolean): Promise<void> {
  const error = await microchipLimitError(deps, repositories, userId, hasMicrochip);
  if (error !== null) throw error;
}

/** Un choque de microchip: el duplicado propio de 004 o, desde el split de 012 (`ENM-002-MINOR-012-CHIP`), el 409 uniforme `ERR-CHP12-MICROCHIP-REGISTERED`; ambos cuentan para el límite de 004 (5 en 24 h). */
export const isMicrochipDuplicateError = (error: unknown): boolean => {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === 'ERR-PET-MICROCHIP-DUPLICATE' || code === 'ERR-CHP12-MICROCHIP-REGISTERED';
};

/** Registra un duplicado del usuario en una transacción independiente; cualquier fallo se ignora (best effort, sin log de datos). */
export async function recordMicrochipDuplicate(deps: LimitDeps, userId: string): Promise<void> {
  try {
    await deps.uow.runInTransaction((repositories) => deps.rateLimiter.record(repositories, 'MICROCHIP_DUPLICATE', userId, deps.clock.nowIsoTimestamp()));
  } catch {
    // El evento es de mejor esfuerzo: el 409 del duplicado no debe depender de él.
  }
}

/** Ejecuta la operación y, si falló por ERR-PET-MICROCHIP-DUPLICATE, registra el evento fuera de su transacción y relanza el mismo error. */
export async function withDuplicateRecording<T>(deps: LimitDeps, userId: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMicrochipDuplicateError(error)) await recordMicrochipDuplicate(deps, userId);
    throw error;
  }
}
