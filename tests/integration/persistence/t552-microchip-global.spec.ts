/**
 * T552 [P] [US3] microchip único global, en memoria, SQLite y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL)
 * (SC-CAT-022..025; REQ-PET4-001, INV-PET4-001, EDGE-008, EDGE-016):
 *  - un duplicado PROPIO y uno AJENO reciben la MISMA respuesta (409 ERR-PET-MICROCHIP-DUPLICATE, cuerpo idéntico byte a byte) por la MISMA
 *    ruta de código: un solo `pets.save`, sin consulta previa por propietario (`listByOwners`);
 *  - ni el cuerpo ni ninguna línea de log contienen el microchip, `Key (`, el UUID del titular ni el de su mascota;
 *  - una violación CHECK o de otro índice no se reporta como duplicado;
 *  - la importación aplica la misma regla: falla con ERR-PET-MICROCHIP-DUPLICATE (finalState ROLLED_BACK) nombrando la mascota PROPIA del archivo,
 *    sin datos del tercero y sin modificar nada (SC-CAT-024);
 *  - el esquema final tiene `pets_microchip_global` (único parcial) y no `pets_owner_microchip` (SC-CAT-023); la migración con duplicados entre
 *    propietarios ABORTA con el conteo, sin microchips ni ids (SC-CAT-025).
 * La medición de tiempo (propio vs ajeno) es INFORMATIVA y no bloquea.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { isMicrochipGlobalViolation } from '../../../src/application/use-cases/microchip-violation.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { cloudLoggerOptions } from '../../../src/infrastructure/http/cloud-logging.ts';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { ANDRES, ARGOS, LUNA, MARIA, PASSWORDS } from '../../fixtures/application-harness.ts';
import { digestOf, failure, validBackupState } from '../../fixtures/backup-harness.ts';
import { ENGINE_NAMES, HAS_POSTGRES, openEngine, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

const CHIP = '985112345678901';
const OTHER_CHIP = '985112345678902';
const DETAIL = 'Este microchip ya está registrado en ARGOS. Si es tuyo, contacta al administrador.';
const NEW_PET = { name: 'Nube', species: 'RABBIT', breed: 'Cabeza de león', birthDate: '2024-01-10', sex: 'MALE', avatarUrl: null };
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

/** Unidad de trabajo que anota cada llamada al repositorio de mascotas (la ruta de código de cada petición). */
function spyOnPets(uow: UnitOfWorkPort, calls: string[]): UnitOfWorkPort {
  return {
    runInTransaction: (work) =>
      uow.runInTransaction((repositories) => {
        const pets = new Proxy(repositories.pets, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? (...args: unknown[]) => (calls.push(String(property)), (value as (...a: unknown[]) => unknown).apply(target, args)) : value;
          },
        });
        return work({ ...repositories, pets } as RepositorySet);
      }),
    ...(uow.checkpointAfterCommit === undefined ? {} : { checkpointAfterCommit: () => uow.checkpointAfterCommit!() }),
  };
}

interface Http {
  readonly app: FastifyInstance;
  readonly engine: IdentityEngine;
  readonly calls: string[];
  readonly lines: string[];
  login(username: string): Promise<string>;
  post(cookie: string, url: string, body: unknown): Promise<{ status: number; body: string; json: Record<string, unknown> }>;
  patch(cookie: string, url: string, body: unknown): Promise<{ status: number; body: string; json: Record<string, unknown> }>;
}

async function openHttp(name: EngineName): Promise<Http> {
  const engine = await openEngine(name, validBackupState());
  const calls: string[] = [];
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString('utf8').split('\n').filter((l) => l.length > 0));
      done();
    },
  });
  const app = await buildApp({ deps: { ...engine.deps, uow: spyOnPets(engine.uow, calls) }, cookieSecure: false, logger: { ...cloudLoggerOptions(), stream } });
  disposers.push(async () => {
    await app.close();
    await engine.dispose();
  });
  const send = async (method: 'POST' | 'PATCH', cookie: string, url: string, body: unknown) => {
    const headers: Record<string, string> = { 'x-argos-request': '1', 'content-type': 'application/json', cookie };
    const petPatch = /^\/api\/pets\/([^/?]+)$/.exec(url);
    if (method === 'PATCH' && petPatch !== null) {
      // 007 (EDGE-007-009): PATCH de mascota exige If-Match con la versión vigente de la ficha.
      const version = (await engine.read((r) => r.pets.findById(petPatch[1]!)))?.version;
      if (version !== undefined) headers['if-match'] = `"${version}"`;
    }
    const response = await app.inject({ method, url, headers, payload: JSON.stringify(body) });
    return { status: response.statusCode, body: response.body, json: JSON.parse(response.body === '' ? '{}' : response.body) as Record<string, unknown> };
  };
  return {
    app,
    engine,
    calls,
    lines,
    async login(username) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-argos-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify({ username, password: PASSWORDS[username] }) });
      expect(response.statusCode).toBe(200);
      const header = response.headers['set-cookie'];
      return `argos_session=${/argos_session=([^;]+)/.exec(([] as string[]).concat(header ?? []).join(';'))![1]!}`;
    },
    post: (cookie, url, body) => send('POST', cookie, url, body),
    patch: (cookie, url, body) => send('PATCH', cookie, url, body),
  };
}

