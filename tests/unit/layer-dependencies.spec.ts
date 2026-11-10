import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * INV-ARCH-004: regla de dependencia concéntrica, comprobada sobre los imports reales de src/.
 * Presentación queda fuera: su reescritura es de (DEUDA-PRES-001).
 */
const SRC = 'src';
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesOf(full) : /\.(?:ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/** Capa de destino de cada import: carpeta de src/ para los relativos, `node:` o `paquete` para el resto. */
function importsOf(file: string): Array<{ readonly specifier: string; readonly target: string }> {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT)].map((m) => {
    const specifier = (m[1] ?? m[2] ?? m[3])!;
    if (!specifier.startsWith('.')) return { specifier, target: specifier.startsWith('node:') ? 'node:' : 'paquete' };
    const resolved = relative(SRC, normalize(join(dirname(file), specifier)));
    return { specifier, target: resolved.startsWith('..') ? 'fuera-de-src' : resolved.split('/')[0]! };
  });
}

function violations(layer: string, allowed: readonly string[]): string[] {
  return filesOf(join(SRC, layer)).flatMap((file) =>
    importsOf(file)
      .filter(({ target }) => !allowed.includes(target))
      .map(({ specifier, target }) => `${file} -> ${specifier} (${target})`),
  );
}

describe('regla de dependencia concéntrica sobre los imports de src/', () => {
  it('[INV-ARCH-004] src/domain solo importa de src/domain y src/generated', () => {
    expect(violations('domain', ['domain', 'generated'])).toEqual([]);
  });

  it('[INV-ARCH-004] src/application solo importa de src/application, src/domain y src/generated', () => {
    expect(violations('application', ['application', 'domain', 'generated'])).toEqual([]);
  });

  it('[INV-ARCH-004] src/infrastructure implementa los puertos: importa de application, domain, generated, sí misma, node: y paquetes, nunca de presentation', () => {
    expect(violations('infrastructure', ['infrastructure', 'application', 'domain', 'generated', 'node:', 'paquete'])).toEqual([]);
  });

  it('[INV-ARCH-004] ninguna capa interior importa de src/infrastructure, y el análisis detecta los imports de cada capa', () => {
    const inner = ['domain', 'application', 'generated'].flatMap((layer) => filesOf(join(SRC, layer)).flatMap((f) => importsOf(f).map((i) => i.target)));
    const infrastructureTargets = new Set(filesOf(join(SRC, 'infrastructure')).flatMap((f) => importsOf(f).map((i) => i.target)));
    expect([inner.includes('infrastructure'), inner.includes('presentation'), [...infrastructureTargets].sort()]).toEqual([
      false,
      false,
      ['application', 'domain', 'generated', 'infrastructure', 'node:', 'paquete'],
    ]);
  });
});
