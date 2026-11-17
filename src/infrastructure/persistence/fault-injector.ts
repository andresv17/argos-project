/**
 * Inyector de fallos determinista del criterio de SC-004 (STATE-BACKUP-001, `injectedFailureCriterion`): hace fallar la
 * escritura número N de una transacción, para recorrer una a una todas las escrituras del reemplazo atómico en los
 * repositorios de memoria y de SQLite. Sin azar, sin reloj y sin entorno: el N lo fija quien construye el inyector
 * (INV-ARCH-001, INV-ARCH-002). Una lectura (`find*`, `list*`, `count*`) nunca cuenta ni falla; cualquier otra operación
 * de un repositorio es una escritura. El error inyectado es un Error corriente (no un DomainError): la capa de
 * aplicación lo trata como STORAGE_ERROR y lo traduce a ERR-BACKUP-ATOMIC-ROLLBACK sin filtrar su mensaje.
 *
 * @implements STATE-BACKUP-001, SC-004, ERR-BACKUP-ATOMIC-ROLLBACK, ERR-INTERNAL-UNEXPECTED, INV-ARCH-001, INV-ARCH-005
 */

import type { RepositorySet } from '../../application/ports/repositories.port.ts';

const READ_METHOD = /^(find|list|count)/;

/** Fallo inyectado: identifica qué escritura falló, solo para las pruebas. */
export class InjectedWriteFailure extends Error {
  constructor(readonly writeNumber: number, readonly operation: string) {
    super(`fallo inyectado en la escritura ${writeNumber} (${operation})`);
    this.name = 'InjectedWriteFailure';
  }
}

export class DeterministicFaultInjector {
  private writes = 0;
  private readonly seen: string[] = [];

  /** @param failAtWrite número de escritura (1 = la primera) que falla; null = nunca falla, solo cuenta. */
  constructor(private readonly failAtWrite: number | null) {}

  /** Escrituras observadas desde la última transacción, en orden (`repositorio.operación`). */
  get operations(): readonly string[] {
    return this.seen;
  }

  /** Reinicia el contador al empezar cada transacción: el N es siempre relativo a la transacción en curso. */
  beginTransaction(): void {
    this.writes = 0;
    this.seen.length = 0;
  }

  /** Cuenta la escritura y lanza si es la elegida. */
  beforeWrite(operation: string): void {
    this.writes += 1;
    this.seen.push(operation);
    if (this.failAtWrite === this.writes) throw new InjectedWriteFailure(this.writes, operation);
  }

  /** Envuelve cada repositorio para que sus escrituras pasen por `beforeWrite`. */
  wrap(repositories: RepositorySet): RepositorySet {
    const wrapped = Object.fromEntries(
      Object.entries(repositories).map(([name, repository]) => [
        name,
        new Proxy(repository as object, {
          get: (target, property, receiver) => {
            const value = Reflect.get(target, property, receiver) as unknown;
            if (typeof property !== 'string' || typeof value !== 'function' || READ_METHOD.test(property)) return value;
            return (...args: unknown[]) => {
              this.beforeWrite(`${name}.${property}`);
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        }),
      ]),
    );
    return wrapped as unknown as RepositorySet;
  }
}