describe.each(ENGINE_NAMES)('T552 microchip único global (%s)', (name) => {
  const base = it.skipIf(name === 'PostgreSQL' && !HAS_POSTGRES);
  // Sin reintentos (H-O-004US3-5): las suites PG se serializan en vite.config.ts (grupo `threads` de una sola hebra) porque el candado asesor es de base.
  const run = (title: string, work: () => Promise<void>) => base(title, { timeout: 120_000 }, work);

  run('[SC-CAT-022][REQ-PET4-001] un duplicado propio y uno ajeno dan 409 con el mismo cuerpo byte a byte, por la misma ruta (un solo save, sin listByOwners) y sin datos del tercero en cuerpo ni logs', async () => {
    const http = await openHttp(name);
    const andres = await http.login('andres');
    const maria = await http.login('maria.v');
    const first = await http.post(andres, '/api/pets', { ...NEW_PET, microchipId: CHIP });
    expect(first.status).toBe(201);
    const petId = String(first.json['id']);

    http.calls.length = 0;
    const own = await http.post(andres, '/api/pets', { ...NEW_PET, name: 'Otra', microchipId: CHIP });
    const ownCalls = [...http.calls];
    http.calls.length = 0;
    const foreign = await http.post(maria, '/api/pets', { ...NEW_PET, name: 'Ajena', microchipId: CHIP });
    const foreignCalls = [...http.calls];

    expect([own.status, foreign.status]).toEqual([409, 409]);
    expect(own.json['code']).toBe('ERR-PET-MICROCHIP-DUPLICATE');
    expect(own.json['detail']).toBe(DETAIL);
    expect(own.json['field']).toBe('microchipId');
    expect(foreign.body).toBe(own.body);
    // Misma ruta de código: el INSERT es el único acceso a mascotas; no hay consulta previa por propietario.
    expect(ownCalls.filter((c) => c === 'save')).toHaveLength(1);
    expect(foreignCalls).toEqual(ownCalls);
    expect(ownCalls).not.toContain('listByOwners');

    const everything = [own.body, foreign.body, ...http.lines].join('\n');
    for (const leaked of [CHIP, 'Key (', ANDRES, MARIA, petId, 'pets_microchip_global', '23505', 'UNIQUE constraint']) expect(everything, leaked).not.toContain(leaked);
  });

  run('[SC-CAT-022][REQ-PET4-001] la edición también: otra cuenta no puede quedarse con el microchip (409 idéntico) y el titular puede guardar su mascota con su propio microchip', async () => {
    const http = await openHttp(name);
    const andres = await http.login('andres');
    const maria = await http.login('maria.v');
    const first = await http.post(andres, '/api/pets', { ...NEW_PET, microchipId: CHIP });
    const petId = String(first.json['id']);
    const own = await http.patch(andres, `/api/pets/${ARGOS.id}`, { microchipId: CHIP });
    const foreign = await http.patch(maria, `/api/pets/${LUNA.id}`, { microchipId: CHIP });
    const same = await http.patch(andres, `/api/pets/${petId}`, { microchipId: CHIP, name: 'Nube II' });
    expect([own.status, foreign.status, same.status]).toEqual([409, 409, 200]);
    // La ruta (`instance`) lleva el id de la mascota que se edita; el resto del cuerpo es idéntico.
    expect({ ...foreign.json, instance: null }).toEqual({ ...own.json, instance: null });
    expect(own.json['detail']).toBe(DETAIL);
    expect(await http.engine.read((r) => r.pets.findById(LUNA.id).then((p) => p?.microchipId))).toBeNull();
  });

  run('[SC-CAT-022] medición de tiempo INFORMATIVA (no bloqueante): propio vs ajeno; solo se registra', async () => {
    const http = await openHttp(name);
    const andres = await http.login('andres');
    const maria = await http.login('maria.v');
    await http.post(andres, '/api/pets', { ...NEW_PET, microchipId: CHIP });
    const medians: number[] = [];
    for (const cookie of [andres, maria]) {
      const samples: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        const started = performance.now();
        await http.post(cookie, '/api/pets', { ...NEW_PET, name: `Rep ${i}`, microchipId: CHIP });
        samples.push(performance.now() - started);
      }
      medians.push([...samples].sort((a, b) => a - b)[10]!);
    }
    expect(medians).toHaveLength(2);
  });

  run('[SC-CAT-022] una violación CHECK o de otra restricción lanzada por el motor real no se reporta como duplicado de microchip', async () => {
    const engine = await openEngine(name, validBackupState());
    disposers.push(engine.dispose);
    if (name === 'memoria') return; // sin esquema SQL: la clasificación de errores del driver se cubre en tests/unit/microchip-violation.spec.ts
    const insert = (id: string, owner: string, chip: string | null) =>
      name === 'SQLite'
        ? engine.rawQuery("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES (?, ?, '{}', ?)", [id, owner, chip])
        : engine.rawQuery("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES ($1, $2, '{}'::jsonb, $3)", [id, owner, chip]);
    const attempt = async (id: string, chip: string | null) => insert(id, ANDRES, chip).then(() => null, (e: unknown) => e);
    const check = await attempt('f0000000-0000-4000-8000-0000000000a1', 'no-es-un-chip');
    expect(check instanceof Error).toBe(true);
    expect(isMicrochipGlobalViolation(check)).toBe(false);
    const pk = await attempt(ARGOS.id, null);
    expect(pk instanceof Error).toBe(true);
    expect(isMicrochipGlobalViolation(pk)).toBe(false);
    expect(await attempt('f0000000-0000-4000-8000-0000000000a2', CHIP)).toBeNull();
    const duplicate = await insert('f0000000-0000-4000-8000-0000000000a3', MARIA, CHIP).then(() => null, (e: unknown) => e);
    expect(isMicrochipGlobalViolation(duplicate)).toBe(true);
  });

  run('[SC-CAT-024][REQ-IMP-001][EDGE-016] importar un respaldo cuyo microchip ya tiene OTRO usuario falla con ERR-PET-MICROCHIP-DUPLICATE (ROLLED_BACK), nombra la mascota propia del archivo y no modifica nada ni nombra al tercero', async () => {
    const state = validBackupState();
    state.pets = state.pets.map((p) => (p.id === LUNA.id ? { ...p, microchipId: CHIP } : p));
    const engine = await openEngine(name, state);
    disposers.push(engine.dispose);
    const exporter = new ExportBackupUseCase(engine.deps);
    const importer = new ImportBackupUseCase(engine.deps);
    const envelope = JSON.parse((await exporter.execute(ANDRES)).json) as { pets: Array<Record<string, unknown>> };
    envelope.pets[0]!['microchipId'] = CHIP;
    const file = JSON.stringify(envelope);
    const snapshot = async () => engine.read(async (r) => JSON.stringify([await r.pets.listByOwners([ANDRES]), await r.pets.listByOwners([MARIA])]));
    const before = await snapshot();
    const error = await failure(importer.execute(ANDRES, file, digestOf(file)));
    expect([error.code, error.status, error.field, error.finalState]).toEqual(['ERR-PET-MICROCHIP-DUPLICATE', 409, 'microchipId', 'ROLLED_BACK']);
    expect(error.detail).toContain('n.º 1');
    expect(error.detail).toContain(String(envelope.pets[0]!['name']));
    for (const leaked of [CHIP, LUNA.name, MARIA, LUNA.id]) expect(error.detail, leaked).not.toContain(leaked);
    expect(await snapshot()).toBe(before);
  });
});

