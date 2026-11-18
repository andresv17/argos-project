/**
 * Doble del puerto de ganchos de privacidad de la escena (T815, enmienda (d) de N2-06; `ScenePrivacyHooksPort` lo introduce T827 con implementaciones nulas).
 *
 * CONTRATO PROPUESTO (a ratificar por /architect al materializar el puerto en T827; el nombre y la forma de cada gancho se cambian SOLO en este archivo):
 * cada gancho recibe el `RepositorySet` de la transacción de la causa (mismo candado y mismo COMMIT/ROLLBACK; plan.md §1.2) y un evento con identificadores
 * opacos (nunca nombres ni claves de objeto, INV-ESC6-016) y devuelve `Promise<void>`. El caso de uso lo obtiene de `deps.sceneHooks` (opcional: ausente =
 * comportamiento actual de 001..005, como `media?` y `sharing?`).
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
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';

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
  readonly port: Record<SceneHookName, (repositories: RepositorySet, event: Record<string, unknown>) => Promise<void>>;
  /** Las mismas dependencias con el puerto de ganchos conectado (`deps.sceneHooks`, propuesto para T827). */
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
  const port = Object.fromEntries(SCENE_HOOK_NAMES.map((name) => [name, entry(name)])) as SceneHooksSpy['port'];
  return { calls, observed, port, attach: (deps) => ({ ...deps, sceneHooks: port }) as ApplicationDeps };
}
