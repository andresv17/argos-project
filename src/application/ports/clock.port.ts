/**
 * Reloj inyectado. Prohíbe relojes globales en domain/ y application/.
 * - todayIsoDate(): fecha calendario YYYY-MM-DD en APP_TIMEZONE (por defecto America/Bogota).
 * - nowIsoTimestamp(): UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ.
 * - timeZone: la zona IANA de la aplicación (APP_TIMEZONE); es la zona inicial del perfil (REQ-ACC-001, REQ-TIME-001).
 *
 * @implements INV-ARCH-001, INV-ARCH-004
 */
export interface ClockPort {
  readonly timeZone: string;
  todayIsoDate(): string;
  nowIsoTimestamp(): string;
}
