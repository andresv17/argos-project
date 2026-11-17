import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T473 (REQ-PG-015, REQ-PG-011, SC-CLD-019): vacuum-argos.yml.
 * Pruebas estáticas por lectura del texto del flujo (misma técnica que code-quality-workflow.spec.ts).
 * La prueba de integración con centinela (pg_relation_size/pageinspect) requiere Postgres real y no se cubre aquí.
 */
const path = join(process.cwd(), '.github', 'workflows', 'vacuum-argos.yml');
const load = (): string => readFileSync(path, 'utf8');
const body = (): string => load().replace(/^\s*#.*$/gm, '');
/** T473b: el SQL de la secuencia vive en scripts/vacuum-argos.sql, compartido con la prueba de centinela. */
const sqlPath = join(process.cwd(), 'scripts', 'vacuum-argos.sql');
const sharedSql = (): string => readFileSync(sqlPath, 'utf8').replace(/^\s*--(?!\s+@sql).*$/gm, '');

const SECRETS_TOKEN = /(?<![\w.-])secrets(?![\w-])/i;
/** Líneas de `secrets.X` que NO están dentro de un bloque `env:` de paso (indentación >= 10). */
const secretsOutsideStepEnv = (y: string): string[] =>
  y.split('\n').filter((l) => SECRETS_TOKEN.test(l) && l.includes('${{') && l.search(/\S/) < 10);

const runBlocks = (): string => {
  const lines = body().split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i] ?? '');
    if (m === null) continue;
    const indent = (m[1] ?? '').length;
    out.push(m[2] ?? '');
    if (/^[|>][-+]?$/.test((m[2] ?? '').trim())) {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j] ?? '';
        if (l.trim() !== '' && l.search(/\S/) <= indent) break;
        out.push(l);
      }
    }
  }
  return out.join('\n');
};

