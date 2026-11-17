import { describe, expect, it } from 'vitest';
import {
  DomainError,
  STATE_BACKUP_001,
  STATE_BACKUP_001_EVENTS,
  STATE_BACKUP_001_STATES,
  validateBackupEnvelopeV3,
  type BackupEnvelopeV3,
  type PetProfile,
} from '../../src/generated/index.ts';
import {
  ExportBackupUseCase,
  ImportBackupUseCase,
  MAX_IMPORT_BYTES,
  PreviewBackupImportUseCase,
  backupImportTransition,
  type BackupImportStep,
} from '../../src/application/use-cases/backup-use-cases.ts';
import { sortHistoricalRecords, sortPetsForListing } from '../../src/domain/sorting/deterministic-sorter.ts';
import { DeleteAccountUseCase } from '../../src/application/use-cases/account-use-cases.ts';
import { CONFIRMATION_PHRASE } from '../../src/domain/account/account-deletion-guards.ts';
import { DeterministicFaultInjector } from '../../src/infrastructure/persistence/fault-injector.ts';
import { confirmationTokenHash } from '../../src/infrastructure/adapters/sha256-backup-token.adapter.ts';
import { emptyMemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { ANDRES, ARGOS, LUNA, MARIA, HOUSEHOLD, canonicalState, createHarness, envelope, fixtures } from '../fixtures/application-harness.ts';
import { ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, identityState } from '../fixtures/identity-fixtures.ts';
import { DUMMY_PASSWORD_HASH, FAKE_HASH_PREFIX } from '../fixtures/test-doubles.ts';
import {
  ScriptedUnitOfWork,
  UNTIL_COMMIT,
  UNTIL_VALIDATION,
  V1_UNTIL_INVARIANTS,
  V2_UNTIL_INVARIANTS,
  V3_UNTIL_INVARIANTS,
  digestOf,
  failure,
  path,
  v2,
  v3,
  validBackupState,
} from '../fixtures/backup-harness.ts';

type Module = keyof BackupEnvelopeV3['records'];
const MODULES = Object.keys(envelope.records) as Module[];
const RECORD_COUNT = MODULES.reduce((n, m) => n + envelope.records[m].length, 0);
const json = (value: unknown) => JSON.stringify(value);
const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;
/** Mascota ajena (Luna) como la lleva un archivo 3.0.0: sin ownerUserId (H-R5-4). */
const { ownerUserId: _lunaOwner, ...LUNA_IN_FILE } = LUNA;
/** Estado sin lo que la exportación escribe a propósito: el token de confirmación y el consumo de cupo (REQ-ACC-002). */
const withoutExportTraces = (state: ReturnType<ReturnType<typeof createHarness>['uow']['snapshot']>) => ({ ...state, confirmationTokens: {}, rateEvents: [] });

/** Importación con observador; devuelve los pasos junto al resultado o al rechazo. */
function importer(deps = createHarness().deps) {
  const useCase = new ImportBackupUseCase(deps);
  return (payload: string | Uint8Array, confirmDigest: string | null = digestOf(payload)) => {
    const steps: BackupImportStep[] = [];
    return { steps, promise: useCase.execute(ANDRES, payload, confirmDigest, (s) => steps.push(s)) };
  };
}

/** Importación que debe fallar sin cambiar nada: código, campo, finalState y pasos. */
async function rejected(payload: string | Uint8Array, harness = createHarness()) {
  const before = json(harness.uow.snapshot());
  const { steps, promise } = importer(harness.deps)(payload);
  const error = await failure(promise);
  expect(json(harness.uow.snapshot())).toBe(before);
  return { ...error, path: path(steps) };
}

describe('exportación de respaldo (src/application/use-cases/backup-use-cases.ts)', () => {
  it('[REQ-BACKUP2-001] Andrés exporta sus 5 mascotas y sus registros en un sobre 3.0.0 válido, sin campos de propiedad, en el orden de REQ-PET-005 e INV-SORT-001', async () => {
    const h = createHarness(validBackupState());
    const before = json(withoutExportTraces(h.uow.snapshot()));
    const result = await new ExportBackupUseCase(h.deps).execute(ANDRES);
    const file = v3();
    const expected = {
      schemaVersion: '3.0.0',
      exportedAt: '2026-11-05T12:00:00.000Z',
      pets: sortPetsForListing(file.pets as unknown as PetProfile[]),
      records: Object.fromEntries(MODULES.map((m) => [m, sortHistoricalRecords(file.records[m] as never)])),
    };
    expect(result).toEqual({
      envelope: expected,
      json: JSON.stringify(expected, null, 2),
      fileName: 'argos-backup-2026-11-05.json',
      headers: { 'x-argos-confirmation-token': expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) },
    });
    expect(Object.keys(result.envelope)).toEqual(['schemaVersion', 'exportedAt', 'pets', 'records']);
    expect(validateBackupEnvelopeV3(result.envelope)).toBe(true);
    expect(json(withoutExportTraces(h.uow.snapshot()))).toBe(before);
  });

  it('[REQ-BACKUP2-001][INV-AUTH-003] María exporta solo a Luna: sin datos de otros usuarios, hogares, hashes ni tokens', async () => {
    const h = createHarness(validBackupState());
    await h.deps.uow.runInTransaction(async (r) => r.sessions.save('token-secreto', { userId: MARIA, createdAt: '2026-11-05T12:00:00.000Z', lastActivityAt: '2026-11-05T12:00:00.000Z', revokedAt: null }));
    const result = await new ExportBackupUseCase(h.deps).execute(MARIA);
    expect([(result.envelope as unknown as { exportedByUserId?: string }).exportedByUserId, result.envelope.pets, result.envelope.records]).toEqual([
      undefined,
      [LUNA_IN_FILE],
      Object.fromEntries(MODULES.map((m) => [m, []])),
    ]);
    const forbidden = [ANDRES, MARIA, ARGOS.id, HOUSEHOLD.id, FAKE_HASH_PREFIX, DUMMY_PASSWORD_HASH, 'token-secreto', 'passwordHash', 'username'];
    expect(forbidden.filter((text) => result.json.includes(text))).toEqual([]);
  });

  it('[REQ-BACKUP2-001] un usuario sin mascotas exporta un sobre vacío y válido', async () => {
    const result = await new ExportBackupUseCase(createHarness().deps).execute(fixtures.users[3].id);
    expect([result.envelope.pets, result.envelope.records, validateBackupEnvelopeV3(result.envelope)]).toEqual([[], Object.fromEntries(MODULES.map((m) => [m, []])), true]);
  });

  it('[REQ-BACKUP2-001] si los datos guardados no forman un sobre válido, la exportación falla con ERR-INTERNAL-UNEXPECTED, sin emitir token ni consumir cupo', async () => {
    const state = validBackupState();
    state.pets = state.pets.map((p) => (p.id === ARGOS.id ? { ...p, name: ' Argos' } : p));
    const h = createHarness(state);
    const error = await failure(new ExportBackupUseCase(h.deps).execute(ANDRES));
    expect([error.code, error.status, error.finalState, error.detail, h.uow.snapshot().confirmationTokens, h.uow.snapshot().rateEvents]).toEqual([
      'ERR-INTERNAL-UNEXPECTED',
      500,
      null,
      'Los datos guardados del usuario no forman un respaldo 3.0.0 válido.',
      {},
      [],
    ]);
  });
});

