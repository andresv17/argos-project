import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * T451 (REQ-SEC-001, REQ-SEC-005, SC-CLD-004): escaneo de secretos por patrones, sin dependencias ni binarios
 * (scripts/scan-secrets.mjs). Los secretos de prueba se construyen por concatenación para que este archivo no sea
 * un hallazgo; son sintéticos y no abren nada.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'scan-secrets.mjs');
const root = mkdtempSync(join(tmpdir(), 'scan-secrets-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Finding {
  file: string;
  line: number;
  rule: string;
}
interface Mod {
  scanText: (name: string, text: string) => Finding[];
  scanDir: (dir: string) => Finding[];
  scanLiterals: (name: string, text: string, values: Record<string, string>) => Finding[];
  isForbiddenFile: (path: string) => boolean;
}
// @ts-expect-error TS7016: módulo .mjs sin declaraciones (se tipa con Mod)
const load = async (): Promise<Mod> => (await import('../../scripts/scan-secrets.mjs')) as unknown as Mod;

const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const PG_URL = 'postgresql://argos_app:' + 'Zq81xKd0pLm3Vb7n' + '@ep-cool-123-pooler.us-east-2.aws.neon.tech/argos?sslmode=require';
const AWS = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const GH = 'gh' + 'p_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const GAPI = 'AI' + 'za' + 'SyA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P67';
const HMAC = 'a1'.repeat(16) + 'b2'.repeat(16);

const rulesOf = async (text: string): Promise<string[]> => (await load()).scanText('f.txt', text).map((f) => f.rule);

describe('patrones de secretos (SC-CLD-004)', () => {
  it.each([
    ['clave privada PEM', `x\n${PEM}\nabc\n`, 'clave-privada'],
    ['URL de Postgres con contraseña real', `DATABASE_URL=${PG_URL}`, 'url-con-contrasena'],
    ['clave de acceso AWS', `key = "${AWS}"`, 'token-conocido'],
    ['token de GitHub', `token: ${GH}`, 'token-conocido'],
    ['clave de API de Google', `k=${GAPI}`, 'token-conocido'],
    ['cuenta de servicio de GCP', '{"type": "service_account", "project_id": "p"}', 'cuenta-de-servicio'],
    ['HMAC de auditoría asignado', `ARGOS_AUDIT_HMAC_SECRET=${HMAC}`, 'hmac-auditoria'],
    ['HMAC en YAML', `TF_VAR_audit_hmac_secret: "${HMAC}"`, 'hmac-auditoria'],
  ])('[REQ-SEC-001] detecta %s', async (_n, text, rule) => {
    expect(await rulesOf(text)).toContain(rule);
  });

  it.each([
    ['URL con marcadores de posición', 'DATABASE_URL=postgres://<usuario>:<clave>@host/db'],
    ['URL con variable', 'postgres://argos_app:${DB_PASS}@localhost/argos'],
    ['URL con $VAR', 'postgres://argos_app:$DB_PASS@localhost/argos'],
    ['URL de local sin secreto real', 'postgres://postgres:postgres@localhost:5432/argos_test'],
    ['URL con puntos suspensivos', 'postgres://user:...@host/db'],
    ['HMAC con marcador', 'ARGOS_AUDIT_HMAC_SECRET=<hex 64+>'],
    ['HMAC desde secreto de CI', 'TF_VAR_audit_hmac_secret: ${{ secrets.TF_VAR_audit_hmac_secret }}'],
    ['HMAC público de desarrollo', 'ARGOS_AUDIT_HMAC_SECRET=' + 'de'.repeat(32)],
    ['texto sin secretos', 'const x = 1;\n// nada que ver\n'],
  ])('[REQ-SEC-001] no marca %s', async (_n, text) => {
    expect(await rulesOf(text)).toEqual([]);
  });

  it('[REQ-SEC-001] la regla de URL no aplica a fixtures de tests/ ni a loopback, pero un token en tests/ sí se marca', async () => {
    const m = await load();
    expect(m.scanText('tests/unit/x.spec.ts', `u = '${PG_URL}'`)).toEqual([]);
    expect(m.scanText('src/x.ts', `u = '${PG_URL}'`).map((f) => f.rule)).toEqual(['url-con-contrasena']);
    expect(m.scanText('docker-compose.yml', 'postgres://argos_test:Zq81xKd0pLm3@127.0.0.1:55432/db')).toEqual([]);
    expect(m.scanText('tests/unit/x.spec.ts', `t = '${GH}'`).map((f) => f.rule)).toEqual(['token-conocido']);
  });

  it('[REQ-SEC-001] el marcador argos-scan:allow en la línea suprime el hallazgo', async () => {
    expect(await rulesOf(`k=${GH} # argos-scan:allow`)).toEqual([]);
  });

  it('[REQ-SEC-001] los hallazgos llevan archivo, línea y regla, nunca el valor', async () => {
    const f = (await load()).scanText('a/b.txt', `uno\ndos\nk=${GH}\n`);
    expect(f).toEqual([{ file: 'a/b.txt', line: 3, rule: 'token-conocido' }]);
    expect(JSON.stringify(f)).not.toContain(GH);
  });
});

describe('archivos prohibidos en el repositorio y la imagen (REQ-SEC-005)', () => {
  it.each(['.env', 'a/.env.local', 'k/clave.pem', 'k/id.key', 'terraform/terraform.tfstate', 'terraform/x.tfstate.backup', 'sa-key.json', 'gcp-service-account.json'])(
    '[REQ-SEC-005] %s es prohibido',
    async (p) => {
      expect((await load()).isForbiddenFile(p)).toBe(true);
    },
  );
  it.each(['.env.example', 'src/environment.ts', 'package.json', 'keys.md', 'a/keyboard.ts'])('[REQ-SEC-005] %s se permite', async (p) => {
    expect((await load()).isForbiddenFile(p)).toBe(false);
  });
});

describe('escaneo de un directorio, p. ej. el sistema de archivos de una imagen (SC-CLD-004)', () => {
  it('[SC-CLD-004] encuentra un secreto anidado y un archivo prohibido; omite binarios', async () => {
    const d = join(root, 'img');
    mkdirSync(join(d, 'app', 'sub'), { recursive: true });
    writeFileSync(join(d, 'app', 'sub', 'cfg.js'), `module.exports = "${AWS}";\n`);
    writeFileSync(join(d, 'app', '.env'), 'X=1\n');
    writeFileSync(join(d, 'app', 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(AWS)]));
    const got = (await load()).scanDir(d).map((f) => `${f.file}:${f.rule}`).sort();
    expect(got).toEqual(['app/.env:archivo-prohibido', 'app/sub/cfg.js:token-conocido']);
  });

  it('[SC-CLD-004] un directorio limpio no tiene hallazgos', async () => {
    const d = join(root, 'clean');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.js'), 'console.log("hola");\n');
    expect((await load()).scanDir(d)).toEqual([]);
  });
});

