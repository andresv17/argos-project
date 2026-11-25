import { describe, expect, it } from 'vitest';

import { ipLimitKey } from '../../src/domain/sharing/ip-limit-key.ts';
import { AdminAccessLimiter } from '../../src/infrastructure/http/admin-rate-limit.ts';
import { GoogleRateLimiter } from '../../src/infrastructure/http/google-rate-limit.ts';
import { InviteeSearchRateLimiter } from '../../src/infrastructure/http/invitee-search-rate-limit.ts';
import { RegistrationRateLimiter } from '../../src/infrastructure/http/registration-rate-limit.ts';
import { SceneRateLimiter } from '../../src/infrastructure/http/scene-rate-limit.ts';

/**
 * T1418 (Bloque C 010): `ipLimitKey` y tope duro con descarte por antigüedad en los 5 mapas.
 * @implements REQ-EDG10-001, REQ-EDG10-002, REQ-EDG10-003, SC-010-014, SC-010-015, SC-010-016, EDGE-010-002
 */
describe('T1418 [REQ-EDG10-003] [SC-010-016] ipLimitKey (H-T1418-01)', () => {
  it('IPv4 sin puerto, con puerto y mapeada en IPv6 dan la misma clave', () => {
    expect(ipLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(ipLimitKey('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(ipLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipLimitKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });
  it('IPv6 se agrega por /64 con forma v6:<4 grupos>, en minúsculas', () => {
    expect(ipLimitKey('2001:DB8:1:2:aaaa:bbbb:cccc:dddd')).toBe('v6:2001:0db8:0001:0002');
    expect(ipLimitKey('2001:db8:1:2::1')).toBe('v6:2001:0db8:0001:0002');
    expect(ipLimitKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(ipLimitKey('2001:db8:1:2::9'));
    expect(ipLimitKey('2001:db8:1:3::1')).not.toBe(ipLimitKey('2001:db8:1:2::1'));
    expect(ipLimitKey('::1')).toBe('v6:0000:0000:0000:0000');
  });
  it('despoja corchetes, puerto de corchetes y zona', () => {
    expect(ipLimitKey('[2001:db8:1:2::1]:443')).toBe('v6:2001:0db8:0001:0002');
    expect(ipLimitKey('[2001:db8:1:2::1]')).toBe('v6:2001:0db8:0001:0002');
    expect(ipLimitKey('fe80::1%eth0')).toBe('v6:fe80:0000:0000:0000');
    expect(ipLimitKey('fe80::1%25en0')).toBe('v6:fe80:0000:0000:0000');
  });
  it('entradas inválidas van al cubo único «invalid» y nunca se retienen tal cual', () => {
    for (const bad of ['', '   ', 'unknown', 'ATACANTE', '999.1.1.1', '1.2.3', '01.2.3.4', '1:2:3', '2001:db8::1::2', 'g::1', '[::1', '[::1]x', 'a'.repeat(200), '1.2.3.4, 5.6.7.8', '<script>']) {
      expect(ipLimitKey(bad), JSON.stringify(bad)).toBe('invalid');
    }
  });
  it('es idempotente y nunca lanza', () => {
    for (const v of ['203.0.113.7', '2001:db8::1', 'basura', '']) expect(ipLimitKey(ipLimitKey(v))).toBe(ipLimitKey(v));
    expect(ipLimitKey(undefined as unknown as string)).toBe('invalid');
  });
});

describe('T1418 [REQ-EDG10-003] [SC-010-016] los limitadores cuentan por clave normalizada', () => {
  it('registro: dos direcciones del mismo /64 comparten contador; otro /64 no', () => {
    const limiter = new RegistrationRateLimiter(() => 1_000_000);
    for (let i = 0; i < 5; i += 1) limiter.recordCreated(`2001:db8:1:2::${i + 1}`);
    expect(() => limiter.assertAllowed('2001:db8:1:2:ffff::9')).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    expect(limiter.assertAllowed('2001:db8:1:3::1')).toBeUndefined();
  });
  it('registro: IPv4 con puerto y sin puerto es el mismo cliente', () => {
    const limiter = new RegistrationRateLimiter(() => 1_000_000);
    for (let i = 0; i < 5; i += 1) limiter.recordCreated(`203.0.113.7:${40000 + i}`);
    expect(() => limiter.assertAllowed('203.0.113.7')).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
  it('admin: fallos desde el mismo /64 se acumulan y el bloqueo aplica a todo el /64', () => {
    const limiter = new AdminAccessLimiter(() => 1_000_000);
    for (let i = 0; i < 10; i += 1) limiter.recordFailure(`[2001:db8:9:9::${i + 1}]`);
    expect(() => limiter.assertNotBlocked('2001:db8:9:9::beef')).toThrow('ERR-ADMIN-RATE-LIMITED');
    expect(limiter.assertNotBlocked('2001:db8:9:8::1')).toBeUndefined();
  });
  it('invitee-search: el contador por IP agrupa el /64 (el usuario cambia, la IP no)', () => {
    const limiter = new InviteeSearchRateLimiter(() => 1_000_000, { maxPerWindow: 3, windowMinutes: 1 } as never);
    for (let i = 0; i < 3; i += 1) limiter.consume(`u${i}`, ipLimitKey(`2001:db8:5:5::${i + 1}`));
    expect(() => limiter.consume('u9', ipLimitKey('2001:db8:5:5::ff'))).toThrow('ERR-RATE-LIMITED');
  });
});

describe('T1418 [REQ-EDG10-003] [SC-010-016] tope duro con descarte por antigüedad (H-T1418-02)', () => {
  it('registro: ráfaga de claves distintas no supera el tope y se descarta la más antigua', () => {
    const limiter = new RegistrationRateLimiter(() => 1_000_000, { maxNewAccounts: 1, windowMinutes: 1440 }, 3);
    for (let i = 1; i <= 10; i += 1) limiter.recordCreated(`198.51.100.${i}`);
    expect((limiter as unknown as { created: Map<string, number[]> }).created.size).toBe(3);
    expect(limiter.assertAllowed('198.51.100.1')).toBeUndefined();
    expect(() => limiter.assertAllowed('198.51.100.10')).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
  it('admin: fallos e inicios quedan acotados', () => {
    const limiter = new AdminAccessLimiter(() => 1_000_000, undefined, undefined, 4);
    for (let i = 1; i <= 50; i += 1) {
      limiter.recordFailure(`198.51.100.${i}`);
      limiter.consumeStart(`198.51.101.${i}`);
    }
    const inner = limiter as unknown as { failures: Map<string, number[]>; starts: Map<string, number[]> };
    expect(inner.failures.size).toBe(4);
    expect(inner.starts.size).toBe(4);
  });
  it('google: el mapa queda acotado aunque todas las ventanas estén vivas', () => {
    const limiter = new GoogleRateLimiter(() => 1_000_000, undefined, 5);
    for (let i = 1; i <= 40; i += 1) limiter.consume('start', `198.51.100.${i}`);
    expect((limiter as unknown as { events: Map<string, number[]> }).events.size).toBe(5);
  });
  it('invitee-search: el mapa queda acotado', () => {
    const limiter = new InviteeSearchRateLimiter(() => 1_000_000, { maxPerWindow: 100, windowMinutes: 10 } as never, 6);
    for (let i = 1; i <= 40; i += 1) limiter.consume(`u${i}`, `198.51.100.${i}`);
    expect((limiter as unknown as { events: Map<string, number[]> }).events.size).toBe(6);
  });
  it('escena: el mapa queda acotado', () => {
    const limiter = new SceneRateLimiter(() => 1_000_000, 5);
    for (let i = 1; i <= 40; i += 1) limiter.consume('GENERATE', `user-${i}`);
    expect((limiter as unknown as { events: Map<string, number[]> }).events.size).toBe(5);
  });
});
