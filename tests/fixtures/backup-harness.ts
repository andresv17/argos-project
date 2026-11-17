import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import { DomainError, type BackupEnvelopeV3 } from '../../src/generated/index.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { BackupImportStep } from '../../src/application/use-cases/backup-use-cases.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { canonicalState, fixtures } from './application-harness.ts';
import { upgradeEnvelope, upgradeRecords } from './storage-upgrade.ts';
import type { MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import type { PetRecordCollections } from '../../src/domain/pet/pet-invariants.ts';

/**
 * Copia del sobre 2.0.0 canónico tal como lo escribió la 001 (DOG/CAT, `ownerUserId` por mascota, `exportedByUserId`,
 * registros sin los campos 3.0.0), opcionalmente modificada. H-R5-4: es un 2.0.0 VÁLIDO (cumple BackupEnvelopeV2Legacy);
 * el tipo de retorno sigue siendo BackupEnvelopeV3 solo para que `upgradeEnvelope(v2())` y los mutadores de las pruebas
 * existentes compilen. Para un 3.0.0 válido use `v3()`.
 */
export function v2(mutate: (e: BackupEnvelopeV3) => void = () => {}): BackupEnvelopeV3 {
  const copy = structuredClone(fixtures.validBackupEnvelopeV2) as BackupEnvelopeV3;
  mutate(copy);
  return copy;
}

/**
 * Sobre 3.0.0 válido de Andrés (sin `ownerUserId` ni `exportedByUserId`): el 2.0.0 canónico elevado con las reglas de
 * la máquina (DOG/CAT → CANINE/FELINE, campos nuevos neutros) y despojado de los campos de propiedad.
 */
export function v3(mutate: (e: BackupEnvelopeV3) => void = () => {}): BackupEnvelopeV3 {
  const { exportedByUserId: _by, ...root } = upgradeEnvelope(v2()) as BackupEnvelopeV3 & { exportedByUserId?: string };
  const copy = {
    ...root,
    schemaVersion: '3.0.0',
    pets: root.pets.map(({ ownerUserId: _owner, ...pet }: BackupEnvelopeV3['pets'][number] & { ownerUserId?: string }) => pet),
  } as unknown as BackupEnvelopeV3;
  mutate(copy);
  return copy;
}

/** Estado canónico con los registros ya en la forma 3.0.0 (lo que la exportación valida; H-R5-4). */
export function validBackupState(): MemoryState {
  const state = canonicalState();
  state.records = upgradeRecords(state.records as unknown as PetRecordCollections) as unknown as MemoryState['records'];
  return state;
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
/** Un 3.0.0 válido llega a las invariantes sin migrar; un 2.0.0 o 1.0.0 pasa por MIGRATING_LEGACY_ENVELOPE (T276). */
export const V3_UNTIL_INVARIANTS = [...UNTIL_VALIDATION, 'SCHEMA_V3_VALID>CHECKING_DOMAIN_INVARIANTS'];
export const V2_UNTIL_INVARIANTS = [...UNTIL_VALIDATION, 'LEGACY_V2_VALID>MIGRATING_LEGACY_ENVELOPE', 'MIGRATION_SUCCESS>CHECKING_DOMAIN_INVARIANTS'];
export const V1_UNTIL_INVARIANTS = [...UNTIL_VALIDATION, 'LEGACY_V1_VALID>MIGRATING_LEGACY_ENVELOPE', 'MIGRATION_SUCCESS>CHECKING_DOMAIN_INVARIANTS'];
/** Camino de un 3.0.0 hasta COMMITTING_SNAPSHOT. */
export const UNTIL_COMMIT = [...V3_UNTIL_INVARIANTS, 'INVARIANTS_VALID>COMMITTING_SNAPSHOT'];

/** SHA-256 hexadecimal de los bytes del archivo: el valor de `X-Argos-Import-Confirm` (fileDigest). */
export const digestOf = (payload: string | Uint8Array): string =>
  createHash('sha256').update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload).digest('hex');

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
