import { encodeQr, qrToSvg } from '/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/src/domain/emergency/qr-encoder.ts';
import { writeFileSync } from 'node:fs';
const url='https://argos.example.com/e/'+'A'.repeat(43);
const q=encodeQr(url);
writeFileSync('/private/tmp/claude-501/sati/qr.svg',qrToSvg(q));
console.log(Buffer.byteLength(url));
