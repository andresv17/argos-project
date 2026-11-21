import { describe, expect, it } from 'vitest';
import { authMethodsOf, hasPassword, NO_PASSWORD_SENTINEL } from '../../src/domain/auth/password-sentinel.ts';
import { DEFAULT_SCRYPT_PARAMETERS, ScryptPasswordHasherAdapter } from '../../src/infrastructure/adapters/scrypt-password-hasher.adapter.ts';
import { CryptoOneTimeTokenEntropyAdapter } from '../../src/infrastructure/adapters/crypto-one-time-token-entropy.adapter.ts';

/**
 * T1120 (pruebas rojas, Feature 008): contraseña centinela ADR-008-14 (decisión de Neo, Nivel 2, 2026-11-21) con el hasher scrypt REAL.
 *  (a) el valor `!no-password!` no tiene formato scrypt (la columna sigue NOT NULL, sin migración);
 *  (b) `verify` ante un hash que no parsea ejecuta una verificación dummy del mismo coste y devuelve siempre false;
 *  (c) `hasPassword`/`authMethods.password` es false para el centinela (la prueba de `startGoogleLink` está en t1120-google-use-cases-008).
 * Además: el puerto de entropía de producción (T1121) entrega bytes aleatorios del tamaño pedido.
 */

const scrypt = new ScryptPasswordHasherAdapter();

async function timed(work: () => Promise<unknown>, runs = 3): Promise<number> {
  const started = performance.now();
  for (let i = 0; i < runs; i += 1) await work();
  return (performance.now() - started) / runs;
}

describe('ADR-008-14 (a): formato imposible para scrypt', () => {
  it('el valor fijo es `!no-password!` y no es un hash scrypt', () => {
    expect(NO_PASSWORD_SENTINEL).toBe('!no-password!');
    expect(NO_PASSWORD_SENTINEL.startsWith('scrypt$')).toBe(false);
    expect(NO_PASSWORD_SENTINEL.split('$')).toHaveLength(1);
  });

  it('ningún hash real generado por el sistema coincide con el centinela y hash() nunca lo produce', async () => {
    const hashes = await Promise.all(['', '!no-password!', 'Argos2026a'].map((plain) => scrypt.hash(plain)));
    for (const hash of hashes) expect(hash).not.toBe(NO_PASSWORD_SENTINEL);
  });
});

describe('ADR-008-14 (b): verifyPassword con dummy de coste constante y siempre false', () => {
  it('ninguna contraseña verifica contra el centinela (ni el propio valor, ni vacía, ni con espacios)', async () => {
    for (const plain of [NO_PASSWORD_SENTINEL, '', ' ', 'Argos2026a', `${NO_PASSWORD_SENTINEL}${NO_PASSWORD_SENTINEL}`, 'scrypt$16384$8$1$AAAA$AAAA']) {
      expect(await scrypt.verify(plain, NO_PASSWORD_SENTINEL)).toBe(false);
    }
  });

  it('verificar contra el centinela cuesta lo mismo que contra un hash real con contraseña incorrecta (anti-enumeración)', async () => {
    const real = await scrypt.hash('Argos2026a');
    await scrypt.verify('x', real); // calentamiento
    const realWrong = await timed(() => scrypt.verify('MalaClave99', real));
    const sentinel = await timed(() => scrypt.verify('MalaClave99', NO_PASSWORD_SENTINEL));
    expect(realWrong).toBeGreaterThan(5);
    // Sin dummy el atajo tardaría microsegundos; con dummy el coste es del mismo orden (tolerancia amplia contra ruido de CI).
    expect(sentinel).toBeGreaterThan(realWrong * 0.4);
    expect(sentinel).toBeLessThan(realWrong * 3);
  });

  it('cualquier hash que no parsea se comporta igual que el centinela: false con coste de scrypt', async () => {
    const real = await scrypt.hash('Argos2026a');
    const realWrong = await timed(() => scrypt.verify('MalaClave99', real));
    for (const garbage of ['', 'no-es-un-hash', 'scrypt$x$y$z$a$b']) {
      expect(await scrypt.verify('MalaClave99', garbage)).toBe(false);
      expect(await timed(() => scrypt.verify('MalaClave99', garbage))).toBeGreaterThan(realWrong * 0.4);
    }
  });

  it('un hash real con la contraseña correcta sigue verificando (sin regresión)', async () => {
    const real = await scrypt.hash('Argos2026a');
    expect(await scrypt.verify('Argos2026a', real)).toBe(true);
    expect(await scrypt.verify('Argos2026b', real)).toBe(false);
  });

  it('un hash hostil con parámetros por encima del tope sigue devolviendo false', async () => {
    const { N, r, p } = DEFAULT_SCRYPT_PARAMETERS;
    expect(await scrypt.verify('x', `scrypt$${N * 4}$${r}$${p}$AAAAAAAAAAAAAAAAAAAAAA==$${'A'.repeat(86)}==`)).toBe(false);
  });
});

describe('ADR-008-14 (c): hasPassword / AuthMethods', () => {
  it('el centinela no es una contraseña; un hash scrypt sí', async () => {
    expect(hasPassword(NO_PASSWORD_SENTINEL)).toBe(false);
    expect(hasPassword(await scrypt.hash('Argos2026a'))).toBe(true);
  });

  it('authMethods expone solo dos booleanos (sin sub, sin correo ni hash)', async () => {
    const real = await scrypt.hash('Argos2026a');
    expect(authMethodsOf(NO_PASSWORD_SENTINEL, 1)).toEqual({ password: false, google: true });
    expect(authMethodsOf(real, 0)).toEqual({ password: true, google: false });
    expect(authMethodsOf(real, 1)).toEqual({ password: true, google: true });
  });
});

describe('T1121 puerto de entropía de producción', () => {
  const entropy = new CryptoOneTimeTokenEntropyAdapter();

  it('entrega exactamente los bytes pedidos y distintos en cada llamada', () => {
    const a = entropy.nextEntropyBytes(32);
    const b = entropy.nextEntropyBytes(32);
    expect([a.length, b.length]).toEqual([32, 32]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(a.some((byte) => byte !== 0)).toBe(true);
  });
});
