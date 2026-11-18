import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T822 (N2-05 y N2-04, 006): enmienda de NFR-CLD-001 de 003: la alarma de presupuesto pasa de 1 USD a 5 USD equivalentes (`budget_units = "22500"` con `COP`, o
 * `"5"` con `USD`), con filtro por proyecto (el gasto de Vertex no lleva la etiqueta `app=argos`) y `display_name` sin «1-usd». El presupuesto solo avisa, no
 * detiene el gasto (NFR-ESC6-001; REQ-ESC6-031; SC-ESC6-054, SC-ESC6-061). Neo verifica la moneda real antes de cualquier `apply` (T824).
 * Pruebas estáticas por lectura (Terraform no se ejecuta aquí).
 */
const DIR = join(process.cwd(), 'terraform');
const strip = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');
const budgetFile = (): string => strip(readFileSync(join(DIR, 'budget.tf'), 'utf8'));
const budget = (): string => budgetFile().match(/resource\s+"google_billing_budget"\s+"argos"\s*\{([^]*)\n\}/)?.[1] ?? '';
const variables = (): string => strip(readFileSync(join(DIR, 'variables.tf'), 'utf8'));
const variable = (name: string): string => variables().match(new RegExp(`variable\\s+"${name}"\\s*\\{([^]*?)\\n\\}`))?.[1] ?? '';
const SPEC_003 = readFileSync(join(process.cwd(), 'specs/003-cloud-gcp/spec.md'), 'utf8');

describe('terraform/budget.tf con alarma de 5 USD equivalentes (T822, NFR-CLD-001 enmendado por la 006)', () => {
  it('NFR-ESC6-001: budget_units por defecto "22500" con budget_currency "COP" (5 USD a 4500 COP/USD); la moneda y el monto siguen siendo variables', () => {
    expect(variable('budget_units')).toMatch(/default\s*=\s*"22500"/);
    expect(variable('budget_units')).not.toMatch(/default\s*=\s*"4500"/);
    expect(variable('budget_currency')).toMatch(/default\s*=\s*"COP"/);
    expect(22500).toBe(5 * 4500);
    const b = budget();
    expect(b).toMatch(/currency_code\s*=\s*var\.budget_currency\b/);
    expect(b).toMatch(/units\s*=\s*var\.budget_units\b/);
    expect(b).not.toMatch(/nanos|last_period_amount/);
  });

  it('SC-ESC6-054: la validación admite tanto "22500" (COP) como "5" (USD) y rechaza vacío, cero, decimales y signos', () => {
    const condition = variable('budget_units').match(/condition\s*=\s*can\(regex\("([^"]+)"/)?.[1] ?? '';
    const re = new RegExp(condition);
    for (const ok of ['22500', '5', '4500']) expect(re.test(ok), ok).toBe(true);
    for (const bad of ['', '0', '05', '5.5', '-5', '5 USD', '22 500']) expect(re.test(bad), bad).toBe(false);
  });

  it('SC-ESC6-061: la descripción de budget_units y de budget_currency habla de 5 USD equivalentes y de la moneda real de la cuenta', () => {
    expect(variable('budget_units')).toMatch(/5 USD/);
    expect(variable('budget_units')).toMatch(/22500/);
    expect(variable('budget_currency')).toMatch(/moneda/i);
  });

  it('NFR-ESC6-001: filtra por el proyecto (projects = projects/<número>), ya no por la etiqueta app=argos, que el gasto de Vertex no lleva', () => {
    const filter = budget().match(/budget_filter\s*\{([^]*?)\n  \}/)?.[1] ?? '';
    expect(filter).toMatch(/projects\s*=\s*\["projects\/\$\{data\.google_project\.this\.number\}"\]/);
    expect(filter).not.toMatch(/labels/);
    expect(filter).not.toMatch(/credit_types_treatment|services\s*=/);
  });

  it('SC-ESC6-054: el display_name conserva el prefijo del proyecto y ya no dice «1-usd»', () => {
    const name = budget().match(/display_name\s*=\s*"([^"]+)"/)?.[1] ?? '';
    expect(name).toMatch(/^\$\{var\.project_prefix\}-/);
    expect(name).not.toMatch(/1-usd/);
    expect(strip(readFileSync(join(DIR, 'budget.tf'), 'utf8'))).not.toMatch(/1-usd/);
  });

  it('NFR-CLD-001: no cambian los umbrales 50/90/100 %, el depends_on de billingbudgets, los destinatarios IAM por defecto ni la cuenta de facturación', () => {
    const b = budget();
    expect([...b.matchAll(/threshold_percent\s*=\s*([0-9.]+)/g)].map((m) => Number(m[1])).sort()).toEqual([0.5, 0.9, 1]);
    expect(b).toMatch(/depends_on\s*=\s*\[\s*google_project_service\.apis\["billingbudgets\.googleapis\.com"\]\s*\]/);
    expect(b).not.toMatch(/disable_default_iam_recipients\s*=\s*true|pubsub_topic/);
    expect(b).toMatch(/billing_account\s*=\s*var\.billing_account\b/);
  });

  it('NFR-CLD-001: la spec de 003 declara la alarma de 5 USD (22500 COP) con la «Enmienda 006» (N2-05 y N2-04) y que solo avisa', () => {
    const nfr = SPEC_003.split('\n').find((l) => l.startsWith('- **NFR-CLD-001**')) ?? '';
    expect(nfr).toMatch(/Enmienda 006[^.]*N2-05[^.]*N2-04|Enmienda 006[^.]*N2-04[^.]*N2-05/);
    expect(nfr).toContain('22500');
    expect(nfr).toMatch(/5 USD/);
    expect(nfr).toMatch(/proyecto/);
    expect(nfr).toMatch(/solo avisa|NO detiene|no detiene/);
  });
});
