import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/domain/audit/canonical-json.ts';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { toCanonicalView } from '../../src/domain/audit/canonical-view.ts';

/**
 * T253 (fase ROJA) — REQ-AUD-001, INV-AUD-001, SC-012.
 * Contrato esperado (aún sin implementar):
 *  - canonicalJson(valor): JSON con claves ordenadas lexicográficamente a cualquier profundidad (arreglos conservan su orden).
 *  - toCanonicalView(entidad): vista pública sin email, displayName, microchipId ni secretos (password, passwordHash/password_hash, token, tokenHash/token_hash, confirmationToken/confirmation_token, cookie; sessionId NO es secreto), a cualquier profundidad.
 *  - stateHash(entidad): SHA-256 hexadecimal minúsculo, sin clave, de canonicalJson(toCanonicalView(entidad)).
 */
const PET_A = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
  name: 'Argos',
  species: 'DOG',
  weightKg: 24.5,
  microchipId: '982000123456789',
};
const PET_B = {
  weightKg: 24.5,
  microchipId: '982000123456789',
  species: 'DOG',
  name: 'Argos',
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
};
const PET_PUBLIC_JSON = '{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccc01","name":"Argos","species":"DOG","weightKg":24.5}';
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('JSON canónico (src/domain/audit/canonical-json.ts)', () => {
  it('[REQ-AUD-001][INV-AUD-001] dos objetos con las mismas claves en distinto orden producen exactamente el mismo JSON', () => {
    expect(canonicalJson({ b: 1, a: 'x', c: true })).toBe('{"a":"x","b":1,"c":true}');
    expect(canonicalJson({ c: true, a: 'x', b: 1 })).toBe('{"a":"x","b":1,"c":true}');
  });

  it('[REQ-AUD-001] ordena las claves de objetos anidados y conserva el orden de los arreglos', () => {
    expect(canonicalJson({ z: [{ y: 2, x: 1 }, 3, null], a: { d: 4, c: 'k' } })).toBe('{"a":{"c":"k","d":4},"z":[{"x":1,"y":2},3,null]}');
  });
});

