/**
 * Vista pública canónica de una entidad para la auditoría (REQ-AUD-001, INV-AUD-001, SC-012).
 * Excluye a cualquier profundidad (también dentro de arreglos) los campos de identidad personal (email, displayName,
 * microchipId; decisión T2 + R2) y la lista canónica de secretos (password, passwordHash/password_hash, token,
 * tokenHash/token_hash, confirmationToken/confirmation_token, cookie). `sessionId` NO es secreto y se conserva.
 * No muta la entrada.
 *
 * @implements REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-001
 */

export const PERSONAL_KEYS: ReadonlySet<string> = new Set(['email', 'displayName', 'microchipId']);

export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'token_hash',
  'confirmationToken',
  'confirmation_token',
  'cookie',
]);

const isExcluded = (key: string): boolean => PERSONAL_KEYS.has(key) || SECRET_KEYS.has(key);

/** Copia profunda de `value` sin las claves excluidas. */
export function toCanonicalView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => toCanonicalView(item));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!isExcluded(key)) result[key] = toCanonicalView(item);
    }
    return result;
  }
  return value;
}
