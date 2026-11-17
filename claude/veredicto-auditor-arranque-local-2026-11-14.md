# Veredicto Oracle — Reparación de arranque local (2026-11-14)

**Veredicto: APTO** (validado en disco, sin commit)
**HEAD verificado:** `2af8558` en rama `002-plataforma-v21`. Cambios en árbol de trabajo, sin commit.

## Archivos auditados (git diff)
1. `src/infrastructure/http/server.ts` (2 líneas): en `startServer`, `scheduleMaintenance` se invoca antes de `app.listen`. Sin otros cambios.
2. `package.json` (1 línea): script `dev` usa `tsx watch --env-file-if-exists=.env src/infrastructure/http/server.ts`. Ninguna otra clave alterada; JSON válido.

## Evidencia
- Causa del defecto original confirmada: `fb165388` (T266) llamaba `scheduleMaintenance` (que registra `addHook`) después de `listen`.
- Comportamiento de mantenimiento: la pasada inmediata sigue siendo `void` (no bloquea el listen), el intervalo de 24 h sigue con `unref` y `clearInterval` en `onClose`. No se añadieron escrituras de auditoría (ADR-002-14, INV-AUD-001).
- `npx tsc --noEmit`: exit 0.
- `tests/integration/api/audit.api.spec.ts` + `tests/integration/persistence/sqlite-maintenance.spec.ts`: 2 archivos, 21/21 en verde.
- `npm run dev` en vivo: `[api] Server listening at http://127.0.0.1:3100`; `GET /api/auth/me` → 401 (esperado sin sesión); `GET http://127.0.0.1:5173/` → 200. Cero ocurrencias de "Fastify instance is already listening" en el log.
- `.env`: no trackeado por git; ignorado por `.gitignore:7`. No hay secretos (patrón hex de 64 caracteres) en el diff.

## No verificado (declarado)
- Navegación real de las pantallas en navegador (solo se comprobó que el servidor responde; no se revisaron vistas ni flujos de login).
- `npm run test:gate` completo (Decisión P de Neo: no ejecutar; los 26 fallos heredados de la Decisión J no se revisaron aquí).
- Compatibilidad con `node` ≥22.18 del flag `--env-file-if-exists` (requiere 22.9+; el motor declarado es >=22.18 y el local es 22.23.4).

## Traslación para Neo
El arranque local vuelve a funcionar con `npm run dev`, sin exportar variables a mano. Antes de hacer commit, falta solo tu visto bueno; no se ha hecho commit ni push.

RECOMMENDED NEXT STEP: Neo decide si commitea estos dos archivos (commit local, sin push) y luego abre `http://127.0.0.1:5173/` para revisar las pantallas.
