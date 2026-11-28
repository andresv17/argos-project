import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T448 (REQ-CICD-003, 005, 006, 008, 009, 011, SC-CLD-006, 007, 023, D-03): deploy-argos.yml.
 * Pruebas estáticas por lectura del texto del flujo.
 */
const path = join(process.cwd(), '.github', 'workflows', 'deploy-argos.yml');
const load = (): string => readFileSync(path, 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');
const body = (): string => noComments(load());

/** Devuelve el texto del trabajo `name` (de su clave hasta el siguiente trabajo o el fin). */
const job = (name: string): string => {
  const y = body();
  const jobs = y.split(/^jobs:\s*$/m)[1] ?? '';
  const parts = jobs.split(/^ {2}(?=[\w-]+:\s*$)/m);
  return parts.find((p) => p.startsWith(`${name}:`)) ?? '';
};
/** Lista exacta de `needs` de un trabajo (acepta escalar o lista de flujo). */
const needsOf = (name: string): string[] => {
  const m = /^ {4}needs:\s*(?:\[([^\]]*)\]|(\S+))\s*$/m.exec(job(name));
  const raw = m?.[1] ?? m?.[2] ?? '';
  return raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
};
const jobNames = (): string[] => [...(body().split(/^jobs:\s*$/m)[1] ?? '').matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1] ?? '');

