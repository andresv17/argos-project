/**
 * Límite de lecturas de la ficha pública por IP (Feature 012, Bloque D, #32; REQ-QR12-007, INV-QR12-006, SC-012-087, SC-012-129): `QR_SCAN_MAX_PER_IP_PER_MINUTE` = 30 por IP y minuto, contador EN MEMORIA por proceso
 * (no escribe en la base en cada GET público; con N instancias el tope efectivo es de hasta N × 30, riesgo aceptado: el token de 256 bits impide la enumeración).
 * - Clave: HMAC de la IP efectiva (IPv4 completa; IPv6 por su prefijo /64: dos direcciones del mismo /64 comparten contador). Nunca se guarda la IP en claro.
 * - Mapa ACOTADO (`QR_SCAN_MAX_TRACKED_IPS`): lleno, primero se descartan las entradas con la ventana vencida; si sigue lleno se expulsa la MENOS RECIENTE (LRU) y se cuenta la expulsión; la petición se atiende
 *   (no se rechaza por mapa lleno: indisponibilidad en una emergencia). La expulsión solo reinicia el contador de una IP.
 * - IP no resuelta: falla ABIERTA (se atiende) y se cuenta en un contador operativo sin IP ni token; NUNCA se comparte un bucket global.
 *
 * @implements REQ-QR12-007, INV-QR12-006, SC-012-087, SC-012-129
 */
import { createHmac } from 'node:crypto';
import { normalizeClientIp } from '../../domain/sharing/client-ip.ts';
import { QR_SCAN_MAX_PER_IP_PER_MINUTE, QR_SCAN_MAX_TRACKED_IPS } from '../../domain/platform/feature-012-limits.ts';

const WINDOW_MS = 60_000;

interface Entry {
  windowStart: number;
  count: number;
}

export interface ScanVerdict {
  readonly limited: boolean;
  /** Segundos hasta que la ventana se renueva (solo con `limited`). */
  readonly retryAfterSeconds: number;
}

export interface EmergencyScanLimiterOptions {
  /** Clave HMAC (≥ 32 caracteres) con la que se reduce la IP a una clave opaca. */
  readonly secret: string;
  /** Reloj en milisegundos desde la época (reloj inyectado de la aplicación). */
  readonly nowMs: () => number;
  readonly maxPerMinute?: number;
  readonly maxTracked?: number;
}

export class EmergencyScanLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxPerMinute: number;
  private readonly maxTracked: number;
  /** Contadores operativos (alerta documentada): sin IP ni token. */
  private evictionsCounter = 0;
  private unresolvedCounter = 0;

  constructor(private readonly options: EmergencyScanLimiterOptions) {
    this.maxPerMinute = options.maxPerMinute ?? QR_SCAN_MAX_PER_IP_PER_MINUTE;
    this.maxTracked = options.maxTracked ?? QR_SCAN_MAX_TRACKED_IPS;
  }

  get evictions(): number {
    return this.evictionsCounter;
  }
  get unresolved(): number {
    return this.unresolvedCounter;
  }
  get tracked(): number {
    return this.entries.size;
  }

  /** Cuenta una petición del prefijo público (GET, HEAD u OPTIONS; válida o no) y dice si supera el tope. */
  hit(ip: string | undefined): ScanVerdict {
    const normalized = ip === undefined ? 'unknown' : normalizeClientIp(ip);
    if (normalized === 'unknown') {
      this.unresolvedCounter += 1;
      return { limited: false, retryAfterSeconds: 0 };
    }
    const now = this.options.nowMs();
    const key = createHmac('sha256', this.options.secret).update(normalized, 'utf8').digest('hex');
    let entry = this.entries.get(key);
    if (entry === undefined || now - entry.windowStart >= WINDOW_MS) entry = { windowStart: now, count: 0 };
    entry.count += 1;
    this.entries.delete(key); // reinserta al final: orden de recencia (LRU)
    this.entries.set(key, entry);
    this.shrink(now);
    if (entry.count <= this.maxPerMinute) return { limited: false, retryAfterSeconds: 0 };
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)) };
  }

  private shrink(now: number): void {
    if (this.entries.size <= this.maxTracked) return;
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart >= WINDOW_MS) this.entries.delete(key);
    }
    while (this.entries.size > this.maxTracked) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
      this.evictionsCounter += 1;
    }
  }
}
