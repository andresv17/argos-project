# Bitácora de Trinity


## 2026-11-10 — Checkpoint F4 (insumo de seguridad, Feature 002)
- Entregado `.specify/memory/audits/f4-insumo-trinity-seguridad.md`: sesiones (cambios propuestos a STATE-AUTH-SESSION-001, sin editarla), auditoría HMAC/SHA-256, respaldo (token y no escalada).
- 14 PROPUESTAS (P-01..P-14), 7 vectores nuevos (V10..V16), 6 decisiones para Neo (D1..D6). Sin edición de specs/contratos/src; sin commit.

## 2026-11-11 — Checkpoint T223 (vectores sesión expirada y CSRF, Feature 002)
- `session-csrf.security.spec.ts`: 14/14 pasan; sin it.skip/it.todo/toBeTruthy. Mutación 1 (quitar EXPIRED_IDLE en `src/domain/auth/session-policy.ts`): fallan 3. Mutación 2 (anular la comprobación en `csrf-guard.ts`): fallan 4.
- Ambos archivos restaurados idénticos (hash y git diff vacíos); 14/14 de nuevo. Sin vectores débiles. Sin commit ni marca de tarea.

## 2026-11-14 — T302 batería V1..V16 (Feature 002, Fase 8 ola 2)
- `npx vitest run tests/security`: 13 archivos, 267/267 estable (6 corridas); un fallo transitorio de V14 D1 durante edición concurrente de Keymaker (mtime 16:28:39), no reproducible.
- SAST: Semgrep no instalado (no se instaló); grep manual de las 4 reglas sobre src/: 0 coincidencias; npm audit: 0 vulnerabilidades.
- Hallazgos: Caso A solo M-1 (V9 con 1 prueba); Caso B ninguno. Informe: `claude/hallazgos-t302-trinity.md`. Sin cambios en src/specs/tests; sin commit; T302 sin marcar.

## 2026-11-18 — Revisión de seguridad del diseño de la feature 006 (escena pixel art)
- Auditoría de solo lectura de plan.md, spec.md y contracts/ (openapi, schemas, errors, state-machines) de specs/006; contraste con oidc-verify.ts y maintenance-routes.ts. Informe: `.specify/memory/audits/trinity-006-diseno.md`.
- Hallazgos: 0 CRÍTICO, 3 ALTO (H-TRI-006-01 worker sin igualdad de email/audiencia propia; -02 DoS económico por intentos fallidos y cuotas por alcance; -03 normalizador por lista negra), 8 MEDIO, 5 BAJO. NFR-ESC6-001 no queda acotado hasta resolver -02.
- Sin cambios a specs/src/tests, sin commit ni push; STATUS Validation Required para Morpheus/Architect.

## 2026-11-20 — T955 parte seguridad (Fase 14, Vertex + token metadata)
Auditados metadata-token-client.ts y vertex-scene-image-generator.adapter.ts. Dictamen PASS CON OBS (1 BAJO, 3 OBS; 0 CRITICO/ALTO/MEDIO). SAST: semgrep no disponible; scan-secrets 0 hallazgos, tsc 0. Acta: .specify/memory/audits/trinity-006-fase14-vertex.md. Sin ediciones en src/specs/tests.

## 2026-11-21 — T1193 (Feature 008, #24): enumeración, tiempos, fuerza bruta, logs y caché de searchInvitees
- Auditoría de solo lectura de SearchInviteesUseCase, invitee-search.ts, limitador, ruta y cloud-logging. Acta: `.specify/memory/audits/trinity-008-T1193-enumeracion.md`. Dictamen PASS CON OBS (1 MEDIO: limitador en memoria con max 2 instancias; 2 BAJO: rotación de IP/cuentas y URL en log de plataforma Cloud Run).
- Pruebas: t1188 15/15; tests/security 413/413. Sin cambios en src/specs/tests; sin commit; T1193 sin marcar.

## 2026-11-21 — T1133 (Feature 008, #17): seguridad de la vinculación de Google
- Auditoría de solo lectura de google-auth.routes.ts y google-auth-use-cases.ts. Nuevo `tests/security/t1133-vinculacion-google-008.security.spec.ts` (29 pruebas: V-A pre-hijacking, V-B CSRF de startGoogleLink/callback/username, V-C uniformidad y enumeración, V-D coste determinista sin reloj de pared). 29/29 en 3 corridas; tests/security 24 archivos 457/457; flujo Google existente 78/78; tsc 0; verify-oracles OK.
- Dictamen PASS CON OBS: 0 defectos de producción; OBS-1 coste del callback desigual por diseño (fallos previos al canje no llaman a Google), OBS-2 riesgo residual DEUDA-008-GOOGLE-LINK-2STEP (cookie argos_oauth sin prefijo __Host- y callback sin prueba de posesión de la sesión). Sin cambios en src/specs/tasks; sin commit; T1133 sin marcar.

