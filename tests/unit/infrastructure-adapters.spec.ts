import { describe, expect, it } from 'vitest';
import { CryptoSecureTokenAdapter } from '../../src/infrastructure/adapters/crypto-secure-token.adapter.ts';
import { CryptoUuidAdapter } from '../../src/infrastructure/adapters/crypto-uuid.adapter.ts';
import { ScryptPasswordHasherAdapter } from '../../src/infrastructure/adapters/scrypt-password-hasher.adapter.ts';
import { SystemClockAdapter, isSupportedTimeZone } from '../../src/infrastructure/adapters/system-clock.adapter.ts';
import * as reExports from '../../src/infrastructure/adapters/deterministic-adapters.ts';
import { Sha256BackupTokenAdapter } from '../../src/infrastructure/adapters/sha256-backup-token.adapter.ts';
import { SlidingWindowRateLimiterAdapter } from '../../src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { DeterministicIdAdapter } from '../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { RATE_EVENT_IDS } from '../fixtures/application-harness.ts';
import { SequentialTokenAdapter } from '../fixtures/test-doubles.ts';
import { ANA, ELENA, REFERENCE_NOW, USERS_FOR_ADAPTERS } from '../fixtures/identity-fixtures.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const at = (iso: string) => () => new Date(iso);

