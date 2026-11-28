import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T438 (REQ-IAC-005, REQ-IAC-007, REQ-IAC-013, REQ-SEC-001): secret_manager.tf. Pruebas estáticas por lectura
 * (Terraform no se ejecuta aquí).
 */
const FILE = join(process.cwd(), 'terraform', 'secret_manager.tf');
const raw = (): string => readFileSync(FILE, 'utf8');
const code = (): string => raw().replace(/^\s*(#|\/\/).*$/gm, '');
const block = (type: string, name: string): string => {
  const m = code().match(new RegExp(`resource\\s+"${type}"\\s+"${name}"\\s*\\{[^]*?\\n\\}`));
  return m?.[0] ?? '';
};

describe('terraform/secret_manager.tf (T438)', () => {
  it('el archivo existe', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('define los secretos argos-database-url y argos-audit-hmac-secret con replicación automática', () => {
    const c = code();
    expect(c).toMatch(/resource\s+"google_secret_manager_secret"/);
    expect(c).toContain('database-url');
    expect(c).toContain('audit-hmac-secret');
    // D9-30 (8) / T1316: 6.º secreto (argos-gemini-api-key), solo contenedor, sin google_secret_manager_secret_version.
    // Feature 012, Bloque D: 7.º secreto (argos-phone-hmac-key, PHONE_HMAC_KEY), con versión (ver el caso siguiente).
    expect((c.match(/resource\s+"google_secret_manager_secret"\s+"/g) ?? []).length).toBe(8);
    expect((c.match(/auto\s*\{\s*\}/g) ?? []).length).toBe(8);
    // H-01: contenedor origin-verify sin google_secret_manager_secret_version (el valor se carga fuera de Terraform).
    expect(c).toMatch(/\$\{var\.project_prefix\}-origin-verify-secret/);
    expect(c).not.toMatch(/resource\s+"google_secret_manager_secret_version"\s+"origin_verify/);
    expect(c).toMatch(/\$\{var\.project_prefix\}-phone-hmac-key/);
    expect(c).toMatch(/\$\{var\.project_prefix\}-gemini-api-key/);
    expect(c).not.toMatch(/resource\s+"google_secret_manager_secret_version"\s+"gemini_api_key"/);
    expect(c).toMatch(/\$\{var\.project_prefix\}-database-url/);
    expect(c).toMatch(/\$\{var\.project_prefix\}-audit-hmac-secret/);
  });

  it('hay una versión por secreto, sin count ni for_each condicional', () => {
    const c = code();
    // Feature 012, Bloque D: la versión de phone_hmac_key viene de var.phone_hmac_key (TF_VAR), nunca de un literal.
    expect((c.match(/resource\s+"google_secret_manager_secret_version"\s+"/g) ?? []).length).toBe(4);
    expect(c).toMatch(/resource\s+"google_secret_manager_secret_version"\s+"phone_hmac_key"[\s\S]*?secret_data\s*=\s*var\.phone_hmac_key/);
    for (const name of ['database_url', 'audit_hmac_secret']) {
      const v = block('google_secret_manager_secret_version', name);
      expect(v, name).not.toBe('');
      expect(v, name).not.toMatch(/\bcount\s*=/);
      expect(v, name).not.toMatch(/\bfor_each\s*=/);
    }
    expect(c).not.toMatch(/\bcount\s*=/);
  });

  it('secret_data sale solo de var.database_url y var.audit_hmac_secret', () => {
    expect(block('google_secret_manager_secret_version', 'database_url')).toMatch(/secret_data\s*=\s*var\.database_url\s*\n/);
    expect(block('google_secret_manager_secret_version', 'audit_hmac_secret')).toMatch(
      /secret_data\s*=\s*var\.audit_hmac_secret\s*\n/,
    );
  });

  it('las versiones tienen create_before_destroy y deletion_policy ABANDON', () => {
    for (const name of ['database_url', 'audit_hmac_secret']) {
      const v = block('google_secret_manager_secret_version', name);
      expect(v, name).toMatch(/create_before_destroy\s*=\s*true/);
      expect(v, name).toMatch(/deletion_policy\s*=\s*"ABANDON"/);
    }
  });

  it('los secretos tienen prevent_destroy = true', () => {
    for (const name of ['database_url', 'audit_hmac_secret']) {
      expect(block('google_secret_manager_secret', name), name).toMatch(/prevent_destroy\s*=\s*true/);
    }
  });

  it('ningún valor de secreto en el texto: sin secret_data literal, sin URL de Postgres ni hex largo', () => {
    const r = raw();
    expect(r).not.toMatch(/secret_data\s*=\s*"/);
    expect(r).not.toMatch(/postgres(ql)?:\/\//i);
    expect(r).not.toMatch(/[0-9a-f]{32,}/i);
    expect(r).not.toMatch(/mirror/i);
  });

  it('no declara salidas ni locals con secretos', () => {
    expect(code()).not.toMatch(/^\s*(output|locals)\s*[{"]/m);
  });
});
