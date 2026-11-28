/**
 * T1693 (Feature 012, Bloque E, #81; PRUEBAS ROJAS hasta T1695; `/keymaker`): carreras del alcance `PETS` en memoria (serial), SQLite con DOS conexiones (`BEGIN IMMEDIATE`) y PostgreSQL con DOS sesiones
 * (se OMITE sin `TEST_DATABASE_URL`: en esta máquina no hay PostgreSQL real y Neo o `/link` deben correrlas con una base 17, annex §9 (p)). Cada prueba exige el INVARIANTE, no un orden: nunca un `PETS` activo con cero filas, nunca un `PETS` activo con una
 * mascota que ya no está asignada al hogar ni con un creador sin rol de hogar, y sin interbloqueo (escenarios (l) y (p); EDGE-012-071, EDGE-012-073 y EDGE-012-075; annex §6).
 *
 * La API supuesta es la de `tests/fixtures/share-pets-012.ts`: `CreatePetsShareLinkUseCase.execute(userId, householdId, idempotencyKey, body)` y
 * `WithdrawPetFromShareLinkUseCase.execute(userId, shareLinkId, petId)` de `src/application/use-cases/share-pets-use-cases.ts` (T1695).
 *
 * @implements REQ-VET12-006, REQ-VET12-007, INV-VET12-003, EDGE-012-071, EDGE-012-073, EDGE-012-075
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { SharedAccessLimiter } from '../../../src/application/sharing/shared-access-limiter.ts';
import { isHouseholdManager } from '../../../src/application/sharing/share-access.ts';
import { ChangeMemberRoleUseCase, RemoveMemberUseCase } from '../../../src/application/use-cases/household-use-cases.ts';
import { UnassignPetFromHouseholdUseCase } from '../../../src/application/use-cases/assignment-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ANDRES, MARIA, RACE_FACTORIES, codeOf, type RaceEngine } from '../../fixtures/co-ownership-012.ts';
import { SHARE_IP_SECRET, SequentialShareTokenGenerator } from '../../fixtures/share-harness.ts';
import { H, KEY, P_ARGOS, P_KIRA, loadModule } from '../../fixtures/share-pets-012.ts';

interface PetsModule {
  CreatePetsShareLinkUseCase: new (deps: ApplicationDeps) => { execute(userId: string, householdId: string, key: string, body: unknown): Promise<unknown> };
  WithdrawPetFromShareLinkUseCase: new (deps: ApplicationDeps) => { execute(userId: string, shareLinkId: string, petId: string): Promise<unknown> };
}
const MODULE = 'src/application/use-cases/share-pets-use-cases.ts';

let engine: RaceEngine | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

/** Dependencias con el servicio de enlaces conectado y la bandera ON (los motores de carreras no lo traen); un prefijo de token por cliente. */
const withSharing = (deps: ApplicationDeps, prefix: string): ApplicationDeps =>
  ({ ...deps, sharing: { tokens: new SequentialShareTokenGenerator(prefix), ipHmacSecret: SHARE_IP_SECRET, limiter: new SharedAccessLimiter(), petsCreateEnabled: true } }) as ApplicationDeps;
const run = <T>(race: RaceEngine, work: (r: RepositorySet) => Promise<T>): Promise<T> => race.a.uow.runInTransaction(work);

/** Invariantes de §5.5/§6 sobre TODOS los enlaces PETS del hogar tras la carrera. */
async function assertPetsInvariants(race: RaceEngine): Promise<void> {
  await run(race, async (r) => {
    const links = (await r.shareLinks.listAll()).filter((l) => (l.scope as string) === 'PETS');
    const assigned = new Set((await r.assignments.listByHousehold(H)).map((a) => a.petId));
    const members = await r.households.listMembershipsOfUsers([...new Set(links.map((l) => l.createdByUserId))]);
    for (const link of links.filter((l) => l.revokedAt === null)) {
      const rows = await (r as unknown as { shareLinkPets: { listPetIds(id: string): Promise<string[]> } }).shareLinkPets.listPetIds(link.id);
      expect(rows.length, 'un PETS activo no puede tener cero filas').toBeGreaterThan(0);
      for (const petId of rows) expect(assigned.has(petId), 'un PETS activo no puede contener una mascota desasignada').toBe(true);
      const manager = isHouseholdManager(members.filter((m) => m.userId === link.createdByUserId), H);
      expect(manager, 'un PETS activo no puede tener un creador sin rol de hogar').toBe(true);
    }
  });
}

