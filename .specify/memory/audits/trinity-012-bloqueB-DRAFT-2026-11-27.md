# Acta /trinity — Revisión AppSec en DRAFT, Bloque B (#23, T1630..T1632) — 2026-11-27

Rama `012-multiduenio-microchip-cuidador`. Solo lectura sobre contratos; no se corrigió ningún archivo. Alcance: `chip-claim.openapi.yaml` (OA), `chip-claim.schema.json` (SCH), `error-catalog.json` 0.2.0 (CAT), `microchip-error-split-annex.md` (SPL), `admin-disputes-annex.md` (ADM). Trazabilidad: REQ-CHP12-001..005, 007..010, REQ-OWN12-008/009/011, INV-CHP12-001/003/004/006/007/008/009, N2-R4, Neo-C/K.

**VEREDICTO DEL DRAFT: APTO CON RESERVAS.** La arquitectura (202 uniforme, conteo previo a resolver, 409 uniforme por clase, comprobador único, deny-by-default de /admin) es sólida. Hay 4 hallazgos ALTO que deben cerrarse (o ser aceptados por Neo, Nivel 2) antes de pasar a APPROVED. No hay CRÍTICO.

## Hallazgos

### ALTO

**H-A1 — El 503 `ERR-OWN12-RETRYABLE` es un oráculo de existencia por contención (INV-CHP12-003).**
OA:87-91 y OA:147-151 (503 en createChipClaim y openChipDispute). El candado por mascota solo existe si el chip pertenece a una mascota viva. Un atacante lanza K peticiones paralelas sobre el mismo chip: si la mascota existe, las peticiones compiten por el candado (espera acotada 3 s) y algunas devuelven 503. Con chip inexistente nunca hay 503. También lo provoca una operación legítima del dueño. «Retry-After constante» no iguala el código de estado ni la latencia de 3 s. El coste es 10 intentos/día por usuario, pero el 202 uniforme queda anulado como control.
Recomendación: tomar siempre un candado asesor por `chip_hmac` (exista o no mascota) antes de decidir el resultado, y tomar el candado por mascota solo dentro de la rama que crea fila. El agotamiento de espera se mapea al mismo 503 para cualquier chip, o se acepta y encola con el 202.

**H-A2 — `listMyChipRequests` reabre el oráculo que el 202 sin `claimId` pretende cerrar.**
OA:159-164 («el listado nunca prueba que un chip exista») y SCH:353. Una fila solo se crea si el chip pertenece a una mascota VIVA AJENA sin PENDING previa (OA:53-55). Tras enviar un claim, el atacante lista: aparece fila (`chipLast4`, status PENDING) si y solo si el chip es de una mascota viva ajena. La afirmación del contrato es falsa. Además distingue viva de fallecida, que el alta no distingue, así que el oráculo es mayor que el 201/409 aceptado en N2-R4.
Efecto lateral: se crea una solicitud visible a los propietarios (username y mensaje, OA:55-56), lo que sirve para acoso y spam.
Recomendación: o se acepta explícitamente y se documenta en N2-R4 que el listado equivale al oráculo residual y está acotado por los contadores, o se retrasa la materialización de la fila (p. ej. visible al solicitante tras un retardo fijo o por lotes). En cualquier caso, corregir la frase del contrato. Neo decide (Nivel 2).

**H-A3 — Control dual evitable: la «ventana de 72 h» es una alternativa elegida por el propio árbitro.**
ADM:59-62 («exige una de dos vías, elegidas al decidir»). Un solo administrador, comprometido o malicioso, elige la vía 2, registra la decisión con un motivo libre y ejecuta a las 72 h. Solo puede cancelar el árbitro principal o `SUPER_ADMIN` (ADM:22), y no se notifica a nadie con interés en vetar: en `CHIP_APPROPRIATION` el aviso a propietarios es solo de apertura (ADM:72). Los desenlaces `ADD_CO_OWNER` y `REQUEST_CHANGE_PRINCIPAL` dan acceso a datos de salud de una mascota ajena sobre evidencia documental no verificable y ex parte (Neo-K). REQ-CHP12-009 habla de «dos administradores».
Recomendación: control dual obligatorio para cualquier cambio de titularidad en `CHIP_APPROPRIATION`. Si se conserva la ventana, notificar a los propietarios y permitir veto/cancelación por cualquier segundo administrador. Exigir además reautenticación (step-up) en `resolve`/`confirm`.

**H-A4 — Evidencia: sin saneo de PDF activo ni de bombas o políglotas de imagen; el destinatario es un administrador privilegiado.**
SCH:111 y SCH:133, OA:100-110, ADM:37-38. Se exige firma de contenido y EXIF eliminado, pero no se dice: (a) PDF con JavaScript, `OpenAction`/`Launch`, archivos embebidos o XFA, y metadatos PDF; (b) límite de dimensión en píxeles y descompresión (bomba de descompresión) antes de decodificar; (c) política de reencodificación (un JPEG+ZIP/HTML sobrevive a «quitar EXIF» si no se reencodifica); (d) análisis antimalware. `Content-Disposition: attachment` y `nosniff` protegen al navegador, no al lector de PDF local del administrador.
Recomendación: reencodificar imágenes con límites de píxeles; para PDF, rechazar activos peligrosos o rasterizar en servidor; escáner antimalware antes de persistir. Hacerlo antes de pasar a APPROVED, no como detalle de implementación.

