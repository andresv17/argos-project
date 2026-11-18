import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T820 (N2-05 y N2-11, 006): enmienda de REQ-CLD-002 de 003: `timeout` de 120 s y memoria de 1 GiB (el worker de la escena es una solicitud real que espera la
 * generación; T_GEN = 90 s < timeout, `dispatchDeadline` 130 s en la tarea), sin cambio de `cpu_idle`, de instancias, de concurrencia ni de CPU
 * (NFR-ESC6-002, NFR-ESC6-003; INV-ESC6-013; SC-ESC6-055, SC-ESC6-092). Pruebas estáticas por lectura (Terraform no se ejecuta aquí; `apply` lo ejecuta Neo).
 */
const DIR = join(process.cwd(), 'terraform');
const strip = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');
const service = (): string => strip(readFileSync(join(DIR, 'cloud_run.tf'), 'utf8')).match(/resource\s+"google_cloud_run_v2_service"\s+"argos"\s*\{([^]*?)\n\}/)?.[1] ?? '';
const SPEC_003 = readFileSync(join(process.cwd(), 'specs/003-cloud-gcp/spec.md'), 'utf8');
const req = (): string => SPEC_003.split('\n').find((l) => l.startsWith('- **REQ-CLD-002**')) ?? '';

describe('terraform/cloud_run.tf con timeout 120 s y 1 GiB (T820, REQ-CLD-002 enmendado por la 006)', () => {
  it('NFR-ESC6-003: timeout = "120s" y memory = "1Gi"; ya no 60 s ni 512Mi', () => {
    const s = service();
    expect(s).toMatch(/timeout\s*=\s*"120s"/);
    expect(s).toMatch(/memory\s*=\s*"1Gi"/);
    expect(s).not.toMatch(/timeout\s*=\s*"60s"/);
    expect(s).not.toMatch(/memory\s*=\s*"512Mi"/);
  });

  it('NFR-ESC6-002: el resto de REQ-CLD-002 no cambia (1 vCPU, concurrencia 20, escala 0..2, cpu_idle = true, startup_cpu_boost, ingress)', () => {
    const s = service();
    expect(s).toMatch(/cpu\s*=\s*"1"/);
    expect(s).toMatch(/min_instance_count\s*=\s*0\b/);
    expect(s).toMatch(/max_instance_count\s*=\s*2\b/);
    expect(s).toMatch(/max_instance_request_concurrency\s*=\s*20\b/);
    expect(s).toMatch(/cpu_idle\s*=\s*true/);
    expect(s).toMatch(/startup_cpu_boost\s*=\s*true/);
    expect(s).toMatch(/ingress\s*=\s*"INGRESS_TRAFFIC_ALL"/);
  });

  it('INV-ESC6-013: Terraform no declara variables ARGOS_SCENE_* ni env (ignore_changes del entorno intacto; las fija deploy-argos.yml)', () => {
    const s = service();
    expect(s).not.toMatch(/\benv\s*\{/);
    expect(s).not.toMatch(/ARGOS_SCENE/);
    expect(s).toMatch(/template\[0\]\.containers\[0\]\.env/);
  });

  it('SC-ESC6-092: la espera de generación (90 s por defecto, máximo 105 s) cabe bajo el timeout y el dispatchDeadline de la tarea (130 s) lo supera', () => {
    const timeout = Number(/timeout\s*=\s*"(\d+)s"/.exec(service())?.[1]);
    const deadline = Number(/dispatchDeadline[^0-9]*(\d+)\s*s/.exec(readFileSync(join(DIR, 'cloud_tasks.tf'), 'utf8'))?.[1]);
    expect(timeout).toBe(120);
    expect(deadline).toBe(130);
    expect(105 + 15).toBeLessThanOrEqual(timeout);
    expect(deadline).toBeGreaterThan(timeout);
  });

  it('REQ-CLD-002: la spec de 003 declara timeout=120s y 1 GiB con la «Enmienda 006» (N2-05 y N2-11) y el dispatchDeadline de 130 s', () => {
    const text = req();
    expect(text).toMatch(/timeout=120s/);
    expect(text).toMatch(/1 GiB/);
    expect(text).not.toMatch(/timeout=60s/);
    expect(text).not.toMatch(/512 MiB, `concurrency=20`/);
    expect(text).toMatch(/Enmienda 006[^.]*N2-05[^.]*N2-11|Enmienda 006[^.]*N2-11[^.]*N2-05/);
    expect(text).toMatch(/dispatchDeadline[^.]*130 s/);
    expect(text).toContain('concurrency=20');
    expect(text).toContain('max-instances=2');
  });

  it('NFR-ESC6-003: el comentario de cloud_run.tf deja de afirmar que 512Mi alcanza y explica los 120 s y 1Gi', () => {
    const raw = readFileSync(join(DIR, 'cloud_run.tf'), 'utf8');
    expect(raw).not.toMatch(/Memoria: 512Mi alcanza/);
    expect(raw).toMatch(/120\s*s/);
    expect(raw).toMatch(/1Gi/);
  });
});
