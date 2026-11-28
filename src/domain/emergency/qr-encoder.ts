/**
 * Codificador QR propio y puro (Feature 012, Bloque D, #32; T1672; ADR-012-07, `D12-17 = B`, REQ-QR12-005, NFR-012-003): versión FIJA 6, nivel de corrección M, modo byte (ISO/IEC 18004).
 * 41x41 módulos, 108 palabras de datos (4 bloques de 27) y 16 de corrección por bloque (172 en total), 7 bits de resto; capacidad de 106 bytes. Sin selección de versión, sin tablas de otras
 * versiones, sin dependencias (ni `node:*` ni paquetes), sin reloj, azar ni entorno: solo GF(256) (polinomio 0x11D), Reed-Solomon, las 8 máscaras y su penalización (N1..N4).
 * La salida es la matriz y un SVG con solo `<svg>`, `<rect>` y `<path>` (sin texto de usuario, `SVG_DELIVERY`). Verificado contra vectores de dos herramientas externas independientes
 * (`tests/fixtures/qr/`, T1672); la verificación manual de escaneo físico corresponde a Neo.
 *
 * @implements REQ-QR12-005, NFR-012-003, SC-012-049, SC-012-070
 */
import { DomainError } from '../../generated/v38/index.ts';

export const QR_VERSION = 6;
export const QR_SIZE = 41;
/** Capacidad en modo byte de 6-M: (108 * 8 - 4 de modo - 8 de longitud) / 8 = 106 bytes. */
export const QR_MAX_BYTES = 106;
export const QR_MASK_COUNT = 8;
/** Zona de silencio del SVG, en módulos (ISO/IEC 18004: 4). */
export const QR_QUIET_ZONE = 4;

const DATA_CODEWORDS = 108;
const BLOCKS = 4;
const DATA_PER_BLOCK = DATA_CODEWORDS / BLOCKS;
const ECC_PER_BLOCK = 16;
/** Posición del único patrón de alineación que no se solapa con un buscador: (34, 34). */
const ALIGNMENT_CENTER = 34;
/** Indicador de nivel M en la información de formato (L = 1, M = 0, Q = 3, H = 2). */
const ECC_FORMAT_BITS_M = 0;

export interface QrMatrix {
  readonly size: number;
  /** Máscara aplicada (0..7). */
  readonly mask: number;
  /** Fila por fila; `true` = módulo oscuro. */
  readonly modules: boolean[][];
}

/** Multiplicación en GF(256) con el polinomio reductor 0x11D (campo de Reed-Solomon de los QR). */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Divisor de Reed-Solomon de grado `degree`: producto de (x - a^i), con los coeficientes sin el término líder. */
function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Resto de dividir `data` por `divisor`: las palabras de corrección. */
function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = result[i]! ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