describe('importación de respaldo, caminos de éxito (STATE-BACKUP-001)', () => {
  it('[REQ-BACKUP2-002][STATE-BACKUP-001] reimportar el propio respaldo recorre la máquina hasta COMPLETED y una nueva exportación sale idéntica', async () => {
    const h = createHarness(validBackupState());
    const exported = await new ExportBackupUseCase(h.deps).execute(ANDRES);
    const { steps, promise } = importer(h.deps)(exported.json);
    expect(await promise).toEqual({ finalState: 'COMPLETED', sourceSchemaVersion: '3.0.0', importedPetsCount: 5, importedRecordsCount: RECORD_COUNT });
    expect(path(steps)).toEqual([...UNTIL_COMMIT, 'COMMIT_SUCCESS>COMPLETED']);
    expect((await new ExportBackupUseCase(h.deps).execute(ANDRES)).json).toBe(exported.json);
  });

  it('[REQ-BACKUP2-002] reemplaza solo los datos del usuario: las mascotas y registros que no están en el sobre desaparecen; María, usuarios y hogares no cambian; las asignaciones de las mascotas reemplazadas se podan', async () => {
    const h = createHarness();
    const before = h.uow.snapshot();
    const onlyArgos = v3((e) => {
      e.pets = e.pets.filter((p) => p.id === ARGOS.id);
      for (const m of MODULES) (e.records[m] as Array<{ petId: string }>) = (e.records[m] as Array<{ petId: string }>).filter((r) => r.petId === ARGOS.id);
    });
    const result = await importer(h.deps)(json(onlyArgos)).promise;
    const after = h.uow.snapshot();
    const argosRecords = MODULES.reduce((n, m) => n + onlyArgos.records[m].length, 0);
    expect(result).toEqual({ finalState: 'COMPLETED', sourceSchemaVersion: '3.0.0', importedPetsCount: 1, importedRecordsCount: argosRecords });
    expect(after.pets.map((p) => p.id).sort()).toEqual([ARGOS.id, LUNA.id].sort());
    expect(Object.fromEntries(MODULES.map((m) => [m, after.records[m].map((r) => r.id).sort()]))).toEqual(
      Object.fromEntries(MODULES.map((m) => [m, onlyArgos.records[m].map((r) => r.id).sort()])),
    );
    const { pets: _p, records: _r, assignments: afterAssignments, auditLog: afterAudit, ...restAfter } = after;
    const { pets: _bp, records: _br, assignments: beforeAssignments, auditLog: beforeAudit, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    const ownPets = new Set(before.pets.filter((p) => p.ownerUserId === ANDRES).map((p) => p.id));
    expect(afterAssignments).toEqual(beforeAssignments.filter((a) => !ownPets.has(a.petId)));
    expect(afterAudit.length - beforeAudit.length).toBe(1);
    expect(afterAudit.at(-1)).toMatchObject({ mutationType: 'IMPORT', entityType: 'USER', entityId: ANDRES, executorUserId: ANDRES });
  });

  it('[REQ-BACKUP2-002][INV-BACKUP-001] el ownerUserId de un 2.0.0 se descarta en la migración y las mascotas quedan del usuario autenticado', async () => {
    const h = createHarness({ ...emptyMemoryState(), users: canonicalState().users });
    const fromMaria = v2((e) => {
      (e as unknown as { exportedByUserId: string }).exportedByUserId = MARIA;
      e.pets = e.pets.map((p) => ({ ...p, ownerUserId: MARIA })) as never;
    });
    const { steps, promise } = importer(h.deps)(json(fromMaria));
    expect([(await promise).importedPetsCount, path(steps).slice(0, -1)]).toEqual([5, [...V2_UNTIL_INVARIANTS, 'INVARIANTS_VALID>COMMITTING_SNAPSHOT']]);
    expect([...new Set(h.uow.snapshot().pets.map((p) => p.ownerUserId))]).toEqual([ANDRES]);
  });

  it('[REQ-BACKUP-002][STATE-BACKUP-001] EDGE-023: Andrés importa el sobre v1 canónico, pasa por MIGRATING_LEGACY_ENVELOPE y queda con 4 mascotas suyas', async () => {
    const h = createHarness();
    const maria = (s: ReturnType<typeof h.uow.snapshot>) => s.pets.filter((p) => p.ownerUserId === MARIA);
    const mariaBefore = maria(h.uow.snapshot());
    const legacy = fixtures.validLegacyBackupEnvelopeV1;
    const { steps, promise } = importer(h.deps)(json(legacy));
    expect(await promise).toEqual({ finalState: 'COMPLETED', sourceSchemaVersion: '1.0.0', importedPetsCount: 4, importedRecordsCount: 8 });
    expect(path(steps)).toEqual([...V1_UNTIL_INVARIANTS, 'INVARIANTS_VALID>COMMITTING_SNAPSHOT', 'COMMIT_SUCCESS>COMPLETED']);
    const after = h.uow.snapshot();
    const andresPets = after.pets.filter((p) => p.ownerUserId === ANDRES);
    expect(sortPetsForListing(andresPets)).toEqual(
      sortPetsForListing(
        legacy.pets.map((p: PetProfile) => ({
          ...p,
          ownerUserId: ANDRES,
          updatedAt: p.createdAt,
          species: (p.species as string) === 'DOG' ? 'CANINE' : 'FELINE',
          speciesOther: null,
          birthDateIsEstimate: false,
          neutered: null,
          microchipId: null,
        })),
      ),
    );
    expect(maria(after)).toEqual(mariaBefore);
  });

  it('[REQ-BACKUP-002] el contenido también puede llegar como bytes UTF-8', async () => {
    const result = await importer()(new TextEncoder().encode(json(v3()))).promise;
    expect(result).toEqual({ finalState: 'COMPLETED', sourceSchemaVersion: '3.0.0', importedPetsCount: 5, importedRecordsCount: RECORD_COUNT });
  });
});

describe('importación de respaldo, salidas a ROLLED_BACK con el estado intacto byte a byte (INV-BACKUP-001)', () => {
  it('[STATE-BACKUP-001][ERR-BACKUP-PAYLOAD-TOO-LARGE] el límite es el de la guarda de la máquina, 10 485 760 bytes', () => {
    expect([MAX_IMPORT_BYTES, STATE_BACKUP_001.states.CHECKING_PAYLOAD_SIZE.guard]).toEqual([
      10_485_760,
      'bytesRead <= 10485760 (medido sobre los bytes realmente leídos del flujo, con corte; no sobre Content-Length)',
    ]);
  });

  it('[ERR-BACKUP-PAYLOAD-TOO-LARGE][INV-BACKUP-001] EDGE-019: 10 MB + 1 byte se rechaza en CHECKING_PAYLOAD_SIZE, como texto y como bytes', async () => {
    const base = json(v3());
    const tooLarge = base + ' '.repeat(MAX_IMPORT_BYTES + 1 - utf8Bytes(base));
    for (const payload of [tooLarge, new TextEncoder().encode(tooLarge)]) {
      const r = await rejected(payload);
      expect([r.code, r.status, r.finalState, r.field, r.path]).toEqual([
        'ERR-BACKUP-PAYLOAD-TOO-LARGE',
        413,
        'ROLLED_BACK',
        null,
        ['START_IMPORT>CHECKING_PAYLOAD_SIZE', 'SIZE_EXCEEDED>ROLLED_BACK'],
      ]);
      expect(r.detail).toBe('El archivo ocupa 10485761 bytes; el máximo es 10485760 (10 MB).');
    }
  });

  it('[ERR-BACKUP-PAYLOAD-TOO-LARGE] el tamaño se mide en bytes UTF-8, no en caracteres', async () => {
    const accented = json('é'.repeat(MAX_IMPORT_BYTES / 2));
    expect([accented.length <= MAX_IMPORT_BYTES, (await rejected(accented)).code]).toEqual([true, 'ERR-BACKUP-PAYLOAD-TOO-LARGE']);
  });

  it('[REQ-BACKUP-002][ERR-BACKUP-PAYLOAD-TOO-LARGE] exactamente 10 485 760 bytes se acepta', async () => {
    const base = json(v3());
    const exact = base + ' '.repeat(MAX_IMPORT_BYTES - utf8Bytes(base));
    expect([utf8Bytes(exact), (await importer()(exact).promise).finalState]).toEqual([MAX_IMPORT_BYTES, 'COMPLETED']);
  });

  it.each(['{"schemaVersion": "2.0.0",', '', 'undefined', "{'a': 1}"])(
    '[ERR-BACKUP-MALFORMED-JSON] JSON malformado (%j) se rechaza en PARSING_JSON',
    async (payload) => {
      const r = await rejected(payload);
      expect([r.code, r.status, r.finalState, r.path]).toEqual(['ERR-BACKUP-MALFORMED-JSON', 400, 'ROLLED_BACK', ['START_IMPORT>CHECKING_PAYLOAD_SIZE', 'SIZE_OK>PARSING_JSON', 'PARSE_FAILURE>ROLLED_BACK']]);
    },
  );

  it('[ERR-BACKUP-MALFORMED-JSON] bytes que no son UTF-8 válido son JSON malformado, aunque reemplazados formarían JSON válido', async () => {
    expect([(await rejected(new Uint8Array([0x7b, 0xff, 0x7d]))).code, (await rejected(new Uint8Array([0x22, 0xff, 0x22]))).code]).toEqual([
      'ERR-BACKUP-MALFORMED-JSON',
      'ERR-BACKUP-MALFORMED-JSON',
    ]);
  });

  it('[ERR-BACKUP-MALFORMED-JSON][INV-BACKUP-001] EDGE-021: con el almacenamiento caído, el JSON malformado sigue siendo ERR-BACKUP-MALFORMED-JSON y no se toca el almacenamiento', async () => {
    const down = new ScriptedUnitOfWork(async () => {
      throw new Error('almacenamiento caído');
    });
    const { steps, promise } = importer({ ...createHarness().deps, uow: down })('{"roto"');
    const error = await failure(promise);
    expect([error.code, error.finalState, path(steps).at(-1), down.calls]).toEqual(['ERR-BACKUP-MALFORMED-JSON', 'ROLLED_BACK', 'PARSE_FAILURE>ROLLED_BACK', 0]);
  });

  it.each([
    ['[]', null, 'La raíz del respaldo debe ser un objeto JSON.'],
    ['42', null, 'La raíz del respaldo debe ser un objeto JSON.'],
    ['null', null, 'La raíz del respaldo debe ser un objeto JSON.'],
    ['{"pets": []}', 'schemaVersion', 'Falta schemaVersion.'],
  ])('[ERR-BACKUP-SCHEMA-INVALID] %s no tiene forma de sobre: SCHEMA_INVALID', async (payload, field, detail) => {
    const r = await rejected(payload);
    expect([r.code, r.status, r.field, r.detail, r.finalState, r.path]).toEqual(['ERR-BACKUP-SCHEMA-INVALID', 422, field, detail, 'ROLLED_BACK', [...UNTIL_VALIDATION, 'SCHEMA_INVALID>ROLLED_BACK']]);
  });

  it.each([['"4.0.0"'], ['"3.0.1"'], ['"2.0"'], ['2'], ['null'], ['["2.0.0"]']])(
    '[ERR-BACKUP-VERSION-UNSUPPORTED] schemaVersion %s no es 1.0.0, 2.0.0 ni 3.0.0: VERSION_MISMATCH',
    async (version) => {
      const r = await rejected(json(v2()).replace('"schemaVersion":"2.0.0"', `"schemaVersion":${version}`));
      expect([r.code, r.status, r.field, r.detail, r.finalState, r.path]).toEqual([
        'ERR-BACKUP-VERSION-UNSUPPORTED',
        422,
        'schemaVersion',
        `schemaVersion ${JSON.stringify(JSON.parse(version))} no es 1.0.0, 2.0.0 ni 3.0.0.`,
        'ROLLED_BACK',
        [...UNTIL_VALIDATION, 'VERSION_MISMATCH>ROLLED_BACK'],
      ]);
    },
  );

  it.each([
    ['propiedad no autorizada en la raíz', (e: BackupEnvelopeV3) => Object.assign(e, { unexpected: 1 }), '/unexpected', '/unexpected: must NOT have additional properties.'],
    ['nombre con espacios extremos', (e: BackupEnvelopeV3) => (e.pets[0]!.name = ' Argos'), '/pets/0/name', '/pets/0/name: must match pattern "^\\S(.*\\S)?$".'],
    ['falta records', (e: BackupEnvelopeV3) => delete (e as Partial<BackupEnvelopeV3>).records, '/records', "/records: must have required property 'records'."],
  ])('[ERR-BACKUP-SCHEMA-INVALID] 3.0.0 y 2.0.0 con %s: SCHEMA_INVALID con el puntero del primer fallo', async (_case, mutate, field, detail) => {
    for (const candidate of [v3(mutate), v2(mutate)]) {
      const r = await rejected(json(candidate));
      expect([r.code, r.field, r.detail, r.finalState, r.path]).toEqual(['ERR-BACKUP-SCHEMA-INVALID', field, detail, 'ROLLED_BACK', [...UNTIL_VALIDATION, 'SCHEMA_INVALID>ROLLED_BACK']]);
    }
  });

  it('[ERR-BACKUP-SCHEMA-INVALID][INV-BACKUP-001] __proto__ en una mascota (prototype pollution): PARSE_HARDENING_REJECTED antes de validar el esquema, sin tocar el prototipo', async () => {
    const r = await rejected(json(v3()).replace('"pets":[{', '"pets":[{"__proto__":{"isAdmin":true},'));
    expect([r.code, r.status, r.field, r.detail, r.finalState, r.path]).toEqual([
      'ERR-BACKUP-SCHEMA-INVALID',
      422,
      null,
      'Clave no permitida en el archivo: __proto__.',
      'ROLLED_BACK',
      [...UNTIL_VALIDATION, 'PARSE_HARDENING_REJECTED>ROLLED_BACK'],
    ]);
    expect(({} as Record<string, unknown>)['isAdmin']).toBe(undefined);
  });

  it('[ERR-BACKUP-SCHEMA-INVALID] durante la importación x-sdd-error no se aplica: un peso de 999 kg es ERR-BACKUP-SCHEMA-INVALID', async () => {
    const r = await rejected(json(v3((e) => (e.records.weights[0]!.weightKg = 999))));
    expect([r.code, r.field]).toEqual(['ERR-BACKUP-SCHEMA-INVALID', '/records/weights/0/weightKg']);
  });

  it('[ERR-BACKUP-SCHEMA-INVALID] un sobre v1 que no cumple su esquema se rechaza antes de migrar', async () => {
    const legacy = structuredClone(fixtures.validLegacyBackupEnvelopeV1);
    legacy.pets[0].extra = 1;
    const r = await rejected(json(legacy));
    expect([r.code, r.field, r.path]).toEqual(['ERR-BACKUP-SCHEMA-INVALID', '/pets/0/extra', [...UNTIL_VALIDATION, 'SCHEMA_INVALID>ROLLED_BACK']]);
  });

  type LegacyEnvelopeV1 = { pets: Array<Record<string, unknown>> };
  it.each([
    ['un nombre con espacios extremos', (l: LegacyEnvelopeV1) => (l.pets[0]!.name = ' Argos'), '/pets/0/name'],
    ['un avatarUrl javascript:', (l: LegacyEnvelopeV1) => (l.pets[0]!.avatarUrl = 'javascript:alert(1)'), '/pets/0/avatarUrl'],
    ['un UUID que no es v4', (l: LegacyEnvelopeV1) => (l.pets[0]!.id = '11111111-1111-1111-8111-111111111101'), '/pets/0/id'],
  ])('[ERR-BACKUP-SCHEMA-INVALID][STATE-BACKUP-001] v1 válido con %s no cumple v2 tras migrar: MIGRATION_SCHEMA_INVALID', async (_case, mutate, field) => {
    const legacy = structuredClone(fixtures.validLegacyBackupEnvelopeV1);
    mutate(legacy);
    const r = await rejected(json(legacy));
    expect([r.code, r.field, r.finalState, r.path]).toEqual([
      'ERR-BACKUP-SCHEMA-INVALID',
      field,
      'ROLLED_BACK',
      [...UNTIL_VALIDATION, 'LEGACY_V1_VALID>MIGRATING_LEGACY_ENVELOPE', 'MIGRATION_SCHEMA_INVALID>ROLLED_BACK'],
    ]);
  });

  it.each([
    ['EDGE-005: un peso cuyo petId no está en pets', v3((e) => (e.records.weights[0]!.petId = LUNA.id)), 'weights', `Registro huérfano ${envelope.records.weights[0]!.id} (weights): la mascota ${LUNA.id} no está en pets.`],
    ['dos mascotas con el mismo id', v3((e) => e.pets.push({ ...e.pets[0]!, name: 'Copia' })), 'pets', `ID duplicado en el respaldo: ${ARGOS.id} (pets).`],
    ['un id de registro repetido en otro módulo', v3((e) => (e.records.customParameters[0]!.id = e.records.weights[0]!.id)), 'customParameters', `ID duplicado en el respaldo: ${envelope.records.weights[0]!.id} (customParameters).`],
    ['un registro con el id de una mascota', v3((e) => (e.records.weights[1]!.id = ARGOS.id)), 'weights', `ID duplicado en el respaldo: ${ARGOS.id} (weights).`],
    ['dos registros con el mismo id en el mismo módulo', v3((e) => e.records.weights.push({ ...e.records.weights[0]!, recordedAt: '2026-10-02' })), 'weights', `ID duplicado en el respaldo: ${envelope.records.weights[0]!.id} (weights).`],
  ])('[ERR-BACKUP-REFERENTIAL-INTEGRITY][INV-BACKUP-001] %s: ORPHAN_DUPLICATE_OR_FOREIGN_ID', async (_case, candidate, field, detail) => {
    const r = await rejected(json(candidate));
    expect([r.code, r.status, r.field, r.detail, r.finalState, r.path]).toEqual([
      'ERR-BACKUP-REFERENTIAL-INTEGRITY',
      409,
      field,
      detail,
      'ROLLED_BACK',
      [...V3_UNTIL_INVARIANTS, 'ORPHAN_DUPLICATE_OR_FOREIGN_ID>ROLLED_BACK'],
    ]);
  });

  it('[ERR-BACKUP-REFERENTIAL-INTEGRITY][INV-BACKUP-001] EDGE-006: Andrés importa un sobre con el id de Luna (mascota de María)', async () => {
    const r = await rejected(json(v3((e) => e.pets.push(LUNA_IN_FILE as never))));
    expect([r.code, r.field, r.detail, r.path]).toEqual([
      'ERR-BACKUP-REFERENTIAL-INTEGRITY',
      'pets',
      'El archivo contiene un identificador que no se puede importar.',
      [...V3_UNTIL_INVARIANTS, 'ORPHAN_DUPLICATE_OR_FOREIGN_ID>ROLLED_BACK'],
    ]);
    expect(r.detail.includes(LUNA.id) || r.detail.includes(MARIA)).toBe(false);
  });

  it('[ERR-BACKUP-REFERENTIAL-INTEGRITY][INV-BACKUP-001] un id de registro que ya es de un registro de María se rechaza en cualquier módulo', async () => {
    const state = canonicalState();
    const lunaWeight = { ...envelope.records.weights[0]!, id: '22222222-2222-4222-8222-222222222299', petId: LUNA.id, recordedAt: '2026-10-01' };
    state.records.weights.push(lunaWeight);
    const r = await rejected(json(v3((e) => (e.records.vaccinations[0]!.id = lunaWeight.id))), createHarness(state));
    expect([r.code, r.field, r.detail]).toEqual(['ERR-BACKUP-REFERENTIAL-INTEGRITY', 'vaccinations', 'El archivo contiene un identificador que no se puede importar.']);
  });

  it('[ERR-BACKUP-REFERENTIAL-INTEGRITY] un registro guardado cuyo petId ya no existe tampoco es del usuario', async () => {
    const state = canonicalState();
    state.records.weights.push({ ...envelope.records.weights[0]!, id: '22222222-2222-4222-8222-222222222298', petId: '11111111-1111-4111-8111-111111111999' });
    const r = await rejected(json(v3((e) => (e.records.weights[0]!.id = '22222222-2222-4222-8222-222222222298'))), createHarness(state));
    expect([r.code, r.field]).toEqual(['ERR-BACKUP-REFERENTIAL-INTEGRITY', 'weights']);
  });

  it.each([
    ['ERR-REC-DATE-BEFORE-BIRTH', 'EDGE-033: un peso anterior al nacimiento de Argos', (e: BackupEnvelopeV3) => (e.records.weights[0]!.recordedAt = '2022-05-09'), 'recordedAt'],
    ['ERR-PET-FUTURE-BIRTHDATE', 'una mascota nacida mañana', (e: BackupEnvelopeV3) => (e.pets[4]!.birthDate = '2026-11-06'), 'birthDate'],
    ['ERR-REC-FUTURE-EVENT-DATE', 'una visita de mañana', (e: BackupEnvelopeV3) => (e.records.medicalVisits[0]!.visitDate = '2026-11-06'), 'visitDate'],
    ['ERR-REC-WEIGHT-OUT-OF-RANGE', 'un peso de 3 decimales: válido en la envolvente 3.0.0, no en CANINE con 2 decimales (INV-REC2-002)', (e: BackupEnvelopeV3) => (e.records.weights[1]!.weightKg = 32.855), 'weightKg'],
    ['ERR-REC-MEASUREMENT-OUT-OF-RANGE', 'una medida con más de 2 decimales que la frontera tolera', (e: BackupEnvelopeV3) => (e.records.bodyMeasurements[0]!.waistCm = 58.5 + 1e-13), 'waistCm'],
    ['ERR-REC-INVALID-BOOSTER-DATE', 'un refuerzo el mismo día de la vacuna', (e: BackupEnvelopeV3) => (e.records.vaccinations[1]!.nextBoosterAt = e.records.vaccinations[1]!.appliedAt), 'nextBoosterAt'],
    ['ERR-REC-INVALID-NEXT-DOSE-DATE', 'una próxima dosis anterior a la aplicación', (e: BackupEnvelopeV3) => (e.records.dewormings[0]!.nextSuggestedDoseAt = '2026-10-01'), 'nextSuggestedDoseAt'],
  ])('[INV-BACKUP-001][STATE-BACKUP-001] %s (%s) se propaga con finalState ROLLED_BACK (DOMAIN_INVARIANT_VIOLATED)', async (code, _case, mutate, field) => {
    const r = await rejected(json(v3(mutate)));
    expect([r.code, r.status, r.field, r.finalState, r.path]).toEqual([code, 422, field, 'ROLLED_BACK', [...V3_UNTIL_INVARIANTS, 'DOMAIN_INVARIANT_VIOLATED>ROLLED_BACK']]);
    expect(STATE_BACKUP_001.states.CHECKING_DOMAIN_INVARIANTS.on.DOMAIN_INVARIANT_VIOLATED.allowedErrors).toContain(code);
  });

  it('[INV-BACKUP-001] los IDs duplicados y huérfanos se detectan antes que las invariantes de dominio', async () => {
    const both = v3((e) => {
      e.records.weights[0]!.recordedAt = '2022-05-09';
      e.records.customParameters[0]!.petId = LUNA.id;
    });
    expect((await rejected(json(both))).code).toBe('ERR-BACKUP-REFERENTIAL-INTEGRITY');
  });

  it('[INV-BACKUP-001] las invariantes de dominio se comprueban antes que los IDs de otro usuario', async () => {
    const both = v3((e) => {
      e.pets.push(LUNA_IN_FILE as never);
      e.records.weights[0]!.recordedAt = '2022-05-09';
    });
    expect((await rejected(json(both))).code).toBe('ERR-REC-DATE-BEFORE-BIRTH');
  });

  it('[ERR-BACKUP-ATOMIC-ROLLBACK][INV-BACKUP-001] EDGE-020: si el commit falla, ERR-BACKUP-ATOMIC-ROLLBACK con finalState ROLLED_BACK y el estado previo intacto', async () => {
    const h = createHarness(canonicalState(), {
      beforeCommit: () => {
        throw new Error('disco lleno');
      },
    });
    const r = await rejected(json(v3()), h);
    expect([r.code, r.status, r.finalState, r.path]).toEqual(['ERR-BACKUP-ATOMIC-ROLLBACK', 500, 'ROLLED_BACK', [...UNTIL_COMMIT, 'STORAGE_ERROR>ROLLED_BACK']]);
  });

  it('[ERR-BACKUP-ATOMIC-ROLLBACK] un DomainError del almacenamiento durante el commit también es STORAGE_ERROR, salvo que señale rollback fallido', async () => {
    const uow = new ScriptedUnitOfWork((inner, work) =>
      inner.runInTransaction((r) => work({ ...r, records: { ...r.records, add: async () => { throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'fila corrupta'); } } })),
    );
    const before = json(uow.inner.snapshot());
    const { steps, promise } = importer({ ...createHarness().deps, uow })(json(v3()));
    const error = await failure(promise);
    expect([error.code, error.finalState, path(steps).at(-1), json(uow.inner.snapshot()) === before]).toEqual(['ERR-BACKUP-ATOMIC-ROLLBACK', 'ROLLED_BACK', 'STORAGE_ERROR>ROLLED_BACK', true]);
  });

  it.each([
    ['otro código con finalState UNKNOWN', new DomainError('ERR-BACKUP-ATOMIC-ROLLBACK', 'x', null, 'UNKNOWN')],
    ['un objeto que no es DomainError con la misma forma', Object.assign(new Error('x'), { code: 'ERR-INTERNAL-UNEXPECTED', finalState: 'UNKNOWN' })],
  ])('[ERR-BACKUP-ATOMIC-ROLLBACK] solo un DomainError ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN señala rollback fallido; %s es STORAGE_ERROR', async (_case, thrown) => {
    const uow = new ScriptedUnitOfWork(async (inner, work) => {
      await inner.runInTransaction(work).catch(() => undefined);
      throw thrown;
    });
    const { steps, promise } = importer({ ...createHarness().deps, uow })(json(v3()));
    const error = await failure(promise);
    expect([error.code, error.finalState, path(steps).at(-1)]).toEqual(['ERR-BACKUP-ATOMIC-ROLLBACK', 'ROLLED_BACK', 'STORAGE_ERROR>ROLLED_BACK']);
  });

  it('[STATE-BACKUP-001] ROLLBACK_FAILED: si el adaptador señala que el rollback falló, ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN', async () => {
    const uow = new ScriptedUnitOfWork(async (inner, work) => {
      await inner.runInTransaction(work).catch(() => undefined);
      throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'No se pudo deshacer la transacción.', null, 'UNKNOWN');
    });
    const { steps, promise } = importer({ ...createHarness().deps, uow })(json(v3()));
    const error = await failure(promise);
    expect([error.code, error.status, error.finalState, error.detail, path(steps)]).toEqual([
      'ERR-INTERNAL-UNEXPECTED',
      500,
      'UNKNOWN',
      'No se pudo deshacer la transacción.',
      [...UNTIL_COMMIT, 'ROLLBACK_FAILED>ROLLED_BACK'],
    ]);
    expect(STATE_BACKUP_001.states.COMMITTING_SNAPSHOT.on.ROLLBACK_FAILED).toEqual({ target: 'ROLLED_BACK', error: 'ERR-INTERNAL-UNEXPECTED', finalState: 'UNKNOWN' });
  });

  it('[INV-BACKUP-001][STATE-BACKUP-001] STORAGE_READ_FAILED: un fallo de lectura al comprobar IDs ajenos, antes del commit, es ERR-INTERNAL-UNEXPECTED con ROLLED_BACK y no escribe nada', async () => {
    const uow = new ScriptedUnitOfWork((inner, work) =>
      inner.runInTransaction((r) => work({ ...r, pets: { ...r.pets, findById: async () => { throw new Error('E/S'); } } })),
    );
    const before = json(uow.inner.snapshot());
    const { steps, promise } = importer({ ...createHarness().deps, uow })(json(v3()));
    const error = await failure(promise);
    expect([error.code, error.finalState, error.detail, path(steps), json(uow.inner.snapshot()) === before]).toEqual([
      'ERR-INTERNAL-UNEXPECTED',
      'ROLLED_BACK',
      'Fallo del almacenamiento al comprobar los IDs del respaldo.',
      [...V3_UNTIL_INVARIANTS, 'STORAGE_READ_FAILED>ROLLED_BACK'],
      true,
    ]);
    expect(STATE_BACKUP_001.states.CHECKING_DOMAIN_INVARIANTS.on.STORAGE_READ_FAILED).toEqual({ target: 'ROLLED_BACK', error: 'ERR-INTERNAL-UNEXPECTED' });
  });

  it('[INV-BACKUP-001][STATE-BACKUP-001] antes del commit no se ha escrito nada: también la señal de rollback fallido es STORAGE_READ_FAILED con ROLLED_BACK', async () => {
    const uow = new ScriptedUnitOfWork(async () => {
      throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'rollback de lectura', null, 'UNKNOWN');
    });
    const { steps, promise } = importer({ ...createHarness().deps, uow })(json(v3()));
    const error = await failure(promise);
    expect([error.code, error.finalState, path(steps).at(-1)]).toEqual(['ERR-INTERNAL-UNEXPECTED', 'ROLLED_BACK', 'STORAGE_READ_FAILED>ROLLED_BACK']);
  });
});

