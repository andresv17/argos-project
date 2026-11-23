#!/usr/bin/env node
// T472 (REQ-CICD-009, REQ-SEC-002, SC-CLD-018, EDGE-CLD-05): validación en CI de los secretos antes de crear la versión.
// Uso: node scripts/validate-secrets.mjs   (lee TF_VAR_database_url, TF_VAR_audit_hmac_secret y, si existe, DATABASE_URL_DIRECT)
// Salida: 0 = ok, 1 = violaciones. Imprime primero `::add-mask::` de cada valor (crudo y recortado, línea por línea) y
// después solo nombres de variable y reglas; nunca un valor. Las reglas del HMAC espejan app-config.ts (hay prueba de paridad).
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP_URL = 'TF_VAR_database_url';
const DIRECT_URL = 'DATABASE_URL_DIRECT';
const HMAC = 'TF_VAR_audit_hmac_secret';
const HMAC_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/; // >= 32 bytes hex (app-config.ts AUDIT_SECRET_PATTERN)
const DEV_HMAC = 'de'.repeat(32); // app-config.ts DEVELOPMENT_AUDIT_HMAC_SECRET
const FIXTURE_HMAC_SHA256 = 'eaa93b9fcd229b8446cacff0a963d1afe33fa3fd3b6f63343c3227c987f6c592'; // huella, no el valor
// 008 (GH:#16, H-ORA-5 OBS-1): Google OAuth. Se inyectan en el despliegue como variables de entorno de Cloud Run.
const OAUTH_CLIENT_ID = 'GOOGLE_OAUTH_CLIENT_ID';
const OAUTH_REDIRECT_URI = 'GOOGLE_OAUTH_REDIRECT_URI';

// Neo Q3: sin recorte. Cualquier espacio, tabulador o salto (de borde o interno) se rechaza, fail-closed (EDGE-CLD-05).
// `trim` solo sirve para enmascarar también la forma recortada del valor en los registros.
const trim = (v) => v.replace(/^[ \t]+|[ \t]+$/g, '');

/** Líneas no vacías de los valores crudo y recortado, para `::add-mask::` (GitHub enmascara por línea). */
export function maskLines(raw) {
  const out = new Set();
  for (const candidate of [raw, trim(raw)]) {
    for (const line of candidate.split(/\r\n|\r|\n/)) if (line !== '') out.add(line);
  }
  return [...out];
}

function checkDatabaseUrl(name, value, wantPooler, violations) {
  if (/\s/.test(value)) {
    violations.push({ variable: name, rule: 'espacio-o-salto' });
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (url === null || (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') || url.hostname === '') {
    violations.push({ variable: name, rule: 'formato' });
    return;
  }
  if (url.searchParams.get('sslmode') !== 'require') violations.push({ variable: name, rule: 'sslmode' });
  const pooler = /-pooler(\.|$)/.test(url.hostname.split('.')[0] + '.');
  if (wantPooler && !pooler) violations.push({ variable: name, rule: 'pooler-requerido' });
  if (!wantPooler && pooler) violations.push({ variable: name, rule: 'pooler-prohibido' });
}

/** Valor de texto simple (client id): no vacío, sin espacios ni comas (viaja dentro de --set-env-vars). */
function checkPlainValue(name, value, violations) {
  if (value === '') {
    violations.push({ variable: name, rule: 'vacio' });
    return;
  }
  if (/[\s,]/.test(value)) violations.push({ variable: name, rule: 'espacio-o-salto' });
}

/** URI de redirección: https absoluta, sin espacios ni comas. */
function checkRedirectUri(name, value, violations) {
  if (value === '') {
    violations.push({ variable: name, rule: 'vacio' });
    return;
  }
  if (/[\s,]/.test(value)) {
    violations.push({ variable: name, rule: 'espacio-o-salto' });
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (url === null || url.protocol !== 'https:' || url.hostname === '') violations.push({ variable: name, rule: 'formato' });
}

function checkHmac(name, value, violations) {
  if (/\s/.test(value)) {
    violations.push({ variable: name, rule: 'espacio-o-salto' });
    return;
  }
  const lower = value.toLowerCase();
  const publicSecret = lower === DEV_HMAC || createHash('sha256').update(lower).digest('hex') === FIXTURE_HMAC_SHA256;
  if (!HMAC_PATTERN.test(value) || publicSecret) violations.push({ variable: name, rule: 'hmac' });
}

/** @returns {{ok: boolean, violations: Array<{variable: string, rule: string}>}} */
export function validateSecrets(env) {
  const violations = [];
  const specs = [
    [APP_URL, true, (v) => checkDatabaseUrl(APP_URL, v, true, violations)],
    [HMAC, true, (v) => checkHmac(HMAC, v, violations)],
    [DIRECT_URL, false, (v) => checkDatabaseUrl(DIRECT_URL, v, false, violations)],
    [OAUTH_CLIENT_ID, true, (v) => checkPlainValue(OAUTH_CLIENT_ID, v, violations)],
    [OAUTH_REDIRECT_URI, true, (v) => checkRedirectUri(OAUTH_REDIRECT_URI, v, violations)],
  ];
  for (const [name, required, check] of specs) {
    const raw = env[name];
    if (raw === undefined) {
      if (required) violations.push({ variable: name, rule: 'ausente' });
      continue;
    }
    check(raw);
  }
  return { ok: violations.length === 0, violations };
}

function main() {
  for (const name of [APP_URL, HMAC, DIRECT_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI]) {
    const raw = process.env[name];
    if (raw !== undefined) for (const line of maskLines(raw)) console.log(`::add-mask::${line}`);
  }
  const result = validateSecrets(process.env);
  for (const v of result.violations) console.error(`Secreto rechazado: ${v.variable} (${v.rule}). No se crea la versión.`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
