import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppConfigError, DEVELOPMENT_AUDIT_HMAC_SECRET, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * T472 (REQ-CICD-009, REQ-SEC-002, SC-CLD-018, EDGE-CLD-05): validación de DATABASE_URL y del secreto HMAC antes de crear la versión.
 * Paso de CI (scripts/validate-secrets.mjs): infraestructura.yml lo invoca; aquí se prueba con valores sintéticos.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'validate-secrets.mjs');
const GOOD_DB = 'postgresql://argos_app:s3cr3t-pw@ep-cool-123-pooler.us-east-2.aws.neon.tech/argos?sslmode=require';
const GOOD_DIRECT = 'postgresql://argos_migrator:d1rect-pw@ep-cool-123.us-east-2.aws.neon.tech/argos?sslmode=require';
const GOOD_HMAC = 'ab'.repeat(32);

interface Violation {
  rule: string;
  variable: string;
}
interface Result {
  ok: boolean;
  violations: Violation[];
  values: Record<string, string>;
}
interface Mod {
  validateSecrets: (env: Record<string, string | undefined>) => Result;
}
// @ts-expect-error TS7016: módulo .mjs sin declaraciones (se tipa con Mod)
const load = async (): Promise<Mod> => (await import('../../scripts/validate-secrets.mjs')) as unknown as Mod;
const ENV = { TF_VAR_database_url: GOOD_DB, TF_VAR_audit_hmac_secret: GOOD_HMAC, DATABASE_URL_DIRECT: GOOD_DIRECT };
const rules = async (env: Record<string, string | undefined>): Promise<string[]> => (await load()).validateSecrets(env).violations.map((v) => `${v.variable}:${v.rule}`);

describe('DATABASE_URL de aplicación (REQ-CICD-009)', () => {
  it('[REQ-CICD-009] valores correctos: ok y sin violaciones', async () => {
    const r = (await load()).validateSecrets(ENV);
    expect([r.ok, r.violations]).toEqual([true, []]);
  });

  it.each([
    ['espacios al inicio y al final', `  ${GOOD_DB}  `],
    ['tabulador al final', `${GOOD_DB}\t`],
  ])('[REQ-CICD-009] %s: se recorta (trim) y el valor devuelto está limpio', async (_n, value) => {
    const r = (await load()).validateSecrets({ ...ENV, TF_VAR_database_url: value });
    expect([r.ok, r.values['TF_VAR_database_url']]).toEqual([true, GOOD_DB]);
  });

  it.each([
    ['salto de línea final', `${GOOD_DB}\n`],
    ['retorno de carro final', `${GOOD_DB}\r`],
    ['CRLF final', `${GOOD_DB}\r\n`],
    ['salto de línea interno', GOOD_DB.replace('/argos', '\n/argos')],
    ['espacio interno', GOOD_DB.replace('argos_app', 'argos app')],
  ])('[EDGE-CLD-05][SC-CLD-018] %s: se rechaza', async (_n, value) => {
    expect(await rules({ ...ENV, TF_VAR_database_url: value })).toEqual(['TF_VAR_database_url:espacio-o-salto']);
  });

  it.each([
    ['sin sslmode', GOOD_DB.replace('?sslmode=require', '')],
    ['sslmode=prefer', GOOD_DB.replace('require', 'prefer')],
    ['sslmode=disable', GOOD_DB.replace('require', 'disable')],
  ])('[REQ-CICD-009] %s: se rechaza por sslmode', async (_n, value) => {
    expect(await rules({ ...ENV, TF_VAR_database_url: value })).toEqual(['TF_VAR_database_url:sslmode']);
  });

  it.each([
    ['https', 'https://ep-a-pooler.neon.tech/db?sslmode=require'],
    ['sin esquema', 'ep-a-pooler.neon.tech/db?sslmode=require'],
    ['vacía', ''],
  ])('[REQ-CICD-009] formato inválido (%s): se rechaza', async (_n, value) => {
    expect((await rules({ ...ENV, TF_VAR_database_url: value })).includes('TF_VAR_database_url:formato')).toBe(true);
  });

  it('[REQ-CICD-009] la URL de aplicación sin -pooler en el host se rechaza', async () => {
    expect(await rules({ ...ENV, TF_VAR_database_url: GOOD_DIRECT })).toEqual(['TF_VAR_database_url:pooler-requerido']);
  });

  it('[REQ-CICD-009] -pooler solo cuenta en el host, no en la ruta ni la contraseña', async () => {
    const tricky = 'postgresql://u:x-pooler@ep-cool-123.neon.tech/db-pooler?sslmode=require';
    expect(await rules({ ...ENV, TF_VAR_database_url: tricky })).toEqual(['TF_VAR_database_url:pooler-requerido']);
  });
});

