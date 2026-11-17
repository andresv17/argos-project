import { describe, expect, it } from 'vitest';
import { isMicrochipGlobalViolation, mapMicrochipViolation } from '../../src/application/use-cases/microchip-violation.ts';
import { DomainError } from '../../src/generated/v31/index.ts';

/**
 * T554 [REQ-PET4-001][INV-PET4-001][SC-CAT-022]: el caso de uso mapea a ERR-PET-MICROCHIP-DUPLICATE SOLO la violación de la restricción
 * única `pets_microchip_global` (Postgres: code 23505 y constraint exacta; SQLite: «UNIQUE constraint failed: pets.microchip_id»). Cualquier
 * otra violación (CHECK, NOT NULL, otro índice, clave primaria) no es un duplicado de microchip, y el objeto de error del driver nunca se
 * propaga dentro del error de dominio.
 */
const CHIP = '985112345678901';
const pg = (code: string, constraint: string) =>
  Object.assign(new Error(`violación (${CHIP})`), { code, constraint, detail: `Key (microchip_id)=(${CHIP}) already exists.`, table: 'pets', parameters: [CHIP] });
const sqlite = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('isMicrochipGlobalViolation (REQ-PET4-001)', () => {
  it('[REQ-PET4-001] Postgres: 23505 con la restricción pets_microchip_global es duplicado; 23505 de otra restricción, CHECK (23514) y NOT NULL (23502) no', () => {
    expect(isMicrochipGlobalViolation(pg('23505', 'pets_microchip_global'))).toBe(true);
    for (const [code, constraint] of [['23505', 'pets_pkey'], ['23505', 'users_username_lower'], ['23505', 'pets_owner_microchip'], ['23514', 'pets_microchip_id_check'], ['23502', 'pets_microchip_global'], ['23503', 'pets_microchip_global']] as const) {
      expect(isMicrochipGlobalViolation(pg(code, constraint)), `${code} ${constraint}`).toBe(false);
    }
  });

  it('[REQ-PET4-001] SQLite: «UNIQUE constraint failed: pets.microchip_id» es duplicado; otras columnas, CHECK y el índice por propietario antiguo no', () => {
    expect(isMicrochipGlobalViolation(sqlite('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: pets.microchip_id'))).toBe(true);
    for (const [code, message] of [
      ['SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: pets.owner_user_id, pets.microchip_id'],
      ['SQLITE_CONSTRAINT_PRIMARYKEY', 'UNIQUE constraint failed: pets.id'],
      ['SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: users.username'],
      ['SQLITE_CONSTRAINT_CHECK', 'CHECK constraint failed: microchip_id IS NULL OR (length(microchip_id) = 15 AND microchip_id NOT GLOB \'*[^0-9]*\')'],
      ['SQLITE_CONSTRAINT_NOTNULL', 'NOT NULL constraint failed: pets.owner_user_id'],
      ['SQLITE_ERROR', 'UNIQUE constraint failed: pets.microchip_id'],
    ] as const) {
      expect(isMicrochipGlobalViolation(sqlite(code, message)), `${code} ${message}`).toBe(false);
    }
  });

  it('[REQ-PET4-001] lo que no es un error de base de datos nunca es un duplicado', () => {
    for (const value of [null, undefined, 'pets_microchip_global', 23505, {}, { code: '23505' }, new Error('UNIQUE constraint failed: pets.microchip_id')]) expect(isMicrochipGlobalViolation(value)).toBe(false);
  });
});

describe('mapMicrochipViolation (REQ-PET4-001, INV-PET4-001)', () => {
  it('[SC-CAT-022] el duplicado se mapea al mismo error uniforme (409, campo microchipId, detalle del catálogo 3.1.0) sin ningún dato del driver ni el microchip', async () => {
    for (const driverError of [pg('23505', 'pets_microchip_global'), sqlite('SQLITE_CONSTRAINT_UNIQUE', 'UNIQUE constraint failed: pets.microchip_id')]) {
      const thrown = await mapMicrochipViolation(() => Promise.reject(driverError)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(thrown).toBeInstanceOf(DomainError);
      const error = thrown as DomainError;
      expect([error.code, error.status, error.field, error.invariantRef, error.detail]).toEqual([
        'ERR-PET-MICROCHIP-DUPLICATE',
        409,
        'microchipId',
        'INV-PET4-001',
        'Este microchip ya está registrado en ARGOS. Si es tuyo, contacta al administrador.',
      ]);
      const everything = JSON.stringify(error) + error.message + String(error.stack) + JSON.stringify(error.toProblemDetails('/api/pets'));
      for (const leaked of [CHIP, 'Key (', 'pets_microchip_global', '23505', 'UNIQUE constraint']) expect(everything, leaked).not.toContain(leaked);
      expect(Object.getOwnPropertyNames(error)).not.toContain('cause');
    }
  });

  it('[SC-CAT-022] el resultado y cualquier otro error pasan sin cambios (un CHECK no se reporta como duplicado)', async () => {
    expect(await mapMicrochipViolation(() => Promise.resolve('guardado'))).toBe('guardado');
    const check = pg('23514', 'pets_microchip_id_check');
    const thrown = await mapMicrochipViolation(() => Promise.reject(check)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(thrown).toBe(check);
  });
});
