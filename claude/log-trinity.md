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
