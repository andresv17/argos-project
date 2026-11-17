import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * T428 (REQ-PG-010, SC-CLD-011, H-MERO-006): comprobación estática de la composición de server.ts.
 * Con ARGOS_DB_DRIVER=postgres no debe cargarse better-sqlite3 y con sqlite no debe cargarse pg: por eso server.ts
 * no declara imports estáticos de los adaptadores de persistencia ni de sus librerías; solo `import()` dinámico.
 */
const SOURCE = readFileSync('src/infrastructure/http/server.ts', 'utf8');
const STATIC_IMPORT_SOURCES = [...SOURCE.matchAll(/^\s*import\s+(?:type\s+)?[^'"(]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
const SIDE_EFFECT_IMPORTS = [...SOURCE.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
const DYNAMIC_IMPORT_SOURCES = [...SOURCE.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]!);
const FORBIDDEN = /(?:^|\/)(?:sqlite-[a-z-]+(?:\.ts)?|postgres-[a-z-]+(?:\.ts)?|better-sqlite3|pg)$/;

describe('composición de server.ts (comprobación estática, T428)', () => {
  it('[REQ-PG-010][SC-CLD-011] no hay imports estáticos de sqlite-*, postgres-*, better-sqlite3 ni pg', () => {
    expect([...STATIC_IMPORT_SOURCES, ...SIDE_EFFECT_IMPORTS].filter((source) => FORBIDDEN.test(source))).toEqual([]);
  });

  it('[REQ-PG-010][SC-CLD-011] los adaptadores de cada driver se cargan solo con import() dinámico', () => {
    expect(DYNAMIC_IMPORT_SOURCES.filter((source) => FORBIDDEN.test(source)).sort()).toEqual([
      '../persistence/postgres/postgres-database.ts',
      '../persistence/postgres/postgres-repositories.ts',
      '../persistence/postgres/postgres-unit-of-work.ts',
      '../persistence/sqlite/sqlite-database.ts',
      '../persistence/sqlite/sqlite-unit-of-work.ts',
    ]);
  });

  it('[INV-ARCH-006] server.ts no lee process.env ni registra la configuración', () => {
    expect([/process\.env/.test(SOURCE), /log\.[a-z]+\(\s*\{[^)]*config/.test(SOURCE)]).toEqual([false, false]);
  });
});
