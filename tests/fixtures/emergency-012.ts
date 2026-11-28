/**
 * Arnés de la feature 012 (Bloque D, #32; T1674): los MISMOS casos de uso de la ficha QR sobre memoria, SQLite en memoria y PostgreSQL 17 real (se OMITE sin `TEST_DATABASE_URL`), reutilizando
 * los motores de `co-ownership-012.ts` (ANDRES principal de ARGOS; MARIA, LUCIA y CARLOS pueden ser co-propietarios con `makeCoOwners`).
 *
 * ROJO hasta T1675: carga por import dinámico (`emergency-modules.ts`, precedente `chip-012.ts`; `tsc` sigue en verde) `src/application/use-cases/emergency-use-cases.ts`, que aún no existe. La API es la SUPUESTA por T1674 (nombres de los `operationId` de `emergency.openapi.yaml`):
 * `execute(actorUserId, petId, body)` como el resto de casos de uso. La configuración de la ficha entra por `deps.emergency` (clave HMAC del teléfono, URL pública, versión del aviso, entropía del token);
 * los repositorios `repositories.emergencyCards` y `repositories.emergencyConsents` exponen `findByPet(petId)` y `listByPet(petId)` con filas en camelCase.
 */
import { createHash } from 'node:crypto';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { loadEmergencyModule, type UseCaseClass, type UseCasesModule } from './emergency-modules.ts';
import { ANDRES, ARGOS, CARLOS, ENGINE_FACTORIES, HAS_POSTGRES, LUCIA, MARIA, PET, cases as coOwnerCases, codeOf, makeCoOwners, type Engine012, type Row } from './co-ownership-012.ts';

export { ANDRES, ARGOS, CARLOS, ENGINE_FACTORIES, HAS_POSTGRES, LUCIA, MARIA, PET, codeOf, makeCoOwners };
export type { Engine012, Row };

export const BASE_URL = 'https://argos.example';
export const KEY_A = 'phone-hmac-key-A-0123456789abcdef0123456789';
export const KEY_B = 'phone-hmac-key-B-0123456789abcdef0123456789';
export const NOTICE = '0.1.0';
/** Reloj de las pruebas: lo deja `makeCoOwners` (jueves 2026-11-26 11:00Z). */
export const T0 = '2026-11-26T11:00:00.000Z';
export const PHONE_A = '+573001112233';
export const PHONE_M = '+573004445566';
export const PHONE_L = '+573007778899';
export const PHONE_C = '+573009990011';
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const hoursAfter = (iso: string, hours: number): string => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
export const daysAfter = (iso: string, days: number): string => hoursAfter(iso, days * 24);

export interface EmergencyConfigOverrides {
  readonly phoneHmacKey?: string;
  readonly noticeVersion?: string;
  readonly noticeEffectiveAt?: string;
  readonly publicBaseUrl?: string;
}

/** Entropía determinista de 32 bytes por token (solo pruebas): cada llamada devuelve bytes distintos. */
export class SequentialEntropy {
  private counter = 0;
  next32(): Uint8Array {
    this.counter += 1;
    return Uint8Array.from({ length: 32 }, (_, i) => (this.counter * 7 + i * 3) % 256);
  }
}

export function emergencyDeps(engine: Pick<Engine012, 'deps'>, overrides: EmergencyConfigOverrides = {}, entropy: SequentialEntropy = new SequentialEntropy()): ApplicationDeps {
  return {
    ...engine.deps,
    emergency: {
      phoneHmacKey: overrides.phoneHmacKey ?? KEY_A,
      publicBaseUrl: overrides.publicBaseUrl ?? BASE_URL,
      noticeVersion: overrides.noticeVersion ?? NOTICE,
      noticeEffectiveAt: overrides.noticeEffectiveAt ?? '2026-11-01T00:00:00.000Z',
      entropy,
    },
  } as ApplicationDeps;
}

