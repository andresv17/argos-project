/**
 * Puerto de los contadores de intentos con `microchipId` (Feature 012, Bloque B, #23, T1640; REQ-CHP12-005, NFR-012-006): `ip_rate_events`, ventana móvil de 24 h, SIN FK a `users`.
 * La clave de cada contador es un HMAC opaco (`u:<hmac(usuario)>`, `i:<hmac(IP o /64)>`) o `*` (global); nunca el chip, la IP ni el identificador en claro. Solo se obtiene dentro de
 * `UnitOfWorkPort.runInTransaction`: comprobar y registrar es atómico porque ambos ocurren en la misma transacción (los motores serializan las escrituras).
 *
 * @implements REQ-CHP12-005, INV-CHP12-007, NFR-012-006
 */

export type IpRateScope = 'CHIP_LOOKUP' | 'CHIP_MULTIPART';

export interface IpRateEventRecord {
  readonly id: string;
  readonly scope: IpRateScope;
  /** `u:<hmac>` (usuario), `i:<hmac>` (IP, IPv6 agrupada por /64) o `*` (contador global). */
  readonly ipHmac: string;
  readonly occurredAt: string;
}

export interface IpRateEventRepositoryPort {
  insert(row: IpRateEventRecord): Promise<void>;
  /** Eventos del contador con `occurred_at > sinceExclusive` (ventana móvil). */
  countSince(scope: IpRateScope, key: string, sinceExclusive: string): Promise<number>;
  /** Mantenimiento: borra los eventos anteriores al corte (`occurred_at < cutoffExclusive`); devuelve cuántos. */
  purgeBefore(cutoffExclusive: string): Promise<number>;
  /** Todas las filas (pruebas y diagnóstico), por `occurred_at` e `id`. */
  listAll(): Promise<IpRateEventRecord[]>;
}
