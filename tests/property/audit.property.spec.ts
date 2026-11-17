import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/domain/audit/canonical-json.ts';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { toCanonicalView } from '../../src/domain/audit/canonical-view.ts';

/** T253 (fase ROJA) — propiedades de REQ-AUD-001, INV-AUD-001 y SC-012. */
const PROPERTY_SEED = 20261112;
/** sessionId NO es secreto (sessions.id es un UUID PK): es un campo público más. */
const PUBLIC_KEYS = ['id', 'name', 'species', 'weightKg', 'birthDate', 'notes', 'role', 'status', 'sessionId'] as const;
const EXCLUDED_KEYS = ['email', 'displayName', 'microchipId'] as const;
const SECRET_KEYS = ['password', 'passwordHash', 'password_hash', 'token', 'tokenHash', 'token_hash', 'confirmationToken', 'confirmation_token', 'cookie'] as const;
const ALL_KEYS = [...PUBLIC_KEYS, ...EXCLUDED_KEYS, ...SECRET_KEYS] as const;

type Entries = ReadonlyArray<readonly [string, string | number | boolean | null]>;
const scalar = fc.oneof(fc.string({ maxLength: 12 }), fc.integer({ min: -1000, max: 1000 }), fc.boolean(), fc.constant(null));
const entriesArb: fc.Arbitrary<Entries> = fc
  .uniqueArray(fc.constantFrom(...ALL_KEYS), { minLength: 1, maxLength: ALL_KEYS.length })
  .chain((keys) => fc.tuple(...keys.map((k) => fc.tuple(fc.constant(k), scalar))));

const build = (entries: Entries): Record<string, unknown> => Object.fromEntries(entries);
const reorder = (entries: Entries, shift: number): Entries => {
  const n = entries.length;
  const rotated = entries.map((_, i) => entries[(i + shift) % n]!);
  return [...rotated].reverse();
};
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const forbidden = new Set<string>([...EXCLUDED_KEYS, ...SECRET_KEYS]);
const publicKeysOf = (entries: Entries): string[] => entries.map(([k]) => k).filter((k) => !forbidden.has(k)).sort();

describe('propiedades de auditoría canónica (REQ-AUD-001, INV-AUD-001, SC-012)', () => {
  it('[SC-012] el hash y el JSON canónico no cambian con el orden de claves', () => {
    fc.assert(
      fc.property(entriesArb, fc.nat({ max: 50 }), (entries, shift) => {
        const a = build(entries);
        const b = build(reorder(entries, shift));
        expect([stateHash(a), canonicalJson(toCanonicalView(a))]).toEqual([stateHash(b), canonicalJson(toCanonicalView(b))]);
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[REQ-AUD-001] la vista nunca contiene email, displayName ni microchipId y conserva exactamente las claves públicas', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const view = toCanonicalView(build(entries)) as Record<string, unknown>;
        expect(Object.keys(view).sort()).toEqual(publicKeysOf(entries));
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[INV-AUD-001] la vista nunca contiene password, passwordHash, token, tokenHash, confirmationToken ni cookie (ni sus formas snake_case), ni siquiera anidados', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const view = toCanonicalView({ outer: build(entries), list: [build(entries)] }) as { outer: Record<string, unknown>; list: Array<Record<string, unknown>> };
        const expected = publicKeysOf(entries);
        expect([Object.keys(view.outer).sort(), Object.keys(view.list[0]!).sort()]).toEqual([expected, expected]);
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });

  it('[REQ-AUD-001] el hash es el SHA-256 hexadecimal del JSON canónico de la vista, y cambiar solo campos excluidos o secretos no lo altera', () => {
    fc.assert(
      fc.property(entriesArb, fc.string({ maxLength: 10 }), (entries, noise) => {
        const original = build(entries);
        const altered = { ...original, email: `${noise}@example.com`, displayName: noise, microchipId: noise, password: noise, token: noise, tokenHash: noise, token_hash: noise, confirmationToken: noise, confirmation_token: noise, cookie: noise };
        expect([stateHash(original), stateHash(altered)]).toEqual([sha256(canonicalJson(toCanonicalView(original))), sha256(canonicalJson(toCanonicalView(original)))]);
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });
});
