/**
 * Implementaciones nulas de los puertos de la escena (feature 006, T827; REQ-ESC6-031): no hacen E/S ni escriben filas. Los ganchos devuelven
 * `Promise.resolve()`, el generador nulo responde un `SceneErrorCode` (nunca llama a una red ni a un proveedor) y los repositorios no hallan nada. La lógica real
 * llega con T834 (repositorios), T849 (generador y despachador simulados) y T862..T868 (ganchos).
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, INV-ESC6-002, INV-ESC6-016, INV-ARCH-005
 */

import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../application/ports/scene-image-generator.port.ts';
import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';
import type { ScenePrivacyHooksPort } from '../../application/ports/scene-privacy-hooks.port.ts';
import type {
  BeginGenerationInput,
  ClaimAttemptInput,
  HouseholdPhotoRecord,
  SceneAttemptRecord,
  SceneConsentRecord,
  SceneConsentRepository,
  SceneConsentScope,
  SceneRecord,
  SceneRepository,
} from '../../application/ports/scene-repositories.port.ts';

export class NullScenePrivacyHooks implements ScenePrivacyHooksPort {
  onPetRemoved(): Promise<void> {
    return Promise.resolve();
  }
  onPetUnassigned(): Promise<void> {
    return Promise.resolve();
  }
  onMemberRemoved(): Promise<void> {
    return Promise.resolve();
  }
  onHouseholdCreated(): Promise<void> {
    return Promise.resolve();
  }
  onHouseholdDeleting(): Promise<void> {
    return Promise.resolve();
  }
  onAccountDeleting(): Promise<void> {
    return Promise.resolve();
  }
  onPetOwnershipTransferred(): Promise<void> {
    return Promise.resolve();
  }
  onBackupImported(): Promise<void> {
    return Promise.resolve();
  }
}

export class NullSceneImageGenerator implements SceneImageGeneratorPort {
  generate(_request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    return Promise.resolve({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
  }
}

export class NullSceneJobDispatcher implements SceneJobDispatcherPort {
  enqueue(_job: SceneJob): Promise<void> {
    return Promise.resolve();
  }
}

export class NullSceneRepository implements SceneRepository {
  findById(_sceneId: string): Promise<SceneRecord | null> {
    return Promise.resolve(null);
  }
  findByHouseholdId(_householdId: string): Promise<SceneRecord | null> {
    return Promise.resolve(null);
  }
  findByOwnerUserId(_ownerUserId: string): Promise<SceneRecord | null> {
    return Promise.resolve(null);
  }
  insert(_scene: SceneRecord): Promise<boolean> {
    return Promise.resolve(false);
  }
  lockScene(_sceneId: string): Promise<void> {
    return Promise.resolve();
  }
  beginGeneration(_input: BeginGenerationInput): Promise<boolean> {
    return Promise.resolve(false);
  }
  claimAttempt(_input: ClaimAttemptInput): Promise<boolean> {
    return Promise.resolve(false);
  }
  findAttemptById(_attemptId: string): Promise<SceneAttemptRecord | null> {
    return Promise.resolve(null);
  }
  findAttemptByIdempotencyKeyHash(_hash: string): Promise<SceneAttemptRecord | null> {
    return Promise.resolve(null);
  }
  countAttemptsByScene(_sceneId: string, _since: string): Promise<number> {
    return Promise.resolve(0);
  }
  countAttemptsByActor(_actorUserId: string, _since: string): Promise<number> {
    return Promise.resolve(0);
  }
  upsertQuotaCarry(_ownerUserId: string, _quotaWindow: string, _consumedGenerations: number): Promise<void> {
    return Promise.resolve();
  }
  findQuotaCarry(_ownerUserId: string, _quotaWindow: string): Promise<number | null> {
    return Promise.resolve(null);
  }
  purgeTerminalAttempts(_finishedBefore: string): Promise<number> {
    return Promise.resolve(0);
  }
  clearExpiredIdempotencyHashes(_now: string): Promise<number> {
    return Promise.resolve(0);
  }
  purgeQuotaCarryBefore(_quotaWindow: string): Promise<number> {
    return Promise.resolve(0);
  }
  findHouseholdPhoto(_householdId: string): Promise<HouseholdPhotoRecord | null> {
    return Promise.resolve(null);
  }
  putHouseholdPhoto(_photo: HouseholdPhotoRecord): Promise<void> {
    return Promise.resolve();
  }
  findImageSources(_sceneId: string): Promise<string[]> {
    return Promise.resolve([]);
  }
  replaceImageSources(_sceneId: string, _ownerUserIds: readonly string[]): Promise<void> {
    return Promise.resolve();
  }
  retireImage(_sceneId: string, _now: string): Promise<string | null> {
    return Promise.resolve(null);
  }
  cancelInFlight(_sceneId: string, _now: string): Promise<{ readonly attemptId: string; readonly resultObjectId: string } | null> {
    return Promise.resolve(null);
  }
  adoptOwnerScene(_ownerUserId: string, _householdId: string, _now: string): Promise<string | null> {
    return Promise.resolve(null);
  }
  raiseConsumed(_sceneId: string, _quotaWindow: string, _consumed: number): Promise<void> {
    return Promise.resolve();
  }
  deleteScene(_sceneId: string): Promise<void> {
    return Promise.resolve();
  }
  deleteHouseholdPhoto(_householdId: string): Promise<void> {
    return Promise.resolve();
  }
  pseudonymizeUser(_userId: string, _pseudonym: string): Promise<void> {
    return Promise.resolve();
  }
}

export class NullSceneConsentRepository implements SceneConsentRepository {
  findByUserId(_userId: string): Promise<SceneConsentRecord | null> {
    return Promise.resolve(null);
  }
  findActive(_userId: string, _scope: SceneConsentScope, _providerId: string, _noticeVersion: string): Promise<SceneConsentRecord | null> {
    return Promise.resolve(null);
  }
  grant(_consent: SceneConsentRecord): Promise<boolean> {
    return Promise.resolve(false);
  }
  revoke(_consentId: string, _revokedAt: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}
