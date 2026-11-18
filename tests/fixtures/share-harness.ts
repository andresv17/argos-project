/**
 * Arnés de pruebas del enlace veterinario (feature 005, US4): los mismos casos de uso sobre la unidad de trabajo en memoria y sobre SQLite en
 * memoria (motores de medios + `deps.sharing`), con tokens deterministas, reloj contado, registro de llamadas a puertos y lectura uniforme
 * de las tablas `share_links` y `share_link_audit`.
 */
import { createHash } from 'node:crypto';
import type { ShareTokenGeneratorPort } from '../../src/application/ports/share-link.port.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { SharedAccessLimiter } from '../../src/application/sharing/shared-access-limiter.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../src/generated/v31/index.ts';
import { DomainError as DomainErrorV33 } from '../../src/generated/v33/index.ts';
import type { HouseholdRole } from './record-engines.ts';
import { ANDRES, ARGOS, LUCIA, MARIA, createMediaEngines, type MediaEngine } from './media-harness.ts';
import { LUNA, GENERATED_IDS, generatedId } from './application-harness.ts';

export { ANDRES, ARGOS, LUCIA, MARIA, LUNA };

/** Clave HMAC dedicada de la IP (distinta de la de auditoría y de sesión). */
export const SHARE_IP_SECRET = 'ab'.repeat(32);
export const KEY = (n: number): string => `5a5a5a5a-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';

/** Genera tokens de 43 caracteres base64url deterministas (no sirven en producción: solo en pruebas). */
export class SequentialShareTokenGenerator implements ShareTokenGeneratorPort {
  count = 0;
  /** `prefix` distinto por conexión: dos conexiones nunca emiten el mismo token. */
  constructor(private readonly prefix = 'share-token') {}
  readonly issued: string[] = [];
  nextShareToken(): string {
    this.count += 1;
    const token = createHash('sha256').update(`${this.prefix}-${this.count}`).digest('base64url');
    this.issued.push(token);
    return token;
  }
}

/** Código de cualquiera de las tres clases de DomainError (002, 004, 005) o `OK`; otro error se relanza. */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31 || error instanceof DomainErrorV33) return error.code;
    throw error;
  }
}

export async function errorOf(promise: Promise<unknown>): Promise<DomainError | DomainErrorV31 | DomainErrorV33> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31 || error instanceof DomainErrorV33) return error;
    throw error;
  }
  throw new Error('se esperaba un rechazo');
}

export interface ShareLinkRow {
  readonly id: string;
  readonly tokenHash: string;
  readonly scope: string;
  readonly petId: string | null;
  readonly householdId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly expiresInDays: number;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  readonly idempotencyKey: string;
  readonly petOwnerUserIdAtCreation: string | null;
}

export interface ShareAuditRow {
  readonly id: string;
  readonly shareLinkId: string | null;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly ipHmac: string | null;
  readonly failCount: number;
}

export interface ShareEngine {
  readonly name: MediaEngine['name'];
  readonly deps: ApplicationDeps;
  readonly base: MediaEngine;
  readonly tokens: SequentialShareTokenGenerator;
  readonly limiter: SharedAccessLimiter;
  /** Cuántas veces se leyó el reloj (`nowIsoTimestamp`) desde el último `resetCalls`. */
  readonly clockReads: () => number;
  /** Llamadas a repositorios (`repo.método`) desde el último `resetCalls`. */
  readonly calls: string[];
  resetCalls(): void;
  rows(): Promise<ShareLinkRow[]>;
  audit(): Promise<ShareAuditRow[]>;
  run<T>(work: (r: RepositorySet) => Promise<T>): Promise<T>;
  /** Reloj controlado de la prueba (instante fijo). */
  setNow(iso: string): void;
  close(): void;
}

/** Envuelve la unidad de trabajo para registrar `repositorio.método` de cada llamada (secuencia de puertos, SC-005-021). */
export function recording(uow: UnitOfWorkPort, calls: string[]): UnitOfWorkPort {
  const wrapSet = (repositories: RepositorySet): RepositorySet =>
    new Proxy(repositories, {
      get(target, repoName) {
        const repo = (target as unknown as Record<string | symbol, unknown>)[repoName];
        if (typeof repo !== 'object' || repo === null) return repo;
        return new Proxy(repo, {
          get(inner, method) {
            const fn = (inner as Record<string | symbol, unknown>)[method];
            if (typeof fn !== 'function') return fn;
            return (...args: unknown[]) => {
              calls.push(`${String(repoName)}.${String(method)}`);
              return (fn as (...a: unknown[]) => unknown).apply(inner, args);
            };
          },
        });
      },
    });
  const wrapped: UnitOfWorkPort = {
    runInTransaction: (work) => {
      calls.push('uow.write');
      return uow.runInTransaction((r) => work(wrapSet(r)));
    },
    ...(uow.runReadOnly === undefined
      ? {}
      : {
          runReadOnly: <T>(work: (r: RepositorySet) => Promise<T>) => {
            calls.push('uow.read');
            return uow.runReadOnly!((r) => work(wrapSet(r)));
          },
        }),
  };
  return wrapped;
}

export interface ShareEngineOptions {
  readonly ids?: readonly string[];
  readonly limiter?: SharedAccessLimiter;
}

/** Motores de memoria y SQLite con los casos de uso del enlace conectados. */
export async function createShareEngines(role: HouseholdRole | null = null, options: ShareEngineOptions = {}): Promise<ShareEngine[]> {
  const ids = options.ids ?? Array.from({ length: 300 }, (_, i) => generatedId(i + 1));
  const bases = await createMediaEngines(role, { ids });
  return bases.map((base): ShareEngine => {
    const tokens = new SequentialShareTokenGenerator();
    const limiter = options.limiter ?? new SharedAccessLimiter();
    const calls: string[] = [];
    let reads = 0;
    const clock = new Proxy(base.deps.clock, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop === 'nowIsoTimestamp' && typeof value === 'function') {
          return () => {
            reads += 1;
            return (value as () => string).call(target);
          };
        }
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const deps: ApplicationDeps = { ...base.deps, clock, uow: recording(base.deps.uow, calls), sharing: { tokens, ipHmacSecret: SHARE_IP_SECRET, limiter } };
    const rawRows = async (): Promise<ShareLinkRow[]> =>
      (await base.run((r) => r.shareLinks.listAll())) as unknown as ShareLinkRow[];
    return {
      name: base.name,
      deps,
      base,
      tokens,
      limiter,
      clockReads: () => reads,
      calls,
      resetCalls: () => {
        calls.length = 0;
        reads = 0;
      },
      rows: rawRows,
      audit: async () => (await base.run((r) => r.shareAudit.listAll())) as unknown as ShareAuditRow[],
      run: (work) => base.run(work),
      setNow: (iso) => base.clock.setClock(iso.slice(0, 10), iso),
      close: () => base.close(),
    };
  });
}

/** Ids reservados del arnés (los de entidades salen de `ids`; los de auditoría de `auditIds`). */
export { GENERATED_IDS };
