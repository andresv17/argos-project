import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T826 (006, Fase 3): pureza de capas y de entropía de la escena, por análisis estático de los fuentes.
 * - `src/domain/scene`: sin `Date`, sin entropía (`Math.random`, `randomUUID`, `getRandomValues`), sin `node:*`, y solo importa tipos generados de `v34`
 *   (INV-ESC6-001, INV-ESC6-002, INV-ARCH-001/002, SC-ESC6-023).
 * - `src/application/` (y en particular los puertos de la escena): sin `fs`, `fetch`, SDK del proveedor ni `process.env` (INV-ESC6-002, INV-ARCH-004, INV-ARCH-006,
 *   REQ-ESC6-017, SC-ESC6-025).
 * El dominio de escena llega en la Fase 4: mientras no exista la carpeta, su barrido es vacío pero el detector se prueba contra textos prohibidos.
 */
const SRC = join(process.cwd(), 'src');

function filesOf(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesOf(full) : /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Quita comentarios para no confundir una mención documental con un uso. */
const code = (text: string): string => text.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ENTROPY = /\bnew\s+Date\b|\bDate\s*\.\s*(?:now|parse|UTC)\b|\bMath\s*\.\s*random\b|\brandomUUID\b|\bgetRandomValues\b|\brandomBytes\b|\bperformance\s*\.\s*now\b/;
const NODE_IMPORT = /(?:from|import)\s*\(?\s*['"]node:/;
const IO_AND_ENV = /\bprocess\s*\.\s*env\b|\bfetch\s*\(|(?:from|import)\s*\(?\s*['"](?:node:)?fs(?:\/promises)?['"]|(?:from|import)\s*\(?\s*['"](?:@google[^'"]*|google-auth-library|@anthropic-ai[^'"]*|openai|axios|undici)['"]/;
const IMPORT_SPEC = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const sceneDomain = (): string[] => filesOf(join(SRC, 'domain', 'scene'));
const sceneApplication = (): string[] => filesOf(join(SRC, 'application')).filter((f) => /(?:^|\/)scene[^/]*\.ts$/.test(f));
const read = (file: string): string => code(readFileSync(file, 'utf8'));
const rel = (file: string): string => relative(process.cwd(), file);

describe('detectores de pureza (T826): detectan lo prohibido y no confunden comentarios', () => {
  it('[INV-ESC6-001] el detector de entropía reconoce Date, Math.random y randomUUID y no marca comentarios', () => {
    for (const bad of ['const a = new Date();', 'Date.now()', 'Math.random()', 'randomUUID()', 'crypto.getRandomValues(x)', 'randomBytes(8)']) expect(ENTROPY.test(bad)).toBe(true);
    expect(ENTROPY.test(code('// usa Date.now() solo en infraestructura\nconst a = 1;'))).toBe(false);
  });

  it('[INV-ESC6-002] el detector de E/S reconoce fs, fetch, process.env y SDK, y el de node: reconoce el prefijo', () => {
    for (const bad of ["import fs from 'node:fs'", "import { readFile } from 'fs/promises'", 'await fetch(url)', 'process.env.X', "import { X } from '@google/genai'", "import 'google-auth-library'"]) {
      expect(IO_AND_ENV.test(bad)).toBe(true);
    }
    expect(NODE_IMPORT.test("import { createHash } from 'node:crypto'")).toBe(true);
    expect(NODE_IMPORT.test("import type { X } from './x.ts'")).toBe(false);
  });
});

describe('src/domain/scene: determinismo y dependencias (T826, INV-ESC6-001, INV-ARCH-001/002, SC-ESC6-023)', () => {
  it('[INV-ESC6-001] ningún archivo de src/domain/scene usa Date ni entropía', () => {
    expect(sceneDomain().filter((f) => ENTROPY.test(read(f))).map(rel)).toEqual([]);
  });

  it('[INV-ARCH-001] ningún archivo de src/domain/scene importa node:*', () => {
    expect(sceneDomain().filter((f) => NODE_IMPORT.test(read(f))).map(rel)).toEqual([]);
  });

  it('[INV-ESC6-002] src/domain/scene solo importa relativos de domain o de generated/v34, y sin paquetes', () => {
    const offenders = sceneDomain().flatMap((f) =>
      [...read(f).matchAll(IMPORT_SPEC)]
        .map((m) => m[1]!)
        .filter((spec) => !(spec.startsWith('.') && (/\/generated\/v34\//.test(spec) || !/\/(?:application|infrastructure|presentation)\//.test(spec))))
        .map((spec) => `${rel(f)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('src/application: sin fs, fetch, SDK ni process.env (T826, INV-ESC6-002, INV-ARCH-006, SC-ESC6-025)', () => {
  it('[INV-ESC6-002] ningún archivo de src/application usa fs, fetch, un SDK de proveedor ni process.env', () => {
    expect(filesOf(join(SRC, 'application')).filter((f) => IO_AND_ENV.test(read(f))).map(rel)).toEqual([]);
  });

  it('[INV-ESC6-001] los archivos de escena de application (scene*.ts) no usan Date ni entropía y no importan node:*', () => {
    expect(sceneApplication().filter((f) => ENTROPY.test(read(f)) || NODE_IMPORT.test(read(f))).map(rel)).toEqual([]);
  });

  it('[REQ-ESC6-017] existen los puertos de la escena (cuatro archivos: generador, despachador, repositorios y ganchos) en src/application/ports (T827) y se exportan desde el índice de puertos', () => {
    const ports = ['scene-image-generator.port.ts', 'scene-job-dispatcher.port.ts', 'scene-repositories.port.ts', 'scene-privacy-hooks.port.ts'];
    expect(ports.filter((p) => !existsSync(join(SRC, 'application', 'ports', p)))).toEqual([]);
    const index = readFileSync(join(SRC, 'application', 'ports', 'index.ts'), 'utf8');
    expect(ports.filter((p) => !index.includes(`./${p}`))).toEqual([]);
  });

  it('[INV-ESC6-002] los puertos de la escena solo importan tipos (import type), de application, domain o generated, y nada de infrastructure', () => {
    const files = filesOf(join(SRC, 'application', 'ports')).filter((f) => /scene[^/]*\.port\.ts$/.test(f));
    expect(files.length).toBe(4);
    const offenders = files.flatMap((f) =>
      [...read(f).matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => `${rel(f)} -> import de valor ${m[1]!}`),
    );
    const infra = files.filter((f) => /infrastructure|presentation/.test([...read(f).matchAll(IMPORT_SPEC)].map((m) => m[1]).join(' '))).map(rel);
    expect([offenders, infra]).toEqual([[], []]);
  });
});
