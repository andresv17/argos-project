#!/usr/bin/env python3
"""
Genera UNA VEZ los vectores de referencia del codificador QR 6-M (T1672, ADR-012-07, D12-17 = B) con DOS herramientas externas
independientes (qrcodegen de Nayuki y python-qrcode) y exige que coincidan bit a bit antes de escribir el fixture.
NO se ejecuta en CI ni forma parte de la compilacion: es solo la procedencia del JSON versionado.
Hallazgo: segno 1.6.6 NO se usa como referencia (inserta un byte 0x00 tras el terminador y desplaza los codewords de relleno respecto a ISO/IEC 18004 7.4.10).
Uso (entorno aislado):  python3 -m venv v && v/bin/pip install qrcodegen qrcode && v/bin/python generate-qr-fixtures.py > qr-6m-reference.json
"""
import json
import sys
from qrcodegen import QrCode, QrSegment
import qrcode
from importlib.metadata import version

URL = b"https://argos.example/e/"
CASES = {
    "un-byte": b"A",
    "ascii-corto": b"ARGOS",
    "url-67-bytes": URL + b"0123456789abcdefghijklmnopqrstuvwxyzABCDEFG-_hijklm"[:43],
    "url-token-base64url": URL + b"Zm9vYmFyYmF6cXV4MDEyMzQ1Njc4OWFiY2RlZmdoaWo",
    "utf8-multibyte": "Ficha: Peña ñandú — alergia".encode("utf-8"),
    "limite-106-bytes": (b"https://argos.example/e/" + b"x" * 82),
    "binario-106-bytes": bytes(range(1, 107)),
}
assert len(CASES["limite-106-bytes"]) == 106

def seg(data, mask):
    q = QrCode.encode_segments([QrSegment.make_bytes(data)], QrCode.Ecc.MEDIUM, 6, 6, mask, False)
    n = q.get_size()
    return ["".join("1" if q.get_module(x, y) else "0" for x in range(n)) for y in range(n)], q.get_mask()

def qrc(data, mask):
    q = qrcode.QRCode(version=6, error_correction=qrcode.constants.ERROR_CORRECT_M, mask_pattern=mask, border=0)
    q.add_data(qrcode.util.QRData(data, mode=qrcode.util.MODE_8BIT_BYTE, check_data=False))
    q.make(fit=False)
    return ["".join("1" if c else "0" for c in row) for row in q.get_matrix()]

out = {
    "description": "Vectores de referencia QR version 6, nivel M, modo byte (41x41), generados con herramientas externas; filas de '0'/'1' (1 = modulo oscuro), sin zona de silencio.",
    "tools": {"qrcodegen": version("qrcodegen"), "qrcode": version("qrcode")},
    "cases": {},
}
for name, data in CASES.items():
    entry = {"bytesHex": data.hex(), "masks": {}}
    for mask in range(8):
        a, _ = seg(data, mask)
        b = qrc(data, mask)
        if a != b:
            sys.exit(f"DISCREPANCIA entre qrcodegen y qrcode en {name} mascara {mask}")
        assert len(a) == 41 and all(len(r) == 41 for r in a)
        entry["masks"][str(mask)] = a
    # `autoMask` (BAJA-2, oráculo T1672): es la máscara que elige la penalización N1..N4 de qrcodegen con mask = -1 (selección automática) y es la expectativa de
    # `encodeQr` sin `options.mask`. La selección automática SOLO la fija qrcodegen; las ocho máscaras forzadas sí se cotejan bit a bit con python-qrcode (el `sys.exit`
    # de arriba). Se exige además que la matriz automática sea idéntica a la de esa máscara forzada.
    auto_rows, auto_mask = seg(data, -1)
    entry["autoMask"] = auto_mask
    assert auto_rows == entry["masks"][str(auto_mask)]
    out["cases"][name] = entry
json.dump(out, sys.stdout, separators=(",", ":"))
