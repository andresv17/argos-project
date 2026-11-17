/**
 * Hash de estado de la auditoría (REQ-AUD-001, INV-AUD-001, SC-012): SHA-256 sin clave, hexadecimal minúscula, del
 * JSON canónico de la vista pública canónica. El SHA-256 es puro (sha256.ts): el dominio no importa node:crypto.
 *
 * @implements REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-001
 */

import { toCanonicalView } from './canonical-view.ts';
import { canonicalJson } from './canonical-json.ts';
import { sha256Hex } from './sha256.ts';

export function stateHash(entity: unknown): string {
  return sha256Hex(canonicalJson(toCanonicalView(entity)));
}