describe('búsqueda de valores literales en registros de CI y comentarios (SC-CLD-004)', () => {
  it('[SC-CLD-004] reporta el nombre de la variable cuyo valor aparece, sin el valor', async () => {
    const f = (await load()).scanLiterals('ci.log', 'paso 1\nconectando con Zq81xKd0pLm3Vb7n ok\n', { DB_PASS: 'Zq81xKd0pLm3Vb7n', OTRO: 'no-aparece-nunca-1' });
    expect(f).toEqual([{ file: 'ci.log', line: 2, rule: 'valor-literal:DB_PASS' }]);
    expect(JSON.stringify(f)).not.toContain('Zq81xKd0pLm3Vb7n');
  });

  it('[SC-CLD-004] ignora valores vacíos o de menos de 8 caracteres (ruido)', async () => {
    expect((await load()).scanLiterals('ci.log', 'abc 1234567 ok', { A: 'abc', B: '', C: '1234567' })).toEqual([]);
  });
});

describe('CLI (SC-CLD-004)', () => {
  const run = (args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });

  it('[SC-CLD-004] dir: exit 1 con hallazgo y stdout sin el valor; exit 0 limpio', () => {
    const bad = join(root, 'cli-bad');
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(bad, 'a.txt'), `t=${GH}\n`);
    const r = run(['dir', bad]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('token-conocido');
    expect(r.stdout + r.stderr).not.toContain(GH);
    const ok = join(root, 'cli-ok');
    mkdirSync(ok, { recursive: true });
    writeFileSync(join(ok, 'a.txt'), 'nada\n');
    expect(run(['dir', ok]).status).toBe(0);
  });

  it('[SC-CLD-004] file: busca patrones en un registro y, con --literal-env, el valor de un secreto de prueba', () => {
    const log = join(root, 'run.log');
    writeFileSync(log, 'inicio\nvalor Zq81xKd0pLm3Vb7n expuesto\n');
    const r = run(['file', log, '--literal-env', 'SECRETO_PRUEBA'], { SECRETO_PRUEBA: 'Zq81xKd0pLm3Vb7n' });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('valor-literal:SECRETO_PRUEBA');
    expect(r.stdout + r.stderr).not.toContain('Zq81xKd0pLm3Vb7n');
  });

  it('[SC-CLD-004] uso incorrecto: exit 2', () => {
    expect(run([]).status).toBe(2);
    expect(run(['dir']).status).toBe(2);
    expect(run(['nada', 'x']).status).toBe(2);
  });
});

describe('repositorio versionado (SC-CLD-004: repositorio = 0)', () => {
  it('[SC-CLD-004][REQ-SEC-001] `repo` no encuentra secretos en los archivos versionados', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'repo'], { encoding: 'utf8', cwd: process.cwd() });
    expect(r.stdout + r.stderr).toContain('0 hallazgos');
    expect(r.status).toBe(0);
  });
});
