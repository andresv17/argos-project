/**
 * Endurecimiento de la importación (P-14, REQ-BACKUP2-002, INV-BACKUP-001, STATE-BACKUP-001
 * PARSE_HARDENING_REJECTED): sobre el texto ya reconocido como JSON válido, rechaza
 * - las claves `__proto__`, `constructor` y `prototype` en cualquier nivel (también escritas con secuencias \\u);
 * - las claves duplicadas dentro de un mismo objeto (JSON.parse se queda con la última y lo ocultaría);
 * - la profundidad de anidamiento superior a MAX_JSON_DEPTH.
 * Recorrido iterativo de una sola pasada, sin recursión (una profundidad de 100 000 no desborda la pila), sin
 * fusiones recursivas y sin tocar el prototipo. Puro y determinista (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements REQ-BACKUP2-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID, INV-ARCH-004
 */

/** Profundidad máxima admitida: el sobre real llega a 4 niveles (raíz, records, colección, registro). */
export const MAX_JSON_DEPTH = 32;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export interface HardeningViolation {
  readonly kind: 'FORBIDDEN_KEY' | 'DUPLICATE_KEY' | 'MAX_DEPTH';
  /** Mensaje genérico: nunca reproduce contenido del archivo salvo el nombre de la clave prohibida o repetida. */
  readonly detail: string;
}

interface Frame {
  readonly isObject: boolean;
  readonly keys: Set<string> | null;
  expectKey: boolean;
}

/** Primera violación de endurecimiento del texto JSON válido, o null si no hay ninguna. */
export function findHardeningViolation(text: string): HardeningViolation | null {
  const stack: Frame[] = [];
  const length = text.length;
  let i = 0;
  while (i < length) {
    const c = text.charCodeAt(i);
    if (c === 0x22) {
      // Cadena: hasta la comilla de cierre no escapada.
      let end = i + 1;
      let escaped = false;
      while (end < length) {
        const d = text.charCodeAt(end);
        if (d === 0x5c) {
          escaped = true;
          end += 2;
          continue;
        }
        if (d === 0x22) break;
        end += 1;
      }
      const top = stack[stack.length - 1];
      if (top?.isObject === true && top.expectKey) {
        top.expectKey = false;
        const key = escaped ? (JSON.parse(text.slice(i, end + 1)) as string) : text.slice(i + 1, end);
        if (FORBIDDEN_KEYS.has(key)) return { kind: 'FORBIDDEN_KEY', detail: `Clave no permitida en el archivo: ${key}.` };
        if (top.keys!.has(key)) return { kind: 'DUPLICATE_KEY', detail: `Clave duplicada en el archivo: ${key}.` };
        top.keys!.add(key);
      }
      i = end + 1;
      continue;
    }
    if (c === 0x7b || c === 0x5b) {
      const isObject = c === 0x7b;
      stack.push({ isObject, keys: isObject ? new Set<string>() : null, expectKey: isObject });
      if (stack.length > MAX_JSON_DEPTH) return { kind: 'MAX_DEPTH', detail: `El archivo supera la profundidad máxima de ${MAX_JSON_DEPTH} niveles.` };
    } else if (c === 0x7d || c === 0x5d) {
      stack.pop();
    } else if (c === 0x2c) {
      const top = stack[stack.length - 1];
      if (top?.isObject === true) top.expectKey = true;
    }
    i += 1;
  }
  return null;
}