### MEDIO

**M-1 — Procesamiento multipart antes de cualquier contador (DoS autenticado).** OA:100-102 y OA:141-145 (422/413 no cuentan; validación de forma antes de contar). Con una sola cuenta se pueden enviar de forma ilimitada formularios de 5 archivos hasta el tope por archivo, que obligan a parsear y analizar firma y tamaño sin ningún contador. Recomendación: contador y tope de bytes por usuario e IP para peticiones multipart, independiente del contador de chips. Fijar límites de parser (número de partes, campos duplicados `microchipId`, tamaño total del cuerpo y 413 por cuerpo, no solo por archivo; hoy no está definido) y validar en streaming.

**M-2 — Los contadores globales son una palanca de denegación para todos.** OA:17-20, SCH:66-69, SPL:29. Global 1000/día compartido por alta, edición, claim, disputa e importación. Un atacante con varias cuentas agota el contador global y bloquea el alta o edición de chip para todos. Falta definir (a) si un intento ya bloqueado por el contador de usuario incrementa IP y global (no debería), (b) atomicidad del incremento (INCR atómico; ráfagas paralelas pueden superar el tope) y (c) fricción en la creación de cuentas. «Falla cerrada» (OA:205) convierte una caída del almacén de límites en indisponibilidad total del alta con chip. Además, el texto de REQ-CHP12-005 (`spec.md:92`) dice «alta o edición», mientras que SCH:69 y OA:18 incluyen claim y disputa: confirmar que es una ampliación aprobada.

**M-3 — Congelación por chip como arma de acoso (griefing).** OA:104-107, ADM:48-51. Cualquier usuario autenticado con un chip ajeno (impreso en documentos) abre una disputa con un JPEG cualquiera: la mascota queda congelada 30 días (60 con prórroga), con DELETE_PET, cambio de chip e invitaciones bloqueados (CAT:204-210). Solo frenan los 3 simultáneos y el cooldown posterior a un REJECT. Recomendación: no congelar de inmediato, o congelar solo operaciones críticas, hasta un triaje de `/admin` (SLA corto), o añadir un coste (1 disputa abierta por IP/dispositivo). Valorar el impacto del bloqueo de DELETE_PET con el derecho de supresión (rama).

**M-4 — Oráculo por límite de disputas y por cooldown de claim.** OA:103-105 y OA:56-58. `ERR-CHP12-DISPUTE-LIMIT` se emite solo tras superar las precondiciones: un usuario con 3 disputas abiertas obtiene 409 si el chip es de mascota o reserva ajena y 202 si no, así que cada intento (10/día) es una consulta de existencia limpia. Análogo para `CLAIM-COOLDOWN` si la fila previa quedó huérfana (mascota borrada: 409 vs 202). Recomendación: evaluar los límites ANTES de las precondiciones, aplicando el mismo 409 a cualquier chip, o devolver 202 también en los límites con aviso por `listMyChipRequests`.

**M-5 — La recusación depende de un vínculo débil admin-usuario.** ADM:29. «Cuenta de usuario vinculada al correo del administrador (si existe)». Un administrador con cuenta de usuario con otro correo, o familiar o compañero de hogar de un propietario, no queda recusado. El 403 `ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT` (CAT:222-229) confirma al administrador que él es parte de un caso concreto. Recomendación: declaración de conflicto obligatoria y auditada al abrir cada expediente, recusación por pertenencia al mismo hogar, vínculo explícito admin-usuario (no solo por correo) y, en la lista, ocultar los casos donde el administrador sea parte en vez de revelar el 403 por id.

**M-6 — Sin tope de solicitudes PENDING por mascota o chip (spam a propietarios).** OA:53-55 (solo 1 PENDING por solicitante y chip). N cuentas pueden inundar a los propietarios con solicitudes con username y mensaje de 280 caracteres. Recomendación: tope de PENDING por chip_hmac (el exceso responde 202 sin fila) y aviso agregado.

**M-7 — Anexo de cola /admin sin contrato máquina.** ADM:77 (§10.2), ADM:3. Las rutas y su matriz son «propuestas» y no hay OpenAPI. Keymaker implementaría T1636 sin contrato verificable: sin esquemas de 403/404, sin garantías de IDOR (`evidenceId` debe pertenecer a `{id}`), sin step-up ni límites de tasa de lectura de evidencia. Recomendación: abrir el `[ARCH]` posterior (p. ej. `T1648`) como dependencia dura de T1636. No habilitar la cola en producción sin eso y sin `DEUDA-012-LEGAL-DISPUTAS-QR`.

