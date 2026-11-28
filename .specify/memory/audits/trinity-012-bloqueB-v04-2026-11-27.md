# Acta /trinity — Re-auditoría AppSec, Bloque B DRAFT 0.4 (#23, T1630..T1632) — 2026-11-27

Solo lectura. Abreviaturas: OA = `contracts/openapi/chip-claim.openapi.yaml`, SCH = `contracts/schemas/chip-claim.schema.json`, CAT = `contracts/errors/error-catalog.json`, SPL = `contracts/microchip-error-split-annex.md`, ADM = `contracts/admin-disputes-annex.md`, DM = `data-model.md`. Entradas: acta previa `trinity-012-bloqueB-v03-2026-11-27.md` y `architect-012-bloqueB-v04-2026-11-27.md`.

**VEREDICTO: APTO CON RESERVAS.** 0 CRITICO, 0 ALTO, 0 MEDIO nuevos. N-2, B-N1, B-N3, B-N4, B-N5 cerrados; N-1 y N-3 siguen abiertos por diseño (PENDIENTE NEO / dependencia T1648); B-N2 parcial. H-A2 y N-1 siguen PENDIENTE NEO.

## Tabla de cierre

| Hallazgo | Estado | Evidencia (archivo:línea) | Matiz |
| --- | --- | --- | --- |
| N-1 canal de tiempo del 202 | **ABIERTO / PENDIENTE NEO** (reducido, no decidido por architect) | OA:127 (marcador), ADM:84 | El orden 0.4 quita la subida de bytes de la rama con fila (ambas ramas suben antes), pero aún difiere: toma del candado por mascota + inserción de fila y claves vs encolado de huérfanos tras liberar candados (OA:123-126). Diferencia de ms, no de segundos |
| N-2 subida bajo candado global | **CERRADO** (matiz B-N8) | OA:118-119 (saneo, antimalware y subida antes del paso 7), OA:119 «bajo los candados NO se escriben bytes», OA:124; ADM:37; SCH OpenChipDisputeForm | OA:124 admite «confirmar o MOVER desde el área de espera»: un mover en almacén de objetos es copia+borrado de bytes bajo candado global |
| N-3 step-up / persona distinta | **ABIERTO (dependencia T1648)** | ADM:63, ADM:82; DM:66 sigue FK `users(id)`; `T1648` no existe en `tasks.md` | Declarado honestamente como no implementable hasta T1648; no lo decide architect. Mantener T1636 bloqueada |
| B-N1 411 | **CERRADO** | OA:111, OA:156-160 | 411 antes de leer cuerpo y antes del contador; independiente del chip y de la sesión ya validada |
| B-N1 ámbito CHIP_MULTIPART | **CERRADO** (valor null en T1646) | DM:82, OA:112, SCH:76-80 | Ver B-N9 (413 por cabecera no cuenta, el texto dice que sí) |
| B-N2 PDF / antimalware | **PARCIAL** | OA:116-118, ADM:37, SCH:126 | PDF se rechaza, no se rasteriza (bien), pero el administrador abre un PDF no rasterizado en su lector; no se fija visor aislado. Antimalware sin producto: aceptable en DRAFT, ver abajo |
| B-N3 contador bloqueado | **CERRADO en texto; PENDIENTE NEO (criterio)** | OA:19, OA:27, OA:118; SPL:29; SCH:84; `spec.md:92` y `spec.md:315` (SC-012-100); errata E-B2 | Coherente en los seis sitios y con `co-ownership-support.ts` ~95; la confirmación sigue siendo de Neo |
| B-N4 nota RETRYABLE | **CERRADO** (visto bueno de Neo pendiente: bloque 0.1.0 aprobado) | CAT:184 | Incluye candado global, por `chip_hmac`, por mascota y antimalware/subida |
| B-N5 texto doble en notas | **CERRADO** | CAT:202, 220, 238 (notas con solo el criterio vigente); `[SUSTITUIDO]` solo aparece en la `change_note` histórica | — |
| Alineación contador bloqueado | **CERRADO** (ver B-N3) | idem | — |
| H-A2 listado | **PENDIENTE NEO** (sin cambio) | OA:186-189, ADM:83 | Confirmado |
| H-A1 / M-1 / M-4 / B-5 | siguen CERRADOS | OA:119-121, OA:126 | Sin regresión |

## Preguntas específicas

