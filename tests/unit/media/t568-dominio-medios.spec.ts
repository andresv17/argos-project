import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  avatarObjectKey,
  canonicalExtension,
  canonicalMediaName,
  detectMediaType,
  isAllowedForKind,
  isAvatarMime,
  isMediaObjectKey,
  mediaObjectKey,
  neutralFilename,
  sanitizeName,
} from '../../../src/domain/media/index.ts';

/**
 * T568 (SC-ALM-003..007, SC-ALM-028; INV-ARC-001..003; REQ-ARC-004; NFR-ALM-004): dominio de medios.
 */
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'latin1'));
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(Buffer.concat(parts));
const pad = (n: number, fill = 0): Uint8Array => new Uint8Array(n).fill(fill);

const JPEG = concat(bytes(0xff, 0xd8, 0xff, 0xe0), pad(20));
const PNG = concat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), pad(20));
const WEBP = concat(ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WEBP'), ascii('VP8 '), pad(20));
const PDF = concat(ascii('%PDF-1.7\n'), pad(20));

const reason = (data: Uint8Array): string => {
  const r = detectMediaType(data);
  return r.ok ? r.mime : r.reason;
};

describe('detectMediaType: firmas (INV-ARC-001, SC-ALM-003)', () => {
  it('reconoce JPEG, PNG, WebP y PDF por su firma', () => {
    expect([JPEG, PNG, WEBP, PDF].map(reason)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  });

  it('JPEG exige FF D8 FF; con FF D8 y otro tercer byte no es JPEG', () => {
    expect([reason(bytes(0xff, 0xd8, 0xff)), reason(bytes(0xff, 0xd8, 0x00, 0xff)), reason(bytes(0xff, 0xd8))]).toEqual(['image/jpeg', 'UNKNOWN', 'UNKNOWN']);
  });

  it('PNG exige los 8 bytes de firma completos', () => {
    expect([reason(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), reason(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b)), reason(bytes(0x89, 0x50, 0x4e, 0x47))]).toEqual(['image/png', 'UNKNOWN', 'UNKNOWN']);
  });

  it('WebP exige RIFF en 0..3 y WEBP en 8..11 (RIFF+WAVE no lo es; el tamaño de 4..7 no se lee)', () => {
    const wave = concat(ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WAVE'), pad(8));
    const anySize = concat(ascii('RIFF'), bytes(0xff, 0xff, 0xff, 0xff), ascii('WEBP'));
    expect([reason(WEBP), reason(wave), reason(anySize), reason(ascii('RIFF'))]).toEqual(['image/webp', 'UNKNOWN', 'image/webp', 'UNKNOWN']);
  });

  it('PDF acepta %PDF- hasta el byte 1023 y no desde el 1024', () => {
    const at = (offset: number): Uint8Array => concat(pad(offset, 0x20 + 1), ascii('%PDF-1.4'), pad(10));
    expect([reason(at(0)), reason(at(1019)), reason(at(1020)), reason(at(1100))]).toEqual(['application/pdf', 'application/pdf', 'UNKNOWN', 'UNKNOWN']);
  });

  it('la extensión y el Content-Type declarados no participan: solo cuentan los bytes (SC-ALM-003)', () => {
    expect(reason(PNG)).toBe('image/png');
    expect(reason(PDF)).toBe('application/pdf');
  });

  it('0 bytes se rechaza como EMPTY', () => {
    expect(reason(new Uint8Array(0))).toBe('EMPTY');
  });

  it('DOCX, XLSX (ZIP "PK"), TXT, ejecutables (MZ, ELF) y GIF se rechazan como UNKNOWN (D-06 C, SC-ALM-004, SC-ALM-006)', () => {
    const cases = [concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii('[Content_Types].xml'), pad(10)), ascii('Hola, esto es texto plano.'), concat(ascii('MZ'), pad(30)), concat(bytes(0x7f), ascii('ELF'), pad(10)), ascii('GIF89a......')];
    expect(cases.map(reason)).toEqual(['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  });
});

describe('detectMediaType: SVG, HTML y políglotas (INV-ARC-002, SC-ALM-004, EDGE-004)', () => {
  const FORBIDDEN = ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<?xml version="1.0"?><svg/>', '<!DOCTYPE html><html></html>', '<html><body></body></html>', '<script>alert(1)</script>'];

  it.each(FORBIDDEN)('rechaza %s como FORBIDDEN_MARKUP', (text) => {
    expect(reason(ascii(text))).toBe('FORBIDDEN_MARKUP');
  });

  it('no distingue mayúsculas y salta BOM UTF-8 y espacios iniciales', () => {
    const cases = [ascii('<SVG/>'), ascii('<ScRiPt>'), ascii('   \r\n\t<html>'), concat(bytes(0xef, 0xbb, 0xbf), ascii('<svg/>')), concat(bytes(0xef, 0xbb, 0xbf), ascii('  \n<!doctype html>'))];
    expect(cases.map(reason)).toEqual(['FORBIDDEN_MARKUP', 'FORBIDDEN_MARKUP', 'FORBIDDEN_MARKUP', 'FORBIDDEN_MARKUP', 'FORBIDDEN_MARKUP']);
  });

  it('un PDF cuyo contenido es HTML o SVG se rechaza aunque lleve %PDF- más adelante (políglota)', () => {
    const cases = [concat(ascii('<html><body>'), ascii('%PDF-1.4'), pad(10)), concat(ascii('<svg>'), ascii(' %PDF-1.4'))];
    expect(cases.map(reason)).toEqual(['FORBIDDEN_MARKUP', 'FORBIDDEN_MARKUP']);
  });

  it('una firma válida delante de marcado no es marcado: un JPEG o PDF legítimo se acepta', () => {
    expect([reason(concat(JPEG, ascii('<svg>'))), reason(concat(PDF, ascii('<html>')))]).toEqual(['image/jpeg', 'application/pdf']);
  });

  it('el marcado solo se busca en los primeros 2048 bytes tras BOM y espacios', () => {
    const farMarkup = concat(pad(2100, 0x20), ascii('<svg/>'));
    expect(reason(concat(new Uint8Array(2048).fill(0x20), ascii('<svg/>')))).toBe('UNKNOWN');
    expect(reason(concat(pad(10, 0x20), ascii('<svg/>')))).toBe('FORBIDDEN_MARKUP');
    expect(reason(farMarkup)).toBe('UNKNOWN');
  });
});

describe('tipo permitido por kind y por avatar (INV-ARC-001)', () => {
  it('PHOTO acepta solo JPEG, PNG y WebP; FILE acepta además PDF (SC-ALM-006)', () => {
    const mimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
    expect(mimes.map((m) => isAllowedForKind(m, 'PHOTO'))).toEqual([true, true, true, false]);
    expect(mimes.map((m) => isAllowedForKind(m, 'FILE'))).toEqual([true, true, true, true]);
  });

  it('el avatar acepta solo JPEG, PNG y WebP', () => {
    expect((['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const).map(isAvatarMime)).toEqual([true, true, true, false]);
  });

  it('extensión canónica por tipo', () => {
    expect((['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const).map(canonicalExtension)).toEqual(['jpg', 'png', 'webp', 'pdf']);
  });
});

describe('sanitizeName (REQ-ARC-004, SC-ALM-007, SC-ALM-028)', () => {
  it('normaliza a NFC', () => {
    expect(sanitizeName('Café.pdf')).toBe('Café.pdf');
  });

  it('elimina separadores de ruta y controles C0, DEL y C1: ../../etc/passwd\\u0000.pdf', () => {
    expect(sanitizeName('../../etc/passwd\u0000.pdf')).toBe('....etcpasswd.pdf');
    expect(sanitizeName('a\\b/c\u007fd\u0085e\u009ff\tg\nh')).toBe('abcdefgh');
  });

  it('elimina controles bidi U+202A-U+202E y U+2066-U+2069 y U+FEFF (SC-ALM-028)', () => {
    const bidi = ['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩', '﻿'];
    expect(sanitizeName(`recibo‮fdp.exe`)).toBe('recibofdp.exe');
    expect(bidi.map((c) => sanitizeName(`a${c}b`))).toEqual(bidi.map(() => 'ab'));
  });

  it('un nombre vacío o que queda vacío, solo de puntos o de espacios vale "archivo"', () => {
    expect(['', '\u0000\u0001', '../', '/', '   ', '...', ' . '].map(sanitizeName)).toEqual(['archivo', 'archivo', 'archivo', 'archivo', 'archivo', 'archivo', 'archivo']);
  });

  it('limita a 120 puntos de código sin partir pares sustitutos (120 emojis se conservan enteros)', () => {
    const emojis = '😀'.repeat(120);
    expect(Array.from(sanitizeName(emojis)).length).toBe(120);
    expect(sanitizeName(emojis)).toBe(emojis);
    const long = sanitizeName('😀'.repeat(150));
    expect([Array.from(long).length, long]).toEqual([120, '😀'.repeat(120)]);
    expect(sanitizeName('a'.repeat(121))).toBe('a'.repeat(120));
    expect(sanitizeName('a'.repeat(120))).toBe('a'.repeat(120));
  });

  it('propiedad: sin controles, sin bidi, <= 120 puntos de código y nunca vacío', () => {
    const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿/\\]/u;
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 400 }), (raw) => {
        const out = sanitizeName(raw);
        expect(FORBIDDEN.test(out)).toBe(false);
        expect(Array.from(out).length).toBeLessThanOrEqual(120);
        expect(out.length).toBeGreaterThan(0);
        expect(out).toBe(out.normalize('NFC'));
        expect(sanitizeName(out)).toBe(out);
      }),
      { numRuns: 300 },
    );
  });

  it('propiedad con alfabeto hostil: nada prohibido sobrevive', () => {
    const hostile = fc.array(fc.constantFrom('a', 'ñ', '.', '/', '\\', '\u0000', '‮', '⁦', '﻿', '\u0085', '😀', ' ', 'é'), { maxLength: 200 }).map((a) => a.join(''));
    fc.assert(
      fc.property(hostile, (raw) => {
        const out = sanitizeName(raw);
        expect(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿/\\]/u.test(out)).toBe(false);
        expect(out.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });
});

describe('canonicalMediaName: nombre de lista con la extensión canónica del tipo detectado (REQ-ARC-004, SC-ALM-028)', () => {
  it('a.exe con contenido PDF se lista como a.pdf; la extensión del cliente no se conserva', () => {
    expect(canonicalMediaName('a.exe', 'application/pdf')).toBe('a.pdf');
    expect(canonicalMediaName('consulta.pdf', 'application/pdf')).toBe('consulta.pdf');
    expect(canonicalMediaName('foto.pdf', 'image/png')).toBe('foto.png');
    expect(canonicalMediaName('Análisis Luna.PDF', 'application/pdf')).toBe('Análisis Luna.pdf');
  });

  it('sin extensión se añade; solo se quita la última extensión de 1 a 8 caracteres alfanuméricos', () => {
    expect([canonicalMediaName('foto', 'image/jpeg'), canonicalMediaName('a.tar.gz', 'application/pdf'), canonicalMediaName('a.abcdefghi', 'image/png'), canonicalMediaName('a. b', 'image/png')]).toEqual(['foto.jpg', 'a.tar.pdf', 'a.abcdefghi.png', 'a. b.png']);
  });

  it('nombres vacíos, ../ y controles quedan como archivo.<ext canónica>', () => {
    expect([canonicalMediaName('../', 'application/pdf'), canonicalMediaName('\u0000\u0001', 'image/webp'), canonicalMediaName('', 'image/jpeg'), canonicalMediaName('.pdf', 'application/pdf')]).toEqual(['archivo.pdf', 'archivo.webp', 'archivo.jpg', 'archivo.pdf']);
  });

  it('el nombre del cuarto caso no conserva U+202E', () => {
    expect(canonicalMediaName('recibo‮fdp.exe', 'application/pdf')).toBe('recibofdp.pdf');
  });

  it('120 emojis: no se rechaza ni se parte; el total con la extensión no pasa de 120 puntos de código', () => {
    const name = canonicalMediaName('😀'.repeat(120), 'image/jpeg');
    expect(name.endsWith('.jpg')).toBe(true);
    expect(Array.from(name).length).toBe(120);
    expect(Array.from(name.slice(0, -4)).every((c) => c === '😀')).toBe(true);
  });

  it('propiedad: termina en la extensión canónica, <= 120 puntos de código y sin caracteres prohibidos', () => {
    const mimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 300 }), fc.constantFrom(...mimes), (raw, mime) => {
        const out = canonicalMediaName(raw, mime);
        expect(out.endsWith(`.${canonicalExtension(mime)}`)).toBe(true);
        expect(Array.from(out).length).toBeLessThanOrEqual(120);
        expect(Array.from(out).length).toBeGreaterThan(canonicalExtension(mime).length + 1);
        expect(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿/\\]/u.test(out)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});

describe('neutralFilename: nombre de la URL firmada (REQ-ARC-003, D-14 A, INV-ARC-004)', () => {
  it('PHOTO: foto.jpg, foto.png, foto.webp', () => {
    expect((['image/jpeg', 'image/png', 'image/webp'] as const).map((m) => neutralFilename('PHOTO', m))).toEqual(['foto.jpg', 'foto.png', 'foto.webp']);
  });

  it('FILE: archivo.pdf y archivo.<ext> para imágenes', () => {
    expect((['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const).map((m) => neutralFilename('FILE', m))).toEqual(['archivo.pdf', 'archivo.jpg', 'archivo.png', 'archivo.webp']);
  });

  it('una PHOTO que fuera PDF no existe: lanza', () => {
    expect(() => neutralFilename('PHOTO', 'application/pdf')).toThrow(RangeError);
  });
});

describe('claves de objeto: solo UUID (INV-ARC-003, SC-ALM-007)', () => {
  const PET = '3f1c0a52-7d3e-4b8a-9a61-0c2f4d5e6a71';
  const ID = '8b2d9c10-5e47-4f3a-a1b6-7c9d0e1f2a34';

  it('FILE y PHOTO: pets/{petId}/files|photos/{mediaId}, sin extensión; el avatar usa avatar/', () => {
    expect([mediaObjectKey(PET, 'FILE', ID), mediaObjectKey(PET, 'PHOTO', ID), avatarObjectKey(PET, ID)]).toEqual([`pets/${PET}/files/${ID}`, `pets/${PET}/photos/${ID}`, `pets/${PET}/avatar/${ID}`]);
  });

  it('rechaza un petId o mediaId que no sea UUID v4 en minúsculas (../, nombres, mayúsculas, con espacio)', () => {
    for (const bad of ['../x', 'Análisis Luna.pdf', PET.toUpperCase(), `${PET} `, `${PET}/..`, '', 'x']) {
      expect(() => mediaObjectKey(bad, 'FILE', ID), bad).toThrow(RangeError);
      expect(() => mediaObjectKey(PET, 'FILE', bad), bad).toThrow(RangeError);
      expect(() => avatarObjectKey(PET, bad), bad).toThrow(RangeError);
    }
  });

  it('isMediaObjectKey acepta solo pets/<uuid>/(files|photos|avatar)/<uuid>', () => {
    const valid = [`pets/${PET}/files/${ID}`, `pets/${PET}/photos/${ID}`, `pets/${PET}/avatar/${ID}`];
    const invalid = [`pets/${PET}/files/${ID}.pdf`, `pets/${PET}/docs/${ID}`, `pets/${PET}/files/${ID}/x`, `/pets/${PET}/files/${ID}`, `pets/${PET}/files/${ID}\n`, 'pets/../x', `other/${PET}/files/${ID}`, `pets/${PET}/files/Análisis Luna.pdf`, '', `pets/${PET}/files/`];
    expect([valid.map(isMediaObjectKey), invalid.map(isMediaObjectKey)]).toEqual([[true, true, true], invalid.map(() => false)]);
  });

  it('propiedad: toda clave generada pasa isMediaObjectKey y no contiene texto de usuario', () => {
    fc.assert(
      fc.property(fc.uuidV(4), fc.uuidV(4), fc.constantFrom('FILE' as const, 'PHOTO' as const), (petId, id, kind) => {
        const key = mediaObjectKey(petId, kind, id);
        expect(isMediaObjectKey(key)).toBe(true);
        expect(key).toMatch(/^pets\/[0-9a-f-]{36}\/(files|photos)\/[0-9a-f-]{36}$/);
      }),
      { numRuns: 100 },
    );
  });
});

describe('pureza de src/domain/media/ (NFR-ALM-004, SC-ALM-024)', () => {
  const DIR = join(process.cwd(), 'src', 'domain', 'media');
  const sources = (): string[] =>
    readdirSync(DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(DIR, f), 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));

  it('no importa node:fs, fetch, @google-cloud ni ningún paquete; solo ./ y ../../generated', () => {
    const all = sources().join('\n');
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toMatch(/node:fs|from\s+['"]fs['"]|\bfetch\s*\(|@google-cloud|node:|require\(/);
    const imports = [...all.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    for (const spec of imports) expect(spec.startsWith('./') || spec.startsWith('../')).toBe(true);
  });

  it('no lee reloj, aleatoriedad ni entorno', () => {
    expect(sources().join('\n')).not.toMatch(/Date\.now|new Date\(|Math\.random|process\.env|crypto\./);
  });

  it('no inspecciona ZIP ni cabeceras WebP más allá de RIFF/WEBP (D-06 C, K-09)', () => {
    expect(sources().join('\n')).not.toMatch(/\bzip\b|central directory|VP8X|VP8L|\bEOCD\b/i);
  });
});
