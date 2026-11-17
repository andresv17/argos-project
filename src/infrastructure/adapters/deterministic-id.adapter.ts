/**
 * IdGeneratorPort determinista para pruebas reproducibles.
 *
 * @implements INV-ARCH-002
 */

import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Devuelve primero los IDs de la secuencia dada y luego 99999999-9999-4999-8999-<contador hex>.
 * Todos son UUID v4 en minúsculas; una secuencia con un valor que no lo sea se rechaza en construcción.
 * @implements INV-ARCH-002
 */
export class DeterministicIdAdapter implements IdGeneratorPort {
  private readonly sequence: readonly string[];
  private cursor = 0;

  constructor(sequence: readonly string[] = []) {
    for (const id of sequence) {
      if (!UUID_V4.test(id)) throw new RangeError(`DeterministicIdAdapter: no es UUID v4: ${id}`);
    }
    this.sequence = [...sequence];
  }

  public nextId(): string {
    const id = this.sequence[this.cursor];
    this.cursor += 1;
    return id ?? `99999999-9999-4999-8999-${this.cursor.toString(16).padStart(12, '0')}`;
  }
}
