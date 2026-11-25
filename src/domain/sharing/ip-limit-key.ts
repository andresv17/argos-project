/**
 * Clave única de los limitadores en memoria por IP (feature 010, `H-T1418-01/02`, REQ-EDG10-003, SC-010-016): IPv4 sin puerto; IPv6 agregada por prefijo /64 con la forma
 * `v6:<4 grupos canónicos>`; se despoja `[ ]` y `%zona`; `::ffff:a.b.c.d` se normaliza a IPv4; minúsculas; toda entrada vacía, ilegible o excesivamente larga va al cubo único
 * `invalid`, de modo que una clave controlada por el cliente nunca se retiene tal cual. Es idempotente (aplicarla a su propia salida la devuelve igual) y nunca lanza.
 *
 * @implements REQ-EDG10-003, REQ-EDG10-001, REQ-EDG10-002, SC-010-014, SC-010-015, SC-010-016, EDGE-010-002
 */

export const INVALID_IP_KEY = 'invalid';

const MAX_RAW_LENGTH = 64;
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);
const IPV4_WITH_PORT = new RegExp(`^(${OCTET}(?:\\.${OCTET}){3}):\\d{1,5}$`);
const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
const CANONICAL_V6 = /^v6:[0-9a-f]{4}(?::[0-9a-f]{4}){3}$/;

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array<string>(missing).fill('0'), ...tail];
  return groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups.map((g) => g.padStart(4, '0')) : null;
}

export function ipLimitKey(ip: string): string {
  if (typeof ip !== 'string' || ip.length > MAX_RAW_LENGTH) return INVALID_IP_KEY;
  let value = ip.trim().toLowerCase();
  if (CANONICAL_V6.test(value)) return value;
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close < 0) return INVALID_IP_KEY;
    const rest = value.slice(close + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return INVALID_IP_KEY;
    value = value.slice(1, close);
  }
  const zone = value.indexOf('%');
  if (zone >= 0) value = value.slice(0, zone);
  if (value === '') return INVALID_IP_KEY;
  const withPort = IPV4_WITH_PORT.exec(value);
  if (withPort !== null) value = withPort[1]!;
  const mapped = MAPPED_V4.exec(value)?.[1];
  if (mapped !== undefined) value = mapped;
  if (IPV4.test(value)) return value;
  if (!value.includes(':')) return INVALID_IP_KEY;
  const groups = expandIpv6(value);
  if (groups === null) return INVALID_IP_KEY;
  // ::ffff:aabb:ccdd (forma hexadecimal de IPv4 mapeada) -> IPv4
  if (groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
    const hi = parseInt(groups[6]!, 16);
    const lo = parseInt(groups[7]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `v6:${groups.slice(0, 4).join(':')}`;
}
