# Feature Specification: Pulido del portal, Hogares unificados y roles de /admin (Feature 011)

**Feature Branch**: `011-pulido-portal-hogares-admin` (a crear por Neo/Morpheus desde `main`; este paquete se redactó sobre `fix/010-docker-public-y-hops` en `51af8e0`, sin crear rama)
**Created**: 2026-11-25
**Status**: `DRAFT` (el techo del agente es `REVIEW`; solo Neo fija `APPROVED`/`LOCKED`). Con **13 decisiones pendientes de Neo** (`D11-01..D11-13`, sección «Decisiones pendientes»). Ninguna tarea de implementación puede empezar antes de que Neo resuelva las decisiones que la bloquean (columna «Bloquea» de la tabla).
**Input**: `claude/inbox-feature-011.md` (GitHub Project #5; 9 ítems: `[GH:#63]`, `[GH:#64]`, `[GH:#72]`, `[GH:#73]`, `[GH:#31]`, `[GH:#59]`, `[GH:#62]`, `[GH:#74]`, `[GH:#78]`), tratado como el prompt funcional de Neo. Lectura de `specs/009-aprobacion-admin-correo/` (portal `/admin`, `D9-02`, `D9-20`), `specs/005-album-archivos-clinicos/` (enlaces de veterinario), `specs/006-escena-hogar-pixel-art/` (escena y foto del hogar) y `specs/010-tipi-identidad-legal-borde/` (marca y legal).

> Regla de redacción (de Neo para esta feature): la spec **no inventa decisiones de producto**. Donde el requerimiento es ambiguo o es una decisión de producto, se enumera como `D11-NN` con opciones y **sin** elegir. Las reglas fijas que Neo ya dio (roles de plataforma separados de los de hogar, Google SSO sin contraseñas propias) se tratan como invariantes.

## Verificación de premisas (lectura del estado real en disco, 2026-11-25)

| Premisa del inbox | Hallazgo en disco | Consecuencia |
| --- | --- | --- |
| `#63`: «`ARGOS_ADMIN_EMAILS` en Secret Manager es la lista de administradores» | Cierto: `ADMIN_EMAILS_NAME = 'ARGOS_ADMIN_EMAILS'` en `src/infrastructure/config/app-config.ts`; la 009 creó `admin_identities` (ancla `provider_subject`, `admin_id` UUID, sin FK a `users`), `admin_sessions`, `admin_oauth_flow_states` y `admin_audit_entries` (migración SQLite `0019`, Postgres `0015`). **Hoy todo administrador es de la lista de configuración y tiene permisos totales: no existe ningún rol de plataforma ni tabla de administradores delegados.** | La 011 añade la tabla de delegados y los roles; `admin_identities` se reutiliza (INV-ADM9-002). Los roles de plataforma **no** se mezclan con `OWNER/ADMIN/CAREGIVER/READER` (regla de Neo). |
| `#63`: «En el primer inicio de sesión se ancla su `sub` (mismo invariante de `EDGE-009-047`)» | La 009 ancla `(provider, provider_subject)` y revalida el correo contra la lista **en cada petición**. | La revalidación por petición debe ampliarse a «lista de configuración **o** delegado activo en BD» y a leer el rol en cada petición (revocación inmediata). |
| `#63`: «validar viabilidad de 2FA» | No hay lectura de `amr`/`acr` del ID token en `google-oidc-verify.ts` (por confirmar en la tarea de investigación). Google solo informa 2FA si la organización/cuenta lo declara; no es verificable de forma general para cuentas `@gmail.com`. | **Decisión abierta `D11-02`; no se decide aquí.** Se programa una investigación sin código. |
| `#64`: «Compartir con veterinario por hogar está en otra sección» | `ShareLinks.tsx` ya ofrece alcance `PET` y alcance `HOUSEHOLD` (todas las mascotas del hogar de las que se es propietario/ADMIN: `petCount`); el alcance hogar se ofrece **desde la ficha de la mascota**, no desde la página del hogar. No existe selección de un **subconjunto** de mascotas. | Mover/duplicar la entrada de compartir a la vista del hogar es de interfaz; el subconjunto sería cambio de contrato y migración (`D11-06`). |
| `#64`: «en Mascotas la pregunta "¿Qué quieres compartir?" es inútil» | Cierto: `ShareLinks.tsx:184` pinta `<legend>¿Qué quieres compartir?</legend>` también cuando solo hay una opción útil (la mascota abierta). | Se oculta la pregunta cuando no hay elección real (`REQ-HOG11-006`); en el hogar se ofrece selección. |
| `#64`: «Hogares como pestaña superior y NOMBRE-HOGAR en la pestaña principal» | `AppShell.tsx` tiene `Mascotas` y `Hogares` (con contador); `HouseholdsPage.tsx` (390 líneas) lista y gestiona hogares. La separación «pestaña NOMBRE-HOGAR junto a Mascotas» **no se encontró como pestaña propia**: se confirmará en la prueba local de `T1503` (puede ser el selector de contexto `ContextSelector.tsx`). | Se registra como hallazgo por confirmar; la decisión de estructura es `D11-05`. |
| `#72`: «toda foto o consulta a IA lleva marca» | La única IA generativa hoy es la **escena del hogar** (imagen del proveedor configurado, `vertex` o `gemini-api` (D9-30), 006/009): `HomeScene.tsx`, `HomeSceneImage.tsx`. **No existe consulta de texto a un LLM ni «integracionistas LLM»** en `src/` (la memoria del inbox los menciona en `#73`). | El alcance de `#72` y `#73` se acota a lo que existe; lo futuro se cubre con una regla de puerto (`D11-07`, `D11-08`). |
| `#73`: «actualmente podemos ver lo que se envió al generar una escena» | Hallazgo: el `FakeSceneImageGenerator` (modo `echo`, desarrollo/CI) incrusta el prompt en un fragmento `tEXt` del PNG (`pngOf(request.prompt, …)`); el adaptador real (`vertex` o `gemini-api`) declara no registrar el prompt; `scene_attempts` guarda `inputs_snapshot` (datos de entrada, no el texto del prompt). **El canal exacto por el que Neo ve el prompt no está confirmado en producción.** | Tarea de auditoría de superficies (`T1520`) antes de decidir; el requisito es «ningún prompt de usuario persistido ni visible» salvo necesidad estricta (`D11-08`). |
| `#31`: «incluir la foto de la mascota en la vista del veterinario» | **Contradice un invariante vigente**: `clinical-summary.ts` excluye explícitamente álbum, **avatar**, correo, ids y claves de objeto de la vista pública (005, `D5-xx`). | Incluir la foto cambia el contrato de la vista pública y exige decisión de privacidad (`D11-09`); el reordenamiento visual en secciones **no** depende de ella. |
| `#59`: «la foto del hogar se ve muy grande» | `HouseholdPhoto.tsx` (176 líneas) la muestra a tamaño completo, leída del almacenamiento en cada acceso. | Opciones en `D11-10`. |
| `#62`: «álbum del hogar con las fotos de las mascotas asignadas» | `PhotoAlbum.tsx` es por mascota (`pet_media` tipo `PHOTO`, clave `pets/{petId}/photos/{uuid}`, tope por mascota `album.max_photos_per_pet`). No existe vista agregada por hogar. | Es una **vista de solo lectura** agregada; alcance y permisos en `D11-11`. |
| `#74`: «confirmar si existe un número máximo de hogares» | **No existe ningún tope** de hogares, ni por usuario ni por invitaciones (búsqueda en `src/` y en las specs 001..010 sin resultados; solo existen topes de enlaces de veterinario REQ-VET-012 y de fotos). | La confirmación se registra como hallazgo; fijar un tope es producto (`D11-12`). |
| `#78`: «foto de perfil o la de Google» | Existe avatar de **mascota** (`REQ-AVA-001..003`, `AvatarCropper.tsx`, `avatar-crop.ts`); **no existe avatar de usuario** ni `picture` guardado del ID token de Google (`google-auth-use-cases.ts` sin coincidencias). | Cualquiera de las dos vías es nueva (migración y contrato); decisión `D11-13`. |

## Alcance y no alcance

**Alcance (los 9 ítems del inbox):** `#63` roles de plataforma en `/admin`; `#64` reorganización de Hogares y de compartir con veterinario; `#72` etiquetado de contenido IA; `#73` no exponer prompts de usuarios; `#31` presentación del resumen clínico compartido; `#59` foto del hogar; `#62` álbum del hogar; `#74` tope de hogares; `#78` foto de perfil.

**Fuera de alcance (no pedido por el inbox):** contraseñas o usuarios propios de `/admin` (prohibido por regla de Neo); roles de hogar nuevos (`OWNER/ADMIN/CAREGIVER/READER` no cambian, `REQ-RBAC-001`); retirada de la foto de Acerca de (`DEUDA-010-ABOUT-DELETE-PHOTO`); consultas de texto a un LLM (no existen; solo se deja regla para futuras); cambios en la escena más allá del etiquetado y de la no persistencia del prompt.

## User Scenarios & Testing

### User Story 1 — Compartir con veterinario desde un solo lugar claro `[GH:#64]` (P1)
**Independent Test**: `SC-011-001..009`.
1. **Given** una persona con uno o varios hogares, **When** abre «Hogares», **Then** ve un único lugar que reúne la gestión del hogar (miembros, invitaciones, foto, escena) y la acción de compartir con veterinario, sin una segunda pestaña con el nombre del hogar (condicionado a `D11-05`: la opción C mantiene ambas con enlace cruzado).
2. **Given** la ficha de una mascota, **When** crea un enlace para el veterinario, **Then** el formulario **no** pregunta «¿Qué quieres compartir?» (solo existe esa mascota) y muestra el nombre de la mascota como dato.
3. **Given** el hogar con 2 o más mascotas, **When** crea un enlace desde el hogar, **Then** elige qué mascotas incluir (una, varias o todas, según `D11-06`).
4. **Given** las funciones actuales del hogar (invitar, miembros, transferir propiedad, escena), **When** se reorganiza, **Then** ninguna se pierde ni cambia de permisos.

### User Story 2 — Contenido de IA siempre identificado `[GH:#72]` (P1)
**Independent Test**: `SC-011-010..014`.
1. **Given** una escena generada por IA, **When** se muestra en cualquier pantalla (hogar, enlace compartido, descarga), **Then** lleva una indicación visible de que fue generada con IA (forma según `D11-07`).
2. **Given** una consulta de texto a un modelo (hoy inexistente), **When** se añada en el futuro, **Then** su respuesta debe llevar la misma indicación (regla de puerto, sin implementarla ahora).

### User Story 3 — Los prompts de las personas no se guardan ni se ven `[GH:#73]` (P1)
**Independent Test**: `SC-011-015..020`.
1. **Given** una generación de escena, **When** termina o falla, **Then** ninguna tabla, registro, imagen, respuesta HTTP ni pantalla (incluida `/admin`) contiene el texto del prompt enviado ni datos personales derivados de él.
2. **Given** una futura integración con un LLM, **When** se diseñe, **Then** el puerto prohíbe persistir o registrar el prompt (regla `INV-IA11-002`).

### User Story 4 — Roles de plataforma en /admin `[GH:#63]` (P1)
**Independent Test**: `SC-011-021..034`.
1. **Given** el super-administrador raíz (`ARGOS_ADMIN_EMAILS`), **When** agrega un correo de Google con un rol de plataforma, **Then** esa persona entra por `/admin` con Google, sin contraseña propia, y su `sub` se ancla en el primer acceso.
2. **Given** un delegado con un rol, **When** invoca una operación `/api/admin/*` que su rol no autoriza, **Then** el **servidor** la rechaza (no solo la interfaz).
3. **Given** un delegado desactivado o con rol rebajado, **When** hace su siguiente petición, **Then** pierde el permiso en esa misma petición.
4. **Given** el último super-administrador o un correo de `ARGOS_ADMIN_EMAILS`, **When** alguien intenta revocarlo desde la interfaz, **Then** se rechaza.
5. **Given** cualquier alta, cambio de rol o revocación, **Then** queda una fila en `admin_audit_entries` (autor, objetivo, acción, instante) sin correos en los registros de aplicación.

### User Story 5 — Informe clínico ordenado para el veterinario `[GH:#31]` (P2)
**Independent Test**: `SC-011-035..040`.
1. **Given** el enlace público de solo lectura, **When** el veterinario lo abre, **Then** ve un informe con secciones diferenciadas por mascota, jerarquía visual y legible en 320/1024/1280 px, no un compilado de líneas.
2. **Given** la decisión de `D11-09`, **When** esté aprobada la foto de mascota, **Then** aparece en el encabezado de cada mascota; si no se aprueba, el informe mejora sin foto.

### User Story 6 — Foto del hogar discreta `[GH:#59]` (P2)
**Independent Test**: `SC-011-041..044`.
1. **Given** un hogar con foto, **When** abre su vista, **Then** la foto no ocupa el espacio actual y la lectura del almacenamiento no ocurre en cada acceso (según `D11-10`).

### User Story 7 — Álbum del hogar `[GH:#62]` (P2)
**Independent Test**: `SC-011-045..052`.
1. **Given** un hogar con mascotas asignadas, **When** abre su álbum, **Then** ve las fotos de álbum de esas mascotas reunidas, etiquetadas por mascota, solo con permisos de lectura del hogar.
2. **Given** una mascota que sale del hogar o una foto borrada, **Then** el álbum del hogar deja de mostrarla sin copiar archivos.

### User Story 8 — Tope de hogares validado `[GH:#74]` (P2)
**Independent Test**: `SC-011-053..056`.
1. **Given** la confirmación de que hoy no hay tope, **When** Neo decide `D11-12`, **Then** se documenta la decisión y, si hay tope, el servidor lo aplica con error determinista y la interfaz lo comunica.

### User Story 9 — Mi foto de perfil `[GH:#78]` (P2)
**Independent Test**: `SC-011-057..062`.
1. **Given** una cuenta, **When** la persona elige su foto de perfil (por la vía de `D11-13`), **Then** se muestra en el encabezado y el perfil, y puede quitarla.

## Requirements

### Roles de plataforma en /admin `[GH:#63]`
- **REQ-ADM11-001** (Dos niveles de acceso): el super-administrador raíz es quien figura en `ARGOS_ADMIN_EMAILS` (fuera de la base de datos); los delegados viven en una tabla nueva de administradores delegados con `admin_id` (UUID), correo en minúsculas, **rol de plataforma**, estado (`ACTIVE`/`DISABLED`; la reactivación DISABLED→ACTIVE está condicionada a `D11-04`), autor del alta y marcas de tiempo, sin FK a `users`. Sin contraseñas ni credenciales locales (regla de Neo). El correo de la lista de configuración **siempre** concede acceso total aunque la tabla esté vacía.
- **REQ-ADM11-002** (Roles de plataforma separados de los de hogar): el rol de plataforma es un conjunto cerrado propio; ningún valor coincide con `OWNER/ADMIN/CAREGIVER/READER` y ninguna función de hogar lee el rol de plataforma ni al revés. Nombres y alcance: `D11-01` (propuesta del inbox: super-admin, operador, soporte/moderador; **no decidido**).
- **REQ-ADM11-003** (Autorización en servidor): cada operación `/api/admin/*` declara el conjunto de roles que la autorizan; el servidor rechaza con `403`/error de catálogo las no autorizadas **antes** de ejecutar efectos; la interfaz oculta lo no autorizado como comodidad, no como control.
- **REQ-ADM11-004** (Revocación inmediata): el rol y el estado del delegado se leen en **cada** petición; desactivar o rebajar surte efecto en la siguiente y cierra o degrada su sesión (sin esperar la caducidad de 30 min/10 min).
- **REQ-ADM11-005** (Protección contra bloqueo): un administrador no puede eliminarse ni degradarse si deja el sistema sin super-administrador; los correos de `ARGOS_ADMIN_EMAILS` no se pueden revocar, desactivar ni degradar desde la interfaz.
- **REQ-ADM11-006** (Anclaje de identidad): en el primer inicio de sesión del delegado se ancla `(provider, provider_subject)` (mismo invariante `EDGE-009-047`); un segundo `sub` para el mismo correo se rechaza; el correo ya no basta tras anclar.
- **REQ-ADM11-007** (Auditoría): alta, cambio de rol, desactivación y revocación escriben en `admin_audit_entries` (autor `admin_id`, objetivo `admin_id`, acción de lista cerrada, instante); el correo del objetivo no se escribe en registros de aplicación ni en la auditoría en claro (la auditoría referencia `admin_id`).
- **REQ-ADM11-008** (2FA): la viabilidad de exigir 2FA a delegados y super-administradores se **investiga** y se presenta a Neo (`D11-02`); esta spec no impone ni descarta 2FA, y bajo ningún caso introduce credenciales propias.
- **INV-ADM11-001**: no existe credencial local para `/admin`; todo acceso es Google OIDC (constitución, Enmienda 009-A).
- **INV-ADM11-002**: la ausencia o vaciedad de la tabla de delegados nunca impide el acceso de emergencia del super-administrador raíz.

### Hogares unificados y compartir `[GH:#64]`
- **REQ-HOG11-001** (Página única del hogar; condicionado a `D11-05`, la opción C mantiene ambas entradas): la gestión del hogar (miembros, invitaciones, foto, escena, compartir, álbum) se reúne bajo «Hogares» en una sola página; la estructura exacta de navegación es `D11-05`.
- **REQ-HOG11-002** (Sin pérdida de funciones): invitar, aceptar/rechazar, salir, retirar miembro, transferir propiedad, escena y foto conservan comportamiento, permisos y contratos (`REQ-RBAC-001`, `STATE-HOUSE-MEMBERSHIP-001`).
- **REQ-HOG11-005** (Compartir desde el hogar): el hogar ofrece crear, listar y revocar enlaces de veterinario con alcance hogar; la selección de mascotas incluidas es `D11-06`.
- **REQ-HOG11-006** (Sin pregunta inútil): en la ficha de la mascota, cuando el alcance elegible es una sola mascota, no se muestra «¿Qué quieres compartir?»; se muestra el nombre de la mascota como contexto. La pregunta (o su equivalente de selección) solo aparece donde hay elección real (hogar).
- **REQ-HOG11-007** (Sin nueva ruta pública): ninguna ruta anónima nueva; los enlaces siguen siendo los de 005.

### Etiquetado de contenido generado con IA `[GH:#72]`
- **REQ-IA11-001**: toda imagen generada por IA se muestra con una indicación visible y accesible (texto asociado a la imagen para lectores de pantalla) de que fue generada con IA; forma, texto y alcance en `D11-07`.
- **REQ-IA11-002** (forma y alcance condicionados a `D11-07`): la indicación acompaña a la imagen en todas las superficies donde se muestra (vista del hogar, vista compartida si la incluye y, si `D11-07` lo incluye, descarga); no depende de que la imagen conserve metadatos.
- **INV-IA11-001**: contenido real de la persona (fotos subidas) **no** se etiqueta como IA; solo lo generado.

### Prompts de usuario no persistidos ni visibles `[GH:#73]`
- **REQ-IA11-003**: el texto del prompt enviado al proveedor (y cualquier fragmento derivado de datos de la persona) no se persiste, no se devuelve por HTTP, no se muestra en `/admin` ni se incrusta en la imagen resultante, salvo necesidad estricta documentada y aprobada (`D11-08`).
- **REQ-IA11-004**: los metadatos de generación que se conserven son los mínimos para operar (modo, resultado, modelo, región, marcas de tiempo), sin texto libre de la persona.
- **INV-IA11-002**: cualquier puerto futuro hacia un LLM prohíbe persistir o registrar el prompt y la respuesta cruda, y exige la indicación de `REQ-IA11-001`.
- **Nota**: el prompt genérico editable de `/admin` (plantilla de estilo, `scene.prompt.blocks`) es configuración de la plataforma, **no** un prompt de usuario; su tratamiento se confirma en `D11-08`.

### Informe clínico para el veterinario `[GH:#31]`
- **REQ-VET11-001** (Estructura): la vista pública de solo lectura se presenta como informe: encabezado con marca y vigencia, una sección diferenciada por mascota (tarjeta o bloque con separación visible), títulos de sección, listas tabuladas para registros, y jerarquía tipográfica; mismo contenido de datos que hoy.
- **REQ-VET11-002** (Foto de la mascota): inclusión de la foto de la mascota en el encabezado de su sección **solo** si Neo aprueba `D11-09`; hoy está excluida (invariante de 005).
- **REQ-VET11-003** (Accesibilidad y reflow): legible sin scroll horizontal a 320, 1024 y 1280 px, contraste AA, orden de foco y encabezados semánticos.
- **INV-VET11-001**: no se añaden campos personales (correo, ids, claves de objeto, nombres de archivo) a la vista pública.

### Foto del hogar `[GH:#59]`
- **REQ-HOG11-003**: la foto del hogar se muestra en miniatura o se oculta con indicación de que existe, según `D11-10`; sin descargar el objeto completo en cada acceso cuando la opción lo permita.

### Álbum del hogar `[GH:#62]`
- **REQ-ALB11-001** (alcance y orden condicionados a `D11-11`): el hogar muestra un álbum de solo lectura con las fotos de álbum (`PHOTO`) de las mascotas asignadas al hogar, agrupadas por mascota; sin copiar objetos ni crear tablas de fotos nuevas.
- **REQ-ALB11-002** (condicionado a `D11-11`, quién ve): ve el álbum quien tiene lectura en el hogar; una foto solo aparece si la persona ya podría verla en la ficha de esa mascota (mismos permisos efectivos, `REQ-RBAC-001`).
- **REQ-ALB11-003**: paginado o con carga progresiva, con tope por solicitud; las fotos se sirven por los mismos endpoints de 004 (`Cache-Control` y `Vary: Cookie` vigentes).
- **Alcance, orden y archivos clínicos**: `D11-11`.

### Tope de hogares `[GH:#74]`
- **REQ-HOG11-004** («crear y/o aceptar» condicionado a `D11-12`): se confirma por escrito que hoy no hay tope; si Neo fija uno (`D11-12`), el servidor lo valida en crear hogar y/o aceptar invitación con error de catálogo determinista, bajo transacción (sin condición de carrera), y la interfaz lo informa antes de intentar.

### Foto de perfil `[GH:#78]`
- **REQ-PRF11-001**: la persona puede tener una foto de perfil visible en el encabezado y en `/cuenta`, y quitarla; vía (Google, subida o ambas) en `D11-13`.
- **REQ-PRF11-002**: la foto de perfil no se expone a otros usuarios salvo decisión explícita (por defecto solo la propia cuenta); no aparece en la vista pública de veterinario.
- **INV-PRF11-001**: la eliminación de cuenta (`REQ-DEL`) borra o desvincula la foto de perfil.

## Decisiones pendientes para Neo (Nivel 2) — no decididas por `/architect`

Cada decisión indica opciones; **ninguna está elegida**. «Bloquea» indica qué tareas no pueden empezar.

| ID | Pregunta | Opciones | Bloquea |
| --- | --- | --- | --- |
| `D11-01` | Nombres y alcance de los roles de plataforma (`#63`) | **A**: los 3 del inbox (Super-admin, Operador: parámetros/escenas/cuotas/aprobaciones; Soporte: solo aprobaciones). **B**: 2 roles (Super-admin y Moderador de aprobaciones). **C**: matriz de permisos editable por operación (más flexible, más superficie). Además: ¿el super-admin delegado puede gestionar administradores o solo el raíz? | T1524..T1531 (Bloque D, `#63`) |
| `D11-02` | 2FA para roles admin y super-admin (`#63`) | **A**: delegarlo a Google y exigir señal en el ID token (`amr`/`acr`) si es verificable. **B**: exigirlo por política de Workspace de la organización (fuera del código). **C**: segundo factor propio (TOTP): choca con «sin credenciales propias». **D**: no exigir. Depende del resultado de la investigación `T1505`. | Solo `T1505` informa; ninguna tarea de implementación de 2FA existe hasta decidir |
| `D11-03` | Alta de delegados: ¿límite de delegados, ¿dominios permitidos?, ¿qué ve el super-admin al agregar un correo que ya tiene cuenta de usuario? | A: sin límite ni dominios. B: tope de N delegados. C: lista de dominios. | T1524, T1527 (Bloque D, `#63`) |
| `D11-04` | ¿Un delegado desactivado puede reactivarse o solo se vuelve a crear? | A: reactivar. B: solo crear de nuevo (nuevo `admin_id`). | T1524, T1527 (Bloque D, `#63`) |
| `D11-05` | Estructura de navegación de Hogares (`#64`) | **A**: «Hogares» única, con lista y detalle por hogar con pestañas internas (Resumen, Miembros, Mascotas, Compartir, Álbum, Escena). **B**: quitar la entrada NOMBRE-HOGAR y dejar solo «Hogares» (mismo contenido actual más Compartir). **C**: mantener ambas con enlace cruzado. | Bloque `#64`, `#59`, `#62` |
| `D11-06` | Compartir por hogar: ¿subconjunto de mascotas? | **A**: alcance hogar = todas las del hogar (como hoy), sin subconjunto. **B**: selección de 1..N mascotas (cambia contrato 005 a MINOR y requiere migración Nivel 2). | T1507, T1508 (compartir en hogar, Bloque A) |
| `D11-07` | Etiquetado IA (`#72`): forma y alcance | Forma: **A** texto visible bajo la imagen; **B** marca de agua incrustada en los bytes; **C** ambas. Alcance: solo escena del hogar (única IA hoy) o también cualquier futura consulta. Texto exacto y revisión legal (`/rama`). | Bloque `#72` |
| `D11-08` | Prompts (`#73`): qué se puede conservar | **A**: nada del prompt de la persona, ni hash. **B**: solo versión de plantilla y huella no reversible para depuración. Y: ¿el prompt genérico editable de `/admin` sigue visible para administradores (es configuración, no dato de usuario)? Y: ¿qué hacer con `inputs_snapshot`? | Bloque `#73` |
| `D11-09` | Foto de la mascota en el informe del veterinario (`#31`) | **A**: sí, solo el avatar de la mascota (excepción al invariante de 005). **B**: sí, avatar y una foto de álbum elegida. **C**: no (solo reordenar). Implica privacidad (`/rama`) y contrato de la vista pública. | T1534, T1535 (foto, Bloque E) |
| `D11-10` | Foto del hogar (`#59`) | **A**: miniatura (p. ej. máx. 96 px de lado). **B**: oculta con «ya hay una imagen guardada» y botón «ver». **C**: miniatura bajo demanda (carga al pulsar). | Bloque `#59` |
| `D11-11` | Álbum del hogar (`#62`) | Alcance: ¿solo `PHOTO` de mascotas **asignadas hoy**? ¿incluye fallecidas? ¿incluye la foto del hogar? ¿archivos clínicos fuera (por defecto sí fuera)? Orden: por mascota o cronológico. Quién ve: lectores del hogar o solo quien ya ve cada mascota. | Bloque `#62` |
| `D11-12` | Tope de hogares (`#74`) | **A**: sin tope (confirmar). **B**: tope de hogares que una persona puede **crear/poseer** (N a definir). **C**: tope de hogares a los que puede **pertenecer** (incluye invitaciones aceptadas) (N a definir). **D**: tope también de invitaciones pendientes. Valor de N y editable en `/admin` o constante: decisión. | Bloque `#74` |
| `D11-13` | Foto de perfil (`#78`) | **A**: usar la de Google (`picture`) copiada a almacenamiento propio. **B**: usar la de Google por URL externa (sin copia; implicaciones de privacidad y caída). **C**: subida propia con recorte (reutiliza `AvatarCropper`). **D**: C con A como valor inicial. Cuentas sin Google solo con C. | Bloque `#78` |

Además, para trazabilidad humana: **`D11-ORDEN`** (informativa, no bloquea): orden de entrega propuesto en `plan.md` (P1 antes que P2; `#64` antes que `#59`/`#62` por compartir página). Neo puede reordenar.

## Success Criteria

Rangos por historia (expandidos en `tasks.md`): `SC-011-001..009` (`#64`), `SC-011-010..014` (`#72`), `SC-011-015..020` (`#73`), `SC-011-021..034` (`#63`), `SC-011-035..040` (`#31`), `SC-011-041..044` (`#59`), `SC-011-045..052` (`#62`), `SC-011-053..056` (`#74`), `SC-011-057..062` (`#78`).

- **SC-011-001**: Given un hogar con foto, mascotas y miembros, When se abre Hogares, Then se alcanzan miembros, mascotas, compartir y escena sin salir de la página única.
- **SC-011-002**: Given la ficha de una mascota, When se abre Compartir con veterinario, Then no aparece «¿Qué quieres compartir?» y sí el nombre de la mascota.
- **SC-011-003**: Given un hogar con 3 mascotas, When se crea un enlace del hogar, Then se ofrece la selección definida por `D11-06`.
- **SC-011-010**: Given una escena mostrada, Then el texto de IA está presente, es legible (contraste AA) y está asociado a la imagen para lector de pantalla.
- **SC-011-015**: Given una generación completa (éxito y fallo), Then una búsqueda del prompt y de los nombres de las mascotas en todas las tablas y registros del intento devuelve 0 coincidencias.
- **SC-011-021**: Given un delegado con rol Soporte, When llama a una operación de parámetros, Then recibe rechazo del servidor y no hay efecto.
- **SC-011-024**: Given un delegado revocado, When hace su siguiente petición, Then se rechaza en esa misma petición.
- **SC-011-025**: Given un correo de `ARGOS_ADMIN_EMAILS`, When se intenta desactivarlo desde la interfaz, Then se rechaza.
- **SC-011-035**: Given el enlace público con 2 mascotas, Then cada mascota ocupa una sección diferenciada y no hay scroll horizontal a 320 px.
- **SC-011-041**: Given un hogar con foto, Then la foto ocupa a lo sumo lo definido por `D11-10` y no se descarga completa en la carga inicial (si aplica).
- **SC-011-045** (condicionado a `D11-11`: alcance, orden y permisos): Given un hogar con 2 mascotas con 3 fotos cada una, Then el álbum muestra 6 fotos agrupadas por mascota.
- **SC-011-053**: Given la decisión `D11-12`, Then el servidor aplica el valor o documenta que no hay tope, con prueba de condición de carrera si hay tope.
- **SC-011-057**: Given una cuenta con foto de perfil, Then se muestra en encabezado y perfil y se puede quitar; tras eliminar la cuenta no queda objeto huérfano.
- (Los demás IDs de cada rango se redactan en `tasks.md` con su prueba, mismo patrón que SC-010-022..026.)
- **Nota de trazabilidad (OBS-4 del `/oracle`)**: los SC-011 individuales de los rangos citados se redactarán como IDs explícitos (uno por línea) **antes de T1511**. La trazabilidad 1:1 depende de dos piezas de Nivel 2 pendientes de Neo: crear `contracts/errors/error-catalog.json` 011 y dar soporte 011 a `scripts/verify-traceability.sh`. Hasta entonces `--feature 011` devuelve rc 2 (esperado). Esta enmienda no crea ni edita ni el catálogo ni el script.

## Edge Cases (`EDGE-011-NNN`)
- **EDGE-011-001**: el super-administrador raíz se agrega también como delegado: se ignora el alta (la lista de configuración manda).
- **EDGE-011-002**: dos super-administradores se degradan a la vez: la comprobación de «último super-administrador» ocurre en la misma transacción (sin carrera).
- **EDGE-011-003**: se retira un correo de `ARGOS_ADMIN_EMAILS` en el despliegue siguiente: pierde el acceso raíz; si estaba también delegado conserva solo el rol delegado.
- **EDGE-011-004**: el correo de un delegado cambia en Google; el `sub` anclado manda y el acceso se revalida por `sub` (misma regla que `EDGE-009-047`).
- **EDGE-011-005**: enlace de hogar creado antes de que una mascota salga del hogar: el enlace conserva su alcance vigente (regla de 005); se documenta, sin cambio.
- **EDGE-011-006**: mascota compartida por dos hogares: su foto aparece en ambos álbumes; si se borra, desaparece de ambos.
- **EDGE-011-007**: foto de perfil de Google no disponible (red, 404): la interfaz cae a iniciales/símbolo sin error visible.
- **EDGE-011-008** (condicionado a `D11-12`; solo aplica si hay tope): persona que ya supera el tope tras fijarlo: conserva los hogares existentes, no puede crear/aceptar más (sin expulsiones).

## Non-Functional Requirements
- **NFR-011-001** (Accesibilidad): todas las pantallas nuevas o modificadas cumplen WCAG 2.2 AA y reflow 320/1024/1280 (`/sati` valida).
- **NFR-011-002** (Privacidad): ningún dato personal nuevo en registros de aplicación; correos solo en la tabla de delegados.
- **NFR-011-003** (Dependencias): ninguna dependencia nueva (`package.json` intacto).
- **NFR-011-004** (TDD): pruebas rojas antes de implementar (constitución IV).
- **NFR-011-005** (Prueba local primero, regla de Neo): cada bloque exige una prueba manual local (`npm run dev`, recorrido concreto, la levanta Neo) **antes** de las compuertas.

## Reglas heredadas de Neo para esta feature
1. Etiqueta `[GH:#N]` en cada bloque y tarea de `tasks.md`.
2. Prueba local manual antes de cualquier test o compuerta, en cada bloque.
3. Al cerrar cada bloque: `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`; al final, tarea de PR vinculado (`Closes #N`).
4. Los agentes no marcan `[x]` ni `COMPLETED`, no hacen push, no usan `git stash`, no levantan `npm run dev`, no ejecutan `test:gate`.
