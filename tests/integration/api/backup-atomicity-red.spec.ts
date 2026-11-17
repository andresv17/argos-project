import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV3 } from '../../../src/generated/index.ts';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { dumpSqlite } from '../../fixtures/sqlite-harness.ts';
import { v2 } from '../../fixtures/backup-harness.ts';
import { upgradeEnvelope } from '../../fixtures/storage-upgrade.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { LUNA_ID, USERS_BY_NAME } from './api-fixtures.ts';

/**
 * T273 (fase roja, Rebanada 5, SC-004): criterio de fallo inyectado en cada escritura del reemplazo atómico, con la
 * importación confirmada por X-Argos-Import-Confirm: ERR-BACKUP-ATOMIC-ROLLBACK, volcado idéntico, cero filas de
 * auditoría nuevas, otros usuarios intactos, sin residuos, reintento exitoso con 1 fila IMPORT, rollback fallido
 * (UNKNOWN) y corte SIGKILL a mitad del commit.
 *
 * @implements REQ-BACKUP2-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-ATOMIC-ROLLBACK
 */
let api: Api;
afterEach(async () => api.close());

const IMPORT = '/api/backup/import';
const ANDRES = USERS_BY_NAME.andres;
/** Sobre 3.0.0 válido del usuario (sin ownerUserId ni exportedByUserId): el fixture 2.0.0 elevado y despojado de los campos de propiedad. */
const v3 = (): BackupEnvelopeV3 => {
  const { exportedByUserId: _by, ...root } = upgradeEnvelope(v2()) as BackupEnvelopeV3 & { exportedByUserId?: string };
  return { ...root, schemaVersion: '3.0.0', pets: root.pets.map(({ ownerUserId: _owner, ...pet }: BackupEnvelopeV3['pets'][number] & { ownerUserId?: string }) => pet) } as unknown as BackupEnvelopeV3;
};
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const confirmImport = (cookie: string, text: string) =>
  api.call('POST', IMPORT, { cookie, raw: text, headers: { 'x-argos-import-confirm': sha256(text) }, contract: false });
const auditCount = () => api.db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get() as number;
const importRows = () => api.db.prepare("SELECT entity_type, entity_id, executor_user_id FROM audit_log WHERE mutation_type = 'IMPORT'").all();
/** Suma de verificación de las filas de otros usuarios y de los hogares (no deben variar nunca). */
const othersChecksum = () =>
  createHash('sha256')
    .update(
      JSON.stringify([
        api.db.prepare('SELECT * FROM pets WHERE owner_user_id <> ? ORDER BY id').all(ANDRES),
        api.db.prepare('SELECT * FROM users WHERE id <> ? ORDER BY id').all(ANDRES),
        api.db.prepare('SELECT * FROM households ORDER BY id').all(),
        api.db.prepare('SELECT * FROM household_members ORDER BY 1, 2').all(),
      ]),
    )
    .digest('hex');
const tablesInSchema = () => api.db.prepare("SELECT name FROM sqlite_master ORDER BY name").pluck().all();

const COLLECTION_TABLES = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'] as const;
/** Una escritura del commit de SC-004 por caso: cada borrado, cada inserción, las asignaciones y la fila IMPORT. */
const WRITES: ReadonlyArray<readonly [string, string, string]> = [
  ...COLLECTION_TABLES.map((t) => [`borrado de ${t}`, `BEFORE DELETE ON ${t}`, ''] as const),
  ['borrado de pet_assignments', 'BEFORE DELETE ON pet_assignments', ''],
  ['borrado de pets', 'BEFORE DELETE ON pets', ''],
  ['inserción de pets', 'BEFORE INSERT ON pets', ''],
  ...COLLECTION_TABLES.map((t) => [`inserción de ${t}`, `BEFORE INSERT ON ${t}`, ''] as const),
  ['inserción de la fila IMPORT de auditoría', 'BEFORE INSERT ON audit_log', "WHEN NEW.mutation_type = 'IMPORT'"],
];

describe('criterio de fallo inyectado SC-004 en cada escritura del reemplazo', () => {
  it.each(WRITES)(
    '[INV-BACKUP-001][STATE-BACKUP-001][REQ-BACKUP2-002][ERR-BACKUP-ATOMIC-ROLLBACK] fallo en %s: ROLLED_BACK, volcado idéntico, 0 filas de auditoría nuevas, otros intactos, y el reintento importa con 1 fila IMPORT',
    async (_write, event, when) => {
      api = await createApi();
      const cookie = await api.login('andres');
      const text = JSON.stringify(v3());
      const before = { dump: api.dump(), audit: auditCount(), others: othersChecksum(), schema: tablesInSchema() };
      api.db.exec(`CREATE TEMP TRIGGER fallo_inyectado ${event} ${when} BEGIN SELECT RAISE(ABORT, 'fallo inyectado en el commit'); END;`);
      const failed = await confirmImport(cookie, text);
      api.db.exec('DROP TRIGGER fallo_inyectado');
      expect([
        problemOf(failed),
        failed.text.includes('fallo inyectado'),
        failed.text.includes(LUNA_ID),
        api.dump() === before.dump,
        auditCount(),
        othersChecksum() === before.others,
        tablesInSchema(),
      ]).toEqual([{ status: 500, code: 'ERR-BACKUP-ATOMIC-ROLLBACK', finalState: 'ROLLED_BACK' }, false, false, true, before.audit, true, before.schema]);
      const retry = await confirmImport(cookie, text);
      expect([retry.status, (retry.json as { finalState?: string }).finalState, auditCount(), importRows()]).toEqual([
        200,
        'COMPLETED',
        before.audit + 1,
        [{ entity_type: 'USER', entity_id: ANDRES, executor_user_id: ANDRES }],
      ]);
    },
  );

  it('[REQ-BACKUP2-002][STATE-BACKUP-001] la importación completada deja 1 fila IMPORT (USER, entityId = userId) y las mascotas importadas sin asignaciones a hogares', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const assignedBefore = api.db.prepare('SELECT COUNT(*) FROM pet_assignments').pluck().get() as number;
    const r = await confirmImport(cookie, JSON.stringify(v3()));
    const assignedAfter = api.db
      .prepare('SELECT COUNT(*) FROM pet_assignments WHERE pet_id IN (SELECT id FROM pets WHERE owner_user_id = ?)')
      .pluck()
      .get(ANDRES);
    expect([r.status, importRows(), assignedBefore > 0, assignedAfter]).toEqual([
      200,
      [{ entity_type: 'USER', entity_id: ANDRES, executor_user_id: ANDRES }],
      true,
      0,
    ]);
  });
});

