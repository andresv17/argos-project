/**
 * JSON canónico de la auditoría (REQ-AUD-001, INV-AUD-001, SC-012).
 * Claves de objeto ordenadas por punto de código Unicode a cualquier profundidad, sin espacios, arreglos en su orden
 * lógico, números como en JSON.stringify, claves con valor undefined omitidas y null conservado.
 * Función pura: sin reloj, sin azar y sin entorno (INV-ARCH-001).
 *
 * @implements REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-001
 */

const compareCodePoints = (a: string, b: string): number => {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
};

/** Serializa `value` de forma determinista; lanza TypeError si no es JSON (funciones, símbolos, números no finitos). */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: número no finito.');
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: tipo no serializable (${typeof value}).`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => compareCodePoints(a, b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}
