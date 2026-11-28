/**
 * Cargador de los módulos del Bloque D (012, #32) que T1672/T1673/T1675 aún NO han creado cuando se escriben las pruebas rojas de T1674 (precedente: `chip-012.ts`).
 * Cada prueba falla con «módulo ausente» (ROJO), no por un aserto trivial, y `tsc --noEmit` sigue en verde porque los tipos son LOCALES (la API SUPUESTA de abajo). Cuando el módulo existe,
 * la misma prueba pasa a ejercitar el comportamiento. Un módulo que existe pero lanza otro error (p. ej. una importación rota) se relanza tal cual.
 */
import type { FastifyInstance } from 'fastify';

export async function loadEmergencyModule<T extends object>(relative: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ `../../src/${relative}.ts`)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/Failed to load url|Cannot find module|Failed to resolve import|ERR_MODULE_NOT_FOUND/.test(message) || !message.includes(relative.split('/').at(-1)!)) throw error;
    return new Proxy({} as T, {
      get: (_target, prop) => {
        if (prop === 'then') return undefined;
        throw new Error(`módulo ausente: src/${relative}.ts (se pidió «${String(prop)}»)`);
      },
    });
  }
}

export interface PhoneModule {
  normalizeE164(input: unknown): string;
}
export interface TextPolicyModule {
  normalizeCriticalAllergies(input: unknown): string[];
  sanitizePublicPetName(name: string): string | null;
}
export interface TokenModule {
  generateEmergencyToken(entropy: Uint8Array): string;
  hashEmergencyToken(token: string): string;
  isWellFormedEmergencyToken(token: string): boolean;
}
export interface ContactCandidate {
  readonly userId: string;
  readonly phone: string;
  readonly joinedAt: string;
  readonly isPrincipal: boolean;
}
export interface AuditEventRef {
  readonly type: string;
  readonly actorUserId: string | null;
  readonly occurredAt: string;
}
export interface RulesModule {
  isNoticeCompatible(stored: string, current: string): boolean;
  isNoticeWaitExpired(effectiveAtIso: string, nowIso: string): boolean;
  selectContactPhones(candidates: readonly ContactCandidate[]): string[];
  evaluateGuard(input: { visiblePhones: number; allergies: number }): boolean;
  deriveLastChange(events: readonly AuditEventRef[], viewerUserId: string, nowIso: string): { kind: string; at: string; byMe: boolean } | null;
  deriveCriticalAllergiesChange(events: readonly AuditEventRef[], viewerUserId: string, nowIso: string): { at: string; byMe: boolean } | null;
  truncateLastScanned(nowIso: string): string;
  shouldRefreshLastScanned(previousIso: string | null, nowIso: string): boolean;
}
export interface QrModule {
  readonly QR_SIZE: number;
  readonly QR_MAX_BYTES: number;
  encodeQr(data: string | Uint8Array, options?: { mask?: number }): { size: number; mask: number; modules: boolean[][] };
  qrToSvg(qr: { size: number; mask: number; modules: boolean[][] }): string;
}
export interface PublicRoutesOptions {
  readonly lookupByTokenHash: (hash: string) => Promise<{ petName: string; criticalAllergies: string[]; contactPhones: Array<{ phone: string }> } | null>;
  readonly ipSecret: string;
  readonly clock: { now(): Date };
}
export interface RoutesModule {
  registerEmergencyPublicRoutes(app: FastifyInstance, options: PublicRoutesOptions): Promise<void>;
}
/** Clase de caso de uso con `execute(...)` (API supuesta: `operationId` de `emergency.openapi.yaml`). */
export type UseCaseClass = new (deps: never) => { execute(...args: never[]): Promise<unknown> };
export interface UseCasesModule {
  readonly ActivateEmergencyCardUseCase: UseCaseClass;
  readonly DeactivateEmergencyCardUseCase: UseCaseClass;
  readonly GetEmergencyCardPublicUseCase: UseCaseClass;
  readonly GetEmergencyCardStatusUseCase: UseCaseClass;
  readonly RegenerateEmergencyCardUseCase: UseCaseClass;
  readonly RotatePhoneHmacKeyUseCase: UseCaseClass;
  readonly RunEmergencyMaintenanceUseCase: UseCaseClass;
  readonly SetEmergencyPhoneConsentUseCase: UseCaseClass;
  readonly UpdateAccountPhoneUseCase: UseCaseClass;
  readonly UpdateCriticalAllergiesUseCase: UseCaseClass;
}
