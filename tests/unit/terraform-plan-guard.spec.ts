import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * T471 (REQ-IAC-007, REQ-IAC-013, REQ-IAC-014, SC-CLD-017, SC-CLD-024): guardia de plan de Terraform.
 * Planes JSON sintéticos (formato de `terraform show -json`); Terraform no se ejecuta.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'terraform-plan-guard.mjs');

interface Violation {
  rule: string;
  address?: string;
}
interface Result {
  ok: boolean;
  violations: Violation[];
}
interface Guard {
  evaluatePlan: (plan: unknown, opts?: { labels?: string[]; env?: Record<string, string | undefined> }) => Result;
}
// @ts-expect-error TS7016: el guardia es .mjs sin declaraciones (el módulo se tipa con Guard)
const load = async (): Promise<Guard> => (await import('../../scripts/terraform-plan-guard.mjs')) as unknown as Guard;

const change = (type: string, name: string, actions: string[]) => ({
  address: `${type}.${name}`,
  type,
  name,
  change: { actions },
});
const plan = (changes: unknown[], customDomain = '') => ({
  format_version: '1.2',
  variables: { custom_domain: { value: customDomain } },
  resource_changes: changes,
});
const GOOD_ENV = { TF_VAR_database_url: 'postgres://u:p@h-pooler/db?sslmode=require', TF_VAR_audit_hmac_secret: 'ab'.repeat(32) };

describe('guardia de plan: borrados protegidos (REQ-IAC-007)', () => {
  it('bloquea delete de google_secret_manager_secret_version sin la etiqueta rotacion-secreto', async () => {
    const { evaluatePlan } = await load();
    const r = evaluatePlan(plan([change('google_secret_manager_secret_version', 'db', ['delete'])]), { env: GOOD_ENV });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.rule)).toContain('borrado-protegido');
  });

  it('bloquea replace (delete+create y create+delete) de la versión sin etiqueta', async () => {
    const { evaluatePlan } = await load();
    for (const actions of [['delete', 'create'], ['create', 'delete']]) {
      const r = evaluatePlan(plan([change('google_secret_manager_secret_version', 'db', actions)]), { env: GOOD_ENV });
      expect(r.ok, actions.join('+')).toBe(false);
    }
  });

  it('permite el reemplazo de la versión con la etiqueta rotacion-secreto', async () => {
    const { evaluatePlan } = await load();
    const r = evaluatePlan(plan([change('google_secret_manager_secret_version', 'db', ['create', 'delete'])]), {
      labels: ['rotacion-secreto'],
      env: GOOD_ENV,
    });
    expect(r.ok).toBe(true);
  });

  it('la etiqueta rotacion-secreto no autoriza borrar el secreto, el servicio ni el bucket', async () => {
    const { evaluatePlan } = await load();
    for (const type of ['google_secret_manager_secret', 'google_cloud_run_v2_service', 'google_storage_bucket']) {
      const r = evaluatePlan(plan([change(type, 'x', ['delete'])]), { labels: ['rotacion-secreto'], env: GOOD_ENV });
      expect(r.ok, type).toBe(false);
    }
  });

  it('create, update y no-op sobre recursos protegidos pasan', async () => {
    const { evaluatePlan } = await load();
    const r = evaluatePlan(
      plan([
        change('google_secret_manager_secret_version', 'db', ['create']),
        change('google_secret_manager_secret', 'db', ['update']),
        change('google_cloud_run_v2_service', 'argos', ['no-op']),
      ]),
      { env: GOOD_ENV },
    );
    expect(r.ok).toBe(true);
  });

  it('delete de recursos no protegidos pasa', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(plan([change('google_project_service', 'x', ['delete'])]), { env: GOOD_ENV }).ok).toBe(true);
  });
});

describe('guardia de plan: TF_VAR de secretos (REQ-IAC-013)', () => {
  const cases: Array<[string, string | undefined]> = [
    ['nula', undefined],
    ['vacía', ''],
    ['solo espacios', '   '],
    ['con salto de línea', 'valor\n'],
    ['con retorno de carro', 'val\rtor'],
  ];
  for (const name of ['TF_VAR_database_url', 'TF_VAR_audit_hmac_secret']) {
    for (const [label, value] of cases) {
      it(`${name} ${label} falla`, async () => {
        const { evaluatePlan } = await load();
        const r = evaluatePlan(plan([]), { env: { ...GOOD_ENV, [name]: value } });
        expect(r.ok).toBe(false);
        expect(r.violations.map((v) => v.rule)).toContain('secreto-invalido');
      });
    }
  }

  it('con ambas válidas pasa y el informe no contiene el valor del secreto', async () => {
    const { evaluatePlan } = await load();
    const r = evaluatePlan(plan([]), { env: GOOD_ENV });
    expect(r.ok).toBe(true);
    const bad = evaluatePlan(plan([]), { env: { ...GOOD_ENV, TF_VAR_database_url: 'sec\nreto-XYZ' } });
    expect(JSON.stringify(bad)).not.toContain('reto-XYZ');
  });
});

