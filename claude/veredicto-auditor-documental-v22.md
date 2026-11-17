# Veredicto de Oracle: auditoría documental ui_blueprint v2.2 + tasks.md T287/T288 (2026-11-14)

**Veredicto: APTO CONDICIONADO.** tasks.md es APTO sin reservas. El blueprint v2.2 aplica bien las tres enmiendas de Neo (H-K-3, H-K-4, H-K-5) pero conserva una contradicción de contrato (ALTA) en §4.5 y tres contradicciones internas medias. Modo auditoría: no se tocó src/, tests/, specs/, contratos ni logos.json. Sin commits. No se ejecutó test:gate ni Playwright.

## 1. specs/002-plataforma-v21/tasks.md: CUMPLE
- `git diff --stat`: 1 archivo, 2 inserciones y 2 borrados (L243-244 de la versión nueva).
- T287 (L243): redacción de navegación directa en cuatro enlaces (Mascotas, Hogares, Respaldo, Perfil) dentro de `<nav aria-label="Principal">`, sin menú del avatar, sin barra inferior. Coincide con REQ-UI2-001 enmendado (`spec.md:263`).
- T288 (L244): riel flex con scroll (`listbox`/`option`, no grilla), cuatro flechas, Home, End, Enter y Espacio, desbordamiento a 320/768/1024/1280 px. Coincide con blueprint §4.2/§4.8 (L304, L458) y decisión 6 (L44).
- Casillas `[ ]` intactas; IDs, etiquetas `[P]`/`[US8]` y requisitos citados idénticos; sin cambio de COMPLETED/APPROVED/LOCKED. El diff no toca ninguna otra línea.

## 2. ui_blueprint.md v2.2: coherencia

Enmiendas verificadas y coherentes:
- §4.3 L346 "Solo lectura" = ninguna de las cuatro escrituras (`writeHealthEvents`, `writeWeightsAndMeasurements`, `writeAppointmentsAndParameters`, `editPetBasics`). Coincide con RBAC (`architecture_spec.md:325-334`), `spec.md:265` y con `view-model.ts:127` (`isReadOnly`). L440 lo repite sin conflicto. L374: "Registrar peso" depende de `writeWeightsAndMeasurements` (coherente con RBAC).
- §4.6 L428: EDIT sustituye hero y bento y "Editar" desaparece; sin contradicción con L346 (botones en VIEW) ni con el diagrama L256 (modo VIEW).
- §5.2 L481: "tu rol: {rol real}" (ADMIN/CAREGIVER/READER) más " (Propietario)" si `isHouseholdOwner`; aclara que Propietario no es rol. Coincide con `architecture_spec.md:252` (`myRole` ∈ ADMIN|CAREGIVER|READER, `isHouseholdOwner` booleano) y `spec.md:236`.
- Aviso de sesión L519: `role="status"`, sin "Mantener sesión", sin sondeo, sin controles inertes, renovación con petición autenticada. Coherente con `architecture_spec.md:37` (sin sondeo ni temporizadores) y T293 (`tasks.md:247`). Ver H-V22-6 (baja).
- Archivo archivado: `claude/archivo/ui_blueprint-v2.1.md` existe (62465 B).

### Hallazgos

