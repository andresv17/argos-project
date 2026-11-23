/**
 * Acceso con Google desde la SPA (Feature 008, `[GH:#16]`, T1122). El inicio es una NAVEGACIÓN a `GET /api/auth/google/start` (operación `startGoogleLogin`, 302 a Google), no una
 * llamada `fetch`: el estado del flujo vive en el servidor y la cookie `argos_oauth` (`HttpOnly`) la gestiona el navegador; la SPA no guarda nada del flujo (ni en `localStorage`,
 * ni en `sessionStorage`). El retorno del *callback* es una página mínima que navega a `/` (sesión) o a `/elige-usuario` (primer acceso).
 *
 * Vincular Google desde el perfil (T1131, `[GH:#17]`): `startGoogleLink` (`POST /api/auth/google/link`) pide la contraseña actual y devuelve la URL de autorización a la que navega la SPA.
 *
 * @implements REQ-SSO8-003, REQ-SSO8-004, EDGE-008-006, ERR-AUTH-GOOGLE-FAILED, REQ-VIN8-001, REQ-VIN8-002, ERR-AUTH-GOOGLE-LINK-CONFLICT
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

/** `chooseGoogleUsername`: crea la cuenta con el estado del flujo (cookie `argos_oauth`) y devuelve la sesión iniciada, o `{ accountStatus }` sin sesión si la cuenta queda PENDING (009, 002 3.4.0). Lleva la cabecera anti-CSRF y solo el `username`. */
export function submitGoogleUsername(api: ApiClient, input: Schemas['GoogleChooseUsernameInput']): Promise<Schemas['SessionView'] | { readonly accountStatus: 'PENDING' | 'REJECTED' }> {
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

/** Campo del formulario «Vincular Google» (contrato `GoogleLinkStartInput`). */
export const GOOGLE_LINK_FIELD = 'currentPassword';

/** `startGoogleLink`: exige la sesión y la contraseña actual; guarda el flujo en el servidor (cookie `argos_oauth`) y devuelve la URL de autorización de Google. */
export function startGoogleLink(api: ApiClient, input: Schemas['GoogleLinkStartInput']): Promise<Schemas['GoogleAuthorizationView']> {
  return unwrap(api.POST('/auth/google/link', { params: CSRF_PARAMS, body: input }));
}

/** Texto llano propio: el `detailTemplate` del catálogo para este código es una nota de desarrollador y no se muestra (H-T1131-S1). */
export const GOOGLE_LINK_WRONG_PASSWORD = 'La contraseña actual no es correcta.';

export interface GoogleLinkFeedback {
  /** Error bajo el campo de la contraseña actual (solo credenciales inválidas). */
  readonly errors: FieldErrors;
  /** Mensaje global del catálogo (nunca el cuerpo crudo del servidor). */
  readonly message: string | null;
  /** Mover el foco al campo con error (WCAG 3.3.1, H-T1122-S1). */
  readonly focusField: boolean;
}

/** Reparto de un error de `startGoogleLink`: la contraseña incorrecta se pinta bajo el campo y recibe el foco; cualquier otro fallo es un mensaje neutro del catálogo (REQ-VIN8-001). */
export function googleLinkFeedback(problem: ProblemDetails): GoogleLinkFeedback {
  if (problem.code === 'ERR-AUTH-INVALID-CREDENTIALS') return { errors: { [GOOGLE_LINK_FIELD]: GOOGLE_LINK_WRONG_PASSWORD }, message: null, focusField: true };
  return { errors: {}, message: problemMessage(problem), focusField: false };
}
