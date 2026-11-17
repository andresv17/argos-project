/**
 * Límite de frecuencia por actor y ámbito (ADR-002-12): ventana deslizante contada con el reloj inyectado.
 * Las cifras (máximo y minutos de ventana) viven en la configuración, no en el contrato.
 *
 * @implements ERR-RATE-LIMITED, INV-ARCH-005, INV-ARCH-006
 */

import type { RateLimitScope, RepositorySet } from './repositories.port.ts';

export type { RateLimitScope } from './repositories.port.ts';

export interface RateLimiterPort {
  /**
   * Registra un evento del actor en el ámbito si todavía tiene cupo en la ventana y devuelve true; si ya agotó el
   * cupo devuelve false y no registra nada (los rechazos no prolongan la ventana). Opera dentro de la transacción
   * recibida, de modo que un rollback también deshace el consumo.
   */
  tryConsume(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<boolean>;

  /**
   * Solo consulta (REQ-PET4-002, ADR-004-04): true si el actor ya tiene en la ventana tantos eventos del ámbito como permite el tope
   * (`>= máximo`). No registra nada, de modo que consultar no prolonga la ventana.
   */
  isExhausted(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<boolean>;

  /**
   * Solo registro (REQ-PET4-002, ADR-004-04): anota un evento del actor en el ámbito SIN comprobar el tope (el evento ya ocurrió: un duplicado
   * de microchip). Opera dentro de la transacción recibida.
   */
  record(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<void>;
}
