/**
 * Límite de tasa en memoria de la superficie pública del enlace (feature 005, REQ-VET-007, D5-13, MIF-005-12, PN-11): hasta 20 FALLOS por IP efectiva en una
 * ventana de 10 minutos; el siguiente intento recibe 429 sin tocar la base de datos ni resolver el token.
 * - Un `Map` por clave (IP normalizada) con el inicio de ventana y el contador; el barrido retira las ventanas vencidas y hay un TOPE DURO de entradas.
 *   Sin estructura de expulsión del más antiguo: con el tope lleno tras el barrido una IP nueva queda limitada (429 fail-closed) y el mapa nunca crece.
 * - Solo cuentan los fallos; los éxitos no se registran y un token válido NO está exento (PN-11).
 * - Es estado de UNA instancia (D5-13, TECHDEBT-005-01): con N instancias el tope efectivo es 20 x N por ventana; Cloud Armor sería decisión de Nivel 2.
 * El reloj llega como argumento (instante canónico de la petición): la clase no lee el reloj del sistema (INV-ARCH-001).
 *
 * @implements REQ-VET-007, INV-005-007, MIF-005-12, SC-005-021, SC-005-041
 */
import { toEpochMillis } from '../../domain/auth/utc-timestamp.ts';

export interface SharedAccessLimiterOptions {
  /** Fallos tolerados por ventana (20). */
  readonly maxFailures?: number;
  /** Ventana en milisegundos (600 000 = 10 minutos). */
  readonly windowMs?: number;
  /** Tope duro de claves distintas en el mapa. */
  readonly maxEntries?: number;
}

interface Entry {
  readonly windowStart: number;
  readonly failures: number;
}

export class SharedAccessLimiter {
  /** `Retry-After` fijo, igual para todos los clientes. */
  static readonly RETRY_AFTER_SECONDS = 600;
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(options: SharedAccessLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? 20;
    this.windowMs = options.windowMs ?? 600_000;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Vacía el mapa (pruebas). */
  reset(): void {
    this.entries.clear();
  }

  /** true si la clave ya agotó sus fallos en la ventana vigente, o si es nueva y el mapa está lleno tras el barrido (fail-closed). */
  isLimited(key: string, now: string): boolean {
    const at = toEpochMillis(now);
    this.sweep(at);
    const entry = this.entries.get(key);
    if (entry === undefined) return this.entries.size >= this.maxEntries;
    return entry.failures >= this.maxFailures;
  }

  /** Anota un fallo; con el tope lleno y la clave nueva no inserta (el mapa jamás supera `maxEntries`). */
  recordFailure(key: string, now: string): void {
    const at = toEpochMillis(now);
    this.sweep(at);
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      this.entries.set(key, { windowStart: entry.windowStart, failures: entry.failures + 1 });
      return;
    }
    if (this.entries.size >= this.maxEntries) return;
    this.entries.set(key, { windowStart: at, failures: 1 });
  }

  /** Retira las ventanas vencidas (`now - inicio >= ventana`). */
  private sweep(at: number): void {
    for (const [key, entry] of this.entries) if (at - entry.windowStart >= this.windowMs) this.entries.delete(key);
  }
}
