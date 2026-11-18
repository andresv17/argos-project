import { describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { SceneJobDispatcherPort } from '../../src/application/ports/scene-job-dispatcher.port.ts';
import type { ScenePrivacyHooksPort } from '../../src/application/ports/scene-privacy-hooks.port.ts';
import {
  NullSceneConsentRepository,
  NullSceneImageGenerator,
  NullSceneJobDispatcher,
  NullScenePrivacyHooks,
  NullSceneRepository,
} from '../../src/infrastructure/adapters/null-scene-adapters.ts';
import { DEFAULT_FIXED_NOW } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { createHarness } from '../fixtures/application-harness.ts';
import { SCENE_HOOK_NAMES, UTC_TIMESTAMP_PATTERN, createSceneHooksSpy } from '../fixtures/scene-privacy-hooks-spy.ts';

/**
 * T827 (006, Fase 3): puertos de la escena con implementaciones nulas. El puerto de ganchos (`ScenePrivacyHooksPort`, 8 ganchos de `plan.md` §1.2, ratificado
 * por /architect el 2026-11-18) es el único punto por donde 002/004/005 tocan la escena; con la implementación nula los ocho devuelven `Promise.resolve()` y no
 * tocan ningún repositorio (REQ-ESC6-017, REQ-ESC6-031; INV-ESC6-002, INV-ESC6-016; INV-ARCH-005; SC-ESC6-025).
 */

/** `RepositorySet` que falla ante cualquier acceso: un gancho nulo no puede leer ni escribir nada. */
const FORBIDDEN_REPOSITORIES = new Proxy({}, {
  get: (_target, property) => {
    throw new Error(`acceso prohibido a repositories.${String(property)}`);
  },
}) as unknown as RepositorySet;

const NOW = DEFAULT_FIXED_NOW;
const EVENTS: Record<(typeof SCENE_HOOK_NAMES)[number], Record<string, unknown>> = {
  onPetRemoved: { petId: 'p1', cause: 'PET_DELETED', now: NOW },
  onPetUnassigned: { petId: 'p1', householdId: 'h1', now: NOW },
  onMemberRemoved: { householdId: 'h1', userId: 'u1', cause: 'LEFT', now: NOW },
  onHouseholdCreated: { householdId: 'h1', ownerUserId: 'u1', now: NOW },
  onHouseholdDeleting: { householdId: 'h1', now: NOW },
  onAccountDeleting: { userId: 'u1', pseudonym: 'ps', householdIds: ['h1'], now: NOW },
  onPetOwnershipTransferred: { petId: 'p1', previousOwnerUserId: 'u1', newOwnerUserId: 'u2', now: NOW },
  onBackupImported: { ownerUserId: 'u1', replacedPetIds: ['p1'], now: NOW },
};

type Invoker = (port: ScenePrivacyHooksPort, name: (typeof SCENE_HOOK_NAMES)[number]) => Promise<void>;
const invoke: Invoker = (port, name) => (port[name] as unknown as (r: RepositorySet, e: Record<string, unknown>) => Promise<void>)(FORBIDDEN_REPOSITORIES, EVENTS[name]);

describe('ScenePrivacyHooksPort nulo (T827, REQ-ESC6-017; INV-ARCH-005)', () => {
  it('[INV-ARCH-005] expone exactamente los 8 ganchos ratificados, ni más ni menos', () => {
    const hooks = new NullScenePrivacyHooks();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(hooks)).filter((n) => n !== 'constructor').sort();
    expect(methods).toEqual([...SCENE_HOOK_NAMES].sort());
    expect(SCENE_HOOK_NAMES).toHaveLength(8);
  });

  it.each(SCENE_HOOK_NAMES)('[INV-ARCH-005] %s devuelve una Promise que se resuelve en undefined y no toca ningún repositorio', async (name) => {
    const result = invoke(new NullScenePrivacyHooks(), name);
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBeUndefined();
  });

  it('[REQ-ESC6-031] sin escena no hay efecto: los 8 ganchos nulos no escriben ni leen filas, y repetir el mismo evento es idempotente', async () => {
    const hooks = new NullScenePrivacyHooks();
    for (const name of SCENE_HOOK_NAMES) {
      await invoke(hooks, name);
      await invoke(hooks, name);
    }
    expect(Object.keys(hooks)).toEqual([]);
  });
});

