/**
 * Lightweight, 100% deterministic test and property-based testing harness
 * compatible with Vitest API and fast-check API, executing directly on Node.js
 * without external network dependencies.
 */

import assert from 'node:assert/strict';

interface SuiteBlock {
  readonly name: string;
  readonly tests: Array<{ readonly name: string; readonly fn: () => void | Promise<void> }>;
}

const suites: SuiteBlock[] = [];
let currentSuite: SuiteBlock | null = null;

export function describe(name: string, fn: () => void): void {
  const previousSuite = currentSuite;
  const suite: SuiteBlock = { name, tests: [] };
  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = previousSuite;
}

export function it(name: string, fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    const defaultSuite: SuiteBlock = { name: 'Root', tests: [] };
    suites.push(defaultSuite);
    currentSuite = defaultSuite;
  }
  currentSuite.tests.push({ name, fn });
}

export const test = it;

export interface ExpectChain<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toBeNull(): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toContain(item: unknown): void;
  toHaveLength(length: number): void;
  toMatch(pattern: RegExp | string): void;
  toThrow(expectedMessageOrCode: string | RegExp): void;
  readonly not: {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toContain(item: unknown): void;
  };
}

export function expect<T>(actual: T): ExpectChain<T> {
  return {
    toBe(expected: T): void {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown): void {
      assert.deepStrictEqual(actual, expected);
    },
    toStrictEqual(expected: unknown): void {
      assert.deepStrictEqual(actual, expected);
    },
    toBeNull(): void {
      assert.strictEqual(actual, null);
    },
    toBeGreaterThan(expected: number): void {
      assert.ok(typeof actual === 'number' && actual > expected, `Expected ${String(actual)} > ${expected}`);
    },
    toBeLessThan(expected: number): void {
      assert.ok(typeof actual === 'number' && actual < expected, `Expected ${String(actual)} < ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number): void {
      assert.ok(
        typeof actual === 'number' && actual >= expected,
        `Expected ${String(actual)} >= ${expected}`
      );
    },
    toBeLessThanOrEqual(expected: number): void {
      assert.ok(
        typeof actual === 'number' && actual <= expected,
        `Expected ${String(actual)} <= ${expected}`
      );
    },
    toContain(item: unknown): void {
      if (typeof actual === 'string' && typeof item === 'string') {
        assert.ok(actual.includes(item), `Expected string "${actual}" to contain "${item}"`);
      } else if (Array.isArray(actual)) {
        assert.ok(actual.includes(item), `Expected array to contain ${String(item)}`);
      } else {
        assert.fail(`toContain unsupported on ${typeof actual}`);
      }
    },
    toHaveLength(length: number): void {
      assert.ok(
        Array.isArray(actual) || typeof actual === 'string',
        'Expected array or string for toHaveLength'
      );
      assert.strictEqual((actual as { length: number }).length, length);
    },
    toMatch(pattern: RegExp | string): void {
      assert.ok(typeof actual === 'string', 'Expected string for toMatch');
      if (typeof pattern === 'string') {
        assert.ok(actual.includes(pattern), `Expected "${actual}" to match "${pattern}"`);
      } else {
        assert.match(actual, pattern);
      }
    },
    toThrow(expectedMessageOrCode: string | RegExp): void {
      assert.ok(typeof actual === 'function', 'Expected function for toThrow');
      let threw = false;
      let caughtError: unknown = null;
      try {
        (actual as () => unknown)();
      } catch (err) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        assert.fail(`Expected function to throw matching ${String(expectedMessageOrCode)}, but it did not throw.`);
      }
      const errMessage =
        caughtError instanceof Error
          ? `${caughtError.message} ${(caughtError as { code?: string }).code ?? ''}`
          : String(caughtError);
      if (typeof expectedMessageOrCode === 'string') {
        assert.ok(
          errMessage.includes(expectedMessageOrCode),
          `Expected error "${errMessage}" to include "${expectedMessageOrCode}"`
        );
      } else {
        assert.match(errMessage, expectedMessageOrCode);
      }
    },
    not: {
      toBe(expected: T): void {
        assert.notStrictEqual(actual, expected);
      },
      toEqual(expected: unknown): void {
        assert.notDeepStrictEqual(actual, expected);
      },
      toContain(item: unknown): void {
        if (typeof actual === 'string' && typeof item === 'string') {
          assert.ok(!actual.includes(item));
        } else if (Array.isArray(actual)) {
          assert.ok(!actual.includes(item));
        }
      },
    },
  };
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based testing with fixed seed (20261105).
 */
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }
}

export interface Arbitrary<T> {
  generate(rng: DeterministicRng): T;
  map<U>(mapper: (val: T) => U): Arbitrary<U>;
}

function createArbitrary<T>(generator: (rng: DeterministicRng) => T): Arbitrary<T> {
  return {
    generate: generator,
    map<U>(mapper: (val: T) => U): Arbitrary<U> {
      return createArbitrary((rng) => mapper(generator(rng)));
    },
  };
}

export const fc = {
  integer(opts?: { min?: number; max?: number }): Arbitrary<number> {
    const min = opts?.min ?? -1000;
    const max = opts?.max ?? 1000;
    return createArbitrary((rng) => rng.nextInt(min, max));
  },
  boolean(): Arbitrary<boolean> {
    return createArbitrary((rng) => rng.nextFloat() >= 0.5);
  },
  constantFrom<T>(...values: readonly [T, ...T[]]): Arbitrary<T> {
    return createArbitrary((rng) => {
      const idx = rng.nextInt(0, values.length - 1);
      return values[idx] as T;
    });
  },
  array<T>(arb: Arbitrary<T>, opts?: { minLength?: number; maxLength?: number }): Arbitrary<T[]> {
    const minLength = opts?.minLength ?? 0;
    const maxLength = opts?.maxLength ?? 15;
    return createArbitrary((rng) => {
      const len = rng.nextInt(minLength, maxLength);
      const result: T[] = [];
      for (let i = 0; i < len; i++) {
        result.push(arb.generate(rng));
      }
      return result;
    });
  },
  record<T extends Record<string, unknown>>(schema: { [K in keyof T]: Arbitrary<T[K]> }): Arbitrary<T> {
    return createArbitrary((rng) => {
      const out: Record<string, unknown> = {};
      for (const [k, arb] of Object.entries(schema)) {
        out[k] = (arb as Arbitrary<unknown>).generate(rng);
      }
      return out as T;
    });
  },
  property<A>(arbA: Arbitrary<A>, predicate: (a: A) => void | boolean): { run(rng: DeterministicRng): void } {
    return {
      run(rng: DeterministicRng): void {
        const valA = arbA.generate(rng);
        const res = predicate(valA);
        if (res === false) {
          assert.fail(`Property failed for counterexample: ${JSON.stringify(valA)}`);
        }
      },
    };
  },
  assert(
    prop: { run(rng: DeterministicRng): void },
    params: { seed: number; numRuns?: number }
  ): void {
    const rng = new DeterministicRng(params.seed);
    const numRuns = params.numRuns ?? 100;
    for (let i = 0; i < numRuns; i++) {
      prop.run(rng);
    }
  },
};

export async function runRegisteredSuites(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  while (suites.length > 0) {
    const suite = suites.shift()!;
    for (const t of suite.tests) {
      try {
        await t.fn();
        passed++;
        console.log(`  ✓ ${suite.name} > ${t.name}`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${suite.name} > ${t.name}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return { passed, failed };
}
