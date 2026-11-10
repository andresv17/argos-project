# Fase 2 — Análisis de la Especificación Técnica v2.1 contra la Feature 001

Autor: Architect · Fecha: 2026-11-10 · Estado: PROPUESTA (análisis y planificación, sin implementar) · Despachado por Morpheus con la aprobación de Neo (Nivel 2).
Fuentes: `Argos - Especificación Técnica de UI_UX y Pantallas.docx` (v2.1, convertida a texto), `specs/001-pet-health-tracker/{spec,plan,tasks}.md`, `contracts/`, constitución v3.0.0, `hallazgo-6-traduccion-errores.md`, `backlog-feature-002.md`.
Este documento no modifica `specs/**`, `contracts/**`, `src/**`, `tests/**`, `tasks.md` ni la constitución.

Leyenda de la columna Tipo: AMPLIACIÓN = la v2.1 añade algo que la 001 no prohíbe; CAMBIO = la v2.1 modifica una regla de la 001 sin contradecirla en el fondo; CONFLICTO = ambas no pueden cumplirse a la vez (hay que elegir una).

---

## A. Brecha v2.1 contra 001

| # | Tema | Spec 001 (Approved) | Spec v2.1 | Tipo | Impacto principal |
|---|------|---------------------|-----------|------|-------------------|
| A1 | Autenticación (mecanismo) | Sesión por cookie HttpOnly, 7 días, revocable (`STATE-AUTH-SESSION-001`, `INV-AUTH-004`, CSRF `INV-AUTH-007`) | P-01 habla de "JWT firmados o sesiones mediante SSO/OAuth2" | CONFLICTO (parcial) | Un JWT sin estado no se puede revocar al cerrar sesión (REQ-AUTH-003). Hay que fijar sesión de servidor y tratar "JWT" como texto sin decidir. Decisión Nivel 2 de Neo. |
| A2 | Identificador: email vs usuario | `username` único, `^[a-z0-9._-]+$`, 3–30; invitar por `username` (`INV-AUTH-001`, `INV-HOUSE-003`) | Login y registro por `email` (RFC 5322); P-02 pide `full_name`, `email`, `terms_accepted`; invitar por correo (P-16) | CONFLICTO | Cambia `identity.schema.json`, `RegisterUserInput`, `LoginInput`, `InviteMemberInput`, OpenAPI, errores (`ERR-AUTH-USERNAME-TAKEN`, `ERR-AUTH-USER-NOT-FOUND`), anti-enumeración y las pruebas de seguridad. Invitar por correo implica enviar correo (dependencia externa Nivel 2) o dejar la invitación pendiente hasta que el correo se registre. |
| A3 | SSO (Google, Apple, SAML) y vinculación de cuentas | No existe | P-01, P-02, P-04: botones SSO y switches de vinculación | AMPLIACIÓN (alto costo) | Dependencias externas Nivel 2 (OAuth, SAML), secretos, callbacks, modelo de identidades vinculadas. Se propone diferir fuera del primer corte de la 002. |
| A4 | Recuperación de acceso (P-03) | No existe | Magic token temporal por correo; respuesta 200 siempre | AMPLIACIÓN | Exige canal de correo (Nivel 2), tabla de tokens con caducidad, nuevo error y máquina de estados. Hoy no hay forma de recuperar contraseña. |
| A5 | Política de contraseña | 8–128, al menos 1 letra y 1 dígito (`INV-AUTH-002`) | P-01: mínimo 8; P-02: mínimo 10, 1 mayúscula, 1 número, 1 carácter especial, confirmación | CONFLICTO (y la v2.1 se contradice a sí misma: 8 en login, 10 en registro) | Cambia `INV-AUTH-002`, `ERR-AUTH-WEAK-PASSWORD`, regex del esquema y fixtures. El login debe aceptar contraseñas viejas (de 8) o forzar un cambio. Se propone: la política nueva solo al registrar o cambiar; el login solo exige no vacío. |
| A6 | Timeout de sesión | Absoluto de 7 días (`INV-AUTH-004`) | No define timeout de inactividad | Hueco en ambas (hallazgo 3) | Ver B1. |
| A7 | Especies | `DOG \| CAT` (`$defs/Species`) | `CANINE \| FELINE` (solo dos especies; el §1.1 limita el producto a caninos y felinos) | CAMBIO de nombres; y CONFLICTO con el pedido de Neo de más especies (hallazgo 2) | Renombrar rompe contrato, generados, fixtures y respaldos 1.0.0/2.0.0. Ver B2. |
| A8 | Sexo | `MALE \| FEMALE` | `MALE \| FEMALE` | Sin brecha | Coinciden. |
| A9 | Campos nuevos de mascota | `name`, `species`, `breed`, `birthDate`, `sex`, `avatarUrl` | Añade `neutered`, `microchip_id` (`^\d{15}$`, opcional, con detección de duplicados), edad estimada, `household_id` base, foto por drag & drop | AMPLIACIÓN | Cambio de `pet.schema.json` (versión mayor o menor aditiva), nueva invariante de unicidad de microchip, subida de imagen (almacenamiento, Nivel 2 si es externo). `birth_date` no futura ya existe en la 001. |
| A10 | Roles de hogar | `OWNER` / `MEMBER` en el hogar; solo el dueño de la mascota escribe (`INV-ACC-002`); todos los miembros leen | Administrador de Hogar / Cuidador / Lector (P-14 dice "Admin / Miembro", P-15 dice "Administrador, Cuidador, Lector": incoherente); además "Propietario Legal" por mascota | CONFLICTO | La 001 prohíbe que un tercero edite lo ajeno; la v2.1 deja al Cuidador escribir pesos y eventos y al Admin editar datos básicos. Rediseña `INV-ACC-002`, `INV-HOUSE-001/002`, `household-membership.machine.json`, `HouseholdMemberView`, el rol por membresía y el cambio de rol (nuevo evento). Es el punto de mayor impacto de seguridad. |
| A11 | RBAC §5 (matriz) | Una regla: dueño escribe, miembros leen | Matriz de 8 acciones por 4 roles; Admin edita datos básicos y elimina eventos sanitarios; Cuidador registra eventos y pesos pero no los elimina; Lector solo exporta | CONFLICTO | Hay que modelar permisos como función pura `can(rol, acción)` con contrato propio y pruebas de matriz completa (32 celdas). Incoherencia a aclarar: el Lector "exporta respaldo" de datos ajenos, mientras 001 exporta "solo las mascotas del usuario" (`REQ-BACKUP-001`). |
| A12 | Transferir propiedad legal de mascota | `ownerUserId` inmutable vía API (`INV-OWN-001`) | Operación "Transferir Propiedad Legal" solo para el Propietario | CONFLICTO con `INV-OWN-001` | Nueva operación y estado, nueva invariante, afecta colores de dueño y respaldo. Necesaria también para P-05 y la protección contra huérfanos. |
| A13 | Eliminación y perfil de cuenta (P-04, P-05) | No existe; no hay edición de perfil | Perfil (nombre, avatar, idioma, zona horaria), modal con texto literal `ELIMINAR MI CUENTA`, re-autenticación, descarga previa de respaldo, bloqueo si es propietario único de un hogar compartido | AMPLIACIÓN | Nuevos endpoints, cascada de borrado, errores y pruebas de privacidad (Rama). Ver B3. |
| A14 | Zona horaria del usuario | Reloj del sistema, `diffInCalendarDays` | "Día civil del usuario" con `timezone` en el perfil | CAMBIO | El dominio hoy no conoce la zona; hay que decidir si el día civil es UTC (001) o el del usuario. Afecta `STATE-ALERT-001` y sus pruebas de propiedades. |
| A15 | Pantallas | 6 pantallas (registro/login, mascotas, ficha con 6 módulos, hogares, respaldo, selector de contexto) | 19 pantallas/modales P-01..P-19 y rutas en español (`/mascotas`, `/hogares`, `/respaldo`, `/cuenta`, `/mascotas/[id]/biometria`...) | AMPLIACIÓN + CAMBIO de rutas | Ver tabla A-bis. |
| A16 | Registros sanitarios | Vacunas y desparasitaciones con `STATE-ALERT-001` | Añade lote, veterinario y número de colegiado; categoría con desparasitante interno/externo; "¿requiere próxima dosis?" | AMPLIACIÓN (a verificar cuáles ya están en `medical-records.schema.json`) | Cambio aditivo de esquema; revisar con Maggie. |
| A17 | Historial clínico con adjuntos | Seis colecciones; sin archivos | P-11: línea de tiempo con PDF adjuntos | AMPLIACIÓN (alto costo) | Almacenamiento de archivos, límites de tamaño, antivirus/XSS, respaldo con binarios. Nivel 2. |
| A18 | Respaldo: formato y modo | Sobre `schemaVersion 2.0.0`; importación solo reemplaza atómicamente (`REQ-BACKUP-002`, `STATE-BACKUP-001`); máx. 10 MB | Snapshot "v2.1"; P-19 ofrece Merge idempotente (recomendado, por fecha de modificación) y Reemplazo destructivo; conteo previo; detección de colisiones de ID y microchip; barra de progreso | CONFLICTO parcial + AMPLIACIÓN | El "Reemplazo destructivo" equivale a la 001. El Merge es nuevo: exige `updatedAt` confiable, regla de resolución de conflictos, idempotencia probada con propiedades y nueva máquina de estados (validar → previsualizar → ejecutar). La barra de progreso choca con la atomicidad (una sola transacción: el progreso solo puede ser de fase). La versión "v2.1" del sobre debe migrar 1.0.0 y 2.0.0. |
| A19 | Auditoría con hashes de estado | No existe registro de auditoría; solo invariantes | Toda mutación registra `timestamp`, `executor_user_id`, `mutation_type`, `previous_state_hash`, `new_state_hash` | AMPLIACIÓN | Nuevo puerto/adaptador de auditoría, algoritmo de hash canónico (serialización determinista), política de retención y privacidad (Habeas Data: el log no puede contener secretos, `INV-AUTH-003`), y qué pasa con el log al eliminar la cuenta. |
| A20 | Protección contra huérfanos | Eliminar un hogar no afecta mascotas; eliminar la cuenta no existe | Una mascota no puede quedar sin Propietario Legal; el dueño que elimina cuenta o abandona un hogar debe transferir antes | AMPLIACIÓN, interactúa con A12 y A13 | En la 001 el dueño de la mascota nunca "abandona" porque la mascota es suya; la regla de la v2.1 supone mascotas administradas por hogar (A21). |
| A21 | Mascota asociada al hogar | Las mascotas son del usuario; el hogar solo comparte la vista | P-07 `household_id` "Hogar base"; P-15 "Mascotas asignadas" con permisos por miembro | CAMBIO de modelo | Hoy no existe relación mascota-hogar; la visibilidad deriva de la membresía común (`INV-ACC-001`). Hay que decidir si una mascota pertenece a un hogar (modelo nuevo) o sigue la regla actual. |
| A22 | Inmutabilidad `SUPERSEDED` | `SUPERSEDED` es un estado calculado (hay un registro posterior de la misma clave); los registros se pueden editar o eliminar por el dueño | Un evento en `SUPERSEDED` no puede modificarse; solo se supera con un registro nuevo (relación de superseción); acordeón de histórico | CONFLICTO parcial | La 001 permite editar o borrar registros antiguos y `SUPERSEDED` se recalcula; la v2.1 los vuelve inmutables y exige un vínculo explícito (`supersedesId`). Cambia `STATE-ALERT-001` (calculado vs persistido), `UpdateRecord`/`DeleteRecord` y los respaldos. |
| A23 | Sistema de diseño y shell | Tailwind, distinción no solo por color, `colorToken` (8 tokens `OWNER_COLOR_n`) | Tokens de superficie, semáforo con iconos y textos exactos, 8 colores por hash de `user_id`, header 64 px, bottom-bar móvil de 48 px, iconos Lucide/Heroicons | AMPLIACIÓN / CAMBIO menor | Dos puntos finos: la v2.1 asigna el color por hash de `user_id`; la 001 por posición en la lista de miembros activos (`INV-HOUSE-005`). La librería de iconos es una dependencia Nivel 2 (constitución §2). Breakpoint a 768 px vs verificación en 320/1024/1280. |
| A24 | Búsqueda y filtros | Filtros por nombre (y los que defina REQ-UI-001) | Debounce de 300 ms; filtros Todos, Perros, Gatos, Con alertas | AMPLIACIÓN | Filtros por especie dependen de A7. |

