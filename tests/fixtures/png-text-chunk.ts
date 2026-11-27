/**
 * Inserta un trozo `tEXt` justo tras IHDR en un PNG válido. Sustituye al modo `echo` del `FakeSceneImageGenerator` (011, T1521, MIF-011-04), que ya no incrusta el
 * prompt: las pruebas del filtro de salida (`validateOutput`, REQ-ESC6-035) construyen su propio PNG hostil con este auxiliar.
 */
const TABLE = Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export function withTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const data = new TextEncoder().encode(`${keyword}\0${text}`);
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode('tEXt'), 0);
  body.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  const afterIhdr = 8 + 12 + 13; // firma + IHDR (longitud, tipo, 13 de datos, CRC)
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, afterIhdr), 0);
  out.set(chunk, afterIhdr);
  out.set(png.subarray(afterIhdr), afterIhdr + chunk.length);
  return out;
}
