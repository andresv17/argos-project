import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T484 (REQ-IAC-001, REQ-IAC-009, NFR-CLD-001): etiquetas app=argos y managed-by=terraform como literales en
 * cada recurso etiquetable (plan.md §2.1; sin locals.tf ni default_labels, H-MIF-004). Pruebas estáticas por
 * lectura (Terraform no se ejecuta aquí). El bucket (T441) se cubre en terraform-buckets.spec.ts.
 */
const read = (f: string): string => readFileSync(join(process.cwd(), 'terraform', f), 'utf8');
const code = (f: string): string => read(f).replace(/^\s*(#|\/\/).*$/gm, '');
const resource = (f: string, type: string, name?: string): string[] =>
  [...code(f).matchAll(new RegExp(`resource\\s+"${type}"\\s+"${name ?? '[a-z0-9_]+'}"\\s*\\{([^]*?)\\n\\}`, 'g'))].map(
    (m) => m[1] ?? '',
  );
/** Mapa `labels` del nivel del recurso (indentación de 2 espacios), no el de template. */
const labels = (body: string): Record<string, string> => {
  const raw = body.match(/^ {2}labels\s*=\s*\{([^]*?)\n {2}\}/m)?.[1] ?? '';
  return Object.fromEntries(
    [...raw.matchAll(/^\s*([a-z-]+)\s*=\s*"([^"]*)"\s*$/gm)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
};
const EXPECTED = { app: 'argos', 'managed-by': 'terraform' };

const CASES: Array<[string, string, string | undefined]> = [
  ['artifact_registry.tf', 'google_artifact_registry_repository', 'argos'],
  ['secret_manager.tf', 'google_secret_manager_secret', 'database_url'],
  ['secret_manager.tf', 'google_secret_manager_secret', 'audit_hmac_secret'],
  // D9-30 (8) / T1316: el 6.º secreto también lleva app y managed-by.
  ['secret_manager.tf', 'google_secret_manager_secret', 'gemini_api_key'],
  // Feature 012, Bloque D: 7.º secreto (ficha QR, PHONE_HMAC_KEY), con app y managed-by.
  ['secret_manager.tf', 'google_secret_manager_secret', 'phone_hmac_key'],
  ['cloud_run.tf', 'google_cloud_run_v2_service', 'argos'],
];

describe('etiquetas app y managed-by (T484)', () => {
  for (const [file, type, name] of CASES) {
    it(`${type}.${name} (${file}) lleva exactamente app=argos y managed-by=terraform`, () => {
      const [body] = resource(file, type, name);
      expect(typeof body, 'recurso no encontrado').toBe('string');
      expect(labels(body ?? '')).toEqual(EXPECTED);
    });
  }

  it('todo secreto, repositorio y servicio declarado está cubierto por los casos', () => {
    const count = (f: string, t: string): number => resource(f, t).length;
    expect(count('artifact_registry.tf', 'google_artifact_registry_repository')).toBe(1);
    expect(count('secret_manager.tf', 'google_secret_manager_secret')).toBe(8);
    expect(count('cloud_run.tf', 'google_cloud_run_v2_service')).toBe(1);
  });

  it('las etiquetas del servicio están a nivel de servicio, no solo en template', () => {
    const [body] = resource('cloud_run.tf', 'google_cloud_run_v2_service', 'argos');
    expect(Object.keys(labels(body ?? '')).length).toBe(2);
  });

  it('las etiquetas NO van en ignore_changes (solo template[0].labels)', () => {
    const [body] = resource('cloud_run.tf', 'google_cloud_run_v2_service', 'argos');
    const ignored = (body ?? '').match(/ignore_changes\s*=\s*\[([^]*?)\n\s*\]/)?.[1] ?? '';
    const entries = ignored.split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean);
    expect(entries).toContain('template[0].labels');
    expect(entries.filter((e) => /labels/.test(e))).toEqual(['template[0].labels']);
  });

  it('sin locals.tf, sin bloque locals y sin default_labels en el provider', () => {
    const files = ['provider.tf', 'artifact_registry.tf', 'secret_manager.tf', 'cloud_run.tf'];
    for (const f of files) {
      expect(code(f), f).not.toMatch(/\blocals\s*\{/);
      expect(code(f), f).not.toMatch(/default_labels/);
    }
    expect(() => read('locals.tf')).toThrow(Error);
  });
});
