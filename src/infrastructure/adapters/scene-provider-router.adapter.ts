/**
 * Enrutador del generador de imágenes de la escena (feature 009, T1314; D9-30 (3)(4); REQ-CFG9-001, REQ-CFG9-002, REQ-ESC6-017, INV-LIM9-001; SC-009-057): implementa `SceneImageGeneratorPort`
 * y compone los generadores de los proveedores que TIENEN credenciales en el despliegue (Vertex AI, `gemini-api`). En cada llamada lee la seleccion EFECTIVA en caliente (`resolve`, cache <= 60 s
 * por instancia) y delega en ese proveedor y solo en ese.
 *
 * FALLA CERRADO: si el proveedor seleccionado no tiene generador compuesto, si no admite el modelo vigente o si la lectura falla, NO hay llamada a ningun proveedor, se registra
 * `scene-provider PROVIDER_NOT_CONFIGURED` (sin valores ni secretos) y se devuelve `ERR-SCENE-GENERATION-FAILED`. NUNCA cae en silencio al otro proveedor.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-ESC6-017, INV-LIM9-001
 */

import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../application/ports/scene-image-generator.port.ts';
import type { SceneProviderDriver, SceneProviderSelection } from '../../domain/scene/provider-parameters.ts';

export interface SceneProviderRouterOptions {
  /** Generadores compuestos: solo los proveedores con credenciales en el despliegue. */
  readonly providers: Readonly<Partial<Record<SceneProviderDriver, SceneImageGeneratorPort>>>;
  /** Seleccion efectiva (fila valida > defecto) con la regla de falla cerrado ya aplicada. */
  readonly resolve: () => Promise<SceneProviderSelection>;
  /** Registro tecnico: solo `scene-provider PROVIDER_NOT_CONFIGURED`. */
  readonly log?: (line: string) => void;
}

export const PROVIDER_NOT_CONFIGURED_LOG = 'scene-provider PROVIDER_NOT_CONFIGURED';

const FAILED: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' };

export class SceneProviderRouter implements SceneImageGeneratorPort {
  constructor(private readonly options: SceneProviderRouterOptions) {}

  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    let generator: SceneImageGeneratorPort | undefined;
    try {
      const selection = await this.options.resolve();
      generator = selection.configured && selection.driver !== null ? this.options.providers[selection.driver] : undefined;
    } catch {
      generator = undefined;
    }
    if (generator === undefined) {
      this.options.log?.(PROVIDER_NOT_CONFIGURED_LOG);
      return FAILED;
    }
    return generator.generate(request);
  }
}

/** Fábrica para la composición. */
export const createSceneProviderRouter = (options: SceneProviderRouterOptions): SceneImageGeneratorPort => new SceneProviderRouter(options);
