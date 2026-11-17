import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T599 (SC-CAT-033, INV-RAZ-002): ningún módulo de src/domain/ de peso, edad o alertas referencia `breedCode` ni `breed`.
 * El cálculo de peso, edad estimada y alertas no depende de la raza. Se escanea el código real (sin comentarios).
 */
const DOMAIN = 'src/domain';
const BREED = /\bbreed(?:Code|[A-Z]\w*)?\b|breed-catalog/gi;

const walk = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : /\.(?:ts|tsx)$/.test(entry) ? [full] : [];
    });

/** Módulos de peso, edad o alertas: por carpeta (alerts/), o por nombre de archivo (weight, age, alert). */
const isTarget = (file: string): boolean => /\/alerts\//.test(file) || /(?:weight|age|alert)/i.test(file.split('/').pop()!);

const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const targets = walk(DOMAIN).filter(isTarget);

describe('T599 SC-CAT-033: dominio de peso, edad y alertas sin raza', () => {
  it('descubre los módulos de peso, edad y alertas conocidos', () => {
    expect(targets).toEqual(
      expect.arrayContaining([
        'src/domain/alerts/sanitary-alert-evaluator.ts',
        'src/domain/pet/estimated-age.ts',
        'src/domain/records/weight-limits.ts',
      ]),
    );
  });

  it('detecta breedCode y breed en un texto de control (el escáner no es ciego)', () => {
    const muestra = stripComments('const a = pet.breedCode;\nconst b = pet.breed; // breed en comentario');
    expect(muestra.match(BREED)).toEqual(['breedCode', 'breed']);
  });

  it.each(targets)('%s no referencia breedCode ni breed', (file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    const hits = code
      .split('\n')
      .flatMap((line, i) => (line.match(BREED) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });
});
