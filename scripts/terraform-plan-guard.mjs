#!/usr/bin/env node
// T471 (REQ-IAC-007, REQ-IAC-013, REQ-IAC-014): guardia de un plan de `terraform show -json`.
// Uso: node scripts/terraform-plan-guard.mjs <plan.json> [--label <etiqueta>]...
// Las etiquetas (p. ej. del PR) también pueden venir en PLAN_GUARD_LABELS, separadas por comas.
// Salida: 0 = ok, 1 = violaciones, 2 = entrada inválida. Nunca imprime valores de secretos.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROTATION_LABEL = 'rotacion-secreto';
const MANUAL_LABEL = 'aprobacion-manual';
const PROTECTED = {
  google_secret_manager_secret_version: [ROTATION_LABEL, MANUAL_LABEL],
  google_secret_manager_secret: [MANUAL_LABEL],
  google_cloud_run_v2_service: [MANUAL_LABEL],
  google_storage_bucket: [MANUAL_LABEL],
};
const SECRET_VARS = ['TF_VAR_database_url', 'TF_VAR_audit_hmac_secret'];
const MAPPING = 'google_cloud_run_domain_mapping';

const isSecretValid = (v) => typeof v === 'string' && v.trim().length > 0 && !/[\r\n]/.test(v);

/** @returns {{ok: boolean, violations: Array<{rule: string, address?: string, detail: string}>}} */
export function evaluatePlan(plan, opts = {}) {
  const labels = opts.labels ?? [];
  const env = opts.env ?? process.env;
  const violations = [];

  for (const name of SECRET_VARS) {
    if (!isSecretValid(env[name])) {
      violations.push({ rule: 'secreto-invalido', detail: `${name} es nula, vacía o contiene salto de línea` });
    }
  }

  if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.resource_changes)) {
    violations.push({ rule: 'plan-invalido', detail: 'el plan no es un objeto con resource_changes' });
    return { ok: false, violations };
  }
  const changes = plan.resource_changes;

  for (const rc of changes) {
    const actions = rc?.change?.actions ?? [];
    const allowed = PROTECTED[rc?.type];
    if (allowed && actions.includes('delete') && !allowed.some((l) => labels.includes(l))) {
      violations.push({
        rule: 'borrado-protegido',
        address: rc.address,
        detail: `${rc.address}: ${actions.join('+')} exige la etiqueta ${allowed.join(' o ')}`,
      });
    }
  }

  const domain = plan.variables?.custom_domain?.value ?? '';
  const mappings = changes.filter(
    (rc) => rc?.type === MAPPING && !(rc.change?.actions ?? []).every((a) => a === 'delete'),
  ).length;
  const expected = domain === '' ? 0 : 1;
  if (mappings !== expected) {
    violations.push({
      rule: 'dominio',
      detail: `custom_domain ${domain === '' ? 'vacío' : 'definido'}: se esperaban ${expected} ${MAPPING} y hay ${mappings}`,
    });
  }

  return { ok: violations.length === 0, violations };
}

function main(argv) {
  const labels = (process.env.PLAN_GUARD_LABELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let file;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--label') labels.push(argv[++i] ?? '');
    else file ??= argv[i];
  }
  if (!file) {
    console.error('uso: terraform-plan-guard.mjs <plan.json> [--label <etiqueta>]');
    return 2;
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error('plan-invalido: no se pudo leer el JSON del plan');
    return 2;
  }
  const result = evaluatePlan(plan, { labels });
  for (const v of result.violations) console.error(`${v.rule}: ${v.detail}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
