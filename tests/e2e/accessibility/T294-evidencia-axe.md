# T294 - Evidencia axe-core a 320, 768, 1024 y 1280 px (REQ-UI2-008, SC-005)

Fecha: 2026-11-14. Autora: Seraph (Access Gatekeeper). Rama 002-plataforma-v21.

## Comando exacto
```
set -a; . ./.env; set +a; E2E_API_PORT=3180 E2E_WEB_PORT=5180 npx playwright test tests/e2e/accessibility --reporter=list
```
(Los valores de `.env` no se reproducen.)

## Resultado literal
`14 passed (32.8s)` - 0 fallados.

## Reglas axe
`@axe-core/playwright` con tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. El helper `accessibilityFindingsAt` (tests/e2e/visual/e2e-support.ts) recoge toda violación `critical` o `serious` y el desbordamiento horizontal; cada prueba exige lista vacía. No se modificó la lógica ni se relajó ninguna regla. No se añadieron casos: la suite ya cubría los cuatro anchos.

## Cobertura a 320, 768, 1024 y 1280 px (Rebanada 6, T285)
| Caso | Ruta | critical | serious | Desbordamiento |
|---|---|---|---|---|
| mascotas | / | 0 | 0 | 0 |
| hogares | /households | 0 | 0 | 0 |
| respaldo | /backup | 0 | 0 | 0 |
| ficha de mascota | / (Argos) | 0 | 0 | 0 |
| login | /login | 0 | 0 | 0 |
| registro | /register | 0 | 0 | 0 |
| cuenta (zona de peligro) | /cuenta | 0 | 0 | 0 |
| sin desbordamiento a 320 px | /, /households, /backup | n/a | n/a | 0 |

## Cobertura adicional (320, 1024 y 1280 px, estados con contenido)
Login con error, registro con errores, los 6 módulos de la ficha con semáforo, formulario nueva mascota con errores, edición, diálogo de eliminación, hogares OWNER e invitado, contexto de hogar MEMBER, respaldo con archivo inválido: 7 pruebas, 0 critical, 0 serious.

## Veredicto
Sin hallazgos critical/serious. Evidencia limpia para REQ-UI2-008 y SC-005. Nota: la comprobación es automática (axe); no sustituye la revisión visual de Neo/Sati (T295).
