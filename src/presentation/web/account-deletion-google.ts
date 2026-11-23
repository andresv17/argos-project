/**
 * Eliminación de la cuenta sin contraseña desde la SPA (Feature 009, deuda #17, T1220; contrato `admin.openapi.yaml`, operaciones `startAccountDeletionReauth` y
 * `deleteAccountWithGoogleReauth`). Usa el transporte crudo de `api.ts` (no llama a la red directamente, INV-AUTH2-002; ORA-T1223-01): el cliente tipado de la SPA se genera de la 002 y no declara estas rutas, y la regla de capas de la
 * presentación no admite importar `src/generated/v35/`. Las formas se declaran aquí; `X-Argos-Request` va en toda petición (INV-AUTH-007).
 * La prueba de titularidad vive en el servidor, ligada a la sesión (INV-DEL9-001): la SPA no la ve ni la guarda; el cuerpo solo lleva la frase y el token de respaldo.
 * Nunca se muestra el cuerpo de error del servidor: solo su `code` y, en el 409, la lista de hogares del contrato (EDGE-009-049).
 *
 * @implements REQ-DEL9-001, REQ-DEL9-002, INV-DEL9-001, INV-AUTH2-002, EDGE-009-031, EDGE-009-049, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';
import { catalogProblem, createRawTransport, problemMessage, toProblem, type RawTransport } from './api.ts';

export const DELETION_REAUTH_REQUIRED_CODE = 'ERR-ACCOUNT-DELETE-REAUTH-REQUIRED';
export const HOUSEHOLDS_ACTIVE_CODE = 'ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE';
const UNEXPECTED_CODE = 'ERR-INTERNAL-UNEXPECTED';

/**
 * Texto literal de `detailTemplate` en `contracts/errors/error-catalog.json` de la 009 (la SPA no puede importar `generated/v35`, regla de capas);
 * `t1220-eliminar-cuenta-google-009.spec.ts` lo compara con el catálogo.
 */
export const DELETION_REAUTH_REQUIRED_MESSAGE = 'Para eliminar tu cuenta debes volver a confirmar tu identidad con Google. Inicia la verificación y vuelve a intentarlo.';
export const HOUSEHOLDS_ACTIVE_MESSAGE =
  'No puedes eliminar tu cuenta mientras seas propietario de hogares con otros miembros activos o con mascotas compartidas. Transfiere la propiedad o elimina esos hogares y vuelve a intentarlo.';

/** Hogar bloqueante (`HouseholdsActiveProblem.households[]`). */
export interface AffectedHousehold {
  readonly householdId: string;
  readonly name: string;
  readonly activeMembers: number;
  readonly sharedPets: number;
}

export interface DeleteAccountWithGoogleBody {
  readonly confirmationPhrase: string;
  readonly backupConfirmationToken?: string;
}

/** Error de la API: `code` estable (o `ERR-INTERNAL-UNEXPECTED`), estado HTTP (0 sin respuesta) y, en el 409, los hogares afectados. */
export class DeletionApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly households: readonly AffectedHousehold[] = [],
  ) {
    super(code);
    this.name = 'DeletionApiError';
  }
}

export interface AccountDeletionApi {
  /** Devuelve la URL de autorización de Google (solo `https://accounts.google.com/`). */
  startReauth(): Promise<string>;
  /** 204: cuenta eliminada. */
  deleteAccount(body: DeleteAccountWithGoogleBody): Promise<void>;
}

const GOOGLE_URL = /^https:\/\/accounts\.google\.com\//;

function parseHouseholds(raw: unknown): AffectedHousehold[] {
  if (!Array.isArray(raw)) return [];
  const out: AffectedHousehold[] = [];
  for (const item of raw.slice(0, 100)) {
    const o = item as Record<string, unknown> | null;
    if (typeof o === 'object' && o !== null && typeof o['householdId'] === 'string' && typeof o['name'] === 'string' && Number.isInteger(o['activeMembers']) && Number.isInteger(o['sharedPets'])) {
      out.push({ householdId: o['householdId'], name: o['name'], activeMembers: o['activeMembers'] as number, sharedPets: o['sharedPets'] as number });
    }
  }
  return out;
}

/** `transport`: por defecto el de `api.ts`; toda respuesta correcta notifica la actividad de sesión (INV-AUTH2-002). */
export function createAccountDeletionApi(transport: RawTransport = createRawTransport(''), baseUrl = '/api'): AccountDeletionApi {
  async function send(path: string, body?: string): Promise<Response> {
    let response: Response;
    try {
      response = await transport(`${baseUrl}${path}`, { method: 'POST', headers: { 'X-Argos-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body }) });
    } catch {
      throw new DeletionApiError(UNEXPECTED_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_CODE;
      let households: AffectedHousehold[] = [];
      try {
        const problem = (await response.json()) as { code?: unknown; households?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
        if (code === HOUSEHOLDS_ACTIVE_CODE) households = parseHouseholds(problem.households);
      } catch {
        // Cuerpo no JSON: se informa como inesperado con el estado HTTP real.
      }
      throw new DeletionApiError(code, response.status, households);
    }
    notifyActivity();
    return response;
  }
  return {
    async startReauth() {
      const response = await send('/account/deletion/reauth');
      let url: unknown;
      try {
        url = ((await response.json()) as { authorizationUrl?: unknown }).authorizationUrl;
      } catch {
        url = undefined;
      }
      if (typeof url !== 'string' || !GOOGLE_URL.test(url)) throw new DeletionApiError(UNEXPECTED_CODE, response.status);
      return url;
    },
    async deleteAccount(body) {
      await send('/account/deletion/google', JSON.stringify(body));
    },
  };
}

export interface DeletionFeedback {
  /** Mensaje global (hogares activos u otro error del catálogo). */
  readonly message: string | null;
  /** Falta la prueba de titularidad: se ofrece de nuevo «Confirmar con Google». */
  readonly reauthMessage: string | null;
  readonly households: readonly AffectedHousehold[];
}

/** Reparto de un error del borrado: texto del catálogo (nunca el cuerpo del servidor) y, en el 409 de hogares, su lista. */
export function deletionFeedback(error: DeletionApiError): DeletionFeedback {
  if (error.code === DELETION_REAUTH_REQUIRED_CODE) return { message: null, reauthMessage: DELETION_REAUTH_REQUIRED_MESSAGE, households: [] };
  if (error.code === HOUSEHOLDS_ACTIVE_CODE) return { message: HOUSEHOLDS_ACTIVE_MESSAGE, reauthMessage: null, households: error.households };
  const known = toProblem({ code: error.code });
  return { message: problemMessage(known.code === error.code ? known : catalogProblem(UNEXPECTED_CODE)), reauthMessage: null, households: [] };
}