## 2026-11-21 — T1133 ajustes de Oracle (Feature 008, #17)
- V-B1: 6 rechazos CSRF (> MAX_FAILED_ATTEMPTS=5) antes del login correcto (200). V-A7: título honesto (inactividad 31 min) y aserción de code. V-D4: título acotado a límite de /link.
- Aserciones exactas: V-A6 (422/422/401/422 con code), V-A8 204, V-C4 400 ERR-AUTH-GOOGLE-FAILED sin sesión ni identidad, V-C5 401 ERR-AUTH-INVALID-CREDENTIALS y cuerpo igual salvo instance. 29/29 x3, tsc 0, verify-oracles OK. Sin src/specs; sin commit.

## 2026-11-21 — T1185 (Feature 008, #21): biografía como texto libre (XSS, inyección en el API, privacidad, escena)
- Auditoría de solo lectura de PetDashboard/PetForm/PetCards, pet-invariants, rutas de mascota, respaldo, resumen veterinario y módulos de escena. Nuevo `tests/security/t1185-biografia-texto-libre-008.security.spec.ts` (45 pruebas: V-A XSS con 6 cargas en ficha y campo, sin innerHTML en src/presentation; V-B tipos, control C0/DEL, 280 por puntos de código, 1 MiB, recorte/vacío; V-C no en logs, auditoría, resumen veterinario, listado ni a terceros; V-D la biografía solo en módulos de ficha/persistencia/respaldo, no en escena ni IA, buildImagePrompt la ignora).
- Dictamen PASS CON OBS: 0 defectos ALTO/MEDIO. OBS BAJO: NEL U+0085, LS U+2028 y RLO U+202E pasan el patrón (solo excluye C0 y DEL); inertes al mostrarse, pero permiten salto de línea Unicode y spoofing visual en una línea «sin saltos». t1185 45/45 x3, tests/security + t1182 + t1183 518/518, tsc 0, verify-oracles OK. Sin cambios en src/specs; sin commit; T1185 sin marcar.

## 2026-11-23 — T1222 (009, deuda #17) auditoría AppSec
- Acta: .specify/memory/audits/trinity-009-T1222-reautenticacion.md. Veredicto PASS CON CAMBIOS (0 ALTO, 1 MEDIO TRI-01 auth_time de Google real, 6 BAJO).
- Pruebas t1218 + t1130: 30/30 verdes. Sin cambios de código.
- 409 detail con nombres de hogares: aceptable; ruta de borrado sin rate limit: proponer bucket por usuario (TRI-02).

## 2026-11-23 — T1238 (009) AppSec portal /admin
- Acta: .specify/memory/audits/trinity-009-T1238.md. Semgrep 1.186.0 sobre archivos admin: 0 hallazgos.
- Nueva suite tests/security/t1238-portal-admin-009.security.spec.ts: 28/28 verdes (7 vectores); tests/security completo 537/537.
- Hallazgos: 0 ALTO/MEDIO; 4 BAJO/INFO (origen tras sesión, docstring 1.1.0, límite por instancia, trustProxy a confirmar). Sin cambios en src/.
- Enjambre /sentinels no corrido.

## 2026-11-23 — T1252 (009, #18) AppSec Fase 4
- Acta: .specify/memory/audits/trinity-009-T1252.md. PASS CON OBS: CAS atomico, rol admin, CSRF global, guarda ACTIVE y respuestas sin fuga OK; Semgrep (reglas repo) 0 hallazgos; t1245/t1247/t1288 45/45.
- OBS BAJO: sin Origin en POST approve/reject; 409 de registro no consume cupo (sondeo de username sin tope); limite en memoria por instancia. trustProxy=1 salto en Cloud (server.ts:233). Sin cambios de codigo.

