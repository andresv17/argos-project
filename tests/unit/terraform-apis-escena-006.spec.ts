import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T816 (N2-05, 006): enmienda de REQ-IAC-009 de 003, de 12 a 14 APIs: se añaden `aiplatform.googleapis.com` (Vertex) y `cloudtasks.googleapis.com` (cola
 * `argos-scene`) (NFR-ESC6-002, NFR-ESC6-001; REQ-ESC6-031). Pruebas estáticas por lectura (Terraform no se ejecuta aquí; `apply` lo ejecuta Neo).
 */
const DIR = join(process.cwd(), 'terraform');
const strip = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');
const services = (): string => strip(readFileSync(join(DIR, 'services.tf'), 'utf8'));
const SPEC_003 = readFileSync(join(process.cwd(), 'specs/003-cloud-gcp/spec.md'), 'utf8');
const ALL = [
  'run', 'artifactregistry', 'secretmanager', 'iam', 'iamcredentials', 'cloudscheduler', 'storage', 'logging', 'monitoring', 'cloudresourcemanager', 'serviceusage',
  'billingbudgets', 'aiplatform', 'cloudtasks',
];

describe('terraform/services.tf con 14 APIs (T816, REQ-IAC-009 enmendado por la 006)', () => {
  it('REQ-IAC-009: habilita exactamente las 12 APIs previas más aiplatform y cloudtasks, sin repetidas', () => {
    const s = services();
    const found = [...s.matchAll(/"([a-z]+)\.googleapis\.com"/g)].map((m) => m[1]);
    expect(found.sort()).toEqual([...ALL].sort());
    expect(new Set(found).size).toBe(14);
  });

  it('REQ-IAC-009: sigue siendo un solo google_project_service con for_each y disable_on_destroy = false', () => {
    const s = services();
    expect([...s.matchAll(/resource\s+"google_project_service"/g)]).toHaveLength(1);
    expect(s).toMatch(/for_each\s*=\s*toset\(\[/);
    expect(s).toMatch(/disable_on_destroy\s*=\s*false/);
  });

  it('REQ-IAC-009: la spec de 003 declara 14 APIs y nombra las dos nuevas con su enmienda de la 006 (N2-05)', () => {
    const req = SPEC_003.split('\n').find((l) => l.startsWith('- **REQ-IAC-009**')) ?? '';
    expect(req).toMatch(/\*\*14\*\* APIs/);
    expect(req).toContain('aiplatform.googleapis.com');
    expect(req).toContain('cloudtasks.googleapis.com');
    expect(req).toMatch(/Enmienda 006[^.]*N2-05/);
    expect(req).not.toMatch(/solo \*\*12\*\* APIs/);
  });

  it('REQ-IAC-009: el comentario de services.tf ya no dice «solo estas 12»', () => {
    const raw = readFileSync(join(DIR, 'services.tf'), 'utf8');
    expect(raw).not.toMatch(/solo estas 12/);
    expect(raw).toMatch(/14/);
  });
});