- **Orden de `openChipDispute` (contar intento, saneo/antimalware/subida a área de espera, candados, registrar claves y fila): no abre oráculo.** Todo lo que ocurre antes de los candados es independiente del chip (el chip solo entra como cadena validada por formato). El 409 (límites) se calcula solo sobre filas propias (OA:119-121) y el 202 sin fila no asocia archivos (OA:123). El área de espera usa clave no derivable y sin chip.
- **Ventana de DoS: no nueva sobre disponibilidad de terceros.** Desde 0.4 los candados se retienen solo para metadatos; un 503 de subida o antimalware no retiene ninguno. Queda amplificación acotada: cada intento que llega al paso 5 gasta CPU, antimalware y hasta 5 archivos en el área de espera aunque luego dé 409 de límite o 202 sin fila. Está acotado por el contador multipart y el de chip (10/usuario, 30/IP, 1000 global) pero `CHIP_MULTIPART_MAX_PER_USER_PER_DAY`, `CHIP_DISPUTE_BODY_MAX_BYTES` y `DISPUTE_EVIDENCE_MAX_PIXELS` siguen `null`: sin ellos el acotado no es verificable (B-N10).
- **503 de la subida idéntico para cualquier chip: sí.** Ocurre antes de resolver el chip, mismo código y mismo `Retry-After` constante que el de candados (OA:117-118, OA:173, CAT:184). Sutileza menor: el antimalware cae antes del contador de chip y la subida después, por lo que un 503 de subida consume intento; es uniforme y no revela existencia (B-N11, BAJO de usabilidad).
- **Antimalware sin producto en DRAFT: aceptable**, porque falla cerrada con el mismo 503 y no hay camino que guarde evidencia sin escanear. Condición: que la ausencia de producto sea bloqueante explícita para APPROVED y producción (hoy solo «por determinar en T1646», no figura en la lista de decisiones de Neo de la acta del architect).
- **411 y ámbito `CHIP_MULTIPART` no revelan existencia: sí.** El 411 se decide por cabeceras tras CSRF y sesión, antes de cualquier consulta; el contador multipart cuenta peticiones, no chips (DM:82). La única nota es B-N9.

## Hallazgos nuevos

### MEDIO
Ninguno.

### BAJO
- **B-N8.** OA:124 «confirmar o mover desde el área de espera»: especificar solo «confirmar» (registrar la clave definitiva en la fila, sin copiar bytes); si se mueve, la copia ocurre bajo el candado global y reabre N-2 parcialmente.
- **B-N9.** Contradicción menor: OA:112, DM:82 y SCH:79 dicen que el contador multipart cuenta «incluso las que dan 422 o 413», pero el 413 por `Content-Length` (OA:111, OA:162) se decide en el paso 2, antes del paso 3, y no cuenta. Aclarar que solo cuenta el 413 por archivo (paso 4). Un flujo de 413/411 baratos sin tope es inocuo (no se lee el cuerpo) pero conviene declararlo.
- **B-N10.** Área de espera sin ciclo de vida declarado: ante caída entre subida y encolado (OA:123, OA:126) los objetos quedan huérfanos. Declarar TTL y barrido sobre el prefijo del área de espera (T1646) y que el 503 de subida también encola lo ya subido.
- **B-N11.** Los reintentos tras un 503 consumen intentos de chip y multipart (10/día): considerarlo en el valor de `CHIP_MULTIPART_MAX_PER_USER_PER_DAY` o no contar el chip hasta pasar la subida.
- **B-N12.** No pude verificar que 004 defina el «problema genérico» de 411 (referencia en OA:111/157); confirmar en T1646 o declarar el tipo en este catálogo.
- **B-N2 residual.** PDF no rasterizado abierto en el lector del administrador: preferir visor aislado o descarga como adjunto sin previsualización (ya `attachment`, ADM:38), y fijar la elección en T1646/T1636.
- Siguen abiertos sin cambio de v0.3: M-3, M-5, M-6, M-8, B-3, B-4, B-N6, B-N7, E-B1/E-B3/E-B4 sin firmar.

## Decisiones de Neo (no tomadas por architect)
H-A2, N-1, criterio del contador bloqueado, abrir T1648 (N-3), visto bueno a la nota de `ERR-OWN12-RETRYABLE` (0.1.0), y declarar el antimalware como bloqueante para producción.

## Validación hecha
Lectura completa de OA, SCH (líneas relevantes), CAT (change_note y notas), SPL, ADM, errata v03, actas previas, y cotejo de `spec.md:92,315`, `data-model.md:66,82`, `tasks.md` (sin T1648). No se ejecutó ninguna compuerta ni se editó nada fuera de esta acta, el bus y la bitácora.
