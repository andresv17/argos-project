/**
 * Almacén de los `StepUpGrant` de `/admin/disputes` (Feature 012, Bloque B, #23, T1636; REQ-CHP12-009, INV-CHP12-006; `admin-disputes.openapi.yaml`, `stepUpAdminDispute`).
 * Un grant está ligado a `(adminId, disputeId, acción)`, es de UN SOLO USO y vigente `ADMIN_STEPUP_WINDOW_MINUTES` (5). Vive en la MEMORIA de la instancia (acotado y con purga perezosa):
 * una instancia que no emitió el grant responde 403 genérico y el administrador pide otro (falla cerrada). La compuerta pura es `assertStepUpGrant` (capa de aplicación).
 *
 * @implements REQ-CHP12-009, INV-CHP12-006
 */

import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { ADMIN_STEPUP_WINDOW_MINUTES } from '../../domain/platform/feature-012-limits.ts';
import { assertStepUpGrant, type StepUpGrantRecord } from '../../application/use-cases/chip-dispute-admin-use-cases.ts';

const MAX_GRANTS = 5_000;

export class AdminStepUpStore {
  private readonly grants = new Map<string, StepUpGrantRecord>();

  /** Emite un grant nuevo (identificador opaco de `newId`) y devuelve su id y vencimiento. */
  issue(input: { readonly adminId: string; readonly disputeId: string; readonly action: 'resolve' | 'confirm'; readonly now: string; readonly newId: () => string }): { readonly grantId: string; readonly expiresAt: string } {
    this.purge(input.now);
    if (this.grants.size >= MAX_GRANTS) this.grants.delete(this.grants.keys().next().value as string); // acotado: descarta el más antiguo
    const grantId = input.newId();
    this.grants.set(grantId, { grantId, adminId: input.adminId, disputeId: input.disputeId, action: input.action, issuedAt: input.now, usedAt: null });
    return { grantId, expiresAt: addMillis(input.now, ADMIN_STEPUP_WINDOW_MINUTES * 60_000) };
  }

  /** Consume el grant (UN SOLO USO): `assertStepUpGrant` lanza el 403 genérico si falta, es ajeno, de otra disputa o acción, está usado o venció. */
  consume(grantId: string, expected: { readonly adminId: string; readonly disputeId: string; readonly action: 'resolve' | 'confirm' }, now: string): void {
    const found = this.grants.get(grantId) ?? null;
    try {
      assertStepUpGrant(found, expected, now);
    } finally {
      if (found !== null && found.adminId === expected.adminId) this.grants.delete(grantId); // se quema al primer intento del DUEÑO, válido o no
    }
  }

  private purge(now: string): void {
    for (const [id, grant] of this.grants) if (now >= addMillis(grant.issuedAt, ADMIN_STEPUP_WINDOW_MINUTES * 60_000)) this.grants.delete(id);
  }
}
