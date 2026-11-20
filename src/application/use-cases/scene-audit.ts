/**
 * Auditoría de la escena (feature 006, T859; REQ-ESC6-021, INV-ESC6-016; mapeo aprobado en `N2-06` (a)): una fila de `audit_log` por operación, en la MISMA
 * transacción que la mutación, con `entity_type` `HOME_SCENE`, `SCENE_CONSENT` o `HOUSEHOLD_PHOTO` y los `mutation_type` existentes (`CREATE`, `UPDATE`, `DELETE`).
 * El evento concreto (`SCENE_REQUESTED`, `SCENE_PUBLISHED`, `SCENE_FAILED`, `SCENE_CONSENT_GRANTED`, `SCENE_CONSENT_REVOKED`, `HOUSEHOLD_PHOTO_CHANGED`) y sus datos
 * opacos (modo, número de mascotas, código de resultado, hogar y actor como HMAC) viajan solo dentro del hash del estado: nunca prompt, bytes, nombres, `photoRef`
 * resueltos, URL firmadas, `X-Goog-*`, claves de objeto, cuerpos de error del proveedor ni la clave de idempotencia.
 *
 * @implements REQ-ESC6-021, INV-ESC6-016, N2-06, SC-ESC6-027, SC-ESC6-033, SC-ESC6-046
 */

import { parseInputsSnapshot } from '../../domain/scene/inputs-snapshot.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneRecord } from '../ports/scene-repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export type SceneAuditEvent = 'SCENE_REQUESTED' | 'SCENE_PUBLISHED' | 'SCENE_FAILED' | 'SCENE_CONSENT_GRANTED' | 'SCENE_CONSENT_REVOKED' | 'HOUSEHOLD_PHOTO_CHANGED';

export interface SceneAuditInput {
  readonly executorUserId: string;
  readonly mutationType: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly entityType: 'HOME_SCENE' | 'SCENE_CONSENT' | 'HOUSEHOLD_PHOTO';
  /** Id de la escena (UUID opaco) o HMAC del actor o del hogar. */
  readonly entityId: string;
  readonly event: SceneAuditEvent;
  /** Datos opacos del evento (sin PII) que solo entran en el hash. */
  readonly detail: Readonly<Record<string, unknown>>;
}

/** HMAC con la clave de auditoría (misma que `PET_ASSIGNMENT` y `ACCOUNT_DELETE`). */
export const opaqueRef = (deps: ApplicationDeps, value: string): string => deps.auditPseudonym.hmacUserId(value, deps.auditHmacSecret);

export async function recordSceneAudit(deps: ApplicationDeps, r: RepositorySet, input: SceneAuditInput): Promise<void> {
  await recordAudit(deps, r, {
    executorUserId: input.executorUserId,
    mutationType: input.mutationType,
    entityType: input.entityType,
    entityId: input.entityId,
    previous: input.mutationType === 'CREATE' ? null : { entity: input.entityType, ref: input.entityId },
    next: input.mutationType === 'DELETE' ? null : { event: input.event, ...input.detail },
  });
}

/**
 * Fila `SCENE_PUBLISHED` o `SCENE_FAILED` de un intento, en la transacción que lo cierra (REQ-ESC6-021): solo modo, número de mascotas y resultado. El actor es SIEMPRE
 * el `actor_user_id` del intento (no quien lee ni quien ejecuta el worker; `H-KEY-F5-5`); el hogar entra como HMAC.
 */
export async function recordSceneAttemptAudit(deps: ApplicationDeps, r: RepositorySet, scene: SceneRecord, attempt: SceneAttemptRecord, event: 'SCENE_PUBLISHED' | 'SCENE_FAILED', result: string): Promise<void> {
  await recordSceneAudit(deps, r, {
    executorUserId: attempt.actorUserId, mutationType: 'UPDATE', entityType: 'HOME_SCENE', entityId: scene.id, event,
    detail: { householdRef: opaqueRef(deps, scene.householdId ?? scene.ownerUserId ?? scene.id), mode: attempt.mode, pets: parseInputsSnapshot(attempt.inputsSnapshot)?.pets.length ?? 0, result },
  });
}
