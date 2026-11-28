// Comprobacion estatica equivalente a las reglas Semgrep de tests/security/sast-rules/ (usada por scripts/verify-ci-ready.sh sin semgrep).
// Se ejecuta con cwd = raiz del repo; imprime una linea `archivo:linea regla` por hallazgo.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (p === join('src', 'generated') ? [] : walk(p)) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const RULES = [
  { id: 'argos-no-dynamic-code', re: /\beval\s*\(|\bnew Function\s*\(|\bset(?:Timeout|Interval)\(\s*["'`]/ },
  { id: 'argos-no-dangerously-set-inner-html', re: /dangerouslySetInnerHTML\s*[=:]/ },
  { id: 'argos-no-raw-html-sink', re: /\.(?:innerHTML|outerHTML)\s*=[^=]|\.insertAdjacentHTML\s*\(|\bdocument\.write(?:ln)?\s*\(/ },
  { id: 'argos-no-entropy-outside-adapters', re: /\bMath\.random\s*\(|\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\brandomUUID\s*\(|\bcrypto\.getRandomValues\s*\(|\brandomBytes\s*\(|\brandomInt\s*\(|\bperformance\.now\s*\(/, skip: (f) => f.startsWith('src/infrastructure/adapters/') },
  { id: 'argos-no-process-env-outside-config', re: /\bprocess\.env\b|\bimport\.meta\.env\b/, skip: (f) => f.startsWith('src/infrastructure/config/') },
  // 012 (REQ-OWN12-010, T1621): `ownerUserId` se compara con un usuario SOLO en canActOnPet y su primitiva; alcance src/domain/ y src/application/.
  { id: 'argos-no-owner-compare-outside-can-act-on-pet', re: /\.ownerUserId\s*(?:===|!==|==|!=)|(?:===|!==|==|!=)\s*[\w.]+\.ownerUserId\b/, skip: (f) => !(f.startsWith('src/domain/') || f.startsWith('src/application/')) || f === 'src/domain/access/can-act-on-pet.ts' || f === 'src/domain/access/pet-ownership.ts' },
];
const found = [];
for (const file of walk('src')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/^\s*(?:\/\/|\*|\/\*).*$/, '');
    if (code.trim() === '' || /nosemgrep/.test(line) || /nosemgrep/.test(lines[i - 1] ?? '')) return;
    for (const rule of RULES) if (!(rule.skip?.(file) ?? false) && rule.re.test(code)) found.push(`${file}:${i + 1} ${rule.id}`);
  });
}
console.log(found.join('\n'));