for (const factory of RACE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1693 carreras del alcance PETS (${factory.name})`, { timeout: 90_000 }, () => {
    it('[EDGE-012-071][LK-02] dos retiradas simultáneas de las dos últimas mascotas se serializan: el enlace queda REVOKED, al menos un 204 y el resto 404, sin PETS activo con cero filas', async () => {
      engine = await factory.make();
      const race = engine;
      const mod = await loadModule<PetsModule>(MODULE);
      const created = (await new mod.CreatePetsShareLinkUseCase(withSharing(race.a, 'a')).execute(ANDRES, H, KEY(1), { petIds: [P_ARGOS, P_KIRA] })) as { link: { id: string } };
      const first = new mod.WithdrawPetFromShareLinkUseCase(withSharing(race.a, 'a')).execute(ANDRES, created.link.id, P_ARGOS);
      const second = race.b((deps) => new mod.WithdrawPetFromShareLinkUseCase(withSharing(deps, 'b')).execute(ANDRES, created.link.id, P_KIRA));
      const outcomes = await Promise.all([codeOf(first), codeOf(second)]);
      expect(outcomes.filter((o) => o === 'OK').length).toBeGreaterThanOrEqual(1);
      expect(outcomes.every((o) => o === 'OK' || o === 'ERR-SHARE-NOT-FOUND')).toBe(true);
      expect((await run(race, (r) => r.shareLinks.findById(created.link.id)))!.revokedAt).toMatch(/^2026-/);
      await assertPetsInvariants(race);
    });

    it('[EDGE-012-073][LK-04] la creación de un PETS frente a la desasignación de una mascota del cuerpo: o 422 ERR-VET12-PETS-EMPTY o un enlace válido que el hook revoca; nunca un activo con la mascota desasignada', async () => {
      engine = await factory.make();
      const race = engine;
      const mod = await loadModule<PetsModule>(MODULE);
      const creating = new mod.CreatePetsShareLinkUseCase(withSharing(race.a, 'a')).execute(ANDRES, H, KEY(1), { petIds: [P_ARGOS, P_KIRA] });
      const unassigning = race.b((deps) => new UnassignPetFromHouseholdUseCase(deps).execute(ANDRES, P_KIRA, H));
      const [created, unassigned] = await Promise.all([codeOf(creating), codeOf(unassigning)]);
      expect(unassigned).toBe('OK');
      expect(['OK', 'ERR-VET12-PETS-EMPTY']).toContain(created);
      await assertPetsInvariants(race);
    });

    it.each<[string, (deps: ApplicationDeps) => Promise<unknown>]>([
      ['degradación a READER', (deps: ApplicationDeps) => new ChangeMemberRoleUseCase(deps).execute(ANDRES, H, { userId: MARIA, role: 'READER' })],
      ['REMOVED', (deps: ApplicationDeps) => new RemoveMemberUseCase(deps).execute(ANDRES, H, MARIA)],
    ])('[EDGE-012-075][N-01] la creación de un PETS por un ADMIN frente a su %s: sin interbloqueo; o la creación da 403 o el enlace creado queda REVOKED; nunca un PETS activo de un creador sin rol', async (_name, disable) => {
      engine = await factory.make();
      const race = engine;
      const mod = await loadModule<PetsModule>(MODULE);
      await new ChangeMemberRoleUseCase(race.a).execute(ANDRES, H, { userId: MARIA, role: 'ADMIN' });
      const creating = new mod.CreatePetsShareLinkUseCase(withSharing(race.a, 'a')).execute(MARIA, H, KEY(1), { petIds: [(await run(race, (r) => r.pets.listByOwners([MARIA])))[0]!.id] });
      const disabling = race.b((deps) => disable(deps));
      const [created, disabled] = await Promise.all([codeOf(creating), codeOf(disabling)]);
      expect(disabled).toBe('OK');
      expect(['OK', 'ERR-ACC-FORBIDDEN']).toContain(created);
      await assertPetsInvariants(race);
    });
  });
}
