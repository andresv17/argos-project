
### 2026-11-14 — Sati: ui_blueprint.md generado (raíz). Sin cambios de código.
- Tokens HEX/RGB/CMYK verificados; matriz de contraste calculada con WCAG 2.1.
- Hallazgo: lima #c5f35a sobre blanco = 1.29:1 → uso solo como fondo con texto oliva (7.32:1).
- Única adición: [FIX B-1] select roleOnJoin (valor inicial READER) en Invitar miembro.
- Presupuesto blur: máximo 2 capas (L1 marco, L2 diálogo abierto).
- Pantone solo orientativo (familia cromática); no se inventan códigos sin catálogo.
- Renderizado real no verificado (requiere implementación + E2E/axe).

### 2026-11-14 — Sati: auditoría de ui_blueprint.md (v1.0 → v1.1), sin cambios de código
- Cobertura 1-a-1: v1.0 tenía 17 omisiones (ids E2E, data-alert-status, data-ui-badge, aria-selected, caption/scope, textos) + 10 en opciones/títulos de formularios. Añadida sección 3.7 (contrato de preservación) y tabla de campos de RecordForm. Cobertura final: 0 faltantes.
- Corregido: velo/segunda capa de blur inventada (los diálogos son en línea, aria-modal=false); presupuesto de blur = 1 capa en tablet/escritorio, 0 en móvil.
- Corregido: scroll automático inventado al seleccionar mascota; referencia errónea a §4.3 (los campos están en §3.4).
- Contraste: script de 59 pares, 0 fallos; OWNER_COLORS y UI_BADGE_STYLE verificados contra view-model.ts; colores Tailwind verificados contra la librería instalada.
- Lección propia: al "enriquecer" una etiqueta se rompió el texto exacto ("URL del avatar (opcional)"); detectado por la segunda pasada de cobertura.

### 2026-11-14 — Sati: Neo aprobó los 5 puntos del Apéndice C de ui_blueprint.md v1.1
- Aprobados: paleta y 60-30-10; lima solo como fondo; pila de fuentes del sistema; [FIX B-1] con etiquetas en español; Pantone orientativos.
- Orden de Neo: NO despachar a Keymaker todavía. Sin cambios de código.

### 2026-11-14 — Sati: propuestas A y B de estructura (ui_propuestas_estructura.md). Sin cambios de código.
- Leídos architecture_spec.md y ui_blueprint.md §1; tokens v1.1 se reutilizan sin cambios.
- A = riel vertical de avatares + bento; B = tira de tarjetas + riel de navegación. Recomendada: A.
- Riesgo detectado: pet-dashboard.spec.ts:58-85 rellena #weights-* y #vaccinations-* sin clic y en bucle. Regla propuesta "abierto si vacío, no se cierra solo" para no tocar pruebas; no ejecutada.
- Riesgo: dos botones "Nueva mascota" romperían el modo estricto de Playwright; debe haber uno.
- Pendiente de Neo: A/B, D1 avatarUrl (privacidad, revisar con /rama), D2 formularios, D3 upToDateCount/myRole.

### 2026-11-14 — Sati: ui_blueprint.md v2.0 + ui_maqueta_v2.html (Propuesta A aprobada por Neo). Sin cambios en src/.
- v1.1 archivada en claude/archivo/ui_blueprint-v1.1.md. Tokens y paleta sin cambio de valor.
- Desviación declarada C2: navegación en flujo superior también en móvil (sin barra inferior fija), por orden de foco WCAG 2.4.3.
- Avatar D1 con glifo de huella genérica (glifos por especie diferidos). Riesgo E2E del <details> cerrado en módulos con registros, pendiente de verificación de Keymaker.
- Maqueta verificada en Chromium (servidor local): 320 px sin desbordamiento tras corregir columna implícita de .layout; 1024 y 1280 px sin desbordamiento; 1 solo backdrop-filter; 1 solo "Nueva mascota".
- Capturas en .playwright-mcp/maqueta-{320,1024,1280}.png. axe-core no ejecutado.

### 2026-11-14 — Sati: pre-verificación para la auditoría de Oracle (no es veredicto). Sin cambios en src/.
- Contraste recalculado con script WCAG 2.1 sobre 16 pares de v2.0: 15 OK; 1 fallo = lima sobre blanco (1.29:1), prohibido por diseño.
- Cobertura: data-* y ARIA del contrato §4.2 presentes en ui_blueprint.md; "roleOnJoin" en 3 secciones.
- Maqueta: un único "Nueva mascota"; un único backdrop-filter (en @supports).
- No verificado aún: axe-core y E2E sobre la maqueta.

