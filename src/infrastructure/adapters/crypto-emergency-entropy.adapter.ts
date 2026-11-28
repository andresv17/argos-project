/**
 * Entropía del token de la ficha QR (Feature 012, Bloque D, #32; REQ-QR12-003, INV-QR12-001): 32 bytes (256 bits) del CSPRNG del sistema por llamada. El dominio no lee azar: recibe estos bytes por el puerto
 * `EmergencyServices.entropy` (`node:crypto` solo vive en infraestructura).
 *
 * @implements REQ-QR12-003, INV-QR12-001, INV-ARCH-002
 */
import { randomBytes } from 'node:crypto';

export class CryptoEmergencyEntropyAdapter {
  next32(): Uint8Array {
    return new Uint8Array(randomBytes(32));
  }
}