describe('SystemClockAdapter (src/infrastructure/adapters/system-clock.adapter.ts)', () => {
  it.each([
    ['2026-11-05T23:59:59.999Z', 'America/Bogota', '2026-11-05'],
    ['2026-11-06T00:00:00.000Z', 'America/Bogota', '2026-11-05'],
    ['2026-11-06T04:59:59.999Z', 'America/Bogota', '2026-11-05'],
    ['2026-11-06T05:00:00.000Z', 'America/Bogota', '2026-11-06'],
    ['2026-11-06T00:00:00.000Z', 'UTC', '2026-11-06'],
    ['2026-11-05T13:30:00.000Z', 'Asia/Tokyo', '2026-11-05'],
    ['2026-11-05T15:00:00.000Z', 'Asia/Tokyo', '2026-11-06'],
    ['2024-02-29T12:00:00.000Z', 'America/Bogota', '2024-02-29'],
  ])('[INV-ARCH-001] F6: a %s en %s, todayIsoDate es %s (fecha local de APP_TIMEZONE, no la del proceso)', (instant, zone, expected) => {
    expect(new SystemClockAdapter(zone, at(instant)).todayIsoDate()).toBe(expected);
  });

  it('[INV-ARCH-001] F6: a las 19:00 en Bogotá, createdAt (UTC) cae en el día siguiente pero todayIsoDate sigue en el día local', () => {
    const clock = new SystemClockAdapter('America/Bogota', at('2026-11-06T00:00:00.000Z'));
    expect([clock.todayIsoDate(), clock.nowIsoTimestamp()]).toEqual(['2026-11-05', '2026-11-06T00:00:00.000Z']);
  });

  it('[INV-ARCH-001] la zona por defecto es America/Bogota y nowIsoTimestamp es UTC canónico con milisegundos', () => {
    const clock = new SystemClockAdapter(undefined, at('2026-01-02T03:04:05.006Z'));
    expect([clock.timeZone, clock.nowIsoTimestamp(), clock.todayIsoDate()]).toEqual(['America/Bogota', '2026-01-02T03:04:05.006Z', '2026-01-01']);
  });

  it('[INV-ARCH-001] sin reloj inyectado usa el reloj del sistema y devuelve formatos válidos', () => {
    const clock = new SystemClockAdapter();
    expect([/^\d{4}-\d{2}-\d{2}$/.test(clock.todayIsoDate()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(clock.nowIsoTimestamp())]).toEqual([true, true]);
  });

  it.each(['', 'Marte/Olympus', 'America/NoExiste', ' '])('[INV-ARCH-001] una zona horaria inválida (%j) se rechaza al construir', (zone) => {
    expect(isSupportedTimeZone(zone)).toBe(false);
    expect(() => new SystemClockAdapter(zone)).toThrow(RangeError);
  });

  it('[INV-ARCH-004] deterministic-adapters.ts re-exporta los cuatro adaptadores de reloj e IDs desde sus archivos', () => {
    expect(Object.keys(reExports).sort()).toEqual(['CryptoUuidAdapter', 'DeterministicIdAdapter', 'FixedClockAdapter', 'SystemClockAdapter']);
  });
});

describe('CryptoUuidAdapter y CryptoSecureTokenAdapter', () => {
  it('[INV-ARCH-002] CryptoUuidAdapter devuelve UUID v4 en minúsculas, distintos entre sí', () => {
    const ids = Array.from({ length: 200 }, () => new CryptoUuidAdapter().nextId());
    expect([ids.every((id) => UUID_V4.test(id)), new Set(ids).size]).toEqual([true, 200]);
  });

  it('[INV-AUTH-003] CryptoSecureTokenAdapter devuelve tokens base64url de 32 bytes (43 caracteres), distintos entre sí', () => {
    const adapter = new CryptoSecureTokenAdapter();
    const tokens = Array.from({ length: 200 }, () => adapter.nextSessionToken());
    expect([tokens.every((t) => /^[A-Za-z0-9_-]{43}$/.test(t)), new Set(tokens).size, Buffer.from(tokens[0]!, 'base64url').length]).toEqual([true, 200, 32]);
  });
});

describe('ScryptPasswordHasherAdapter (src/infrastructure/adapters/scrypt-password-hasher.adapter.ts)', () => {
  const hasher = new ScryptPasswordHasherAdapter();

  it('[INV-AUTH-003] el hash es scrypt con salt aleatorio: formato scrypt$N$r$p$salt$hash, sin la contraseña y distinto en cada llamada', async () => {
    const plain = 'Contraseña-Segura-123';
    const [first, second] = [await hasher.hash(plain), await hasher.hash(plain)];
    const parts = first.split('$');
    expect([
      parts.slice(0, 4),
      Buffer.from(parts[4]!, 'base64').length,
      Buffer.from(parts[5]!, 'base64').length,
      first.includes(plain),
      first === second,
    ]).toEqual([['scrypt', '16384', '8', '1'], 16, 64, false, false]);
  });

  it('[INV-AUTH-003] verify acepta la contraseña correcta (también en otra normalización Unicode) y rechaza cualquier otra', async () => {
    const hash = await hasher.hash('café-Ñandú-1');
    const results = await Promise.all([
      hasher.verify('café-Ñandú-1', hash),
      hasher.verify('café-Ñandú-1', hash),
      hasher.verify('café-Ñandú-2', hash),
      hasher.verify('', hash),
    ]);
    expect(results).toEqual([true, true, false, false]);
  });

  it.each([
    ['vacío', ''],
    ['hash falso de pruebas', 'fake-scrypt$Contraseña-Segura-123'],
    ['otro algoritmo', 'bcrypt$10$abc$def'],
    ['N no es potencia de 2', 'scrypt$1000$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaA=='],
    ['N excesivo para la memoria', 'scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaA=='],
    ['base64 inválido', 'scrypt$16384$8$1$***$***'],
  ])('[INV-AUTH-003] verify devuelve false, sin lanzar, ante un hash con formato inválido (%s)', async (_case, hash) => {
    expect(await hasher.verify('Contraseña-Segura-123', hash)).toBe(false);
  });

  it('[INV-AUTH-006] createDummyHash produce un hash scrypt real con el mismo coste, que no verifica ninguna contraseña conocida', async () => {
    const dummy = await hasher.createDummyHash();
    expect([dummy.split('$').slice(0, 4), await hasher.verify('', dummy), await hasher.verify('Contraseña-Segura-123', dummy)]).toEqual([
      ['scrypt', '16384', '8', '1'],
      false,
      false,
    ]);
  });

  it('[INV-AUTH-003] verify usa los parámetros guardados en el hash, no los del adaptador', async () => {
    const light = new ScryptPasswordHasherAdapter({ N: 1024, r: 8, p: 1 });
    const hash = await light.hash('Otra-Clave-456');
    expect([hash.split('$')[1], await hasher.verify('Otra-Clave-456', hash)]).toEqual(['1024', true]);
  });
});

describe('SlidingWindowRateLimiterAdapter (src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts)', () => {
  const at = (offsetMs: number) => new Date(Date.parse(REFERENCE_NOW) + offsetMs).toISOString();
  const setup = (max = 3) => {
    const uow = new InMemoryUnitOfWork({ ...USERS_FOR_ADAPTERS() });
    const limiter = new SlidingWindowRateLimiterAdapter(new DeterministicIdAdapter(RATE_EVENT_IDS), { EXPORT: { maxPerWindow: 1, windowMinutes: 15 }, INVITE: { maxPerWindow: max, windowMinutes: 15 } });
    const consume = (scope: 'EXPORT' | 'INVITE', userId: string, offsetMs: number) => uow.runInTransaction((r) => limiter.tryConsume(r, scope, userId, at(offsetMs)));
    return { uow, consume };
  };

  it('[ERR-RATE-LIMITED][INV-ARCH-002] permite hasta INVITE_MAX_PER_WINDOW consumos y rechaza el siguiente sin registrarlo', async () => {
    const { uow, consume } = setup();
    expect([await consume('INVITE', ANA, 0), await consume('INVITE', ANA, 1000), await consume('INVITE', ANA, 2000), await consume('INVITE', ANA, 3000), await consume('INVITE', ANA, 4000)]).toEqual([true, true, true, false, false]);
    expect(uow.snapshot().rateEvents).toHaveLength(3);
  });

  it('[ERR-RATE-LIMITED] la ventana es deslizante: el evento deja de contar justo a los 15 minutos y cada consumo rechazado no la prolonga', async () => {
    const { consume } = setup(2);
    await consume('INVITE', ANA, 0);
    await consume('INVITE', ANA, 60_000);
    expect(await consume('INVITE', ANA, 15 * 60_000 - 1)).toBe(false);
    expect(await consume('INVITE', ANA, 15 * 60_000)).toBe(true);
    expect(await consume('INVITE', ANA, 15 * 60_000 + 1)).toBe(false);
    expect(await consume('INVITE', ANA, 16 * 60_000)).toBe(true);
  });

  it('[ERR-RATE-LIMITED] el límite es por ámbito y por actor: agotar INVITE no afecta a EXPORT ni a otra persona', async () => {
    const { consume } = setup(1);
    expect([await consume('INVITE', ANA, 0), await consume('INVITE', ANA, 1), await consume('EXPORT', ANA, 2), await consume('EXPORT', ANA, 3), await consume('INVITE', ELENA, 4)]).toEqual([true, false, true, false, true]);
  });
});

describe('Sha256BackupTokenAdapter (src/infrastructure/adapters/sha256-backup-token.adapter.ts)', () => {
  const at = (offsetMs: number) => new Date(Date.parse(REFERENCE_NOW) + offsetMs).toISOString();
  const setup = () => {
    const uow = new InMemoryUnitOfWork({ ...USERS_FOR_ADAPTERS() });
    const adapter = new Sha256BackupTokenAdapter(new SequentialTokenAdapter());
    return { uow, issue: (userId: string, offsetMs = 0) => uow.runInTransaction((r) => adapter.issue(r, userId, at(offsetMs))), consume: (userId: string, token: string, offsetMs: number) => uow.runInTransaction((r) => adapter.consume(r, userId, token, at(offsetMs))) };
  };

  it('[REQ-ACC-002][REQ-BACKUP2-001] emite un token de 43 caracteres base64url con caducidad a 10 minutos y guarda solo su SHA-256', async () => {
    const { uow, issue } = setup();
    const issued = await issue(ANA);
    const stored = uow.snapshot().confirmationTokens[ANA]!;
    expect([/^[A-Za-z0-9_-]{43}$/.test(issued.token), issued.expiresAt, stored.expiresAt, stored.tokenHash]).toEqual([true, at(10 * 60_000), at(10 * 60_000), expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(JSON.stringify(uow.snapshot().confirmationTokens)).not.toContain(issued.token);
  });

  it('[REQ-ACC-002] un token nuevo invalida el anterior, el consumo es de un solo uso y está ligado al usuario y a los 10 minutos exactos', async () => {
    const { issue, consume } = setup();
    const first = await issue(ANA);
    const second = await issue(ANA, 1000);
    const alien = await issue(ELENA, 1000);
    expect([
      await consume(ANA, first.token, 2000),
      await consume(ANA, alien.token, 2000),
      await consume(ELENA, second.token, 2000),
      await consume(ANA, second.token, 1000 + 10 * 60_000),
      await consume(ANA, second.token, 1000 + 10 * 60_000 - 1),
      await consume(ANA, second.token, 1000 + 10 * 60_000 - 1),
    ]).toEqual([false, false, false, false, true, false]);
  });

  it('[REQ-ACC-002] consume rechaza sin consultar nada una cadena que no tiene la forma de ConfirmationToken', async () => {
    const { consume } = setup();
    expect([await consume(ANA, '', 0), await consume(ANA, 'corto', 0), await consume(ANA, 'A'.repeat(44), 0)]).toEqual([false, false, false]);
  });
});

describe('CryptoSecureTokenAdapter.nextConfirmationToken', () => {
  it('[REQ-ACC-002][INV-ARCH-002] el token de confirmación son 32 bytes aleatorios en base64url (43 caracteres) y no se repiten', () => {
    const adapter = new CryptoSecureTokenAdapter();
    const tokens = Array.from({ length: 50 }, () => adapter.nextConfirmationToken());
    expect([tokens.every((t) => /^[A-Za-z0-9_-]{43}$/.test(t)), new Set(tokens).size]).toEqual([true, 50]);
  });
});
