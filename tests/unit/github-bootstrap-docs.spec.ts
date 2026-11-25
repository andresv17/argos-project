import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T450 (REQ-CICD-006, REQ-SEC-001, REQ-IAC-014, REQ-CICD-012, D-18, D-19): la guía de bootstrap del día 0 de
 * secretos y variables de GitHub vive en terraform/README.md y en quickstart.md §6, y debe nombrar exactamente
 * lo que leen infraestructura.yml y deploy-argos.yml.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const SECRETOS = ['TF_VAR_database_url', 'TF_VAR_audit_hmac_secret', 'TF_VAR_share_ip_hmac_secret', 'DATABASE_URL_DIRECT', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_REDIRECT_URI'];
const VARIABLES = [
  'TF_VAR_project_id', 'TF_VAR_region', 'TF_VAR_custom_domain', 'TF_VAR_billing_account',
  'GCP_WIF_PROVIDER', 'GCP_DEPLOY_SA', 'GCP_TERRAFORM_SA', 'GCP_TERRAFORM_PLAN_SA', 'TF_STATE_BUCKET',
  'ARGOS_PUBLIC_BASE_URL', 'ARGOS_TRUST_PROXY_HOPS',
];
const DOCS = ['terraform/README.md', 'specs/003-cloud-gcp/quickstart.md'];

function leidosPorFlujos(): { secretos: string[]; variables: string[] } {
  const yml = ['.github/workflows/infraestructura.yml', '.github/workflows/deploy-argos.yml'].map(read).join('\n');
  const uniq = (re: RegExp): string[] => [...new Set([...yml.matchAll(re)].map((m) => m[1] as string))].sort();
  return { secretos: uniq(/\$\{\{\s*secrets\.([A-Za-z_]+)/g).filter((n) => n !== 'GITHUB_TOKEN'), variables: uniq(/\$\{\{\s*vars\.([A-Za-z_]+)/g) };
}

describe('T450 guía de bootstrap del día 0', () => {
  it('la lista de la guía coincide con lo que leen los flujos (sin sobrantes ni faltantes)', () => {
    const { secretos, variables } = leidosPorFlujos();
    expect(secretos).toEqual([...SECRETOS].sort());
    expect(variables).toEqual([...VARIABLES].sort());
  });

  for (const doc of DOCS) {
    describe(doc, () => {
      const texto = read(doc);
      for (const nombre of [...SECRETOS, ...VARIABLES]) {
        it(`menciona ${nombre}`, () => {
          expect(texto).toContain(nombre);
        });
      }
      it('declara el Environment produccion con revisor Neo', () => {
        expect(texto).toMatch(/produccion/);
        expect(texto).toMatch(/revisor[^\n]*Neo|Neo[^\n]*revisor/i);
      });
      it('declara que NEON_API_KEY y NEON_PROJECT_ID no existen (D-19)', () => {
        expect(texto).toMatch(/Sin `NEON_API_KEY` ni `NEON_PROJECT_ID`/);
        expect(texto).toContain('D-19');
      });
      it('explica el orden: bootstrap.sh, luego secretos, luego el primer plan', () => {
        const iBoot = texto.indexOf('bootstrap.sh');
        const iSecreto = texto.indexOf('gh secret set');
        const iPlan = texto.search(/primer plan/i);
        expect(iBoot).toBeGreaterThanOrEqual(0);
        expect(iSecreto).toBeGreaterThan(iBoot);
        expect(iPlan).toBeGreaterThan(iSecreto);
      });
      it('indica re-ejecutar deploy-argos.yml si la aprobación en produccion supera 45 min (D-29 res. 4, T488)', () => {
        expect(texto).toContain('supera 45 min');
        expect(texto).toContain('re-ejecute deploy-argos.yml tras aprobar y terminar el apply');
      });
      it('TF_VAR_billing_account sale de bootstrap.sh paso 6 y ARGOS_BILLING_ACCOUNT', () => {
        expect(texto).toContain('ARGOS_BILLING_ACCOUNT');
        expect(texto).toMatch(/paso 6/);
      });
    });
  }
});
