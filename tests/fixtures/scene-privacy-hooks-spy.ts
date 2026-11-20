/**
 * Doble del puerto de ganchos de privacidad de la escena (T815, enmienda (d) de N2-06). El contrato lo RATIFICÓ `/architect` el 2026-11-18 en
 * `plan.md` §1.2 «Puerto `ScenePrivacyHooksPort`» y T827 lo materializa en `src/application/ports/scene-privacy-hooks.port.ts` con implementación nula;
 * este doble implementa ese mismo puerto y no cambia la forma de ningún evento.
 *
 * Precisiones (T827): (a) `now` es el string UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ` de `ClockPort.nowIsoTimestamp()`, inyectado por el caso de uso
 * (`UTC_TIMESTAMP_PATTERN`, `invalidNow()`); (b) para cada causa se invoca solo el gancho correcto (`hooksInvoked()`); (c) se mantienen `probe`
 * (lectura dentro de la transacción en el instante del gancho) y `failOn` (el gancho lanza: ROLLBACK completo de la causa).
 *
 * Cada gancho recibe el `RepositorySet` de la transacción de la causa y un evento con identificadores opacos (nunca nombres ni claves de objeto,
 * INV-ESC6-016); devuelve `Promise<void>`. El caso de uso lo obtiene de `deps.sceneHooks` (opcional: ausente = comportamiento de 001..005).
 *
 *   onPetRemoved(repositories, { petId, cause: 'PET_DELETED' | 'AVATAR_DELETED', now })      pet-use-cases (baja), avatar-use-cases (borrado)
 *   onPetUnassigned(repositories, { petId, householdId, now })                                assignment-use-cases (desasignación, D6-17)
 *   onMemberRemoved(repositories, { householdId, userId, cause: 'LEFT' | 'REMOVED', now })    household-use-cases (salida o expulsión, D6-17)
 *   onHouseholdCreated(repositories, { householdId, ownerUserId, now })                       household-use-cases (crear; migración D6-09)
 *   onHouseholdDeleting(repositories, { householdId, now })                                   household-use-cases (eliminar; ANTES del DELETE)
 *   onAccountDeleting(repositories, { userId, pseudonym, householdIds, now })                 account-use-cases (deleteWithMemberships; ANTES de borrar)
 *   onPetOwnershipTransferred(repositories, { petId, previousOwnerUserId, newOwnerUserId, now })  ownership-use-cases
 *   onBackupImported(repositories, { ownerUserId, replacedPetIds, now })                      backup-use-cases (importación)
 */
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { ScenePrivacyHooksPort } from '../../src/application/ports/scene-privacy-hooks.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';

/** Forma UTC canónica de `ClockPort.nowIsoTimestamp()`. */
export const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const SCENE_HOOK_NAMES = [
  'onPetRemoved',
  'onPetUnassigned',
  'onMemberRemoved',
  'onHouseholdCreated',
  'onHouseholdDeleting',
  'onAccountDeleting',
  'onPetOwnershipTransferred',
  'onBackupImported',
] as const;
export type SceneHookName = (typeof SCENE_HOOK_NAMES)[number];

export interface SceneHookCall {
  readonly hook: SceneHookName;
  readonly event: Readonly<Record<string, unknown>>;
}

export interface SceneHooksSpyOptions {
  /** El gancho con este nombre lanza: la transacción de la causa debe revertirse completa (misma transacción). */
  readonly failOn?: SceneHookName;
  /** Lectura dentro de la transacción en el instante del gancho (para fijar el orden respecto del borrado). */
  readonly probe?: (hook: SceneHookName, repositories: RepositorySet) => Promise<unknown>;
}

export interface SceneHooksSpy {
  readonly calls: SceneHookCall[];
  /** Resultados de `probe`, uno por llamada. */
  readonly observed: unknown[];
  readonly port: ScenePrivacyHooksPort;
  /** Nombres distintos de los ganchos invocados, en orden de primera llamada: «solo el gancho correcto por causa» (T827). */
  hooksInvoked(): SceneHookName[];
  /** Ganchos cuyo evento no trae `now` como string UTC canónico de `ClockPort` (debe ser vacío). */
  invalidNow(): SceneHookName[];
  /** Las mismas dependencias con el puerto de ganchos conectado (`deps.sceneHooks`, opcional en `ApplicationDeps`). */
  attach(deps: ApplicationDeps): ApplicationDeps;
}

export class SceneHookFailure extends Error {
  constructor(hook: SceneHookName) {
    super(`fallo simulado del gancho ${hook}`);
  }
}

export function createSceneHooksSpy(options: SceneHooksSpyOptions = {}): SceneHooksSpy {
  const calls: SceneHookCall[] = [];
  const observed: unknown[] = [];
  const entry = (hook: SceneHookName) => async (repositories: RepositorySet, event: Record<string, unknown>): Promise<void> => {
    calls.push({ hook, event: { ...event } });
    if (options.probe !== undefined) observed.push(await options.probe(hook, repositories));
    if (options.failOn === hook) throw new SceneHookFailure(hook);
  };
  const port = Object.fromEntries(SCENE_HOOK_NAMES.map((name) => [name, entry(name)])) as unknown as ScenePrivacyHooksPort;
  return {
    calls,
    observed,
    port,
    hooksInvoked: () => [...new Set(calls.map((c) => c.hook))],
    invalidNow: () => calls.filter((c) => typeof c.event['now'] !== 'string' || !UTC_TIMESTAMP_PATTERN.test(c.event['now'])).map((c) => c.hook),
    attach: (deps) => ({ ...deps, sceneHooks: port }),
  };
}
