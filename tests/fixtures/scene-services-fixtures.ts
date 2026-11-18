/**
 * Servicios de la escena para las pruebas de los casos de uso de la 006 (T851..T861): configuración por defecto de `app-config` (8 mascotas, cuota 10,
 * T_GEN 90 s), generador simulado y despachador que solo registra. Todo determinista; nada de red ni de reloj propio.
 */
import type { SceneJob, SceneJobDispatcherPort } from '../../src/application/ports/scene-job-dispatcher.port.ts';
import type { ApplicationDeps, SceneServices } from '../../src/application/use-cases/use-case-support.ts';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, fitReferencesWithinBudget, readImageDimensions, stripImageMetadata, validateGeneratedImage, type StrippableMime } from '../../src/infrastructure/adapters/image-metadata-stripper.ts';
import { FakeSceneImageGenerator, type FakeSceneMode } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';

export class SpySceneDispatcher implements SceneJobDispatcherPort {
  readonly jobs: SceneJob[] = [];
  /** Cuando es verdadero, `enqueue` falla como una cola caída (EDGE-ESC6-017). */
  failing = false;
  /** Cuando es verdadero, `enqueue` rechaza con `ALREADY_EXISTS` (la tarea con ese nombre ya existía, EDGE-ESC6-032). */
  alreadyExists = false;
  /** Cuando es verdadero, `enqueue` falla con un tiempo agotado: el resultado es ambiguo y la tarea pudo crearse (EDGE-ESC6-032). */
  ambiguous = false;
  async enqueue(job: SceneJob): Promise<void> {
    if (this.ambiguous) throw Object.assign(new Error('tiempo agotado'), { code: 'DEADLINE_EXCEEDED' });
    if (this.failing) throw new Error('cola caída');
    this.jobs.push({ sceneId: job.sceneId, attemptId: job.attemptId });
    if (this.alreadyExists) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 'ALREADY_EXISTS' });
  }
}

export interface SceneFixtureOptions extends Partial<Omit<SceneServices, 'generator' | 'dispatcher' | 'images'>> {
  readonly mode?: FakeSceneMode;
  /** Sustituye herramientas de imagen (p. ej. un tope agregado de referencias de 0). */
  readonly images?: Partial<SceneServices['images']>;
}

export interface SceneFixture {
  readonly services: SceneServices;
  readonly generator: FakeSceneImageGenerator;
  readonly dispatcher: SpySceneDispatcher;
}

export function sceneFixture(options: SceneFixtureOptions = {}): SceneFixture {
  const generator = new FakeSceneImageGenerator({ mode: options.mode ?? 'ok' });
  const dispatcher = new SpySceneDispatcher();
  const { mode: _mode, images: imageOverrides, ...rest } = options;
  const services: SceneServices = {
    maxPets: 8,
    quotaMax: 10,
    genTimeoutSeconds: 90,
    leaseSeconds: 150,
    queueWaitSeconds: 600,
    realDriver: false,
    utcOffsetMinutes: -300,
    noticeVersion: '1',
    providerId: 'vertex-gemini-image',
    ...rest,
    images: {
      strip: (mime, bytes) => stripImageMetadata(mime as StrippableMime, bytes),
      fit: (sizes) => fitReferencesWithinBudget(sizes),
      withinLimits: (mime, bytes) => {
        const d = readImageDimensions(mime as StrippableMime, bytes);
        return d !== null && d.width * d.height <= MAX_IMAGE_PIXELS && Math.max(d.width, d.height) <= MAX_IMAGE_SIDE;
      },
      validateOutput: (mime, bytes) => validateGeneratedImage(mime, bytes, 32 * 1024 * 1024),
      ...imageOverrides,
    },
    generator,
    dispatcher,
  };
  return { services, generator, dispatcher };
}

/** `deps` de la harness con los servicios de la escena conectados. */
export const withScene = (deps: ApplicationDeps, fixture: SceneFixture): ApplicationDeps => ({ ...deps, scene: fixture.services });
