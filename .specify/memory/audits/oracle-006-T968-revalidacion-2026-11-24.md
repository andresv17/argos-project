# Oracle 006 — Revalidación T968 (R-1 / R-2 de /rama) — 2026-11-24

Rama `fix/006-escena-defectos-uso-real`, cambios sin commit. Compara con `oracle-006-fix-escena-2026-11-24.md`. Dictamen: **PASS CON OBS**.

## 1. R-1 (C-1, opción a) — PASS
- `src/application/use-cases/scene-run-use-case.ts:146-155`: por cada mascota no `REMOVE`, `consented = pet !== null && (!svc.realDriver || hasActiveConsent(r, svc, pet.ownerUserId, 'PET_PHOTOS'))`; si no, la biografía es `null` y no entra en el prompt ni en el payload (`buildScenePayload` recibe el mapa filtrado).
- Es la misma compuerta que la foto en `loadLiveInputs` (`scene-use-cases.ts:105`): `!svc.realDriver || hasActiveConsent(..., pet.ownerUserId, 'PET_PHOTOS')`, mismo helper. Con driver simulado viaja (igual que la foto).
- La biografía sigue sin registrarse ni guardarse: solo aparece en el mapa local; `SnapshotPet` (`scene-use-cases.ts:107`) no tiene campo de biografía; no hay llamada a logger con ella.
- Prueba nueva `tests/unit/t968-biografia-consentimiento-escena-006.spec.ts` en verde.

## 2. R-2 (C-2) — PASS CON OBS
- `scene-notice.ts` §4 (Vertex, línea 52): lectura solo al generar, tránsito, no almacenada en intentos, instantáneas ni registros; el proveedor no la usa para entrenar. §6 (línea 67): editar/borrar la biografía o revocar el consentimiento detiene el envío; la imagen se puede retirar siempre.
- §4 gemini-api (líneas 97-102): NO afirma "no entrena"; lo declara "pendiente de confirmar" (retención, entrenamiento). §6 se hereda del aviso de Vertex.
- OBS-1 (no bloquea): el pendiente de gemini-api es honesto (REQ-ESC6-028, sin fuente) y ese driver es de uso local con clave propia, no el de producción. Debe cerrarse con la documentación oficial antes de activar ese driver fuera de local; la firma de Neo del texto (T958/T968) sigue pendiente.
- OBS-2: la afirmación Vertex "el proveedor no la usa para entrenar" es extensión de los términos citados para imágenes; /rama debe confirmar que la cubren para texto de prompt.

## 3. Versiones — PASS
`notice.ts:9,16` = `'3'` / `'gemini-api-3'`; `scene-notice.ts:16,77` iguales. Sin cambio.

## 4. Gates (literal)
- `npx tsc --noEmit`: rc=0, sin salida.
- `bash scripts/verify-oracles.sh`: 529 archivos, 0 débiles, CUMPLE, rc=0.
- `bash scripts/verify-traceability.sh --feature 006`: 251/251, pureza 0 violaciones, CUMPLE, rc=0.
- `npm run test:gate` (PG 127.0.0.1:55432): corrida 1 rc=1, 1 fallo en `t1238-portal-admin-009.security.spec.ts:333` (prueba de tiempo de medianas sub-ms: 0.121, 0.100, 0.118, 0.074, 1.147; flake ya conocido, ajeno a la 006); aislada 2 veces: 28/28 verde; corrida 2 completa: **rc=0, 451 archivos, 6957 pass, 1 skipped**.

## 5. Árbol
En ámbito: `specs/006-*`, `src/` (domain/scene, application, infrastructure/adapters, presentation/web, generated), `tests/` (unit/security de escena y prompt), `claude/log-*`, registro, `.specify/memory/audits/` (oracle-006-*, rama-T968).
Ajenos al fix (no tocados): `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `playwright.config.ts`, `specs/005-album-archivos-clinicos/tasks.md`; sin seguimiento: `.claude/hooks/logos-stop-guard.mjs`, `.claude/skills/superdesign/`, `.playwright-mcp/`, `Claude outputs/`, `gate-T296-output.txt`, `logos.json`, `logos.json.bk`, `scripts/logos.py`, `scripts/gh-project-sync.mjs`, `tipi-marca.zip`, ~250 actas de otras features en `.specify/memory/audits/`, `claude/handover-morpheus-*`, `claude/inbox-feature-007/008.md`, `claude/decisiones-neo-007-*`, `claude/backlog-fase-4b.md`, `claude/cierre-feature-006-*`, `claude/requerimiento-escena-hogar-pixel-art.md`, `claude/log-link.md`; logs de personajes ajenos modificados (lock, merovingian, mifune, mouse, rama, sati, sentinels, seraph, smith, trinity, neb). Un commit selectivo debe excluirlos.

## 6. Tareas
T961..T969 siguen `[ ]` (ninguna `[x]`); el único `[x]` del bloque es T960 (HUM, previo). OK.

## 7. Spec
`INV-ESC6-010` aún no refleja C-1: deuda de /architect (T969/spec). No contradice el código (la spec permite menos de lo que el código filtra, no más). No bloquea.

## Dictamen
PASS CON OBS: OBS-1/OBS-2 (texto), deuda de spec C-1, flake t1238. Firma de Neo del aviso '3' pendiente.
