import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T433 (REQ-CLD-001, REQ-SEC-005, NFR-CLD-011): pruebas estáticas (texto) del Dockerfile y de .dockerignore.
 * No construyen la imagen: el `docker build` y las comprobaciones de tamaño y arranque son de T434.
 */

const ROOT = process.cwd();
const dockerfilePath = join(ROOT, 'Dockerfile');
const ignorePath = join(ROOT, '.dockerignore');

function dockerfile(): string {
  return existsSync(dockerfilePath) ? readFileSync(dockerfilePath, 'utf8') : '';
}
/** Instrucciones sin comentarios, con las continuaciones de línea unidas. */
function instructions(): string[] {
  return dockerfile()
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}
function stages(): string[] {
  return instructions().filter((line) => /^FROM\s/i.test(line));
}
function lastFrom(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) if (/^FROM\s/i.test(lines[i] ?? '')) return i;
  return -1;
}
function ignoreLines(): string[] {
  return existsSync(ignorePath)
    ? readFileSync(ignorePath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'))
    : [];
}

describe('Dockerfile (T433)', () => {
  it('[REQ-CLD-001] existe y es multi-etapa (al menos build y runtime)', () => {
    expect(existsSync(dockerfilePath)).toBe(true);
    expect(stages().length).toBeGreaterThanOrEqual(2);
  });

  it('[NFR-CLD-011] toda etapa parte de node:22.23.4-slim fijada por digest sha256 (o marcador [verificar])', () => {
    const froms = stages();
    expect(froms.length).toBeGreaterThanOrEqual(2);
    for (const from of froms) {
      expect(from).toMatch(/^FROM\s+node:22\.23\.4-slim@sha256:(?:[0-9a-f]{64}|\[verificar\])(?:\s+AS\s+\w+)?$/i);
    }
  });

  it('[REQ-CLD-001] la imagen final corre como usuario no root', () => {
    const lines = instructions();
    const users = lines.filter((l) => /^USER\s/i.test(l));
    expect(users.length).toBeGreaterThanOrEqual(1);
    const last = users[users.length - 1] ?? '';
    expect(last).toMatch(/^USER\s+(?!root\b|0\b)\S+/i);
    expect(lines.lastIndexOf(last)).toBeGreaterThan(lastFrom(lines));
  });

  it('[REQ-CLD-001] la imagen final fija NODE_ENV=production', () => {
    const lines = instructions();
    const finalFrom = lastFrom(lines);
    expect(lines.slice(finalFrom).some((l) => /^ENV\s+.*\bNODE_ENV[= ]production\b/i.test(l))).toBe(true);
  });

  it('[REQ-SEC-005] ningún ENV ni ARG declara secretos ni la URL de la base', () => {
    expect(instructions().length).toBeGreaterThan(0);
    const declared = instructions().filter((l) => /^(ENV|ARG)\s/i.test(l));
    for (const line of declared) {
      expect(line).not.toMatch(/SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|API_?KEY|HMAC|DATABASE_URL|_KEY\b/i);
    }
    expect(dockerfile()).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/);
  });

  it('[REQ-SEC-005] no copia .env ni llaves, y no usa ADD', () => {
    const copies = instructions().filter((l) => /^(COPY|ADD)\s/i.test(l));
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.some((l) => /^ADD\s/i.test(l))).toBe(false);
    for (const line of copies) expect(line).not.toMatch(/\.env|\.pem|\.key|credentials|\.tfstate/i);
  });

  it('[REQ-CLD-001] las dependencias se instalan con npm ci sin ejecutar scripts y el bundle se produce con scripts/build-server.mjs y vite build', () => {
    const text = instructions().join('\n');
    expect(text).toMatch(/npm ci\b[^\n]*--ignore-scripts/);
    expect(text).toContain('scripts/build-server.mjs');
    expect(text).toMatch(/vite build/);
  });

  it('[REQ-CLD-001] la etapa final no instala dependencias, no trae npm y no contiene better-sqlite3', () => {
    const lines = instructions();
    const final = lines.slice(lastFrom(lines));
    expect(final.some((l) => /\bnpm (ci|install|i)\b/.test(l))).toBe(false);
    expect(final.some((l) => /^COPY\s+--from=\w+\s+\S*node_modules/i.test(l))).toBe(false);
    expect(final.join('\n')).toMatch(/rm\s+-rf[^\n]*\/usr\/local\/lib\/node_modules/);
    expect(final.join('\n')).toMatch(/rm\s+-rf[^\n]*\/usr\/local\/bin\/(?:npm|npx)|rm\s+-rf[^\n]*npm/);
    expect(final.join('\n')).not.toMatch(/better-sqlite3/);
  });

  it('[REQ-CLD-001] la imagen final copia solo dist-server y dist de la etapa de build y arranca con node', () => {
    const lines = instructions();
    const final = lines.slice(lastFrom(lines));
    const copies = final.filter((l) => /^COPY\s/i.test(l));
    expect(copies.length).toBeGreaterThanOrEqual(2);
    expect(copies.every((l) => /^COPY\s+--from=\w+\s+(?:--chown=\S+\s+)?\/app\/(?:dist|dist-server)\b/i.test(l) || /^COPY\s+--chown=\S+\s+--from=\w+\s+\/app\/(?:dist|dist-server)\b/i.test(l))).toBe(true);
    expect(final.some((l) => /^CMD\s+\["node",\s*"dist-server\/server\.js"\]$/i.test(l))).toBe(true);
  });

  it('[REQ-CLD-001] el proceso escribe solo en /tmp: sin VOLUME ni carpetas de escritura', () => {
    const lines = instructions();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => /^VOLUME\s/i.test(l))).toBe(false);
    expect(lines.some((l) => /chmod\s+[^\n]*(?:777|a\+w|o\+w)/.test(l))).toBe(false);
  });
});

describe('.dockerignore (T433)', () => {
  it('[REQ-SEC-005] existe y excluye .env, variantes de .env y llaves', () => {
    const lines = ignoreLines();
    expect(existsSync(ignorePath)).toBe(true);
    expect(lines).toContain('.env');
    expect(lines).toContain('.env.*');
    expect(lines.some((l) => /\*\.pem$/.test(l))).toBe(true);
    expect(lines.some((l) => /tfstate/.test(l))).toBe(true);
  });

  it('[NFR-CLD-011] excluye node_modules, tests, claude, specs, .git, datos locales y artefactos de build', () => {
    const lines = ignoreLines();
    for (const entry of ['node_modules', 'tests', 'claude', 'specs', '.git', '.claude', '.specify', 'data', 'coverage', 'dist', 'dist-server']) {
      expect(lines).toContain(entry);
    }
  });

  it('[REQ-SEC-005] no reincluye .env ni secretos con negaciones', () => {
    expect(ignoreLines().length).toBeGreaterThan(0);
    const negations = ignoreLines().filter((l) => l.startsWith('!'));
    for (const line of negations) expect(line).not.toMatch(/\.env|pem|key|tfstate|secret/i);
  });

  it('[REQ-CLD-001] no excluye lo que necesita el build (src, scripts, package.json, index.html)', () => {
    const lines = ignoreLines();
    expect(lines.length).toBeGreaterThan(0);
    for (const needed of ['src', 'scripts', 'package.json', 'package-lock.json', 'index.html']) expect(lines).not.toContain(needed);
  });
});