describe('T553 esquema final en SQLite (SC-CAT-023)', () => {
  it('[SC-CAT-023][INV-PET4-001] pets_owner_microchip ya no existe y pets_microchip_global es único parcial sobre microchip_id; dos propietarios no pueden repetir el chip', async () => {
    const engine = await openEngine('SQLite', validBackupState());
    disposers.push(engine.dispose);
    const rows = (await engine.rawQuery("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN ('pets_owner_microchip', 'pets_microchip_global')")) ?? [];
    expect(rows.map((r) => r['name'])).toEqual(['pets_microchip_global']);
    expect(String(rows[0]!['sql']).replace(/\s+/g, ' ').toLowerCase()).toBe('create unique index pets_microchip_global on pets (microchip_id) where microchip_id is not null');
    await engine.rawQuery("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES ('f0000000-0000-4000-8000-0000000000b1', ?, '{}', ?)", [ANDRES, OTHER_CHIP]);
    const thrown = await engine.rawQuery("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES ('f0000000-0000-4000-8000-0000000000b2', ?, '{}', ?)", [MARIA, OTHER_CHIP]).then(() => null, (e: unknown) => e as Error);
    expect(thrown?.message).toBe('UNIQUE constraint failed: pets.microchip_id');
  });
});

describe('T553 migración con duplicados entre propietarios en SQLite (SC-CAT-025, EDGE-008)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('[SC-CAT-025] con el mismo microchip en dos propietarios la migración 0008 ABORTA con el conteo (sin microchips ni ids), deja el esquema intacto y no anota la versión', () => {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-t553-'));
    dirs.push(dir);
    const upTo0007 = join(dir, 'previas');
    mkdirSync(upTo0007);
    for (const file of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0008')) writeFileSync(join(upTo0007, file), readFileSync(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: upTo0007 });
    const insert = legacy.prepare("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES (?, ?, '{}', ?)");
    insert.run('f0000000-0000-4000-8000-0000000000c1', 'owner-a', CHIP);
    insert.run('f0000000-0000-4000-8000-0000000000c2', 'owner-b', CHIP);
    insert.run('f0000000-0000-4000-8000-0000000000c3', 'owner-a', OTHER_CHIP);
    insert.run('f0000000-0000-4000-8000-0000000000c4', 'owner-b', OTHER_CHIP);
    insert.run('f0000000-0000-4000-8000-0000000000c5', 'owner-a', null);
    insert.run('f0000000-0000-4000-8000-0000000000c6', 'owner-b', null);
    legacy.close();
    let message = '';
    try {
      openSqliteDatabase(path);
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('2 grupo(s)');
    expect(message).toContain('0008');
    for (const leaked of [CHIP, OTHER_CHIP, 'owner-a', 'owner-b', 'f0000000']) expect(message, leaked).not.toContain(leaked);
    const after = openSqliteDatabase(path, { migrationsDir: upTo0007 });
    const names = after.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'pets_%microchip%' ORDER BY name").pluck().all();
    expect(names).toEqual(['pets_owner_microchip']);
    expect(after.prepare("SELECT count(*) FROM schema_migrations WHERE version LIKE '0008%'").pluck().get()).toBe(0);
    after.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T553 Postgres real 0004_pets_microchip_global (requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const { randomUUID } = await import('node:crypto');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t553_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of ['0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql']) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const insertPet = (client: import('pg').Client, id: string, owner: string, chip: string | null) =>
    client.query("INSERT INTO pets (id, owner_user_id, data, microchip_id) VALUES ($1, $2, '{}'::jsonb, $3)", [id, owner, chip]);

  it('[SC-CAT-023][INV-PET4-001] sin duplicados: pets_owner_microchip desaparece, pets_microchip_global es único parcial y dos propietarios no pueden repetir el chip (23505 con esa restricción)', async () => {
    await withSchema(async (client) => {
      await client.query(readFileSync(new URL('0004_pets_microchip_global.sql', PG_DIR), 'utf8'));
      const rows = (await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('pets_owner_microchip', 'pets_microchip_global')")).rows;
      expect(rows.map((r) => r['indexname'])).toEqual(['pets_microchip_global']);
      expect(String(rows[0]!['indexdef']).replace(/\s+/g, ' ')).toContain('CREATE UNIQUE INDEX pets_microchip_global ON');
      expect(String(rows[0]!['indexdef'])).toContain('(microchip_id)');
      expect(String(rows[0]!['indexdef'])).toContain('WHERE (microchip_id IS NOT NULL)');
      await insertPet(client, 'f0000000-0000-4000-8000-0000000000d1', 'owner-a', CHIP);
      const thrown = await insertPet(client, 'f0000000-0000-4000-8000-0000000000d2', 'owner-b', CHIP).then(() => null, (e: unknown) => e as { code?: string; constraint?: string });
      expect([thrown?.code, thrown?.constraint]).toEqual(['23505', 'pets_microchip_global']);
      expect(isMicrochipGlobalViolation(thrown)).toBe(true);
    });
  });

  it('[SC-CAT-025][EDGE-008] con el mismo microchip en dos propietarios aborta con el conteo, sin microchips ni ids, y deja pets_owner_microchip', async () => {
    await withSchema(async (client) => {
      await insertPet(client, 'f0000000-0000-4000-8000-0000000000e1', 'owner-a', CHIP);
      await insertPet(client, 'f0000000-0000-4000-8000-0000000000e2', 'owner-b', CHIP);
      await insertPet(client, 'f0000000-0000-4000-8000-0000000000e3', 'owner-a', OTHER_CHIP);
      await insertPet(client, 'f0000000-0000-4000-8000-0000000000e4', 'owner-b', OTHER_CHIP);
      let message = '';
      try {
        await client.query(readFileSync(new URL('0004_pets_microchip_global.sql', PG_DIR), 'utf8'));
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).toContain('2 grupo(s)');
      expect(message).toContain('0004 abortada');
      for (const leaked of [CHIP, OTHER_CHIP, 'owner-a', 'owner-b', 'f0000000']) expect(message, leaked).not.toContain(leaked);
      const names = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'pets_%microchip%' ORDER BY indexname")).rows.map((r) => r['indexname']);
      expect(names).toEqual(['pets_owner_microchip']);
    });
  });
});