### A-bis. Pantallas P-01..P-19 contra las 6 de la 001

| Pantalla v2.1 | Equivalente en 001 | Estado |
|---------------|--------------------|--------|
| P-01 Iniciar sesión | Pantalla 1 (registro/login) | Existe; cambia email, SSO, JWT |
| P-02 Registro | Pantalla 1 | Existe; cambian campos y política |
| P-03 Recuperar acceso | Ninguna | Nueva |
| P-04 Perfil y cuentas vinculadas | Ninguna | Nueva |
| P-05 Modal eliminar cuenta | Ninguna | Nueva |
| P-06 Directorio de mascotas | Pantalla 2 (lista) | Existe; añade filtros, skeleton, estados |
| P-07 Nueva mascota | Formulario de alta | Existe; añade campos |
| P-08 Editar mascota | Formulario de edición | Existe; añade guarda RBAC |
| P-09 Cartilla sanitaria | Ficha, módulo vacunas/desparasitaciones | Existe; añade acordeón SUPERSEDED |
| P-10 Biometría y peso | Ficha, módulo peso | Existe |
| P-11 Historial clínico | Ficha, módulos de visitas/parámetros | Existe como lista; la v2.1 pide línea de tiempo y adjuntos |
| P-12 Registrar evento sanitario | Formulario | Existe; añade lote y veterinario |
| P-13 Añadir peso | Formulario | Existe; rango 0.05 < W ≤ 150 kg: verificar contra el esquema |
| P-14 Directorio de hogares | Pantalla de hogares | Existe |
| P-15 Detalle de hogar | Parte de hogares | Existe; roles y mascotas asignadas son nuevos |
| P-16 Invitar miembro | Formulario de invitación | Existe; correo y rol inicial son nuevos |
| P-17 Crear / editar hogar | Formulario de hogar | Crear existe; editar y descripción son nuevos |
| P-18 Centro de respaldos | Pantalla de respaldo | Existe |
| P-19 Validar e importar | Parte de respaldo | Nueva (previsualización, modos, colisiones) |

