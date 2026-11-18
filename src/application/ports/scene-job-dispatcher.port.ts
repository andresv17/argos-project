/**
 * Puerto del despachador de tareas de la escena (feature 006, REQ-ESC6-013, REQ-ESC6-017). Tras el COMMIT de T1 el caso de uso encola `{ sceneId, attemptId }`
 * (UUID opacos, sin PII; el nombre de la tarea es el `attemptId`). El adaptador en proceso (desarrollo y CI) y el de Cloud Tasks viven en `infrastructure/`.
 *
 * @implements REQ-ESC6-013, REQ-ESC6-017, INV-ESC6-002, INV-ARCH-005
 */

export interface SceneJob {
  readonly sceneId: string;
  readonly attemptId: string;
}

export interface SceneJobDispatcherPort {
  enqueue(job: SceneJob): Promise<void>;
}
