/**
 * Doble del cliente de PostgreSQL para las pruebas de repositorios (T423, T424): registra (sentencia normalizada, valores)
 * y responde con la siguiente respuesta configurada (o vacía). Sin base de datos real.
 */
import { expect } from 'vitest';

export type Row = Record<string, unknown>;
export interface Reply {
  readonly rows?: Row[];
  readonly rowCount?: number | null;
  /** Si se indica, la consulta rechaza con este error (p. ej. violación de unicidad 23505). */
  readonly error?: Error;
}
export interface Call {
  readonly sql: string;
  readonly values: unknown[];
}

export const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

export function fakeClient(...replies: Reply[]) {
  const calls: Call[] = [];
  let next = 0;
  return {
    calls,
    release: () => undefined,
    async query(text: string, values: unknown[] = []) {
      calls.push({ sql: norm(text), values });
      const reply = replies[next++] ?? {};
      if (reply.error) throw reply.error;
      return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? (reply.rows ?? []).length };
    },
  };
}

/** Toda sentencia usa solo `$1..$n` consecutivos y ningún valor textual aparece dentro del texto SQL. */
export function expectParametrized(calls: readonly Call[]) {
  for (const { sql, values } of calls) {
    const used = [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    expect(used).toEqual(values.map((_, i) => i + 1));
    for (const value of values.flat()) if (typeof value === 'string' && value.length > 3) expect(sql).not.toContain(value);
  }
}
