/** Casos de prueba de `semgrep --test` para argos-no-entropy-outside-adapters.yml (no es código de la aplicación). */
import { randomBytes } from 'node:crypto';

export function entropy(): unknown[] {
  return [
    // ruleid: argos-no-entropy-outside-adapters
    Math.random(),
    // ruleid: argos-no-entropy-outside-adapters
    Date.now(),
    // ruleid: argos-no-entropy-outside-adapters
    new Date(),
    // ruleid: argos-no-entropy-outside-adapters
    randomBytes(16),
    // ruleid: argos-no-entropy-outside-adapters
    crypto.randomUUID(),
    // ok: argos-no-entropy-outside-adapters
    new Date('2026-11-05T12:00:00.000Z'),
    // ok: argos-no-entropy-outside-adapters
    Date.parse('2026-11-05'),
  ];
}