## 2026-11-23 — T1271 (009, #20) AppSec Fase 5b (parte /trinity)
- Acta: .specify/memory/audits/trinity-009-T1271-fase5b.md. PASS CON OBS (0 CRITICO/ALTO, 1 MEDIO, 5 BAJO). Solo lectura; sin [x], sin commit.
- Semgrep (reglas repo) sobre dirs T1271 y src/: 2 hallazgos entropia (server.ts:167 nuevo Date.now(); SessionExpiryNotice.tsx:15 de 5a) => CI rojo hasta inyectar reloj o nosemgrep justificado. tests/security 574/574.
- SSRF, CSRF/IDOR, privacidad y tope 5 USD sin defecto; prompt.blocks aun no alcanzable (isCanonical false, runtime usa defecto): reauditar al cablear.

## 2026-11-24 T1418 (010, Bloque C) revisión IP/XFF
- Solo lectura; verificación empírica con Fastify inject en scratchpad (sin tocar repo).
- HOPS=2 detrás de Cloudflare CUMPLE; run.app directo RIESGO ACEPTADO con hallazgos nuevos H-T1418-01 (IPv6 /64), -02 (claves/memoria de limitadores), -03 (DoS dirigido admin).
- Dictamen: .specify/memory/audits/trinity-010-T1418-ip-xff-2026-11-24.md. Pendiente: decisión de Neo y /sentinels.

## 2026-11-25 T1432 (010, Bloque E) AppSec «Acerca de» (parte /trinity)
- Acta: .specify/memory/audits/trinity-010-T1432-about-2026-11-25.md. PASS CON CAMBIOS: 0 CRIT/ALTO, 2 MED de compuerta, 3 BAJO, 2 INFO. Solo lectura; sin [x], sin push.
- XSS (render web + sanitizador), CSRF/404 uniforme, SSRF (sin fetch remoto), rutas no expuestas, fotos hostiles y EXIF/XMP/tEXt (PNG/WebP/JPEG) PASS con sondas propias.
- MED: Semgrep (reglas repo) 2 blocking dangerouslySetInnerHTML en AboutPage:37 y AboutPanel:213 (CI rojo); tests/security 639 ok/2 rojas (t1185 y ui-invitation-logs) por T1431. Pruebas about 108/108.