/** Flujo de bits de datos 6-M en modo byte: modo, longitud, bytes, terminador y relleno 0xEC/0x11 hasta 108 palabras. */
function dataCodewords(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capacityBits = DATA_CODEWORDS * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; words.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Palabras finales: datos de los 4 bloques entrelazados, luego sus palabras de corrección entrelazadas. */
function interleavedCodewords(data: readonly number[]): number[] {
  const divisor = reedSolomonDivisor(ECC_PER_BLOCK);
  const blocks = Array.from({ length: BLOCKS }, (_, i) => data.slice(i * DATA_PER_BLOCK, (i + 1) * DATA_PER_BLOCK));
  const ecc = blocks.map((block) => reedSolomonRemainder(block, divisor));
  const result: number[] = [];
  for (let i = 0; i < DATA_PER_BLOCK; i += 1) for (const block of blocks) result.push(block[i]!);
  for (let i = 0; i < ECC_PER_BLOCK; i += 1) for (const block of ecc) result.push(block[i]!);
  return result;
}

const bit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

/** Cuadrícula con los módulos y la marca de «módulo de función» (no se enmascara ni recibe datos). */
class Grid {
  readonly modules: boolean[][] = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  readonly isFunction: boolean[][] = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < QR_SIZE; i += 1) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [QR_SIZE - 4, 3], [3, QR_SIZE - 4]] as const) this.drawFinder(cx, cy);
    this.drawAlignment(ALIGNMENT_CENTER, ALIGNMENT_CENTER);
    this.drawFormatBits(0); // reserva el área; se redibuja con la máscara elegida
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < QR_SIZE && y >= 0 && y < QR_SIZE) this.setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  /** Información de formato (nivel M + máscara, BCH(15,5), XOR 0x5412) en sus dos copias y el módulo oscuro fijo. */
  drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) this.setFunction(8, i, bit(bits, i));
    this.setFunction(8, 7, bit(bits, 6));
    this.setFunction(8, 8, bit(bits, 7));
    this.setFunction(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i += 1) this.setFunction(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i += 1) this.setFunction(QR_SIZE - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i += 1) this.setFunction(8, QR_SIZE - 15 + i, bit(bits, i));
    this.setFunction(8, QR_SIZE - 8, true);
  }

  /** Coloca los bits en zigzag de dos columnas desde la esquina inferior derecha, saltando la columna de temporización. */
  drawCodewords(codewords: readonly number[]): void {
    let i = 0;
    for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < QR_SIZE; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? QR_SIZE - 1 - vert : vert;
          if (!this.isFunction[y]![x]! && i < codewords.length * 8) {
            this.modules[y]![x] = bit(codewords[i >>> 3]!, 7 - (i & 7));
            i += 1;
          }
        }
      }
    }
  }

  clone(): Grid {
    const copy = new Grid();
    for (let y = 0; y < QR_SIZE; y += 1) {
      copy.modules[y] = [...this.modules[y]!];
      copy.isFunction[y] = [...this.isFunction[y]!];
    }
    return copy;
  }

  /** Invierte (XOR) los módulos de datos donde la máscara vale 1; aplicarla dos veces la deshace. */
  applyMask(mask: number): void {
    for (let y = 0; y < QR_SIZE; y += 1) {
      for (let x = 0; x < QR_SIZE; x += 1) {
        if (!this.isFunction[y]![x]! && maskBit(mask, x, y)) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
    default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** Historial de las últimas 7 corridas de una línea (con una corrida blanca virtual de borde) para detectar 1:1:3:1:1 con 4 claros. */
function addRunHistory(history: number[], length: number): void {
  const run = history[0] === 0 ? length + QR_SIZE : length;
  history.pop();
  history.unshift(run);
}

function countFinderLike(history: readonly number[]): number {
  const n = history[1]!;
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) + (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0);
}

function terminateAndCount(runColor: boolean, runLength: number, history: number[]): number {
  let length = runLength;
  if (runColor) {
    addRunHistory(history, length);
    length = 0;
  }
  length += QR_SIZE;
  addRunHistory(history, length);
  return countFinderLike(history);
}

/** Penalización total N1 (corridas), N2 (bloques 2x2), N3 (patrones tipo buscador) y N4 (equilibrio de oscuros) de ISO/IEC 18004 §7.8.3. */
function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  let result = 0;
  const line = (at: (i: number) => boolean): void => {
    let runColor = false;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < QR_SIZE; i += 1) {
      if (at(i) === runColor) {
        runLength += 1;
        if (runLength === 5) result += PENALTY_N1;
        else if (runLength > 5) result += 1;
      } else {
        addRunHistory(history, runLength);
        if (!runColor) result += countFinderLike(history) * PENALTY_N3;
        runColor = at(i);
        runLength = 1;
      }
    }
    result += terminateAndCount(runColor, runLength, history) * PENALTY_N3;
  };
  for (let y = 0; y < QR_SIZE; y += 1) line((x) => modules[y]![x]!);
  for (let x = 0; x < QR_SIZE; x += 1) line((y) => modules[y]![x]!);
  for (let y = 0; y < QR_SIZE - 1; y += 1) {
    for (let x = 0; x < QR_SIZE - 1; x += 1) {
      const color = modules[y]![x]!;
      if (color === modules[y]![x + 1] && color === modules[y + 1]![x] && color === modules[y + 1]![x + 1]) result += PENALTY_N2;
    }
  }
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark += 1;
  const total = QR_SIZE * QR_SIZE;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_N4;
  return result;
}

/**
 * Codifica `data` (una cadena se toma como UTF-8) en un QR 6-M. Sin `options.mask` elige la máscara de menor penalización (empate: la de menor índice).
 * Más de 106 bytes: `ERR-QR12-URL-TOO-LONG` (falla cerrada, sin truncar). Una máscara fuera de 0..7 es un error de programación (`RangeError`).
 */
export function encodeQr(data: string | Uint8Array, options: { readonly mask?: number } = {}): QrMatrix {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (bytes.length > QR_MAX_BYTES) throw new DomainError('ERR-QR12-URL-TOO-LONG');
  const forced = options.mask;
  if (forced !== undefined && !(Number.isInteger(forced) && forced >= 0 && forced < QR_MASK_COUNT)) throw new RangeError('La máscara QR debe ser un entero de 0 a 7');
  const base = new Grid();
  base.drawFunctionPatterns();
  base.drawCodewords(interleavedCodewords(dataCodewords(bytes)));
  const build = (mask: number): Grid => {
    const grid = base.clone();
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    return grid;
  };
  let mask = forced ?? 0;
  if (forced === undefined) {
    let best = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < QR_MASK_COUNT; candidate += 1) {
      const penalty = penaltyScore(build(candidate).modules);
      if (penalty < best) {
        best = penalty;
        mask = candidate;
      }
    }
  }
  return { size: QR_SIZE, mask, modules: build(mask).modules };
}

/**
 * SVG de la matriz con zona de silencio de 4 módulos: un `<rect>` de fondo claro y un único `<path>` oscuro (`M x y h1 v1 h-1 z` por módulo). Solo `svg`, `rect` y `path`; sin texto,
 * scripts, estilos ni enlaces (`SVG_DELIVERY`). Determinista: misma matriz, mismo texto.
 */
export function qrToSvg(qr: QrMatrix): string {
  // BAJA-1 (oráculo T1672): una matriz que no sea la 41x41 de la versión 6 no es un QR de ARGOS; falla cerrada en lugar de emitir un SVG que no escanea.
  if (qr.size !== QR_SIZE || qr.modules.length !== QR_SIZE || qr.modules.some((row) => row.length !== QR_SIZE)) {
    throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'La matriz del QR no tiene el tamaño de la versión 6.');
  }
  const dimension = qr.size + QR_QUIET_ZONE * 2;
  const cells: string[] = [];
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y]![x]!) cells.push(`M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="#ffffff"/><path d="${cells.join('')}" fill="#000000"/></svg>`;
}
