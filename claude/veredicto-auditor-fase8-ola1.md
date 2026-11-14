# Veredicto Oracle — Fase 8, primera ola (T297 a T301) y arreglo V12

Fecha: 2026-11-14. Rama 002-plataforma-v21. Modo auditoría: sin cambios en src/, tests/, specs/ ni contratos; sin commit ni push. Verificado en disco, no por informes.

## Veredicto por tarea

| Tarea | Veredicto | Evidencia |
|---|---|---|
| T297 (V10, V11) | CUMPLE | backup-token.security.spec.ts, 10 pruebas, todas con [REQ-ACC-002][SC-014] y, donde aplica, [ERR-ACCOUNT-CONFIRMATION-MISMATCH]. Cubre reutilización, carrera 2 y 10 peticiones, 1 ms antes y 10 min exactos, sustituido, ajeno, ausente, mal formado, cuerpo 409 idéntico byte a byte, token real de /api/backup/export. |
| T298 (V12, V13) | CUMPLE | audit-secret.security.spec.ts (11 pruebas, arranque real del servidor como proceso hijo con entorno mínimo: ausente, vacío, corto, no hex/impar, secreto de fixtures, clave fija de desarrollo, sin NODE_ENV; valor ausente de stdout/stderr y de error.message/stack/JSON). session-csrf.security.spec.ts +53 líneas, 4 pruebas V13 con [REQ-AUTH2-003][STATE-AUTH-SESSION-001]: otras sesiones 401 en lectura y escritura, solo se revocan las de esa persona, cambio fallido no revoca, cookie robada sigue revocada. Cita INV-AUD-001 y SC-014 en V12. |
| T299 (V14, V15, V16) | CUMPLE CON RESERVA | session-audit-import.security.spec.ts. V14: 24 h exactas con actividad cada 29 min 59 s y cuatro personas; cookie vieja no revive; login nuevo con tope propio. V15: userId eliminado ausente en minúsculas, mayúsculas y sin guiones en audit_log y volcado completo, y en lo que ven los demás. V16: 3 versiones x 8 falsificaciones (24 casos), con esquemas cerrados y compatibilidad 2.0.0 declarada; verifica base, auditoría, membresías y asignaciones ajenas. Reserva: "lo rechazado no renueva" solo ejerce CSRF 403 sin sesión previa válida, cookie inventada, revocada y vencida; NO ejerce 403/404/422 de una sesión válida (ver decisión D1). El título lo declara "CSRF (403)", sin sobrepromesa, pero la tarea dice "lo rechazado". Los títulos citan INV-AUTH2-002, INV-AUD-001, SC-014, REQ-BACKUP2-002, ERR-BACKUP-SCHEMA-INVALID, ERR-AUTH-UNAUTHENTICATED. |
| T300 (9 vectores x 4 roles) | CUMPLE CON RESERVA | nine-vectors-four-roles.security.spec.ts, it.each por los 4 roles en V1 a V8 (IDOR 13 acciones, hogares ajenos, sin sesión, expirada 30 min exactos y 1 ms antes, CSRF, enumeración por tiempo contando verify, prototype pollution, 10 MB + 1 byte con ERR-BACKUP-PAYLOAD-TOO-LARGE). V9 XSS es una sola prueba que recorre los 4 roles (no it.each; aceptable). Reserva menor: V1/V3/V4/V5 declaran "todas las operaciones servidas"; el inventario es el del harness, no se verificó contra la lista completa de rutas de openapi (no se auditó). Títulos citan INV-ACC2-001/002, INV-AUTH2-002, INV-AUTH-006/007, ERR-*; V7, V9 citan SC-003 solo en el describe. |
| T301 | CUMPLE CON RESERVA | ui-invitation-logs.security.spec.ts, 8 pruebas, todas citan ID. Interfaz sin segundo plano: exploración estática de src/presentation/web con guardia de no vacuidad (>=25 fuentes). Invitación: cuerpo, cabeceras y longitud idénticos para 6 usernames (existe, no existe, ya miembro, propio, largo); 403/404 idénticos. Escáner de logs: 18 valores sembrados (userId, username, correos, token, cookies, contraseñas, secreto, hash) con PRODUCTION_LOGGER_OPTIONS reales y mínimo 12 líneas capturadas. Reserva: la prueba de interfaz es análisis estático por regex (no detecta una petición disparada por otra vía, p. ej. un cliente nuevo que no sea fetch); la de latencia es estadística (ver sección 5). |

## Calidad de oráculos

- `bash scripts/verify-oracles.sh`: `[SDD Oracle Gate] Archivos analizados: 116; oráculos débiles: 0` / `Resultado: CUMPLE`.
- Lectura manual: sin toBeTruthy, toBeDefined, skip, todo, only, expect(true), ni comentarios que anulen pruebas. Los 3 try/catch (audit-secret líneas 59, 123, 141) NO tragan: el primero es `process.kill` de grupo con respaldo a `child.kill`; los otros dos devuelven el error o un marcador y el resultado se afirma con toEqual (y `failure` lanza si no hubo excepción). Aserciones por toEqual de tuplas con valores concretos. Sin hallazgos.

## Arreglo V12 (src/infrastructure/config/app-config.ts, git diff)

