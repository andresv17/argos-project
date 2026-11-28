/**
 * T1693 (Feature 012, Bloque E, #81; PRUEBAS ROJAS hasta T1695; `/keymaker`): Fase 1 del despliegue en dos fases de ENM-005-E (annex §8.2) y dominio del alcance `PETS`.
 *  - (k) lector exhaustivo con default-deny en `resolveShare`, `buildSharedView`, `requireShareAuthority` y `mayRevoke` (vía `RevokeShareLinkUseCase`): un alcance desconocido NUNCA cae a `HOUSEHOLD`.
 *  - (s) bandera `ARGOS_SHARE_PETS_CREATE_ENABLED`: solo la cadena exacta `true` es ON; se lee al arrancar; defecto OFF.
 *  - (r) `EDGE-012-076`: `signedUrlTtlSeconds` impone ≤ 300 s (esta prueba ya es VERDE: regresión que T1695 no puede romper).
 *  - `resolveEligiblePets`: elegibilidad por lote en UNA consulta acotada a 20 ids (API supuesta en `tests/fixtures/share-pets-012.ts`).
 *
 * @implements REQ-VET12-003, REQ-VET12-004, INV-VET12-001, INV-VET12-002, EDGE-012-022, EDGE-012-076, SC-012-058, SC-012-061
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { requireShareAuthority } from '../../../src/application/sharing/share-access.ts';
import { RevokeShareLinkUseCase } from '../../../src/application/use-cases/share-link-use-cases.ts';
import { buildSharedView, resolveShare } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import { signedUrlTtlSeconds, type ShareLinkRecord } from '../../../src/domain/sharing/share-link.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { loadAppConfigActivated } from '../../fixtures/scene-config-fixtures.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import type { ShareApi } from '../../fixtures/share-api-harness.ts';
import { ANDRES, ARGOS, H, LUCIA, LUNA, MARIA, P_ARGOS, P_KIRA, P_MILO, P_NYX, P_TOBY, coOwn, loadModule, petsApi } from '../../fixtures/share-pets-012.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const TOKEN = 'T'.repeat(43);
const NOW = '2026-11-18T12:00:00.000Z';
/** Un enlace de un alcance que el lector de hoy no conoce (el futuro `FUTURE`): vivo, de ANDRES, con el `householdId` de Casa Vallejo. */
const unknownScopeLink = (createdByUserId: string = ANDRES): ShareLinkRecord =>
  ({
    id: '00000000-0000-4000-8000-00000000f001',
    tokenHash: hashToken(TOKEN),
    scope: 'FUTURE',
    petId: null,
    householdId: H,
    createdByUserId,
    createdAt: '2026-11-18T11:00:00.000Z',
    expiresInDays: 7,
    expiresAt: '2026-11-25T11:00:00.000Z',
    revokedAt: null,
    includeMicrochip: false,
    includeClinicalFiles: false,
    includeDeceasedAt: false,
    idempotencyKey: 'k',
    petOwnerUserIdAtCreation: null,
  }) as unknown as ShareLinkRecord;
const withLink = (r: RepositorySet, link: ShareLinkRecord): RepositorySet =>
  new Proxy(r, {
    get: (target, property, receiver) =>
      property === 'shareLinks' ? { findByTokenHash: async () => link, findById: async () => link, revoke: async () => true, insert: async () => undefined } : (Reflect.get(target, property, receiver) as unknown),
  });

