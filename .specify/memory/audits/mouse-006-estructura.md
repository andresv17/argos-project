# Gate estructural /mouse — Feature 006 (spec.md DRAFT, enmienda 2026-11-18)

Fecha: 2026-11-18 · Auditor: /mouse (solo lectura sobre el spec) · Objeto: `specs/006-escena-hogar-pixel-art/spec.md` (367 líneas)
Alcance: solo estructura (IDs, trazabilidad, referencias, marcado de decisiones, plantilla, estado). Sin juicio de lógica de negocio.

## Veredicto: BLOCKED (correcciones menores del Architect; 1 ALTO, 4 MEDIO, 5 BAJO)

## Conteos verificados (grep sobre definiciones `- **ID**`)
| Familia | Definidos | Duplicados | Formato | Coincide con «Resumen de conteo» (l.349) |
|---|---|---|---|---|
| REQ-ESC6 | 31 (001..031 contiguos) | 0 | `XXX-ESC6-NNN` consistente | Sí |
| INV-ESC6 | 17 (001..017) | 0 | OK | Sí |
| EDGE-ESC6 | 23 (001..023) | 0 | OK | Sí |
| SC-ESC6 | 50 (001..050) | 0 | OK | Sí |
| NFR-ESC6 | 4 (001..004) | 0 | OK | Sí |
| RR-06 | 9 (01..09) | 0 | OK | Sí |
| D6 | 17 (01..17) | 0 | OK | Sí |
Ningún ID citado queda sin definir (0 referencias colgantes dentro de la 006). Escenarios del requerimiento (`claude/requerimiento-escena-hogar-pixel-art.md`): 19 numerados 1..19 = A1..A4, B5..B7, C8..C13, D14..D19; los 19 aparecen en la tabla de trazabilidad (l.201-212) y en al menos 1 REQ (mínimo 2 REQ por escenario). Reglas clave 1..6 mapeadas.

## Defectos

### ALTO
- **M6-A1** Huérfanos reales (sin SC ni EDGE ni escenario que los cubra): `REQ-ESC6-022` (l.147, respaldo y portabilidad; ningún SC lo cita), `INV-ESC6-009` (l.173, claves opacas) e `INV-ESC6-012` (l.176, solo lectura del dominio). Requieren al menos 1 SC (o EDGE) cada uno.

### MEDIO
- **M6-M1** Escenario inexistente `A5` citado en `REQ-ESC6-006` (l.116, ítem 1) y en su lista de *Escenarios* (l.123). Los escenarios válidos son A1..A4 (¿se quiso B5?). Corregir en ambos sitios y reflejar en la tabla (l.203-212).
- **M6-M2** Cobertura solo implícita (sin ID en ningún SC/EDGE): `REQ-ESC6-003` (l.109; cubierto solo por contenido en SC-017/018/020), `REQ-ESC6-010` (l.127; cubierto por SC-010 vía `EDGE-ESC6-010`/escenario C10), `INV-ESC6-004` (l.168), `INV-ESC6-005` (l.169), `INV-ESC6-008` (l.172). Añadir el ID a la cabecera de los SC que ya los ejercitan (SC-015/016/017/006/007/010/017-018/020).
- **M6-M3** Default normativo que contradice la propuesta pendiente: `REQ-ESC6-020` (l.145) fija «por omisión del borrador: los roles con `WRITE_MEDIA`» (equivale a `D6-10` A, incluye CAREGIVER), mientras `D6-10` (l.310) propone B y `SC-ESC6-049` (l.290) asume B. Alinear el default o marcarlo explícitamente como no normativo.
- **M6-M4** Decisiones sin marca individual: `D6-02..D6-09`, `D6-11` y `D6-14` (l.302-311, 314) no llevan «PENDIENTE de Neo» propio (solo la cláusula global l.295 y las 7 que sí la llevan: D6-01, 10, 12, 13, 15, 16, 17). Además `D6-02` (l.302) no declara «Propuesta» (D6-12 la omite a propósito y lo dice). Regla del encargo: las 17 con marca y opción propuesta.

