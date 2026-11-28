import { afterEach, describe, expect, it } from 'vitest';
import { RegisterPetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { ANDRES, ENGINE_FACTORIES, MARIA, type Engine012 } from '../fixtures/co-ownership-012.ts';
import { CHIP_A, CHIP_FREE, codeOfChip, loadChipModule, loadIpRateEventsPort } from '../fixtures/chip-012.ts';

/**
 * T1634 (Feature 012, Bloque B, #23) PRUEBAS ROJAS del conteo de TODO intento con `microchipId` y del `429` uniforme (T1640). ROJAS porque `chip-ip-rate-limit.ts` (`recordChipAttempt`, evaluación
 * usuario -> IP -> global, comprobar y registrar atómico) y el puerto `ip-rate-events.port.ts` (`ip_rate_events`, repositorio `repositories.ipRateEvents`) aún no existen.
 * Cifras de N2-R4: usuario 10, IP 30, global 1000 en ventana móvil de 24 h; un 429 NO se registra ni incrementa el global.
 *
 * @implements REQ-CHP12-005, INV-CHP12-007, ERR-RATE-LIMITED, NFR-012-001, NFR-012-006
 * Cubre SC-012-021, SC-012-022, SC-012-078, SC-012-100, SC-012-117.
 */
let engine: Engine012 | null = null;
afterEach(async () => {
  await engine?.dispose();
  engine = null;
});

interface Limiter { recordChipAttempt(deps: unknown, input: { userId: string; ip: string; trustProxyHops: number }): Promise<void>; CHIP_LOOKUP_LIMITS: { perUser: number; perIp: number; global: number } }
const REG = (name: string, microchipId: string) => ({ name, species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE', microchipId });
const NOW = '2026-11-26T10:00:00.000Z';

for (const factory of ENGINE_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1634 conteo de intentos de chip y 429 uniforme (${factory.name})`, { timeout: 60_000 }, () => {
    it('[SC-012-021] tras 10 intentos del usuario en 24 h, un chip libre y uno ocupado reciben el MISMO ERR-RATE-LIMITED', async () => {
      const limiter = await loadChipModule<Limiter>('chip-ip-rate-limit');
      await loadIpRateEventsPort();
      engine = await factory.make();
      engine.setNow(NOW);
      await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      expect(limiter.CHIP_LOOKUP_LIMITS).toEqual({ perUser: 10, perIp: 30, global: 1000 });
      for (let i = 0; i < 10; i += 1) await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, REG(`P${i}`, i % 2 === 0 ? CHIP_A : CHIP_FREE)));
      const free = await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, REG('Libre', '985112345678990')));
      const taken = await codeOfChip(new RegisterPetUseCase(engine.deps).execute(ANDRES, REG('Ocupado', CHIP_A)));
      expect([free, taken]).toEqual(['ERR-RATE-LIMITED', 'ERR-RATE-LIMITED']);
    });

    it('[SC-012-078] el límite por IP (30) respeta ARGOS_TRUST_PROXY_HOPS y agrupa IPv6 por /64; el global (1000) avisa al 70 % solo por log warn sin PII ni chip', async () => {
      const limiter = await loadChipModule<Limiter>('chip-ip-rate-limit');
      engine = await factory.make();
      engine.setNow(NOW);
      for (let i = 0; i < 30; i += 1) await limiter.recordChipAttempt(engine.deps, { userId: `u${i}`, ip: `2001:db8:0:1::${i + 1}`, trustProxyHops: 0 });
      await expect(limiter.recordChipAttempt(engine.deps, { userId: 'u99', ip: '2001:db8:0:1::ffff', trustProxyHops: 0 })).rejects.toMatchObject({ code: 'ERR-RATE-LIMITED' });
    });

    it('[SC-012-100] un 429 no se registra en ningún contador ni prolonga la ventana: a las 24 h del primer evento el cupo se libera', async () => {
      const limiter = await loadChipModule<Limiter>('chip-ip-rate-limit');
      engine = await factory.make();
      engine.setNow(NOW);
      for (let i = 0; i < 10; i += 1) await limiter.recordChipAttempt(engine.deps, { userId: ANDRES, ip: '203.0.113.9', trustProxyHops: 0 });
      await expect(limiter.recordChipAttempt(engine.deps, { userId: ANDRES, ip: '203.0.113.9', trustProxyHops: 0 })).rejects.toMatchObject({ code: 'ERR-RATE-LIMITED' });
      engine.setNow('2026-11-27T10:00:01.000Z');
      await expect(limiter.recordChipAttempt(engine.deps, { userId: ANDRES, ip: '203.0.113.9', trustProxyHops: 0 })).resolves.toBeUndefined();
    });

    it('[SC-012-117] comprobar y registrar es atómico: una ráfaga paralela de 25 intentos del mismo usuario admite exactamente 10', async () => {
      const limiter = await loadChipModule<Limiter>('chip-ip-rate-limit');
      engine = await factory.make();
      engine.setNow(NOW);
      const results = await Promise.allSettled(Array.from({ length: 25 }, () => limiter.recordChipAttempt(engine!.deps, { userId: ANDRES, ip: '203.0.113.10', trustProxyHops: 0 })));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    });

    it('[SC-012-022] ni los registros de la aplicación ni los errores contienen el chip completo, solo los últimos 4 dígitos', async () => {
      await loadChipModule<Limiter>('chip-ip-rate-limit');
      engine = await factory.make();
      engine.setNow(NOW);
      await new RegisterPetUseCase(engine.deps).execute(MARIA, REG('Luna', CHIP_A));
      const error = await new RegisterPetUseCase(engine.deps).execute(ANDRES, REG('Rocky', CHIP_A)).catch((e: unknown) => e);
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(CHIP_A);
      const events = await engine.run((r) => (r as unknown as { ipRateEvents: { listAll(): Promise<unknown[]> } }).ipRateEvents.listAll());
      expect(JSON.stringify(events)).not.toContain(CHIP_A);
    });
  });
}
