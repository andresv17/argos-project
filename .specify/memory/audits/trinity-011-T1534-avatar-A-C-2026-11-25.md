# Acta /trinity — T1534 dictamen final AppSec de la enmienda A+C (2026-11-25)

Alcance: verificación en disco de las condiciones de `trinity-011-T1534-avatar-2026-11-25.md` contra spec 005 (ENM-005-3.5.0 l.120, REQ-VET-006 l.112, INV-005-002 l.136), OpenAPI 3.5.0 (l.351-407, SharedRateLimited l.502) y schema share-link 1.2.0 (petIds l.332-341). Solo lectura; sin commit ni [x].

## Veredicto: CUMPLE CON RESERVAS (0 incumplimientos; 2 reservas documentales, ninguna bloquea T1535 si se llevan a su definición de hecho)

## Condiciones
- TR-1 CUMPLE: spec l.120 (4) y OpenAPI l.374-378: strip con `stripImageMetadata` en CADA lectura, bytes y mime del resultado saneado (nunca contentType almacenado), `ok:false`/ilegible/animado/ausente -> 404 uniforme fail-closed. Se eliminó la premisa del «derivado ya saneado». INV-005-002 (l.136) lo repite.
- TR-3 CUMPLE: spec l.120 (1) y OpenAPI l.372-373: clave de objeto solo con el id ya resuelto del alcance; petId sin validar formato en el borde (`maxLength 64`), mal formado -> 404 (no 500).
- Sin URL firmada ni clave de objeto, sin Content-Disposition/ETag/Last-Modified (OpenAPI l.385; spec l.120 (3)): CUMPLE. OBS-1 de /rama: no aparece `avatarVersion` en ninguno de los tres artefactos ni en ETag/Last-Modified; sin EXIF ni correo: CUMPLE.
- Cabeceras nosniff/no-store/no-referrer/noindex/CSP en 200, 404, 429, 5xx (OpenAPI l.388-396; SharedRateLimited l.502-510): CUMPLE. 500 omite nosniff/CSP (l.401-405), igual que `getSharedSummary`; BAJA.
- HEAD/OPTIONS/otros verbos: 404 uniforme sin resolver el token (OpenAPI l.381; spec l.120 (6)): CUMPLE.
- Sin credentials: spec l.120 (2) dice que el servidor no lee cookie ni Authorization; el cliente usa `credentials: 'omit'`: CUMPLE (ver R-2).
- Schema petIds: `uuid`, `maxItems 100`, `uniqueItems`, opcional fuera de `required`, `additionalProperties:false` conservado, solo en el envoltorio, validación de alcance en la ruta (l.340): CUMPLE.
- TR-2 CUMPLE: spec l.120 (7) «cada 404 de avatar cuenta, sin eximir "sin avatar"»; OpenAPI x-sdd-rate-limit comparte el contador y 429 SharedRateLimited con `Retry-After`. El riesgo de agotamiento (>20 mascotas sin avatar, IP compartida) queda aceptado bajo PN-11 como estaba dictaminado; recomiendo que `/oracle` o Neo lo confirmen como riesgo residual (no se hizo nota explícita del tope de 100 petIds frente a 20 fallos).
- TR-4 CUMPLE PARCIAL (R-1): solo está cubierta por la regla general de INV-005-007 (misma secuencia de puertos) y «mismo contador». La enmienda no escribe la regla específica (lectura de estado del avatar SIEMPRE con petId del alcance o NIL; `storage.get` solo con token, alcance y avatar válidos).

## Reservas
- R-1 (MEDIA/BAJA) Nota TR-4 no escrita explícita en spec/OpenAPI/tasks T1534. Acción: añadir a la definición de hecho de T1535 (y a la prueba roja t1533) la secuencia fija de puertos descrita, con espía.
- R-2 (BAJA) El OpenAPI de la ruta no dice que el servidor ignora Cookie/Authorization y no emite Set-Cookie (solo lo dice el spec l.120 (2), TR-5). Añadirlo a T1535 como criterio y prueba (SC-005-020). Si se usa fetch+blob, `img-src blob:` en la CSP de la SPA pasa por /trinity.
- R-3 (BAJA, contradicción interna) OpenAPI l.399 (500) incluye «o la lectura del almacenamiento falla», mientras l.374-378 manda 404 ante «cualquier fallo de lectura del almacenamiento». Aclarar: objeto ausente = 404; almacenamiento caído (MediaStorageUnavailableError) = 500 genérico (INFO, solo alcanzable con token válido, como el 502 de getSharedFile). Mantener el 500 como lo dictaminé; corregir el texto de l.374-378 en la siguiente edición menor de /architect.
- Arrastradas sin cambio (no bloquean): TR-6 (ruta dentro del plugin `/api/shared`, `exposeHeadRoute:false`), TR-7 (sin petId ni token en auditoría/logs; verificar redacción de `/api/shared/<token>/pets/<id>/avatar`), TR-8, TR-9 (aviso en diálogo de creación del enlace), TR-10 (completar t1533: «en alcance sin avatar», 429, HEAD/OPTIONS, cookie, auditoría).

## Conclusión
La enmienda cumple TR-1, TR-3 y las condiciones de contrato; TR-4 y TR-5 requieren llevarse a la definición de hecho de T1535. T1535 puede iniciar con R-1..R-3 incorporadas. T1534 sigue `[ ]` (techo REVIEW; [x] es de Neo).