**M-8 — Descarga de evidencia: URL firmada y auditoría.** ADM:38. Indeterminado «302/JSON»: un 302 deja la URL en logs y referrers. Falta: auditoría escrita antes de emitir la URL (si falla, no se emite); validez más corta que 5 min (60 s) y de un solo uso o ligada a sesión; comprobación de que el objeto pertenece a la disputa; alerta por lecturas masivas (amenaza interna). Preferir JSON y redactar la URL en los registros.

### BAJO

**B-1 — Confirmación dual sin garantía de revisión independiente.** ADM:61. «Distinto» debe fijarse por id de administrador y de persona (no dos cuentas del mismo humano) y la confirmación debería exigir lectura previa de la evidencia (auditada) y un motivo propio.

**B-2 — Importación y restauración consumen N intentos contra el tope de 10/día.** SPL:40-41. Si `MICROCHIP_IMPORT_MAX_PETS` > 10, una restauración legítima falla siempre con 429. Fijar la política (conteo previo de N, descuento de chips propios) y verificar que el 429 llega antes de cualquier consulta.

**B-3 — `ClaimMessage` no excluye caracteres invisibles.** SCH:83. Permite U+200B..U+200F, U+2028/2029, U+061C, U+FEFF y caracteres de etiqueta (suplantación visual y texto oculto en la UI de propietarios). Ampliar la lista negra o permitir solo categorías `L`, `N`, `P`, `S`, `Zs`. No hay tope de cuerpo JSON declarado en OA:61-65 (añadir 413).

**B-4 — Tratamiento incoherente de `INVITED`.** SPL:20 y SPL:25 (INVITED recibe REGISTERED en el alta) frente a OA:51-52 y OA:101-103 (INVITED es «propio» y obtiene 202 sin fila). El 409 del alta le recomienda «solicitar co-propiedad o abrir una reclamación» y ambas rutas son un callejón sin salida silencioso. Alinear la definición.

**B-5 — Huérfanos de evidencia.** OA:107, SCH:133. «Ningún archivo se persiste» sin fila: definir que el guardado y la creación de la fila forman una unidad con limpieza de huérfanos (fallo tras subir, carrera con el límite 409).

**B-6 — Conservación tras el REJECT/moot.** ADM:39. 365 días de evidencia para casos rechazados o sin efecto choca con minimización (rama; ya condicionado por T1643). Valorar purga más corta tras REJECT/EXPIRED.

### INFO

- **I-1** Latencia: la diferencia entre fila creada (saneo + almacenamiento de hasta 5 archivos) y 202 sin fila es de segundos, no de milisegundos. SPL:26 acepta la latencia como informativa para el 409, pero esto es un canal nuevo en la apertura de disputa. Igualar con trabajo ficticio o procesar en diferido (relacionado con H-A1).
- **I-2** `chip_hmac`: falta fijar en el contrato la gestión de la clave del HMAC (secreto en Secret Manager, rotación y versión de clave), porque 15 dígitos son enumerables si la clave se filtra.
- **I-3** Decisiones ex parte: los propietarios no pueden contradecir la evidencia (Neo-K, decisión aceptada). Documentar como riesgo residual de ingeniería social con documentos falsificados (H-A3).
- **I-4** SPL §5 (errata a la 001) coherente con el anti-oráculo; recomiendo que Neo la firme. La alternativa (b) descartada sería peor.
- **I-5** CSRF por cabecera personalizada es adecuado para el multipart (un formulario entre orígenes no puede fijarla). CAT 0.2.0 es coherente con OA y ADM; no hay códigos nuevos ni removidos.

## Trazabilidad cubierta
REQ-CHP12-001/002 (SPL, SCH:78), 003 (OA:46-58), 004 (OA:96-110, M-3/M-4), 005 (M-2, H-A1), 007 (auditoría sin chip completo: conforme), 008 (H-A4, M-8), 009 (H-A3, M-5), 010 (avisos derivados: conforme). REQ-OWN12-011 (H-A1). INV-CHP12-003 (H-A1/H-A2), INV-CHP12-004 (H-A4), INV-CHP12-006 (H-A3), INV-CHP12-009 (SPL §3: conforme).

## Acciones recomendadas antes de APPROVED
1. Neo decide H-A2 (aceptar el oráculo del listado o rediseñar); /architect corrige H-A1, H-A3, H-A4 y define M-1, M-2 y M-4.
2. Abrir `T1648` ([ARCH] OpenAPI de /admin/disputes) antes de T1636.
3. Segunda revisión de /trinity sobre la versión corregida (contratos y OpenAPI de /admin); pruebas de seguridad dirigidas: carrera paralela sobre chip existente e inexistente (H-A1), cabeceras y cuerpo idénticos del 202, PDF activo y bomba de descompresión, intento de arbitraje por una parte.
