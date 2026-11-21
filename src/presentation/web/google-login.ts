/**
 * Acceso con Google desde la SPA (Feature 008, `[GH:#16]`, T1122). El inicio es una NAVEGACIÓN a `GET /api/auth/google/start` (operación `startGoogleLogin`, 302 a Google), no una
 * llamada `fetch`: el estado del flujo vive en el servidor y la cookie `argos_oauth` (`HttpOnly`) la gestiona el navegador; la SPA no guarda nada del flujo (ni en `localStorage`,
 * ni en `sessionStorage`). El retorno del *callback* es una página mínima que navega a `/` (sesión) o a `/elige-usuario` (primer acceso).
 *
 * @implements REQ-SSO8-003, REQ-SSO8-004, EDGE-008-006, ERR-AUTH-GOOGLE-FAILED
 */
import { CSRF_PARAMS, problemMessage, unwrap, type ApiClient, type ProblemDetails } from './api.ts';
import { problemFeedback } from './use-contract-form.ts';
import type { FieldErrors } from './validation.ts';
import type { Schemas } from './view-model.ts';

/** Operación `startGoogleLogin`: el navegador navega a esta ruta y el servidor responde 302 a Google. */
export const GOOGLE_START_PATH = '/api/auth/google/start';
/** Ruta provisional de la pantalla «Elige tu usuario»: el *callback* navega aquí cuando el `sub` no tiene cuenta (`CHOOSE_USERNAME_PATH` de la API). */
export const CHOOSE_USERNAME_ROUTE = '/elige-usuario';
/** Código uniforme de todo fallo del flujo (cancelación, `state` reutilizado o vencido, `nonce`, estado intermedio expirado…). */
const GOOGLE_FAILED_CODE = 'ERR-AUTH-GOOGLE-FAILED';

/** `chooseGoogleUsername`: crea la cuenta con el estado del flujo (cookie `argos_oauth`) y devuelve la sesión iniciada. Lleva la cabecera anti-CSRF y solo el `username`. */
export function submitGoogleUsername(api: ApiClient, input: Schemas['GoogleChooseUsernameInput']): Promise<Schemas['SessionView']> {
  return unwrap(api.POST('/auth/google/username', { params: CSRF_PARAMS, body: input }));
}

export interface ChooseUsernameFeedback {
  /** Error bajo el campo `username` (usuario ocupado o con formato inválido). */
  readonly errors: FieldErrors;
  /** Mensaje global del catálogo (nunca el cuerpo crudo del servidor). */
  readonly message: string | null;
  /** El flujo ya no es válido: la única salida es volver a la pantalla de acceso. */
  readonly restart: boolean;
}

/** Reparto de un error de `chooseGoogleUsername` entre el campo, el mensaje global neutro y la salida «volver al acceso». */
export function chooseUsernameFeedback(problem: ProblemDetails): ChooseUsernameFeedback {
  if (problem.code === GOOGLE_FAILED_CODE) return { errors: {}, message: problemMessage(problem), restart: true };
  return { ...problemFeedback(problem, ['username']), restart: false };
}