describe('.github/workflows/vacuum-argos.yml (T473)', () => {
  it('el archivo existe', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('dispara con cron semanal y workflow_dispatch', () => {
    const y = body();
    expect(y).toMatch(/^ {2}schedule:\s*\n\s+- cron:\s*'[^']+'/m);
    const cron = /cron:\s*'([^']+)'/.exec(y)?.[1] ?? '';
    const f = cron.split(/\s+/);
    expect(f).toHaveLength(5);
    expect(f[2]).toBe('*');
    expect(f[3]).toBe('*');
    expect(f[4]).toMatch(/^[0-6]$/); // un solo día de la semana: semanal
    expect(y).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('no se dispara en push ni pull_request', () => {
    const y = body();
    expect(y).not.toMatch(/^ {2}push:/m);
    expect(y).not.toMatch(/^ {2}pull_request/m);
  });

  it('el disparo manual ofrece la entrada de modo y el cron usa VACUUM (ANALYZE)', () => {
    const y = body();
    expect(y).toMatch(/inputs:\s*\n\s+modo:/);
    expect(y).toMatch(/full/);
    const r = runBlocks() + sharedSql();
    expect(r).toMatch(/VACUUM \(ANALYZE\)/);
    expect(r).toMatch(/VACUUM \(FULL, ANALYZE\)/);
    expect(y).toMatch(/github\.event_name/);
  });

  it('FULL usa lock_timeout=3s y hasta 3 reintentos; statement_timeout propio', () => {
    const y = body();
    expect(y).toMatch(/lock_timeout=3s/);
    expect(y).toMatch(/statement_timeout=/);
    const r = runBlocks();
    expect(r).toMatch(/\b3\b[^\n]*(intento|retry|attempt)|(intento|retry|attempt)[^\n]*\b3\b/i);
  });

  it('ejecuta con el rol propietario por DATABASE_URL_DIRECT, sin la URL de la aplicación', () => {
    const y = body();
    expect(y).toMatch(/DATABASE_URL_DIRECT:\s*\$\{\{\s*secrets\.DATABASE_URL_DIRECT\s*\}\}/);
    expect(y).not.toMatch(/secrets\.DATABASE_URL(?!_DIRECT)/);
    expect(y).not.toMatch(/argos_app/);
    expect(y).toMatch(/add-mask/);
  });

  it('secrets.* solo dentro de env de un paso', () => {
    expect(secretsOutsideStepEnv(body())).toEqual([]);
  });

  it('no interpola ${{ }} dentro de run:', () => {
    expect(runBlocks()).not.toMatch(/\$\{\{/);
  });

  it('cada VACUUM va como sentencia aparte (psql -c) por tabla, sin transacción', () => {
    const r = runBlocks();
    expect(r).toMatch(/psql[^\n]*-c\s+"\$\{SENTENCIA\} /);
    expect(r).not.toMatch(/\bBEGIN\b/i);
    expect(r).toMatch(/ON_ERROR_STOP=1/);
    expect(r).toMatch(/for\s+\w+\s+in|while\s+read/);
  });

  it('falla ante "skipping … only table owner" (PG <= 15) y "permission denied to vacuum" (PG >= 16, Neon 17)', () => {
    expect(runBlocks()).toMatch(/only table owner/);
    expect(runBlocks()).toMatch(/permission denied to vacuum/);
  });

  it('T473b: toma el SQL de scripts/vacuum-argos.sql (compartido con la prueba de centinela), sin duplicarlo en el flujo', () => {
    expect(existsSync(sqlPath)).toBe(true);
    const r = runBlocks();
    expect(r).toMatch(/scripts\/vacuum-argos\.sql/);
    for (const seccion of ['vacuum_simple', 'vacuum_full', 'listar_tablas', 'estado', 'vencidas']) {
      expect(r).toContain(`sql_seccion ${seccion}`);
      expect(readFileSync(sqlPath, 'utf8')).toMatch(new RegExp(`^-- @sql ${seccion}\\s*$`, 'm'));
    }
    expect(r).not.toMatch(/SELECT\s/i);
    expect(r).not.toMatch(/VACUUM \(/);
  });

  it('H-K-T473-5 opción A: solo el modo manual full ejecuta VACUUM (ANALYZE) tras el FULL por tabla (SQL compartido)', () => {
    expect(sharedSql()).toMatch(/^-- @sql vacuum_tras_full\s*\nVACUUM \(ANALYZE\)\s*$/m);
    const r = runBlocks();
    expect(r).toContain('sql_seccion vacuum_tras_full');
    // La sentencia posterior solo se asigna dentro de la rama full; en la rama del cron queda vacía.
    const full = /if \[ "\$\{EVENTO\}" = "workflow_dispatch" \][^\n]*\n([\s\S]*?)\n\s*else\n([\s\S]*?)\n\s*fi/.exec(r);
    expect(full?.[1] ?? '').toContain('sql_seccion vacuum_tras_full');
    expect(full?.[2]).not.toContain('sql_seccion vacuum_tras_full');
    // Se ejecuta como psql -c independiente, después del FULL de la misma tabla y antes de pasar a la siguiente.
    const iFull = r.indexOf('-c "${SENTENCIA} ${T}"');
    const iTras = r.indexOf('-c "${SENTENCIA_TRAS} ${T}"');
    expect(iFull).toBeGreaterThan(-1);
    expect(iTras).toBeGreaterThan(iFull);
    expect(r).not.toMatch(/VACUUM \(/);
  });

  it('falla si last_vacuum supera 10 días y publica last_vacuum/last_autovacuum/n_dead_tup', () => {
    const r = runBlocks() + sharedSql();
    expect(r).toMatch(/pg_stat_user_tables/);
    expect(r).toMatch(/last_vacuum/);
    expect(r).toMatch(/last_autovacuum/);
    expect(r).toMatch(/n_dead_tup/);
    expect(r).toMatch(/10 days?/);
    expect(r).toMatch(/exit 1/);
  });

  it('permisos mínimos: contents: read, sin id-token ni write', () => {
    const y = body();
    expect(y).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    expect(y).not.toMatch(/id-token/);
    expect(y).not.toMatch(/write-all/);
    expect(y).not.toMatch(/:\s*write\b/);
  });

  it('solo usa actions/* (sin terceros) y define timeout-minutes y concurrency', () => {
    const y = body();
    expect(y).not.toMatch(/uses:\s*(?!actions\/)\S+/);
    expect(y).toMatch(/timeout-minutes:\s*\d+/);
    expect(y).toMatch(/^concurrency:/m);
  });

  it('documenta el runbook de reactivar el cron cada 50 días', () => {
    expect(load()).toMatch(/50 d[ií]as/);
    expect(load()).toMatch(/60 d[ií]as/);
  });
});
