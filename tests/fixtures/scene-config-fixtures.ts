/**
 * Fixtures de configuración de la escena (feature 006, T830). Con `NODE_ENV=production` el arranque rechaza `ARGOS_SCENE_DRIVER=fake` y `real` exige la
 * constante de activación del código (SC-ESC6-025, SC-ESC6-092). Las suites de 003/004 que prueban el arranque de producción aportan aquí el entorno `real`
 * y la activación, para seguir aislando su propia variable.
 */
import { loadAppConfig, type AppConfig, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';

/** Entorno `real` completo y válido de la escena (producción). */
export const PROD_SCENE = {
  ARGOS_SCENE_DRIVER: 'real',
  ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image',
  ARGOS_SCENE_LOCATION: 'us-central1',
  ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
  ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com',
  ARGOS_SCENE_WORKER_URL: 'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
} as const;

/** `loadAppConfig` con la constante de activación del driver real fijada a verdadera (solo pruebas en proceso). */
export const loadAppConfigActivated = (env: EnvironmentSource = process.env): AppConfig => loadAppConfig(env, { sceneRealDriverActivated: true });
