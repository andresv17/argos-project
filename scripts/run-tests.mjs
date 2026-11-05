import { register } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

register('./tsx-loader.mjs', import.meta.url);

const { runRegisteredSuites } = await import('../tests/support/test-harness.ts');

function collectSpecFiles(dirPath) {
  const results = [];
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectSpecFiles(fullPath));
    } else if (entry.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

const testsRoot = resolve(process.cwd(), 'tests');
const specFiles = collectSpecFiles(testsRoot);

if (specFiles.length === 0) {
  console.error('[Test Runner] No se encontraron archivos .spec.ts en tests/');
  process.exit(1);
}

console.log(`[SDD Test Runner] Ejecutando ${specFiles.length} suites de prueba...`);

let totalPassed = 0;
let totalFailed = 0;

for (const file of specFiles) {
  console.log(`\nRUN ${file.replace(process.cwd() + '/', '')}`);
  await import(pathToFileURL(file).href);
  const { passed, failed } = await runRegisteredSuites();
  totalPassed += passed;
  totalFailed += failed;
}

console.log(`\n========================================`);
console.log(`Test Suites: ${specFiles.length} total`);
console.log(`Tests:       ${totalPassed} passed, ${totalFailed} failed`);
console.log(`========================================`);

if (totalFailed > 0) {
  process.exit(1);
}
