import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T560 (SC-ALM-001, SC-ALM-002, REQ-GCS-001, REQ-GCS-002, INV-GCS-001): pruebas estáticas por lectura (Terraform no se
 * ejecuta aquí) del bucket de medios y de su IAM. La implementación (`buckets_media.tf` e `iam.tf`) es de T561/T562 (/link).
 */
const DIR = join(process.cwd(), 'terraform');
const strip = (text: string): string => text.replace(/^\s*(#|\/\/).*$/gm, '');
const read = (file: string): string => (existsSync(join(DIR, file)) ? strip(readFileSync(join(DIR, file), 'utf8')) : '');
const allTf = (): string => readdirSync(DIR).filter((f) => f.endsWith('.tf')).map(read).join('\n');
type Block = { type: string; name: string; body: string };
const blocksOf = (text: string): Block[] =>
  [...text.matchAll(/resource\s+"([a-z0-9_]+)"\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)].map((m) => ({ type: m[1] ?? '', name: m[2] ?? '', body: m[3] ?? '' }));
const media = (): string => blocksOf(read('buckets_media.tf')).find((b) => b.type === 'google_storage_bucket' && b.name === 'media')?.body ?? '';
const iam = (): Block[] => blocksOf(read('iam.tf'));

describe('terraform: bucket de medios (T560, SC-ALM-001, INV-GCS-001)', () => {
  it('buckets_media.tf existe y define el bucket media', () => {
    expect(existsSync(join(DIR, 'buckets_media.tf'))).toBe(true);
    expect(media()).not.toBe('');
  });

  it('hay exactamente dos buckets distintos: exports y media, con nombres diferentes', () => {
    const buckets = blocksOf(allTf()).filter((b) => b.type === 'google_storage_bucket');
    expect(buckets.map((b) => b.name).sort()).toEqual(['exports', 'media']);
    const names = buckets.map((b) => b.body.match(/^ {2}name\s*=\s*(.+)$/m)?.[1]?.trim());
    expect(names.sort()).toEqual(['"${var.project_prefix}-${var.project_id}-exports"', '"${var.project_prefix}-${var.project_id}-media"']);
  });

  it('media: STANDARD en us-central1, acceso uniforme y prevención de acceso público', () => {
    expect(media()).toMatch(/project\s*=\s*var\.project_id\b/);
    expect(media()).toMatch(/location\s*=\s*"us-central1"/);
    expect(media()).toMatch(/storage_class\s*=\s*"STANDARD"/);
    expect(media()).toMatch(/uniform_bucket_level_access\s*=\s*true/);
    expect(media()).toMatch(/public_access_prevention\s*=\s*"enforced"/);
  });

  it('media: soft_delete_policy en 0 s, sin versionado y sin regla de ciclo de vida', () => {
    expect(media()).toMatch(/soft_delete_policy\s*\{[^}]*retention_duration_seconds\s*=\s*0\b[^}]*\}/);
    expect(media()).not.toMatch(/versioning\s*\{[^}]*enabled\s*=\s*true/);
    expect(media()).not.toMatch(/lifecycle_rule\s*\{/);
  });

  it('media: prevent_destroy = true, sin force_destroy y con las etiquetas de T484', () => {
    expect(media()).toMatch(/prevent_destroy\s*=\s*true/);
    expect(media()).not.toMatch(/force_destroy\s*=\s*true/);
    const raw = media().match(/^ {2}labels\s*=\s*\{([^]*?)\n {2}\}/m)?.[1] ?? '';
    const map = Object.fromEntries([...raw.matchAll(/^\s*([a-z-]+)\s*=\s*"([^"]*)"\s*$/gm)].map((m) => [m[1], m[2]]));
    expect(map).toEqual({ app: 'argos', 'managed-by': 'terraform' });
  });

  it('el bucket exports no cambia: sigue con su ciclo de 14 días sobre dumps/ y sin referencias al bucket de medios', () => {
    const exportsBody = blocksOf(read('buckets.tf')).find((b) => b.name === 'exports')?.body ?? '';
    expect(exportsBody).toMatch(/age\s*=\s*14\b/);
    expect(exportsBody).toMatch(/matches_prefix\s*=\s*\["dumps\/"\]/);
    expect(exportsBody).toMatch(/retention_duration_seconds\s*=\s*0\b/);
    expect(read('buckets.tf')).not.toMatch(/media/);
  });

  it('no se activan los registros de acceso a datos del bucket de medios (REQ-GCS-001)', () => {
    const c = allTf();
    expect(c).not.toMatch(/google_project_iam_audit_config|google_(folder|organization)_iam_audit_config|audit_log_config|DATA_READ|DATA_WRITE/);
    expect(read('buckets_media.tf')).not.toMatch(/logging\s*\{/);
  });
});

describe('terraform: IAM mínimo de medios (T560, SC-ALM-002, REQ-GCS-002)', () => {
  const forRun = (): Block[] => iam().filter((b) => /_iam_(member|binding)$/.test(b.type) && /member\s*=\s*"serviceAccount:\$\{google_service_account\.run\.email\}"/.test(b.body));

  it('argos-run tiene roles/storage.objectUser solo sobre el bucket de medios', () => {
    const storage = forRun().filter((b) => /role\s*=\s*"roles\/storage\./.test(b.body));
    expect(storage.length).toBe(1);
    expect(storage[0]?.type).toBe('google_storage_bucket_iam_member');
    expect(storage[0]?.body).toMatch(/role\s*=\s*"roles\/storage\.objectUser"/);
    expect(storage[0]?.body).toMatch(/bucket\s*=\s*google_storage_bucket\.media\.name\b/);
  });

  it('argos-run tiene serviceAccountTokenCreator solo sobre sí misma', () => {
    const creator = iam().filter((b) => /role\s*=\s*"roles\/iam\.serviceAccountTokenCreator"/.test(b.body));
    expect(creator.length).toBe(1);
    expect(creator[0]?.type).toBe('google_service_account_iam_member');
    expect(creator[0]?.body).toMatch(/service_account_id\s*=\s*google_service_account\.run\.name\b/);
    expect(creator[0]?.body).toMatch(/member\s*=\s*"serviceAccount:\$\{google_service_account\.run\.email\}"/);
  });

  it('ningún binding de bucket alcanza exports ni usa allUsers; no hay otros permisos de almacenamiento', () => {
    const bucketIam = iam().filter((b) => b.type.startsWith('google_storage_bucket_iam'));
    expect(bucketIam.length).toBe(1);
    for (const b of bucketIam) expect(b.body).not.toMatch(/exports|allUsers|allAuthenticatedUsers/);
    expect(allTf()).not.toMatch(/google_storage_bucket_iam_(binding|policy)|google_storage_bucket_acl|google_storage_default_object_acl/);
    const roles = iam().flatMap((b) => [...b.body.matchAll(/role\s*=\s*"([^"]+)"/g)].map((m) => m[1] ?? ''));
    expect(roles.filter((r) => r.startsWith('roles/storage.'))).toEqual(['roles/storage.objectUser']);
  });

  it('cero llaves de cuenta de servicio y cero roles owner/editor en todo terraform/', () => {
    expect(allTf()).not.toMatch(/google_service_account_key/);
    expect(allTf()).not.toMatch(/roles\/(owner|editor)\b/);
    const files = readdirSync(DIR).filter((f) => f.endsWith('.tf'));
    expect(files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n')).not.toMatch(/google_service_account_key/);
  });
});
