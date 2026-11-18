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
import type { SceneConsentRecord, SceneConsentRepository, SceneRecord, SceneRepository } from '../../application/ports/scene-repositories.port.ts';

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
}

export class NullSceneConsentRepository implements SceneConsentRepository {
  findByUserId(_userId: string): Promise<SceneConsentRecord | null> {
    return Promise.resolve(null);
  }
}
