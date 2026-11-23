# Sati — revisión de diseño T1249 (feature 009): /solicitud-en-revision y /solicitud-no-aprobada
Fecha 2026-11-23. Solo revisión; sin cambios en src/tests/specs. Dirección de contacto: fuera de alcance (Neo/rama, T1291).

## Método (real, no supuesto)
Vite dev server (puerto 5199, sin API: ambas rutas son públicas) + Chromium de Playwright a 320/1024/1280 px, axe (wcag2a/aa/21a/21aa + best-practice), medidas con getBoundingClientRect y estilos computados. Capturas en el scratchpad de la sesión (no en el repo). Solo Chromium; WebKit/Firefox NO revisados.

## Resultados por ancho (ambas pantallas)
| Ancho | Desborde | Gutter | axe | Foco inicial |
|---|---|---|---|---|
| 320 | no (scrollWidth 320) | tarjeta a 16 px de cada borde (l=16, r=304); texto a 41 px | 0 violaciones | h2 |
| 1024 | no | tarjeta 64 px | 0 | h2 |
| 1280 | no | tarjeta 192 px (max-w-4xl) | 0 | h2 |
Jerarquía real: h1 «Argos», h2 título de estado, h3 «Tus datos» (correcta, sin saltos). Orden de lectura = orden visual (marca, título, texto, «Tus datos», enlace). Sin form/button/input en main (0) y sin «Administrador» ni /admin en el texto.
A 1024/1280 la columna izquierda queda con solo la marca y la derecha con el contenido: aceptable, es el marco L1 compartido con login.

## Contraste (calculado WCAG, sRGB)
- text-slate-800 #1e293b sobre blanco: 14.63:1 (AA 4.5, AAA 7: pasa). Computado en página: rgb(30,41,59).
- Enlace primary #1d4f3a sobre blanco: 9.41:1; sobre el fondo de página #e6f2ea: 8.18:1 (peor caso, la tarjeta es blanco al 90 %). Pasa AA y AAA.
- Título text-primary #0f172a sobre blanco: 17.85:1.

## Hallazgos
- S1 (medio, WCAG 2.5.5 AAA / estándar del proyecto de 48 px): «Volver al acceso» mide 109 x 17 px. Incumple el objetivo táctil de 48 px; en WCAG 2.2 AA (2.5.8, 24 px) tampoco llegaría. Es el único control de la pantalla y la única salida.
- S2 (bajo, coherencia 2.4.7): el foco del enlace usa el contorno nativo (auto, 1 px, azul rgb(0,95,204), :focus-visible verdadero), visible pero distinto del anillo del resto de la app (focus-visible:ring-2 ring-primary ring-offset-2). Pasa 2.4.7; solo inconsistente.
- S3 (informativo, OK): foco en el h2 al abrir (tabIndex -1, ref, activeElement = h2 a todos los anchos), con focus:outline-none; es un contenedor no interactivo, aceptable (WCAG 2.4.3). Un Tab lleva a «Volver al acceso».
- S4 (informativo): el helper accessibilityFindingsAt del E2E solo recoge critical/serious; las reglas «moderate» (heading-order, region) no entran. Ejecuté también best-practice: 0 violaciones, así que no hay deuda oculta hoy.

## Cambios recomendados
1. [keymaker, necesita re-auditoría mía rápida de 320/1024/1280 + oracle] Enlace «Volver al acceso» con la misma clase de objetivo que «Continuar con Google»: `inline-flex min-h-12 items-center` (alineado a la izquierda, sin ancho completo; subrayado y font-semibold se mantienen) + `focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded`. Resuelve S1 y S2. Añadir al E2E una aserción boundingBox().height >= 48.
2. [keymaker, sin re-auditoría] Opcional: que el E2E ejecute axe con la etiqueta best-practice para estas dos pantallas (S4).
3. Distinción visual PENDING vs REJECTED — recomendación: NINGUNA señal de color ni icono. Mismo marco, misma tipografía, mismo h2. La diferencia la lleva el texto (título + frase), que es lo accesible y evita connotar «error/alarma» a una persona que ya recibe una mala noticia; un rojo además fallaría 1.4.1 si fuera la única pista. Si Neo quisiera refuerzo, el único aceptable es un icono decorativo aria-hidden junto al h2 en slate-700 (no rojo); no lo recomiendo en esta tarea.
4. Tono REJECTED: «Con esta cuenta no puedes entrar a ARGOS.» es breve, en tuteo, sin culpa ni jerga; es texto aprobado D9-18, no se toca. Observación para Neo (no bloqueante): el título de REJECTED lleva punto final y el de PENDING no; es del texto aprobado, solo coherencia tipográfica menor. El bloque «Tus datos» ya ofrece el siguiente paso (suprimir antes por Ley 1581), por lo que la frase corta no deja a la persona sin salida. «No te enviaremos correo» en PENDING es coherente con la política de la feature.
5. Bloque «Tus datos»: correcto y solo texto (sin botón/form/input); h3 con aria-labelledby, borde slate-200 sobre blanco; el borde es decorativo (no exige 3:1). Texto largo pero a 320 px ocupa 346 px de alto sin desborde; legible. Sin cambios.

## Veredicto
Un cambio pequeño (S1+S2) en un solo archivo. No hay violaciones axe ni de contraste. APROBADO CON UN AJUSTE: tras el cambio 1, listo para /oracle.
