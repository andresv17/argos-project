import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HmacAuditPseudonymAdapter } from '../../src/infrastructure/adapters/hmac-audit-pseudonym.adapter.ts';

/**
 * T454 (REQ-IAC-008, REQ-PG-016, NFR-CLD-014, NFR-CLD-015, SC-CLD-008): runbook de respaldo por pipe a gs:// y de
 * restauración. Vive en terraform/README.md (completo) y en quickstart.md §4.2 (paso). Pruebas estáticas sobre el
 * texto; el fragmento de Node del paso 3 se ejecuta contra el adaptador HMAC real.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const README = 'terraform/README.md';
const QUICK = 'specs/003-cloud-gcp/quickstart.md';

/** Sección `## Respaldo y restauración` del README hasta el siguiente `## `. */
const seccion = (): string => {
  const t = read(README);
  const i = t.indexOf('## Respaldo y restauración');
  expect(i).toBeGreaterThanOrEqual(0);
  const rest = t.slice(i + 3);
  const j = rest.indexOf('\n## ');
  return j < 0 ? rest : rest.slice(0, j);
};
const bloques = (texto: string, lang: string): string[] => [...texto.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1] as string);

describe('respaldo: pg_dump por pipe a gs:// (REQ-IAC-008, NFR-CLD-014)', () => {
  it('[REQ-IAC-008] existe la sección y el comando es un pipe sin archivo local', () => {
    const s = seccion();
    // H-A1 (relajacion autorizada por Neo): el objeto se calcula una sola vez en OBJ y el cp lo usa.
    expect(s).toMatch(/OBJ="gs:\/\/\$\{BUCKET\}\/dumps\/\$\(date -u \+%Y-%m-%d\)\.sql"/);
    expect(s).toMatch(/pg_dump "\$DATABASE_URL_DIRECT" \| gcloud storage cp - "\$OBJ"/);
    for (const b of bloques(s, 'bash').filter((x) => x.includes('pg_dump'))) {
      expect(b).not.toMatch(/pg_dump[^\n|]*(>|--file|-f )/);
      expect(b).not.toMatch(/gsutil/);
    }
  });

  it('[NFR-CLD-014] nombre sin datos personales, sin cifrado propio, vida de 14 días, soft delete 0 s, semanal estricta, lectura solo Neo', () => {
    const s = seccion();
    expect(s).toMatch(/sin datos personales/i);
    expect(s).toMatch(/sin cifrado propio/i);
    expect(s).toContain('14 días');
    expect(s).toMatch(/soft delete[^\n]*0 s/i);
    expect(s).toMatch(/semanal estricta/i);
    expect(s).toContain('RPO <= 7 d');
    expect(s).toMatch(/al menos 2 copias/);
    expect(s).toMatch(/solo Neo/i);
    expect(s).toContain('gcloud storage buckets get-iam-policy');
    expect(s).toContain('gcloud storage ls');
  });

  it('[REQ-IAC-008] el bucket se nombra como en buckets.tf', () => {
    expect(read('terraform/buckets.tf')).toContain('"${var.project_prefix}-${var.project_id}-exports"');
    expect(seccion()).toContain('BUCKET="argos-${TF_VAR_project_id}-exports"');
  });
});

