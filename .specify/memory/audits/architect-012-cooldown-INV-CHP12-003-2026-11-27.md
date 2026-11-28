# Acta Architect 012 — H-T1638-05: ERR-CHP12-DISPUTE-COOLDOWN vs INV-CHP12-003 (2026-11-27, HEAD 0805986)

Solo lectura. No se cambió contrato, spec, src ni tests.

## Pregunta
¿El cooldown de disputa depende del estado del chip o solo del historial propio del reclamante? ¿El código actual viola INV-CHP12-003?

## Hallazgo: el contrato se contradice a sí mismo; el código sigue una de las dos versiones
**Versión A (cooldown DESPUÉS de las precondiciones)** — spec.md:91 (REQ-CHP12-004: «`ERR-CHP12-DISPUTE-LIMIT` y `ERR-CHP12-DISPUTE-COOLDOWN` solo se evalúan tras superar las precondiciones»), SC-012-111 (spec.md:326), chip-claim.openapi.yaml:8.
**Versión B (cooldown ANTES, solo filas propias, mismo 409 para cualquier chip, trinity M-4)** — chip-claim.openapi.yaml:27(d), :120 («ANTES de las precondiciones y solo sobre filas propias… sin unir a mascotas ni reservas»), :151 («misma respuesta para cualquier chip»), error-catalog.json:241 («se emite ANTES de las precondiciones, sobre filas propias y con el mismo 409 para cualquier chip (trinity M-4)»). Análogo en CLAIM-COOLDOWN (openapi:65, catalog:205: «no es oráculo para terceros»).

## Código
src/application/use-cases/chip-dispute-use-cases.ts:105 evalúa el cooldown DESPUÉS de `findMicrochipHolder`/`hasOpenChipReservation` (retorno 202 sin fila si chip libre/sin reserva, líneas ~90-92) y de la precondición «mascota propia / INVITED» (~99). Sí es Versión A. El tope DISPUTE-LIMIT (línea 87) sí va antes del chip (correcto en ambas versiones).

## Efecto
Un reclamante con REJECT propio < 90 días sobre el chip X recibe 409 COOLDOWN solo si X tiene mascota o reserva viva y no es suya; 202 si X está libre/sin reserva o es su propia mascota. Es un oráculo acotado de existencia/reserva del chip X, limitado a chips sobre los que el usuario ya tuvo una disputa rechazada (al menos un reclamo previo, consumo del tope de 10 intentos/día). No filtra datos ajenos ni PII, pero contradice el texto de INV-CHP12-003 («sin oráculo»), el principio de REQ-CHP12-005 y la Versión B del contrato (openapi:120/151, catalog:241).

## Conclusión
- Contra Versión B (openapi/catálogo, más reciente, trinity M-4): el código VIOLA el contrato (orden de evaluación).
- Contra Versión A (spec.md:91, SC-012-111): el código es coherente.
- La contradicción es de contrato y no se resuelve sin Neo (spec y contratos son normativos; no cambio APPROVED/DRAFT por mi cuenta). Severidad BAJA confirmada (oráculo acotado a chips con historial propio de REJECT).

## Propuesta mínima (a decidir por Neo; no ejecutada)
1. Adoptar la Versión B (cierra el oráculo; el cooldown depende solo del historial propio). Código: mover el bloque `mine.some(... REJECT ...)` (línea ~103-106) a justo después de la comprobación DISPUTE-LIMIT (línea 87), antes de `findMicrochipHolder`; no cambia las llamadas a repositorio de las demás ramas (usa `mine` ya cargado).
2. Alinear texto: spec.md:91 (quitar «y ERR-CHP12-DISPUTE-COOLDOWN» de «solo tras superar las precondiciones»), SC-012-111 (spec.md:326, quitar «/COOLDOWN») y chip-claim.openapi.yaml:8; ajustar la prueba roja de SC-012-111 y añadir caso: usuario con REJECT previo sobre chip libre recibe 409, igual que sobre chip ocupado.
3. Alternativa (Versión A, no recomendada): aceptar el residual como N2-R4 (iii) en spec; coste: oráculo documentado.
