/**
 * Saneo profundo de la evidencia de disputas de chip (Feature 012, Bloque B, #23, T1641; REQ-CHP12-008, rama F-11, trinity H-A4/B-N2). Función pura del dominio, sin dependencias npm, sin E/S.
 * El tipo lo decide la FIRMA del contenido (`detectMediaType`), nunca la cabecera ni la extensión; nunca SVG ni HTML. TODA evidencia válida se sanea igual, para cualquier chip.
 * - Imágenes (JPEG, PNG, WebP): el límite de píxeles (`DISPUTE_EVIDENCE_MAX_PIXELS`, 16 MP) se comprueba en la CABECERA antes de cualquier trabajo (bomba de descompresión); el contenedor se REESCRIBE por
 *   lista blanca (`stripImageMetadata`): descarta EXIF, XMP, ICC, comentarios y toda cola de datos posterior al marcador final (polígloto JPEG+ZIP/HTML) y rechaza animadas e ilegibles.
 *   LÍMITE DECLARADO: la reescritura conserva los píxeles; la recodificación completa exige un códec (dependencia npm nueva, Nivel 2) y queda como brecha aceptada hasta que Neo la autorice.
 * - PDF: se RECHAZA (422, nunca se rasteriza) el que contenga JavaScript, `/OpenAction`, `/AA`, `/Launch`, XFA, archivos embebidos, RichMedia, formularios activos o `/URI`; y se NEUTRALIZAN los
 *   metadatos del documento (Info y paquetes XMP) sobrescribiéndolos con espacios del MISMO largo, de modo que las tablas `xref` siguen válidas sin reescribir el archivo.
 * Cualquier fallo es un rechazo uniforme (`ok: false`, sin causa): el llamador responde 422 igual para chip libre u ocupado.
 *
 * @implements REQ-CHP12-008, INV-CHP12-004, INV-ARC-001, INV-ARC-002
 */

import { detectMediaType } from './media-signatures.ts';
import { readImageDimensions, stripImageMetadata, type StrippableMime } from '../images/image-metadata-stripper.ts';
import { DISPUTE_EVIDENCE_MAX_PIXELS } from '../platform/feature-012-limits.ts';

export type EvidenceVerdict = { readonly ok: true; readonly contentType: 'application/pdf' | StrippableMime; readonly bytes: Uint8Array } | { readonly ok: false };

/** Marcadores de contenido activo de un PDF (nombres de la sintaxis PDF; la coincidencia exige que el nombre termine para no confundir `/AA` con `/AAPL`). */
const ACTIVE_PDF_NAMES = ['JavaScript', 'JS', 'OpenAction', 'AA', 'Launch', 'XFA', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'URI', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'Movie', 'Sound', 'Rendition', 'Screen'] as const;
const ACTIVE_PDF = new RegExp(`/(?:${ACTIVE_PDF_NAMES.join('|')})(?![A-Za-z0-9_])`);
const OBFUSCATED_NAME = /\/[A-Za-z0-9_]*#[0-9A-Fa-f]{2}/; // `/Java#53cript`: un nombre con escapes `#xx` se rechaza (evita saltarse la lista)
const ACROFORM_WIDGET = /\/AcroForm[\s\S]{0,4096}?\/Widget|\/Widget[\s\S]{0,4096}?\/AcroForm/;
const INFO_STRINGS = /(\/(?:Author|Title|Subject|Keywords|Creator|Producer|CreationDate|ModDate|Company|Manager)\s*)(\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/g;
const XMP_PACKET = /<\?xpacket begin[\s\S]*?<\?xpacket end[^>]*\?>/g;

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
const blank = (match: string): string => ' '.repeat(match.length);

function sanitizePdf(bytes: Uint8Array): EvidenceVerdict {
  const text = latin1(bytes);
  if (ACTIVE_PDF.test(text) || OBFUSCATED_NAME.test(text) || ACROFORM_WIDGET.test(text)) return { ok: false };
  const cleaned = text
    .replace(XMP_PACKET, blank)
    .replace(INFO_STRINGS, (_all, key: string, value: string) => `${key}${value[0]}${' '.repeat(value.length - 2)}${value[value.length - 1]}`);
  return { ok: true, contentType: 'application/pdf', bytes: Uint8Array.from(Buffer.from(cleaned, 'latin1')) };
}

function sanitizeImage(mime: StrippableMime, bytes: Uint8Array): EvidenceVerdict {
  const dimensions = readImageDimensions(mime, bytes);
  if (dimensions === null || dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > DISPUTE_EVIDENCE_MAX_PIXELS) return { ok: false };
  const stripped = stripImageMetadata(mime, bytes);
  return stripped.ok ? { ok: true, contentType: stripped.mime, bytes: stripped.bytes } : { ok: false };
}

/** Detecta por firma y sanea; el tipo declarado por el cliente NO se usa (solo se compara cuando se pasa, y una discrepancia se rechaza). */
export function sanitizeDisputeEvidence(bytes: Uint8Array, declaredContentType?: string): EvidenceVerdict {
  const detection = detectMediaType(bytes);
  if (!detection.ok) return { ok: false };
  if (declaredContentType !== undefined && declaredContentType !== detection.mime) return { ok: false };
  return detection.mime === 'application/pdf' ? sanitizePdf(bytes) : sanitizeImage(detection.mime, bytes);
}
