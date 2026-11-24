# Sati — Revisión T1220: eliminación de cuenta sin contraseña en /cuenta (`DeleteGoogleSection`) — feature 009

- Fecha: 2026-11-23. Rama 009-aprobacion-admin-correo, HEAD 65b92ce. Sin cambios en src/, tests/ ni contratos; nada marcado `[x]`; sin commit ni push.
- Alcance: `DeleteGoogleSection` / `DeleteGoogleView` (`data-account-delete-google`) en `src/presentation/web/pages/AccountPage.tsx` y cliente `account-deletion-google.ts`. REQ-DEL9-002, SC-009-046, EDGE-009-031, EDGE-009-049.

## 1. Entorno y método (qué es real y qué es simulado)
- API real `npx tsx src/infrastructure/http/server.ts` en 127.0.0.1:3100 (`NODE_ENV=test`, `COOKIE_SECURE=false`, SQLite temporal nueva) y Vite en 127.0.0.1:5173. Los levanté yo y los apagué (3100/5173 libres). Chromium y WebKit de Playwright, locale es-CO, solo se varió el ancho (alto 800). Axe `@axe-core/playwright` con wcag2a, wcag2aa, wcag21a, wcag21aa sobre la página completa. Script temporal fuera del repo (scratchpad).
- **Cuenta Google sin contraseña: SIMULADA.** No hay credencial real de Google. Registré una cuenta real por la API (sesión y cookie reales) y, en el navegador, intercepté `GET /api/auth/me` para devolver `user.authMethods = {password:false, google:true}`; así `AccountPage` monta `DeleteGoogleSection`. Las rutas `POST /api/account/deletion/reauth` (devuelve una URL de `accounts.google.com`, sin navegar), y `POST /api/account/deletion/google` (403 `ERR-ACCOUNT-DELETE-REAUTH-REQUIRED` y 409 `ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE` con 2 hogares, uno con nombre de 80 caracteres) también están simuladas. **El respaldo (`/backup/export`) sí es real** (descarga y token reales). No se probó el viaje de ida y vuelta a Google ni el 204 real.
- Estados medidos (6 combinaciones navegador x ancho, 320/1024/1280): reposo; respaldo listo; frase incorrecta (error de campo); 403 junto al paso 1; 409 con «Hogares afectados».

## 2. axe WCAG 2.1 A/AA
30 análisis (2 navegadores x 3 anchos x 5 estados): **0 violaciones** en los 30. `pageerror` vacío en las 6 corridas.

## 3. Medidas (px; idénticas en los 5 estados salvo lo indicado)
| Navegador | Ancho | Confirmar con Google | Descargar respaldo | Eliminar mi cuenta | Campo frase | Sección (izq–der) | scrollWidth/clientWidth |
|---|---|---|---|---|---|---|---|
| Chromium | 320 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 218 x 50 | 33–287 | 320/320 |
| Chromium | 1024 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 732 x 50 | 128–896 | 1024/1024 |
| Chromium | 1280 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 732 x 50 | 256–1024 | 1280/1280 |
| WebKit | 320 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 218 x 50 | 33–287 | 320/320 |
| WebKit | 1024 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 732 x 50 | 128–896 | 1024/1024 |
| WebKit | 1280 | 189,7 x 48 | 174 x 48 | 163,9 x 48 | 732 x 50 | 256–1024 | 1280/1280 |

- Objetivos táctiles: todos >= 48 px de alto y >= 163,9 de ancho (mínimo 44): cumple. Sin desbordamiento horizontal (0 elementos de la sección fuera del viewport; scrollWidth = clientWidth en los 30 snapshots).
- 409 con nombre de hogar de 80 caracteres: la fila queda dentro (derecha 252 px a 320; 861 a 1024; 989 a 1280) gracias a `min-w-0 break-words`. Cumple.
- «Eliminar mi cuenta»: `disabled` en reposo (los 6 casos) y habilitado al descargar el respaldo (los 6 casos). Con `aria-describedby="delete-google-submit-help"` en todos los estados.
- Foco visible: anillo `outline 2px solid` + `box-shadow` blanco 2 px y verde oscuro (rgb 29,79,58) en Confirmar con Google, Descargar respaldo y campo de la frase (Chromium). En WebKit de macOS la tecla Tab no llega a los botones (comportamiento por defecto de Safari/WebKit, requiere Opción+Tab), solo al campo; el anillo del campo es el mismo. No es defecto de la pantalla.
- ARIA: `aria-describedby` de Confirmar con Google -> `delete-google-reauth-help` y de Eliminar -> `delete-google-submit-help`, ambos ids existen (`descOk = true` en los 30). Frase incorrecta: campo con `aria-invalid="true"` y `aria-describedby="delete-google-confirmationPhrase-error"` existente, foco en el campo. 403: un `role="alert"` (junto al paso 1) con el texto exacto del catálogo. 409: un `role="alert"` con el texto del catálogo, `<h3>` «Hogares afectados» y la lista etiquetada por él; el foco pasa a `#delete-google-result` (`tabIndex=-1`). `role="status"` «Respaldo descargado…» presente tras el paso 2.