describe('vista pública canónica (src/domain/audit/canonical-view.ts)', () => {
  it('[REQ-AUD-001][SC-012] excluye email, displayName y microchipId y conserva el resto de campos', () => {
    const view = toCanonicalView({ id: 'u-1', email: 'andres@example.com', displayName: 'Andrés', microchipId: '982000123456789', role: 'OWNER' });
    expect(view).toEqual({ id: 'u-1', role: 'OWNER' });
  });

  it('[REQ-AUD-001] excluye los campos prohibidos a cualquier profundidad, también dentro de arreglos', () => {
    const view = toCanonicalView({
      id: 'h-1',
      members: [{ userId: 'u-1', email: 'a@example.com', displayName: 'A' }, { userId: 'u-2', displayName: 'B' }],
      pet: { name: 'Argos', microchipId: '982000123456789' },
    });
    expect(view).toEqual({ id: 'h-1', members: [{ userId: 'u-1' }, { userId: 'u-2' }], pet: { name: 'Argos' } });
  });

  it('[INV-AUD-001] no contiene password, passwordHash, token ni cookie, a ninguna profundidad', () => {
    const view = toCanonicalView({
      id: 'u-1',
      role: 'OWNER',
      password: 'Secreta-12345',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc$def',
      token: 'tok-abc-123',
      cookie: 'argos_session=sess-777',
      nested: { token: 'tok-nested', passwordHash: 'h', keep: 1 },
    });
    expect(view).toEqual({ id: 'u-1', role: 'OWNER', nested: { keep: 1 } });
    const text = canonicalJson(view);
    expect(['Secreta-12345', '$argon2id', 'tok-abc-123', 'argos_session', 'tok-nested'].map((s) => text.includes(s))).toEqual([false, false, false, false, false]);
  });

  it('[INV-AUD-001] excluye password_hash (forma de columna SQL) y su valor', () => {
    const view = toCanonicalView({ id: 'u-1', role: 'OWNER', password_hash: 'scrypt$salt$digest-001' });
    expect(view).toEqual({ id: 'u-1', role: 'OWNER' });
    expect(canonicalJson(view).includes('scrypt$salt$digest-001')).toBe(false);
  });

  it('[INV-AUD-001] excluye tokenHash (hash del token de sesión o de confirmación) y su valor', () => {
    const view = toCanonicalView({ id: 'bt-1', userId: 'u-1', tokenHash: 'e3b0c44298fc1c149afbf4c8996fb924', nested: { tokenHash: 'ffff0001', keep: 'sí' } });
    expect(view).toEqual({ id: 'bt-1', userId: 'u-1', nested: { keep: 'sí' } });
    expect(['e3b0c44298fc1c149afbf4c8996fb924', 'ffff0001'].map((v) => canonicalJson(view).includes(v))).toEqual([false, false]);
  });

  it('[INV-AUD-001] excluye token_hash (forma de columna SQL) y su valor', () => {
    const view = toCanonicalView({ id: 'bt-2', user_id: 'u-1', token_hash: 'a1b2c3d4e5f60718', items: [{ token_hash: 'deadbeef0002', keep: 2 }] });
    expect(view).toEqual({ id: 'bt-2', user_id: 'u-1', items: [{ keep: 2 }] });
    expect(['a1b2c3d4e5f60718', 'deadbeef0002'].map((v) => canonicalJson(view).includes(v))).toEqual([false, false]);
  });

  it('[INV-AUD-001] excluye confirmationToken (token efímero de eliminación de cuenta) y su valor', () => {
    const view = toCanonicalView({ id: 'req-1', confirmationPhrase: 'ELIMINAR MI CUENTA', confirmationToken: 'ct-77aa-9981', nested: { confirmationToken: 'ct-nested-01' } });
    expect(view).toEqual({ id: 'req-1', confirmationPhrase: 'ELIMINAR MI CUENTA', nested: {} });
    expect(['ct-77aa-9981', 'ct-nested-01'].map((v) => canonicalJson(view).includes(v))).toEqual([false, false]);
  });

  it('[INV-AUD-001] excluye confirmation_token (forma de columna SQL) y su valor', () => {
    const view = toCanonicalView({ id: 'req-2', confirmation_token: 'ct-55bb-1234', list: [{ confirmation_token: 'ct-list-02', keep: true }] });
    expect(view).toEqual({ id: 'req-2', list: [{ keep: true }] });
    expect(['ct-55bb-1234', 'ct-list-02'].map((v) => canonicalJson(view).includes(v))).toEqual([false, false]);
  });

  it('[INV-AUD-001] sessionId NO es secreto (sessions.id es el UUID de la fila, data-model): se conserva en la vista', () => {
    const view = toCanonicalView({ id: 'u-1', sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc09', cookie: 'argos_session=x' });
    expect(view).toEqual({ id: 'u-1', sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc09' });
  });

  it('[REQ-AUD-001] no muta la entidad de entrada', () => {
    const input = { id: 'u-1', email: 'a@example.com', password: 'x' };
    toCanonicalView(input);
    expect(input).toEqual({ id: 'u-1', email: 'a@example.com', password: 'x' });
  });
});

describe('hash de estado (src/domain/audit/state-hash.ts)', () => {
  it('[SC-012][REQ-AUD-001] el mismo estado con distinto orden de claves produce el mismo hash SHA-256 hexadecimal', () => {
    expect(stateHash(PET_A)).toBe(stateHash(PET_B));
    expect(stateHash(PET_A)).toBe(sha256(PET_PUBLIC_JSON));
  });

  it('[REQ-AUD-001] el hash es SHA-256 sin clave: 64 caracteres hexadecimales minúsculos', () => {
    expect(stateHash(PET_A)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[REQ-AUD-001] cambiar solo un campo excluido (email, displayName, microchipId) no cambia el hash', () => {
    const base = { id: 'u-1', role: 'OWNER', email: 'a@example.com', displayName: 'A', microchipId: '1' };
    const other = { id: 'u-1', role: 'OWNER', email: 'otro@example.com', displayName: 'Otro', microchipId: '2' };
    expect(stateHash(base)).toBe(stateHash(other));
  });

  it('[REQ-AUD-001] cambiar un campo público sí cambia el hash', () => {
    expect(stateHash({ id: 'u-1', role: 'OWNER' })).not.toBe(stateHash({ id: 'u-1', role: 'MEMBER' }));
  });

  it('[INV-AUD-001] cambiar solo un secreto (password, token, tokenHash, confirmationToken, cookie) no cambia el hash y el hash no revela el secreto', () => {
    const a = { id: 'u-1', role: 'OWNER', password: 'uno', token: 't1', tokenHash: 'h1', confirmationToken: 'c1', cookie: 'k1' };
    const b = { id: 'u-1', role: 'OWNER', password: 'dos', token: 't2', tokenHash: 'h2', confirmationToken: 'c2', cookie: 'k2' };
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).toBe(sha256('{"id":"u-1","role":"OWNER"}'));
  });

  it('[INV-AUD-001] sessionId sí cuenta como campo público: cambiarlo cambia el hash', () => {
    expect(stateHash({ id: 'u-1', sessionId: 'uno' })).not.toBe(stateHash({ id: 'u-1', sessionId: 'dos' }));
    expect(stateHash({ id: 'u-1', sessionId: 'uno' })).toBe(sha256('{"id":"u-1","sessionId":"uno"}'));
  });
});
