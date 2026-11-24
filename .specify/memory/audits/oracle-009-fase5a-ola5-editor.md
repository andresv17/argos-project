# Acta Oracle — 009 Fase 5a ola 5: T1269 editor de parámetros en /admin (2026-11-23)
Veredicto: PASS CON OBSERVACIONES. Sin [x], sin commit, sin push; contratos y src/generated intactos.

## Compuerta real
- npx tsc --noEmit: exit 0.
- bash scripts/verify-oracles.sh: 510 archivos, 0 débiles, CUMPLE (exit 0).
- vitest t1269-editor-parametros-009.spec.ts: 12/12.
- playwright chromium (t1269 + t1235 + t1250): 50/50 en corrida limpia. Dos corridas previas dieron 1 fallo cada una (t1250:146 con ENOENT de trace en test-results compartido; t1269:88 sin detalle capturado) mientras otro proceso `playwright test` ajeno corría a la vez (puerto 3100 y test-results compartidos). Tercera corrida sin concurrencia: 50/50. Se trata como interferencia, ver OBS-1.

## Verificaciones
1. 5a: solo album.max_photos_per_pet (formulario) y scene.enabled (botón con confirmación) son editables; reinicio de cuota aparte. Claves writable=false (global_quota_max, provider_model, provider_location, prompt.blocks) en «Otros parámetros» sin input/botón; el valor de JSON_BLOCKS no se pinta (ParametersPanel.tsx:328). Aprobado.
2. PUT con If-Match = etag tal cual + X-Argos-Request (parameters-api.ts:131-136). 412 -> mensaje y load(false) recarga catálogo y borrador (ParametersPanel.tsx:121-123). Aprobado.
3. Sin correo ni ids: authorLabel => «Tú» / «Otra persona administradora» / «Sin ediciones…»; e2e comprueba ausencia de ADMIN_ID y de '@'. Aprobado.
4. SessionExpiryNotice: setTimeout a expiresAt-5min, contenedor role=status siempre presente, sin foco ni llamadas. Aprobado.
5. git diff t1235/t1250: una línea cada uno, solo page.route('**/api/admin/parameters'); ninguna aserción tocada.
6. Literal «Puede tardar hasta 1 minuto en aplicarse» presente (parameters-view.ts:9; unit y e2e lo afirman).

## Observaciones
- OBS-1 (proceso): E2E compartidos con otros agentes colisionan (puerto 3100, test-results/). Correr Playwright en serie.
- OBS-2: el e2e 412 no afirma que el valor recargado sea el vigente (el fake devuelve el mismo catálogo); la recarga solo se verifica por el mensaje. Añadir aserción de valor distinto tras el 412.
- OBS-3: en el 412 del interruptor de escenas, el grupo de confirmación queda abierto con el estado recargado (texto puede cambiar de habilitar a deshabilitar); no hay prueba. Preferible cerrar la confirmación al recargar.
- OBS-4: «el aviso no roba foco» está garantizado por código, sin aserción e2e de document.activeElement.
- OBS-5: la tarjeta «Texto base de la escena» (prompt.blocks) aparece con título y datos, sin valor; si Neo entiende «no muestran scene.prompt.blocks» como ocultar la clave, el título contradice. Decisión de Neo/sati.
- OBS-6: /sati (320/1024/1280, WCAG) pendiente formal; axe a 3 anchos y 200 % a 320 px pasan.
