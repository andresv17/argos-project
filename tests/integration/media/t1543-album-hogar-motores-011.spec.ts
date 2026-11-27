/**
 * T1543 [US7, Bloque G, #62] álbum del hogar sobre los motores (Memoria, SQLite y PostgreSQL real, este último se OMITE sin TEST_DATABASE_URL): la composición de la interfaz
 * (`loadHouseholdAlbum`) corre sobre los casos de uso REALES de 004 (`ListMediaUseCase`) y de las mascotas del hogar (`GetHouseholdPetsUseCase`), así que el filtro de
 * visibilidad vive dentro de la consulta por mascota (REQ-RBAC-001), no después de un límite. Cubre: solo PHOTO (PDF y FILE fuera), mascota de otro miembro, miembro
 * INVITED sin acceso, mascota en dos hogares (EDGE-011-006: aparece en ambos y al borrar desaparece de ambos), salida de la mascota del hogar, 24 por mascota y borrado entre páginas.
 *
 * @implements REQ-ALB11-001, REQ-ALB11-002, REQ-ALB11-003, SC-011-045, SC-011-046, SC-011-047, SC-011-048, SC-011-050, SC-011-051, SC-011-052, EDGE-011-006, EDGE-011-017, REQ-RBAC-001
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetMediaRecord, RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { GetHouseholdPetsUseCase } from '../../../src/application/use-cases/household-use-cases.ts';
import { ListMediaUseCase } from '../../../src/application/use-cases/media-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { hasMorePhotos, loadHouseholdAlbum, loadMorePhotos, type AlbumListApi } from '../../../src/presentation/web/household-album.ts';
import { MediaApiError, type MediaKind, type MediaPage } from '../../../src/presentation/web/media-api.ts';
import { ANDRES, ARGOS, CARLOS, HOUSEHOLD, LUCIA, MARIA, MEMBERSHIPS } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const LUNA_ID = '11111111-1111-4111-8111-111111111201';
const HOME2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
const media = (petId: string, n: number, kind: 'PHOTO' | 'FILE' = 'PHOTO'): PetMediaRecord => ({
  id: `f0000000-0000-4000-8000-${petId.slice(-4)}${String(n).padStart(8, '0')}`,
  petId,
  kind,
  mime: kind === 'PHOTO' ? 'image/png' : 'application/pdf',
  sizeBytes: 1,
  originalName: `${kind === 'PHOTO' ? 'f' : 'doc'}${n}.${kind === 'PHOTO' ? 'png' : 'pdf'}`,
  createdAt: `2026-11-05T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
});

interface Surface {
  readonly name: string;
  readonly deps: ApplicationDeps;
  readonly uow: UnitOfWorkPort;
}

/** Misma conexión de la interfaz: el cliente pide `list` por mascota con la identidad del usuario; el caso de uso responde igual que la ruta HTTP (404/403 -> MediaApiError). */
function apiFor(deps: ApplicationDeps, userId: string): AlbumListApi {
  return {
    async list(petId: string, kind: MediaKind | undefined, page: number): Promise<MediaPage> {
      try {
        return (await new ListMediaUseCase(deps).execute(userId, petId, { ...(kind === undefined ? {} : { kind }), page })) as unknown as MediaPage;
      } catch (error) {
        const code = (error as { code?: string }).code ?? 'ERR-INTERNAL-UNEXPECTED';
        throw new MediaApiError(code, code === 'ERR-ACC-FORBIDDEN' ? 403 : code === 'ERR-PET-NOT-FOUND' ? 404 : 500);
      }
    },
  };
}
const petsOf = async (deps: ApplicationDeps, userId: string, householdId: string) =>
  (await new GetHouseholdPetsUseCase(deps).execute(userId, householdId)).pets.map((p) => ({ id: p.profile.id, name: p.profile.name }));
/** El hogar canónico tiene más mascotas de Andrés (sin fotos): el escenario se centra en Argos y Luna. */
const FOCUS = new Set(['Argos', 'Luna']);
const albumOf = async (s: Surface, userId: string, householdId = HOUSEHOLD.id) =>
  (await loadHouseholdAlbum(apiFor(s.deps, userId), await petsOf(s.deps, userId, householdId))).filter((g) => FOCUS.has(g.petName));
const seed = (s: Surface, rows: readonly PetMediaRecord[]) => s.uow.runInTransaction(async (r: RepositorySet) => { for (const row of rows) await r.media.insert(row); });