Resumen: de 19 pantallas, 9 existen con cambios, 4 existen como parte de otra y se separan, 6 son nuevas (P-03, P-04, P-05, P-11 como línea de tiempo, P-17 edición, P-19). Las rutas actuales deben mapearse a las rutas en español de la v2.1.

### Incoherencias internas de la v2.1 (a resolver antes de especificar)
1. Contraseña: mínimo 8 en P-01 y 10 con complejidad en P-02.
2. Roles de hogar: "Admin / Miembro" (P-14) frente a "Administrador / Cuidador / Lector" (P-15, P-16) y "Propietario Legal" (§5).
3. Payload de login con `"password": "string_argon2id_hash"`: la contraseña nunca debe viajar hasheada desde el cliente; el hash se hace en el servidor (`INV-AUTH-003`).
4. Auth: JWT frente a sesiones; "SAML enterprise" en un producto de uso doméstico.
5. Exportar respaldo permitido al Lector sobre datos ajenos, frente al principio de aislamiento de datos (`REQ-BACKUP-001`, SC-003).
6. Peso en kg con tope 150: no cubre otras especies (relevante si se amplía B2).
7. Hash de `user_id` para el color frente a la posición en la lista (`INV-HOUSE-005`); el hash puede repetir color en un hogar de 3 personas.
8. P-19: barra de progreso 0–100 % frente a una importación atómica en una transacción.
9. El nombre "Andrés Vallejo" aparece fijo en el header (ejemplo de maqueta; debe ser `displayName`).
10. "Bottom-bar de 4 ítems" incluye `/cuenta`, que en el header de escritorio no aparece.

