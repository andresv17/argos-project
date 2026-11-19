# Alineación de prosa spec/plan al código en disco — cierre Fase 13 (006)

Autor: /architect. Fecha: 2026-11-19. Estado: DRAFT. Solo documentación; sin cambios en src/, tests/, src/generated/, contratos ni vite.config.ts.

## Archivos modificados
- specs/006-escena-hogar-pixel-art/spec.md (REQ-ESC6-016, REQ-ESC6-019, REQ-ESC6-034, SC-ESC6-115, SC-ESC6-135, fila D6-21, nuevo registro de enmiendas al final)
- specs/006-escena-hogar-pixel-art/plan.md (§5.3 frase del hogar y PIXEL_REDRAW_RULE; §5.7 contador)
- claude/log-architect.md

## Texto vigente (citado de src/domain/scene/build-image-prompt.ts)
- Frase del hogar con foto: «Draw a brand-new 32-bit retro video-game isometric cutaway room diorama, like a classic pixel-art indie game, inspired by the furniture, plants, color accents, and general room layout of ${photoRef}.»
- PIXEL_REDRAW_RULE: «Render every wall, floor tile, piece of furniture, plant, and pet as crisp 32-bit retro video-game pixel art with clearly visible individual pixels, sharp pixel-art outlines, and flat indie-game shading.»
- PET_COUNT_RULE (scene-spec.ts:20): termina en «When renderedPetsCount is zero, draw no animals.»; coincide con la cita de REQ-ESC6-016.

## DISCREPANCIA con el encargo (disco manda)
El encargo daba la frase «Recreate a recognizable 32-bit isometric pixel art version of the room shown in IMG_n …». No está en el código: `grep` sobre src/ y tests/ da 0 coincidencias; solo aparece en claude/log-keymaker.md:1668 (iteración rápida del Keymaker). Neo la reemplazó después en disco (build-image-prompt.ts modificado 16:15; t841 y t939 fijan la frase «Draw a brand-new …»). Usé el texto real de disco, como pide la regla de fuente de verdad. Ídem PIXEL_REDRAW_RULE: el texto en disco es la redacción en positivo «Render every wall …». La anterior «Treat every photographic reference image …» (T901) quedó citada solo como sustituida.

## Contador regresivo (REQ-ESC6-019, REQ-ESC6-034, SC-ESC6-115, plan §5.7)
Prosa: el texto de espera baja cada segundo (cooldownStep pura + startCooldownCountdown, un temporizador de 1000 ms vivo a la vez, SceneBlock.tsx con estado `remaining` hacia `waitSeconds`), relectura única al llegar a 0, cancelación al desmontar o ante una espera nueva (retryAfterSeconds de vista releída o Retry-After de 429), sin aria-live ni role=alert en el contador. Requisitos y contrato sin cambio de valor.

## DISCREPANCIA spec vs código (reportada; la prosa se alineó al código)
La prosa anterior decía relectura a `retryAfterSeconds + 1` s (margen de 1 s). El código relee al llegar la cuenta a 0, es decir a `retryAfterSeconds` s. Quedó escrita la conducta del código; si Neo quiere conservar el margen de 1 s es decisión suya y cambio de código. Además tasks.md T916 (línea ~257) aún habla de «1 relectura a los t + 1 s»; no se tocó (tasks.md fuera del alcance de la misión, T-tareas históricas).

## Verificaciones
- N2-16: sigue asentada como RESUELTA (B + C) en spec.md (fila N2-16, nota de SC-ESC6-125, registro de T941).
- Frases anteriores («only as loose inspiration», «Reimagine the entire room from scratch», «Treat every photographic reference image») quitadas de la prosa vigente; solo permanecen citadas como sustituidas en REQ-ESC6-016, plan §5.3 y el registro de enmiendas.
- Tareas: ninguna marcada [x] por mí; T910, T923, T934 y T935..T943 siguen [ ].
- bash scripts/verify-traceability.sh --feature 006: rc 0, CUMPLE; 241/241 IDs propios mapeados en tasks.md; IDs trazados 198/278 (informativo); pureza 0 violaciones.
