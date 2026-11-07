import { expect } from 'vitest';
import { DomainError, type BackupEnvelopeV2 } from '../../src/generated/index.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { BackupImportStep } from '../../src/application/use-cases/backup-use-cases.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { canonicalState, envelope } from './application-harness.ts';

/** Copia del sobre v2 canónico, opcionalmente modificada. */
export function v2(mutate: (e: BackupEnvelopeV2) => void = () => {}): BackupEnvelopeV2 {
  const copy = structuredClone(envelope);
  mutate(copy);
  return copy;
}

export interface Failure {
  readonly code: string;
  readonly status: number;
  readonly field: string | null;
  readonly finalState: string | null;
  readonly detail: string;
}

/** Rechazo como DomainError, con los campos que verifica la prueba. Falla si la promesa se cumple. */
export async function failure(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { code: error.code, status: error.status, field: error.field, finalState: error.finalState, detail: error.detail };
  }
  throw new Error('se esperaba un rechazo');
}

/** Pasos `EVENTO>DESTINO`, comprobando que cada paso parte de donde terminó el anterior, empezando en IDLE. */
export function path(steps: readonly BackupImportStep[]): string[] {
  expect(steps.map((s) => s.from)).toEqual(['IDLE', ...steps.slice(0, -1).map((s) => s.to)]);
  return steps.map((s) => `${s.event}>${s.to}`);
}

export const UNTIL_VALIDATION = ['START_IMPORT>CHECKING_PAYLOAD_SIZE', 'SIZE_OK>PARSING_JSON', 'PARSE_SUCCESS>VALIDATING_VERSION_AND_SCHEMA'];
export const V2_UNTIL_INVARIANTS = [...UNTIL_VALIDATION, 'SCHEMA_V2_VALID>CHECKING_DOMAIN_INVARIANTS'];
export const V1_UNTIL_INVARIANTS = [...UNTIL_VALIDATION, 'LEGACY_V1_VALID>MIGRATING_LEGACY_ENVELOPE', 'MIGRATION_SUCCESS>CHECKING_DOMAIN_INVARIANTS'];
export const UNTIL_COMMIT = [...V2_UNTIL_INVARIANTS, 'INVARIANTS_VALID>COMMITTING_SNAPSHOT'];

/** Unidad de trabajo cuyo comportamiento fija la prueba, con un contador de transacciones. */
export class ScriptedUnitOfWork implements UnitOfWorkPort {
  calls = 0;
  readonly inner = new InMemoryUnitOfWork(canonicalState());

  constructor(private readonly behaviour: (inner: InMemoryUnitOfWork, work: (r: RepositorySet) => Promise<unknown>) => Promise<unknown>) {}

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    this.calls += 1;
    return this.behaviour(this.inner, work) as Promise<T>;
  }
}
