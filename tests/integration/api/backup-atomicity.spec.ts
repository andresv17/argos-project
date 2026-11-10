import { afterEach, describe, expect, it } from 'vitest';
import { validateBackupEnvelopeV2, type BackupEnvelopeV2 } from '../../../src/generated/index.ts';
import { MAX_IMPORT_BYTES } from '../../../src/application/use-cases/backup-use-cases.ts';
import { PASSWORDS, fixtures } from '../../fixtures/application-harness.ts';
import { v2 } from '../../fixtures/backup-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { LUNA_ID, USERS_BY_NAME } from './api-fixtures.ts';

/**
 * (reescritura de DEUDA-TEST-001): respaldo por HTTP sobre SQLite. Exportación del usuario, importación v2 y
 * v1, errores con finalState, rollback byte a byte con fallo real en el commit y orden de comprobaciones
 * de INV-BACKUP-001 (DEUDA-BACKUP-ORDER-001).
 */
let api: Api;
afterEach(async () => api.close());

const IMPORT = '/api/backup/import';
const importAs = async (cookie: string, payload: string | Uint8Array) => api.call('POST', IMPORT, { cookie, raw: payload });
const lunaOf = () => api.db.prepare('SELECT data FROM pets WHERE id = ?').pluck().get(LUNA_ID);

describe('exportación por HTTP (GET /api/backup/export)', () => {
  it('[REQ-BACKUP-001] exporta el sobre 2.0.0 válido solo con los datos del usuario, como archivo argos-backup-AAAA-MM-DD.json', async () => {
    api = await createApi();
    const r = await api.call('GET', '/api/backup/export', { cookie: await api.login('andres') });
    const envelope = r.json as BackupEnvelopeV2;
    expect([
      r.status,
      r.headers['content-disposition'],
      validateBackupEnvelopeV2(envelope),
      envelope.schemaVersion,
      envelope.pets.map((p) => p.name).sort(),
      envelope.pets.every((p) => p.ownerUserId === USERS_BY_NAME.andres),
    ]).toEqual([200, 'attachment; filename="argos-backup-2026-11-05.json"', true, '2.0.0', ['Argos', 'Kira', 'Milo', 'Nyx', 'Toby'], true]);
  });

  it('[REQ-BACKUP-001] el archivo no contiene contraseñas, hashes ni el token de sesión (INV-AUTH-003)', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const r = await api.call('GET', '/api/backup/export', { cookie });
    const secrets = [PASSWORDS['andres']!, 'fake-scrypt$', cookie.split('=')[1]!, 'passwordHash', 'password'];
    expect(secrets.filter((s) => r.text.includes(s))).toEqual([]);
  });
});

describe('importación por HTTP (POST /api/backup/import)', () => {
  it('[REQ-BACKUP-002] exportar e importar el mismo sobre v2 → 200 COMPLETED y el estado queda igual; los datos de otro usuario no se tocan', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const exported = await api.call('GET', '/api/backup/export', { cookie });
    const before = api.dump();
    const r = await importAs(cookie, exported.text);
    expect([r.status, r.json, api.dump() === before]).toEqual([
      200,
      { finalState: 'COMPLETED', sourceSchemaVersion: '2.0.0', importedPetsCount: 5, importedRecordsCount: 8 },
      true,
    ]);
  });

  it('[REQ-BACKUP-002] EDGE-023: el sobre v1 heredado migra y deja 4 mascotas con ownerUserId = Andrés; Luna de María no cambia', async () => {
    api = await createApi();
    const luna = lunaOf();
    const r = await importAs(await api.login('andres'), JSON.stringify(fixtures.validLegacyBackupEnvelopeV1));
    const owners = api.db.prepare('SELECT owner_user_id FROM pets WHERE owner_user_id = ?').pluck().all(USERS_BY_NAME.andres);
    expect([r.status, (r.json as { sourceSchemaVersion: string }).sourceSchemaVersion, owners.length, lunaOf() === luna]).toEqual([200, '1.0.0', 4, true]);
  });

  it.each([
    ['JSON malformado (EDGE-021 sin almacenamiento caído)', '{"schemaVersion":', 400, 'ERR-BACKUP-MALFORMED-JSON'],
    ['UTF-8 inválido', new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]), 400, 'ERR-BACKUP-MALFORMED-JSON'],
    ['versión no soportada', JSON.stringify({ ...v2(), schemaVersion: '3.0.0' }), 422, 'ERR-BACKUP-VERSION-UNSUPPORTED'],
    ['sin schemaVersion', JSON.stringify({ pets: [] }), 422, 'ERR-BACKUP-SCHEMA-INVALID'],
    ['raíz que no es objeto', '[]', 422, 'ERR-BACKUP-SCHEMA-INVALID'],
    ['huérfano (EDGE-005)', JSON.stringify(v2((e) => e.records.weights.push({ ...e.records.weights[0]!, id: '22222222-2222-4222-8222-222222222299', petId: '99999999-9999-4999-8999-999999999999' }))), 409, 'ERR-BACKUP-REFERENTIAL-INTEGRITY'],
    ['ID ajeno: Luna de María (EDGE-006)', JSON.stringify(v2((e) => e.pets.push({ ...fixtures.otherUserPets[0] }))), 409, 'ERR-BACKUP-REFERENTIAL-INTEGRITY'],
    ['error de dominio propagado (EDGE-033)', JSON.stringify(v2((e) => (e.records.weights[0]!.recordedAt = '2020-01-01'))), 422, 'ERR-REC-DATE-BEFORE-BIRTH'],
  ] as const)('[INV-BACKUP-001] %s → %i %s con finalState ROLLED_BACK y sin cambios en la base', async (_case, payload, status, code) => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = api.dump();
    const r = await importAs(cookie, payload);
    expect([problemOf(r), api.dump() === before]).toEqual([{ status, code, finalState: 'ROLLED_BACK' }, true]);
  });

  it('[INV-BACKUP-001] EDGE-019: 10 MB + 1 byte → 413 ERR-BACKUP-PAYLOAD-TOO-LARGE con ROLLED_BACK; un cuerpo mucho mayor, también', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const justOver = await importAs(cookie, ' '.repeat(MAX_IMPORT_BYTES + 1));
    const huge = await importAs(cookie, ' '.repeat(MAX_IMPORT_BYTES + 2_000_000));
    expect([problemOf(justOver), problemOf(huge)]).toEqual([
      { status: 413, code: 'ERR-BACKUP-PAYLOAD-TOO-LARGE', finalState: 'ROLLED_BACK' },
      { status: 413, code: 'ERR-BACKUP-PAYLOAD-TOO-LARGE', finalState: 'ROLLED_BACK' },
    ]);
  });

  it('[INV-BACKUP-001] EDGE-020: un fallo real de SQLite en COMMITTING_SNAPSHOT → 500 ERR-BACKUP-ATOMIC-ROLLBACK con ROLLED_BACK y la base igual byte a byte', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    api.db.exec("CREATE TEMP TRIGGER fallo_disco BEFORE INSERT ON vaccinations BEGIN SELECT RAISE(ABORT, 'disco lleno simulado'); END;");
    const before = api.dump();
    const r = await importAs(cookie, JSON.stringify(v2()));
    expect([problemOf(r), api.dump() === before, r.text.includes('disco lleno')]).toEqual([
      { status: 500, code: 'ERR-BACKUP-ATOMIC-ROLLBACK', finalState: 'ROLLED_BACK' },
      true,
      false,
    ]);
  });

  it('[INV-BACKUP-001] EDGE-021: con el almacenamiento caído, el JSON malformado sigue siendo ERR-BACKUP-MALFORMED-JSON (no se enmascara)', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    api.db.exec('DROP TABLE weights');
    const r = await importAs(cookie, '{roto');
    expect(problemOf(r)).toEqual({ status: 400, code: 'ERR-BACKUP-MALFORMED-JSON', finalState: 'ROLLED_BACK' });
  });

  it('[INV-BACKUP-001] la importación exige CSRF y sesión antes de leer el cuerpo', async () => {
    api = await createApi();
    const noCsrf = await api.call('POST', IMPORT, { csrf: false, raw: '{roto' });
    const noSession = await api.call('POST', IMPORT, { raw: ' '.repeat(MAX_IMPORT_BYTES + 10) });
    expect([problemOf(noCsrf), problemOf(noSession)]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });
});