---

## B. Respuesta a los hallazgos 3, 4, 5 y 6

Nota de numeración: en este documento los hallazgos son los de la orden de Morpheus (3 timeout, 4 especies, 5 cuenta y perfil, 6 hogares). El archivo `hallazgo-6-traduccion-errores.md` usa "hallazgo 6" para otro tema (mensajes de error) y el backlog usa 2, 5 y 7 con otro significado. Conviene que Morpheus unifique la numeración en el registro.

### B1. Hallazgo 3 — Timeout de sesión

Situación actual: `INV-AUTH-004` fija una vigencia absoluta `expiresAt = createdAt + 7 días`. No hay inactividad. Si el usuario deja el equipo abierto, la sesión sigue válida hasta 7 días.

Propuesta:
- Timeout de inactividad de 30 minutos (valor propuesto, a confirmar por Neo; configurable por constante de dominio, no por entorno, para que sea determinista y probable).
- Tope absoluto: bajar de 7 días a 12 horas si se quiere un perfil de "grado clínico"; o mantener 7 días como techo si Neo prefiere comodidad. Recomendado: absoluto de 24 horas, inactividad de 30 minutos. Aceptar el valor es decisión de Neo.
- Modelo: la sesión guarda `lastActivityAt`. Una sesión es válida si no fue revocada, `ahora < createdAt + absoluto` y `ahora < lastActivityAt + inactividad`. Cada petición autenticada exitosa renueva `lastActivityAt` (deslizante), con una granularidad mínima (p. ej. solo si pasaron más de 60 s) para no escribir en cada llamada.
- Cliente: aviso 2 minutos antes de expirar ("Tu sesión expirará por inactividad", con botón "Seguir conectado" que hace una petición `GET /auth/me`) y, al expirar, redirección al login con el mensaje de sesión expirada y conservación de la ruta para volver (`returnTo` interno, validado contra redirección abierta).
- Contratos que tocaría: `INV-AUTH-004`, `STATE-AUTH-SESSION-001` y `auth-session.machine.json` (nuevo motivo de salida `EXPIRED_IDLE`), esquema de sesión (`lastActivityAt`), OpenAPI (cabecera o campo de expiración en `SessionView`), `ERR-AUTH-UNAUTHENTICATED` (sin cambio de código). Pruebas: reloj inyectado, propiedades sobre ventanas, E2E con reloj simulado, exploit "sesión expirada" de los 9 vectores (Sentinels).
- Relación con "cierre al recargar": hay dos mecanismos que no deben confundirse. (a) La cookie de sesión HttpOnly es lo que mantiene la sesión al recargar; el cliente, al arrancar, llama `GET /auth/me` y restaura el estado. Recargar no debería cerrar la sesión. Si hoy el usuario percibe que recargar cierra la sesión, es un defecto de arranque (la SPA no consulta `/auth/me` antes de decidir la redirección, o la cookie se emite sin atributos adecuados). Debe reproducirse y probarse antes de diseñar (lo verifica Keymaker/Seraph con E2E: login, recargar, seguir autenticado). (b) Si Neo quiere que cerrar la pestaña o el navegador termine la sesión, se logra con cookie de sesión del navegador (sin `Max-Age`) más el timeout de inactividad; recargar no cierra una cookie de sesión. No se recomienda forzar el cierre en `beforeunload`, porque no distingue recarga de cierre y es poco fiable.
- Clasificación: es una enmienda de la 001 (Nivel 2: invariante de una spec Approved) o parte de la 002. Si Neo quiere el timeout antes de la 002, es una enmienda pequeña y aislada de la 001; si no, entra en el primer bloque de la 002.

