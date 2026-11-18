/**
 * T714 [REQ-PRM-002][SC-005-004][EDGE-005-03][D5-07] Parámetros de plataforma: catálogo en código y puerto con caché.
 *  - fila ausente, `0`, `-1`, `abc`, fuera de rango (51) y valor decimal => defecto del código (10) y aviso SIN el valor leído;
 *  - fila válida (12) => 12 sin aviso; límites 1 y 50 aceptados;
 *  - caché por instancia con TTL <= 60 s y reloj controlado: dentro de la ventana no consulta, al cumplirla relee;
 *  - un TTL mayor de 60 s se rechaza al construir (D5-07).
 * Sin base de datos: el repositorio es un doble en memoria; el reloj es controlado (INV-ARCH-001).
 */
import { describe, expect, it } from 'vitest';
import {
  ALBUM_MAX_PHOTOS_PER_PET_KEY,
  KNOWN_PARAMETER_KEYS,
  PARAMETER_CACHE_TTL_MS,
  PARAMETER_CATALOG,
  interpretParameter,
} from '../../src/domain/platform/platform-parameters.ts';
import { createCachedPlatformParameterPort } from '../../src/application/platform-parameters/cached-platform-parameter.ts';
import type { ClockPort } from '../../src/application/ports/clock.port.ts';
import type { ParameterWarning, PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';

class ControlledClock implements ClockPort {
  readonly timeZone = 'America/Bogota';
  private nowMs = Date.parse('2026-11-18T10:00:00.000Z');
  advance(ms: number): void {
    this.nowMs += ms;
  }
  todayIsoDate(): string {
    return new Date(this.nowMs).toISOString().slice(0, 10);
  }
  nowIsoTimestamp(): string {
    return new Date(this.nowMs).toISOString();
  }
}

class FakeRepository implements PlatformParameterRepositoryPort {
  reads = 0;
  constructor(public row: string | null) {}
  async findValue(): Promise<string | null> {
    this.reads += 1;
    return this.row;
  }
}

const harness = (row: string | null, ttlMs?: number) => {
  const clock = new ControlledClock();
  const repository = new FakeRepository(row);
  const warnings: ParameterWarning[] = [];
  const port = createCachedPlatformParameterPort({ repository, clock, warn: (w) => warnings.push(w), ...(ttlMs === undefined ? {} : { ttlMs }) });
  return { clock, repository, warnings, port };
};

describe('T714 catálogo en código (fuente única de tipo, defecto y rango; MIF-005-07)', () => {
  it('[REQ-PRM-002] el catálogo cerrado solo conoce album.max_photos_per_pet: entero, defecto 10, rango 1..50', () => {
    expect(KNOWN_PARAMETER_KEYS).toEqual(['album.max_photos_per_pet']);
    expect(ALBUM_MAX_PHOTOS_PER_PET_KEY).toBe('album.max_photos_per_pet');
    expect(PARAMETER_CATALOG[ALBUM_MAX_PHOTOS_PER_PET_KEY]).toEqual({ type: 'INTEGER', defaultValue: 10, min: 1, max: 50 });
    expect(PARAMETER_CACHE_TTL_MS).toBe(60_000);
  });

  it.each([
    ['10', 10, null],
    ['12', 12, null],
    ['1', 1, null],
    ['50', 50, null],
    [null, 10, 'ABSENT'],
    ['0', 10, 'OUT_OF_RANGE'],
    ['-1', 10, 'OUT_OF_RANGE'],
    ['51', 10, 'OUT_OF_RANGE'],
    ['abc', 10, 'UNREADABLE'],
    ['', 10, 'UNREADABLE'],
    ['12.5', 10, 'UNREADABLE'],
    [' 12', 10, 'UNREADABLE'],
    ['1e1', 10, 'UNREADABLE'],
  ])('[EDGE-005-03] interpretParameter(%j) => valor %i, aviso %j', (raw, value, warning) => {
    expect(interpretParameter(ALBUM_MAX_PHOTOS_PER_PET_KEY, raw)).toEqual({ value, warning });
  });
});

describe('T714 puerto PlatformParameterPort con caché por instancia (D5-07, PN-04)', () => {
  it('[SC-005-004] la fila 12 se lee como 12 sin aviso', async () => {
    const { port, warnings } = harness('12');
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
    expect(warnings).toEqual([]);
  });

  it.each([
    [null, 'ABSENT'],
    ['0', 'OUT_OF_RANGE'],
    ['-1', 'OUT_OF_RANGE'],
    ['abc', 'UNREADABLE'],
    ['51', 'OUT_OF_RANGE'],
  ])('[SC-005-004][EDGE-005-03] fila %j => 10 y un aviso %s que no contiene el valor leído', async (row, reason) => {
    const { port, warnings } = harness(row);
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(10);
    expect(warnings).toEqual([{ key: 'album.max_photos_per_pet', reason }]);
    expect(JSON.stringify(warnings)).not.toContain('abc');
  });

  it('[D5-07] dentro de la ventana no consulta la base; al cumplirse 60 s relee y ve el valor nuevo', async () => {
    const { port, repository, clock } = harness('12');
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
    repository.row = '20';
    clock.advance(59_999);
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
    expect(repository.reads).toBe(1);
    clock.advance(1);
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(20);
    expect(repository.reads).toBe(2);
  });

  it('[D5-07] el defecto por fila ausente también se cachea y el aviso se emite una vez por lectura de base, no por acierto de caché', async () => {
    const { port, repository, clock, warnings } = harness(null);
    await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY);
    await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY);
    expect([repository.reads, warnings.length]).toEqual([1, 1]);
    clock.advance(60_000);
    await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY);
    expect([repository.reads, warnings.length]).toEqual([2, 2]);
  });

  it('[D5-07] un TTL mayor de 60 s se rechaza al construir; 60 s y menos se aceptan', () => {
    const build = (ttlMs: number): string | null => {
      try {
        harness('10', ttlMs);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(build(60_001)).toBe('El TTL de la caché de parámetros debe ser un entero entre 1 y 60000 ms (D5-07)');
    expect(build(0)).toBe('El TTL de la caché de parámetros debe ser un entero entre 1 y 60000 ms (D5-07)');
    expect(build(60_000)).toBeNull();
    expect(build(1_000)).toBeNull();
  });

  it('[REQ-PRM-002] si el repositorio falla, el error se propaga y no se cachea', async () => {
    const clock = new ControlledClock();
    let fail = true;
    const repository: PlatformParameterRepositoryPort = {
      async findValue() {
        if (fail) throw new Error('db down');
        return '12';
      },
    };
    const port = createCachedPlatformParameterPort({ repository, clock, warn: () => undefined });
    await expect(port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).rejects.toThrow('db down');
    fail = false;
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
  });
});