describe('conformidad con contracts/state-machines/backup-import.machine.json', () => {
  type Definition = string | { target: string };
  const machine = STATE_BACKUP_001.states as unknown as Record<string, { on?: Record<string, Definition> }>;
  const defined = Object.entries(machine).flatMap(([state, def]) => Object.entries(def.on ?? {}).map(([event, t]) => ({ state, event, t })));

  it('[STATE-BACKUP-001] backupImportTransition devuelve exactamente cada transición de la máquina generada', () => {
    expect(defined.map(({ state, event }) => backupImportTransition(state as never, event as never))).toEqual(defined.map(({ t }) => t));
    expect(defined.length).toBe(22);
  });

  it('[STATE-BACKUP-001] un evento que la máquina no define en un estado lanza: COMPLETED y ROLLED_BACK son finales', () => {
    const undefinedPairs = STATE_BACKUP_001_STATES.flatMap((state) =>
      STATE_BACKUP_001_EVENTS.filter((event) => machine[state]!.on?.[event] === undefined).map((event) => ({ state, event })),
    );
    const messages = undefinedPairs.map(({ state, event }) => {
      try {
        backupImportTransition(state, event);
        return 'sin error';
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(messages).toEqual(undefinedPairs.map(({ state, event }) => `STATE-BACKUP-001: el evento ${event} no está definido en ${state}`));
    expect(undefinedPairs.filter((p) => p.state === 'COMPLETED' || p.state === 'ROLLED_BACK').length).toBe(2 * STATE_BACKUP_001_EVENTS.length);
  });
});

/**
 * T271 (REQ-BACKUP2-001, REQ-ACC-002): la exportación 3.0.0 emite el token efímero. H-R5-2: el token sale como cabecera
 * de respuesta `x-argos-confirmation-token` (43 caracteres base64url, nunca dentro del archivo), no como un campo del
 * archivo. D-T271-2 (decisión de Neo, opción b): la «403 por rol sin EXPORT_IMPORT_BACKUP» no es alcanzable (la matriz
 * concede la acción a los 4 roles y `execute(userId)` no recibe rol): su cobertura es la matriz pura en
 * tests/unit/rbac-export-permission.spec.ts y el 401 sin sesión en backup-export-unauthenticated.api.spec.ts.
 *
 * @implements REQ-BACKUP2-001, REQ-RBAC-001, REQ-ACC-002, ERR-ACCOUNT-CONFIRMATION-MISMATCH
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_HEADER = 'x-argos-confirmation-token';

describe('T271: exportación con token (REQ-BACKUP2-001, REQ-ACC-002)', () => {
  it('[REQ-BACKUP2-001][REQ-ACC-002] la exportación entrega un token de 43 caracteres base64url en la cabecera x-argos-confirmation-token y no aparece en el archivo', async () => {
    const h = createHarness(validBackupState());
    const result = await new ExportBackupUseCase(h.deps).execute(ANDRES);
    const token = result.headers[TOKEN_HEADER];
    expect([TOKEN_SHAPE.test(token), result.json.includes(token), Object.keys(result.envelope).includes('confirmationToken')]).toEqual([true, false, false]);
  });

  it('[REQ-ACC-002] en el estado solo queda el SHA-256 del token, nunca el token en claro', async () => {
    const h = createHarness(validBackupState());
    const token = (await new ExportBackupUseCase(h.deps).execute(ANDRES)).headers[TOKEN_HEADER];
    expect([JSON.stringify(h.uow.snapshot()).includes(token), JSON.stringify(h.uow.snapshot().confirmationTokens).includes(confirmationTokenHash(token))]).toEqual([false, true]);
  });

  it('[REQ-ACC-002][ERR-ACCOUNT-CONFIRMATION-MISMATCH] el token de una exportación reemplazada ya no sirve: la eliminación responde MISMATCH y no cambia nada; el último token sí se consume', async () => {
    const h = createHarness(identityState());
    h.clock.setClock(REFERENCE_TODAY, REFERENCE_NOW);
    const exporter = new ExportBackupUseCase(h.deps);
    const first = (await exporter.execute(ELENA)).headers[TOKEN_HEADER];
    const second = (await exporter.execute(ELENA)).headers[TOKEN_HEADER];
    await h.deps.uow.runInTransaction(async (r) => r.sessions.save('ses', { userId: ELENA, createdAt: REFERENCE_NOW, lastActivityAt: REFERENCE_NOW, revokedAt: null }));
    const before = json(h.uow.snapshot());
    const stale = await failure(
      new DeleteAccountUseCase(h.deps).execute(ELENA, 'ses', { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['elena.solo']!, backupConfirmationToken: first }),
    );
    const afterStale = json(h.uow.snapshot());
    const lastUsable = await h.deps.uow.runInTransaction((r) => h.deps.backupTokens.consume(r, ELENA, second, h.deps.clock.nowIsoTimestamp()));
    expect([TOKEN_SHAPE.test(first), TOKEN_SHAPE.test(second), first !== second, stale.code, stale.status, afterStale === before, lastUsable]).toEqual([
      true,
      true,
      true,
      'ERR-ACCOUNT-CONFIRMATION-MISMATCH',
      409,
      true,
      true,
    ]);
  });

  it('[ERR-RATE-LIMITED] la 6.ª exportación en la ventana se rechaza con ERR-RATE-LIMITED y no emite token ni cambia nada', async () => {
    const h = createHarness(validBackupState());
    const exporter = new ExportBackupUseCase(h.deps);
    for (let i = 0; i < 5; i += 1) await exporter.execute(ANDRES);
    const before = json(h.uow.snapshot());
    const error = await failure(exporter.execute(ANDRES));
    expect([error.code, error.status, json(h.uow.snapshot()) === before]).toEqual(['ERR-RATE-LIMITED', 429, true]);
  });
});

/**
 * T278 (REQ-BACKUP2-002, STATE-BACKUP-001, REQ-AUD-001, SC-004): previsualización sin escritura, confirmación por
 * fileDigest, fila IMPORT y checkpoint del WAL.
 *
 * @implements REQ-BACKUP2-002, STATE-BACKUP-001, REQ-AUD-001, INV-BACKUP-001, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-PET-MICROCHIP-DUPLICATE
 */
describe('T278: previsualización, confirmación e importación con auditoría (REQ-BACKUP2-002)', () => {
  const previewer = (deps = createHarness().deps) => {
    const useCase = new PreviewBackupImportUseCase(deps);
    return (payload: string) => {
      const steps: BackupImportStep[] = [];
      return { steps, promise: useCase.execute(ANDRES, payload, (s) => steps.push(s)) };
    };
  };

  it('[REQ-BACKUP2-002][STATE-BACKUP-001] la previsualización termina en PREVIEW_READY con conteos, colisiones propias, mascotas compartidas y fileDigest, sin escribir nada', async () => {
    const h = createHarness();
    const before = json(h.uow.snapshot());
    const payload = json(v3());
    const { steps, promise } = previewer(h.deps)(payload);
    const result = await promise;
    expect(path(steps)).toEqual(['START_PREVIEW>CHECKING_PAYLOAD_SIZE', ...V3_UNTIL_INVARIANTS.slice(1), 'PREVIEW_VALID>PREVIEW_READY']);
    expect(result).toEqual({
      sourceSchemaVersion: '3.0.0',
      fileDigest: digestOf(payload),
      counts: { pets: 5, weights: 2, bodyMeasurements: 1, vaccinations: 2, dewormings: 1, medicalVisits: 1, customParameters: 1 },
      collisions: { petsReplacedCount: 5, sameIdPetsCount: 5 },
      affectedSharedPets: { petsCount: 5, householdsCount: 1 },
    });
    expect(json(h.uow.snapshot())).toBe(before);
  });

  it('[REQ-BACKUP2-002][INV-BACKUP-001] la previsualización no comprueba IDs de otros usuarios (solo el commit, I-5): no revela si existen y cuenta solo colisiones propias', async () => {
    const h = createHarness();
    const result = await previewer(h.deps)(json(v3((e) => e.pets.push(LUNA_IN_FILE as never)))).promise;
    expect([result.counts.pets, result.collisions]).toEqual([6, { petsReplacedCount: 5, sameIdPetsCount: 5 }]);
  });

  it.each([
    ['ausente', null],
    ['vacía', ''],
    ['en mayúsculas', digestOf(json(v3())).toUpperCase()],
    ['de otros bytes', digestOf('otros bytes')],
  ])('[REQ-BACKUP2-002][STATE-BACKUP-001] la confirmación %s se rechaza con ERR-SCHEMA-VALIDATION-FAILED, ROLLED_BACK y sin cambios', async (_case, confirmation) => {
    const h = createHarness();
    const before = json(h.uow.snapshot());
    const { steps, promise } = importer(h.deps)(json(v3()), confirmation);
    const error = await failure(promise);
    expect([error.code, error.status, error.field, error.finalState, path(steps).at(-1), json(h.uow.snapshot()) === before]).toEqual([
      'ERR-SCHEMA-VALIDATION-FAILED',
      422,
      'X-Argos-Import-Confirm',
      'ROLLED_BACK',
      V3_UNTIL_INVARIANTS.at(-1),
      true,
    ]);
  });

  it('[INV-BACKUP-001][STATE-BACKUP-001] el ID ajeno (409) se informa antes que la confirmación ausente: la máquina comprueba los IDs ajenos y luego el digest', async () => {
    const r = await rejected(json(v3((e) => e.pets.push(LUNA_IN_FILE as never))));
    expect(r.code).toBe('ERR-BACKUP-REFERENTIAL-INTEGRITY');
    const h = createHarness();
    const { promise } = importer(h.deps)(json(v3((e) => e.pets.push(LUNA_IN_FILE as never))), null);
    expect((await failure(promise)).code).toBe('ERR-BACKUP-REFERENTIAL-INTEGRITY');
  });

  it('[REQ-BACKUP2-002][INV-PET2-001] dos mascotas con el mismo microchip en el archivo → ERR-PET-MICROCHIP-DUPLICATE por DOMAIN_INVARIANT_VIOLATED', async () => {
    const r = await rejected(
      json(
        v3((e) => {
          e.pets[0]!.microchipId = '985112345678901';
          e.pets[1]!.microchipId = '985112345678901';
        }),
      ),
    );
    expect([r.code, r.status, r.field, r.finalState, r.path.at(-1)]).toEqual(['ERR-PET-MICROCHIP-DUPLICATE', 409, 'microchipId', 'ROLLED_BACK', 'DOMAIN_INVARIANT_VIOLATED>ROLLED_BACK']);
  });

  it('[REQ-AUD-001][STATE-BACKUP-001] la importación escribe 1 fila IMPORT (USER, entityId = userId) con hashes antes y después, y pide el checkpoint del WAL una sola vez', async () => {
    const h = createHarness();
    let checkpoints = 0;
    (h.deps.uow as { checkpointAfterCommit?: () => Promise<void> }).checkpointAfterCommit = async () => void (checkpoints += 1);
    const before = h.uow.snapshot().auditLog.length;
    await importer(h.deps)(json(v3())).promise;
    const rows = h.uow.snapshot().auditLog.slice(before);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mutationType: 'IMPORT', entityType: 'USER', entityId: ANDRES, executorUserId: ANDRES });
    expect([/^[0-9a-f]{64}$/.test(rows[0]!.previousStateHash ?? ''), /^[0-9a-f]{64}$/.test(rows[0]!.newStateHash ?? ''), rows[0]!.previousStateHash !== rows[0]!.newStateHash, checkpoints]).toEqual([true, true, true, 1]);
  });

  it('[SC-004][ERR-BACKUP-ATOMIC-ROLLBACK] con el inyector determinista, fallar cada escritura del commit deja el estado idéntico, sin fila de auditoría, con ERR-BACKUP-ATOMIC-ROLLBACK', async () => {
    const counter = new DeterministicFaultInjector(null);
    await importer(createHarness(canonicalState(), { faultInjector: counter }).deps)(json(v3())).promise;
    const writes = counter.operations.length;
    const outcomes: Array<[number, string, string | null, boolean]> = [];
    for (let n = 1; n <= writes; n += 1) {
      const h = createHarness(canonicalState(), { faultInjector: new DeterministicFaultInjector(n) });
      const before = json(h.uow.snapshot());
      const { promise } = importer(h.deps)(json(v3()));
      const error = await failure(promise);
      outcomes.push([n, error.code, error.finalState, json(h.uow.snapshot()) === before]);
    }
    expect(outcomes).toEqual(Array.from({ length: writes }, (_, i) => [i + 1, 'ERR-BACKUP-ATOMIC-ROLLBACK', 'ROLLED_BACK', true]));
  });
});
