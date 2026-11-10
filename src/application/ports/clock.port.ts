/**
 * Reloj inyectado. Prohíbe relojes globales en domain/ y application/.
 * - todayIsoDate(): fecha calendario YYYY-MM-DD en APP_TIMEZONE (por defecto America/Bogota).
 * - nowIsoTimestamp(): UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ.
 *
 * @implements INV-ARCH-001, INV-ARCH-004
 */
export interface ClockPort {
  todayIsoDate(): string;
  nowIsoTimestamp(): string;
}
