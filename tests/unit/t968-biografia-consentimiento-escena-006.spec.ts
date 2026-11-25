import { describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { NOTICE_GEMINI_API_SECTIONS, NOTICE_GEMINI_API_VERSION, NOTICE_SECTIONS, NOTICE_VERSION } from '../../src/presentation/web/scene-notice.ts';
import { ANDRES, ANDRES_PETS, HOUSEHOLD, LUNA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T968 / C-1 (R-1 de `/rama`, decisión de Neo, opción a; INV-ESC6-010, INV-ESC6-017, REQ-ESC6-036): el worker NO incluye la biografía de una mascota cuyo propietario no tiene
 * consentimiento `PET_PHOTOS` vigente en el driver real; misma compuerta que rige para la foto de la mascota (`hasActiveConsent` sobre `pet.ownerUserId`).
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const BIO_ANDRES = 'Le encanta correr tras la pelota roja';
const BIO_MARIA = 'Duerme siempre sobre el sofa azul';
const consentOf = (userId: string, n: number) => ({ id: `c5000000-0000-4000-8000-00000000002${n}`, userId, scope: 'PET_PHOTOS' as const, providerId: 'vertex-gemini-image', noticeVersion: '1', grantedAt: NOW, revokedAt: null });

async function prompt(realDriver: boolean, consenting: readonly string[]): Promise<string> {
  const state = canonicalState();
  state.pets = state.pets.map((p) => (p.ownerUserId === MARIA ? { ...p, biography: BIO_MARIA } : p.ownerUserId === ANDRES ? { ...p, biography: BIO_ANDRES } : p));
  const h = createHarness(state);
  const fixture = sceneFixture({ realDriver });
  const base = withScene(h.deps, fixture);
  const storage = new ControlledStorage(() => new Date(NOW));
  const deps = { ...base, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  await h.uow.runInTransaction(async (r) => {
    for (const [i, id] of consenting.entries()) await r.sceneConsents.grant(consentOf(id, i + 1));
  });
  await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'REGENERATE' }, 'b0000000-0000-4000-8000-000000000001');
  const attempt = h.uow.snapshot().sceneAttempts?.[0];
  await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, new AbortController().signal);
  return fixture.generator.calls[0]?.prompt ?? '';
}

describe('T968 [C-1][R-1][INV-ESC6-010][REQ-ESC6-036] biografía y consentimiento PET_PHOTOS del propietario', () => {
  it('sanity: la fixture tiene mascotas de ANDRES y de MARIA en el hogar', () => {
    expect(ANDRES_PETS.length).toBeGreaterThan(0);
    expect(LUNA.ownerUserId).toBe(MARIA);
  });

  it('driver real: el propietario sin consentimiento NO envía su biografía; el que consintió sí (saneada)', async () => {
    const p = await prompt(true, [ANDRES]);
    expect(p).toContain(BIO_ANDRES);
    expect(p).not.toContain(BIO_MARIA);
  });

  it('driver real: con consentimiento de ambos propietarios salen las dos biografías', async () => {
    const p = await prompt(true, [ANDRES, MARIA]);
    expect(p).toContain(BIO_ANDRES);
    expect(p).toContain(BIO_MARIA);
  });

  it('driver simulado: misma conducta que la compuerta de la foto (sin compuerta), la biografía viaja', async () => {
    const p = await prompt(false, []);
    expect(p).toContain(BIO_ANDRES);
    expect(p).toContain(BIO_MARIA);
  });
});

describe('T968 [C-2][R-2][REQ-ESC6-026] retención y borrado de la biografía en el aviso v3', () => {
  const section = (list: typeof NOTICE_SECTIONS, n: string) => (list.find((x) => x.title.startsWith(n))?.paragraphs ?? []).join(' ');

  it('la versión sigue siendo 3 / gemini-api-3 (el aviso aún no está publicado)', () => {
    expect(NOTICE_VERSION).toBe('3');
    expect(NOTICE_GEMINI_API_VERSION).toBe('gemini-api-3');
  });

  it('§4 (Vertex): lectura solo al generar, tránsito, sin almacenamiento en intentos/instantáneas/registros y sin entrenamiento', () => {
    const t = section(NOTICE_SECTIONS, '4.');
    // OBS-2 (Neo, 2026-11-24): redacción literal basada en los términos de datos de cliente de Google Cloud (Vertex AI); sustituye «únicamente… no la almacena… no la usa para entrenar modelos».
    expect(t).toMatch(/La biografía se lee solo al generar y viaja de forma transitoria en la petición al proveedor/);
    expect(t).toMatch(/Tipi no la guarda en intentos de escena, instantáneas ni registros del servidor/);
    expect(t).toMatch(/términos de datos de cliente de Google Cloud \(Vertex AI\), el proveedor no usa datos del cliente para entrenar sus modelos sin permiso/);
    expect(t).toMatch(/conservar temporalmente peticiones hasta 30 días por prevención de abuso/);
  });

  it('§4 (gemini-api): misma retención de ARGOS, sin afirmar nada sin fuente sobre el entrenamiento', () => {
    const t = section(NOTICE_GEMINI_API_SECTIONS, '4.');
    expect(t).toMatch(/no la almacena en los intentos de escena/i);
    expect(t).not.toMatch(/no la usa para entrenar/i);
    expect(t).toMatch(/pendiente de confirmar/i);
  });

  it('§6 (ambos drivers): editar o borrar la biografía o revocar el consentimiento detiene el envío; la imagen se puede retirar siempre', () => {
    for (const list of [NOTICE_SECTIONS, NOTICE_GEMINI_API_SECTIONS]) {
      const t = section(list, '6.');
      expect(t).toMatch(/editas o borras la biografía[^.]*revocas tu consentimiento[^.]*dejará de enviarse/i);
      expect(t).toMatch(/retirar la imagen generada del hogar en cualquier momento/i);
    }
  });
});
