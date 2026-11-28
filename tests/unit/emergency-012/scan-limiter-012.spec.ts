import { describe, expect, it } from 'vitest';
import { EmergencyScanLimiter } from '../../../src/infrastructure/http/emergency-scan-limiter.ts';

/**
 * T1684 (Feature 012, Bloque D, #32; `/keymaker`): contador EN MEMORIA ACOTADO de `QR_SCAN_MAX_PER_IP_PER_MINUTE = 30` por IP: ventana de un minuto, IPv6 por su /64, mapa acotado con descarte de vencidas y luego LRU
 * (la expulsión se cuenta y NUNCA rechaza la petición) y falla ABIERTA sin IP resoluble (contador operativo, sin bucket compartido).
 *
 * @implements REQ-QR12-007, INV-QR12-006
 * Cubre SC-012-087, SC-012-129.
 */
const SECRET = 'x'.repeat(32);
function make(options: { maxTracked?: number } = {}): { limiter: EmergencyScanLimiter; advance(ms: number): void } {
  let now = Date.parse('2026-11-27T15:00:00.000Z');
  return { limiter: new EmergencyScanLimiter({ secret: SECRET, nowMs: () => now, ...options }), advance: (ms) => (now += ms) };
}

describe('T1684 límite por IP y minuto [SC-012-087]', () => {
  it('30 peticiones pasan y la 31.ª se limita con Retry-After en segundos; otra IP no se ve afectada', () => {
    const { limiter } = make();
    for (let i = 0; i < 30; i += 1) expect(limiter.hit('203.0.113.9').limited).toBe(false);
    const verdict = limiter.hit('203.0.113.9');
    expect(verdict.limited).toBe(true);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(limiter.hit('203.0.113.10').limited).toBe(false);
  });

  it('la ventana se renueva al minuto: el contador vuelve a cero', () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 31; i += 1) limiter.hit('198.51.100.1');
    expect(limiter.hit('198.51.100.1').limited).toBe(true);
    advance(60_000);
    expect(limiter.hit('198.51.100.1').limited).toBe(false);
  });

  it('el Retry-After refleja lo que falta de la ventana', () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 30; i += 1) limiter.hit('198.51.100.2');
    advance(45_000);
    expect(limiter.hit('198.51.100.2').retryAfterSeconds).toBe(15);
  });
});

describe('T1684 IPv6 por prefijo /64 [SC-012-129]', () => {
  it('dos direcciones del mismo /64 comparten contador; otro /64 no', () => {
    const { limiter } = make();
    for (let i = 0; i < 30; i += 1) limiter.hit('2001:db8:aaaa:bbbb::1');
    expect(limiter.hit('2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff').limited).toBe(true);
    expect(limiter.hit('2001:db8:aaaa:cccc::1').limited).toBe(false);
  });

  it('IPv4 mapeada en IPv6 cuenta como la IPv4', () => {
    const { limiter } = make();
    for (let i = 0; i < 30; i += 1) limiter.hit('::ffff:203.0.113.77');
    expect(limiter.hit('203.0.113.77').limited).toBe(true);
  });
});

describe('T1684 mapa acotado: vencidas primero, luego LRU, sin rechazar [SC-012-129]', () => {
  it('lleno de entradas vigentes expulsa la MENOS reciente, cuenta la expulsión y atiende la petición', () => {
    const { limiter } = make({ maxTracked: 3 });
    for (const ip of ['192.0.2.1', '192.0.2.2', '192.0.2.3']) limiter.hit(ip);
    limiter.hit('192.0.2.1'); // 192.0.2.1 pasa a ser la más reciente; la menos reciente es .2
    expect(limiter.hit('192.0.2.4').limited).toBe(false);
    expect(limiter.tracked).toBe(3);
    expect(limiter.evictions).toBe(1);
  });

  it('la expulsión solo reinicia el contador de esa IP (nunca la rechaza)', () => {
    const { limiter } = make({ maxTracked: 2 });
    for (let i = 0; i < 30; i += 1) limiter.hit('192.0.2.1');
    limiter.hit('192.0.2.2');
    limiter.hit('192.0.2.3'); // expulsa a .1
    expect(limiter.hit('192.0.2.1').limited).toBe(false);
  });

  it('antes de expulsar descarta las entradas con la ventana vencida (sin contar expulsión)', () => {
    const { limiter, advance } = make({ maxTracked: 3 });
    for (const ip of ['192.0.2.1', '192.0.2.2', '192.0.2.3']) limiter.hit(ip);
    advance(61_000);
    limiter.hit('192.0.2.4');
    expect(limiter.tracked).toBeLessThanOrEqual(3);
    expect(limiter.evictions).toBe(0);
  });

  it('el mapa nunca supera el tope aunque lleguen miles de IP distintas', () => {
    const { limiter } = make({ maxTracked: 50 });
    for (let i = 0; i < 2000; i += 1) limiter.hit(`10.${i >> 8}.${i & 255}.1`);
    expect(limiter.tracked).toBeLessThanOrEqual(50);
    expect(limiter.evictions).toBeGreaterThan(0);
  });
});

describe('T1684 IP no resuelta: falla ABIERTA, sin bucket compartido [SC-012-087]', () => {
  it.each([undefined, '', 'no-es-una-ip', '::::'])('%j se atiende y se cuenta solo en el contador operativo', (ip) => {
    const { limiter } = make();
    for (let i = 0; i < 100; i += 1) expect(limiter.hit(ip as string | undefined).limited).toBe(false);
    expect(limiter.unresolved).toBe(100);
    expect(limiter.tracked).toBe(0);
  });
});
