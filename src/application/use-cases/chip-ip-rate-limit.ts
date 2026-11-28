/**
 * Contadores de TODO intento con `microchipId` (Feature 012, Bloque B, #23, T1640; REQ-CHP12-005, INV-CHP12-007, NFR-012-001, NFR-012-006; cifras de N2-R4): usuario 10, IP 30 y global 1000 en
 * ventana MÓVIL de 24 h (`ip_rate_events`, sin FK).
 * - Evalúa usuario -> IP -> global y solo si LOS TRES tienen cupo registra los eventos (un 429 no se registra en ningún contador, no prolonga la ventana ni incrementa el global).
 * - Comprobar y registrar es ATÓMICO: ambos ocurren en UNA transacción propia (los motores serializan las escrituras; en PostgreSQL, candado asesor global).
 * - El evento se persiste ANTES de resolver el chip y FUERA de la transacción de negocio (confirma aunque el intento falle después). Falla cerrada: cualquier error de almacenamiento se responde con el MISMO 429.
 * - Claves HMAC con prefijo de dominio propio (`chipuser:`/`chipip:`), distintas de la clave `chip:` del ancla; nunca el chip, la IP ni el usuario en claro. IPv6 se agrupa por /64.
 * - `trustProxyHops` (`ARGOS_TRUST_PROXY_HOPS`): si la IP llega como cadena `X-Forwarded-For` (`a, b, c`) se toma la entrada `hops` posiciones desde el final; con 0 o 1 salto, la última.
 * - Aviso al cruzar el 70 % del global (una sola vez por cruce): solo log estructurado de servidor `warn`, sin PII ni chip.
 * Sin IP conocida (invocación interna) solo cuentan usuario y global.
 *
 * @implements REQ-CHP12-005, INV-CHP12-007, ERR-RATE-LIMITED, NFR-012-001, NFR-012-006
 */

import { DomainError } from '../../generated/index.ts';
import { MICROCHIP_LOOKUP_GLOBAL_WARN_RATIO, MICROCHIP_LOOKUP_MAX_GLOBAL_PER_DAY, MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY, MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY, MICROCHIP_LOOKUP_WINDOW_MS, CHIP_MULTIPART_MAX_PER_IP_PER_DAY, CHIP_MULTIPART_MAX_PER_USER_PER_DAY, IP_RATE_EVENTS_RETENTION_HOURS } from '../../domain/platform/feature-012-limits.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { isTrivialMicrochip } from '../../domain/pet/microchip-patterns.ts';
import type { IpRateScope } from '../ports/ip-rate-events.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export const CHIP_LOOKUP_LIMITS = { perUser: MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY, perIp: MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY, global: MICROCHIP_LOOKUP_MAX_GLOBAL_PER_DAY } as const;
export const CHIP_MULTIPART_LIMITS = { perUser: CHIP_MULTIPART_MAX_PER_USER_PER_DAY, perIp: CHIP_MULTIPART_MAX_PER_IP_PER_DAY, global: Number.POSITIVE_INFINITY } as const;

type LimitDeps = Pick<ApplicationDeps, 'uow' | 'clock' | 'auditPseudonym' | 'auditHmacSecret' | 'auditIds' | 'structuredLog'>;

export interface ChipAttemptInput {
  readonly userId: string;
  /** IP del cliente tal como la entrega la capa HTTP (puede ser la cadena `X-Forwarded-For`); ausente = invocación interna. */
  readonly ip?: string | null;
  readonly trustProxyHops?: number;
  /** `CHIP_LOOKUP` (por defecto) o `CHIP_MULTIPART` (peticiones multipart de `openChipDispute`, consumidas antes de parsear). */
  readonly scope?: IpRateScope;
  /** Intentos que cuenta la llamada (la importación de respaldo cuenta un intento por chip, atómicamente); por defecto 1. */
  readonly count?: number;
}