### B2. Hallazgo 4 — Especies

La v2.1 solo conoce `CANINE | FELINE`. El pedido de Neo (backlog, hallazgo 2) es abrir más especies. Son dos decisiones separadas: nombres del enum y lista de especies.

Propuesta:
- Nombres canónicos: adoptar los de la v2.1 (`CANINE`, `FELINE`) con migración `DOG→CANINE`, `CAT→FELINE` en la migración de respaldos (`STATE-BACKUP-001` ya migra 1.0.0; se añade el salto de 2.0.0 al nuevo sobre) y en los datos persistidos. Alternativa de menor costo: conservar `DOG|CAT` y traducir solo en presentación; es lo más barato pero deja dos vocabularios.
- Lista: cerrada con valor de escape: `CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER` con `speciesOther` (texto libre 1–40, obligatorio solo si `OTHER`). Qué especies exactas lo define Neo (pregunta 1 del backlog).
- Reglas clínicas (Maggie): el semáforo `STATE-ALERT-001` depende solo de fechas y sigue siendo válido para cualquier especie. Las curvas de peso ideal, alertas geriátricas (+10 años), rangos de peso (tope de 150 kg) y calendarios de vacunas son específicos de perros y gatos. Para las especies nuevas: guardar registros sin alertas automáticas de peso y edad hasta que Maggie defina reglas por especie. Los rangos de `weight` deben revisarse para aves y roedores (el mínimo de 0.05 kg de la v2.1 deja fuera a muchas aves pequeñas y aún más a algunos reptiles).
- Impacto en contratos: `pet.schema.json` `$defs/Species` (cambio de enum = versión mayor 3.0.0 del esquema), nuevo campo opcional/condicional `speciesOther`, `CreatePetInput`/`UpdatePetInput`/`PetListFilter`, `backup-envelope.schema.json` (referencia a Species), OpenAPI, `error-catalog` (sin cambio si `speciesOther` falta usa `ERR-SCHEMA-VALIDATION-FAILED` humanizado por el hallazgo 6 de mensajes), `src/generated/**` (regenerado), fixtures canónicos, filtros de UI (REQ-UI-001: Perros/Gatos/Otros), `INV-PET-*` de edad, y todos los oráculos que codifican `DOG`/`CAT`. Compatibilidad: la importación debe seguir aceptando 1.0.0 y 2.0.0.
- Razas: texto libre como hoy; catálogo por especie queda fuera de este corte.

### B3. Hallazgo 5 — Eliminar cuenta y perfil

Perfil (P-04): hoy la 001 solo tiene `displayName`. Propuesta de corte mínimo: `PATCH /users/me` con `displayName`, `preferredLanguage` (`es` por defecto; sin internacionalización completa), `timezone` (decisión A14) y `avatarUrl` (sin subida de archivos en el primer corte). Cambio de contraseña con re-autenticación. Cuentas SSO vinculadas se difieren (A3).