describe('.github/workflows/deploy-argos.yml (T448)', () => {
  it('el archivo existe', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('se dispara con push a main (rutas acotadas) y workflow_dispatch, sin pull_request', () => {
    const y = body();
    expect(y).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[\s*main\s*\]/m);
    expect(y).toMatch(/^ {4}paths:/m);
    for (const p of ['src/**', 'package*.json', 'Dockerfile', '.dockerignore', 'vite.config.ts', '.github/workflows/deploy-argos.yml']) {
      expect(y).toContain(`'${p}'`);
    }
    expect(y).toMatch(/^ {2}workflow_dispatch:/m);
    expect(y).not.toMatch(/pull_request/);
    expect(y).not.toMatch(/workflow_run/);
  });

  it('el deploy NO duplica el gate: el SDD Test Gate corre en los PR (test-gate.yml) y deploy-argos.yml no lo invoca (262fca8)', () => {
    expect(body()).not.toMatch(/test-gate\.yml/);
    expect(jobNames()).not.toContain('gate');
  });

  it('solo build-push y deploy tienen id-token: write (push y despliegue exigen GCP) con permissions mínimos', () => {
    const y = body();
    expect(y.match(/id-token:\s*write/g)?.length).toBe(2);
    for (const name of ['build-push', 'deploy']) {
      const d = job(name);
      expect(d).toMatch(/^ {4}permissions:\s*\n(?:\s+[\w-]+:\s*\w+\s*\n)*?\s+id-token:\s*write/m);
      expect(d).toMatch(/contents:\s*read/);
      expect(d).not.toMatch(/contents:\s*write/);
    }
    for (const name of jobNames()) {
      if (name !== 'deploy' && name !== 'build-push') expect(job(name)).not.toMatch(/id-token/);
    }
  });

  it('no existe trabajo compat (H-MIF-001)', () => {
    expect(jobNames()).not.toContain('compat');
    expect(body()).not.toMatch(/^ {2}compat:/m);
  });

  it('todos los trabajos declaran permissions propios y no hay permissions amplios', () => {
    const y = body();
    expect(y).not.toMatch(/write-all/);
    expect(y).not.toMatch(/read-all/);
    expect(y).not.toMatch(/^permissions:/m);
    for (const name of jobNames()) expect(job(name)).toMatch(/^ {4}permissions:/m);
  });

  it('cada uses: de terceros está fijado a SHA de 40 caracteres; actions/* admite etiqueta mayor; incluye auth y login-action', () => {
    const uses = [...body().matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (u.startsWith('actions/')) expect(u).toMatch(/^actions\/[\w.-]+@(v\d+|[0-9a-f]{40})$/);
      else expect(u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    }
    expect(uses.some((u) => u.startsWith('google-github-actions/auth@'))).toBe(true);
    expect(uses.some((u) => u.startsWith('docker/login-action@'))).toBe(true);
  });

  it('npm audit --omit=dev --audit-level=high precede al build de la imagen y a deploy (build-push depende de audit)', () => {
    const y = body();
    const audit = y.indexOf('npm audit --omit=dev --audit-level=high');
    const build = y.indexOf('docker build');
    expect(audit).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(audit);
    expect(job('audit')).toContain('npm audit --omit=dev --audit-level=high');
    expect(needsOf('build-push')).toEqual(['audit']);
  });

  it('el orden exacto de dependencias es audit -> build-push -> migrate -> deploy (el gate vive en los PR)', () => {
    expect(jobNames()).toEqual(['audit', 'build-push', 'migrate', 'deploy']);
    expect(needsOf('audit')).toEqual([]);
    expect(needsOf('build-push')).toEqual(['audit']);
    expect(needsOf('migrate')).toEqual(['build-push']);
    expect(needsOf('deploy')).toEqual(['migrate']);
  });

  it('migrate usa DATABASE_URL_DIRECT por env, scripts/migrate-postgres.ts y no tiene id-token ni credenciales de GCP', () => {
    const m = job('migrate');
    expect(m).toMatch(/DATABASE_URL_DIRECT:\s*\$\{\{\s*secrets\.DATABASE_URL_DIRECT\s*\}\}/);
    expect(m).toMatch(/scripts\/migrate-postgres\.ts/);
    expect(m).not.toMatch(/google-github-actions\/auth/);
    expect(m).not.toMatch(/NEON_/);
    expect(m).not.toMatch(/environment:/);
    expect(m).toMatch(/--ignore-scripts/);
  });

  it('una sola aprobación: environment produccion solo en deploy (Neo D3)', () => {
    for (const name of jobNames()) {
      if (name === 'deploy') expect(job(name)).toMatch(/^ {4}environment:\s*produccion\s*$/m);
      else expect(job(name)).not.toMatch(/environment:/);
    }
    expect(body().match(/^\s+environment:/gm)?.length).toBe(1);
  });

  it('deploy usa el entorno produccion, WIF por variables y sin llaves JSON', () => {
    const d = job('deploy');
    expect(d).toMatch(/^ {4}environment:\s*produccion\s*$/m);
    expect(d).toMatch(/workload_identity_provider:\s*\$\{\{\s*vars\.GCP_WIF_PROVIDER\s*\}\}/);
    expect(d).toMatch(/service_account:\s*\$\{\{\s*vars\.GCP_DEPLOY_SA\s*\}\}/);
    expect(body()).not.toMatch(/credentials_json|GCP_SA_KEY/);
  });

  it('build-push se autentica con WIF por variables, sin environment ni secretos de base de datos', () => {
    const b = job('build-push');
    expect(b).toMatch(/workload_identity_provider:\s*\$\{\{\s*vars\.GCP_WIF_PROVIDER\s*\}\}/);
    expect(b).toMatch(/service_account:\s*\$\{\{\s*vars\.GCP_DEPLOY_SA\s*\}\}/);
    expect(b).not.toMatch(/DATABASE_URL/);
  });

  it('imagen con etiqueta sha-<commit> en Artifact Registry y push (en build-push); deploy no reconstruye', () => {
    const d = job('build-push');
    expect(job('deploy')).not.toMatch(/docker (build|push)/);
    expect(d).toMatch(/-docker\.pkg\.dev\//);
    expect(d).toMatch(/argos-docker\/argos:sha-\$\{?GITHUB_SHA\}?/);
    expect(d).toMatch(/docker push/);
    expect(d.indexOf('docker build')).toBeLessThan(d.indexOf('docker push'));
  });

  it('despliega sin tráfico con sondas y secretos por versión numérica, nunca latest', () => {
    const d = job('deploy');
    expect(d).toMatch(/gcloud run deploy argos/);
    expect(d).toMatch(/--no-traffic/);
    expect(d).toMatch(/--startup-probe/);
    expect(d).toMatch(/--liveness-probe/);
    expect(d).toMatch(/\/healthz/);
    expect(d).toMatch(/DATABASE_URL=argos-database-url:\$\{?DB_VERSION\}?/);
    expect(d).toMatch(/ARGOS_AUDIT_HMAC_SECRET=argos-audit-hmac-secret:\$\{?HMAC_VERSION\}?/);
    expect(d).toMatch(/\^\[0-9\]\+\$/);
    expect(body()).not.toMatch(/(?:argos-database-url|argos-audit-hmac-secret):latest/);
  });

  it('inyecta ARGOS_SCHEDULER_EMAIL y ARGOS_OIDC_AUDIENCE en gcloud run deploy sin hardcodear (Neo D1, H-O-T448-1)', () => {
    const d = job('deploy');
    expect(d).toMatch(/ARGOS_SCHEDULER_EMAIL:\s*argos-scheduler@\$\{\{\s*vars\.TF_VAR_project_id\s*\}\}\.iam\.gserviceaccount\.com/);
    expect(d).toMatch(/gcloud run services describe "?\$SERVICE"?[^\n]*--format="?'?value\(status\.url\)'?"?/);
    expect(d).toMatch(/OIDC_AUDIENCE="?\$\(gcloud run services describe/);
    const deployCmd = d.slice(d.indexOf('gcloud run deploy argos'));
    expect(deployCmd).toMatch(/--set-env-vars\s+"[^"]*ARGOS_SCHEDULER_EMAIL=\$\{?ARGOS_SCHEDULER_EMAIL\}?/);
    expect(deployCmd).toMatch(/--set-env-vars\s+"[^"]*ARGOS_OIDC_AUDIENCE=\$\{?OIDC_AUDIENCE\}?/);
    expect(deployCmd).toMatch(/COOKIE_SECURE=true/);
    expect(body()).not.toMatch(/ARGOS_OIDC_AUDIENCE=https?:\/\//);
    expect(d.indexOf('value(status.url)')).toBeLessThan(d.indexOf('gcloud run deploy argos'));
  });

  it('inyecta las 6 variables ARGOS_MEDIA_* conservando las existentes en --set-env-vars (H-O-004US4L-1, REQ-GCS-003)', () => {
    const d = job('deploy');
    const deployCmd = d.slice(d.indexOf('gcloud run deploy argos'));
    const m = /--set-env-vars\s+"([^"]*)"/.exec(deployCmd);
    expect(m?.[1]).toContain('COOKIE_SECURE=true');
    const pairs = (m?.[1] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
    const keys = pairs.map((x) => x.split('=')[0]);
    // El flag reemplaza todo el entorno: las existentes deben seguir presentes.
    for (const k of ['COOKIE_SECURE', 'ARGOS_SCHEDULER_EMAIL', 'ARGOS_OIDC_AUDIENCE']) expect(keys).toContain(k);
    expect(pairs).toContain('COOKIE_SECURE=true');
    const media = Object.fromEntries(pairs.filter((x) => x.startsWith('ARGOS_MEDIA_')).map((x) => [x.split('=')[0], x.slice(x.indexOf('=') + 1)]));
    expect(Object.keys(media).sort()).toEqual([
      'ARGOS_MEDIA_BUCKET',
      'ARGOS_MEDIA_DRIVER',
      'ARGOS_MEDIA_MAX_BYTES',
      'ARGOS_MEDIA_MAX_BYTES_PER_OWNER',
      'ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS',
      'ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS',
    ]);
    expect(media['ARGOS_MEDIA_DRIVER']).toBe('gcs');
    expect(media['ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS']).toBe('300');
    expect(media['ARGOS_MEDIA_MAX_BYTES']).toBe('10485760');
    expect(media['ARGOS_MEDIA_MAX_BYTES_PER_OWNER']).toBe('1073741824');
    expect(media['ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS']).toBe('4');
    // Misma convencion que Terraform (buckets_media.tf): <project_prefix>-<project_id>-media.
    expect(media['ARGOS_MEDIA_BUCKET']).toMatch(/^\$\{?ARGOS_MEDIA_BUCKET\}?$/);
    expect(d).toMatch(/ARGOS_MEDIA_BUCKET:\s*argos-\$\{\{\s*vars\.TF_VAR_project_id\s*\}\}-media/);
  });

  it('sondas ratificadas (Neo D4): startup 2/10/1 y liveness 10/3/1 sobre /healthz', () => {
    const d = job('deploy');
    expect(d).toMatch(/--startup-probe "httpGet\.path=\/healthz,[^"]*periodSeconds=2,failureThreshold=10,timeoutSeconds=1"/);
    expect(d).toMatch(/--liveness-probe "httpGet\.path=\/healthz,[^"]*periodSeconds=10,failureThreshold=3,timeoutSeconds=1"/);
  });

  it('humo en /readyz y /, luego mueve el 100 % del tráfico, y retrocede si falla', () => {
    const d = job('deploy');
    const smoke = d.indexOf('/readyz');
    const promote = d.indexOf('update-traffic');
    expect(smoke).toBeGreaterThan(-1);
    expect(promote).toBeGreaterThan(smoke);
    expect(d).toMatch(/--to-revisions[= ]\S*=100/);
    expect(d).toMatch(/if:\s*\$?\{?\{?\s*failure\(\)/);
    expect(d).toMatch(/--remove-tags/);
  });

  it('smoke test sobre TAG_URL espera la propagación GFE (18 reintentos cada 5 s) y se nombra Smoke test', () => {
    const d = job('deploy');
    const step = /^ {6}- name:\s*[^\n]*Smoke test[^\n]*\n(?: {8}[^\n]*\n|\n)*/m.exec(d)?.[0] ?? '';
    expect(step).not.toBe('');
    const curls = step.split('\n').filter((l) => /curl/.test(l) && l.includes('${TAG_URL}'));
    // H-01: rama condicional ORIGIN_VERIFY_ENABLED. Sondeo de estado (sin --fail) + fallback con reintentos.
    expect(curls).toHaveLength(3);
    expect(step).toMatch(/\$\{ORIGIN_VERIFY_ENABLED:-false\}" = "true"/);
    expect(step).toContain('"$STATUS" != "403"');
    const jobName = /^ {4}name:\s*(.+)$/m.exec(d)?.[1] ?? '';
    const stepName = /^ {6}- name:\s*(.*Smoke test.*)$/m.exec(d)?.[1] ?? '';
    expect(jobName).toContain('Smoke test');
    expect(jobName).not.toMatch(/humo/i);
    expect(stepName).not.toMatch(/humo/i);
    for (const url of ['${TAG_URL}/readyz', '${TAG_URL}/']) {
      const curl = curls.find((l) => new RegExp(url.replace(/[$/{}]/g, '\\$&') + '(["\\s]|$)').test(l) && /--fail/.test(l)) ?? '';
      expect(curl, url).not.toBe('');
      expect(curl).toContain('--fail');
      expect(curl).toMatch(/--retry 18(\s|$)/);
      expect(curl).toMatch(/--retry-delay 5(\s|$)/);
      expect(curl).toContain('--retry-all-errors');
    }
  });

  it('D-32: el smoke externo no consulta /healthz (lo intercepta GFE con 404); las probes internas siguen en /healthz', () => {
    const d = job('deploy');
    const step = /^ {6}- name:\s*[^\n]*Smoke test[^\n]*\n(?: {8}[^\n]*\n|\n)*/m.exec(d)?.[0] ?? '';
    expect(step).not.toBe('');
    expect(step).not.toContain('${TAG_URL}/healthz');
    expect(step).not.toMatch(/\/healthz/);
    expect(d).toMatch(/--startup-probe "httpGet\.path=\/healthz,/);
    expect(d).toMatch(/--liveness-probe "httpGet\.path=\/healthz,/);
  });

  it('concurrency por ref sin cancelar el despliegue en curso', () => {
    expect(body()).toMatch(/^concurrency:\s*\n\s+group:\s*deploy-argos-\$\{\{\s*github\.ref\s*\}\}\s*\n\s+cancel-in-progress:\s*false/m);
  });

  it('build-push espera a infraestructura.yml en main antes de autenticar en GCP', () => {
    const bp = job('build-push');
    expect(bp).toMatch(/actions:\s*read/);
    const waitIdx = bp.indexOf('--workflow infraestructura.yml');
    const authIdx = bp.indexOf('google-github-actions/auth');
    expect(waitIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(waitIdx);
  });

  it('no interpola contexto de evento en run: y no enmascara con echo de secretos', () => {
    const y = body();
    const runs = [...y.matchAll(/^\s*run:\s*(\|[^\n]*\n(?:(?: {8,}[^\n]*)?\n)*|[^\n]*)/gm)].map((m) => m[1] ?? '');
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).not.toMatch(/\$\{\{/);
    expect(y).not.toMatch(/github\.event\.(head_commit|pull_request|issue|comment)/);
    expect(y).not.toMatch(/github\.head_ref/);
  });

  it('REQ-CICD-008: sin git push, candados, upload-artifact, NEON_API_KEY ni emojis', () => {
    const y = body();
    expect(y).not.toMatch(/git push/);
    expect(y).not.toMatch(/index\.lock/);
    expect(y).not.toMatch(/upload-artifact/);
    expect(y).not.toMatch(/NEON_API_KEY|NEON_PROJECT_ID/);
    expect(y).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enmascara los valores derivados con ::add-mask::', () => {
    expect(body()).toMatch(/::add-mask::/);
  });
  describe('D-29 res. 4 (T488): coordinación con infraestructura.yml', () => {
    const FRASE = 're-ejecute deploy-argos.yml tras aprobar y terminar el apply';
    const sondeo = (): string => job('build-push').split(/^ {6}- name: Checkout de código/m)[0] ?? '';
    const infra = (): string => readFileSync(join(process.cwd(), '.github', 'workflows', 'infraestructura.yml'), 'utf8').replace(/^\s*#.*$/gm, '');
    const concurrencyOf = (y: string): { group: string; cancel: string } => ({
      group: /^concurrency:\s*\n\s+group:\s*(\S+)/m.exec(y)?.[1] ?? '',
      cancel: /^concurrency:\s*\n\s+group:[^\n]*\n\s+cancel-in-progress:\s*(\S+)/m.exec(y)?.[1] ?? '',
    });

    it('(a) el sondeo de build-push sigue con 120 iteraciones de 15 s', () => {
      const s = sondeo();
      expect(s).toMatch(/for _ in \$\(seq 1 120\); do/);
      expect(s).toMatch(/^\s+sleep 15$/m);
      expect(s).toContain('--workflow infraestructura.yml');
    });

    it('(b) el sondeo falla cerrado si la infraestructura del SHA no termina en success', () => {
      const s = sondeo();
      expect(s).toMatch(/\[ -n "\$SAME_SHA_CONCLUSION" \] && \[ "\$SAME_SHA_CONCLUSION" != "success" \]/);
      const bloque = /SAME_SHA_CONCLUSION" != "success" \]; then([\s\S]*?)\n\s+fi/.exec(s)?.[1] ?? '';
      expect(bloque).toMatch(/exit 1/);
      expect(s).toMatch(/\[ "\$ACTIVE" != "0" \]; then[\s\S]*?exit 1/);
    });

    it('(c) el mensaje de fallo del sondeo indica re-ejecutar deploy-argos.yml tras aprobar y terminar el apply', () => {
      const bloques = [...sondeo().matchAll(/echo "([^"\n]*)"\n\s+exit 1/g)].map((m) => m[1] ?? '');
      expect(bloques).toHaveLength(2);
      for (const b of bloques) expect(b).toContain(FRASE);
    });

    it('(d) concurrency distinto en deploy-argos.yml e infraestructura.yml, ambos con cancel-in-progress false', () => {
      const d = concurrencyOf(body());
      const i = concurrencyOf(infra());
      expect(d.group).toMatch(/^deploy-argos-/);
      expect(i.group).toMatch(/^infraestructura-/);
      expect(d.group).not.toBe(i.group);
      expect(d.cancel).toBe('false');
      expect(i.cancel).toBe('false');
    });
  });
});

/**
 * Regresión INV-ESC6-018 (Neo, Nivel 2): ARGOS_SCENE_WORKER_URL es el worker interno de Cloud Tasks y debe apuntar
 * al Cloud Run nativo (OIDC_AUDIENCE, status.url), nunca a ARGOS_PUBLIC_BASE_URL (tipi.pet), que solo sirve a enlaces públicos.
 */
describe('deploy-argos.yml: ARGOS_SCENE_WORKER_URL usa el Cloud Run nativo, no la URL pública (INV-ESC6-018)', () => {
  const cmd = (): string => body().slice(body().indexOf('gcloud run deploy argos'));
  const envFlag = (): string => /--set-env-vars\s+"([^"]*)"/.exec(cmd())?.[1] ?? '';
  const pairOf = (key: string): string => envFlag().split(',').map((x) => x.trim()).find((x) => x.startsWith(`${key}=`)) ?? '';

  it('ARGOS_SCENE_WORKER_URL es exactamente ${OIDC_AUDIENCE}/internal/scene-worker', () => {
    expect(pairOf('ARGOS_SCENE_WORKER_URL')).toBe('ARGOS_SCENE_WORKER_URL=${OIDC_AUDIENCE}/internal/scene-worker');
  });

  it('ARGOS_SCENE_WORKER_URL nunca deriva de PUBLIC_BASE_URL', () => {
    expect(pairOf('ARGOS_SCENE_WORKER_URL')).not.toMatch(/PUBLIC_BASE_URL/);
    expect(body()).not.toMatch(/ARGOS_SCENE_WORKER_URL=\$\{?PUBLIC_BASE_URL/);
  });

  it('OIDC_AUDIENCE se obtiene del status.url del servicio Cloud Run desplegado', () => {
    expect(body()).toMatch(/^\s*OIDC_AUDIENCE="\$\(gcloud run services describe .*--format='value\(status\.url\)'\)"\s*$/m);
  });

  it('ARGOS_PUBLIC_BASE_URL sigue derivando de PUBLIC_BASE_URL (solo enlaces públicos)', () => {
    expect(pairOf('ARGOS_PUBLIC_BASE_URL')).toBe('ARGOS_PUBLIC_BASE_URL=${PUBLIC_BASE_URL}');
  });
});

// Feature 012, Bloque D (PHONE_HMAC_KEY, T-05; anexo §9): la clave de la ficha QR llega a Cloud Run por --set-secrets con versión numérica.
describe('deploy-argos.yml: PHONE_HMAC_KEY de la ficha QR por --set-secrets (Feature 012, Bloque D)', () => {
  const resolver = (): string => job('deploy');

  it('resuelve la versión de argos-phone-hmac-key con el mismo criterio opcional que Gemini (nunca latest)', () => {
    const d = resolver();
    expect(d).toMatch(/PHONE_HMAC_KEY_VERSION="\$\(optional_latest_version argos-phone-hmac-key\)"/);
    expect(d).toMatch(/PHONE_SECRET_FLAG=",PHONE_HMAC_KEY=argos-phone-hmac-key:\$\{PHONE_HMAC_KEY_VERSION\}"/);
    expect(body()).not.toMatch(/argos-phone-hmac-key:latest/);
  });

  it('valida que la versión sea numérica antes de usarla y la enmascara en los registros', () => {
    const d = resolver();
    expect(d).toMatch(/printf '%s' "\$PHONE_HMAC_KEY_VERSION" \| grep -Eq '\^\[0-9\]\+\$'/);
    expect(d).toMatch(/::add-mask::\$\{PHONE_HMAC_KEY_VERSION\}/);
  });

  it('inyecta PHONE_HMAC_KEY en --set-secrets y nunca en --set-env-vars ni como valor literal', () => {
    const d = resolver();
    const deployCmd = d.slice(d.indexOf('gcloud run deploy argos'));
    const secrets = /--set-secrets\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '';
    expect(secrets).toContain('${PHONE_SECRET_FLAG}');
    const envs = /--set-env-vars\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '';
    expect(envs).not.toMatch(/PHONE_HMAC_KEY/);
  });

  it('la variable PHONE_SECRET_FLAG viaja al paso de despliegue por GITHUB_ENV', () => {
    expect(body()).toMatch(/echo "PHONE_SECRET_FLAG=\$\{PHONE_SECRET_FLAG\}"/);
  });

  it('ARGOS_PUBLIC_BASE_URL (obligatoria en producción, T1443) sigue inyectada en --set-env-vars', () => {
    const deployCmd = job('deploy').slice(job('deploy').indexOf('gcloud run deploy argos'));
    expect(/--set-env-vars\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '').toMatch(/ARGOS_PUBLIC_BASE_URL=\$\{PUBLIC_BASE_URL\}/);
  });
});

// Feature 012, Bloque E (ENM-005-E, annex share-link-subset §8.2): cutover único autorizado por Neo (pre-lanzamiento). La creación PETS se enciende en este despliegue.
describe('deploy-argos.yml: ARGOS_SHARE_PETS_CREATE_ENABLED en cutover único (Feature 012, Bloque E)', () => {
  const deployCmd = (): string => job('deploy').slice(job('deploy').indexOf('gcloud run deploy argos'));
  const envPairs = (): string[] => (/--set-env-vars\s+"([^"]*)"/.exec(deployCmd())?.[1] ?? '').split(',').map((x) => x.trim());

  it('fija ARGOS_SHARE_PETS_CREATE_ENABLED=true en --set-env-vars (cutover único, Neo)', () => {
    expect(envPairs()).toContain('ARGOS_SHARE_PETS_CREATE_ENABLED=true');
  });

  it('declara la bandera una sola vez, con literal true y sin interpolación de secretos ni variables', () => {
    expect(body()).not.toMatch(/ARGOS_SHARE_PETS_CREATE_ENABLED=false/);
    expect(body()).not.toMatch(/ARGOS_SHARE_PETS_CREATE_ENABLED=\$\{\{/);
    expect(envPairs().filter((x) => x.startsWith('ARGOS_SHARE_PETS_CREATE_ENABLED='))).toHaveLength(1);
  });
});