async function scenario(s: Surface): Promise<void> {
  await seed(s, [media(ARGOS.id, 1), media(ARGOS.id, 2), media(ARGOS.id, 3, 'FILE'), media(LUNA_ID, 1), media(LUNA_ID, 2), media(LUNA_ID, 4, 'FILE')]);

  // SC-011-045: solo PHOTO, por mascota alfabético (Argos antes que Luna), recientes primero.
  const andres = await albumOf(s, ANDRES);
  expect(andres.map((g) => g.petName)).toEqual(['Argos', 'Luna']);
  expect(andres.map((g) => g.items.map((i) => i.kind))).toEqual([['PHOTO', 'PHOTO'], ['PHOTO', 'PHOTO']]);
  expect(andres[0]!.items.map((i) => i.id)).toEqual([media(ARGOS.id, 2).id, media(ARGOS.id, 1).id]);

  // SC-011-046 / REQ-ALB11-002: miembro activo ve el álbum; INVITED (Carlos) y ajeno (Lucía) no ven ninguna mascota.
  expect((await albumOf(s, MARIA)).map((g) => g.petName)).toEqual(['Argos', 'Luna']);
  expect(await albumOf(s, CARLOS).catch((e: { code?: string }) => e.code ?? 'ERR')).not.toEqual(expect.arrayContaining([expect.objectContaining({ petName: 'Argos' })]));
  const lucia = apiFor(s.deps, LUCIA);
  expect(await loadHouseholdAlbum(lucia, [{ id: ARGOS.id, name: 'Argos' }, { id: LUNA_ID, name: 'Luna' }])).toEqual([]);

  // EDGE-011-006: Luna también en un segundo hogar de Lucía; aparece en ambos y al borrar su foto desaparece de ambos.
  await s.uow.runInTransaction(async (r: RepositorySet) => {
    await r.households.insert({ ...HOUSEHOLD, id: HOME2, name: 'Otra casa', ownerUserId: LUCIA });
    const base = MEMBERSHIPS[1]!;
    await r.households.saveMembership({ ...base, membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc09', householdId: HOME2, userId: LUCIA, role: 'READER', status: 'ACTIVE' });
    await r.households.saveMembership({ ...base, membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc08', householdId: HOME2, userId: MARIA, role: 'ADMIN', status: 'ACTIVE' });
    await r.assignments.save({ petId: LUNA_ID, householdId: HOME2, assignedByUserId: MARIA, assignedAt: '2026-11-05T09:00:00.000Z' });
  });
  const second = await albumOf(s, LUCIA, HOME2);
  expect(second.map((g) => [g.petName, g.items.length])).toEqual([['Luna', 2]]);
  await s.uow.runInTransaction((r: RepositorySet) => r.media.remove(LUNA_ID, media(LUNA_ID, 2).id));
  expect((await albumOf(s, LUCIA, HOME2))[0]!.items.map((i) => i.id)).toEqual([media(LUNA_ID, 1).id]);
  expect((await albumOf(s, MARIA))[1]!.items.map((i) => i.id)).toEqual([media(LUNA_ID, 1).id]);

  // SC-011-050: la salida de la mascota del hogar la retira del álbum de ese hogar y no del otro.
  await s.uow.runInTransaction((r: RepositorySet) => r.assignments.remove(LUNA_ID, HOUSEHOLD.id));
  expect((await albumOf(s, ANDRES)).map((g) => g.petName)).toEqual(['Argos']);
  expect((await albumOf(s, LUCIA, HOME2)).map((g) => g.petName)).toEqual(['Luna']);

  // SC-011-048 / EDGE-011-017: 30 fotos de Argos -> 24 + 6; borrar una ya cargada entre páginas no salta ni repite.
  await seed(s, Array.from({ length: 28 }, (_, i) => media(ARGOS.id, 10 + i)));
  let group = (await albumOf(s, ANDRES))[0]!;
  expect([group.items.length, group.total, hasMorePhotos(group)]).toEqual([24, 30, true]);
  await s.uow.runInTransaction((r: RepositorySet) => r.media.remove(ARGOS.id, group.items[2]!.id));
  group = await loadMorePhotos(apiFor(s.deps, ANDRES), group);
  const ids = group.items.map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(group.total).toBe(29);
  expect(hasMorePhotos(group)).toBe(false);
  expect(ids).toHaveLength(29);
}

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));

describe('T1543 álbum del hogar sobre Memoria y SQLite', () => {
  it('[SC-011-045..052][EDGE-011-006][EDGE-011-017] escenario completo en cada motor', async () => {
    for (const engine of await createMediaEngines(null, {})) {
      open.push(engine);
      await scenario({ name: engine.name, deps: engine.deps, uow: { runInTransaction: engine.run } });
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1543 álbum del hogar sobre PostgreSQL 17 real (SE OMITE: falta TEST_DATABASE_URL)', () => {
  it('[SC-011-045..052][EDGE-011-006][EDGE-011-017] mismo escenario', async () => {
    const engine = await createPostgresConcurrentEngine();
    try {
      await scenario({ name: engine.name, deps: engine.depsA(), uow: engine.uowA });
    } finally {
      await engine.dispose();
    }
  });
});