describe('restauración: pasos 1-6 de REQ-PG-016 en orden', () => {
  const MARCAS = [
    /Paso 1[\s\S]*ACCOUNT_DELETE/,
    /Paso 2[\s\S]*gcloud storage cat[\s\S]*psql/,
    /Paso 3[\s\S]*HMAC[\s\S]*user\.id/,
    /Paso 4[\s\S]*revoca[\s\S]*sesiones/i,
    /Paso 5[\s\S]*rama de respaldo[\s\S]*Neon/,
    /Paso 6[\s\S]*RPO[\s\S]*RTO/,
  ];
  it('[REQ-PG-016] los seis pasos aparecen y en orden creciente', () => {
    const s = seccion();
    const pos = [1, 2, 3, 4, 5, 6].map((n) => s.indexOf(`Paso ${n}`));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    MARCAS.forEach((re) => expect(s).toMatch(re));
  });

  it('[REQ-PG-016] exige el mismo secreto HMAC y aclara que rotarlo rompe el paso 3', () => {
    expect(seccion()).toMatch(/mismo secreto/i);
    expect(seccion()).toMatch(/rotarlo rompe el paso 3/);
  });

  it('[REQ-PG-016] la restauración aborta ante el primer error y es transaccional', () => {
    const s = seccion();
    expect(s).toContain('ON_ERROR_STOP=1');
    expect(s).toContain('--single-transaction');
  });

  it('[REQ-PG-016] los pasos 1 y 4 usan columnas que existen en el esquema Postgres', () => {
    const sql = read('src/infrastructure/persistence/postgres/migrations/0001_baseline.sql');
    const s = seccion();
    expect(s).toContain("mutation_type = 'ACCOUNT_DELETE'");
    expect(sql).toMatch(/CREATE TABLE audit_log[\s\S]*entity_id TEXT NOT NULL/);
    expect(s).toMatch(/UPDATE sessions\s+SET revoked_at/);
    expect(sql).toMatch(/CREATE TABLE sessions[\s\S]*revoked_at TEXT/);
  });

  it('[REQ-PG-016] el paso 3 elimina lo mismo que cuenta countReferences (B9/B10) y no deja filas', () => {
    const s = seccion();
    for (const tabla of ['pets', 'households', 'household_members', 'sessions', 'login_attempts', 'users']) {
      expect(s).toMatch(new RegExp(`DELETE FROM ${tabla}\\b`));
    }
    expect(s).toContain('household_invitations');
    expect(s).toContain('ON DELETE CASCADE');
    expect(s).toMatch(/referencias_restantes/);
  });

  it('[REQ-PG-016] el fragmento de Node del paso 3 produce el mismo HMAC que el adaptador de producción', () => {
    const js = /node -e '([\s\S]*?)' account_delete_ids\.txt/.exec(seccion())?.[1];
    expect(typeof js).toBe('string');
    const key = 'a1'.repeat(32);
    const ids = ['usuario-1', 'usuario-2', 'usuario-3'];
    const hmac = new HmacAuditPseudonymAdapter().hmacUserId('usuario-2', key);
    const dir = join(process.env['TMPDIR'] ?? '/tmp');
    const file = join(dir, `t454-ids-${process.pid}.txt`);
    writeFileSync(file, `${hmac}\n`);
    const r = spawnSync(process.execPath, ['-e', js ?? '', file], { input: ids.join('\n') + '\n', encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', ARGOS_AUDIT_HMAC_SECRET: key } });
    rmSync(file, { force: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('usuario-2\n');
  });
});

describe('solo flags verificados (sin inventar)', () => {
  // Verificados el 2026-11-16: `docker run postgres:17 pg_dump --help` / `psql --help`, `gcloud storage cp --help` (fuente `-`).
  const PERMITIDOS = new Set(['-X', '-A', '-t', '-At', '-c', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-d']);
  it('[REQ-PG-016] los flags de psql y pg_dump del runbook están en la lista verificada', () => {
    const lineas = bloques(seccion(), 'bash').join('\n').split('\n').filter((l) => /\b(psql|pg_dump)\b/.test(l) && !l.trim().startsWith('#'));
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) {
      const sinComillas = l.replace(/\| node -e .*$/, '').replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
      for (const f of sinComillas.match(/(?<=\s)-{1,2}[A-Za-z][\w-]*(?:=\S+)?/g) ?? []) expect(PERMITIDOS.has(f), `flag no verificado: ${f}`).toBe(true);
    }
  });

  it('[REQ-PG-016] el borrado de la rama de Neon es manual en consola y no inventa comandos de neonctl', () => {
    const s = seccion();
    expect(s).not.toMatch(/neonctl|NEON_API_KEY/);
    expect(s).toMatch(/consola de Neon/);
  });
});

describe('quickstart.md §4.2 (T454)', () => {
  it('[REQ-IAC-008] tiene el paso de respaldo semanal y remite al runbook sin duplicar la restauración', () => {
    const t = read(QUICK);
    const i = t.indexOf('## 4.2');
    expect(i).toBeGreaterThanOrEqual(0);
    const sec = t.slice(i, t.indexOf('\n## 5.', i));
    expect(sec).toContain('pg_dump');
    expect(sec).toContain('gcloud storage cp -');
    expect(sec).toContain('terraform/README.md');
    expect(sec).toMatch(/semanal/i);
    expect(sec).toContain('REQ-PG-016');
  });
});

describe('límite residual aceptado de T441a (H-ORA-T441a-2, H-ORA-T441a-3)', () => {
  it('[REQ-IAC-008] documenta que apply conserva roles de administración de proyecto como límite aceptado por Neo', () => {
    const s = seccion();
    for (const rol of ['projectIamAdmin', 'serviceAccountAdmin', 'serviceAccountUser']) expect(s).toContain(rol);
    expect(s).toContain('H-ORA-T441a-2');
    expect(s).toMatch(/límite (residual )?aceptado/i);
    expect(s).toMatch(/Neo/);
    expect(s).toContain('opción (a)');
    expect(s).toContain('2026-11-16');
  });

  it('[REQ-IAC-008] documenta que get-iam-policy del bucket no muestra herencia de proyecto y exige projects get-iam-policy filtrando CI', () => {
    const s = seccion();
    expect(s).toContain('H-ORA-T441a-3');
    expect(s).toMatch(/no muestra[^.]*heredad/i);
    expect(s).toContain('gcloud projects get-iam-policy');
    expect(s).toMatch(/--filter=[^\n]*serviceAccount/);
  });
});

describe('006: la foto del hogar y las escenas quedan fuera del respaldo y del dump de objetos (REQ-ESC6-022, REQ-ESC6-018, REQ-ESC6-029; SC-ESC6-051, SC-ESC6-088)', () => {
  /** Subsección `### Fuera del respaldo exportable (feature 006)` hasta el siguiente encabezado. */
  const fuera = (): string => {
    const s = seccion();
    const i = s.indexOf('### Fuera del respaldo exportable (feature 006)');
    expect(i, 'falta la subsección de la 006').toBeGreaterThanOrEqual(0);
    const rest = s.slice(i + 4);
    const j = rest.search(/\n#{2,3} /);
    return j < 0 ? rest : rest.slice(0, j);
  };

  it('[REQ-ESC6-022] declara que la foto del hogar y las escenas no viajan en el sobre 3.x y que importar no restaura la escena', () => {
    const t = fuera();
    expect(t).toMatch(/foto del hogar y las escenas no viajan en el sobre de respaldo `3\.x`/);
    expect(t).toMatch(/importar un respaldo no restaura la escena/i);
    expect(t).toMatch(/`idle` u `outdated`, sin imagen/);
  });

  it('[REQ-ESC6-018] la foto del hogar cuenta en la cuota de 1 GiB del propietario y las escenas no', () => {
    const t = fuera();
    expect(t).toMatch(/cuota de 1 GiB del propietario del hogar/);
    expect(t).toMatch(/las escenas no cuentan/);
  });

  it('[REQ-ESC6-029] el dump semanal guarda filas, no objetos: tras restaurar, la conciliacion diaria encola los objetos huerfanos de scenes/ y households/', () => {
    const t = fuera();
    expect(t).toMatch(/pg_dump[^\n]*no incluye los objetos/);
    expect(t).toContain('`scenes/`');
    expect(t).toContain('`households/`');
    expect(t).toMatch(/15 min/);
    expect(t).toMatch(/\/internal\/maintenance/);
  });

  it('[RR-06-07] declara la ventana residual de PITR y volcados, y las columnas sin clave foranea que el paso 3 no elimina (decision pendiente)', () => {
    const t = fuera();
    expect(t).toMatch(/PITR/);
    for (const columna of ['scene_attempts.actor_user_id', 'scene_image_sources.owner_user_id', 'household_photos.uploaded_by_user_id']) expect(t).toContain(columna);
    expect(t).toMatch(/queda para decisi[oó]n/);
  });

  it('[REQ-ESC6-022] las tablas de la escena que el paso 3 elimina por cascada existen en el esquema Postgres con ON DELETE CASCADE', () => {
    const sql = read('src/infrastructure/persistence/postgres/migrations/0009_home_scenes.sql');
    for (const tabla of ['home_scenes', 'scene_attempts', 'scene_image_sources', 'household_photos', 'scene_consents', 'scene_quota_carry']) expect(sql).toMatch(new RegExp(`CREATE TABLE ${tabla} \\(`));
    expect(sql.match(/ON DELETE CASCADE/g)?.length).toBeGreaterThanOrEqual(7);
    expect(fuera()).toMatch(/ON DELETE CASCADE/);
  });
});

describe('006: el paso 3 limpia las 3 columnas sin FK de la escena para las cuentas olvidadas (H-KEY-F4-1, REQ-PG-016, REQ-ESC6-018)', () => {
  const sqlPaso3 = (): string => bloques(seccion(), 'bash').find((b) => b.includes('CREATE TEMP TABLE olvidados')) as string;
  const COLUMNAS: Array<[string, string]> = [
    ['scene_attempts', 'actor_user_id'],
    ['scene_image_sources', 'owner_user_id'],
    ['household_photos', 'uploaded_by_user_id'],
  ];

  it('[H-KEY-F4-1] el SQL del paso 3 borra las filas de las 3 columnas sin FK por cuenta olvidada', () => {
    const b = sqlPaso3();
    for (const [tabla, col] of COLUMNAS) expect(b).toMatch(new RegExp(`DELETE FROM ${tabla}\\b[^;]*${col} IN \\(SELECT id FROM olvidados\\)`));
  });

  it('[H-KEY-F4-1] esos DELETE van antes de DELETE FROM users', () => {
    const b = sqlPaso3();
    const users = b.indexOf('DELETE FROM users WHERE id IN');
    expect(users).toBeGreaterThan(0);
    for (const [tabla] of COLUMNAS) {
      const i = b.search(new RegExp(`DELETE FROM ${tabla}\\b`));
      expect(i, `falta DELETE FROM ${tabla}`).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(users);
    }
  });

  it('[H-KEY-F4-1] encola en media_deletion_queue (reason DELETE) los objetos de escena y de foto del hogar antes de borrar sus filas', () => {
    const b = sqlPaso3();
    const cola = [...b.matchAll(/INSERT INTO media_deletion_queue[^;]*;/g)].map((m) => m[0]);
    expect(cola.length).toBeGreaterThanOrEqual(2);
    expect(cola.join('\n')).toMatch(/'scenes\/'/);
    expect(cola.join('\n')).toMatch(/'households\/'/);
    expect(cola.join('\n')).toContain("'DELETE'");
    expect(cola.join('\n')).toMatch(/ON CONFLICT \(object_key\) DO NOTHING/);
    const iAtt = b.search(/DELETE FROM scene_attempts\b/);
    const iFoto = b.search(/DELETE FROM household_photos\b/);
    expect(b.indexOf("'scenes/'")).toBeLessThan(iAtt);
    expect(b.indexOf("'households/'")).toBeLessThan(iFoto);
  });

  it('[H-KEY-F4-1] referencias_restantes cuenta las 3 columnas para que cero referencias sea verdadero', () => {
    const b = sqlPaso3();
    const q = b.slice(b.indexOf('SELECT (SELECT count(*)'));
    expect(q).toContain('referencias_restantes');
    for (const [tabla, col] of COLUMNAS) expect(q).toMatch(new RegExp(`count\\(\\*\\) FROM ${tabla} WHERE ${col} IN \\(SELECT id FROM olvidados\\)`));
  });

  it('[H-KEY-F4-1] el texto ya no dice que el paso 3 no elimina esas columnas', () => {
    const s = seccion();
    expect(s).not.toMatch(/el paso 3 no las elimina/);
    expect(s).toMatch(/H-KEY-F4-1[^\n]*(corregid|limpia)/i);
  });
});
