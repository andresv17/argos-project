/**
 * T813 (N2-06 (c), 006): `countBytesOfOwner` suma `pet_media` + `household_photos` de los hogares que el usuario posee, en las implementaciones del puerto
 * (memoria, SQLite, SQL de PostgreSQL con doble del cliente); la escena no cuenta, la foto del hogar sí (ERR-MEDIA-QUOTA-EXCEEDED)
 * (REQ-ESC6-001, REQ-ESC6-018; INV-ESC6-009; EDGE-ESC6-013; SC-ESC6-019, SC-ESC6-028, SC-ESC6-064; REQ-ARC-005).
 * SQLite necesita la tabla `household_photos` (T832) y la memoria el campo `householdPhotos` (T828): estas pruebas quedan en rojo hasta que T833 cierre la
 * Fase 4 y T814 amplíe los cuatro `countBytesOfOwner`. Orden previsto por tasks.md (T814 depende de T833).
 * No cubierto aquí: PostgreSQL vivo (TEST_DATABASE_URL), que cubre el esquema de T833 en `schema-parity`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { UploadMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { ANDRES, ARGOS, MARIA, PDF, codeOf, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';
import { HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { expectParametrized, fakeClient } from '../../fixtures/pg-fake-client.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
const OBJ = (n: number) => `f0000000-0000-4000-8000-0000000e0e0${n}`;
const OTHER_HOUSEHOLD_OWNED_BY_MARIA = 'f0000000-0000-4000-8000-0000000e0f01';
const upload = (e: MediaEngine, bytes: Uint8Array) => new UploadMediaUseCase(e.deps).execute(ANDRES, ARGOS.id, { kind: 'FILE', filename: 'a', bytes });
const countOf = (e: MediaEngine, userId: string) => e.run((r) => r.media.countBytesOfOwner(userId));

describe('T813 countBytesOfOwner suma pet_media y household_photos (memoria y SQLite)', () => {
  it('[REQ-ESC6-018][SC-ESC6-028] la foto del hogar del propietario suma a los bytes de sus mascotas; la de otro propietario no', async () => {
    for (const e of await createMediaEngines(null)) {
      open.push(e);
      await upload(e, PDF(1000));
      expect(await countOf(e, ANDRES), `${e.name} antes`).toBe(1000);
      e.seedHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: OBJ(1), sizeBytes: 4000, uploadedByUserId: ANDRES });
      expect(await countOf(e, ANDRES), `${e.name} propietario del hogar`).toBe(5000);
      expect(await countOf(e, MARIA), `${e.name} miembro no propietario`).toBe(0);
    }
  });

  it('[REQ-ESC6-001][EDGE-ESC6-013] la foto la sube cualquier administrador pero cuenta al propietario del hogar, no a quien la subió', async () => {
    for (const e of await createMediaEngines(null)) {
      open.push(e);
      e.seedHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: OBJ(2), sizeBytes: 700, uploadedByUserId: MARIA });
      expect([await countOf(e, ANDRES), await countOf(e, MARIA)], e.name).toEqual([700, 0]);
    }
  });

  it('[SC-ESC6-019] sin foto de hogar el conteo es el de 004 (solo pet_media) y un usuario inexistente cuenta 0', async () => {
    for (const e of await createMediaEngines(null)) {
      open.push(e);
      await upload(e, PDF(321));
      expect([await countOf(e, ANDRES), await countOf(e, 'f0000000-0000-4000-8000-0000000000ff')], e.name).toEqual([321, 0]);
    }
  });

  it('[SC-ESC6-064] la subida de un archivo se rechaza con ERR-MEDIA-QUOTA-EXCEEDED cuando la foto del hogar agota la cuota; en el límite exacto pasa', async () => {
    for (const e of await createMediaEngines(null, { limits: { maxBytesPerOwner: 5000 } })) {
      open.push(e);
      e.seedHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: OBJ(3), sizeBytes: 4000, uploadedByUserId: ANDRES });
      expect(await codeOf(upload(e, PDF(1001))), `${e.name} 4000 + 1001 > 5000`).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
      expect(await codeOf(upload(e, PDF(1000))), `${e.name} 4000 + 1000 = 5000`).toBe('OK');
      expect(await countOf(e, ANDRES)).toBe(5000);
    }
  });

  it('[SC-ESC6-028] los hogares de otro propietario no suman aunque el usuario sea miembro (el propietario del hogar es households.owner_user_id)', async () => {
    for (const e of await createMediaEngines(null)) {
      open.push(e);
      await e.run(async (r) => {
        await r.households.insert({ ...HOUSEHOLD, id: OTHER_HOUSEHOLD_OWNED_BY_MARIA, ownerUserId: MARIA });
      });
      e.seedHouseholdPhoto({ householdId: OTHER_HOUSEHOLD_OWNED_BY_MARIA, objectId: OBJ(4), sizeBytes: 9000, uploadedByUserId: MARIA });
      expect([await countOf(e, ANDRES), await countOf(e, MARIA)], e.name).toEqual([0, 9000]);
    }
  });
});

describe('T813 countBytesOfOwner en el SQL de PostgreSQL (doble del cliente; REQ-PG-002)', () => {
  it('[REQ-ESC6-018] una sola consulta parametrizada suma pet_media y household_photos por propietario y no toca las tablas de la escena', async () => {
    const client = fakeClient({ rows: [{ n: '5000' }] });
    const repositories = createPostgresRepositories(client);
    expect(await repositories.media.countBytesOfOwner(ANDRES)).toBe(5000);
    expect(client.calls).toHaveLength(1);
    const { sql, values } = client.calls[0]!;
    expect(values).toEqual([ANDRES]);
    expect(sql).toMatch(/\bpet_media\b/);
    expect(sql).toMatch(/\bhousehold_photos\b/);
    expect(sql).toMatch(/\bhouseholds\b[\s\S]*owner_user_id\s*=\s*\$1/);
    expect(sql).not.toMatch(/\bhome_scenes\b|\bscene_/);
    expectParametrized(client.calls);
  });
});
