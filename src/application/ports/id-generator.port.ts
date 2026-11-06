/**
 * Generador de identificadores inyectado (constitución §3.2): nextId() devuelve un UUID v4.
 *
 * @implements INV-ARCH-002, INV-ARCH-004
 */
export interface IdGeneratorPort {
  nextId(): string;
}
