import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** T437 (REQ-IAC-004, NFR-CLD-002): una sola política de limpieza KEEP de 4 versiones; sin DELETE por antigüedad. */
const FILE = join(process.cwd(), 'terraform', 'artifact_registry.tf');
const code = (): string => readFileSync(FILE, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');

describe('terraform/artifact_registry.tf (T437)', () => {
  it('declara un repositorio DOCKER en la región con prefijo y dry_run en false', () => {
    expect(existsSync(FILE)).toBe(true);
    const c = code();
    expect(c).toMatch(/resource\s+"google_artifact_registry_repository"\s+"argos"/);
    expect(c).toMatch(/format\s*=\s*"DOCKER"/);
    expect(c).toMatch(/location\s*=\s*var\.region/);
    expect(c).toMatch(/repository_id\s*=\s*"\$\{var\.project_prefix\}/);
    expect(c).toMatch(/cleanup_policy_dry_run\s*=\s*false/);
  });

  it('exactamente una cleanup_policies con action KEEP y most_recent_versions keep_count = 4', () => {
    const c = code();
    expect((c.match(/cleanup_policies\s*\{/g) ?? []).length).toBe(1);
    expect((c.match(/action\s*=\s*"KEEP"/g) ?? []).length).toBe(1);
    expect(c).toMatch(/most_recent_versions\s*\{[^}]*keep_count\s*=\s*4\b[^}]*\}/);
  });

  it('sin DELETE ni condiciones por antigüedad (older_than, older_than_days, condition)', () => {
    const c = code();
    expect(c).not.toMatch(/"DELETE"/);
    expect(c).not.toMatch(/older_than/);
    expect(c).not.toMatch(/\bcondition\s*\{/);
    expect(c).not.toMatch(/mirror/i);
  });
});
