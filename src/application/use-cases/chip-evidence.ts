/**
 * Preparación de la evidencia de una disputa de chip ANTES de abrirla (Feature 012, Bloque B, #23, T1641; REQ-CHP12-008, rama F-11/N-G, trinity H-A4/N-2). La capa de rutas llama a
 * `prepareDisputeEvidence` con los archivos del multipart y entrega el resultado a `OpenChipDisputeUseCase`:
 *   1) forma y tope por archivo (el de 004) y número de archivos (1..5);
 *   2) tipo por FIRMA y saneo profundo (dominio: límite de píxeles en cabecera, contenedor reescrito por lista blanca, PDF sin contenido activo y sin metadatos);
 *   3) análisis antimalware (`MalwareScannerPort`) del contenido ya saneado; sin análisis disponible (puerto ausente o caído) falla CERRADA con 503 `ERR-OWN12-RETRYABLE`.
 * Un archivo inválido o infectado da el MISMO 422 que cualquier otro inválido, sin depender del chip: es lo que impide que la evidencia sea un oráculo de existencia.
 *
 * @implements REQ-CHP12-008, INV-CHP12-003, INV-CHP12-004, SC-012-082
 */

import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { DomainError } from '../../generated/v38/index.ts';
import { sanitizeDisputeEvidence } from '../../domain/media/dispute-evidence-sanitizer.ts';
import { DISPUTE_EVIDENCE_MAX_FILES } from '../../domain/platform/feature-012-limits.ts';
import { MalwareScannerUnavailableError } from '../ports/malware-scanner.port.ts';
import type { DisputeEvidenceFile } from './chip-dispute-use-cases.ts';
import { requireMedia } from './media-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export interface RawEvidenceFile {
  /** Tipo declarado por el cliente: solo se contrasta con la firma; nunca decide. */
  readonly declaredContentType?: string;
  readonly bytes: Uint8Array;
}

const rejected = (): DomainErrorRoot => new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Evidencia no válida.', 'evidence');

export async function prepareDisputeEvidence(deps: Pick<ApplicationDeps, 'media' | 'malwareScanner'>, files: readonly RawEvidenceFile[]): Promise<DisputeEvidenceFile[]> {
  const media = requireMedia(deps as ApplicationDeps);
  if (files.length < 1 || files.length > DISPUTE_EVIDENCE_MAX_FILES) throw rejected();
  const prepared: DisputeEvidenceFile[] = [];
  for (const file of files) {
    if (file.bytes.length === 0 || file.bytes.length > media.limits.maxBytes) throw rejected();
    const verdict = sanitizeDisputeEvidence(file.bytes, file.declaredContentType);
    if (!verdict.ok) throw rejected();
    if (deps.malwareScanner === undefined) throw new DomainError('ERR-OWN12-RETRYABLE'); // sin antimalware no se acepta evidencia
    try {
      if (!(await deps.malwareScanner.scan(verdict.bytes, verdict.contentType)).clean) throw rejected();
    } catch (error) {
      if (error instanceof MalwareScannerUnavailableError) throw new DomainError('ERR-OWN12-RETRYABLE');
      throw error;
    }
    prepared.push({ contentType: verdict.contentType, bytes: verdict.bytes });
  }
  return prepared;
}