const useCases = await loadEmergencyModule<UseCasesModule>('application/use-cases/emergency-use-cases');
const call = (cls: () => UseCaseClass, deps: ApplicationDeps, ...args: unknown[]): Promise<Record<string, unknown>> => new (cls())(deps as never).execute(...(args as never[])) as Promise<Record<string, unknown>>;

/** Casos de uso de la ficha QR ligados a unas dependencias. */
export function emergencyCases(deps: ApplicationDeps) {
  return {
    status: (actor: string, petId: string) => call(() => useCases.GetEmergencyCardStatusUseCase, deps, actor, petId),
    activate: (actor: string, petId: string, body: Record<string, unknown> = { consentAccepted: true, noticeVersion: NOTICE }) => call(() => useCases.ActivateEmergencyCardUseCase, deps, actor, petId, body),
    regenerate: (actor: string, petId: string, body: Record<string, unknown> = { consentAccepted: true, noticeVersion: NOTICE }) => call(() => useCases.RegenerateEmergencyCardUseCase, deps, actor, petId, body),
    deactivate: (actor: string, petId: string) => call(() => useCases.DeactivateEmergencyCardUseCase, deps, actor, petId),
    setConsent: (actor: string, petId: string, body: Record<string, unknown>) => call(() => useCases.SetEmergencyPhoneConsentUseCase, deps, actor, petId, body),
    updateAllergies: (actor: string, petId: string, criticalAllergies: unknown) => call(() => useCases.UpdateCriticalAllergiesUseCase, deps, actor, petId, { criticalAllergies }),
    updatePhone: (actor: string, phone: string | null) => call(() => useCases.UpdateAccountPhoneUseCase, deps, actor, { phone }),
    /** Lectura pública por token (anónima): devuelve la vista o lanza `ERR-PET-NOT-FOUND`. Nunca escribe salvo `last_scanned_at` con granularidad. */
    publicView: (token: string) => call(() => useCases.GetEmergencyCardPublicUseCase, deps, token),
    maintenance: () => call(() => useCases.RunEmergencyMaintenanceUseCase, deps),
    /** Barrido de rotación de `PHONE_HMAC_KEY` (anexo §9): recalcula o borra, nunca deja en espera. */
    rotateKey: () => call(() => useCases.RotatePhoneHmacKeyUseCase, deps),
    coOwners: coOwnerCases(deps),
  };
}

/** Repositorios nuevos del Bloque D (puertos `EmergencyCardRepository` y `EmergencyConsentRepository`, T1675) y escritura fuera de banda del teléfono (`users.setPhone`, solo para provocar una guarda rota sin reconciliar). */
interface EmergencyRepos {
  readonly emergencyCards: { findByPet(petId: string): Promise<unknown> };
  readonly emergencyConsents: { listByPet(petId: string): Promise<readonly unknown[]> };
  readonly users: { setPhone(userId: string, phone: string | null): Promise<void> };
}
const repos = (r: unknown): EmergencyRepos => r as EmergencyRepos;

export const cardRow = (engine: Pick<Engine012, 'run'>, petId: string = PET): Promise<Row | null> => engine.run(async (r) => ((await repos(r).emergencyCards.findByPet(petId)) ?? null) as Row | null);
export const consentRows = (engine: Pick<Engine012, 'run'>, petId: string = PET): Promise<Row[]> => engine.run(async (r) => [...(await repos(r).emergencyConsents.listByPet(petId))] as Row[]);
export const accountPhone = (engine: Pick<Engine012, 'run'>, userId: string): Promise<string | null> => engine.run(async (r) => ((await r.users.findById(userId)) as unknown as { phone?: string | null } | null)?.phone ?? null);

/** Fija o borra `users.phone` SIN reconciliar fichas (simula un dato alterado fuera de banda: la lectura perezosa debe fallar cerrada y reconciliar). */
export const setPhoneOutOfBand = (engine: Pick<Engine012, 'run'>, userId: string, phone: string | null): Promise<void> => engine.run((r) => repos(r).users.setPhone(userId, phone));