**H-V22-1 (ALTA, contradicción de contrato): bloque de registro condicionado a `editPetBasics` (`ui_blueprint.md:388`).**
Dictamen sobre la pregunta de Sati: es contradicción de contrato, no decisión pendiente. Razones en disco:
1. La matriz RBAC vigente (`architecture_spec.md:331,333`; `spec.md` REQ-RBAC-001 L219-234) da a CAREGIVER `writeHealthEvents` y `writeWeightsAndMeasurements`. `spec.md:36` y `:44` dicen que el Cuidador registra pesos y eventos sanitarios. SC-008 (`spec.md:346`) exige que las acciones visibles coincidan al 100 % con la matriz. `spec.md:265`: "las acciones que la matriz niega no existen"; a la inversa, las que concede deben existir.
2. `architecture_spec.md:409` (B-3) documenta el gating por `editPetBasics` como brecha (defecto) de la 001, no como norma. El blueprint la eleva a regla ("gating B-3 preservado") y la lista en el Apéndice A (L680) como brecha vigente, sin decisión de Neo que la ratifique.
3. El código ya la superó: `PetDashboard.tsx:285` usa `canWrite = permissions[RECORD_WRITE_PERMISSION[módulo]]` (`records.ts:140-147`: pesos/medidas -> `writeWeightsAndMeasurements`, vacunas/desparasitación -> `writeHealthEvents`, consultas/parámetros -> `writeAppointmentsAndParameters`). El blueprint describiría una UI inferior a la ya construida; Keymaker no debe implementar L388 tal cual.
4. Contradicción interna: L374 muestra "Registrar peso" al CAREGIVER (`writeWeightsAndMeasurements`) y su acción "abre el módulo Peso y su formulario" (L379-380), pero con L388 ese formulario no existe para él: control inerte, lo que el propio blueprint prohíbe. Además L346 no marca "Solo lectura" al CAREGIVER (tiene escrituras) y L440 sin "bloque de registro" lo deja sin ninguna acción visible.
Corrección propuesta (Sati/Architect, requiere decisión de Neo si se quiere conservar el gating): el bloque de cada módulo se condiciona al permiso de su módulo (tabla de `records.ts:140`), y se retira "B-3" de L388 y L680.

**H-V22-2 (MEDIA, contradicción interna): §3.2 L220 dice "Tres `NavLink`"** y la misma tabla lista cuatro (Mascotas, Hogares, Respaldo, Perfil; L222-226). Contradice T287 y REQ-UI2-001 (cuatro enlaces). Corregir a "Cuatro".

**H-V22-3 (MEDIA, texto obsoleto): L226 y L240 describen una discrepancia ya cerrada.** L226 dice que REQ-UI2-001 "lo pide (menú de avatar en la spec 002)" y L240 que "esto ajusta la maqueta móvil de REQ-UI2-001". Tras la enmienda (`spec.md:263`: navegación directa, sin menú, sin barra inferior) ya no hay ajuste ni discrepancia: el blueprint se alinea con la spec. Reescribir como "conforme a REQ-UI2-001 enmendado". Igual C15 (L31) y la decisión 7 (L45) que presentan la barra inferior como "descartada frente a la spec": ahora es la spec.

**H-V22-4 (MEDIA, spec.md, a cargo de Architect): escenarios de aceptación obsoletos.** `spec.md:154` ("abre el menú del avatar... ve Perfil y Cerrar sesión") y `:155` ("ve la barra inferior") contradicen el REQ-UI2-001 enmendado (L263, sin menú ni barra inferior). Igual `spec.md:361` ("el avatar abre «Perfil» en escritorio"). La enmienda se aplicó solo al requisito y no a sus escenarios; hoy una prueba derivada de los escenarios exigiría exactamente lo que T287 prohíbe. Debe armonizarlos Architect (el blueprint no se toca por esto).

**H-V22-5 (BAJA): historial incompleto.** El Apéndice C no tiene fila v2.2 (el encabezado L3 declara v2.2) y la fila 2.1 precede a la 2.0. La tabla §0 (L15-31) tampoco registra cambios de v2.2 (C16+). Apéndice E L624: lista de enlaces sin "Perfil".

**H-V22-6 (BAJA): aviso de expiración sin disparador definido.** L519 prohíbe sondeo y `architecture_spec.md:37` prohíbe temporizadores, pero no se dice qué hace aparecer el aviso previo (T293, REQ-UI2-006). Aclarar el disparador (p. ej. cálculo a partir de la última petición autenticada al montar/volver a una acción), o el aviso queda indefinido para Keymaker.

## 3. Archivo
`claude/archivo/ui_blueprint-v2.1.md` existe: CUMPLE.

## Resumen
tasks.md APTO. Blueprint v2.2: enmiendas H-K-3/4/5 correctas; APTO CONDICIONADO a corregir H-V22-1 (alta) antes de que Keymaker implemente módulos de registro, y H-V22-2/3/4 (medias). Los puntos bajos no bloquean.