### BAJO
- **M6-B1** `REQ-ESC6-030` (l.160) dice «decisión de Neo» para la visibilidad de la escena a todo miembro `ACTIVE`, pero está pendiente en `D6-16` (l.316); reformular como propuesta pendiente.
- **M6-B2** Códigos de error nuevos sin ID: «código de consentimiento requerido» (l.178, SC-035) y «error de cuota agotada» (l.256, SC-015) y el «código de error estable» de `REQ-ESC6-013` (l.133) quedan como «catálogo incremental» sin identificador; definir los IDs en el plan o dejar nota explícita.
- **M6-B3** `NFR-ESC6-001` y `NFR-ESC6-002` sin SC asociado (NFR-003 -> SC-030; NFR-004 -> SC-029).
- **M6-B4** Plantilla 004: falta la sección «Trazabilidad REQ → SC (→ tareas)» (004 l.252); la 006 solo tiene escenario → REQ y condición/hallazgo → REQ. Faltarían además, solo cuando existan, «Decisiones de Neo asentadas», «Pendientes externos» y «Notas de recorte» (no exigibles en DRAFT). Orden de REQ: 018 está antes de 003 (l.105) por agrupación temática.
- **M6-B5** User Stories 5 y 6 (l.65-71) no tienen escenarios Given/When/Then, solo la línea de «Independent Test»; `SC-ESC6-033` (l.274) cita solo `REQ-ESC6-021` aunque ejercita 023 y 026; redacción confusa en SC-035 («adaptador real simulado como "real"», l.276).

## Referencias cruzadas (grep en specs/00X-*/spec.md y constitución)
Verificadas OK, 0 rotas: INV-ARC-001/002/003, REQ-ARC-001/002/003/005 (004); REQ-GCS-003..006, INV-GCS-002, NFR-ALM-002, `D-13` (EXIF solo en cliente), `EDGE-010`, REQ-RAZ-003, INV-RAZ-001/002, REQ-BOR-004/005, ERR-MEDIA-TYPE-NOT-ALLOWED, ERR-MEDIA-TOO-LARGE, ARGOS_MEDIA_MAX_BYTES, ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS, `K-10` (004); REQ-HOUSE2-002, INV-ACC2-001/002, REQ-ACC-002, REQ-BACKUP2-001, REQ-AUD-001, WRITE_MEDIA (002/004); REQ-CLD-002, REQ-CLD-008, REQ-IAC-005 (003); INV-ARCH-001/002/004/006, Principios V.4 y VI (constitución); ERR-SCHEMA-VALIDATION-FAILED (001/002/004/005); tope de 10 PHOTO (005); `T612` (004/tasks.md). Archivos citados existen: `claude/requerimiento-escena-hogar-pixel-art.md`, `rama-006-privacidad.md` (C1..C11 presentes), `merovingian-006-dependencia-ia.md` (H-MERO-006-01..05 presentes).

## Decisiones D6-01..D6-17
17/17 presentes con opciones; 17/17 declaradas pendientes por la cláusula l.295; 7 con marca individual (ver M6-M4). Dependencias normativas de propuestas sin marcar: solo M6-M3 (REQ-020). El resto (`REQ-ESC6-008` D6-11, `-005` D6-10, `-006` D6-08, `-019` D6-04/09, `-024` D6-16, `-025/030` D6-17) remite a la decisión o dice «por omisión del borrador».

## Estado
Encabezado `DRAFT` (l.5). `APPROVED`/`LOCKED` solo aparecen en negaciones (l.5) y como descripción de 004 (l.307). `specs/006-escena-hogar-pixel-art/` contiene solo `spec.md` (sin plan, tasks ni contracts, coherente con el encabezado).

## Script
`bash scripts/verify-traceability.sh --feature 006` acepta el flag pero aborta: «Fuente ausente: specs/006-escena-hogar-pixel-art/tasks.md». No aplica hasta que existan tasks.md y contratos (`REQ-ESC6-031` ya lo prevé). No se modificó el script.

## Siguiente paso
/architect corrige M6-A1, M6-M1..M4 (y los BAJO si es barato) sin re-auditoría de Mouse (invocación única); luego pasa a Neo para D6-01..D6-17. Mouse no aprueba nada (`APPROVED`/`LOCKED` es de Neo, Nivel 2).