describe('guardia de plan: dominio propio (REQ-IAC-014, SC-CLD-024)', () => {
  const mapping = change('google_cloud_run_domain_mapping', 'custom', ['create']);

  it('custom_domain = "" sin mapeo pasa', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(plan([], ''), { env: GOOD_ENV }).ok).toBe(true);
  });

  it('custom_domain = "" con un mapeo en el plan falla', async () => {
    const { evaluatePlan } = await load();
    const r = evaluatePlan(plan([mapping], ''), { env: GOOD_ENV });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.rule)).toContain('dominio');
  });

  it('dominio válido con exactamente 1 mapeo pasa', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(plan([mapping], 'app.ejemplo.org'), { env: GOOD_ENV }).ok).toBe(true);
  });

  it('dominio válido con 0 o 2 mapeos falla', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(plan([], 'app.ejemplo.org'), { env: GOOD_ENV }).ok).toBe(false);
    const two = [mapping, change('google_cloud_run_domain_mapping', 'otro', ['create'])];
    expect(evaluatePlan(plan(two, 'app.ejemplo.org'), { env: GOOD_ENV }).ok).toBe(false);
  });

  it('un mapeo con acción no-op cuenta como existente; delete no cuenta', async () => {
    const { evaluatePlan } = await load();
    const keep = change('google_cloud_run_domain_mapping', 'custom', ['no-op']);
    expect(evaluatePlan(plan([keep], 'app.ejemplo.org'), { env: GOOD_ENV }).ok).toBe(true);
    const del = change('google_cloud_run_domain_mapping', 'custom', ['delete']);
    expect(evaluatePlan(plan([del], ''), { env: GOOD_ENV }).ok).toBe(true);
  });
});

describe('guardia de plan: cierre en falso (R-1 y R-3 de Oracle, T471)', () => {
  const PROTECTED_TYPES = [
    'google_secret_manager_secret_version',
    'google_secret_manager_secret',
    'google_cloud_run_v2_service',
    'google_storage_bucket',
  ];
  const noActions = (type: string, extra: object = {}) => ({ address: `${type}.x`, type, name: 'x', change: { ...extra } });

  it('un recurso protegido sin change.actions produce plan-invalido', async () => {
    const { evaluatePlan } = await load();
    for (const type of PROTECTED_TYPES) {
      const r = evaluatePlan(plan([noActions(type)]), { env: GOOD_ENV });
      expect(r.ok, type).toBe(false);
      expect(r.violations.map((v) => v.rule), type).toContain('plan-invalido');
    }
  });

  it('protegido sin change, con actions nulo, vacío o no-array también falla', async () => {
    const { evaluatePlan } = await load();
    const t = 'google_secret_manager_secret_version';
    const variants = [
      { address: `${t}.x`, type: t, name: 'x' },
      noActions(t, { actions: null }),
      noActions(t, { actions: [] }),
      noActions(t, { actions: 'delete' }),
    ];
    for (const v of variants) {
      const r = evaluatePlan(plan([v]), { env: GOOD_ENV });
      expect(r.ok, JSON.stringify(v)).toBe(false);
      expect(r.violations.map((x) => x.rule)).toContain('plan-invalido');
    }
  });

  it('un recurso no protegido sin actions no bloquea', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(plan([noActions('google_project_service')]), { env: GOOD_ENV }).ok).toBe(true);
  });

  it('CLI: protegido sin actions sale con 1 y plan-invalido en stderr', () => {
    const f = join(tmpdir(), `plan-guard-r1-${process.pid}.json`);
    writeFileSync(f, JSON.stringify(plan([noActions('google_storage_bucket')])));
    try {
      const r = spawnSync('node', [SCRIPT, f], { env: { PATH: process.env.PATH ?? '', ...GOOD_ENV }, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('plan-invalido');
    } finally {
      rmSync(f, { force: true });
    }
  });

  it('sin plan.variables y con un mapeo de dominio falla cerrado', async () => {
    const { evaluatePlan } = await load();
    const p = { format_version: '1.2', resource_changes: [change('google_cloud_run_domain_mapping', 'custom', ['create'])] };
    const r = evaluatePlan(p, { env: GOOD_ENV });
    expect(r.ok).toBe(false);
  });
});

describe('guardia de plan: entrada y CLI', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plan-guard-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (planObj: unknown, env: Record<string, string>, args: string[] = []) => {
    const f = join(dir, 'plan.json');
    writeFileSync(f, typeof planObj === 'string' ? planObj : JSON.stringify(planObj));
    return spawnSync('node', [SCRIPT, f, ...args], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
  };

  it('un plan que no es objeto con resource_changes falla cerrado', async () => {
    const { evaluatePlan } = await load();
    expect(evaluatePlan(null, { env: GOOD_ENV }).ok).toBe(false);
    expect(evaluatePlan({}, { env: GOOD_ENV }).ok).toBe(false);
  });

  it('CLI: código 0 con plan limpio y 1 con violación; --label autoriza la rotación', () => {
    const ok = run(plan([]), GOOD_ENV);
    expect(ok.status).toBe(0);
    const rot = plan([change('google_secret_manager_secret_version', 'db', ['delete', 'create'])]);
    const bad = run(rot, GOOD_ENV);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('borrado-protegido');
    expect(run(rot, GOOD_ENV, ['--label', 'rotacion-secreto']).status).toBe(0);
  });

  it('CLI: JSON inválido sale con 2 y no imprime el valor de los secretos', () => {
    const r = run('{no json', { ...GOOD_ENV, TF_VAR_database_url: 'postgres://SECRETO-ABC' });
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).not.toContain('SECRETO-ABC');
  });
});