describe('rollback fallido y corte abrupto (extraCases de SC-004)', () => {
  it('[STATE-BACKUP-001][INV-BACKUP-001] si el rollback del almacenamiento falla: 500 ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN, sin fila IMPORT y sin filtrar datos del archivo', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const original = api.deps.uow.runInTransaction.bind(api.deps.uow);
    let commits = 0;
    (api.deps.uow as { runInTransaction: unknown }).runInTransaction = async (work: (r: never) => Promise<unknown>) =>
      original(async (r) => {
        await work(r as never);
        commits += 1;
        throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'el rollback del almacenamiento falló', null, 'UNKNOWN');
      });
    const before = auditCount();
    const text = JSON.stringify(v3());
    const r = await confirmImport(cookie, text);
    expect([problemOf(r), commits, importRows(), auditCount(), r.text.includes('Argos')]).toEqual([
      { status: 500, code: 'ERR-INTERNAL-UNEXPECTED', finalState: 'UNKNOWN' },
      1,
      [],
      before,
      false,
    ]);
    (api.deps.uow as { runInTransaction: unknown }).runInTransaction = original;
    const retry = await confirmImport(cookie, text);
    expect([retry.status, auditCount(), importRows().length]).toEqual([200, before + 1, 1]);
  });

  it('[STATE-BACKUP-001][INV-BACKUP-001][REQ-BACKUP2-002] un SIGKILL a mitad del commit deja, al reabrir, el estado exactamente anterior o exactamente el nuevo (con su fila IMPORT)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-sigkill-'));
    try {
      const file = join(dir, 'argos.sqlite');
      const beforeFile = join(dir, 'before.json');
      const script = `
        import { writeFileSync } from 'node:fs';
        import { createHash } from 'node:crypto';
        import { openSqliteDatabase } from ${JSON.stringify(join(process.cwd(), 'src/infrastructure/persistence/sqlite/sqlite-database.ts'))};
        import { SqliteUnitOfWork } from ${JSON.stringify(join(process.cwd(), 'src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts'))};
        import { buildApp } from ${JSON.stringify(join(process.cwd(), 'src/infrastructure/http/app.ts'))};
        import { FixedClockAdapter } from ${JSON.stringify(join(process.cwd(), 'src/infrastructure/adapters/fixed-clock.adapter.ts'))};
        import { PASSWORDS, TEST_RATE_LIMITS, createDeps } from ${JSON.stringify(join(process.cwd(), 'tests/fixtures/application-harness.ts'))};
        import { SpyPasswordHasher } from ${JSON.stringify(join(process.cwd(), 'tests/fixtures/test-doubles.ts'))};
        import { dumpSqlite, seedSqlite } from ${JSON.stringify(join(process.cwd(), 'tests/fixtures/sqlite-harness.ts'))};
        const V3 = JSON.parse(${JSON.stringify(JSON.stringify(v3()))});
        const db = openSqliteDatabase(${JSON.stringify(file)});
        const uow = new SqliteUnitOfWork(db);
        await seedSqlite(uow);
        db.exec("DELETE FROM audit_log WHERE mutation_type = 'MIGRATION'");
        const app = await buildApp({ deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher(), TEST_RATE_LIMITS), cookieSecure: false });
        const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-argos-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify({ username: 'andres', password: PASSWORDS.andres }) });
        const cookie = String(login.headers['set-cookie']).split(';')[0];
        writeFileSync(${JSON.stringify(beforeFile)}, dumpSqlite(db));
        db.function('kill9', () => process.kill(process.pid, 'SIGKILL'));
        db.exec("CREATE TEMP TRIGGER corte BEFORE INSERT ON audit_log WHEN NEW.mutation_type = 'IMPORT' BEGIN SELECT kill9(); END;");
        const text = JSON.stringify(V3);
        await app.inject({ method: 'POST', url: '/api/backup/import', headers: { 'x-argos-request': '1', 'content-type': 'application/json', cookie, 'x-argos-import-confirm': createHash('sha256').update(text).digest('hex') }, payload: text });
        process.exit(0);
      `;
      const child = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8', timeout: 60_000 });
      const reopened = openSqliteDatabase(file);
      const state = dumpSqlite(reopened);
      const imports = reopened.prepare("SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'IMPORT'").pluck().get();
      reopened.close();
      const previous = readFileSync(beforeFile, 'utf8');
      const outcome = state === previous && imports === 0 ? 'ANTERIOR' : imports === 1 ? 'NUEVO' : 'INCONSISTENTE';
      expect([child.signal, ['ANTERIOR', 'NUEVO'].includes(outcome)]).toEqual(['SIGKILL', true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
