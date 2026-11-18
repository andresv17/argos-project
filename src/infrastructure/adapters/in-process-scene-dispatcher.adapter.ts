/**
 * Despachador de tareas de la escena EN PROCESO (feature 006, T850; REQ-ESC6-013, REQ-ESC6-017). Solo desarrollo y CI: `enqueue` registra el trabajo y lo ejecuta
 * con `setImmediate` DESPUÉS de volver, así el POST responde antes que la generación. Un fallo del manejador se descarta sin propagarse ni conservar datos
 * (EDGE-ESC6-017). En producción (`allowed = false`) se niega: allí solo vale la cola de Cloud Tasks, que el worker espera de principio a fin (REQ-ESC6-036).
 *
 * @implements REQ-ESC6-013, REQ-ESC6-017, INV-ESC6-002, EDGE-ESC6-017, SC-ESC6-017, SC-ESC6-050
 */

import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';

export class InProcessSceneDispatcher implements SceneJobDispatcherPort {
  readonly enqueued: SceneJob[] = [];
  failures = 0;
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly handler: (job: SceneJob) => Promise<void>,
    private readonly options: { readonly allowed: boolean },
  ) {}

  async enqueue(job: SceneJob): Promise<void> {
    if (!this.options.allowed) throw new Error('InProcessSceneDispatcher solo desarrollo y CI: en producción se usa Cloud Tasks.');
    this.enqueued.push({ sceneId: job.sceneId, attemptId: job.attemptId });
    const run = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.handler(job).then(
          () => resolve(),
          () => {
            this.failures += 1; // sin mensaje ni causa: nada del error sale de aquí
            resolve();
          },
        );
      });
    });
    this.running.add(run);
    void run.then(() => this.running.delete(run));
  }

  /** Espera a que terminen los trabajos en curso (pruebas). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }
}
