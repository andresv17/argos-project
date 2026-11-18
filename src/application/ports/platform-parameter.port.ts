/**
 * Puertos de parámetros de plataforma (feature 005).
 * - `PlatformParameterRepositoryPort`: lectura cruda del texto de la fila (la implementan SQLite y Postgres).
 * - `PlatformParameterPort`: valor entero ya interpretado con el catálogo del código, con caché por instancia (D5-07).
 * @implements REQ-PRM-001, REQ-PRM-002
 */
import type { KnownParameterKey, ParameterWarningReason } from '../../domain/platform/platform-parameters.ts';

export interface PlatformParameterRepositoryPort {
  /** Texto de la fila o `null` si la clave no existe. No interpreta ni valida. */
  findValue(key: string): Promise<string | null>;
}

/** Aviso sin datos: lleva la clave y el motivo, nunca el valor leído. */
export interface ParameterWarning {
  readonly key: KnownParameterKey;
  readonly reason: ParameterWarningReason;
}

export interface PlatformParameterPort {
  getInt(key: KnownParameterKey): Promise<number>;
}