describe('orden de comprobaciones de INV-BACKUP-001 (DEUDA-BACKUP-ORDER-001)', () => {
  it('[INV-BACKUP-001] con cuatro violaciones a la vez se informa primero duplicados y huérfanos, después INV-PET-*, después INV-REC-* y por último IDs de otros usuarios', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const violations = { duplicate: true, futurePet: true, recordBeforeBirth: true, foreignPet: true };
    const envelope = () =>
      v2((e) => {
        if (violations.duplicate) e.records.medicalVisits.push({ ...e.records.medicalVisits[0]! });
        if (violations.futurePet) e.pets.push({ ...e.pets[0]!, id: '11111111-1111-4111-8111-111111111199', name: 'Futuro', birthDate: '2027-01-01' });
        if (violations.recordBeforeBirth) e.records.weights[0]!.recordedAt = '2020-01-01';
        if (violations.foreignPet) e.pets.push({ ...fixtures.otherUserPets[0] });
      });
    const before = api.dump();
    const outcome = async () => {
      const r = await importAs(cookie, JSON.stringify(envelope()));
      const p = r.json as { code?: string; detail?: string; finalState?: string };
      return `${r.status} ${p.code ?? p.finalState} ${/duplicado/.test(p.detail ?? '') ? 'duplicado' : /otro usuario/.test(p.detail ?? '') ? 'ajeno' : ''}`.trim();
    };
    const steps = [await outcome()];
    violations.duplicate = false;
    steps.push(await outcome());
    violations.futurePet = false;
    steps.push(await outcome());
    violations.recordBeforeBirth = false;
    steps.push(await outcome());
    const unchanged = api.dump() === before;
    violations.foreignPet = false;
    steps.push(await outcome());
    expect([steps, unchanged]).toEqual([
      [
        '409 ERR-BACKUP-REFERENTIAL-INTEGRITY duplicado',
        '422 ERR-PET-FUTURE-BIRTHDATE',
        '422 ERR-REC-DATE-BEFORE-BIRTH',
        '409 ERR-BACKUP-REFERENTIAL-INTEGRITY ajeno',
        '200 COMPLETED',
      ],
      true,
    ]);
  });

  it('[INV-BACKUP-001] un huérfano también se informa antes que INV-PET-* e INV-REC-*', async () => {
    api = await createApi();
    const r = await importAs(
      await api.login('andres'),
      JSON.stringify(
        v2((e) => {
          e.pets[0]!.birthDate = '2027-01-01';
          e.records.weights[1]!.petId = '99999999-9999-4999-8999-999999999999';
        }),
      ),
    );
    expect([problemOf(r), /huérfano/.test((r.json as { detail: string }).detail)]).toEqual([
      { status: 409, code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', finalState: 'ROLLED_BACK' },
      true,
    ]);
  });
});

