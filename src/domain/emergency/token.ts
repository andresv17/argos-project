/**
 * Token opaco de la ficha QR (Feature 012, Bloque D, #32; REQ-QR12-003, INV-QR12-001, SC-012-052): 256 bits del puerto CSPRNG en base64url sin relleno (43 caracteres). Solo se guarda su SHA-256 hexadecimal.
 * Funciones puras: la entropía llega por parámetro (la aporta un puerto), nunca se lee un generador de azar aquí.
 *
 * @implements REQ-QR12-003, INV-QR12-001, SC-012-052
 */
import { sha256Hex } from '../audit/sha256.ts';
import { DomainError } from '../../generated/v38/index.ts';
import { QR_TOKEN_PATTERN } from '../platform/feature-012-limits.ts';

export const EMERGENCY_TOKEN_ENTROPY_BYTES = 32;

/** Token de 43 caracteres a partir de EXACTAMENTE 32 bytes de entropía. */
export function generateEmergencyToken(entropy: Uint8Array): string {
  if (entropy.length !== EMERGENCY_TOKEN_ENTROPY_BYTES) throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'La entropía del token de la ficha debe ser de 32 bytes.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let token = '';
  for (let i = 0; i < entropy.length; i += 3) {
    const chunk = (entropy[i]! << 16) | ((entropy[i + 1] ?? 0) << 8) | (entropy[i + 2] ?? 0);
    token += alphabet[(chunk >> 18) & 63]! + alphabet[(chunk >> 12) & 63]! + alphabet[(chunk >> 6) & 63]! + alphabet[chunk & 63]!;
  }
  return token.slice(0, 43); // 32 bytes = 256 bits = 42 grupos de 6 bits + 4 bits: 43 caracteres base64url sin relleno
}

/** SHA-256 hexadecimal (64) del token. Se calcula también para valores mal formados: no hay cortocircuito observable (SC-012-084). */
export function hashEmergencyToken(token: string): string {
  return sha256Hex(token);
}

/** Solo la forma `^[A-Za-z0-9_-]{43}$`; el valor mal formado igualmente se hashea y se consulta (mismo 404). */
export function isWellFormedEmergencyToken(token: string): boolean {
  return QR_TOKEN_PATTERN.test(token);
}
