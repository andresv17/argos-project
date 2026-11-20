import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T807 [N2] (NFR-ESC6-002; REQ-ESC6-031; N2-08): terraform/bootstrap.sh concede roles/cloudtasks.admin a la cuenta de apply y
 * roles/cloudtasks.viewer a la de plan. Pruebas sobre el TEXTO del script (nunca se ejecuta; lo corre Neo a mano).
 */
const text = readFileSync(join(process.cwd(), 'terraform', 'bootstrap.sh'), 'utf8');
const code = text.replace(/^\s*#.*$/gm, '');
/** Bucle `for role in ...; do ... done` que contiene el rol dado. */
const loopWith = (role: string): string => {
  const re = /for role in[\s\S]*?\bdone\b/g;
  return [...code.matchAll(re)].map((m) => m[0]).find((l) => l.includes(role)) ?? '';
};

describe('terraform/bootstrap.sh con Cloud Tasks (T807)', () => {
  it('concede roles/cloudtasks.admin solo a la cuenta de apply', () => {
    const l = loopWith('roles/cloudtasks.admin');
    expect(l).toContain('--member="serviceAccount:${APPLY_SA}"');
    expect(l).not.toContain('PLAN_SA');
    expect(l).toContain('add-iam-policy-binding');
  });

  it('concede roles/cloudtasks.viewer solo a la cuenta de plan', () => {
    const l = loopWith('roles/cloudtasks.viewer');
    expect(l).toContain('--member="serviceAccount:${PLAN_SA}"');
    expect(l).not.toContain('APPLY_SA');
    expect(l).toContain('add-iam-policy-binding');
  });

  it('es idempotente: solo vía add-iam-policy-binding, sin crear cuentas ni roles de Cloud Tasks', () => {
    const lines = code.split('\n').filter((x) => /cloudtasks/.test(x));
    expect(lines.length).toBeGreaterThan(0);
    for (const x of lines) expect(x).not.toMatch(/\b(create|delete|remove-iam-policy-binding)\b/);
    expect(code).not.toMatch(/roles\/cloudtasks\.(enqueuer|queueAdmin|taskRunner)/);
    expect(code).not.toMatch(/roles\/owner|roles\/editor/);
  });

  it('no contiene secretos ni valores reales (marcadores y variables)', () => {
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|-----BEGIN|ghp_[0-9A-Za-z]{20,}|postgres(ql)?:\/\/[^\s$]*:[^\s$]*@/);
    expect(code).not.toMatch(/[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com(?<!\$\{PROJECT\}\.iam\.gserviceaccount\.com)/);
  });
});
