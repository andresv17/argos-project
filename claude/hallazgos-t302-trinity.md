# Hallazgos T302 — Trinity (batería de 16 vectores V1..V16) — 2026-11-14

Alcance: solo lectura y ejecución. No se tocó src/, specs/, contratos, tests/ ni logos.json. Sin commit ni marca de T302.

## 1. Inventario de los 16 vectores

Archivo base: `tests/security/exploits/`. Cada vector tiene prueba; ninguno queda sin cobertura.

| ID | Archivo | Pruebas | Resultado |
|----|---------|---------|-----------|
| V1 IDOR por rol (SC-003, INV-ACC2-001/002) | nine-vectors-four-roles.security.spec.ts (+ idor-matrix.security.spec.ts, 61) | 4 | pasa |
| V2 hogares ajenos por rol | nine-vectors-four-roles | 4 | pasa |
| V3 sin sesión por rol | nine-vectors-four-roles | 4 | pasa |
| V4 sesión expirada por rol | nine-vectors-four-roles | 4 | pasa |
| V5 CSRF por rol (INV-AUTH-007) | nine-vectors-four-roles (+ session-csrf, 14) | 4 | pasa |
| V6 enumeración por tiempo (INV-AUTH-006) | nine-vectors-four-roles (+ credentials, 12) | 4 | pasa |
| V7 prototype pollution | nine-vectors-four-roles (+ malicious-input, 13) | 8 | pasa |
| V8 respaldo > 10 MB | nine-vectors-four-roles (+ backup-hostile-input-red, 38) | 4 | pasa |
| V9 XSS almacenado | nine-vectors-four-roles | 1 | pasa (cobertura mínima, ver M-1) |
| V10 token de respaldo reutilizado/simultáneo | backup-token.security.spec.ts | 4 | pasa |
| V11 token caducado/ajeno/ausente/sustituido | backup-token.security.spec.ts | 6 | pasa |
| V12 secreto de auditoría ausente/corto/de prueba | audit-secret.security.spec.ts | 11 | pasa |
| V13 cookie de otra sesión tras cambiar contraseña | session-csrf.security.spec.ts | 4 | pasa |
| V14 actividad constante <= 24 h; lo rechazado no renueva (D1 incluida) | session-audit-import.security.spec.ts | 6 (la ejecución final lleva 3 casos D1) | pasa |
| V15 cero apariciones del userId eliminado | session-audit-import | 3 | pasa |
| V16 importación con ownerUserId/role/asignaciones falsos (1.0.0, 2.0.0, 3.0.0) | session-audit-import | 24 | pasa |

Archivos de apoyo sin etiqueta V: access-control (13), log-redaction (3), ui-invitation-logs (8), backup-chaos (10), backup-chaos-child.ts y security-harness.ts (auxiliares).
Sin `it.skip`, `it.todo` ni pendientes (0 pending, 0 todo).

## 2. Batería (resultado literal)

Ejecución 1 (`npx vitest run tests/security`):
```
 Test Files  13 passed (13)
      Tests  264 passed (264)
```
Ejecución con reporter json, a mitad de edición de Keymaker: 266 pasan, 1 falla (V14 D1, 404 inexistente: `contrato OpenAPI de GET /api/pets/99999999-... expected [ Array(1) ] to deeply equal []`).
Seis ejecuciones posteriores de la batería completa, tras la edición de la prueba (mtime 16:28:39):
```
 Tests  267 passed (267)   (x6, 0 fallos)
```
Y tres ejecuciones aisladas de session-audit-import: 33/33.
Conclusión: estado estable 267/267, 0 fallos. El fallo único se explica por el cambio concurrente de la prueba (el archivo se modificó a las 16:28:39, el número de pruebas pasó de 264 a 267 y la versión nueva usa `contract: false` en esos envíos). No se reprodujo en 9 ejecuciones.

## 3. SAST

- Semgrep: NO instalado (`which semgrep` sin resultado). No se instaló nada. Las 4 reglas `.yml` de `tests/security/sast-rules/` no pudieron ejecutarse con su motor.
- Linter de seguridad: el repo no tiene ESLint ni script de SAST en package.json (solo `tsc`, vitest, stryker, playwright).
- Sustituto manual (grep equivalente a cada patrón sobre `src/**/*.ts(x)`, con las mismas exclusiones de las reglas):
  - argos-no-dynamic-code (eval, new Function, temporizador con texto): 0 coincidencias.
  - argos-no-dangerously-set-inner-html / raw-html-sink: 0 coincidencias.
  - argos-no-process-env-outside-config: 0 fuera de `src/infrastructure/config/`.
  - argos-no-entropy-outside-adapters: 0 fuera de `src/infrastructure/adapters/` y `src/generated/`.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- El grep no es un AST: no sustituye a Semgrep (alias, desestructuración, `globalThis.crypto`).

## 4. Sentinels (explotación automatizada)

Se ejecutaron los vectores solo a través de la suite (app.inject sobre el Fastify real con SQLite en memoria, sin tráfico externo). Los 9 originales cubren los 4 roles. Limitación: no hay servidor real escuchando en red ni fuzzing con tráfico fuera de la suite (por instrucción); el comportamiento de cabeceras de proxy/TLS y cookies `Secure` en producción solo se prueba por inyección. No se levantó ningún servidor ni puerto.

## 5. Hallazgos

Caso A (Keymaker, sin cambio de contrato): ninguno bloqueante. Ningún fallo estable.
Caso B (Architect, cambia contrato/spec): ninguno.

Observaciones menores, no bloqueantes:
- M-1 (Caso A, refuerzo de prueba): V9 XSS en `nine-vectors-four-roles.security.spec.ts` (describe en línea 252) tiene 1 sola prueba frente a 4 de los demás vectores; no itera por los 4 roles. Valorar ampliar (SC-003).
- M-2 (herramienta): Semgrep ausente; las 4 reglas SAST solo se verifican por grep manual. Requiere decisión de Neo si se quiere instalar (dependencia de nivel 2); no se instaló.
- M-3 (proceso): el fallo transitorio de V14 D1 coincide con una edición concurrente; conviene que Oracle confirme 267/267 con el árbol estable.
- Referencia del mapa de trazabilidad: T302 cita SC-003, INV-AUTH-007 y ERR-AUTH-CSRF-REJECTED; V5 (CSRF, 4 pruebas por rol) y session-csrf (14) los cubren y pasan.

DE: Trinity (Seguridad, criptografía y SAST)
PARA: Morpheus (Capitán del Nebuchadnezzar y Tech Lead)
ESTADO: Validación requerida
DETALLE: 16/16 vectores con prueba; batería 267/267 (13 archivos) estable en 6 corridas; un fallo transitorio por edición concurrente de V14 D1, no reproducible. SAST: Semgrep no instalado, grep manual de las 4 reglas con 0 coincidencias en src/, npm audit 0 vulnerabilidades. Hallazgos Caso A: solo M-1 (V9 con 1 prueba), no bloqueante; Caso B: ninguno.
SIGUIENTE PASO RECOMENDADO: Ninguna acción obligatoria; opcionalmente Keymaker (Caso A) amplía V9 a los 4 roles, y Neo decide sobre Semgrep. Oracle valida T302 en disco; Neo la marca.
