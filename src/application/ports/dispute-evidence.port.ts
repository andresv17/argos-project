/**
 * Puerto de la evidencia de disputas de chip (Feature 012, Bloque B, #23, T1641; REQ-CHP12-008, INV-CHP12-004): `dispute_evidence`. La FK a `owner_requests` es RESTRICT: la purga de máquina
 * borra FÍSICAMENTE las filas de evidencia antes que el expediente (SC-012-118). `delete_after` = `closed_at` + retención y se escribe al cerrar la disputa.
 *
 * @implements REQ-CHP12-008, INV-CHP12-004, INV-CHP12-005, SC-012-118
 */

export type EvidenceContentType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export interface DisputeEvidenceRecord {
  readonly id: string;
  readonly requestId: string;
  /** Clave no derivable `claims/<uuid>/<uuid>` del almacén de medios. */
  readonly objectKey: string;
  readonly contentType: EvidenceContentType;
  readonly bytes: number;
  readonly createdAt: string;
  readonly deleteAfter: string | null;
}

export interface DisputeEvidenceRepositoryPort {
  insert(row: DisputeEvidenceRecord): Promise<void>;
  listByRequest(requestId: string): Promise<DisputeEvidenceRecord[]>;
  findById(id: string): Promise<DisputeEvidenceRecord | null>;
  /** Fija `delete_after` en todas las filas de la disputa al cerrarse (`closed_at` + retención); devuelve cuántas. */
  setDeleteAfter(requestId: string, deleteAfter: string): Promise<number>;
  /** Filas con `delete_after <= now`. */
  listDue(nowInclusive: string): Promise<DisputeEvidenceRecord[]>;
  /** Borra físicamente las filas indicadas; devuelve cuántas. */
  deleteByIds(ids: readonly string[]): Promise<number>;
}
