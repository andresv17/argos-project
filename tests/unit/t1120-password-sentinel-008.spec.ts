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

/**
 * H-A21-1: método elegido = MEDICIÓN DE TIEMPO (mediana de 30 corridas por muestra, intercaladas para repartir la deriva de CPU), razón 0.8x..1.25x contra un hash
 * real. Un dummy con la mitad de coste (N/2) da ~0.5 y uno con r=4 ~0.5: ambos caen fuera del rango. Si el entorno fuese demasiado ruidoso, el plan B es espiar los
 * parámetros de scrypt de `dummyVerify` y compararlos con los de `hash()`.
 */
const SAMPLES = 30;
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function medianCosts(hashes: Record<string, string>): Promise<Record<string, number>> {
  const times: Record<string, number[]> = Object.fromEntries(Object.keys(hashes).map((key) => [key, []]));
  for (let i = 0; i < SAMPLES; i += 1) {
    for (const [key, hash] of Object.entries(hashes)) {
      const started = performance.now();
      await scrypt.verify('MalaClave99', hash);
      times[key]!.push(performance.now() - started);
    }
  }
  return Object.fromEntries(Object.entries(times).map(([key, values]) => [key, median(values)]));
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

  it('verificar contra el centinela y contra hashes que no parsean cuesta lo mismo que contra un hash real con contraseña incorrecta (anti-enumeración, razón 0.8x..1.25x)', async () => {
    const real = await scrypt.hash('Argos2026a');
    await scrypt.verify('x', real); // calentamiento
    const garbage = ['', 'no-es-un-hash', 'scrypt$x$y$z$a$b'];
    for (const hash of garbage) expect(await scrypt.verify('MalaClave99', hash)).toBe(false);
    const costs = await medianCosts({ real, sentinel: NO_PASSWORD_SENTINEL, g1: garbage[1]! });
    expect(costs['real']).toBeGreaterThan(5);
    for (const key of ['sentinel', 'g1']) {
      const ratio = costs[key]! / costs['real']!;
      expect(ratio, `${key}: razón ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(0.8);
      expect(ratio, `${key}: razón ${ratio.toFixed(2)}`).toBeLessThanOrEqual(1.25);
    }
  }, 60_000);

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
