/**
 * T1026 (007, REQ-FAL7-008, REQ-FAL7-010, SC-007-016) cableado de extremo a extremo del opt-in `includeDeceasedAt` sobre memoria y SQLite:
 * la creacion del enlace de 005 lo persiste (false por omision), `ShareLinkView` y `SharedSummaryView` lo reflejan (`deceasedAtIncluded`),
 * `deceasedAt` solo viaja con el opt-in, la opcion es inmutable y la vista previa respeta la consulta. Contrato: share-link 1.1.0, openapi 3.4.0, clinical-summary 1.1.0.
 * @implements REQ-FAL7-008, REQ-FAL7-010, SC-007-016
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { PetProfile } from '../../../src/domain/pet/pet-invariants.ts';
import type { ShareScopeRef } from '../../../src/application/sharing/share-access.ts';
import { CreateShareLinkUseCase, ListShareLinksUseCase } from '../../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase, PreviewClinicalSummaryUseCase } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import { validateCreateShareLinkResult, validateShareLinkList, validateSharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ANDRES, ARGOS, KEY, codeOf, createShareEngines, type ShareEngine } from '../../fixtures/share-harness.ts';

const NOW = '2026-11-18T12:00:00.000Z';
const DEATH = '2026-06-10';
const PET_REF: ShareScopeRef = { scope: 'PET', petId: ARGOS.id };
const IP = '203.0.113.7';

let engines: ShareEngine[] = [];
afterEach(() => {
  for (const e of engines) e.close();
  engines = [];
});

/** Ejecuta la prueba en memoria y en SQLite con Argos fallecido. */
async function eachEngine(test: (e: ShareEngine) => Promise<void>): Promise<void> {
  engines = await createShareEngines(null);
  for (const e of engines) {
    e.setNow(NOW);
    await e.run(async (r) => {
      const pet = await r.pets.findById(ARGOS.id);
      await r.pets.save({ ...pet!, lifeStatus: 'DECEASED', deceasedAt: DEATH } as PetProfile);
    });
    await test(e);
  }
}

const create = (e: ShareEngine, n: number, body: unknown) => new CreateShareLinkUseCase(e.deps).execute(ANDRES, PET_REF, KEY(n), body);
const summary = (e: ShareEngine, token: string) => new GetSharedSummaryUseCase(e.deps).execute(token, IP);
async function created(e: ShareEngine, n: number, body: unknown) {
  const r = await create(e, n, body);
  if (r.kind !== 'CREATED') throw new Error('se esperaba un enlace nuevo');
  return r;
}

