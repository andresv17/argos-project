# Revisión /rama — Feature 006 (escena del hogar en pixel art con IA externa)
Fecha: 2026-11-18 · Objeto: specs/006-escena-hogar-pixel-art/spec.md (DRAFT) · Solo lectura; sin ediciones de specs/src/tests.
Contrastado con: 002 (REQ-HOUSE2-002, REQ-ACC-002, INV-ACC2-001/002), 004 (REQ-GCS-003..006, REQ-ARC-001..005, REQ-BOR-004, NFR-ALM-002, D-13), 005 (tope de fotos).

## Veredicto global: PASA CON CONDICIONES (11 condiciones, ninguna BLOQUEA la redacción del plan si se incorporan al spec antes del plan; 2 son de Nivel 2 para Neo).

## 1. Base legal y consentimiento — PASA CON CONDICIÓN
- REQ-ESC6-021/SC-ESC6-033 exigen aviso y confirmación antes de la primera generación, pero: (a) no hay registro del consentimiento (quién, cuándo, versión del aviso); (b) solo se pide al "usuario que pulsa" y la primera generación puede hacerla un miembro que no es dueño de las mascotas; (c) no hay revocación ni re-consentimiento al cambiar de proveedor/aviso; (d) el hogar puede mostrar personas (interior de vivienda, terceros).
- Las fotos de mascotas pertenecen al Propietario Legal (002); la foto del hogar y las referencias de mascotas de OTROS miembros viajan al proveedor por una acción de un tercero. El consentimiento de quien pulsa no cubre los datos de otros.

## 2. Minimización — PASA CON CONDICIÓN
- INV-ESC6-010 correcto en nombres/IDs/microchip/clínica. Falta: EXIF/GPS. 004 D-13 solo lo elimina con canvas en el CLIENTE ("garantía de la interfaz"); el servidor no lo garantiza, y la foto del hogar y el avatar (ruta PUT avatar) no están cubiertos de forma explícita. La spec delega "tratamiento exacto" a /rama: se fija abajo.
- Se envía la foto completa; reducible: redimensionar y recodificar en servidor (sin metadatos) a tamaño máximo necesario para el modelo antes de enviar. La escena previa (modo incremental) también viaja: es una imagen generada con el hogar; mismo trato.
- `fallbackContext`/`biography` (texto libre) son vector de PII futura: biography debe quedar fuera del envío hasta nueva revisión.

## 3. Proveedor externo — PASA CON CONDICIÓN (BLOQUEA elegir proveedor sin los datos)
- La spec no fija: retención de entradas/salidas por el proveedor, uso para entrenamiento, borrado a petición, región. D6-01 los omite como criterio. Sin términos verificados no se puede declarar base de tratamiento ni redactar el aviso.
- Exigir para cualquier opción de D6-01: modo sin entrenamiento con datos del cliente, retención cero o mínima documentada (p. ej. sin almacenamiento de abuso/logging de prompts), región documentada (la infraestructura ARGOS está en us-central1; transferencia internacional si el proveedor procesa en otra), y plan de borrado. Estos términos deben citarse con fuente en el plan [verificar con el proveedor; no asumido].
- La opción A (Vertex/GCP) es preferible en gobernanza (misma cuenta, IAM), pero debe confirmarse que Gemini API pública no equivale a Vertex en términos de datos.

## 4. Almacenamiento — PASA CON CONDICIÓN
- REQ-ESC6-018 hereda borrado inmediato (REQ-GCS-004) y claves UUID: correcto. Brechas: (a) borrar una MASCOTA no menciona expresamente el objeto de referencia ni dispara cola para la foto del hogar al borrar el hogar; SC-ESC6-028 lo cubre solo en parte; (b) EDGE-005 dice borrar escena si el hogar se eliminó, pero no para la generación en vuelo cuyo `put` aún no terminó (necesita fila INTENT en media_deletion_queue como REQ-GCS-006, INV-GCS-002); (c) D6-13 B (versión previa) duplica la retención: si se elige B la anterior debe tener TTL fijo y borrarse en las mismas cascadas; (d) las referencias de la foto del hogar quedan fuera de INV-GCS-002/pet_media: necesitan tabla propia y conciliación diaria incluyendo el prefijo nuevo; (e) ventana residual real = PITR/dumps de 004 REQ-BOR-004; debe constar en el aviso/runbook.
- Exclusión del respaldo (REQ-ESC6-022): PASA (minimiza); pero hay que declarar en el respaldo/ayuda que la foto del hogar y las escenas no viajan y que importar no restaura la escena (queda `idle/outdated`).

## 5. Registros y logs — PASA CON CONDICIÓN
- REQ-ESC6-021 prohíbe prompt, bytes, nombres, photoRef y claves: bien. Faltan: URL firmada y parámetros X-Goog-* de la respuesta del proveedor/GCS (NFR-ALM-002 ya los cubre en 004: heredarlo explícitamente), cuerpo de error del proveedor (puede eco del prompt), texto de rechazo del filtro de seguridad, y la tabla SceneGenerationAttempt (no debe guardar prompt, respuesta ni mensaje del proveedor, solo errorCode estable). Auditoría (REQ-AUD-001) usa hashes: no incluir contenido.
- La clave de idempotencia es dato de cliente: no loguearla en claro.

