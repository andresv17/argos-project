import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T443 (D-13, NFR-CLD-001, plan.md §2.1): budget.tf. Pruebas estáticas por lectura (Terraform no se ejecuta aquí).
 */
const dir = join(process.cwd(), 'terraform');
const FILE = join(dir, 'budget.tf');
const strip = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');
const code = (): string => strip(readFileSync(FILE, 'utf8'));
const budget = (): string => code().match(/resource\s+"google_billing_budget"\s+"([a-z0-9_]+)"\s*\{([^]*)\n\}/)?.[2] ?? '';

describe('terraform/budget.tf (T443)', () => {
  it('el archivo existe y define un único google_billing_budget', () => {
    expect(existsSync(FILE)).toBe(true);
    expect([...code().matchAll(/resource\s+"google_billing_budget"/g)].length).toBe(1);
  });

  it('presupuesto de 1 USD (specified_amount en USD, units "1", sin nanos)', () => {
    const b = budget();
    expect(b).toMatch(/specified_amount\s*\{[^}]*currency_code\s*=\s*"USD"[^}]*\}/);
    expect(b).toMatch(/units\s*=\s*"1"/);
    expect(b).not.toMatch(/nanos/);
    expect(b).not.toMatch(/last_period_amount/);
  });

  it('umbrales 50 %, 90 % y 100 % (0.5, 0.9, 1.0), solo esos', () => {
    const t = [...budget().matchAll(/threshold_percent\s*=\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(t.sort()).toEqual([0.5, 0.9, 1]);
  });

  it('filtra por la etiqueta app=argos (NFR-CLD-001) y no por servicios de Mirror', () => {
    const b = budget();
    expect(b).toMatch(/budget_filter\s*\{[^]*labels\s*=\s*\{\s*app\s*=\s*\[?\s*"argos"\s*\]?\s*\}/);
  });

  it('usa var.billing_account y nombra el presupuesto con var.project_prefix', () => {
    const b = budget();
    expect(b).toMatch(/billing_account\s*=\s*var\.billing_account\b/);
    expect(b).toMatch(/display_name\s*=\s*"\$\{var\.project_prefix\}-/);
  });

  it('alerta por correo: destinatarios IAM por defecto activos (no se desactivan)', () => {
    const b = budget();
    expect(b).toMatch(/all_updates_rule\s*\{/);
    expect(b).not.toMatch(/disable_default_iam_recipients\s*=\s*true/);
  });

  it('variable billing_account sin default, tipo string y con validación de formato', () => {
    const v = strip(readFileSync(join(dir, 'variables.tf'), 'utf8'));
    const body = v.match(/variable\s+"billing_account"\s*\{([^]*?)\n\}/)?.[1] ?? '';
    expect(body).toMatch(/type\s*=\s*string/);
    expect(body).not.toMatch(/default\s*=/);
    expect(body).toMatch(/validation\s*\{/);
  });

  it('no referencia Mirror ni recursos ajenos (REQ-IAC-003)', () => {
    expect(readFileSync(FILE, 'utf8').toLowerCase()).not.toContain('mirror');
  });
});
