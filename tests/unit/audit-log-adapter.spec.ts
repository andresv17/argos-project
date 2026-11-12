import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../src/generated/index.ts';
import { RepositoryAuditLogAdapter } from '../../src/infrastructure/adapters/repository-audit-log.adapter.ts';
import { InMemoryUnitOfWork, emptyMemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';

/** T262 — (lee el estado privado de la unidad de trabajo: el puerto de auditoría no tiene lectura por diseño)  adaptador real de AuditLogPort sobre la unidad de trabajo en memoria (REQ-AUD-001, INV-ARCH-005). */
const USER = 'a0000000-0000-4000-8000-000000000004';
const entry = (n: number, executorUserId: string, entityId: string): AuditEntry => ({
  id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  timestamp: '2026-11-05T12:00:00.000Z',
  executorUserId,
  mutationType: 'UPDATE',
  entityType: 'USER',
  entityId,
  previousStateHash: 'a'.repeat(64),
  newStateHash: 'b'.repeat(64),
});

describe('RepositoryAuditLogAdapter en memoria (REQ-AUD-001)', () => {
  it('[REQ-AUD-001][INV-ARCH-005] la fila confirma con la transacción y se descarta si la transacción falla', async () => {
    const state = emptyMemoryState();
    const uow = new InMemoryUnitOfWork(state);
    const adapter = new RepositoryAuditLogAdapter();
    await uow.runInTransaction((r) => adapter.append(r, entry(1, USER, USER)));
    await expect(
      uow.runInTransaction(async (r) => {
        await adapter.append(r, entry(2, USER, USER));
        throw new Error('fallo posterior a la auditoría');
      }),
    ).rejects.toThrow('fallo posterior a la auditoría');
    const rows = (uow as unknown as { state: { auditLog: AuditEntry[] } }).state.auditLog;
    expect(rows.map((r) => r.id)).toEqual([entry(1, USER, USER).id]);
  });

  it('[REQ-AUD-001] pseudonymizeUser reemplaza el userId en executorUserId y entityId y no toca otras filas', async () => {
    const uow = new InMemoryUnitOfWork(emptyMemoryState());
    const adapter = new RepositoryAuditLogAdapter();
    const hmac = 'c'.repeat(64);
    await uow.runInTransaction(async (r) => {
      await adapter.append(r, entry(1, USER, USER));
      await adapter.append(r, entry(2, 'other-user', 'pet-1'));
      await adapter.pseudonymizeUser(r, USER, hmac);
    });
    const rows = (uow as unknown as { state: { auditLog: AuditEntry[] } }).state.auditLog;
    expect(rows.map((r) => [r.executorUserId, r.entityId])).toEqual([
      [hmac, hmac],
      ['other-user', 'pet-1'],
    ]);
  });
});