Eliminación (P-05), regla de propietario único:
1. Precondiciones evaluadas en el servidor (no solo en el modal): sesión válida; re-autenticación con la contraseña actual; texto literal `ELIMINAR MI CUENTA`; descarga de respaldo previa.
2. Descarga obligatoria: el servidor no puede saber si el navegador guardó el archivo. Diseño verificable: `POST /account/deletion-intent` genera el respaldo (REQ-BACKUP-001) y devuelve un `deletionToken` de un solo uso y corta vida; el botón final solo se habilita tras la descarga del archivo; `DELETE /users/me` exige el token. Es una obligación de flujo, no una garantía de que Neo conserve el archivo; eso hay que decirlo en el texto de la spec.
3. Propietario único: si el usuario es `OWNER` de un hogar con otros miembros `ACTIVE` o `INVITED`, el servidor responde `409` con un error nuevo `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD` y la lista de hogares afectados. Opciones que ofrece el modal: (a) transferir la propiedad del hogar (operación nueva: el `OWNER` cede a un miembro `ACTIVE`; mantiene `INV-HOUSE-001`, hay que añadir el evento `TRANSFER_OWNERSHIP` a la máquina de estados); (b) retirar a los miembros y eliminar el hogar (ya existe en la 001). En el primer corte sin transferencia, solo (b) y se indica al usuario que lo haga antes.
4. Hogares donde es solo `OWNER` sin otros miembros: se eliminan en cascada. Membresías como `MEMBER` en hogares ajenos: se pasan a `LEFT`/se borran.
5. Mascotas: se eliminan con todos sus registros. Con el modelo de la 001, la mascota es del usuario y deja de ser visible para sus hogares. Con la protección contra huérfanos de la v2.1 (A20), debe poder transferirse antes; es opcional en el primer corte y obligatorio si Neo adopta roles de Cuidador.
6. Sesiones: se revocan todas. Auditoría: el registro de eliminación se conserva sin datos personales (solo hash del `userId`), a decidir con Rama.
7. Pruebas: propiedad (tras borrar, ninguna fila referencia al usuario), seguridad (IDOR sobre la ruta, CSRF, re-autenticación obligatoria), E2E con dos usuarios (Kid) para el bloqueo, y atomicidad (cascada en una transacción con rollback ante fallo, Smith).
Rama debe revisar el flujo (derecho de supresión, qué queda en logs y respaldos descargados).

### B4. Hallazgo 6 — Verificar hogares: qué debe pasar tras crear un hogar

Supuesto: el pedido se refiere a que, al crear un hogar, el usuario no tiene una confirmación clara de qué ocurrió y cuál es el siguiente paso. Si Neo se refería a otra cosa, hay que precisarlo.

Comportamiento esperado tras crear un hogar (cubierto por `REQ-HOUSE-001`, `REQ-UI-006`, `INV-HOUSE-001`):
1. Servidor: se crea el hogar y la membresía del creador como `OWNER` en `ACTIVE`, `firstJoinedAt` fijado, `colorToken` = `OWNER_COLOR_1` (primer miembro). Respuesta `HouseholdView` con `members` que contiene solo al creador. Un usuario puede tener varios hogares.
2. Cliente: el formulario se limpia, el foco pasa a un mensaje de éxito (`role="status"`: "Hogar «X» creado") y la lista de hogares muestra el nuevo con el rol "Propietario", 1 miembro y 0 invitaciones; el selector de contexto de la barra superior incluye el hogar. Siguiente paso visible: botón "Invitar a una persona" (en la v2.1, se navega a P-15 `/hogares/[id]`).
3. Estado vacío orientador: "Aún no hay otros miembros. Invita a alguien por su usuario para compartir mascotas."
4. Qué NO debe ocurrir: no se comparte ninguna mascota mientras no haya un segundo miembro `ACTIVE`; ningún invitado ve datos hasta aceptar (`INV-HOUSE-004`); crear el hogar no cambia la propiedad de las mascotas.
5. Verificación (E2E con dos navegadores, Kid): A crea el hogar y ve su vista; B no lo ve en su lista; A invita; B ve la invitación con contador; B acepta; ambos ven el hogar; el color del dueño aparece en las mascotas ajenas. Casos negativos: nombre vacío o de más de 60 caracteres, doble envío (idempotencia de UI), ruta de otro usuario (`ERR-HOUSE-NOT-FOUND`).
6. Si el defecto observado es que "al crear no pasa nada", conviene que Keymaker lo reproduzca primero: puede ser un fallo de presentación (sin estado de éxito ni refresco) sin necesidad de tocar la spec.

---

## C. Dos rutas para Neo (decisión de Nivel 2)

### Ruta 1 — La v2.1 reemplaza la 001 mediante una enmienda de Nivel 2

La 001 se reabre: se enmiendan spec.md (hoy Approved), plan.md, tasks.md, contratos y constitución donde haga falta; los requisitos nuevos entran como REQ-* adicionales dentro de la misma feature.

Pros:
- Un solo cuerpo normativo; no queda un "producto 1" distinto del "producto 2".
- Evita migraciones de datos entre dos versiones del contrato: se cambia una vez.
- Ya existe la rama, la trazabilidad (96/96) y el flujo de compuertas.

Contras:
- Destruye la línea base verde: auth, identidad, esquema de mascota, hogares, respaldo y semáforo cambian a la vez; las tareas T001–T055 marcadas `[x]` quedan invalidadas y habría que reabrirlas, lo que contradice el sentido de "COMPLETED" y el techo de agentes.
- Pierde la capacidad de entregar la 001 como versión estable (T056 y T057 aún abiertas).
- Revisión enorme de una spec Approved y una constitución v3.0.0 (cambios de pila: correo, SSO, iconos, almacenamiento) con alto riesgo de regresión.
- Contradice la decisión que Neo ya tomó (hallazgos 2, 5 y 7 a la Feature 002 tras cerrar la 001).

