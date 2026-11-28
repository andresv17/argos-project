import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QR_MAX_BYTES, QR_SIZE, encodeQr, qrToSvg } from '../../../src/domain/emergency/qr-encoder.ts';
import { domainErrorOf } from './_support.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; verde con T1672; `/keymaker`): codificador QR propio y puro 6-M (`src/domain/emergency/qr-encoder.ts`, ADR-012-07, `D12-17 = B`) contra los vectores de
 * referencia `tests/fixtures/qr/qr-6m-reference.json`, generados UNA vez con dos herramientas externas independientes (`qrcodegen` de Nayuki y `python-qrcode`, coincidentes bit a bit; ver
 * `tests/fixtures/qr/generate-qr-fixtures.py`). Cada caso trae las 8 máscaras forzadas y la máscara que elige la penalización. Firma SUPUESTA y fijada por este archivo:
 * `encodeQr(data: string | Uint8Array, options?: { mask?: number }): { size: 41; mask: number; modules: boolean[][] }` (fila por fila; `true` = módulo oscuro) y `qrToSvg(qr): string`.
 * La verificación manual de escaneo físico de Neo es un criterio aparte (no automatizable aquí).
 *
 * @implements REQ-QR12-005, NFR-012-003
 * Cubre SC-012-049, SC-012-070.
 */
interface Reference {
  readonly tools: Record<string, string>;
  readonly cases: Record<string, { readonly bytesHex: string; readonly autoMask: number; readonly masks: Record<string, string[]> }>;
}
const reference: Reference = JSON.parse(readFileSync(new URL('../../fixtures/qr/qr-6m-reference.json', import.meta.url), 'utf8'));
const asRows = (modules: boolean[][]): string[] => modules.map((row) => row.map((m) => (m ? '1' : '0')).join(''));

