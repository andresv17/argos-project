/**
 * Lector mínimo y ESTRICTO de `multipart/form-data` para `POST /api/chip-disputes` (Feature 012, Bloque B, #23, T1636; REQ-CHP12-004, REQ-CHP12-008; sin dependencia npm nueva).
 * Opera sobre el cuerpo ya acotado por `bodyLimit` y por el `Content-Length` decidido ANTES de leerlo. Límites de parser (`chip-claim.openapi.yaml`, paso 4): como máximo `1 + DISPUTE_EVIDENCE_MAX_FILES` partes,
 * un solo campo `microchipId` (texto), solo partes `evidence` con archivo, nada antes del primer delimitador ni después del último, y cualquier parte desconocida, repetida o mal formada es 422
 * `ERR-SCHEMA-VALIDATION-FAILED`, independiente del chip. Nunca devuelve nombres de archivo del cliente (no se usan).
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, INV-CHP12-003
 */

import { DomainError } from '../../generated/index.ts';
import { DISPUTE_EVIDENCE_MAX_FILES } from '../../domain/platform/feature-012-limits.ts';

export interface MultipartFile {
  readonly declaredContentType: string;
  readonly bytes: Uint8Array;
}

export interface DisputeForm {
  readonly microchipId: string | undefined;
  readonly files: MultipartFile[];
}

const bad = (field = 'evidence'): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'El formulario multipart no es válido.', field);
const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');
const MAX_HEADER_BYTES = 2048;
const MAX_TEXT_FIELD_BYTES = 64;

/** Boundary de la cabecera `Content-Type` (`multipart/form-data; boundary=...`), o `null` si falta o es inválido (RFC 2046: 1..70 caracteres). */
export function multipartBoundary(contentType: unknown): string | null {
  if (typeof contentType !== 'string') return null;
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]{1,70})"|([0-9A-Za-z'()+_,\-./:=?]{1,70}))\s*$/i.exec(contentType.trim());
  return match === null ? null : (match[1] ?? match[2] ?? null);
}

function dispositionOf(header: string): { readonly name: string; readonly hasFile: boolean } | null {
  const line = header.split('\r\n').find((l) => l.toLowerCase().startsWith('content-disposition:'));
  if (line === undefined) return null;
  const name = /;\s*name="([^"\r\n]{1,64})"/i.exec(line)?.[1];
  if (name === undefined) return null;
  return { name, hasFile: /;\s*filename\*?=/i.test(line) };
}

/** Parte `Content-Type` declarada (solo se contrasta con la firma; nunca decide). */
const partType = (header: string): string => header.split('\r\n').find((l) => l.toLowerCase().startsWith('content-type:'))?.slice(13).trim().toLowerCase() ?? '';

export function parseDisputeForm(body: Uint8Array, boundary: string): DisputeForm {
  const buffer = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const delimiter = Buffer.from(`--${boundary}`);
  const separator = Buffer.from(`\r\n--${boundary}`);
  if (buffer.indexOf(delimiter) !== 0) throw bad(); // sin preámbulo
  let cursor = delimiter.length;
  let microchipId: string | undefined;
  const files: MultipartFile[] = [];
  let parts = 0;
  for (;;) {
    if (buffer.subarray(cursor, cursor + 2).toString('latin1') === '--') {
      if (buffer.length - (cursor + 2) > 2) throw bad(); // nada (salvo el CRLF final) tras el delimitador de cierre
      break;
    }
    if (!buffer.subarray(cursor, cursor + 2).equals(CRLF)) throw bad();
    cursor += 2;
    parts += 1;
    if (parts > 1 + DISPUTE_EVIDENCE_MAX_FILES) throw bad();
    const headerEnd = buffer.indexOf(HEADER_END, cursor);
    if (headerEnd === -1 || headerEnd - cursor > MAX_HEADER_BYTES) throw bad();
    const header = buffer.subarray(cursor, headerEnd).toString('latin1');
    const disposition = dispositionOf(header);
    if (disposition === null) throw bad();
    const start = headerEnd + HEADER_END.length;
    const end = buffer.indexOf(separator, start);
    if (end === -1) throw bad();
    const content = buffer.subarray(start, end);
    if (disposition.name === 'microchipId' && !disposition.hasFile) {
      if (microchipId !== undefined || content.length > MAX_TEXT_FIELD_BYTES) throw bad('microchipId');
      microchipId = content.toString('utf8');
    } else if (disposition.name === 'evidence' && disposition.hasFile) {
      files.push({ declaredContentType: partType(header), bytes: new Uint8Array(content) });
    } else {
      throw bad(); // parte desconocida
    }
    cursor = end + separator.length;
  }
  return { microchipId, files };
}
