#!/usr/bin/env node
/**
 * Comprobación (iv) de scripts/verify-ci-ready.sh:
 * test-gate.yml ejecuta Vitest sobre tests/{unit,integration,property,security}/ sin instalar navegadores de Playwright.
 * Cualquier spec rastreada en esas carpetas que importe `playwright` o `@playwright/test` debe proteger su ejecución
 * con `skipIf(` y comprobación de binario (`executablePath`), igual que las suites PG usan `skipIf(!TEST_DATABASE_URL)`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const VITEST_ROOTS = ['tests/unit/', 'tests/integration/', 'tests/property/', 'tests/security/'];
const PLAYWRIGHT_IMPORT = /^\s*import\b[^;]*from\s+['"](?:playwright|@playwright\/test)['"]/m;

let tracked = [];
try {
  const out = execFileSync('git', ['ls-files', '--', 'tests/'], { encoding: 'utf8' });
  tracked = out.split(/\r?\n/).filter(Boolean);
} catch {
  tracked = [];
}

const violations = [];
for (const file of tracked) {
  if (!file.endsWith('.spec.ts')) continue;
  if (!VITEST_ROOTS.some((prefix) => file.startsWith(prefix))) continue;
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  const match = PLAYWRIGHT_IMPORT.exec(text);
  if (!match) continue;
  const hasSkipGuard = /\bskipIf\s*\(/.test(text) && /\bexecutablePath\s*\(/.test(text);
  if (!hasSkipGuard) {
    const line = text.slice(0, match.index).split('\n').length;
    violations.push(`${file}:${line} importa playwright dentro de Vitest sin guarda skipIf + executablePath (test-gate.yml no instala navegadores)`);
  }
}

if (violations.length > 0) process.stdout.write(`${violations.join('\n')}\n`);
