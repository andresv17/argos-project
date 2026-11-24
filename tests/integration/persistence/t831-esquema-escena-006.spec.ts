import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T831 (006, Fase 4): esquema de la escena del hogar en SQLite (0013) y Postgres (0009).
 * REQ-ESC6-018, REQ-ESC6-035; INV-ESC6-004, INV-ESC6-005; SC-ESC6-091. data-model.md §2.1..§2.8.
 * Las 6 tablas, sus CHECK (image_mime solo PNG/WebP, phase, outcome), claves foraneas, cascadas e indices unicos parciales.
 */
const opened: SqliteDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
const open = (): SqliteDatabase => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'h', '{}'), ('u2', 'bob', 'h', '{}')").run();
  db.prepare("INSERT INTO households (id, owner_user_id, data) VALUES ('h1', 'u1', '{}'), ('h2', 'u1', '{}')").run();
  return db;
};
/** 'ok' si la sentencia se ejecuta; si no, el mensaje del motor (oráculo exacto en lugar de not.toThrow). */
const runs = (fn: () => unknown): string => {
  try {
    fn();
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
};
const NOW = '2026-11-18T10:00:00.000Z';
const sceneForHousehold = (db: SqliteDatabase, id: string, household: string): void => {
  db.prepare("INSERT INTO home_scenes (id, household_id, quota_window, created_at, updated_at) VALUES (?, ?, '2026-11', ?, ?)").run(id, household, NOW, NOW);
};
const attempt = (db: SqliteDatabase, id: string, overrides: Record<string, unknown> = {}): void => {
  const row = {
    id, scene_id: 's1', actor_user_id: 'u1', action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f', inputs_snapshot: '{"v":1}', result_object_id: `r-${id}`,
    phase: 'PENDING', quota_window: '2026-11', quota_max: 5, idempotency_key_hash: null, started_at: NOW, ...overrides,
  };
  const names = Object.keys(row);
  db.prepare(`INSERT INTO scene_attempts (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...Object.values(row));
};
const tables = (db: SqliteDatabase): string[] => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").pluck().all() as string[];
const indexes = (db: SqliteDatabase): string[] => db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").pluck().all() as string[];

describe('T831 las 6 tablas de la escena y sus indices (SC-ESC6-091)', () => {
  it('SQLite crea home_scenes, scene_attempts, scene_image_sources, household_photos, scene_consents y scene_quota_carry', () => {
    const present = tables(open());
    for (const name of ['home_scenes', 'scene_attempts', 'scene_image_sources', 'household_photos', 'scene_consents', 'scene_quota_carry']) expect(present).toContain(name);
    expect(present).toHaveLength(35); // 009 (Fase 3, T1232): +4 tablas del portal de administración
  });

  it('los indices nuevos son exactamente los 6 del data-model (3 unicos parciales de escena/intento/consentimiento, 2 de contadores)', () => {
    const present = indexes(open()).filter((n) => /^(home_scenes|scene_attempts|scene_consents|household_photos|scene_quota)/.test(n));
    expect(present).toEqual([
      'home_scenes_household', 'home_scenes_owner', 'scene_attempts_actor_started', 'scene_attempts_idempotency', 'scene_attempts_scene_started', 'scene_consents_active',
    ]);
  });

  it('home_scenes: exactamente uno de household_id y owner_user_id, y una escena por hogar y por propietario sin hogar', () => {
    const db = open();
    sceneForHousehold(db, 's1', 'h1');
    expect(() => sceneForHousehold(db, 's2', 'h1')).toThrow(/UNIQUE/);
    expect(() => db.prepare("INSERT INTO home_scenes (id, quota_window, created_at, updated_at) VALUES ('x', '2026-11', ?, ?)").run(NOW, NOW)).toThrow(/CHECK/);
    expect(() => db.prepare("INSERT INTO home_scenes (id, household_id, owner_user_id, quota_window, created_at, updated_at) VALUES ('y', 'h2', 'u1', '2026-11', ?, ?)").run(NOW, NOW)).toThrow(/CHECK/);
    db.prepare("INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ('o1', 'u2', '2026-11', ?, ?)").run(NOW, NOW);
    expect(() => db.prepare("INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ('o2', 'u2', '2026-11', ?, ?)").run(NOW, NOW)).toThrow(/UNIQUE/);
  });

  it('home_scenes: run_state solo generating|failed, lease solo con generating y current_attempt_id nulo sin run_state', () => {
    const db = open();
    sceneForHousehold(db, 's1', 'h1');
    const set = (sql: string) => () => db.prepare(`UPDATE home_scenes SET ${sql} WHERE id = 's1'`).run();
    expect(set("run_state = 'idle'")).toThrow(/CHECK/);
    expect(set("run_state = 'generating', current_attempt_id = 'a1'")).toThrow(/CHECK/); // sin lease
    expect(runs(set("run_state = 'generating', current_attempt_id = 'a1', lease_expires_at = '2026-11-18T10:10:00.000Z'"))).toBe('ok');
    expect(set("run_state = 'failed', lease_expires_at = '2026-11-18T10:10:00.000Z'")).toThrow(/CHECK/);
    expect(set("run_state = NULL, lease_expires_at = NULL, current_attempt_id = 'a1'")).toThrow(/CHECK/);
    expect(runs(set("run_state = NULL, lease_expires_at = NULL, current_attempt_id = NULL"))).toBe('ok');
  });

  it('home_scenes.image_mime solo PNG, WebP y JPEG (INV-ESC6-005, enmienda N2 REQ-ESC6-035: la 0024 amplía el CHECK de la 0013); las seis columnas image_* son todas nulas o todas no nulas', () => {
    const db = open();
    sceneForHousehold(db, 's1', 'h1');
    const image = (mime: string) => () =>
      db.prepare("UPDATE home_scenes SET image_id = 'i1', image_mime = ?, image_size_bytes = 10, image_fingerprint = ?, image_inputs_snapshot = '{\"v\":1}', image_created_at = ? WHERE id = 's1'").run(mime, 'a'.repeat(64), NOW);
    expect(runs(image('image/jpeg'))).toBe('ok');
    expect(image('image/gif')).toThrow(/CHECK/);
    expect(runs(image('image/png'))).toBe('ok');
    expect(runs(image('image/webp'))).toBe('ok');
    expect(() => db.prepare("UPDATE home_scenes SET image_size_bytes = NULL WHERE id = 's1'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE home_scenes SET image_size_bytes = 0 WHERE id = 's1'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE home_scenes SET consumed_generations = -1 WHERE id = 's1'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE home_scenes SET image_degraded = 2 WHERE id = 's1'").run()).toThrow(/CHECK/);
  });

  it('household_photos: una por hogar, mime jpeg|png|webp, tamano positivo, cascada con el hogar y sin original_name', () => {
    const db = open();
    const photo = (mime: string, size = 5) => () => db.prepare("INSERT INTO household_photos (household_id, object_id, mime, size_bytes, uploaded_by_user_id, created_at) VALUES ('h1', 'o', ?, ?, 'u1', ?)").run(mime, size, NOW);
    expect(photo('image/gif')).toThrow(/CHECK/);
    expect(photo('image/jpeg', 0)).toThrow(/CHECK/);
    expect(runs(photo('image/jpeg'))).toBe('ok');
    expect(photo('image/png')).toThrow(/UNIQUE|PRIMARY/);
    expect((db.prepare('PRAGMA table_info(household_photos)').all() as Array<{ name: string }>).map((c) => c.name).sort()).toEqual(['created_at', 'household_id', 'mime', 'object_id', 'size_bytes', 'uploaded_by_user_id']);
    db.prepare("DELETE FROM households WHERE id = 'h1'").run();
    expect(db.prepare('SELECT COUNT(*) FROM household_photos').pluck().get()).toBe(0);
  });

  it('scene_attempts: action, mode, phase y outcome cerrados; hash de clave unico parcial; cascada con la escena', () => {
    const db = open();
    sceneForHousehold(db, 's1', 'h1');
    expect(() => attempt(db, 'a0', { action: 'DELETE' })).toThrow(/CHECK/);
    expect(() => attempt(db, 'a0', { mode: 'OTHER' })).toThrow(/CHECK/);
    expect(() => attempt(db, 'a0', { phase: 'QUEUED' })).toThrow(/CHECK/);
    expect(() => attempt(db, 'a0', { outcome: 'TIMEOUT' })).toThrow(/CHECK/);
    expect(() => attempt(db, 'a0', { degraded: 3 })).toThrow(/CHECK/);
    for (const outcome of ['SUCCEEDED', 'FAILED', 'CANCELLED']) expect(runs(() => attempt(db, `o-${outcome}`, { outcome, phase: 'DONE' }))).toBe('ok');
    attempt(db, 'a1', { idempotency_key_hash: 'k'.repeat(64) });
    expect(() => attempt(db, 'a2', { idempotency_key_hash: 'k'.repeat(64) })).toThrow(/UNIQUE/);
    attempt(db, 'a3'); // varios intentos sin hash conviven
    attempt(db, 'a4');
    db.prepare("DELETE FROM home_scenes WHERE id = 's1'").run();
    expect(db.prepare('SELECT COUNT(*) FROM scene_attempts').pluck().get()).toBe(0);
  });

  it('scene_consents: scope cerrado, un consentimiento vigente por (usuario, ambito, proveedor, version) y cascada con la cuenta', () => {
    const db = open();
    const consent = (id: string, scope = 'PET_PHOTOS', revokedAt: string | null = null) => () =>
      db.prepare("INSERT INTO scene_consents (id, user_id, scope, provider_id, notice_version, granted_at, revoked_at) VALUES (?, 'u1', ?, 'p', 'v1', ?, ?)").run(id, scope, NOW, revokedAt);
    expect(consent('c0', 'OTHER')).toThrow(/CHECK/);
    expect(runs(consent('c1'))).toBe('ok');
    expect(consent('c2')).toThrow(/UNIQUE/);
    expect(runs(consent('c3', 'PET_PHOTOS', NOW))).toBe('ok'); // revocados conviven
    expect(runs(consent('c4', 'HOUSEHOLD_PHOTO'))).toBe('ok');
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare('SELECT COUNT(*) FROM scene_consents').pluck().get()).toBe(0);
  });

  it('scene_quota_carry: clave (propietario, ventana), consumo no negativo y cascada con la cuenta; scene_image_sources cae con la escena', () => {
    const db = open();
    const carry = (window: string, n: number) => () => db.prepare("INSERT INTO scene_quota_carry (owner_user_id, quota_window, consumed_generations) VALUES ('u1', ?, ?)").run(window, n);
    expect(carry('2026-11', -1)).toThrow(/CHECK/);
    expect(runs(carry('2026-11', 2))).toBe('ok');
    expect(carry('2026-11', 3)).toThrow(/UNIQUE|PRIMARY/);
    sceneForHousehold(db, 's1', 'h1');
    db.prepare("INSERT INTO scene_image_sources (scene_id, owner_user_id) VALUES ('s1', 'u1')").run();
    expect(() => db.prepare("INSERT INTO scene_image_sources (scene_id, owner_user_id) VALUES ('s1', 'u1')").run()).toThrow(/UNIQUE|PRIMARY/);
    db.prepare("DELETE FROM households WHERE id = 'h1'").run();
    expect(db.prepare('SELECT COUNT(*) FROM scene_image_sources').pluck().get()).toBe(0);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare('SELECT COUNT(*) FROM scene_quota_carry').pluck().get()).toBe(0);
  });

  it('home_scenes.current_attempt_id no declara clave foranea (sin ciclo con scene_attempts, data-model §2.1)', () => {
    const db = open();
    const fks = db.prepare("PRAGMA foreign_key_list('home_scenes')").all() as Array<{ from: string }>;
    expect(fks.map((f) => f.from).sort()).toEqual(['household_id', 'owner_user_id']);
  });
});

describe('T831 Postgres 0009 declara las mismas 6 tablas y el CHECK de image_mime (paridad estatica)', () => {
  const sql = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0009_home_scenes.sql', import.meta.url), 'utf8');
  it('crea las 6 tablas y no usa STRICT, PRAGMA ni GLOB', () => {
    for (const name of ['home_scenes', 'scene_attempts', 'scene_image_sources', 'household_photos', 'scene_consents', 'scene_quota_carry']) expect(sql).toMatch(new RegExp(`CREATE TABLE ${name} \\(`));
    for (const banned of [/\bSTRICT\b/i, /\bPRAGMA\b/i, /\bGLOB\b/i, /strftime/i]) expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(banned);
    expect(sql).toContain("image_mime IN ('image/png', 'image/webp')"); // la 0009 no se edita: la 0020 amplía el CHECK a JPEG
  });
});
