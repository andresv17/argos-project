/**
 * Saneado del nombre original y nombre neutro de la URL firmada (REQ-ARC-004, REQ-ARC-003, D-14 A). Funciones puras.
 *
 * `sanitizeName`: NFC; elimina controles C0 y C1, DEL, separadores de ruta (`/`, `\`), controles bidi U+202A-U+202E y U+2066-U+2069 y
 * U+FEFF; limita a 120 puntos de código sin partir pares sustitutos; si queda vacío (o solo con puntos y espacios) vale `archivo`.
 * `canonicalMediaName`: base saneada sin la última extensión `\.[A-Za-z0-9]{1,8}` del cliente + la extensión canónica del tipo detectado
 * (`a.exe` con contenido PDF se lista `a.pdf`); el total no pasa de 120 puntos de código (1..120 del contrato `MediaItem.originalName`).
 * `neutralFilename`: `foto.<ext>` para PHOTO; `archivo.pdf` o `archivo.<ext>` para FILE; el nombre real no llega a la URL.
 *
 * @implements REQ-ARC-004, REQ-ARC-003, INV-ARC-002, INV-ARC-004, NFR-ALM-004
 */

import { canonicalExtension, type MediaKind, type MediaMime } from './media-signatures.ts';

export const MEDIA_NAME_MAX_CODE_POINTS = 120;
export const DEFAULT_MEDIA_NAME = 'archivo';

const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f/\\‪-‮⁦-⁩﻿]/gu;
const ONLY_DOTS_OR_SPACES = /^[.\s]*$/u;
const LAST_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

const truncate = (text: string, maxCodePoints: number): string => Array.from(text).slice(0, maxCodePoints).join('');

/** Nombre original saneado: sin controles, bidi ni separadores; <= 120 puntos de código; nunca vacío. @implements REQ-ARC-004 */
export function sanitizeName(raw: string): string {
  const cleaned = raw.normalize('NFC').replace(FORBIDDEN_NAME_CHARS, '');
  const limited = truncate(cleaned, MEDIA_NAME_MAX_CODE_POINTS);
  return ONLY_DOTS_OR_SPACES.test(limited) ? DEFAULT_MEDIA_NAME : limited;
}

/** Nombre de lista: base saneada sin la última extensión del cliente + extensión canónica del tipo detectado; <= 120 puntos de código. @implements REQ-ARC-004 */
export function canonicalMediaName(raw: string, mime: MediaMime): string {
  const extension = `.${canonicalExtension(mime)}`;
  const sanitized = sanitizeName(raw).replace(LAST_EXTENSION, '');
  const base = ONLY_DOTS_OR_SPACES.test(sanitized) ? DEFAULT_MEDIA_NAME : sanitized;
  const room = MEDIA_NAME_MAX_CODE_POINTS - extension.length;
  const fitted = truncate(base, room);
  return `${ONLY_DOTS_OR_SPACES.test(fitted) ? DEFAULT_MEDIA_NAME : fitted}${extension}`;
}

/** Nombre neutro de la URL firmada (D-14 A). Lanza si una PHOTO fuera PDF (el dominio no permite ese estado). @implements REQ-ARC-003, INV-ARC-004 */
export function neutralFilename(kind: MediaKind, mime: MediaMime): string {
  if (kind === 'PHOTO' && mime === 'application/pdf') throw new RangeError('Una foto no puede ser PDF.');
  return `${kind === 'PHOTO' ? 'foto' : DEFAULT_MEDIA_NAME}.${canonicalExtension(mime)}`;
}
