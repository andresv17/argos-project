import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** TASK-112: reglas de capa de src/presentation (constitución §3.4) sobre el código real. */
const WEB = 'src/presentation/web';
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesOf(full) : [full];
  });
}

const sources = filesOf(WEB).filter((f) => /\.(?:ts|tsx)$/.test(f));
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => {
    const spec = (m[1] ?? m[2] ?? m[3])!;
    return spec.startsWith('.') ? relative('src', normalize(join(dirname(file), spec))) : `paquete:${spec}`;
  });

describe('TASK-112: arquitectura de la presentación', () => {
  it('[INV-ARCH-004][REQ-UI-002] src/presentation/web solo importa de sí misma, de módulos concretos de src/generated y de react, react-dom y react-router-dom', () => {
    const allowed = (target: string): boolean =>
      target.startsWith('presentation/web/') ||
      ['generated/api/client.ts', 'generated/api/openapi-types.ts', 'generated/errors/error-codes.ts', 'generated/errors/field-errors.ts', 'generated/schemas/validators.cjs', 'generated/machines/sanitary-alert.machine.ts'].includes(target) ||
      ['paquete:react', 'paquete:react-dom/client', 'paquete:react-router-dom'].includes(target);
    const offending = sources.flatMap((f) => importsOf(f).filter((t) => !allowed(t)).map((t) => `${f} -> ${t}`));
    expect([sources.length > 10, offending]).toEqual([true, []]);
  });

  it('[REQ-UI-002] sin dependencias de tiempo medido ni entropía en la UI: ni Date, ni performance.now, ni temporizadores, ni Math.random', () => {
    const forbidden = /\bnew Date\b|\bDate\.now\b|\bperformance\.now\b|\bsetTimeout\b|\bsetInterval\b|\bMath\.random\b/;
    expect(sources.filter((f) => forbidden.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('[REQ-UI-002][REQ-UI-007] sin lógica de negocio en componentes: ni capas interiores, ni cálculo de alertas, edades o colores de dueño', () => {
    const components = sources.filter((f) => f.includes('/components/') || f.includes('/pages/'));
    const business = /daysRemaining\s*[<>]=?|diffInCalendarDays|OWNER_COLOR_\$\{|% ?8|totalDays\s*[-+*/]|(?<![\w.])canEdit\s+=\s+(?!=)/;
    const code = (f: string): string => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect([components.length >= 10, components.filter((f) => business.test(code(f)))]).toEqual([true, []]);
  });

  it('[REQ-UI-004] el punto de entrada es index.html → src/presentation/web/main.tsx y la presentación v1 ya no existe', () => {
    const index = readFileSync('index.html', 'utf8');
    const legacy = readdirSync('src/presentation').filter((e) => e !== 'web' && e !== '.gitkeep');
    expect([index.includes('src="/src/presentation/web/main.tsx"'), index.includes('lang="es"'), legacy]).toEqual([true, true, []]);
  });
});
