import { describe, expect, it } from 'vitest';
import { isUsernameLowerViolation, mapUsernameViolation } from '../../src/application/use-cases/username-violation.ts';
import { DomainError } from '../../src/generated/v31/index.ts';

/**
 * H-O-004US3-4 [REQ-LOG-002][INV-LOG-001][EDGE-009]: una violación de la restricción única `users_username_lower` al insertar (carrera entre
 * dos altas que ya pasaron la comprobación previa) se traduce a ERR-AUTH-USERNAME-TAKEN (clase 3.1.0, campo `username`, 409) y NO a un 500.
 * Cualquier otra violación pasa sin cambios. El error del driver nunca se copia al error de dominio.
 */
const NAME = 'Nuevo.Usuario';
const pg = (code: string, constraint: string) =>
  Object.assign(new Error(`violación (${NAME})`), { code, constraint, detail: `Key (lower(username::text))=(nuevo.usuario) already exists.`, table: 'users' });
const sqlite = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('isUsernameLowerViolation (INV-LOG-001)', () => {
  it('[INV-LOG-001] Postgres: 23505 con users_username_lower es duplicado; otra restricción, CHECK y NOT NULL no', () => {
    expect(isUsernameLowerViolation(pg('23505', 'users_username_lower'))).toBe(true);
    for (const [code, constraint] of [['23505', 'users_pkey'], ['23505', 'pets_microchip_global'], ['23514', 'users_username_lower'], ['23502', 'users_username_lower']] as const) {
      expect(isUsernameLowerViolation(pg(code, constraint)), `${code} ${constraint}`).toBe(false);
    }
  });

  it('[INV-LOG-001] SQLite: «UNIQUE constraint failed: index \'users_username_lower\'» es duplicado; otros índices y códigos no', () => {
    expect(isUsernameLowerViolation(sqlite('SQLITE_CONSTRAINT_UNIQUE', "UNIQUE constraint failed: index 'users_username_lower'"))).toBe(true);
    for (const [code, message] of [
      ['SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: users.id'],
      ['SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: pets.microchip_id'],
      ['SQLITE_ERROR', "UNIQUE constraint failed: index 'users_username_lower'"],
    ] as const) {
      expect(isUsernameLowerViolation(sqlite(code, message)), `${code} ${message}`).toBe(false);
    }
  });

  it('[INV-LOG-001] lo que no es un error de base de datos nunca es un duplicado', () => {
    for (const value of [null, undefined, 'users_username_lower', 23505, {}, { code: '23505' }]) expect(isUsernameLowerViolation(value)).toBe(false);
  });
});

describe('mapUsernameViolation (INV-LOG-001)', () => {
  it('[EDGE-009] la violación se mapea a ERR-AUTH-USERNAME-TAKEN (409, campo username, clase 3.1.0) sin ningún dato del driver', async () => {
    for (const driverError of [pg('23505', 'users_username_lower'), sqlite('SQLITE_CONSTRAINT_UNIQUE', "UNIQUE constraint failed: index 'users_username_lower'")]) {
      const thrown = await mapUsernameViolation(() => Promise.reject(driverError)).then(() => null, (e: unknown) => e);
      expect(thrown).toBeInstanceOf(DomainError);
      const error = thrown as DomainError;
      expect([error.code, error.status, error.field]).toEqual(['ERR-AUTH-USERNAME-TAKEN', 409, 'username']);
      const everything = JSON.stringify(error) + error.message + String(error.stack) + JSON.stringify(error.toProblemDetails('/api/auth/register'));
      for (const leaked of [NAME, 'nuevo.usuario', 'Key (', 'users_username_lower', '23505', 'UNIQUE constraint']) expect(everything, leaked).not.toContain(leaked);
      expect(Object.getOwnPropertyNames(error)).not.toContain('cause');
    }
  });

  it('[INV-LOG-001] el resultado y cualquier otro error pasan sin cambios', async () => {
    expect(await mapUsernameViolation(() => Promise.resolve('ok'))).toBe('ok');
    const other = pg('23514', 'users_username_check');
    expect(await mapUsernameViolation(() => Promise.reject(other)).then(() => null, (e: unknown) => e)).toBe(other);
  });
});