## 4. Hallazgos
**Sin ALTO.**

- **H-T1220-S1 (MEDIO) — el foco se pierde tras el 403 (EDGE-009-031).** `onSubmit` llama `focus('delete-google-title')` cuando hay `reauthMessage`, pero `<h2 id="delete-google-title">` no tiene `tabIndex={-1}`, por lo que `focus()` no hace nada; además el botón enviado queda `disabled` mientras `busy`. Evidencia (selector `#delete-google-title`, `tabindex` = null): tras el 403 `document.activeElement` es `BODY` (Chromium, 320/1280) o `main-content` (WebKit, 320/1280); en el 409 sí cae en `delete-google-result`. El `role="alert"` se anuncia, pero quien navega con teclado queda sin posición (WCAG 2.4.3) y el aviso está en el paso 1, lejos del botón de envío (a 320 px, alerta 391–517 px vs. botón en 835 px, sin desplazamiento propio). Corrección sugerida para /keymaker: añadir `tabIndex={-1}` al `h2` (o enfocar directamente «Confirmar con Google», la acción que resuelve el error) y comprobar `document.activeElement` en el E2E.
- **H-T1220-S2 (BAJO) — «Paso 3: confirma» es vago.** Ver texto 4 en la tabla; propuesta de cambio.
- **H-T1220-S3 (BAJO, observación) — resumen duplicado.** El 403 y el 409 muestran su `role="alert"` en regiones distintas (paso 1 y paso 3); es correcto por contrato, pero conviene que la prueba compruebe que nunca coexisten (el código los limpia en cada intento: `setFeedback` a vacío). Sin acción.
- **Nota:** el botón deshabilitado está exento de contraste en WCAG; axe no lo evalúa. El texto de ayuda `delete-google-submit-help` explica el motivo y sí se evalúa (0 violaciones).

## 5. Revisión de textos
| # | Texto | Dictamen | Razón / propuesta |
|---|---|---|---|
| 1 | «Paso 1: confirma que eres tú con Google» | Aprobado | Verbo + resultado, coherente con la ayuda. |
| 2 | «Paso 2: descarga tu respaldo» | Aprobado | Igual que el paso 1 de la cuenta con contraseña; consistente. |
| 3 | «Paso 3: confirma» | **Cambiar** | Demasiado genérico (confirmar ya es el paso 1). Propuesta: «Paso 3: escribe la frase para eliminar». |
| 4 | «Confirmar con Google» | Aprobado | Acción clara, nombra el destino; 189,7 x 48 px a 320. |
| 5 | «Hogares afectados» | Aprobado | Encabezado `h3` corto; el motivo lo da el mensaje del catálogo justo encima. |
| 6 | «Google te pedirá volver a confirmar tu identidad y regresarás a esta pantalla.» | Aprobado | Anticipa la salida del sitio y el regreso; 2.2 tiene sentido para `aria-describedby`. |
| 7 | «Para eliminar, primero descarga el respaldo del paso 2.» | Aprobado | Explica por qué el botón está inactivo y a qué paso ir. |
| 8 | «La eliminación es definitiva.» | Aprobado (con nota) | Correcto tras descargar el respaldo; repite «No se puede deshacer» del párrafo inicial, aceptable como último aviso junto al botón. |

Los textos de error vienen del catálogo y no se discuten (verificados literales en pantalla).

## 6. No medido (sin maquillar)
- Viaje real a Google y retorno, y el 204 real de eliminación (simulados); lector de pantalla real (VoiceOver/NVDA); Firefox; emulación táctil; viewport de alto reducido (< 600 px); contraste del botón deshabilitado (exento).

## 7. Veredicto
**PASS CON CAMBIOS**: axe 0 violaciones en 30 análisis, objetivos 48/50 px, sin desbordamiento a 320/1024/1280 en Chromium y WebKit. Cambios: H-T1220-S1 (MEDIO, foco tras el 403) y texto «Paso 3» (BAJO). Ningún ALTO. Los 7 restantes textos, aprobados.