describe('DATABASE_URL_DIRECT (REQ-CICD-009)', () => {
  it('[REQ-CICD-009] con -pooler en el host se rechaza', async () => {
    expect(await rules({ ...ENV, DATABASE_URL_DIRECT: GOOD_DB })).toEqual(['DATABASE_URL_DIRECT:pooler-prohibido']);
  });

  it('[REQ-CICD-009] misma validación de salto de línea y sslmode', async () => {
    expect(await rules({ ...ENV, DATABASE_URL_DIRECT: `${GOOD_DIRECT}\n` })).toEqual(['DATABASE_URL_DIRECT:espacio-o-salto']);
    expect(await rules({ ...ENV, DATABASE_URL_DIRECT: GOOD_DIRECT.replace('?sslmode=require', '') })).toEqual(['DATABASE_URL_DIRECT:sslmode']);
  });

  it('[REQ-CICD-009] si no se entrega, no se valida (solo lo usan migrate y vacuum)', async () => {
    const { DATABASE_URL_DIRECT: _omit, ...rest } = ENV;
    expect((await load()).validateSecrets(rest).ok).toBe(true);
  });
});

describe('ARGOS_AUDIT_HMAC_SECRET (REQ-SEC-002)', () => {
  it.each([
    ['corto (31 bytes)', 'ab'.repeat(31)],
    ['no hexadecimal', 'zz'.repeat(32)],
    ['longitud impar', `${'ab'.repeat(32)}a`],
    ['vacío', ''],
    ['clave fija de desarrollo', DEVELOPMENT_AUDIT_HMAC_SECRET],
  ])('[REQ-SEC-002] %s: se rechaza', async (_n, value) => {
    expect(await rules({ ...ENV, TF_VAR_audit_hmac_secret: value })).toEqual(['TF_VAR_audit_hmac_secret:hmac']);
  });

  it('[REQ-SEC-002] salto de línea final se rechaza (EDGE-CLD-05) y espacios de borde se recortan', async () => {
    expect(await rules({ ...ENV, TF_VAR_audit_hmac_secret: `${GOOD_HMAC}\n` })).toEqual(['TF_VAR_audit_hmac_secret:espacio-o-salto']);
    expect((await load()).validateSecrets({ ...ENV, TF_VAR_audit_hmac_secret: ` ${GOOD_HMAC} ` }).values['TF_VAR_audit_hmac_secret']).toBe(GOOD_HMAC);
  });

  it.each([GOOD_HMAC, 'AB'.repeat(32), 'ab'.repeat(40), DEVELOPMENT_AUDIT_HMAC_SECRET, 'ab'.repeat(31), 'zz'.repeat(32)])(
    '[REQ-SEC-002] paridad con app-config en producción: el mismo veredicto (%s)',
    async (secret) => {
      let appAccepts = true;
      try {
        loadAppConfig({ NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: secret });
      } catch (e) {
        if (!(e instanceof AppConfigError)) throw e;
        appAccepts = false;
      }
      expect((await load()).validateSecrets({ ...ENV, TF_VAR_audit_hmac_secret: secret }).ok).toBe(appAccepts);
    },
  );
});

describe('CLI: enmascaramiento y salida (REQ-CICD-009)', () => {
  const run = (env: Record<string, string>) => spawnSync('node', [SCRIPT], { env: { PATH: process.env['PATH'] ?? '', ...env }, encoding: 'utf8' });

  it('[REQ-CICD-009] con valores correctos: rc 0 y ::add-mask:: de cada valor es la primera salida', () => {
    const r = run(ENV);
    const lines = r.stdout.split('\n').filter((l) => l !== '');
    const maskCount = lines.filter((l) => l.startsWith('::add-mask::')).length;
    expect([r.status, lines.slice(0, maskCount).every((l) => l.startsWith('::add-mask::')), maskCount >= 3]).toEqual([0, true, true]);
    for (const v of [GOOD_DB, GOOD_DIRECT, GOOD_HMAC]) expect(lines).toContain(`::add-mask::${v}`);
  });

  it('[REQ-CICD-009] fuera de las líneas ::add-mask::, ningún valor aparece en stdout ni stderr (ni con rechazo)', () => {
    const bad = run({ ...ENV, TF_VAR_database_url: `${GOOD_DB}\n` });
    const all = `${bad.stdout}\n${bad.stderr}`.split('\n').filter((l) => !l.startsWith('::add-mask::')).join('\n');
    expect([bad.status, all.includes('s3cr3t-pw'), all.includes(GOOD_HMAC), all.includes('d1rect-pw')]).toEqual([1, false, false, false]);
  });

  it('[REQ-CICD-009] enmascara incluso un valor rechazado (antes de cualquier mensaje) y cada línea de un valor multilínea', () => {
    const bad = run({ ...ENV, TF_VAR_audit_hmac_secret: 'linea-uno-secreta\nlinea-dos-secreta' });
    const lines = bad.stdout.split('\n');
    const firstNonMask = lines.findIndex((l) => l !== '' && !l.startsWith('::add-mask::'));
    const masks = lines.slice(0, firstNonMask === -1 ? lines.length : firstNonMask);
    expect([bad.status, masks.includes('::add-mask::linea-uno-secreta'), masks.includes('::add-mask::linea-dos-secreta')]).toEqual([1, true, true]);
  });

  it('[REQ-CICD-009] con variable ausente: rc 1 y cita solo el nombre', () => {
    const r = run({ TF_VAR_audit_hmac_secret: GOOD_HMAC });
    expect([r.status, r.stderr.includes('TF_VAR_database_url')]).toEqual([1, true]);
  });
});