/** Expande una IPv6 a 8 grupos de 4 dígitos hexadecimales; `null` si no es una IPv6 válida. */
function expandIpv6(ip: string): string[] | null {
  const bare = ip.split('%')[0]!.toLowerCase();
  if (!bare.includes(':')) return null;
  const [head, tail, extra] = bare.split('::');
  if (extra !== undefined) return null;
  const left = head === '' || head === undefined ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const gap = tail === undefined ? 0 : 8 - left.length - right.length;
  if (gap < 0 || (tail === undefined && left.length !== 8)) return null;
  const groups = [...left, ...Array.from({ length: gap }, () => '0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

/** Clave de red del cliente: la IPv4 tal cual y la IPv6 reducida a su /64. */
export function clientNetworkKey(ip: string, trustProxyHops: number): string {
  const chain = ip.split(',').map((part) => part.trim()).filter((part) => part !== '');
  const hops = Math.max(1, Math.trunc(trustProxyHops));
  const chosen = chain.length === 0 ? ip.trim() : chain[Math.max(0, chain.length - hops)]!;
  const v6 = expandIpv6(chosen);
  return v6 === null ? chosen : `${v6.slice(0, 4).join(':')}::/64`;
}

/**
 * Cuenta un intento. @throws `ERR-RATE-LIMITED` (429 uniforme) si usuario, IP o global agotaron el cupo, o si el almacenamiento falla (falla cerrada).
 */
export async function recordChipAttempt(deps: LimitDeps, input: ChipAttemptInput): Promise<void> {
  const scope: IpRateScope = input.scope ?? 'CHIP_LOOKUP';
  const attempts = Math.max(1, Math.trunc(input.count ?? 1));
  const limits = scope === 'CHIP_MULTIPART' ? CHIP_MULTIPART_LIMITS : CHIP_LOOKUP_LIMITS;
  const hmac = (prefix: string, value: string): string => deps.auditPseudonym.hmacUserId(`${prefix}:${value}`, deps.auditHmacSecret);
  const keys: Array<{ readonly key: string; readonly max: number }> = [{ key: `u:${hmac('chipuser', input.userId)}`, max: limits.perUser }];
  if (input.ip !== undefined && input.ip !== null && input.ip !== '') keys.push({ key: `i:${hmac('chipip', clientNetworkKey(input.ip, input.trustProxyHops ?? 0))}`, max: limits.perIp });
  if (Number.isFinite(limits.global)) keys.push({ key: '*', max: limits.global });
  try {
    await deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const since = addMillis(now, -MICROCHIP_LOOKUP_WINDOW_MS);
      for (const { key, max } of keys) {
        if ((await repositories.ipRateEvents.countSince(scope, key, since)) + attempts > max) throw new DomainError('ERR-RATE-LIMITED');
      }
      for (const { key } of keys) for (let i = 0; i < attempts; i += 1) await repositories.ipRateEvents.insert({ id: deps.auditIds.nextId(), scope, ipHmac: key, occurredAt: now });
      if (scope === 'CHIP_LOOKUP') {
        const used = await repositories.ipRateEvents.countSince(scope, '*', since);
        const threshold = Math.ceil(CHIP_LOOKUP_LIMITS.global * MICROCHIP_LOOKUP_GLOBAL_WARN_RATIO);
        if (used >= threshold && used - attempts < threshold) { // una sola vez por cruce
          deps.structuredLog?.warn('CHIP_LOOKUP_GLOBAL_THRESHOLD', { used, limit: CHIP_LOOKUP_LIMITS.global }); // sin PII ni chip (P-6)
        }
      }
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('ERR-RATE-LIMITED'); // falla cerrada con el mismo 429
  }
}

/** Contexto de red de la petición (lo rellena la capa HTTP; los casos de uso nunca leen cabeceras). */
export interface ChipRequestContext {
  readonly ip?: string | null;
  readonly trustProxyHops?: number;
}

/**
 * `true` si el valor es un `microchipId` de formato válido (los de formato inválido NO cuentan como intento, REQ-CHP12-002). Los patrones triviales (15 dígitos iguales o secuencias, REQ-PET4-002) tampoco:
 * el esquema los rechaza con 422 ANTES de consultar el registro, de modo que no pueden usarse para enumerarlo.
 */
export const isChipAttempt = (input: unknown): boolean => {
  const chip = typeof input === 'object' && input !== null ? String((input as { microchipId?: unknown }).microchipId ?? '') : '';
  return /^[0-9]{15}$/.test(chip) && !isTrivialMicrochip(chip);
};

/** Cuenta el intento si la entrada trae un `microchipId` de formato válido; si no, no hace nada. */
export async function countChipAttempt(deps: LimitDeps, userId: string, input: unknown, context: ChipRequestContext = {}): Promise<void> {
  if (!isChipAttempt(input)) return;
  await recordChipAttempt(deps, { userId, ip: context.ip ?? null, trustProxyHops: context.trustProxyHops ?? 0 });
}

/** Mantenimiento: borra los eventos con más de `IP_RATE_EVENTS_RETENTION_HOURS` (25 h; la ventana es de 24 h). Nunca lanza. Devuelve cuántos purgó. */
export async function purgeIpRateEvents(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<number> {
  try {
    const cutoff = addMillis(deps.clock.nowIsoTimestamp(), -IP_RATE_EVENTS_RETENTION_HOURS * 3_600_000);
    return await deps.uow.runInTransaction((r) => r.ipRateEvents.purgeBefore(cutoff));
  } catch {
    return 0;
  }
}