describe('T1693 Fase 1: el lector es exhaustivo con default-deny (annex §8.1-§8.2, escenario (k))', () => {
  it('[§8.2.1] resolveShare con un alcance desconocido devuelve null: nunca cae a HOUSEHOLD ni sirve las mascotas del hogar', async () => {
    api = await petsApi();
    const resolved = await api.deps.uow.runInTransaction((r) => resolveShare(withLink(r, unknownScopeLink()), TOKEN, NOW));
    expect(resolved).toBeNull();
  });

  it('[§8.2.1] buildSharedView y requireShareAuthority rechazan un alcance desconocido (null o ERR-SHARE-NOT-FOUND exacto) y nunca producen una vista del hogar', async () => {
    api = await petsApi();
    // BAJA-2 (oracle): solo cuenta como «denegado» un `null` o el error uniforme EXACTO `ERR-SHARE-NOT-FOUND`; cualquier otra excepción (p. ej. un TypeError del lector) no prueba el default-deny.
    const denied = async (work: () => Promise<unknown>): Promise<boolean> => {
      try {
        return (await work()) === null;
      } catch (error) {
        return (error as { code?: unknown }).code === 'ERR-SHARE-NOT-FOUND';
      }
    };
    await api.deps.uow.runInTransaction(async (r) => {
      const pets = [upgradePet(ARGOS)];
      expect(await denied(() => buildSharedView(r, pets, 'FUTURE' as never, NOW, { includeMicrochip: false, includeClinicalFiles: false, includeDeceasedAt: false } as never, null))).toBe(true);
      expect(await denied(() => requireShareAuthority(r, ANDRES, { scope: 'FUTURE', householdId: H } as never, true))).toBe(true);
    });
  });

  it('[§8.2.1] mayRevoke con un alcance desconocido: el propietario del hogar que NO es el creador recibe 404 ERR-SHARE-NOT-FOUND (hoy el fallthrough lo trata como HOUSEHOLD y revoca)', async () => {
    api = await petsApi();
    const deps = { ...api.deps, uow: { ...api.deps.uow, runInTransaction: <T>(work: (r: RepositorySet) => Promise<T>) => api.deps.uow.runInTransaction((r) => work(withLink(r, unknownScopeLink(LUCIA)))) } };
    await expect(new RevokeShareLinkUseCase(deps as never).execute(ANDRES, '00000000-0000-4000-8000-00000000f001')).rejects.toMatchObject({ code: 'ERR-SHARE-NOT-FOUND' });
  });

  it('[§8.2.5] el tipo ShareScope declara PETS y el compilador exige un caso por alcance (comprobación de exhaustividad never)', async () => {
    const domain = await import('../../../src/domain/sharing/share-link.ts');
    const source = (await import('node:fs')).readFileSync(new URL('../../../src/domain/sharing/share-link.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/export type ShareScope = 'PET' \| 'HOUSEHOLD' \| 'PETS'/);
    expect(typeof domain.deriveStatus).toBe('function');
    for (const file of ['src/application/use-cases/shared-view-use-cases.ts', 'src/application/use-cases/share-link-use-cases.ts', 'src/application/sharing/share-access.ts']) {
      expect((await import('node:fs')).readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'), file).toMatch(/assertNever|: never\b|satisfies never/);
    }
  });
});

describe('T1693 bandera ARGOS_SHARE_PETS_CREATE_ENABLED (escenario (s), annex §8.2.2)', () => {
  const flag = (value: string | undefined): boolean | undefined =>
    (loadAppConfigActivated({ NODE_ENV: 'test', ...(value === undefined ? {} : { ARGOS_SHARE_PETS_CREATE_ENABLED: value }) }) as unknown as { sharePetsCreateEnabled?: boolean }).sharePetsCreateEnabled;

  it('[fail-closed] solo la cadena exacta true es ON; ausente, vacío, TRUE, " true", "true ", 1, yes y on son OFF', () => {
    expect(flag('true')).toBe(true);
    for (const value of [undefined, '', 'TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', 'false']) expect(flag(value), JSON.stringify(value)).toBe(false);
  });

  it('[§8.2.2] se lee al arrancar: cambiar el entorno después de cargar no cambia la configuración ya fijada', () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'test', ARGOS_SHARE_PETS_CREATE_ENABLED: 'true' };
    const config = loadAppConfigActivated(env) as unknown as { sharePetsCreateEnabled?: boolean };
    env['ARGOS_SHARE_PETS_CREATE_ENABLED'] = 'false';
    expect(config.sharePetsCreateEnabled).toBe(true);
  });

  it('[§8.2.2] la variable solo la lee app-config.ts: ningún otro módulo de src/ toca process.env.ARGOS_SHARE_PETS_CREATE_ENABLED', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync("grep -rln 'ARGOS_SHARE_PETS_CREATE_ENABLED' src || true", { cwd: process.cwd(), encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(hits).toEqual(['src/infrastructure/config/app-config.ts']);
  });
});

describe('T1693 EDGE-012-076: cota de la URL firmada pública (escenario (r), regresión verde)', () => {
  it('[EDGE-012-076] signedUrlTtlSeconds nunca supera 300 s ni el tiempo restante, aunque ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS sea 900', () => {
    expect(loadAppConfigActivated({ NODE_ENV: 'test', ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '900' }).mediaSignedUrlTtlSeconds).toBe(900);
    expect(signedUrlTtlSeconds(NOW, '2026-11-19T12:00:00.000Z')).toBe(300);
    expect(signedUrlTtlSeconds(NOW, '2026-11-18T12:02:00.000Z')).toBe(120);
    expect(signedUrlTtlSeconds(NOW, '2026-11-18T12:00:00.500Z')).toBeNull();
  });
});

interface EligibleModule {
  resolveEligiblePets(
    r: RepositorySet,
    input: { userId: string; householdId: string; petIds: readonly string[] },
  ): Promise<{ eligible: Array<{ id: string; name: string }>; hasAnyEligibleInHousehold: boolean }>;
}
const ELIGIBLE = 'src/application/sharing/resolve-eligible-pets.ts';

describe('T1693 resolveEligiblePets (REQ-VET12-003, INV-VET12-001/002, EDGE-012-022)', () => {
  it('[REQ-VET12-003] devuelve solo las mascotas pedidas sobre las que el creador es principal o co-propietario ACTIVE y siguen asignadas al hogar, ordenadas por (name ASC, id ASC)', async () => {
    api = await petsApi({ role: 'ADMIN' });
    await coOwn(api, MARIA, P_ARGOS);
    const { resolveEligiblePets } = await loadModule<EligibleModule>(ELIGIBLE);
    const ghost = '11111111-1111-4111-8111-1111111119ff';
    const asAndres = await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: ANDRES, householdId: H, petIds: [P_TOBY, ghost, LUNA.id, P_ARGOS, P_KIRA] }));
    expect(asAndres.eligible.map((p) => p.name)).toEqual(['Argos', 'Kira', 'Toby']);
    const asMaria = await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: MARIA, householdId: H, petIds: [P_ARGOS, P_KIRA, LUNA.id] }));
    expect(asMaria.eligible.map((p) => p.name)).toEqual(['Argos', 'Luna']);
    expect(asMaria.hasAnyEligibleInHousehold).toBe(true);
  });

  it('[INV-VET12-001] una mascota desasignada, de otro hogar o sin autoridad no es elegible y no deja pista; el creador sin ninguna mascota elegible en el hogar lo declara (insumo del 403)', async () => {
    api = await petsApi();
    const { resolveEligiblePets } = await loadModule<EligibleModule>(ELIGIBLE);
    await api.deps.uow.runInTransaction((r) => r.assignments.remove(P_NYX, H));
    const out = await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: ANDRES, householdId: H, petIds: [P_NYX, P_MILO] }));
    expect(out.eligible.map((p) => p.id)).toEqual([P_MILO]);
    const none = await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: LUCIA, householdId: H, petIds: [P_MILO] }));
    expect([none.eligible, none.hasAnyEligibleInHousehold]).toEqual([[], false]);
  });

  it('[EDGE-012-022] una mascota fallecida sigue elegible como en 011', async () => {
    api = await petsApi();
    const { resolveEligiblePets } = await loadModule<EligibleModule>(ELIGIBLE);
    await api.deps.uow.runInTransaction((r) => r.pets.save({ ...upgradePet(ARGOS), id: P_TOBY, name: 'Toby', lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' }));
    const out = await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: ANDRES, householdId: H, petIds: [P_TOBY] }));
    expect(out.eligible.map((p) => p.id)).toEqual([P_TOBY]);
  });

  it('[trinity H-19] con 20 ids la revalidación es UNA consulta acotada (no una por mascota)', async () => {
    api = await petsApi();
    const { resolveEligiblePets } = await loadModule<EligibleModule>(ELIGIBLE);
    const ids = Array.from({ length: 20 }, (_, i) => `11111111-1111-4111-8111-1111111117${String(i).padStart(2, '0')}`);
    api.calls.length = 0;
    await api.deps.uow.runInTransaction((r) => resolveEligiblePets(r, { userId: ANDRES, householdId: H, petIds: ids }));
    expect(api.calls.filter((c) => !c.startsWith('uow.')).length).toBeLessThanOrEqual(1); // la propia apertura de la transacción (`uow.write`) no es una consulta de puerto
  });
});
