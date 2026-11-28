/**
 * T1693 (Feature 012, Bloque E, #81; PRUEBAS ROJAS hasta T1695; `/keymaker`): paridad de motores del alcance `PETS` (escenario (h), SC-012-061): memoria, SQLite y PostgreSQL 17 (se OMITE sin
 * `TEST_DATABASE_URL`; en esta máquina no hay PostgreSQL real) producen la MISMA secuencia observable: creación, lectura pública, retirada, tope y revocación por el disparador de desasignación.
 * La API supuesta de los casos de uso es la de `tests/fixtures/share-pets-012.ts` (`share-pets-use-cases.ts`, T1695).
 *
 * @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-007, SC-012-061
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SharedAccessLimiter } from '../../../src/application/sharing/shared-access-limiter.ts';
import { UnassignPetFromHouseholdUseCase } from '../../../src/application/use-cases/assignment-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ANDRES, ENGINE_FACTORIES, codeOf, type Engine012 } from '../../fixtures/co-ownership-012.ts';
import { SHARE_IP_SECRET, SequentialShareTokenGenerator } from '../../fixtures/share-harness.ts';
import { H, KEY, P_ARGOS, P_KIRA, P_NYX, loadModule } from '../../fixtures/share-pets-012.ts';

interface PetsModule {
  CreatePetsShareLinkUseCase: new (deps: ApplicationDeps) => { execute(userId: string, householdId: string, key: string, body: unknown): Promise<{ link: { id: string; petIds: string[]; petCount: number }; url: string }> };
  WithdrawPetFromShareLinkUseCase: new (deps: ApplicationDeps) => { execute(userId: string, shareLinkId: string, petId: string): Promise<unknown> };
  ListHouseholdPetsShareLinksUseCase: new (deps: ApplicationDeps) => { execute(userId: string, householdId: string): Promise<{ items: Array<{ id: string; petCount: number; status: string }>; activeCount: number }> };
}
const MODULE = 'src/application/use-cases/share-pets-use-cases.ts';

let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

const sharingDeps = (e: Engine012): ApplicationDeps =>
  e.sharing ? e.deps : ({ ...e.deps, sharing: { tokens: new SequentialShareTokenGenerator('par'), ipHmacSecret: SHARE_IP_SECRET, limiter: new SharedAccessLimiter(), petsCreateEnabled: true } } as ApplicationDeps);

/** Secuencia observable normalizada (sin ids ni tokens): lo que debe ser idéntico en todos los motores. */
async function scenario(e: Engine012): Promise<unknown[]> {
  const deps = sharingDeps(e);
  const mod = await loadModule<PetsModule>(MODULE);
  const out: unknown[] = [];
  const created = await new mod.CreatePetsShareLinkUseCase(deps).execute(ANDRES, H, KEY(1), { petIds: [P_KIRA, P_ARGOS] });
  out.push(['create', created.link.petCount, [...created.link.petIds].sort()]);
  const token = created.url.split('/shared/')[1]!;
  const summary = (await new GetSharedSummaryUseCase(deps).execute(token, '203.0.113.9')) as unknown as { summary: { scope: string; pets: unknown[] } };
  out.push(['summary', summary.summary.scope, summary.summary.pets.length]);
  out.push(['replay', await codeOf(new mod.CreatePetsShareLinkUseCase(deps).execute(ANDRES, H, KEY(1), { petIds: [P_ARGOS, P_KIRA] }))]);
  out.push(['foreign', await codeOf(new mod.CreatePetsShareLinkUseCase(deps).execute(ANDRES, H, KEY(2), { petIds: ['11111111-1111-4111-8111-1111111119ff'] }))]);
  out.push(['withdraw', await codeOf(new mod.WithdrawPetFromShareLinkUseCase(deps).execute(ANDRES, created.link.id, P_KIRA)), await codeOf(new mod.WithdrawPetFromShareLinkUseCase(deps).execute(ANDRES, created.link.id, P_KIRA))]);
  const second = await new mod.CreatePetsShareLinkUseCase(deps).execute(ANDRES, H, KEY(3), { petIds: [P_NYX, P_ARGOS] });
  await new UnassignPetFromHouseholdUseCase(deps).execute(ANDRES, P_NYX, H);
  const list = await new mod.ListHouseholdPetsShareLinksUseCase(deps).execute(ANDRES, H);
  out.push(['after-unassign', list.items.map((i) => [i.petCount, i.status]).sort(), list.activeCount, second.link.petCount]);
  return out;
}

describe('T1693 paridad de motores del alcance PETS (escenario (h), SC-012-061)', () => {
  const results = new Map<string, unknown[]>();
  for (const factory of ENGINE_FACTORIES) {
    it.skipIf(!factory.enabled)(`[SC-012-061] ${factory.name}: la secuencia de creación, lectura, retirada, tope y revocación por desasignación es la esperada`, async () => {
      engine = await factory.make();
      const observed = await scenario(engine);
      results.set(factory.name, observed);
      expect(observed).toEqual([
        ['create', 2, [P_ARGOS, P_KIRA].sort()],
        ['summary', 'PETS', 2],
        ['replay', 'OK'],
        ['foreign', 'ERR-VET12-PETS-EMPTY'],
        ['withdraw', 'OK', 'ERR-SHARE-NOT-FOUND'],
        ['after-unassign', [[1, 'ACTIVE'], [1, 'REVOKED']].sort(), 1, 2],
      ]);
    });
  }

  it('[SC-012-061] todos los motores habilitados producen exactamente la misma secuencia observable', () => {
    const all = [...results.values()];
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const other of all.slice(1)) expect(other).toEqual(all[0]);
  });
});