## 2026-11-25 T1505 (011) AppSec roles de plataforma/delegados/2FA
- Acta: .specify/memory/audits/trinity-011-T1505-appsec-2026-11-25.md. Aceptable con cambios: 0 CRIT, 2 ALTO (invitación sin ancla; último SUPER_ADMIN con carrera/lista vacía), 5 MED, 2 BAJO, 1 INFO.
- Verificado en src: sin roles, sin lectura de amr/acr/hd; EDGE-011-004 contradice el código (deniega si el correo cambia). Recomendación D11-02: sin 2FA técnico ahora, controles operativos y compensatorios. Solo lectura; sin [x], sin push.
## 2026-11-25 K-2 (011) revocación entre gestores
- Acta: .specify/memory/audits/trinity-011-K2-revocacion-2026-11-25.md. No es fallo: REQ-VET-005 (D5-12) y contrato openapi 005 permiten revocar al creador, dueño legal (PET) y dueño/ADMIN del hogar (HOUSEHOLD); mayRevoke lo implementa; 404 uniforme a terceros. Severidad INFO. DEUDA-011-K2 (mostrar "Creado por", cambio de contrato 005 con revisión de privacidad), fuera de #64; no bloquea Bloque A. Solo lectura.
- 2026-11-25 trinity: T1523 (Bloque C #73) saneado inputs_snapshot v2 y retiro del prompt: PASS CON OBS (3 bajos, 1 info). Acta: .specify/memory/audits/trinity-011-T1523-bloqueC-2026-11-25.md. Sin cambios de codigo.
- 2026-11-25 trinity: T1526 (Bloque D #63) AppSec backend roles de plataforma (T1527): PASS CON OBS (3 bajos, 3 info; 0 crit/alto/medio). Derivada UNIQUE(provider,provider_subject) WHERE ACTIVE: segura, sin enumeración ni bloqueo explotable, se recomienda. Acta: .specify/memory/audits/trinity-011-T1526-backend-2026-11-25.md. Sin cambios de código.
- 2026-11-25 trinity: T1534 (Bloque E #31) AppSec ruta GET /shared/{token}/pets/{petId}/avatar: PASS CON OBS (diseño; 1 ALTA TR-1 el avatar se guarda crudo con EXIF, T1535 debe sanear en lectura con stripImageMetadata y fallar cerrado; 2 MEDIA; excepcion INV-005-002 aceptable con condiciones). Acta: .specify/memory/audits/trinity-011-T1534-avatar-2026-11-25.md. Solo lectura, sin codigo.

## 2026-11-25 reverificacion T1534
R-1/R-2/R-3 y TR-1 releidos en spec 005 ENM-005-3.5.0 y OpenAPI getSharedPetAvatar: CUMPLE. Acta actualizada; sin ediciones de codigo ni estados.

- 2026-11-25 [T1535 código] CUMPLE CON RESERVAS; acta trinity-011-T1535-codigo-2026-11-25.md. R-1: <img> real vs credentials:omit de spec; residual cookie aceptado.
- 2026-11-25 Cierre R-1 T1535: CERRADA con evidencia (texto==UI; sin falsa seguridad; INFO getSharedAvatar muerto). Ver acta.

- 2026-11-25 T1555 AppSec avatar de usuario: acta trinity-011-T1555 emitida; CUMPLE CON RESERVAS (4 MEDIAS H-1/H-3/H-6/H-8, 5 BAJAS). Solo lectura.

## 2026-11-25 — AppSec código T1556 (avatar de usuario, #78)
Veredicto CUMPLE CON RESERVAS (R-1 ventana 15 min vs 24 h del anexo, R-2 endurecer prueba de lista fetch, R-3 nota de migración NOT VALID). Excepción fetch de user-avatar-api.ts aceptable. Acta en .specify/memory/audits/trinity-011-T1556-avatar-usuario-codigo-2026-11-25.md.

## 2026-11-26 Fase 0 (012) auditoría de amenazas multidueño/microchip/QR/enlaces
- Acta: .specify/memory/audits/trinity-012-fase0-2026-11-26.md. CUMPLE CON RESERVAS: 6 ALTOS (H-01..H-06), 9 MEDIOS, 4 BAJOS, 2 INFO. Solo lectura; sin [x], sin push.
- Destacados: veto que impide salida/supresión (H-01), disputa destruible por cascada (H-03), teléfono de co-propietario publicado sin opt-in por mascota (H-05), `redactSecrets` no cubre `/e/{token}` (H-06), SC-012-049 vs SC-012-070 (H-12).
- Propone INV-OWN12-001..005, INV-CHP12-001..008, INV-QR12-001..008, INV-VET12-001..004 y textos enmendados de INV-ACC-001/002. qr-encoder.ts aún no existe en disco.

## 2026-11-26 — Re-auditoría dirigida Fase 0 de 012 (MAX_RETRY = 1)
- Acta: .specify/memory/audits/trinity-012-reauditoria-2026-11-26.md. CUMPLE CON RESERVAS: H-01..H-21 cerrados en texto; 9 residuales R-01..R-09. Solo lectura; sin [x], sin push.
- Cifras propuestas: MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY=30 (CGNAT), GLOBAL=1000/día con alerta al 70 % y sin bloquear altas sin chip. END_CO_OWNERSHIP: NO acotado del todo (R-01: objetivo, precondición objetiva, aviso al afectado, anclaje por mascota).
- Otros destacados: chip liberable al borrar la cuenta durante la disputa (R-05), vida del opt-in de teléfono (R-06), respuesta con el token sin almacenar (R-07).

## 2026-11-26 — Revisión dirigida Fase 0 de 012 (R-02, R-03, R-09, supresión con disputa, PRINCIPAL_ABSENT, designación inválida)
- Acta: .specify/memory/audits/trinity-012-dirigida-2026-11-26.md. R-02 CERRADO CON RESERVA; R-03 ABIERTO (importación de respaldo evade la reserva; apertura de disputa sin precondiciones); R-09 ABIERTO (una cuenta agota el contador global; atomicidad; importación no cuenta).
- PRINCIPAL_ABSENT ABIERTO (ventana móvil de 60 días anula el caso; disparador fabricable; 404 uniforme); designación inválida y supresión con disputa: CERRADO CON RESERVA. Cambios C-1..C-5 listados para /architect; 3 puntos para Neo (preferencia del reclamante al liberar reserva, endurecer N2-R1, mantener variante).
- Solo lectura sobre specs/012; sin [x], APPROVED, commit ni push.

## 2026-11-26 T1612 AppSec contratos Bloque A de 012 (co-propiedad, #22)
- Acta: .specify/memory/audits/trinity-012-T1612-bloqueA-2026-11-26.md. Veredicto APTO CON RESERVAS: 1 ALTA (H-01 OwnerRequestView sin cierre por acción x rol), 9 MEDIAS (oráculo de username por fila INVITED, autorización antes del bloqueo, petId duplicado ruta/cuerpo, 403 sin causa, 204 engañoso en cancel/decline, historial tras LEAVE, purga de 90 días vs trigger_request_ids, disparador fabricable con ~8 días, sin límites de creación), 5 BAJAS, 2 INFO.
- Los 4 códigos derivados no revelan información (reservas en H-03/H-14). Cambios de texto listados para /architect; H-09 requiere decisión de Neo. Solo lectura; sin [x], APPROVED, commit ni push.

## 2026-11-26 T1612 re-verificación dirigida (012, Bloque A)
- Acta: .specify/memory/audits/trinity-012-T1612-reverif-2026-11-26.md. H-01, H-03..H-06, H-08 CERRADOS; H-02, H-07, H-09 CERRADOS CON RESERVA (texto). Global: APTO CON RESERVAS.
- «DELETE_PET nunca cuenta»: correcto, sin abuso; redacción exacta propuesta (ignorar la fila pero contar la prueba de vida del target). Contratos (schema, catálogo, máquina y también OpenAPI openAbsenceDispute) aún con el disparador viejo: no bloquea el veredicto, sí un pase corto de /architect antes de T1613.
- Solo lectura; sin [x], APPROVED/LOCKED, commit ni push.

## 2026-11-27 — Segunda revisión Bloque B v0.3 (012, T1630..T1632)
- Verificados en texto H-A1, H-A3, H-A4, M-1, M-2, M-4, B-5: todos CERRADOS (H-A2 sigue PENDIENTE NEO).
- Nuevos MEDIO: N-1 canal de tiempo en el 202, N-2 subida de evidencia bajo candado global, N-3 step-up y id de administrador sin soporte (DM:66 FK users; 011 sin step-up). Discrepo en registrar el intento bloqueado en su contador.
- Veredicto APTO CON RESERVAS. Acta: `.specify/memory/audits/trinity-012-bloqueB-v03-2026-11-27.md`. Sin cambios en contratos, src ni commit.

## 2026-11-27 — Re-auditoría Bloque B v0.4 (012, T1630..T1632)
- Orden nuevo de openChipDispute sin oráculo ni DoS nuevo; 503 de subida idéntico; 411 y CHIP_MULTIPART sin existencia.
- Cerrados N-2, B-N1, B-N3, B-N4, B-N5; abiertos N-1 y H-A2 (PENDIENTE NEO), N-3 (T1648); B-N2 parcial. Nuevos: 5 BAJO (B-N8..B-N12).
- Veredicto APTO CON RESERVAS. Acta: `.specify/memory/audits/trinity-012-bloqueB-v04-2026-11-27.md`. Sin cambios en contratos ni commit.

## 2026-11-27 — Revisión Bloque C (012, T1651)
- Contratos care.openapi + 3 schemas DRAFT 0.1.0: IDOR, aislamiento por hogar, careUntil, idempotencia por autor, límites H-C1, campos clínicos, H-C3.
- Veredicto APTO CON RESERVAS: 7 MEDIO (mismo autor con status distinto, nivel que revive al reinvitar, borde careUntil, orden 404/403/409, roles READER sin regla, SKIPPED que bloquea, cursor/filtros del historial), 8 BAJO, 3 INFO.
- Acta: `.specify/memory/audits/trinity-012-bloqueC-T1651-2026-11-27.md`. Solo lectura; sin commit.

## 2026-11-27 T1647 (Bloque B, 012)
- Re-auditoria solo lectura de admin-disputes.routes, chip.routes, chip-dispute-admin-views y casos de uso de arbitraje.
- Veredicto APTO CON RESERVAS; T-01 (step-up) = DEUDA-012-ADMIN-STEPUP-PROD; T-02..T-06 menores/info.
- Semgrep (p/typescript + p/security-audit) rc=0, 0 hallazgos; sin script en scripts/.
- Acta: .specify/memory/audits/trinity-012-bloqueB-T1647-2026-11-27.md

## 2026-11-27 T1671 [GOV] seguridad QR Bloque D
- Veredicto CUMPLE CON RESERVAS: T-01 instance constante, T-02 redactSecrets /e/, T-03..T-07 medias.
- Huecos 1..8 decididos; piden Neo: hueco 2 (ADMIN de hogar) y hueco 4 (constantes de tasa privada).
- Acta: .specify/memory/audits/trinity-012-T1671-2026-11-27.md

## 2026-11-27 - T1671 r2 (re-auditoria Bloque D #32, DRAFT 0.2.0)
- Solo lectura. Veredicto CUMPLE CON RESERVAS: T-01..T-10 y huecos 1..8 cerrados en contrato; 0 ALTA.
- Nuevos: N-01 MEDIA (redactSecrets por 43 chars deja pasar tokens truncados/extendidos), N-02 MEDIA (reconciliacion perezosa sin orden/idempotencia; GET que escribe no es riesgo alto), N-03 MEDIA (ediciones de alergias sin aviso derivado), N-04..N-08 BAJA, N-09 INFO.
- Acta: .specify/memory/audits/trinity-012-T1671-r2-2026-11-27.md

## 2026-11-28 T1683 (re-auditoria INV-QR12-001..008, Bloque D, HEAD 6581ea2)
- Solo lectura. Veredicto CUMPLE CON RESERVAS: 0 CRITICA/ALTA/MEDIA de codigo; R-01 = DEUDA-012-TERRAFORM-LOGS-QR (logging.tf sin exclusion; PHONE_HMAC_KEY sin aprovisionar) condicion de release; B-01 sin prueba de Host forjado; B-02 limiter en memoria.
- Semgrep (p/typescript + p/security-audit) 18 archivos, 0 hallazgos; vitest emergency-012 219/219.
- Acta: .specify/memory/audits/trinity-012-T1683-2026-11-28.md

## 2026-11-28 T1691 (revision DRAFT 0.1.0 ENM-005-E, Bloque E #81, HEAD f4f9ed1)
- Solo lectura. Veredicto CUMPLE CON RESERVAS: 0 CRITICA, 1 ALTA, 4 MEDIA, 4 BAJA, 5 INFO. INV-VET12-001..004 cumplidos en lo normativo.
- ALTA-1: el lector actual trata todo scope != PET como HOUSEHOLD (shared-view-use-cases.ts, share-link-use-cases.ts mayRevoke, share-access.ts); un PETS en pod viejo expondria todas las mascotas; anexo §7 ("404 uniforme") es falso. MEDIA: 403 vs 422 oraculo, withdraw 204/404 contradictorio, PET_WITHDRAWN vs CHECK event_type de audit (T1692), lista con 0 visibles.
- Punto abierto 1 (ID repetido): recomiendo ratificar rechazo con mismo 422 (sin uniqueItems en PetIdList).
- Acta: .specify/memory/audits/trinity-012-T1691-2026-11-28.md

## 2026-11-28 T1691 r2 (re-auditoria ENM-005-E DRAFT 0.2.0, Bloque E #81)
- Solo lectura. Veredicto CUMPLE CON RESERVAS: ALTA-1, MEDIA-1..4 y BAJA-1..4 previos cerrados; 0 ALTA nuevas. PN-08 con revocacion del enlace entero: sin oraculo ni fuga.
- Nuevos: MEDIA-N1 (Uuid de 001 solo minusculas: la normalizacion y la prueba LK-06 son inalcanzables), BAJA-N2 (preview vacio vs schema), BAJA-N3 (disparador de rol vs creacion sin candado de hogar), BAJA-N4 (inventario de ramas por scope y bandera sin definir), BAJA-N5 (title no neutro), 4 INFO.
- Acta: .specify/memory/audits/trinity-012-T1691-r2-2026-11-28.md

## 2026-11-28 T1691 r3 (re-auditoria delta ENM-005-E DRAFT 0.2.1, Bloque E #81)
- Solo lectura. Veredicto CUMPLE CON RESERVAS: 0 CRITICA/ALTA/MEDIA, 4 BAJA, 3 INFO. MEDIA-N1 (mayusculas) y BAJA-N2 (vacio vs ausente) cerradas; bandera fail-closed y switch default-deny de las cuatro funciones confirmados contra src/.
- BAJA-R3-1 parseo/semantica de la bandera (loadAppConfig falla con valor invalido, es por proceso no por peticion); R3-2 posicion del chequeo OFF en el orden de errores; R3-3 "ya normalizados" residual en §6; R3-4 inventario §8.5 omite shared-view-use-cases.ts.
- Acta: .specify/memory/audits/trinity-012-T1691-r3-2026-11-28.md
