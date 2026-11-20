# Acta Oracle — Feature 007, lote UI (T1003, Bloques A, B, D, E, F)

Fecha: 2026-11-19. Rama `007-ux-ficha-mascota-fallecimiento` @ `4fc480a` (sobre `2862bed`). Worktree limpia salvo `node_modules`.
Veredicto: **PASS CON OBS** (no bloquea el lote; 1 prueba roja real y 1 E2E rojo a 1024 px por la misma causa; tareas pendientes listadas).

## Tareas

| Tarea | Clase | Evidencia |
|---|---|---|
| T1003 | PARCIAL | `prototipos/date-field.html` existe; falta aprobación visual de Neo (`log-sati.md` 2026-11-19). Desviación menor: el prototipo trae separadores, `DateField.tsx` no. |
| T1031 | HECHA | `t1031-date-segments-007.spec.ts` (26 it) verde; en rojo contra `src` de `2862bed`. |
| T1032 | HECHA | `src/presentation/web/date-segments.ts`: dos funciones puras (`applySegmentEdit`, `parseDateText`), sin DOM. |
| T1033 | HECHA | `t1033-date-field-007.spec.ts` verde; en rojo contra `2862bed` (sin fieldset). Cubre fieldset/legend, aria-label, 44 px, ISO. |
| T1034 | HECHA | `DateField.tsx` + `Field.tsx` delega `type="date"`; `package.json` sin cambios. |
| T1035 | PARCIAL | E2E `fecha-segmentos-007.spec.ts` 13/13 verde en Chromium. Falta Firefox, 390 px y emulación Android: `playwright.config.ts` solo tiene chromium y webkit opcional; solo Chromium instalado. Sin evidencia de revisión `/sati` del componente real. |
| T1036 | NO HECHA (condicional) | Sin evidencia de WebKit/Android; correcto no ejecutarla aún. |
| T1037 | HECHA con 1 rojo | 13 it; contra `2862bed` en rojo. 1 it sigue rojo en HEAD (`scrollIntoView ... inline: 'nearest'`, línea 107). |
| T1038 | PARCIAL | 7 pestañas, `ActiveTab`, sección final retirada. Falta `scrollIntoView` al cambiar pestaña (prueba roja de T1037). |
| T1039 | HECHA | t611, t732, `archivos-clinicos.spec.ts` y e2e de medios actualizados; unit verdes; E2E archivos-clinicos verde. |
| T1040 | PARCIAL | E2E `pestanas-007.spec.ts`: 320 y 1280 px verdes; **1024 px rojo** (pestaña final fuera del tablist, desborda). Misma causa que T1038. |
| T1046 | HECHA | `t1046` (10 it) verde; en rojo contra `2862bed`. |
| T1047 | HECHA | `showsFormOpenByDefault`, `showsBareForm`, `OPTION_B_MODULES` en `records.ts`; `frozenOpen` conservado; Consultas/Parámetros sin cambio. |
| T1048 | PARCIAL | Cambios en e2e existentes; `pet-dashboard.spec.ts` no verificable: falla en línea 31 (etiqueta «Usuario (minúsculas» ya obsoleta, **preexistente en `2862bed`**, no es de 007) y deja 8 pruebas sin ejecutar. |
| T1049 | HECHA | `registrar-primer-registro-007.spec.ts` 5/5 verde (Peso, Medidas, Vacunas, Desparasitaciones + Consultas/Parámetros). |
| T1042 | HECHA | `t1042` (5 it) verde; rojo contra `2862bed`. |
| T1043 | HECHA | `grep` en `src` y `tests`: «Alertas sanitarias» solo aparece en la propia aserción negativa. |
| T1044 | HECHA | `AlertsCard` sin `canRegisterWeight`/`onRegisterWeight`; título «Estado de vacunación». |
| T1045 | NO HECHA | Sin evidencia en disco de revisión visual `/sati` (320/1024/1280). |
| T1051 | HECHA | `t1051` verde; rojo contra `2862bed` (`scenePendingMessage is not a function`). |
| T1052 | HECHA | `scenePendingMessage` en `scene-view.ts`; `SceneBlock.tsx` lo usa; texto literal D7-01; sin invitar a regenerar si `canRegenerate` es falso (EDGE-007-008). |
| T1053 | HECHA | t875 actualizado; sin «cambios pendientes:» ni `scenePendingText` en `src` ni tests (salvo aserciones negativas); sin E2E que lo espere. |

## TDD
El commit es un único WIP (`4fc480a`) con pruebas y código juntos: el orden rojo→verde **no es demostrable por historial**. Prueba sustituta: `src` de `2862bed` + `tests` de HEAD → 32 pruebas rojas en t1031/33/37/42/46/51 (5 de 6 archivos rojos; t1031 pasa por no existir cambio previo equivalente en su alcance).

## Gates (salidas reales)
- `npx tsc --noEmit`: rc 0.
- `npx vitest run` de 007 + afectadas (14 archivos): 182 pasan, 1 falla (t1037 `scrollIntoView`).
- `bash scripts/verify-oracles.sh`: rc 0, 389 archivos, 0 oráculos débiles.
- `node scripts/scan-secrets.mjs repo`: rc 0, 0 hallazgos.
- `npm run test:gate` con PostgreSQL 17 real (127.0.0.1:55432): compile/traceability 002, 003, 006 CUMPLE, oráculos CUMPLE, tsc OK; vitest 336 de 337 archivos, 5380 de 5382 pruebas (1 falla, 1 omitida); **RC=1** solo por la prueba t1037.
- `verify-traceability.sh --feature 007`: rc 2, «Fuente ausente: contracts/errors/error-catalog.json». **Esperado hasta T1013.**
- Playwright Chromium (puertos 3187/5187): 007 y archivos 35 de 37 verdes en total; rojos: pestanas-007 a 1024 px (causa de T1038) y pet-dashboard:31 (preexistente).

## Para el keymaker
1. T1038/T1040: `scrollIntoView({ block: 'nearest', inline: 'nearest' })` de la pestaña activa en `PetDashboard.tsx` (cierra el unit rojo y el E2E de 1024 px).
2. T1035: proyectos Playwright Firefox, viewport 390 px y Android Chrome (con autorización de instalar navegadores, PE-04); `/sati` sobre `DateField` real.
3. T1045: verificación visual `/sati` de la tarjeta.
4. T1048: tras corregir la etiqueta preexistente de `pet-dashboard.spec.ts:35` (fuera de 007; Morpheus decide), reejecutar el archivo.
5. T1003: aprobación visual de Neo.
6. T1036: solo si T1035 lo demuestra.

Sin commit, sin `[x]`, sin push.
