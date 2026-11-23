import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_EMAILS_NAME,
  ADMIN_GOOGLE_CALLBACK_PATH,
  AppConfigError,
  isValidAdminEmail,
  loadAppConfig,
  parseAdminEmails,
} from '../../src/infrastructure/config/app-config.ts';

/**
 * T1227 (Feature 009, #19; REQ-ADM9-003, REQ-ADM9-006, EDGE-009-009; SC-009-048; INV-ARCH-006):
 * `ARGOS_ADMIN_EMAILS` es una lista cerrada leída SOLO en `app-config.ts`; formato de correo validado;
 * la URI de redirección de administración es fija; ningún correo real en el repositorio.
 */

const BASE = { NODE_ENV: 'test' } as const;
const REPO = process.cwd();
const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8');

describe('T1227 lista cerrada ARGOS_ADMIN_EMAILS (app-config.ts)', () => {
  it('sin variable, la lista de administración es vacía (falla cerrado)', () => {
    expect(parseAdminEmails(undefined)).toEqual({ ok: true, emails: [] });
    expect(loadAppConfig({ ...BASE }).adminEmails).toEqual([]);
  });

  it('acepta una lista separada por comas, recorta espacios y normaliza a minúsculas', () => {
    expect(parseAdminEmails(' Ana.Admin@Example.COM ,ops@example.org')).toEqual({
      ok: true,
      emails: ['ana.admin@example.com', 'ops@example.org'],
    });
    expect(loadAppConfig({ ...BASE, [ADMIN_EMAILS_NAME]: 'admin@example.com' }).adminEmails).toEqual(['admin@example.com']);
  });

  it('rechaza duplicados y elementos vacíos', () => {
    expect(parseAdminEmails('a@example.com,A@example.com').ok).toBe(false);
    expect(parseAdminEmails('a@example.com,,b@example.com').ok).toBe(false);
    expect(parseAdminEmails('a@example.com,').ok).toBe(false);
  });

  it('valida el formato de cada correo', () => {
    expect(isValidAdminEmail('admin@example.com')).toBe(true);
    expect(isValidAdminEmail('sin-arroba.example.com')).toBe(false);
    expect(isValidAdminEmail('dos@@example.com')).toBe(false);
    expect(isValidAdminEmail('espacio en@example.com')).toBe(false);
    expect(isValidAdminEmail('a@b')).toBe(false);
    expect(isValidAdminEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
    expect(isValidAdminEmail('a,b@example.com')).toBe(false);
  });

  it('un valor inválido rechaza el arranque nombrando solo la variable, nunca el valor', () => {
    const secretLike = 'no-es-un-correo-valor-sensible';
    let caught: unknown;
    try {
      loadAppConfig({ ...BASE, [ADMIN_EMAILS_NAME]: secretLike });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppConfigError);
    expect((caught as AppConfigError).variables).toEqual([ADMIN_EMAILS_NAME]);
    expect((caught as AppConfigError).message).not.toContain(secretLike);
  });

  it('la URI de redirección de administración es exactamente /api/admin/auth/google/callback', () => {
    expect(ADMIN_GOOGLE_CALLBACK_PATH).toBe('/api/admin/auth/google/callback');
  });
});

describe('T1227 terraform y documentación sin valores reales', () => {
  it('terraform declara la URI de administración con la ruta fija y validación', () => {
    const vars = read('terraform/variables.tf');
    expect(vars).toMatch(/variable\s+"google_oauth_admin_redirect_uri"\s*\{/);
    const block = vars.slice(vars.indexOf('variable "google_oauth_admin_redirect_uri"'));
    expect(block.slice(0, block.indexOf('\n}\n'))).toMatch(/\/api\/admin\/auth\/google\/callback/);
    expect(block.slice(0, block.indexOf('\n}\n'))).toMatch(/validation\s*\{/);
  });

  it('terraform no contiene correos reales: solo dominios de ejemplo', () => {
    const files = ['terraform/variables.tf', 'terraform/outputs.tf', 'terraform/README.md', '.env.example'];
    for (const f of files) {
      const emails = read(f).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
      for (const e of emails) expect(e.endsWith('@example.com') || e.endsWith('@example.invalid') || e.endsWith('@example.org'), `${f}: ${e}`).toBe(true);
    }
  });

  it('el runbook documenta el alta de la URI en Google y la lista de administración', () => {
    expect(existsSync(join(REPO, 'terraform/README.md'))).toBe(true);
    const readme = read('terraform/README.md');
    expect(readme).toContain('ARGOS_ADMIN_EMAILS');
    expect(readme).toContain('/api/admin/auth/google/callback');
    expect(readme).toMatch(/Neo/);
  });
});
