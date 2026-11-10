/**
 * Hashing de contraseñas inyectado, con la firma exacta de la constitución.
 * El hash ficticio de INV-AUTH-006 no forma parte del puerto: lo provee la infraestructura como dependencia
 * aparte (`ApplicationDeps.dummyPasswordHash`), con el mismo coste que un hash real.
 *
 * @implements INV-ARCH-002, INV-ARCH-004, INV-AUTH-006
 */
export interface PasswordHasherPort {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
