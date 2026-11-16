#!/usr/bin/env node
// T451 (REQ-SEC-001, REQ-SEC-005, SC-CLD-004): escaneo de secretos por patrones. Sin dependencias, sin binarios y sin gitleaks-action.
// Uso:
//   node scripts/scan-secrets.mjs repo                       archivos versionados (git ls-files)
//   node scripts/scan-secrets.mjs dir <ruta>                 un directorio, p. ej. el sistema de archivos exportado de una imagen
//   node scripts/scan-secrets.mjs file <ruta> [--literal-env NOMBRE[,NOMBRE]]
//                                                            un registro de CI o comentario; con --literal-env busca ademas el
//                                                            VALOR de cada variable de entorno nombrada (secreto de prueba)
// Salida: 0 = sin hallazgos, 1 = hallazgos, 2 = uso incorrecto. Solo se imprimen archivo, linea y regla; nunca el valor.
// Una linea con `argos-scan:allow` se omite SOLO en archivos bajo tests/ (valores sinteticos de pruebas); fuera de tests/ la marca no
// suprime nada (E-2 R2). La regla url-con-contrasena se exime unicamente para hosts localhost, 127.0.0.1, [::1], *.example.com y *.test
// en tests/ (E-2 R1) y para loopback en cualquier ruta; cualquier otra URL con contrasena se detecta, tambien en tests/.
// Modos file y dir (E-2 R-3): la ruta se resuelve (symlinks incluidos) y SOLO es "tests/" si cae realmente bajo <raiz del repo>/tests/. Una
// ruta con segmento `..` se rechaza (exit 2). Rutas fuera del repo (imagen exportada, registros de CI) se escanean sin ninguna exencion.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW = 'argos-scan:allow';
const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const PUBLIC_DEV_HMAC = 'de'.repeat(32); // app-config.ts DEVELOPMENT_AUDIT_HMAC_SECRET (publico)
const MAX_BYTES = 5 * 1024 * 1024;

