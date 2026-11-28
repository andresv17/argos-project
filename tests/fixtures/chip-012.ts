/**
 * Arnés de las pruebas ROJAS de T1634 (Feature 012, Bloque B, #23). Carga por import dinámico los módulos que T1635, T1640, T1641 y T1642 aún NO han creado: cada prueba falla con
 * «módulo ausente» (ROJO), no por un aserto trivial, y `tsc --noEmit` sigue en verde porque los tipos son LOCALES (la API supuesta de abajo). Cuando el módulo exista, la misma prueba
 * pasa a ejercitar el comportamiento. La API es la SUPUESTA por T1634, derivada de los `operationId` de `contracts/openapi/chip-claim.openapi.yaml` y `admin-disputes.openapi.yaml`.
 */
import { DomainError } from '../../src/generated/index.ts';

/** Nombres de módulo permitidos (cada uno es un archivo que T1635/T1640/T1641/T1642 deben crear). */
export type ChipModule = 'chip-claim-use-cases' | 'chip-dispute-use-cases' | 'chip-uniqueness' | 'chip-ip-rate-limit' | 'chip-dispute-admin-use-cases';

/** Importa `src/application/use-cases/<nombre>.ts`; si no existe lanza el error de «módulo ausente» que hace ROJA la prueba. */
export async function loadChipModule<T>(name: ChipModule): Promise<T> {
  return (await import(/* @vite-ignore */ `../../src/application/use-cases/${name}.ts`)) as T;
}

/** Puerto nuevo de contadores por IP (`ip_rate_events`, T1640): `src/application/ports/ip-rate-events.port.ts`. */
export async function loadIpRateEventsPort(): Promise<unknown> {
  return import(/* @vite-ignore */ `../../src/application/ports/${'ip-rate-events'}.port.ts`);
}

/** Chips de prueba: 15 dígitos ASCII (REQ-CHP12-002). */
export const CHIP_A = '985112345678901';
export const CHIP_B = '985112345678902';
export const CHIP_FREE = '985112345678999';
export const last4 = (chip: string): string => chip.slice(-4);

/** Código del DomainError, o `OK` si no falló (otro error se relanza). */
export async function codeOfChip(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR-')) return code;
    throw error;
  }
}

/** Forma supuesta de un caso de uso de 012 Bloque B. */
export interface UseCaseClass<I = unknown, O = unknown> {
  new (deps: unknown): { execute(actorUserId: string, ...args: I[]): Promise<O> };
}
