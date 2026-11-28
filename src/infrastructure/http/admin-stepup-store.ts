/**
 * Almacén de los `StepUpGrant` de `/admin/disputes` (Feature 012, Bloque B, #23, T1636; REQ-CHP12-009, INV-CHP12-006; `admin-disputes.openapi.yaml`, `stepUpAdminDispute`).
 * Un grant está ligado a `(adminId, disputeId, acción)`, es de UN SOLO USO y vigente `ADMIN_STEPUP_WINDOW_MINUTES` (5). Vive en la MEMORIA de la instancia (acotado y con purga perezosa):
 * una instancia que no emitió el grant responde 403 genérico y el administrador pide otro (falla cerrada). La compuerta pura es `assertStepUpGrant` (capa de aplicación).
 *
 * @implements REQ-CHP12-009, INV-CHP12-006
 */

import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { ADMIN_STEPUP_WINDOW_MINUTES } from '../../domain/platform/feature-012-limits.ts';
import { AdminForbiddenError, assertStepUpGrant, type StepUpGrantRecord } from '../../application/use-cases/chip-dispute-admin-use-cases.ts';

const MAX_GRANTS = 5_000;
/** Cuota por administrador: al superarla se descarta el grant MÁS ANTIGUO DEL MISMO administrador; un administrador no puede expulsar los grants de otro (T-02). */
const MAX_GRANTS_PER_ADMIN = 20;

export class AdminStepUpStore {
  private readonly grants = new Map<string, StepUpGrantRecord>();

  /** Emite un grant nuevo (identificador opaco de `newId`) y devuelve su id y vencimiento. Con el almacén global lleno falla cerrado (403 genérico) en vez de expulsar grants ajenos. */
  issue(input: { readonly adminId: string; readonly disputeId: string; readonly action: 'resolve' | 'confirm'; readonly now: string; readonly newId: () => string }): { readonly grantId: string; readonly expiresAt: string } {
    this.purge(input.now);
    const own = [...this.grants.values()].filter((g) => g.adminId === input.adminId);
    if (own.length >= MAX_GRANTS_PER_ADMIN) this.grants.delete(own[0]!.grantId); // el Map conserva el orden de inserción: el primero es el más antiguo
    if (this.grants.size >= MAX_GRANTS) throw new AdminForbiddenError();
    const grantId = input.newId();
    this.grants.set(grantId, { grantId, adminId: input.adminId, disputeId: input.disputeId, action: input.action, issuedAt: input.now, usedAt: null });
    return { grantId, expiresAt: addMillis(input.now, ADMIN_STEPUP_WINDOW_MINUTES * 60_000) };
  }

  /**
   * Reserva el grant (UN SOLO USO) ANTES de ejecutar el caso de uso: `assertStepUpGrant` lanza el 403 genérico si falta, es ajeno, de otra disputa o acción, está usado o venció. Un grant del dueño que NO
   * coincide (otra disputa o acción, vencido) se quema; uno válido queda reservado (una petición concurrente con el mismo id recibe 403) hasta `finish` o `release`.
   */
  claim(grantId: string, expected: { readonly adminId: string; readonly disputeId: string; readonly action: 'resolve' | 'confirm' }, now: string): void {
    const found = this.grants.get(grantId) ?? null;
    try {
      const used = assertStepUpGrant(found, expected, now);
      this.grants.set(grantId, used); // reservado: usedAt != null
    } catch (error) {
      if (found !== null && found.adminId === expected.adminId && found.usedAt === null) this.grants.delete(grantId);
      throw error;
    }
  }

  /** El caso de uso se ejecutó: el grant queda consumido. */
  finish(grantId: string): void {
    this.grants.delete(grantId);
  }

  /** El caso de uso falló (p. ej. 409): el grant reservado vuelve a estar disponible, vigente hasta su vencimiento original. */
  release(grantId: string): void {
    const found = this.grants.get(grantId);
    if (found !== undefined) this.grants.set(grantId, { ...found, usedAt: null });
  }

  private purge(now: string): void {
    for (const [id, grant] of this.grants) if (now >= addMillis(grant.issuedAt, ADMIN_STEPUP_WINDOW_MINUTES * 60_000)) this.grants.delete(id);
  }
}
