// Feature 012, Bloque D (DEUDA-012-TERRAFORM-LOGS-QR; REQ-QR12-008, SC-012-086/107): exclusiones de Cloud Logging para las rutas
// que llevan el token de la ficha QR de emergencia en la URL. Sin estas exclusiones el registro de solicitudes de Cloud Run
// guardaría el token en claro en el sumidero _Default.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

interface Exclusion {
  name: string;
  body: string;
  filter: string;
}

const exclusions = (): Exclusion[] => {
  const c = read('terraform/logging.tf');
  const blocks = [...c.matchAll(/resource\s+"google_logging_project_exclusion"\s+"([a-z_]+)"\s*\{([\s\S]*?)\n\}/g)];
  return blocks.map((m) => ({
    name: m[1] ?? '',
    body: m[2] ?? '',
    filter: (m[2] ?? '').match(/filter\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '',
  }));
};

const byName = (name: string): Exclusion => {
  const found = exclusions().find((e) => e.name === name);
  if (!found) throw new Error(`falta la exclusión ${name}`);
  return found;
};

describe('terraform/logging.tf: exclusiones de la ficha QR de emergencia (Feature 012, Bloque D)', () => {
  it('la exclusión de la vista pública /e/{token} filtra solo solicitudes de Cloud Run con esa ruta', () => {
    const e = byName('emergency_qr_page_requests');
    expect(e.filter).toBe('resource.type=\\"cloud_run_revision\\" AND httpRequest.requestUrl:\\"/e/\\"');
    expect(e.body).toMatch(/project\s*=\s*var\.project_id/);
    expect(e.body).toMatch(/depends_on\s*=\s*\[google_project_service\.apis\]/);
  });

  it('la exclusión de la API /api/emergency/{token} filtra solo solicitudes de Cloud Run con esa ruta', () => {
    const e = byName('emergency_qr_api_requests');
    expect(e.filter).toBe('resource.type=\\"cloud_run_revision\\" AND httpRequest.requestUrl:\\"/api/emergency/\\"');
  });

  it('toda exclusión de la ficha QR acota por tipo de recurso y por la ruta (no descarta registros ajenos)', () => {
    for (const e of exclusions().filter((x) => x.name.startsWith('emergency_qr_'))) {
      expect(e.filter).toMatch(/^resource\.type=\\"cloud_run_revision\\" AND httpRequest\.requestUrl:\\"\/[^"\\]+\/\\"$/);
    }
  });

  it('logging.tf no contiene un token literal de 43 caracteres', () => {
    expect(read('terraform/logging.tf')).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