describe('T1026 opt-in includeDeceasedAt en el enlace veterinario (SC-007-016)', () => {
  it('[SC-007-016][REQ-FAL7-008] por omision el enlace NO publica deceasedAt: la vista lleva lifeStatus DECEASED, sin fecha y sin deceasedAtIncluded', async () => {
    await eachEngine(async (e) => {
      const r = await created(e, 1, {});
      expect(r.link.includeDeceasedAt).toBe(false);
      expect(validateCreateShareLinkResult({ link: r.link, url: `https://argos.example/shared/${r.token}` })).toBe(true);
      const view = await summary(e, r.token);
      expect(validateSharedSummaryView(view)).toBe(true);
      expect(view.summary.pets[0]!.profile.lifeStatus).toBe('DECEASED');
      expect('deceasedAt' in view.summary.pets[0]!.profile).toBe(false);
      expect('deceasedAtIncluded' in view.summary.disclosure).toBe(false);
      // EDGE-007-027: sin opt-in no viaja age.totalDays (birthDate + totalDays revelaria la fecha exacta); years y months si.
      expect('totalDays' in view.summary.pets[0]!.profile.age).toBe(false);
      expect(typeof view.summary.pets[0]!.profile.age.years).toBe('number');
      expect(JSON.stringify(view)).not.toContain(DEATH);
    });
  });

  it('[SC-007-016][REQ-FAL7-008] includeDeceasedAt false explicito equivale a la omision', async () => {
    await eachEngine(async (e) => {
      const r = await created(e, 1, { includeDeceasedAt: false });
      expect(r.link.includeDeceasedAt).toBe(false);
      expect(JSON.stringify(await summary(e, r.token))).not.toContain(DEATH);
    });
  });

  it('[SC-007-016][REQ-FAL7-008] con includeDeceasedAt true la fila lo persiste, la lista lo muestra y la vista publica trae deceasedAt y deceasedAtIncluded true', async () => {
    await eachEngine(async (e) => {
      const r = await created(e, 1, { includeDeceasedAt: true });
      expect(r.link.includeDeceasedAt).toBe(true);
      expect((await e.rows())[0]!.includeDeceasedAt).toBe(true);
      const listed = await new ListShareLinksUseCase(e.deps).execute(ANDRES, PET_REF);
      expect(validateShareLinkList(listed)).toBe(true);
      expect(listed.items[0]!.includeDeceasedAt).toBe(true);
      const view = await summary(e, r.token);
      expect(validateSharedSummaryView(view)).toBe(true);
      expect(view.summary.pets[0]!.profile).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: DEATH });
      expect(view.summary.disclosure).toMatchObject({ deceasedAtIncluded: true });
      expect(typeof view.summary.pets[0]!.profile.age.totalDays).toBe('number');
    });
  });

  it('[SC-007-016] dos enlaces de la misma mascota con opciones distintas no se mezclan: el opt-in es por enlace', async () => {
    await eachEngine(async (e) => {
      const off = await created(e, 1, {});
      const on = await created(e, 2, { includeDeceasedAt: true });
      expect(JSON.stringify(await summary(e, off.token))).not.toContain(DEATH);
      expect(JSON.stringify(await summary(e, on.token))).toContain(DEATH);
    });
  });

  it('[SC-007-016] una mascota viva no publica fecha aunque el creador marque la casilla', async () => {
    engines = await createShareEngines(null);
    for (const e of engines) {
      e.setNow(NOW);
      const r = await created(e, 1, { includeDeceasedAt: true });
      const profile = (await summary(e, r.token)).summary.pets[0]!.profile;
      expect(profile.lifeStatus).toBe('ALIVE');
      expect('deceasedAt' in profile).toBe(false);
    }
  });

  it('[SC-007-016][EDGE-005-17] la misma Idempotency-Key con otro includeDeceasedAt es ERR-SCHEMA-VALIDATION-FAILED (opcion inmutable); con el mismo valor es REPLAY', async () => {
    await eachEngine(async (e) => {
      await created(e, 1, { includeDeceasedAt: true });
      expect(await codeOf(create(e, 1, { includeDeceasedAt: false }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect((await create(e, 1, { includeDeceasedAt: true })).kind).toBe('REPLAY');
      expect(await e.rows()).toHaveLength(1);
    });
  });

  it('[SC-007-016] un valor que no es booleano en includeDeceasedAt se rechaza sin escribir', async () => {
    await eachEngine(async (e) => {
      expect(await codeOf(create(e, 1, { includeDeceasedAt: 'si' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
      expect(await e.rows()).toHaveLength(0);
    });
  });

  it('[SC-007-016] la vista previa respeta la consulta: sin includeDeceasedAt no hay fecha; con true la hay y con un valor invalido es 422', async () => {
    await eachEngine(async (e) => {
      const preview = (query: Record<string, unknown>) => new PreviewClinicalSummaryUseCase(e.deps).execute(ANDRES, PET_REF, query);
      expect(JSON.stringify(await preview({}))).not.toContain(DEATH);
      expect(JSON.stringify(await preview({ includeDeceasedAt: 'false' }))).not.toContain(DEATH);
      const on = await preview({ includeDeceasedAt: 'true' });
      expect(on.summary.pets[0]!.profile).toMatchObject({ deceasedAt: DEATH });
      expect(on.summary.disclosure).toMatchObject({ deceasedAtIncluded: true });
      expect(await codeOf(preview({ includeDeceasedAt: 'quizas' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    });
  });
});
