import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Servicio PostgreSQL de pruebas (REQ-PG-001, T418).
 * Única lectura de process.env permitida en tests/ para PostgreSQL: TEST_DATABASE_URL (nunca en src/, INV-ARCH-006).
 * Sin la variable, el bloque se OMITE y el motivo aparece en el nombre del bloque.
 */
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe('docker-compose.test.yml (estático, sin Docker)', () => {
  const compose = readFileSync(new URL('../../../docker-compose.test.yml', import.meta.url), 'utf8');
  it('declara postgres 17 con healthcheck y puerto solo en loopback', () => {
    expect(compose).toMatch(/image:\s*postgres:17\b/);
    expect(compose).toContain('pg_isready');
    expect(compose).toMatch(/127\.0\.0\.1:\d+:5432/);
  });
  it('.env.example documenta TEST_DATABASE_URL sin valor real', () => {
    const env = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    expect(env).toMatch(/^# TEST_DATABASE_URL=$/m);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'PostgreSQL de pruebas (SE OMITE: falta la variable TEST_DATABASE_URL; levanta docker-compose.test.yml y defínela)',
  () => {
    it('TEST_DATABASE_URL es una URL postgres', () => {
      expect(TEST_DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
    });
  },
);