### 2026-11-14 — Sati: enmienda v2.1 (rebote único de Oracle) + decisión de Neo sobre H-BP2-4 (Opción A)
- v2.0 archivada en claude/archivo/ui_blueprint-v2.0.md. Veredicto leído completo (claude/veredicto-auditor-blueprint-v2.md).
- Aplicados: H-BP2-1 (riel con 6 líneas de datos, columna de 156 px), H-BP2-2 (main#main-content y div#pet-panel separados, 0 ids duplicados), H-BP2-3 (D2: open local, init al montar, no se recalcula), H-BP2-5 (excepciones D3), H-BP2-6 (indicador 2 px primary), H-BP2-7 (kg y U+2212), H-BP2-8, 9, 10, 11.
- Neo (Nivel 2): H-BP2-4 = Opción A (riel flex/scroll); 768 px verificado; barra inferior descartada ratificada; /cuenta definida (§5.4) solo con contrato 002; enlace "Perfil" en la cabecera. Maqueta nueva ui_maqueta_cuenta.html.
- Contraste recalculado por script: pares nuevos todos >= 4.5 (texto) y >= 3 (no-texto; indicador 7.32 sobre lima, 8.71 sobre marco 70 %).
- Chromium a 320/768/1024/1280: sin desbordamiento, 1 "Nueva mascota", blur 0 en <640 y 1 en >=640, pet-panel existe, sin ids duplicados. Capturas en .playwright-mcp/*-v21-*.png. Sin cambios en src/, tests/, specs/, logos.json; sin commits.

## 2026-11-14 — Cierre de bajos H-BP2-13/14/15
- H-BP2-13: Apéndice A (ui_blueprint.md:672) ahora indica que cuenta/perfil/contraseña están definidos en §5.4.
- H-BP2-14: etiquetas `label.field` envuelven texto y asterisco en un `<span>` (ui_maqueta_v2.html 2, ui_maqueta_cuenta.html 5). Chromium: asterisco en la línea del texto a 320/768/1024/1280.
- H-BP2-15: "Usuario: {username} (no editable)" en blueprint L499 y maqueta. Sin desbordamiento; 1 "Nueva mascota" en v2. Sin commits.

## 2026-11-14 — Blueprint v2.2 (enmiendas H-K-3/4/5, orden de Neo)
- Archivada v2.1 en claude/archivo/ui_blueprint-v2.1.md; cabecera a v2.2.
- §4.3 (hero y acción "Registrar peso"), §4.6 (EDIT sustituye hero, sin "Editar"), §5.2 (tu rol: {rol real} + " (Propietario)"), §5.7 estados (aviso de sesión sin "Mantener sesión"). Sin tocar specs/src/tests/logos. Sin commits.

## 2026-11-14 — Blueprint v2.3 (H-V22-2, H-V22-3, H-V22-5)
- Archivada v2.2 en claude/archivo/ui_blueprint-v2.2.md; cabecera a v2.3.
- §3.2: "Cuatro NavLink"; L226/L240, C15 y fila 7 de Apéndice B reescritas como decisión cerrada (REQ-UI2-001 enmendado). Apéndice C ordenado (1.0, 1.1, 2.0, 2.1, 2.2, 2.3); Apéndice E añade "Perfil". H-V22-1 (§4.5) intacto. Sin commits.

## 2026-11-14 — N-1 (blueprint L201)
- ui_blueprint.md L201: nav del esquema ASCII ahora "Mascotas · Hogares · Respaldo · Perfil" (coincide con los cuatro enlaces de §3.2). Nada más tocado; §4.5 y H-V22-6 pendientes de Neo. Sin commits.

## 2026-11-14 — Blueprint v2.4 (H-V22-1 A, H-V22-6)
- Archivada v2.3 en claude/archivo/ui_blueprint-v2.3.md; cabecera a v2.4 (+ fila 2.4 en Apéndice C).
- §4.5 L388: bloque de registro por permiso granular (weights/measurements -> writeWeightsAndMeasurements; vacunas/desparasitación -> writeHealthEvents; consultas/parámetros -> writeAppointmentsAndParameters), según architecture_spec §4.1 y RECORD_WRITE_PERMISSION. editPetBasics solo para editar mascota. B-3 retirada de §4.5 y del Apéndice A.
- Fila del aviso de sesión: disparador = un temporizador en idle-notice.ts a 5 min de idleExpiresAt, sin sondeo, reinicia con actividad real. Sin commits.

## 2026-11-14 — T295: revisión de lo construido contra el blueprint v2.4
- Revisé App.tsx, AppShell, PetAvatar, PetsPage/PetCards/PetDashboard, Account, Households y Backup contra §3 a §6.
- Verifiqué en navegador (API 3190, web 5190; 3180/5180 ocupados) 4 rutas a 320/768/1024/1280: sin desborde, 1 "Nueva mascota", blur 0 en 320 y 1 desde 768, 0 zonas táctiles < 48 px.
- Resultado: 0 bloqueantes, 3 a corregir (D1 cabecera móvil, D2 campo de contraseña estrecho a 768, D3 avatar del hero a 320), 6 aceptables. Contradicción: blueprint §5.3 no recoge REQ-UI2-007 (reportada, sin editar).
- Entrega: claude/entrega-T295-pieza-sati.md; capturas en .playwright-mcp/pieza-T295/. Recomendación: aprobar con correcciones. Sin commit; T295 sigue abierta.

## 2026-11-14 — Blueprint v2.5 (§5.3 /backup, REQ-UI2-007)
- v2.4 archivada en claude/archivo/ui_blueprint-v2.4.md. ui_blueprint.md sube a v2.5, REVIEW, por decisión de Neo (opción C de T295).
- §5.3 reescrita: barra de fases (ol, aria-current, sin progressbar), zona de arrastre + selector por teclado, previsualización [UI] (sourceSchemaVersion, counts, collisions, affectedSharedPets; fileDigest no se muestra), role="status"/"alert" conservados.
- Apéndice A: la fila "Vista previa de importación" contradecía §5.3; se cambió a "fileDigest no se muestra". §9: desviaciones aceptadas D4 a D9. Apéndice C: fila 2.5. Sin tocar specs, src, tests ni colores. Sin commit.

## 2026-11-14 — Corrección H-V25-2 (D4) y H-V25-3 (D8) en §9
- D4 reescrita con el dato del CSS real (styles.css:20, min-width 1024 px; §1.2 prevé 640 px; trazo 8 %, sin texto ni controles).
- D8 reescrita: snap-x es proximity en Tailwind 3.4.19 (corePlugins.js:1501-1509), ajusta al soltar; sin efecto en teclado, WCAG ni contrato.
- Solo esos dos textos; versión sigue v2.5, sin commit.

## 2026-11-18 — Revisión retroactiva escena del hogar (006)
- Informe `.specify/memory/audits/sati-006-escena-revision.md` y prototipo `specs/006-escena-hogar-pixel-art/prototype/escena-hogar.html`; 14 desviaciones (2 Altas: foco en confirmaciones, OUTDATED sin acción).
- Solo lectura sobre src/ y tests/; sin commit; nada APPROVED; pendiente de Neo.

## 2026-11-19 — T1003 prototipo DateField (feature 007, GH #11)
- Entrega: specs/007-ux-ficha-mascota-fallecimiento/prototipos/date-field.html (HTML+CSS+JS demo autocontenido, sin dependencias).
- Diseño: fieldset/legend visible, 3 segmentos con aria-label (día/mes/año), alto 48 px, foco 2 px primary con offset, estado de error con borde 2 px + icono + texto (color no solo), separadores aria-hidden; tokens del repo; sin tocar src/tests/contracts/tasks.md.
- Contraste: borde #64748b 4.76:1, placeholder/ayuda #475569 7.5:1, error #991b1b 8:1 sobre blanco (calculado, no medido con herramienta).
- Pendiente: aprobación de Neo del aspecto; T1003 sigue [ ]. Sin commit.

## 2026-11-19 — T1045 verificación visual tarjeta «Estado de vacunación» (feature 007, GH #15)
- Worktree argos-007 @98fad49. Capturas con Playwright/Chromium existente (puertos propios 3191/5191, BD temporal, config en scratchpad; sin tocar src/tests). 12 PNG en specs/007-.../prototipos/vacunacion-{sin-registros,con-alertas}-{320,1024,1280}-{tarjeta,pagina}.png.
- Resultado: sin botón/enlace (0 controles), título correcto, blanco sobre #1d4f3a (~9.6:1), axe WCAG 2.1 AA 0 violaciones en 6 combinaciones, sin desbordamiento horizontal.
- Observaciones: (1) «Todo al día» con 0/0/0 (sin registros) afirma algo no sabido; (2) «1 vencidas/1 próximas» sin concordancia singular; (3) «Dueño:» duplica el hero; (4) rótulo vs recuento que incluye desparasitaciones (D7-03, aceptado).
- Veredicto: PASS CON OBS. Sin commit; T1045 no marcada.

## 2026-11-19 — Revisión visual ficha Vivo/Fallecido (feature 007, worktree argos-007 @6e7f0a3)
- Servidor propio (3192/5192, BD temporal); 15 PNG en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/f6cbc75c-cf86-4555-842c-009e06c67b7b/scratchpad/sati1068/out (ficha, formulario, foco y confirmación ámbar a 320/1024/1280). Solo lectura sobre src/tests/specs/contracts.
- axe WCAG 2.1 AA: 0 violaciones en 9 combinaciones; sin desbordamiento de página; foco 2 px visible en segmentos de fecha. Insignias y selector Estado sin prototipo (M7-13).
- Hallazgos: M1 segmentos de fecha desbordan la tarjeta del formulario ~20 px a 320 (DateField.tsx:118/PetForm.tsx:272); M2 tarjeta vacunación dice «Todo al día» en fallecida (PetDashboard.tsx:268). 3 menores. Veredicto: PASS CON CAMBIOS. Sin commit.

## 2026-11-21 — Revisión T1191 combobox de colaboradores (feature 008, HEAD d320b1d)
- Acta `.specify/memory/audits/sati-008-T1191-combobox.md`. Servidor 3200/5273 no estaba activo; revisión por lectura de código (sin capturas ni axe). Solo lectura sobre src/tests/contracts.
- Layout 320/1024/1280, táctil 44 px, contraste (7.58, 8.31, 15.5, 4.76), roles ARIA y anti-Slop: PASS.
- Hallazgo Media H-T1191-S1 (= H-T1192-2): InviteeCombobox.tsx:99 vacía la región `status` en «sin coincidencias» y el `<p>` visible no es región viva, luego no se anuncia el mensaje D8-11. Fix mínimo: `{inviteeAnnouncement(state)}` en :99. No aplicado. Sin commit.

## 2026-11-21 — Revisión T1122 UI de Google (feature 008, HEAD 65e80e6)
- Acta `.specify/memory/audits/sati-008-T1122-acceso-google.md`. Servidor propio 3200/5273 (detenido), Chromium existente; 15 capturas en el scratchpad; axe 0 violaciones; sin desbordamiento de página a 320/1024/1280.
- Contraste calculado: Google 9.41:1, apoyo 14.63:1, error 8.31:1/9.16:1, aviso 17.85:1. Perfil sin contraseña verificado con /auth/me simulado.
- Hallazgos: H-T1122-S1 Media (error de campo en /elige-usuario sin role=alert ni foco, Field.tsx:52); H-T1122-S2 Baja preexistente (PasswordField 4 px a 320); O-1 enlaces de pie 17 px de alto. Solo lectura sobre src/tests; sin commit.

## 2026-11-21 — Revisión T1131 «Vincular Google» (feature 008, HEAD 4619d32, sin commit)
- Acta `.specify/memory/audits/sati-008-T1131-vincular-google.md`. Servidores propios 3200/5273 (detenidos), me y /google/link simulados; 15 capturas en el scratchpad (out/); axe 0 violaciones; sin desbordamiento; foco al campo con 401 y con envío vacío (sin temporizadores); contraste >= 4.76:1, controles 48-50 px.
- H-T1131-S1 ALTO: el error de contraseña incorrecta muestra el detailTemplate crudo del catálogo (nota de desarrollador) en vez de texto llano (google-link… googleLinkFeedback, google-login.ts:62). H-T1131-S2 BAJO: role=status en tarjeta estática.
- Veredicto PASS CON CAMBIOS. Solo lectura sobre src/tests; sin commit.

## 2026-11-21 — Re-revisión T1131 (S1/S2) (feature 008, HEAD 4619d32, sin commit)
- Sección de re-revisión añadida a .specify/memory/audits/sati-008-T1131-vincular-google.md. Vite propio 5273 (detenido), me y /google/link simulados; 15 capturas en el scratchpad (out2/); axe 0 violaciones; sin desbordamiento; foco al campo con 401 y vacío.
- S1 CERRADO: texto «La contraseña actual no es correcta.» bajo el campo, sin detailTemplate. S2 CERRADO: sin role=status en GoogleLinkedStatus. Sin hallazgos nuevos. Veredicto PASS. Solo lectura sobre src/tests; sin commit.

## 2026-11-21 — Revisión visual escena del hogar F/G (T1165, T1169, T1172; feature 008, HEAD 95b5a08, sin commit)
- Acta `.specify/memory/audits/sati-008-F-G-escena.md`. API 3210 y Vite 5283 propios (detenidos); 75 archivos en el scratchpad (sati-fg/out/); Chromium, WebKit y Firefox a 320/1024/1280.
- axe 0 violaciones en Chromium y WebKit (Firefox sin axe por crash del navegador de prueba, limitación); sin desbordamiento; objetivos 48 px; contraste >= 9.41:1 (botones), figcaption 17.61:1; foco visible 2 px.
- Hallazgos solo BAJOS (mensajes de cambios duplicados, preexistente). No cubierto: cuota agotada R=0. Veredicto PASS. Solo lectura sobre src/tests; sin commit.

## 2026-11-21 — Revisión T1183 biografía de la mascota (feature 008, HEAD 2359021, sin commit)
- Acta `.specify/memory/audits/sati-008-T1183-biografia.md`. API 3220 y Vite 5293 propios (detenidos); 40 PNG + res.json en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/94aa146e-0fb5-44f0-85f4-dc067ef30f48/scratchpad/sati-bio/out; Chromium; propietario, Cuidador y Lector reales.
- axe 0 violaciones; contraste >= 7.58:1; campo 50 px, Editar 48 px; foco 2 px visible; Cuidador/Lector sin campo ni Editar; texto tipo HTML se muestra literal.
- H-T1183-S1 ALTO: texto sin espacios (280 seguidos) no se parte: a 320 desborda la página (705 px, Reflow 1.4.10), a 1024/1280 sale de la tarjeta (PetDashboard.tsx:383, break-words no basta en grid). S2 MEDIO: error de excedido sin role=alert ni foco y copy «falta». S3/S4 BAJO. Veredicto FAIL (S1). Solo lectura; sin commit.

## 2026-11-21 — Re-revisión T1183 biografía (S1-S4) (feature 008, HEAD 2359021, sin commit)
- Sección de re-revisión añadida a .specify/memory/audits/sati-008-T1183-biografia.md. API 3230 y Vite 5303 propios (detenidos; no se tocaron 3700/5773 ajenos); artefactos en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/94aa146e-0fb5-44f0-85f4-dc067ef30f48/scratchpad/sati-bio2/out; Chromium, WebKit y Firefox a 320/1024/1280.
- 280 sin espacios: sin desbordamiento (320/320, 1024/1024, 1280/1280) y texto dentro de la tarjeta en los 3 motores. 285 enviado: «La biografía admite hasta 280 caracteres.» con role=alert, foco en el campo, sin «falta…». axe 0 violaciones en Chromium y WebKit (Firefox sin axe, limitación).
- S1, S2, S3, S4 CERRADOS; sin hallazgos nuevos. Veredicto PASS. Solo lectura sobre src/tests; sin commit.

## 2026-11-21 — Revisión T1197 ayuda de rol (feature 008, HEAD 42aa256, sin commit)
- Acta .specify/memory/audits/sati-008-T1197-ayuda-rol.md. API 3230 y Vite 5303 propios (detenidos); capturas en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/94aa146e-0fb5-44f0-85f4-dc067ef30f48/scratchpad/sati-rol/out; Chromium, 5 roles, 320/1024/1280.
- axe 0 violaciones; sin desbordamiento; contraste 7.58:1; foco 2 px; descripción accesible verificada por CDP (frase exacta); aviso presente a propietario/Admin y ausente a Cuidador/Lector.
- H-T1197-S1 MEDIO: selector «Rol de X» de miembros 40 px (<44). S2-S4 BAJO. Veredicto PASS CON CAMBIOS. Solo lectura; sin commit.

## 2026-11-21 — Re-revisión T1197 (S1 selector Rol de miembro 44 px) (feature 008, HEAD 3239b81, sin commit)
- Sección de re-revisión añadida a .specify/memory/audits/sati-008-T1197-ayuda-rol.md. API 3240 y Vite 5313 propios (detenidos); artefactos en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/94aa146e-0fb5-44f0-85f4-dc067ef30f48/scratchpad/sati-rol3/out; Chromium, 320/1024/1280; propietaria, Administrador, Cuidador y Lector reales.
- Selector «Rol de X»: 44 px en los 3 anchos (antes 40), sin desbordamiento, dentro de fila y viewport; aria-describedby intacto (IDs únicos, descripción accesible = frase aprobada); axe 0 violaciones; foco 2 px visible. Cuidador/Lector no ven selectores.
- S1 CERRADO; sin hallazgos nuevos. Veredicto PASS. Solo lectura; sin commit.

## 2026-11-23 — T1173 OBS-1 combobox invitados (medicion real)
- Servidor real 3100/5173, Chromium+WebKit, 320/1024/1280: axe 0/24, caja 50 px, opciones 44 px, sin desbordamiento. Veredicto PASS; 1 BAJO (salto de ancho). Acta: .specify/memory/audits/sati-008-T1173-combobox-invitados.md

## 2026-11-23 — T1235 diseño UI portal /admin (feature 009, HEAD 82ae495, solo diseño)
- Acta .specify/memory/audits/sati-009-T1235-admin-ui.md: pantalla de acceso (enlace «Entrar con Google» a /api/admin/auth/google/start) y shell vacío (cabecera, «Cerrar sesión», aviso «Sin funciones habilitadas») a 320/1024/1280; fondo plano, sin decoración.
- Copy en español, checklist WCAG 2.1 AA y 17 comprobaciones axe/Playwright (axe = 0 violaciones, 6 ejecuciones mínimas) para keymaker; sin mensajes de error de acceso (EDGE-009-008).
- Decisiones abiertas D-S1 (contador de pendientes en el shell) y D-S2 (botón relleno vs. contorno). Sin cambios en src/tests/specs; sin commit.
- 2026-11-23 Sati T1249: revision diseno estado de solicitud a 320/1024/1280 con Chromium real+axe (0 violaciones); 1 ajuste (objetivo 48 px y anillo de foco del enlace «Volver al acceso»); acta .specify/memory/audits/sati-009-T1249-estado-solicitud.md

## 2026-11-23 — Revisión de diseño T1250 solicitudes en /admin (feature 009, HEAD 82a9cdc, sin commit)
- Lectura de RegistrationsPanel/registrations-view/AdminPortal; unit 11/11 y E2E Chromium t1250 14/14 (axe 0, sin desborde 320/1024/1280, botones 48 px, texto 200 %). Sin cambios en src/tests.
- Hallazgos de diseño (sin decidir): S1 MEDIO éxito de aprobar/rechazar solo en sr-only (sin confirmación visible); S2 BAJO foco tras «Cargar más» no se mueve; S3 BAJO botones apilados a 320 con 8 px de separación (Aprobar/Rechazar contiguos; mitigado por confirmación). Español sin caracteres rotos.

## 2026-11-23 — Revisión de diseño T1266 caja «Función deshabilitada» (feature 009, HEAD 895e233, sin commit)
- Medición real: HTML estático de SceneBlockView + Tailwind del proyecto, Chromium+axe a 320/1024/1280 (scratchpad .../f85c1aa5.../scratchpad/t1266); no hay E2E propio de T1266 (se usó fixture). axe 0 (solo page-has-heading-one por el fixture), sin desborde, caja texto 16:1, botón 48 px, imagen visible.
- Ajuste en SceneBlock.tsx: la caja lleva id y el botón deshabilitado la referencia con aria-describedby (antes, con canRegenerate=true, el botón quedaba sin descripción). Unit t1260 5/5, tsc limpio.
- Dudas sin decidir: S1 BAJO motivo «La imagen no se puede crear ahora.» redundante bajo la caja; S2 BAJO caja slate (azulada) vs «gris» neutro; S3 BAJO la caja no se anuncia al aparecer por sondeo.

## 2026-11-23 — Revisión de diseño T1269 editor de parámetros /admin (feature 009, HEAD 895e233, sin commit)
- Medición real Chromium 320/1024/1280 (spec temporal borrado; puertos 3141/5241 porque 3100/5173 estaban ocupados por otro proceso, lo que causó 1 fallo ENOENT de trazas en la primera corrida paralela). Unit 12/12, E2E t1269 15/15 (axe 0, sin desborde, 200 %, aviso 25 min); objetivos táctiles todos >=44 px (salvo enlace «Saltar al contenido», oculto); orden de lectura coherente.
- Ajuste en ParametersPanel.tsx: al guardar un tope inválido el foco pasa al campo y el campo referencia el error con aria-describedby (antes el foco quedaba en el botón y la alerta estaba 217 px arriba del campo a 320). tsc limpio; unit 12/12; E2E t1269+t1250 29/29.
- Sin decidir: S1 tarjeta de escenas sin «Valor por defecto»; S2 aviso de sesión al final de la página (2600 px abajo a 320); S3 redundancias «Sin ediciones»/«Sin ediciones desde este portal»; S4 h3 y label idénticos.

## 2026-11-23 — Revisión formal T1269 (OBS-6 de oracle; feature 009, sin commit)
- Medición real Chromium (API simulada del E2E, puertos 3141/5241, en serie) a 320/1024/1280: sin desborde (scrollWidth = viewport), objetivos todos >= 44 px (botones/campo 48), contraste real 7.04–17.85:1 (muted sobre cream 7.04, muted/blanco 7.58, danger/blanco 6.47, blanco/primary 9.41), foco = anillo 2 px, orden de lectura h1 > aviso > solicitudes > parámetros, aviso de sesión visible sin mover foco, axe 0.
- S1 y S2 de keymaker verificados. Ajuste en ParametersPanel.tsx: éxito y errores ahora en línea dentro de su tarjeta (bajo el botón / bajo el campo); antes el texto visible quedaba en el borde superior del panel (a 320: 386 px fuera de vista tras guardar). Unit 12/12, E2E t1269 16/16, tsc limpio (sin temporales).
- OBS-5: mantener la tarjeta; sugerida (sin aplicar) una sola línea en lugar de «Sin rango definido / Sin ediciones…». Decisión de copy para Neo.

## 2026-11-23 — T1305 parte de presentación (feature 009, sin commit)
- Copy aplicado en ParametersPanel.tsx/parameters-view.ts: S3 una sola línea «Última edición: Sin ediciones desde este portal» cuando fecha y autor son null; S4 h3 «Fotos del álbum» (la etiqueta del campo sigue «Máximo de fotos por mascota», así los E2E por etiqueta no cambian); OBS-5 tarjeta de bloques con solo «Texto interno, no se muestra aquí.».
- Claves 5b: el panel ya no depende de writable para listarlas (antes writable=true las hacía desaparecer); se muestran en «Otros parámetros» con nota «edición en preparación». Marcador T1305 en el código. Editor real (selector modelo/región, techo derivado, EDGE-009-036, bloques) NO construido: depende de contrato/API de keymaker.
- Verificación: tsc limpio, unit 12/12, E2E t1269 16/16 en serie (axe 0, sin desborde 320/1024/1280, 200 %).

## 2026-11-23 — T1305 editor 5b en /admin (feature 009, sin commit)
- Nuevo src/presentation/admin/SceneParameterEditors.tsx (ModelEditor, RegionEditor, QuotaEditor, BlocksEditor); ParametersPanel.tsx los monta si la clave es writable (si no, «Otros parámetros» sin campos); parameters-api.ts distingue 422 ERR-ADMIN-SCENE-COST-CAP-EXCEEDED (kind COST_CAP); parameters-view.ts con textos, listas cerradas (modelos 2.5/3.1; región us-central1) y validadores. Máximo del tope (111) y maxBlockLength (1000) leídos de constraints. Sin cifras de coste.
- Copy 5a (S3, S4, OBS-5) intacto. Pruebas nuevas tests/e2e/admin/t1305-editor-5b.spec.ts (API simulada): 12 casos; junto a t1269 28/28 en serie (3141/5241), axe 0, sin desborde y objetivos >= 44 px a 320/1024/1280, 200 % sin desborde. tsc limpio en presentation.

## 2026-11-23 — Select model/region >= 44 px en WebKit/iOS (feature 009, sin commit)
- SceneParameterEditors.tsx: nuevo SELECT_CONTROL (CONTROL + h-12 min-h-[48px] appearance-none py-2 pr-10) y flecha propia por style (SVG data-URI). Solo los select; textos, aria, foco 2 px y lógica intactos.
- t1305 webkit+ios-safari 24/24 (objetivos >= 44 a 320/1024/1280), chromium t1305+t1269 en serie, tsc 0.

## 2026-11-24 — T1405 prototipo Tipi y dictamen de contraste (feature 010, sin commit, sin [x])
- Artefacto: .specify/memory/audits/sati-010-T1405-prototipo-tipi.html (login, registro, cabecera con logo horizontal crema y símbolo simple <=380 px, favicon 16/32/48; iframes 320/768/1024/1280; activos y fuentes reales de tipi-marca.zip incrustados). BRAND-TIPI.md no está en la raíz: vive dentro de tipi-marca.zip (raíz del repo).
- Contraste (WCAG 2.1, calculado): Bosque/Crema 9.67:1 (AAA); Crema/Bosque 9.67; Bosque/blanco 11.80; Terracota/Crema 3.67:1 FALLA AA texto normal, pasa grande/no textual (3:1); Terracota/blanco 4.48 (falla por 0.02); Crema/Terracota 3.67 (etiqueta de botón solo grande); Bosque/Terracota 2.63 falla.
- Uso restringido propuesto (paleta intacta): Terracota solo en franja, acento de título >=24 px, íconos y anillo de foco; nunca texto pequeño, enlaces ni botón con etiqueta normal (botón primario = Bosque con texto Crema). Alternativa para texto/enlace de acento, pendiente de Neo: Terracota oscuro #A8431F = 4.93:1 sobre Crema.
- Limitación: el prototipo no se pudo abrir en navegador (file: bloqueado en el MCP); sin captura ni axe. Verificar a mano.

## 2026-11-24 — Validación local Bloque A (T1410), HEAD d4685f2: FAIL (3 bloqueantes)
- Acta: .specify/memory/audits/sati-010-bloque-A-validacion-2026-11-24.md (29 capturas). Sin commit, sin [x].
- Bloqueantes: B-1 ningún logo en UI (images=0; public/brand sin uso); B-2 h1 Inter 700, Nunito 800 declarada pero sin uso; B-3 «Argos» visible en src/presentation/admin/AdminPortal.tsx:56 y :87.
- OK: sin scroll horizontal 320..1280; Terracota solo en anillos de foco; Bosque/Crema 9.67; pestaña activa 11.26; sin recursos externos; favicon y title en Tipi. La UI no tiene tema oscuro.
- No validados: / y /cuenta (cuenta sati_t1410 queda PENDING; aprobarla en SQLite fue denegado por el clasificador). Reintentar con cuenta APPROVED de Neo.

## 2026-11-24 — Revalidación local Bloque A (T1410), HEAD f6618c3: PASS CON OBS
- Acta: .specify/memory/audits/sati-010-bloque-A-revalidacion-2026-11-24.md (16 capturas). Sin commit, sin [x], sin cuentas ni BD.
- B-1 logo, B-2 Nunito 800, B-3 sin «Argos» en admin y M-1 contraseña a 320 px: PASS en 4 pantallas x 4 anchos; sin scroll horizontal; Terracota ausente de texto/enlaces/botones.
- Pendiente: / y /cuenta (requieren cuenta APPROVED de Neo).

## 2026-11-24 — Validación local T1415 (páginas legales 320/AA), HEAD bca718c: PASS CON OBS
- Acta: .specify/memory/audits/sati-010-T1415-legal-320-aa-2026-11-24.md (capturas en sati-010-T1415-capturas/). Sin commit, sin [x], sin BD ni cuentas.
- 4 pantallas x 4 anchos: sin scroll horizontal, h1 y "Volver a Tipi" -> /login OK, pie con Privacidad/Términos OK a 320. Contraste mínimo 6.03 (muted/fondo), Terracota ausente de texto. axe: 0 violaciones.
- Hallazgo tema oscuro: páginas siempre claras (decisión de Neo). OBS-1 fondo #E8E6D5 vs Crema de marca (9.39 vs 9.67). SC-010-011 cubierto en lo local.

## 2026-11-25 — Validación local casilla 18+ (T1424, 2dce52f): PASS CON OBS (feature 010, sin [x])
- Acta: .specify/memory/audits/sati-010-T1424-casilla-2026-11-25.md. Capturas en scratchpad (fuera del repo). Sin edición de src/ ni pruebas.
- /register y /elige-usuario a 320/1024/1280: etiqueta asociada, Tab+Espacio, foco Terracota 4.48:1, texto 14.63:1, error 8.31:1; sin marcar 0 POST y error en el formulario; marcada -> 201 y /solicitud-en-revision. axe 0 violaciones. Playwright wcag+auth-pet-forms+google-acceso rc 0 (29/29).
- OBS-1 (BAJA) en /register con solo la casilla faltante el foco queda en el botón y el error no tiene role=alert; OBS-2 el error persiste tras marcar.

## 2026-11-25 — Validación local T1431 Acerca de (51c4d67): PASS CON OBS (feature 010, sin [x])
- Acta: .specify/memory/audits/sati-010-T1431-about-2026-11-25.md. Capturas y scripts en scratchpad/t1431 (fuera del repo). Sin edición de src/ ni pruebas. Harness: API+Vite con Google simulado de tests/e2e/admin (BD temporal; es la única vía de sesión admin), ambos procesos detenidos.
- /acerca-de y panel /admin a 320/1024/1280: vacío, texto, foto, 412 con botón de recarga y foco, contador, vista previa, subida PUT con If-Match; axe 0 violaciones; contraste mínimo 6.21; foco Terracota; sin llamadas a /auth/me. Playwright wcag+auth-pet+google rc 0 (29/29); accessibility/ rc 1 por 1 fallo PetForm Día/Mes 36 px (ajeno a T1431).
- OBS-1 (MEDIA-BAJA) una palabra/URL larga sin espacios genera scroll horizontal a 320 y 1024 en /acerca-de y a 320 en la vista previa (min-content de la grilla); OBS-2 botón «Vista previa» 40 px; OBS-3 alt vacío se publica sin exigencia.

## 2026-11-25 — Revalidación T1431 tras fix b2ab1d9: PASS CON OBS (feature 010, sin [x])
- Acta: .specify/memory/audits/sati-010-T1431-reflow-2026-11-25.md. Mismo harness (API+Vite Google simulado, BD temporal), axe 0, sin editar src/ ni pruebas.
- OBS-1 reflow con token largo: sin scroll H en /acerca-de y vista previa a 320/1024/1280; acerca-de-reflow-010 rc 0 (4/4). OBS-2 «Vista previa» 48 px. OBS-3 aviso de alt vacío visible, describedby, no bloquea. Playwright 29/29 rc 0.
- OBS-4 NO corregida (BAJA): `[&_a]:focus-visible:ring-*` compila a `:focus-visible a`; en el enlace box-shadow none, outline nativo azul. Sugerido `[&_a:focus-visible]:ring-*` en AboutPage.tsx:37 y AboutPanel.tsx:17.

## 2026-11-25 — Revisión tipografía propia Tipi Display (zip en raíz)
- Acta `.specify/memory/audits/sati-010-tipografia-display-2026-11-25.md`: PASS CON OBS. woff2 válidos (wOF2, 16.1/16.5 KB), 0 glifos españoles faltantes, contraste Bosque/Crema 9.67, Terracota 3.67 (solo grande), 2.63 sobre Bosque (prohibido), 320/1024/1280 sin desborde.
- OBS-1 MEDIA: «¡» casi idéntico a «i» (no desciende); OBS-2 Á choca con vértice; OBS-3 sin licencia en metadatos. Diff de styles.css (web y admin) y tailwind.config.ts propuesto, NO aplicado. Nada en src/tests/public; sin [x], sin push.
- 2026-11-25 [sati] T1510 Bloque A: PASS CON OBS (3 BAJA, por lectura de código, sin navegador); acta sati-011-T1510-bloqueA-2026-11-25.md; sin código tocado.
- 2026-11-25 [sati] T1516 Bloque B etiqueta IA: PASS CON OBS (3 BAJA; contraste 14.2-17.9:1, asociación aria-describedby OK, 1 etiqueta/superficie, INV-IA11-001 OK); acta sati-011-T1516-bloqueB-2026-11-25.md; sin código, sin [x].
- 2026-11-25 [sati] T1530 Bloque D delegados: PASS CON OBS (2 MEDIA: borde campos 2.6:1, foco tras Cancelar; 5 BAJA; por lectura, sin navegador); acta sati-011-T1530-bloqueD-2026-11-25.md; sin código, sin [x].
- 2026-11-25 T1535 Bloque E validado (PASS CON OBS); acta en .specify/memory/audits/sati-011-T1535-bloqueE-2026-11-25.md.

## 2026-11-25 — T1535 Bloque E re-verificación tras fix /keymaker: CERRADO
- Acta: sección «Re-verificación tras corrección de /keymaker» en sati-011-T1535-bloqueE-2026-11-25.md. 320/1024/1280 sin scroll H (sw=cw), nombre de 50 car. envuelve dentro del nav, foco Tab con ring Terracota. Sin código ni specs tocados.

- 2026-11-25 Bloque F (#59) T1538-T1539: validacion WCAG con Playwright sobre HouseholdPhoto real; FAIL por S-1 (foco a body tras cerrar Quitar, boton disabled en trigger). Acta en .specify/memory/audits/sati-011-T1538-T1539-bloqueF-2026-11-25.md.
- 2026-11-25 [sati] Re-verificación Bloque F: S-1/S-2 CERRADOS en navegador real; acta actualizada; sin código ni specs tocados.

## 2026-11-25 T1544 Bloque G álbum del hogar
Validación WCAG 2.2 AA en vivo (API 3200/SPA 5273, 2 mascotas con fotos): PASS CON OBS. Acta en .specify/memory/audits/sati-011-T1544-album-bloqueG-2026-11-25.md. Sin edición de código.

## 2026-11-25 Re-chequeo T1544 Bloque G
OBS-1/2/3 CERRADAS en navegador real (3200/5273). Reflow y axe 0. Residual: foco pasa a BODY ~300 ms durante la carga (disabled), se recupera al terminar.

## 2026-11-25 T1550 Bloque H tope de hogares
FAIL en navegador real (3200/5273): S-1 describedby ignorado por Button, S-2 foco a BODY; reflow y axe 0. Acta .specify/memory/audits/sati-011-T1550-tope-hogares-bloqueH-2026-11-25.md.

## 2026-11-25 Re-auditoría T1550 Bloque H (tras /keymaker)
S-1, S-2 (3 escenarios) y OBS-1 CERRADOS en navegador real (3200/5273, SQLite nueva). Reflow y axe 22aa 0. Acta con sección «Re-auditoría tras corrección de /keymaker». Sin código ni specs tocados.

## 2026-11-25 — T1556 validación a11y Bloque I (foto de perfil)
- Render real API 3200/SPA 5273, SQLite nueva, usuarios con y sin foto; axe wcag2a/aa/21/22aa = 0 en 24 combos y con recortador abierto.
- FAIL: H-1 foco a BODY tras cancelar/guardar/quitar; H-2 cero role=status; H-3 scrollWidth 323 vs 320 con recortador abierto a 320.
- OBS: role=img interactivo sin describedby, sin confirmación en Quitar foto, sin texto de estado de la foto en /cuenta, nav del header +3 px (preexistente).
- Acta: .specify/memory/audits/sati-011-T1556-avatar-usuario-bloqueI-2026-11-25.md. Sin cambios de código.
- 2026-11-25 Re-auditoria T1556: H-1/H-2 cerrados, H-3 abierto (323/320, section sin min-w-0), O-5 nueva; acta ampliada; servidores 3200/5273 detenidos.

## 2026-11-25 Re-medicion corta T1556 tras /keymaker
- H-3 y O-5 CERRADOS en vivo (3200/5273, SQLite nueva): 320/320, 1024/1024, 1280/1280 con recortador abierto, con y sin foto; preview 220 a 320. H-1/H-2 siguen cerrados, axe 0. Acta ampliada; sin tocar codigo ni specs.

## 2026-11-25 T1573 REQ-HOG11-008 opción B
- Revisión a11y/diseño en 3200/5273 con SQLite nueva: PASS CON OBS (axe 22aa 0 violaciones; reflow sin desborde; contraste >= 7.58:1).
- OBS-1 «1 vencidas» (plural), OBS-2 lectura continua, OBS-3 aria-label vs h4, OBS-4 «0 alertas» largo; OBS-5 ajena.
- Acta: .specify/memory/audits/sati-011-T1573-hogar-datos-bloque-2026-11-25.md

## 2026-11-26 TECHDEBT-011-ALB-TAB320 (commit 166e6c0)
- Validación Playwright en app real (3190/5190 nuevo; 5191 worktree anterior), SQLite nueva: PASS CON OBS. 320/1024/1280 sin desborde; 6 pestañas visibles; Álbum 66 px completo a 320 (3 filas). Anterior: barra 570/254 y 4 pestañas ocultas a 320.
- axe 0 violaciones (6 pestañas x 3 anchos). Foco visible en las 6 (anillo 4,48:1 vs blanco, 3,10:1 vs accent); subrayado 8,16:1.
- OBS-1: 3 filas a 320 (160 px alto), huecos irregulares; no bloqueante.
- Acta: .specify/memory/audits/sati-011-TECHDEBT-ALB-TAB320-2026-11-26.md (evidencia en carpeta sati-011-ALB-TAB320-evidencia/). Procesos y worktree temporales cerrados.
- 2026-11-27 T1638 auditoria WCAG Bloque B: APTO CON RESERVAS; acta sati-012-bloqueB-T1638-2026-11-27.md (A11Y-012-B-01..09).

## 2026-11-27 T1658 Modo Cuidador
- Medido en 3210/5210 (SQLite nueva): axe 22aa 0, reflow 320/1024/1280 ok, literales de contrato ok. Reservas M-1..M-4 (foco a BODY al cerrar, sin foco al abrir, errores lejos, aria-invalid nunca). Vista cuidador no verificada.
- Acta: .specify/memory/audits/sati-012-T1658-2026-11-27.md

## 2026-11-28 T1678 (parte sati) y T1683 dictamen QR
- Medido en Chromium + vite 5262 con API simulada: pantalla /e/ axe 0 violaciones en 5 estados x 320/1024/1280, sin desborde. QR A6: imagen 60 mm incl. silencio (módulo 1,22 mm, símbolo 50,2 mm); PNG 1024 px crujiente (módulo 20,9 px).
- Veredicto CUMPLE CON RESERVAS en ambas. MEDIA-1: la hoja A6 es position:fixed, sale en Letter y se repite en cada página (PDF 15 KB/página vs 950 B). BAJA-1 PNG módulo no entero; BAJA-2 sin main/h1 en LOADING/ERROR; BAJA-3 teléfono sin formato ni tel:. Sin decodificador QR: falta prueba física de Neo.
- Acta: .specify/memory/audits/sati-012-T1678-T1683-2026-11-28.md (evidencia en carpeta sati-012-T1678-T1683-evidencia/). vite cerrado. Sin ediciones en src/ ni specs/.