describe('T1674/T1672 codificador QR 6-M contra fixtures externos', () => {
  it('[SC-012-049] los fixtures provienen de dos herramientas externas y cubren 7 cargas, 8 máscaras cada una (41x41)', () => {
    expect(Object.keys(reference.tools).sort()).toEqual(['qrcode', 'qrcodegen']);
    expect(Object.keys(reference.cases)).toHaveLength(7);
    for (const entry of Object.values(reference.cases)) {
      expect(Object.keys(entry.masks).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
      for (const rows of Object.values(entry.masks)) {
        expect(rows).toHaveLength(41);
        expect(rows.every((r) => r.length === 41)).toBe(true);
      }
    }
  });

  for (const [name, entry] of Object.entries(reference.cases)) {
    const bytes = Uint8Array.from(Buffer.from(entry.bytesHex, 'hex'));
    describe(`carga «${name}» (${bytes.length} bytes)`, () => {
      for (let mask = 0; mask < 8; mask += 1) {
        it(`[SC-012-049] máscara ${mask} forzada coincide bit a bit con la referencia`, () => {
          const qr = encodeQr(bytes, { mask });
          expect(qr.size).toBe(41);
          expect(qr.mask).toBe(mask);
          expect(asRows(qr.modules)).toEqual(entry.masks[String(mask)]);
        });
      }
      it('[SC-012-049] la selección automática elige la máscara de menor penalización de la referencia', () => {
        const qr = encodeQr(bytes);
        expect(qr.mask).toBe(entry.autoMask);
        expect(asRows(qr.modules)).toEqual(entry.masks[String(entry.autoMask)]);
      });
    });
  }
});

describe('T1674/T1672 contrato del codificador', () => {
  it('versión fija 6-M: 41x41 y capacidad de 106 bytes; 107 bytes falla cerrado con ERR-QR12-URL-TOO-LONG (sin truncar)', () => {
    expect(QR_SIZE).toBe(41);
    expect(QR_MAX_BYTES).toBe(106);
    expect(encodeQr('x'.repeat(106)).modules).toHaveLength(41);
    expect(domainErrorOf(() => encodeQr('x'.repeat(107))).code).toBe('ERR-QR12-URL-TOO-LONG');
    expect(domainErrorOf(() => encodeQr(new Uint8Array(107))).code).toBe('ERR-QR12-URL-TOO-LONG');
  });

  it('una cadena se codifica como UTF-8 (la capacidad cuenta bytes, no caracteres)', () => {
    const text = 'Peña ñandú — alergia';
    expect(asRows(encodeQr(text).modules)).toEqual(asRows(encodeQr(new TextEncoder().encode(text)).modules));
    expect(domainErrorOf(() => encodeQr('ñ'.repeat(54))).code).toBe('ERR-QR12-URL-TOO-LONG'); // 108 bytes
  });

  it('rechaza una máscara fuera de 0..7', () => {
    for (const mask of [-1, 8, 1.5, Number.NaN]) expect(() => encodeQr('A', { mask })).toThrow(RangeError);
  });

  it('es puro y determinista: misma entrada, misma matriz; no muta la entrada', () => {
    const input = Uint8Array.from(Buffer.from(reference.cases['url-token-base64url']!.bytesHex, 'hex'));
    const copy = Uint8Array.from(input);
    expect(asRows(encodeQr(input).modules)).toEqual(asRows(encodeQr(input).modules));
    expect(input).toEqual(copy);
  });

  it('estructura fija: tres buscadores, patrón de alineación en (34,34), temporización y módulo oscuro en (33,8)', () => {
    const { modules: m } = encodeQr('https://argos.example/e/x');
    const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    const at = (r0: number, c0: number): string[] => finder.map((_, i) => m[r0 + i]!.slice(c0, c0 + 7).map((v) => (v ? '1' : '0')).join(''));
    expect(at(0, 0)).toEqual(finder);
    expect(at(0, 34)).toEqual(finder);
    expect(at(34, 0)).toEqual(finder);
    const align = ['11111', '10001', '10101', '10001', '11111'];
    expect([32, 33, 34, 35, 36].map((r) => m[r]!.slice(32, 37).map((v) => (v ? '1' : '0')).join(''))).toEqual(align);
    for (let i = 8; i <= 32; i += 1) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[33]![8]).toBe(true);
  });

  it('[SC-012-070] cero dependencias: el módulo solo importa archivos relativos (sin node:, sin paquetes) y package.json no declara ningún paquete de QR', () => {
    const source = readFileSync(new URL('../../../src/domain/emergency/qr-encoder.ts', import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]/g), ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(specifiers.filter((s) => !s.startsWith('.'))).toEqual([]);
    expect(source).not.toMatch(/zlib|Date\.now|Math\.random|process\.env/);
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names.filter((n) => /qr|zint|barcode/i.test(n))).toEqual([]);
  });
});

describe('T1674/T1672 SVG en servidor (SVG_DELIVERY): solo svg, rect y path', () => {
  it('[SC-012-049] genera un SVG determinista sin texto, script, foreignObject, style, image, enlaces ni atributos on*', () => {
    const qr = encodeQr('https://argos.example/e/abc');
    const svg = qrToSvg(qr);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toBe(qrToSvg(qr));
    const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)].map((m) => m[1]!.toLowerCase());
    expect(new Set(tags).size).toBeGreaterThan(0);
    expect(tags.filter((t) => !['svg', 'rect', 'path'].includes(t))).toEqual([]);
    expect(svg).not.toMatch(/<script|<text|foreignObject|<style|<image|<a[\s>]|href|\son\w+\s*=|javascript:|<!\[CDATA|<!ENTITY/i);
    expect(svg).not.toContain('argos.example');
  });

  it('[SC-012-049] declara una viewBox cuadrada con zona de silencio de 4 módulos (49x49) y el fondo claro', () => {
    const svg = qrToSvg(encodeQr('A'));
    expect(svg).toMatch(/viewBox="0 0 49 49"/);
    expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });
});
