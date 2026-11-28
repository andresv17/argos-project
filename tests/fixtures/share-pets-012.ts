/**
 * Arnés de la feature 012, Bloque E (#81, T1693/T1694; ENM-005-E 0.2.2 APPROVED): alcance `PETS` del enlace para el veterinario.
 *
 * ROJO hasta T1695: las pruebas llaman a las rutas del OpenAPI `share-links-pets.openapi.yaml` (aún sin implementar) y a módulos que aún no existen. La API de los módulos es la SUPUESTA por T1693
 * (a confirmar por T1695): se cargan con `loadModule` (especificador dinámico) para que la ausencia sea un fallo de la prueba y no un error de compilación del resto del repositorio.
 *   - `src/application/sharing/resolve-eligible-pets.ts`: `resolveEligiblePets(repositories, { userId, householdId, petIds }) -> Promise<{ eligible: PetProfile[]; hasAnyEligibleInHousehold: boolean }>`
 *     (una sola consulta acotada a 20 ids; `eligible` ordenado por `(name ASC, id ASC)`, REQ-PET-005).
 *   - `src/application/use-cases/share-pets-use-cases.ts`: `CreatePetsShareLinkUseCase.execute(userId, householdId, idempotencyKey, body)`, `PetsLinkRevocation.revokeForPetLeftHousehold(...)`.
 */
import { createShareApi, type ShareApi, type ShareApiResponse } from './share-api-harness.ts';
import { ANDRES, ARGOS, CARLOS, LUCIA, MARIA, cases, makeCoOwners, principalOf, requestRows } from './co-ownership-012.ts';
import { HOUSEHOLD_ID, KEY } from './share-harness.ts';
import { ANDRES_PETS, LUNA } from './application-harness.ts';

export { ANDRES, ARGOS, CARLOS, HOUSEHOLD_ID, KEY, LUCIA, LUNA, MARIA, cases, principalOf, requestRows };

/** Las cinco mascotas de ANDRES en Casa Vallejo (Argos, Kira, Nyx, Milo, Toby) y la de MARIA (Luna, ajena para ANDRES). */
export const [P_ARGOS, P_KIRA, P_NYX, P_MILO, P_TOBY] = ANDRES_PETS.map((p) => p.id) as [string, string, string, string, string];
export const NAMES: Readonly<Record<string, string>> = Object.fromEntries([...ANDRES_PETS, LUNA].map((p) => [p.id, p.name]));
export const H = HOUSEHOLD_ID;
export const PETS_URL = `/api/households/${H}/share-links/pets`;
export const PREVIEW_URL = `/api/households/${H}/clinical-summary/pets`;
export const withKey = (n: number): Record<string, string> => ({ 'idempotency-key': KEY(n) });
export const tokenOf = (url: unknown): string => String(url).split('/shared/')[1]!;
export const codeOf = (r: ShareApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;

/** Carga un módulo que T1695 debe crear; si falta, la prueba falla con un mensaje claro (rojo por falta de implementación). */
export async function loadModule<T = Record<string, unknown>>(path: string): Promise<T> {
  const specifier = `../../${path}`;
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch (cause) {
    throw new Error(`ROJO T1693: falta implementar ${path} (T1695)`, { cause });
  }
}

/** API real sobre SQLite con la bandera `ARGOS_SHARE_PETS_CREATE_ENABLED` inyectada (por defecto ON para probar el alcance; `false` prueba el fail-closed). */
export const petsApi = (options: { enabled?: boolean; role?: 'ADMIN' | 'CAREGIVER' | 'READER' } = {}): Promise<ShareApi> =>
  createShareApi({ petsCreateEnabled: options.enabled ?? true, ...(options.role === undefined ? {} : { role: options.role }) });

export const createPets = (api: ShareApi, cookie: string, body: unknown, key = 1, householdUrl = PETS_URL): Promise<ShareApiResponse> =>
  api.call('POST', householdUrl, { cookie, body, headers: withKey(key) });

/** Crea el enlace y exige 201; devuelve id, token y la vista. */
export async function makePets(api: ShareApi, cookie: string, petIds: readonly string[], key = 1, extra: Record<string, unknown> = {}): Promise<{ id: string; token: string; response: ShareApiResponse }> {
  const response = await createPets(api, cookie, { petIds, ...extra }, key);
  if (response.status !== 201) throw new Error(`createPetsShareLink esperaba 201 y dio ${response.status}: ${response.text}`);
  const result = response.json as { link: { id: string }; url: string };
  return { id: result.link.id, token: tokenOf(result.url), response };
}

/** Hace a `userId` co-propietario ACTIVE de la mascota (invitación + aceptación por los casos de uso reales). */
export const coOwn = (api: ShareApi, userId: string, petId: string = ARGOS.id): Promise<string[]> =>
  makeCoOwners(
    { deps: api.deps, run: (work) => api.deps.uow.runInTransaction(work), setNow: (iso) => api.clock.setClock(iso.slice(0, 10), iso) },
    [userId],
    petId,
    ANDRES,
  );

/** Filas persistidas del enlace `PETS` (verificación directa; no hay otra ruta para el conjunto). */
export const linkRow = (api: ShareApi, id: string): { scope: string; revoked_at: string | null; household_id: string | null; pet_id: string | null } | undefined =>
  api.db.prepare('SELECT scope, revoked_at, household_id, pet_id FROM share_links WHERE id = ?').get(id) as never;
export const petRows = (api: ShareApi, id: string): string[] => api.db.prepare('SELECT pet_id FROM share_link_pets WHERE share_link_id = ? ORDER BY pet_id').pluck().all(id) as string[];
export const auditTypes = (api: ShareApi, id: string): string[] => api.db.prepare('SELECT event_type FROM share_link_audit WHERE share_link_id = ? ORDER BY occurred_at, id').pluck().all(id) as string[];
