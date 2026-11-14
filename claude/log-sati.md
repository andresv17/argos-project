
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