const TOKEN_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /\bnapi_[a-z0-9]{40,}\b/, // Neon API key
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, // Slack
  /\bsk-[A-Za-z0-9]{32,}\b/,
];
const PLACEHOLDER_PASSWORD = /^(<[^>]*>|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\.{2,}|\*+|x+|pass(word)?|postgres|changeme|secret|test|argos|clave|contrasena|tu[_-]?clave|\{\{.*\}\})$/i;
const URL_WITH_PASSWORD = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/([^\s:@/'"`<>]+):([^\s@'"`]+)@([^\s/:?'"`]+)/g;
const HMAC_ASSIGN = /(?:ARGOS_AUDIT_HMAC_SECRET|audit_hmac_secret)["']?\s*[:=]\s*["']?([^\s"',;]+)/gi;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const SYNTHETIC_HOST = /^(?:.+\.)?(?:example\.com|test)$/i; // solo se admite en tests/ (E-2 R1)
const HEX64 = /^(?:[0-9a-fA-F]{2}){32,}$/;

/** Rutas que nunca deben estar en el repositorio ni en la imagen (REQ-SEC-005). */
export function isForbiddenFile(path) {
  const name = basename(path);
  if (name === '.env' || (name.startsWith('.env.') && !/^\.env\.(example|sample|template)$/.test(name))) return true;
  if (/\.(pem|key)$/i.test(name)) return true;
  if (/\.tfstate(\..+)?$/.test(name)) return true;
  if (/^(.*[-_])?(sa-key|service[-_]?account.*)\.json$/i.test(name)) return true;
  return false;
}

/** @returns {Array<{file: string, line: number, rule: string}>} */
export function scanText(name, text, opts = {}) {
  const exempt = opts.exempt ?? name.startsWith('tests/'); // solo "tests/" real; los modos file y dir lo calculan con classifyPath
  const findings = [];
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW) && exempt) return;
    const add = (rule) => findings.push({ file: name, line: i + 1, rule });
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) add('clave-privada');
    if (TOKEN_PATTERNS.some((re) => re.test(line))) add('token-conocido');
    if (/"type"\s*:\s*"service_account"/.test(line) || /"private_key"\s*:\s*"-----BEGIN/.test(line)) add('cuenta-de-servicio');
    for (const m of line.matchAll(URL_WITH_PASSWORD)) {
      const pass = m[2] ?? '';
      const host = m[3] ?? '';
      // Loopback (credenciales desechables locales) en cualquier ruta; hosts example.com y .test solo en tests/ (fixtures sinteticos).
      const hostOk = LOOPBACK_HOST.test(host) || (exempt && SYNTHETIC_HOST.test(host));
      if (!PLACEHOLDER_PASSWORD.test(pass) && !hostOk) add('url-con-contrasena');
    }
    for (const m of line.matchAll(HMAC_ASSIGN)) {
      const v = m[1] ?? '';
      if (HEX64.test(v) && v.toLowerCase() !== PUBLIC_DEV_HMAC) add('hmac-auditoria');
    }
  });
  return findings;
}

/** Busca el valor literal de secretos de prueba (valores de >= 8 caracteres); reporta el nombre, nunca el valor. */
export function scanLiterals(name, text, values) {
  const findings = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (const [varName, value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.length < 8) continue;
    lines.forEach((line, i) => {
      if (line.includes(value)) findings.push({ file: name, line: i + 1, rule: `valor-literal:${varName}` });
    });
  }
  return findings;
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

/**
 * Normaliza una ruta de los modos file y dir (E-2 R-3).
 * @returns {{abs: string, rel: string, inRepo: boolean} | null} null si la ruta contiene `..`; rel es relativa a la raiz del repo si inRepo.
 */
export function classifyPath(raw, root = REPO_ROOT) {
  if (raw.split(/[\\/]+/).includes('..')) return null;
  const abs = resolve(raw);
  let real = abs;
  if (existsSync(abs)) real = realpathSync(abs);
  const rel = relative(root, real).split('\\').join('/');
  const inRepo = rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
  return { abs: real, rel: inRepo ? rel : '', inRepo };
}

function scanFile(abs, rel, exempt = rel.startsWith('tests/')) {
  const findings = [];
  if (isForbiddenFile(rel)) findings.push({ file: rel, line: 0, rule: 'archivo-prohibido' });
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return findings;
  }
  if (!st.isFile() || st.size > MAX_BYTES) return findings;
  const buf = readFileSync(abs);
  if (isBinary(buf)) return findings;
  return findings.concat(scanText(rel, buf.toString('utf8'), { exempt }));
}

/** Recorre un directorio completo (sin omitir ninguna carpeta: es el sistema de archivos de una imagen). */
export function scanDir(dir) {
  const c = classifyPath(dir);
  if (c === null) throw new RangeError('ruta con ..');
  const prefix = c.inRepo ? c.rel : '';
  const label = (abs) => [prefix, relative(c.abs, abs).split('\\').join('/')].filter((p) => p !== '').join('/');
  const findings = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) {
        const name = label(abs);
        findings.push(...scanFile(abs, name, c.inRepo && name.startsWith('tests/')));
      }
    }
  };
  walk(c.abs);
  return findings;
}

/** Archivos versionados: solo lo que Git rastrea (lo ignorado no es repositorio). */
export function scanRepo(cwd = process.cwd()) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const findings = [];
  for (const rel of out.split('\0').filter((p) => p !== '')) findings.push(...scanFile(join(cwd, rel), rel));
  return findings;
}

function report(findings) {
  for (const f of findings) console.log(`${f.file}:${f.line} ${f.rule}`);
  console.log(`${findings.length} hallazgos`);
  return findings.length === 0 ? 0 : 1;
}

function main(argv) {
  const [mode, target, ...rest] = argv;
  if (mode === 'repo') return report(scanRepo());
  if (mode === 'dir' && target) {
    if (classifyPath(target) === null) return 2;
    return report(scanDir(target));
  }
  if (mode === 'file' && target) {
    const c = classifyPath(target);
    if (c === null) return 2;
    const label = c.inRepo ? c.rel : target;
    let findings = scanFile(c.abs, label, c.inRepo && c.rel.startsWith('tests/'));
    const i = rest.indexOf('--literal-env');
    if (i >= 0) {
      const names = (rest[i + 1] ?? '').split(',').filter((n) => n !== '');
      const values = Object.fromEntries(names.map((n) => [n, process.env[n] ?? '']));
      try {
        findings = findings.concat(scanLiterals(label, readFileSync(c.abs, 'utf8'), values));
      } catch {
        return 2;
      }
    }
    return report(findings);
  }
  console.error('uso: scan-secrets.mjs repo | dir <ruta> | file <ruta> [--literal-env NOMBRE[,NOMBRE]]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
