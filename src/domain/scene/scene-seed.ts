/**
 * Semilla determinista por intento de la escena (feature 007, REQ-ESC7-007): `deriveSceneSeed(attemptId)` es FNV-1a de 32 bits sobre los code points del identificador del
 * intento, con máscara `0x7fffffff` (entero `0 <= seed <= 2^31 - 1`, el rango que admite `generationConfig.seed` del proveedor). Mismo `attempt.id` da la misma semilla (un
 * reintento del mismo intento es reproducible); intentos distintos dan semillas distintas con probabilidad práctica (no se exige inyectividad).
 *
 * Función pura y total: no lee reloj, entropía ni entorno, y no importa nada (INV-ARCH-001, INV-ARCH-002, INV-ESC6-001). El identificador ya lo emite el puerto
 * `IdGeneratorPort` de la aplicación. La semilla NO entra en `inputs_snapshot` ni en la huella, no se persiste ni se registra y no contiene datos personales (INV-ESC6-010).
 *
 * @implements REQ-ESC7-007, REQ-ESC7-008, EDGE-007-025, INV-ARCH-001, INV-ARCH-002
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
/** Máscara de 31 bits: el mayor entero que cabe en un entero con signo de 32 bits. */
const SEED_MASK = 0x7fffffff;

export function deriveSceneSeed(attemptId: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const char of attemptId) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0) & SEED_MASK;
}
