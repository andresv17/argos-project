# Acta Oracle — 009 Fase 5a ola 6: revalidación T1269 (2026-11-23)
Veredicto: PASS CON OBSERVACIONES. Sin [x], sin commit, sin push; contratos y src/generated intactos; sin git stash.

## Compuerta real
- tsc --noEmit: exit 0. verify-oracles: CUMPLE (510 archivos, 0 débiles, exit 0).
- vitest t1269-editor-parametros-009.spec.ts: 12/12.
- playwright chromium en serie (puertos 3141/5241): 51/51 (t1269 + t1235 + t1250).

## Revisión del cambio de mensajes (sati, ParametersPanel.tsx)
- Contrato 412: failWrite PRECONDITION sigue fijando SAVE_PRECONDITION, cierra confirmación del interruptor, devuelve foco y llama load(false). Solo cambió dónde se pinta (scope album|toggle|reset). Sin cambio de contrato HTTP.
- Errores: inline() pinta <p role="alert"> dentro de la tarjeta; el error de campo (album-error) conserva role=alert y aria-describedby.
- Éxito: <p> visible dentro de la tarjeta + contenedor <div role="status" class="sr-only"> con el mismo texto (anuncio conservado). Aprobado. Los e2e 412/500/reinicio/axe/200 % pasan.

## Atribución de los 2 archivos de vitest fallidos (corrida completa: 2 failed | 6428 passed | 233 skipped; 431 archivos ok)
1. tests/integration/api/t1235-portal-admin-ui-009.api.spec.ts:117 — CAUSADO por T1269 (no preexistente). Error real: "expected '/**\n * Portal /admin (T1235…' not to match /adminId|idleExpiresAt/". El test concatena src/presentation/admin/* y prohíbe esos identificadores. En HEAD 895e233 ningún archivo de ese directorio los contiene (verificado con git show); ahora aparecen en ParametersPanel.tsx (prop adminId), parameters-view.ts (authorLabel) y AdminPortal.tsx (lectura de la sesión). No se pintan (INV de «sin ids» se cumple y el e2e lo comprueba), pero el guard textual es grueso. Pasa en HEAD, falla con T1269.
   Remedio (no aplicado; no relajo aserciones): architect/keymaker deciden entre renombrar el identificador (p. ej. viewerId/selfId) o afinar el guard a "no se renderiza" (p. ej. buscar {session.adminId} en JSX). Preferible renombrar: no debilita el guard.
2. tests/security/t1238-portal-admin-009.security.spec.ts:333 — PREEXISTENTE / flaky de tiempo, no causado por T1269. Error real: "medianas ms: 0.206, 0.113, 0.204, 0.076, 1.129: expected false to be true" (tolerancia hi-lo<1 o hi/lo<3; medianas sub-ms ruidosas bajo carga de la corrida completa). Aislado pasa 28/28 tres veces seguidas. El log de oracle (T1248) ya lo registraba como «t1238 flaky». Ninguno de los archivos T1269/T1268/T1262/T1264/T1266/T1293/T1297 toca esa ruta (GET /api/admin/session). No se verificó en HEAD vía stash por seguridad (cambios sin commit); evidencia = 3/3 verde aislado + antecedente documentado.

## Observaciones
- OBS-A: t1235-api falla por T1269 (arriba); debe resolverse antes de commit/test:gate.
- OBS-B: t1238 timing flaky con carga; tolerancia sub-ms frágil (sugerir piso absoluto mayor; decisión de architect).
- Pendientes previos (OBS-2..4 de ola 5) cubiertos por keymaker: el e2e 412 del interruptor ahora verifica cierre de confirmación y foco.