## 6. Acceso — PASA CON CONDICIÓN
- INV-ESC6-007/REQ-ESC6-020: 404 sin acceso y URL firmada V4 con TTL de 004 (300 s, techo 900): PASA. Condición: la escena visible a TODO miembro ACTIVE incluye mascotas de otros dueños; fijar que la imagen solo contenga mascotas que el lector puede ver, o aceptar y documentar que la escena es contenido compartido del hogar (decisión de Neo). EDGE-010 de 004 (URL viva hasta caducar tras perder acceso) aplica igual y debe citarse como riesgo residual, sin ampliar TTL.
- D6-10: cualquier rol que suba la foto del hogar consiente por el hogar; recomendado B (propietario/ADMIN), coherente con 5.

## 7. Hogar compartido y salida de miembros — PASA CON CONDICIÓN (laguna real)
- 002 REQ-HOUSE2-002: al salir/ser expulsado un miembro se retiran SOLO las asignaciones de sus mascotas. La escena ya generada seguirá mostrando sus mascotas (y la imagen fue creada con su foto) hasta que alguien actualice; la huella cambia (la mascota deja de estar asignada) y la escena pasa a outdated, pero la imagen vigente sigue sirviéndose a los demás con la mascota del ex miembro.
- Debe decidirse: al desasignarse una mascota por salida/expulsión/eliminación, (a) la imagen vigente se retira de la vista (o se purga) de inmediato, o (b) se acepta mostrarla hasta la regeneración. Recomendación /rama: la mascota y su foto de referencia se purgan al desasignar (REQ-ESC6-018 extendido) y la escena se marca outdated; la imagen vigente se conserva solo si el Propietario Legal saliente no pidió su retirada, o se purga y queda sin imagen hasta regenerar. Debe resolverlo Neo (D6 nueva).
- Si el que sale es quien subió la foto del hogar: la foto es del hogar, no de la persona; queda. Pero un ex miembro que ya consintió pierde acceso: su consentimiento no se hereda.
- Eliminación de cuenta (REQ-ACC-002): con cascada se borran hogar/escena si es único miembro; con otros miembros se bloquea. Falta decir que las fotos de mascotas del usuario (referencias de escena) en escenas de hogares con OTROS miembros se purgan, y la escena pasa a outdated.

## Condiciones que el Architect debe incorporar antes del plan
C1. Registro de consentimiento (usuario, fecha UTC, versión del aviso, proveedor) en tabla propia; no se llama a la IA sin consentimiento vigente de la versión actual; se reexige al cambiar proveedor o aviso (SC-ESC6-033 ampliado).
C2. Consentimiento por quien tiene autoridad sobre los datos enviados: foto del hogar y fotos de mascotas ajenas solo viajan si su dueño (Propietario Legal o propietario del hogar) consintió; mascotas de dueños sin consentimiento se envían sin foto (modo sin referencia). Decisión de Neo (nueva D6).
C3. Revocación: acción visible «Retirar consentimiento y borrar imágenes de la escena» que borra escena y referencias y deshabilita el botón; sin penalizar el resto de la app.
C4. Aviso: debe decir qué se envía (foto del hogar, fotos de mascotas, escena previa), a quién (proveedor nombrado), dónde se procesa, cuánto retiene el proveedor, que no se debe subir fotos con personas, y que no hay respaldo de la escena. Contenido final firmado por Neo.
C5. Normalización servidor: antes de enviar, recodificar toda imagen en el servidor (sin EXIF/GPS/ICC), redimensionar al tamaño mínimo necesario y verificar que ningún metadato viaje; no confiar en D-13 (cliente). Prueba: foto con GPS no llega con metadatos al simulador.
C6. Contrato de proveedor: el plan debe documentar con fuente retención, entrenamiento, borrado, región y SLA de datos; sin eso D6-01 no se firma. Mínimo exigible: sin entrenamiento con datos del cliente y sin retención de entradas más allá del procesamiento.
C7. Borrado: cascadas explícitas (mascota, hogar, cuenta, salida/expulsión, revocación) y fila INTENT para objetos en vuelo; conciliación diaria incluye prefijo de escenas/hogar; tabla propia de referencias del hogar.
C8. Logs: heredar NFR-ALM-002 (sin URL firmadas, X-Goog-*, claves de objeto) y añadir: sin cuerpo de error del proveedor, sin texto de rechazo del filtro, sin idempotency-key en claro, SceneGenerationAttempt solo con códigos estables.
C9. Hogar compartido: resolver la laguna de la sección 7 (purga/retirada de la imagen vigente al salir/ser expulsado un miembro con mascota en la escena) y documentar que la escena es contenido del hogar visible por todos los miembros ACTIVE.
C10. D6-10: adoptar B (propietario del hogar y ADMIN) para subir foto del hogar y consentir; D6-13: adoptar A (solo la vigente); biography/fallbackContext fuera del envío hasta nueva revisión.
C11. Documentar riesgos residuales: ventana de URL firmada tras perder acceso (EDGE-010 de 004), ventana de PITR/dumps, copia en el proveedor según sus términos, e imagen con personas fortuitas.

## Decisiones nuevas para Neo (Nivel 2): D6-16 (consentimiento por propietario de datos, C2) y D6-17 (retirada de imagen al salir un miembro, C9).

Hallazgos: 0 críticos, 4 altos (C1/C2, C5, C6, C9), 5 medios, 2 bajos. Sin ediciones de código ni specs. Sin commit.
