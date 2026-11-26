/**
 * Reloj del portal `/admin` (T1528, H-011-2): el panel recibe el reloj como función inyectable (`Clock`) y no invoca `Date.now()` en su cuerpo
 * (INV-ARCH-001); el portal no importa de `web/` (t1235 A10/A16/A17).
 *
 * @implements REQ-ADM9-001
 */
export type Clock = () => number;

/**
 * Reloj del sistema para la UI admin. Se usa `Date.now()` directo, sin `ClockPort`, por alcance de 011; la solución de fondo
 * (`ClockPort` entregado desde la composición) queda fuera de 011. La excepción se declara de forma explícita con `nosemgrep`.
 */
export const systemClock: Clock = () =>
  // nosemgrep: tests.security.sast-rules.argos-no-entropy-outside-adapters
  Date.now();