Qué pasa con pruebas y contratos: se modifican en el mismo sitio. Cambian `identity`, `pet`, `common` (si hay nuevos tipos), `backup-envelope`, `household-membership.machine.json`, `auth-session.machine.json`, `sanitary-alert.machine.json`, `error-catalog.json` y OpenAPI; se regeneran `src/generated/**`; se reescriben o eliminan las pruebas que codifican `DOG/CAT`, `username`, política de contraseña, `INV-ACC-002` y `OWNER/MEMBER`; hay que reabrir tareas y reescribir fixtures canónicos. Suites afectadas: la mayor parte de `tests/unit`, `tests/contract`, `tests/security`, `tests/e2e`.

### Ruta 2 — La v2.1 es la Feature 002 que sigue a la 001 cerrada (la decisión previa de Neo)

Se cierra la 001 (T056, T057, validación de Oracle, Neo marca `COMPLETED`), se etiqueta la versión y se abre `specs/002-*` con rama propia por el flujo Spec Kit (`/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`).

Pros:
- Respeta la decisión de Neo y la gobernanza (una spec Approved no se reescribe).
- La 001 queda como producto estable y verde; la 002 puede entregarse por rebanadas con compuertas propias y pasos de regresión.
- `/speckit-clarify` permite resolver las 10 incoherencias de la v2.1 antes de comprometer contratos.
- Las dependencias de Nivel 2 (correo, SSO, iconos, almacenamiento) se autorizan una a una, no en bloque.

Contras:
- Dos tandas de cambio de contrato (la 001 ya generó datos con `DOG/CAT` y `username`): hace falta migración y compatibilidad de respaldos 1.0.0/2.0.0.
- La 002 no parte de cero: reescribe partes sustanciales de la 001 (identidad, roles), así que las pruebas de la 001 que contradicen la 002 deben sustituirse de forma explícita.
- Las herramientas hoy están atadas a una sola feature (`scripts/compile-contracts.sh` lee `specs/001-*/contracts`, `verify-traceability.sh` y la carpeta única `src/generated/`): hay que hacerlas multi-feature o apuntar al último.
- Mayor duración total.

Qué pasa con pruebas y contratos:
- Los contratos de la 001 quedan congelados en `specs/001-pet-health-tracker/contracts/` (historia y referencia). La 002 crea los suyos en `specs/002-*/contracts/` con `supersedes` explícito en `x-sdd-metadata` y versiones mayores donde haya cambio incompatible (pet 3.0.0, identity 3.0.0, backup-envelope 3.0.0 con migración desde 1.0.0 y 2.0.0).
- `src/generated/**` se regenera desde los contratos vigentes (los de 002); los de 001 siguen siendo la referencia de las migraciones de respaldo.
- Pruebas de la 001: las que siguen siendo válidas pasan como regresión (semáforo de alertas, cálculo de edad, respaldo atómico, aislamiento de acceso en lo que no cambie). Las que contradicen la 002 se sustituyen, no se borran, con una tabla de sustitución en el plan de la 002 ("prueba 001 → prueba 002 → motivo") para que Oracle pueda auditar que no se pierde cobertura. Mouse comprueba que ninguna prueba queda sin identificador vigente.
- Etiquetar la 001 (por ejemplo `v1.0.0-feature-001`) antes de empezar permite volver atrás.

### Recomendación

Ruta 2, con dos ajustes:
1. No mezclar todo en un solo lote: la 002 se especifica completa, pero se implementa por rebanadas (fase D) y con diferimiento explícito de SSO, recuperación por correo y adjuntos PDF a una 003, salvo que Neo los pida.
2. Si Neo necesita el timeout de inactividad ya, enmendar solo `INV-AUTH-004` en la 001 (enmienda pequeña de Nivel 2) y llevar el resto a la 002.
Razón principal: la v2.1 cambia casi todos los cimientos (identidad, roles, modelo de propiedad, auditoría) y contiene incoherencias internas; reabrir una spec Approved con 580 pruebas en verde para absorberla es el camino de mayor riesgo y no se sostiene frente al techo `REVIEW` de los agentes.

---

## D. Hoja de ruta por fases

Marca `[N2]` = requiere autorización de Neo (Nivel 2). Roles: Architect (A), Mouse (M), Keymaker (K), Oracle (O), Sati (S); apoyo opcional de Trinity, Rama, Maggie, Kid, Sentinels, Link según la fase.