describe('ApplicationDeps.sceneHooks opcional (T827; plan §1.2 regla 6)', () => {
  it('[REQ-ESC6-017] createDeps no trae sceneHooks: ausente = comportamiento actual de 001..005', () => {
    const { deps } = createHarness();
    expect('sceneHooks' in deps).toBe(false);
  });

  it('[REQ-ESC6-017] attach conecta el puerto en deps.sceneHooks sin tocar el resto de las dependencias', () => {
    const { deps } = createHarness();
    const spy = createSceneHooksSpy();
    const attached = spy.attach(deps);
    expect(attached.sceneHooks).toBe(spy.port);
    expect({ ...attached, sceneHooks: undefined }).toEqual({ ...deps, sceneHooks: undefined });
  });

  it('[REQ-ESC6-017] el puerto nulo es asignable a deps.sceneHooks', async () => {
    const { deps } = createHarness();
    const nullHooks: ScenePrivacyHooksPort = new NullScenePrivacyHooks();
    const withNull = { ...deps, sceneHooks: nullHooks };
    expect(await withNull.sceneHooks.onHouseholdDeleting(FORBIDDEN_REPOSITORIES, { householdId: 'h1', now: NOW })).toBeUndefined();
  });
});

describe('fixture scene-privacy-hooks-spy ajustado (T827: now UTC de ClockPort, un solo gancho por causa, probe y failOn)', () => {
  it('[INV-ESC6-016] (a) now es el string UTC canónico de ClockPort y el espía marca los que no lo son', async () => {
    const { clock } = createHarness();
    expect(UTC_TIMESTAMP_PATTERN.test(clock.nowIsoTimestamp())).toBe(true);
    const spy = createSceneHooksSpy();
    await spy.port.onHouseholdDeleting(FORBIDDEN_REPOSITORIES, { householdId: 'h1', now: clock.nowIsoTimestamp() });
    await spy.port.onHouseholdCreated(FORBIDDEN_REPOSITORIES, { householdId: 'h1', ownerUserId: 'u1', now: '2026-11-05 12:00:00' });
    expect(spy.invalidNow()).toEqual(['onHouseholdCreated']);
  });

  it('[REQ-ESC6-030] (b) hooksInvoked lista solo los ganchos distintos llamados, en orden', async () => {
    const spy = createSceneHooksSpy();
    await spy.port.onMemberRemoved(FORBIDDEN_REPOSITORIES, { householdId: 'h1', userId: 'u1', cause: 'REMOVED', now: NOW });
    await spy.port.onMemberRemoved(FORBIDDEN_REPOSITORIES, { householdId: 'h1', userId: 'u2', cause: 'LEFT', now: NOW });
    expect(spy.hooksInvoked()).toEqual(['onMemberRemoved']);
    expect(spy.calls).toHaveLength(2);
  });

  it('[INV-ESC6-016] (c) probe observa dentro de la transacción y failOn lanza solo en el gancho nombrado', async () => {
    const spy = createSceneHooksSpy({ failOn: 'onAccountDeleting', probe: async (hook) => `visto:${hook}` });
    await spy.port.onPetUnassigned(FORBIDDEN_REPOSITORIES, { petId: 'p1', householdId: 'h1', now: NOW });
    await expect(spy.port.onAccountDeleting(FORBIDDEN_REPOSITORIES, { userId: 'u1', pseudonym: 'ps', householdIds: [], now: NOW })).rejects.toThrow('onAccountDeleting');
    expect(spy.observed).toEqual(['visto:onPetUnassigned', 'visto:onAccountDeleting']);
  });
});

describe('SceneImageGeneratorPort y SceneJobDispatcherPort nulos (T827; REQ-ESC6-017, REQ-ESC6-031; INV-ESC6-002, INV-ESC6-016; SC-ESC6-025)', () => {
  it('[INV-ESC6-016] el generador nulo devuelve solo un SceneErrorCode (sin cuerpo ni mensaje del proveedor) y no llama a ninguna red', async () => {
    const result = await new NullSceneImageGenerator().generate({ prompt: 'p', references: [], signal: new AbortController().signal });
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(Object.keys(result).sort()).toEqual(['code', 'ok']);
  });

  it('[REQ-ESC6-017] el despachador nulo encola sin efecto y devuelve Promise<void>', async () => {
    const dispatcher: SceneJobDispatcherPort = new NullSceneJobDispatcher();
    const result = dispatcher.enqueue({ sceneId: 's1', attemptId: 'a1' });
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBeUndefined();
  });
});

describe('SceneRepository y SceneConsentRepository nulos (T827; INV-ARCH-005)', () => {
  it('[INV-ARCH-005] devuelven Promise y no hallan nada (sin escena, sin efecto)', async () => {
    const scenes = new NullSceneRepository();
    const consents = new NullSceneConsentRepository();
    const [scene, consent] = [scenes.findById('s1'), consents.findByUserId('u1')];
    expect(scene).toBeInstanceOf(Promise);
    expect(consent).toBeInstanceOf(Promise);
    expect([await scene, await consent]).toEqual([null, null]);
  });
});
