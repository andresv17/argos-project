/**
 * Esquema vigente de PostgreSQL para las pruebas contra un Postgres real (H-J-2).
 * Descubre TODAS las migraciones del directorio real en orden lexicográfico (0001, 0002, ...), de modo que una migración nueva
 * entra sola al arranque de las suites y no deja un BASELINE desactualizado.
 */
import { readdirSync, readFileSync } from 'node:fs';

export const POSTGRES_MIGRATIONS_DIR = new URL('../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);

export function postgresMigrationFiles(): string[] {
  return readdirSync(POSTGRES_MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

/** SQL concatenado de todas las migraciones, en orden. */
export function allPostgresMigrationsSql(): string {
  return postgresMigrationFiles()
    .map((name) => readFileSync(new URL(name, POSTGRES_MIGRATIONS_DIR), 'utf8'))
    .join('\n');
}