a) Mensaje de error: AppConfigError solo recibe la lista de nombres de variables; el mensaje es "Configuración inválida: ARGOS_AUDIT_HMAC_SECRET. Revisa .env.example." sin valor. Probado en audit-secret (message, stack, JSON, salida del proceso). CUMPLE.
b) Secretos en claro nuevos: ninguno. `'de'.repeat(32)` ya estaba en HEAD (línea 105 de HEAD). El secreto de fixtures se compara por huella SHA-256 (FIXTURE_AUDIT_SECRET_SHA256, dato no reversible). CUMPLE.
c) NODE_ENV=test sin cambio: ambas ramas nuevas llevan `env['NODE_ENV'] !== 'test' &&`; solo se añade `import createHash`. La rama de secreto nulo no cambia. Security 264/264 lo respalda. CUMPLE.
d) Validaciones previas (ausente, vacío, corto, no hex, longitud impar) intactas: el patrón AUDIT_SECRET_PATTERN y la condición nula no se tocaron; el rechazo de públicos se suma por `||`. Precedencia correcta (ternario contiene el `||`). CUMPLE.
Observación (Baja): la denylist es de dos valores exactos (insensible a mayúsculas); no detecta otros secretos débiles de 32 bytes (p. ej. 'aa'.repeat(32)). Es un suelo mínimo, no entropía. No bloquea.

## Gates (resultados literales)

| Gate | Resultado |
|---|---|
| `bash scripts/verify-oracles.sh` | Archivos analizados: 116; oráculos débiles: 0 — Resultado: CUMPLE |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/security` | Test Files 13 passed (13); Tests 264 passed (264) |
| `npx vitest run tests/unit/presentation tests/unit/infrastructure-adapters.spec.ts` | Test Files 4 failed / 7 passed (11); Tests 12 failed / 90 passed (102). Los 12 fallos: 11 de presentación (components.spec 8, validation.spec 1, view-model.spec 2) y 1 de scrypt (verify con hash de N excesivo). |
| `npx vitest run tests/security/exploits/ui-invitation-logs.security.spec.ts` x5 | 5 de 5 ejecuciones: 8 passed (8) |

Nota: los 12 coinciden en familia y archivo con los heredados de claude/veredicto-auditor-fallos-gate-t296.md (11 presentación + 1 scrypt); cero fallos en otros archivos. Reserva: no comparé cada nombre uno a uno con la tabla de T296.

## Hallazgos por severidad

- Crítica: ninguno.
- Alta: ninguno.
- Media:
  - M1 (T299): "lo rechazado no renueva" no cubre 403, 404 ni 422 con sesión válida; la tarea no queda demostrada para esos casos y depende de D1.
- Baja:
  - B1 (T301): prueba de interfaz sin segundo plano es estática por regex; falso verde si una petición se hace por un mecanismo no listado.
  - B2 (V12): denylist de 2 valores, sin umbral de entropía.
  - B3 (T300): inventario de operaciones "servidas" no contrastado con openapi en esta auditoría.
  - B4: archivos sin seguimiento ajenos a esta ola en el árbol (.playwright-mcp/, gate-T296-output.txt, logos.json, scripts/logos.py) y tasks.md/CLAUDE.md/constitution.md modificados sin commit: fuera de alcance, no auditados.

## Riesgo 5: prueba de latencia de la invitación

Dictamen: ACEPTABLE tal como está, con reserva documentada; no hace falta reforzarla ahora.
- Es robusta frente a ruido: usa mediana de 40 muestras por rama, intercaladas (existente/inexistente alternados, mismo ruido de fondo), 5 iteraciones de calentamiento y límites de ritmo subidos; la tolerancia combinada (<=5 ms absolutos O <25 %) hace casi imposible el falso rojo en una llamada en proceso de ~1 ms. 5 de 5 ejecuciones en verde.
- Su límite: con ese umbral NO detecta una fuga real de submilisegundo (un `SELECT` extra), solo una divergencia grande (p. ej. un scrypt o espera solo en una rama). La defensa real es estructural y está probada aparte: respuesta 202 idéntica byte a byte y el use case inviteMember devuelve null sin ramas observables (log del Keymaker).
- Si Neo quiere endurecerla: contar operaciones en lugar de milisegundos (número de consultas/lecturas del repositorio por rama, como ya se hace con `verify` en V6), que es determinista. Recomendación: opcional, deuda baja.

## Decisiones para Neo

- D1: si una petición con respuesta 403, 404 o 422 de una sesión válida debe renovar la actividad. Hoy el contrato la renueva (la sesión ya fue autenticada). La prueba de session-audit-import.security.spec.ts (línea 83) NO fija esa conducta: solo afirma que no renuevan CSRF sin sesión válida, cookie inventada, revocada o vencida. No es decisión del Oracle ni del Keymaker. Opciones: (a) mantener (una persona que actúa y recibe 404 sigue activa), (b) no renovar con 4xx de autorización/validación. Si se elige (b) hay que enmendar el contrato y añadir la prueba.
- D2 (informativa): T297 a T301 siguen en `[ ]` en tasks.md; el techo de los agentes es REVIEW. Marcar COMPLETED es potestad de Neo.

## Sobre

DE: Oracle (SDD Auditor) / PARA: Morpheus; escala a Neo solo D1.