| Fase | Contenido | Responsable y orden | Depende de | Nivel 2 |
|------|-----------|---------------------|------------|---------|
| F0 | Cerrar la 001: T056 (tipado `any`) y T057 (react-router v7), correr e2e pendientes, commits locales de Neo, etiquetar versión 001 | K → O → Neo | Nada | `[N2]` Neo marca `COMPLETED`, hace `git push` y la etiqueta |
| F1 | Decisión de ruta (C) y decisiones de política: auth (sesión vs JWT), identificador (email vs usuario), política de contraseña, especies, timeout de sesión (B1) | Neo con A y Morpheus | F0 (puede empezar en paralelo) | `[N2]` ruta; `[N2]` dependencias externas (correo, SSO, almacenamiento, iconos Lucide, hash argon2id) |
| F2 | Auditoría y aclaración de la v2.1: `/speckit-clarify` sobre las 10 incoherencias y las preguntas del backlog | M (clarify, checklist) con A | F1 | Respuestas de Neo |
| F2b | Diseño de pantallas (sin tocar contratos): tokens, app shell, 19 pantallas en 3 viewports, accesibilidad | S, con A como contraparte de contratos | F1 (puede solapar con F2) | Aprobación de Neo del diseño; `[N2]` si introduce librería de iconos/fuentes |
| F3 | `/speckit-specify` de la 002, crear rama y `specs/002-*` | A | F1, F2 | `[N2]` autorizar la creación de la feature |
| F4 | Plan y contratos formales de la 002 (identity, pet, household roles, `can(rol, acción)`, auditoría, backup 3.0.0 con migración, errores nuevos, máquinas de estado) | A (con apoyo Trinity para auth/RBAC, Rama para privacidad/auditoría, Maggie para reglas por especie) | F3 | `[N2]` cambios a la constitución, si hace falta |
| F5 | Análisis cruzado y checklist de requisitos | M → O | F4 | `[N2]` aprobación de la spec (`Approved`) |
| F6 | `tasks.md` de la 002 por rebanadas, con tabla de sustitución de pruebas 001→002 | A (`/speckit-tasks`) → M (`/speckit-analyze`) | F5 | `[N2]` aprobación; `COMPLETED` solo por Neo |
| F7 | Herramientas multi-feature (`compile-contracts.sh`, `verify-traceability.sh`, ruta de `src/generated/`) | K con A (tarea previa) | F6 | No |
| F8 | Implementación por rebanadas, cada una: A (contrato) → K (src/tests) → O (veredicto) | Ver abajo | F7 | Cada cierre `COMPLETED` es de Neo |

Rebanadas de implementación (F8), en orden:
1. Cuenta e identidad: identificador, política de contraseña, timeout de inactividad, perfil, eliminación de cuenta con re-autenticación y respaldo previo. Seguridad: Trinity y Sentinels; privacidad: Rama.
2. Modelo de mascota: especies (con migración `DOG/CAT`), sexo, `neutered`, microchip con unicidad, edad estimada. Maggie define reglas clínicas por especie.
3. Roles y permisos: RBAC `can(rol, acción)`, roles de hogar, transferencia de propiedad, protección contra huérfanos, mascotas del hogar (decisión A21), cambio de rol. Kid prueba flujos multiusuario; Trinity audita IDOR.
4. Auditoría con hashes de estado y registros clínicos: log de mutaciones, hash canónico, inmutabilidad de `SUPERSEDED` con `supersedesId`, lote y veterinario.
5. Respaldo 3.0.0 y P-19: validación previa, colisiones, Merge idempotente y reemplazo; Rama y Smith (atomicidad, corrupción).
6. Interfaz: app shell, 19 pantallas según el diseño de Sati, filtros, estados vacíos y skeletons, accesibilidad en 320/1024/1280 (Seraph).
7. Diferidos a una 003 salvo que Neo lo pida: SSO y cuentas vinculadas, recuperación por correo, adjuntos PDF del historial, catálogo de razas.

Orden de despacho propuesto (inmediato):
1. K/O: cierre de la 001 (F0).
2. Morpheus lleva a Neo la decisión C y las políticas de F1.
3. A prepara las preguntas de `/speckit-clarify` (mi siguiente entrega si Neo elige la Ruta 2).
4. M ejecuta clarify y checklist; S inicia el diseño en paralelo.
5. A abre la 002 solo cuando Neo lo autorice.

Preguntas abiertas para Neo (mínimas, para destrabar F1):
1. Ruta 1 o Ruta 2 (recomendada: Ruta 2).
2. Identificador: ¿pasar a email o mantener `username`? ¿Hay envío de correo real (dependencia Nivel 2) o las invitaciones se aceptan solo entre cuentas existentes?
3. Timeout: ¿inactividad de 30 minutos y absoluto de 24 horas, o los valores que prefiera? ¿Se enmienda la 001 ahora o va dentro de la 002?
4. Especies: ¿qué lista exacta y se renombra a `CANINE/FELINE`?
5. ¿Los Cuidadores pueden escribir pesos y eventos (cambia el principio "solo el dueño edita")?
6. ¿SSO, recuperación por correo y adjuntos PDF entran en la 002 o se difieren?
