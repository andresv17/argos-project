/**
 * IP efectiva normalizada para el límite de tasa y el HMAC de la auditoría (REQ-VET-007, REQ-VET-008): IPv4 tal cual; IPv4 mapeada en IPv6 como IPv4;
 * IPv6 reducida a su prefijo /64 (una red entera es un solo cliente). Un valor vacío o ilegible es `unknown` (nunca lanza).
 *
 * @implements REQ-VET-007, REQ-VET-008
 */

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array<string>(missing).fill('0'), ...tail];
  return groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups.map((g) => g.toLowerCase().padStart(4, '0')) : null;
}

export function normalizeClientIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed === '') return 'unknown';
  const mapped = MAPPED.exec(trimmed);
  const candidate = mapped?.[1] ?? trimmed;
  if (IPV4.test(candidate)) return candidate;
  const groups = candidate.includes(':') ? expandIpv6(candidate) : null;
  return groups === null ? 'unknown' : `${groups.slice(0, 4).join(':')}::/64`;
}
