# Tasks: Pulido del portal, Hogares unificados y roles de /admin (Feature 011)

**Input**: `specs/011-pulido-portal-hogares-admin/` (`spec.md`, `plan.md`); `claude/inbox-feature-011.md` (9 ítems de GitHub Project #5).
**Estado**: `DRAFT`. El techo de los agentes es `REVIEW`; solo Neo marca `[x]`/`COMPLETED` y fija `APPROVED`/`LOCKED`. Todas las casillas nacen vacías.
**Numeración**: `T1501..T1590` (010 usó `T1401..T1437`). Los IDs se asignan por bloque con huecos permitidos.
**Orden propuesto (`D11-ORDEN`, reordenable por Neo)**: Fase 0 decisiones → Bloque A `#64` → B `#72` → C `#73` → D `#63` → E `#31` → F `#59` → G `#62` → H `#74` → I `#78` → Fase final PR. `#64` va antes de `#59` y `#62` (misma página). Ninguna tarea de implementación de un bloque empieza sin resolver las decisiones `D11-xx` que lo bloquean (ver `spec.md`).
**Sincronización GitHub Projects**: cada bloque lleva su `[GH:#N]` en el encabezado y en cada tarea. Mapeo: `#64` Bloque A; `#72` B; `#73` C; `#63` D; `#31` E; `#59` F; `#62` G; `#74` H; `#78` I.

## Format: `[ID] [P?] [N2|GOV|HUM|ARCH|LOCAL] [GH:#N] Descripción — REQ/SC; Dep: tareas`
- **[N2]**: requiere autorización de Neo (contrato, migración, dependencia, constitución). **[GOV]**: gobernanza o compuerta (`/lock`, `/mifune`, `/merovingian`, `/mouse`, `/rama`, `/trinity`, `/sati`, `/oracle`, `/seraph`, `/sentinels`, `/morpheus`, `/link`). **[HUM]**: decisión o acción de Neo. **[ARCH]**: contrato o spec a cargo de `/architect`. **[LOCAL]**: **prueba local manual** con `npm run dev` (la levanta Neo); va **antes** de toda prueba automatizada de cierre y de toda compuerta.

## Reglas transversales (de Neo)
- **Prueba local primero**: en cada bloque la tarea `[LOCAL]` precede a `npx tsc --noEmit`, `npm run test:gate`, `bash scripts/verify-oracles.sh` y `bash scripts/verify-traceability.sh --feature 011 --task T####`, que van **solo al cierre del bloque**. Los agentes no levantan `npm run dev` ni ejecutan `test:gate`; las pruebas rojas del TDD se ejecutan con Vitest dirigido por archivo, no con la compuerta.
- **Cierre de bloque**: la tarea de cierre incluye `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md` (mueve el Issue a `In Progress`/`Done`) y un comentario breve en el Issue.
- **TDD (constitución IV)**: pruebas rojas antes de implementar; cada implementación depende de su tarea de pruebas.
- **Dependencias**: ninguna nueva (`package.json` intacto). Sin `git push`, sin despliegue, sin llamadas reales a Google ni al proveedor de imágenes (`vertex` o `gemini-api`) en CI.
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).
- **Bitácora**: cada tarea cerrada deja registro en `claude/log-<personaje>.md` y una línea en `claude/registro-proceso-argos.md` antes de responder.
- **Roles**: los roles de plataforma de `/admin` van separados de los de hogar; `/admin` solo con Google SSO, sin contraseñas propias.

---

## Fase 0: Decisiones de Neo y compuertas previas (sin código)

- [ ] T1501 [HUM] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] Neo revisa `spec.md` y resuelve `D11-01..D11-13` (o las que correspondan al bloque que quiera empezar) y confirma o reordena `D11-ORDEN`; deja constancia por escrito (acta en `claude/decisiones-neo-011-YYYY-MM-DD.md`) — NFR-011-005; SC-011-001..062. Dep: ninguna
- [ ] T1502 [GOV] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] `/lock`: edge cases adicionales sobre la spec (foco: revocación inmediata y carrera de «último super-administrador», enlaces de veterinario del hogar tras cambios de asignación, fotos duplicadas en dos álbumes, `picture` de Google caída, tope de hogares con invitaciones concurrentes). Dep: T1501 — EDGE-011-001..008
- [ ] T1503 [LOCAL] [GH:#64] Neo levanta `npm run dev` y recorre el estado actual de Hogares: confirma si «NOMBRE-HOGAR junto a Mascotas» es una pestaña propia o el selector de contexto; captura el hallazgo en el acta de `T1501` (cierra la premisa `#64` de `spec.md`). Dep: ninguna
- [ ] T1504 [GOV] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] `/mifune` (poda: ¿un solo archivo de dominio para roles?, ¿álbum del hogar sin tabla?), `/merovingian` (grafo de impacto de `HouseholdsPage`, `ShareLinks`, `SharedSummary`, `admin-use-cases`, pruebas E2E de navegación) y `/mouse` (compuerta estructural única, trazabilidad 1:1, orden de bloques). Dep: T1501, T1502 — todos los REQ de 011
- [ ] T1505 [ARCH] [GH:#63] `/architect` + `/trinity`: investigación **sin código** de viabilidad de 2FA para roles admin y super-admin (claims `amr`/`acr` del ID token de Google, diferencia cuenta personal vs Workspace, política de organización, alternativas) y presentación de opciones a Neo para `D11-02`; no implementa ni decide. Dep: T1501 — REQ-ADM11-008; SC-011-021..034

**Checkpoint**: tras `T1504` puede empezar el bloque cuyas decisiones estén resueltas. Un bloque sin sus `D11-xx` firmadas queda bloqueado (no se improvisa).

---

## Fase 1: Hogares unificados y compartir (`#64`, P1)

### Bloque A — [GH:#64] Hogares embebe NOMBRE-HOGAR y compartir con veterinario donde corresponde

**Goal**: una sola página de Hogares (condicionado a `D11-05`) con todas sus funciones, compartir por hogar con selección real y sin la pregunta inútil en la ficha de la mascota.
**Independent Test**: `SC-011-001..009`.
**Bloqueado por**: `D11-05`, `D11-06` (T1501).

- [ ] T1506 [GH:#64] Pruebas rojas: la ficha de la mascota no muestra «¿Qué quieres compartir?» y sí el nombre de la mascota; el hogar muestra la selección (1 mascota → sin pregunta; ≥2 → selección según `D11-06`); invitar, miembros, transferir propiedad y escena conservan permisos y rutas; navegación según `D11-05` (sin duplicar entradas). Dep: T1501 — REQ-HOG11-001, REQ-HOG11-002, REQ-HOG11-005, REQ-HOG11-006; SC-011-001..009
- [ ] T1507 [ARCH] [N2] [GH:#64] Solo si `D11-06` = B: enmienda MINOR del contrato de enlaces de 005 (lista de `petIds`, límites, error de catálogo) y migración SQLite+Postgres; si `D11-06` = A esta tarea se cierra sin cambio (registro). Dep: T1501 — REQ-HOG11-005, REQ-HOG11-007
- [ ] T1508 [GH:#64] Implementar la página única de Hogares y la navegación (`HouseholdsPage.tsx`, `AppShell.tsx`, rutas) y parametrizar `ShareLinks.tsx` (`PET` sin leyenda de elección; `HOUSEHOLD` con selección); sin tocar permisos ni contratos si `D11-06` = A. Dep: T1506, T1507 — REQ-HOG11-001, REQ-HOG11-002, REQ-HOG11-005, REQ-HOG11-006
- [ ] T1509 [LOCAL] [GH:#64] **Prueba local manual** (`npm run dev`): (1) con un hogar «Apartamento» y 2 mascotas, abrir Hogares y llegar a miembros, mascotas, compartir y escena sin otra pestaña; (2) ficha de una mascota → Historial/Archivos → Compartir con veterinario: sin la pregunta, con el nombre; (3) desde el hogar, crear enlace eligiendo mascotas, abrirlo en ventana privada y revocarlo; (4) 320/1024/1280 px. Dep: T1508 — SC-011-001..009
- [ ] T1510 [GOV] [GH:#64] `/sati` (320/1024/1280, WCAG 2.2 AA, foco y encabezados de la página única) y `/kid` (segundo miembro del hogar: permisos de compartir y de ver). Dep: T1509 — NFR-011-001
- [ ] T1511 [GH:#64] **Cierre del Bloque A** (las compuertas van aquí, después de `T1509`): `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1508`; `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md` (Issue `#64` a `In Progress`/`Done`). Dep: T1510 — SC-011-001..009

---

## Fase 2: IA — etiquetado y prompts no visibles (`#72`, `#73`, P1)

### Bloque B — [GH:#72] Etiquetar contenido generado con IA

**Goal**: toda imagen generada por IA lleva indicación visible y accesible en todas las superficies (descarga y forma condicionadas a `D11-07`).
**Independent Test**: `SC-011-010..014`.
**Bloqueado por**: `D11-07` (T1501).

- [ ] T1512 [GH:#72] Pruebas rojas: la imagen de escena muestra el texto de IA asociado (visible, contraste AA, `aria-describedby`/figcaption); no aparece en fotos subidas (`INV-IA11-001`); si `D11-07` incluye marca de agua, la imagen resultante la lleva y la huella/almacenamiento de 006 no se rompe. Dep: T1501 — REQ-IA11-001, REQ-IA11-002; SC-011-010..014
- [ ] T1513 [GOV] [GH:#72] `/rama`: dictamen del texto y de la forma de etiquetado (transparencia, coherencia con `scene-notice` y `/privacidad`); si el texto cambia el consentimiento, decidir versión sin forzar reconsentimiento masivo (cf. `DEUDA-010-NOTICE`). Dep: T1501 — REQ-IA11-001
- [ ] T1514 [GH:#72] Implementar la indicación (constante única de texto; componente en `HomeSceneImage.tsx` y superficies de la imagen; marca de agua solo si la decisión la exige). Dep: T1512, T1513 — REQ-IA11-001, REQ-IA11-002
- [ ] T1515 [LOCAL] [GH:#72] **Prueba local manual** (`npm run dev`, driver `fake`): generar una escena, ver la indicación en el hogar y en toda otra superficie donde se vea la imagen, probar con lector de pantalla/teclado y a 320 px; confirmar que una foto subida **no** lleva la etiqueta. Dep: T1514 — SC-011-010..014
- [ ] T1516 [GH:#72] **Cierre del Bloque B**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1514`; `/sati` y `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1515 — SC-011-010..014

### Bloque C — [GH:#73] Ocultar prompts enviados por usuarios

**Goal**: ningún prompt de usuario persistido ni visible (escena y futuras integraciones LLM).
**Independent Test**: `SC-011-015..020`.
**Bloqueado por**: `D11-08` (T1501).

- [ ] T1517 [GH:#73] Pruebas rojas: tras una generación (éxito y fallo) el texto del prompt y los nombres de mascotas no aparecen en ninguna fila, registro, auditoría, respuesta HTTP, vista de `/admin` ni bytes de la imagen; el modo `echo` del generador de prueba no es alcanzable con el controlador real; guarda de arquitectura que prohíbe pasar el prompt a repositorios o logs. Dep: T1501 — REQ-IA11-003, REQ-IA11-004, INV-IA11-002; SC-011-015..020
- [ ] T1518 [GOV] [GH:#73] `/rama` (qué es estrictamente necesario y cuadra con la gestión de datos) y `/trinity` (superficies: `inputs_snapshot`, `tEXt` del PNG de `echo`, logs de adaptadores, auditoría, respuestas de error). Dep: T1501 — REQ-IA11-003
- [ ] T1519 [ARCH] [N2] [GH:#73] Contrato/migración **solo si** `D11-08` exige cambiar `inputs_snapshot` u otra columna; si no, se registra «sin migración». Dep: T1518 — REQ-IA11-004
- [ ] T1520 [GH:#73] **Auditoría de superficies** (solo lectura, informe en `.specify/memory/audits/architect-011-prompt-superficies.md`): dónde se ve hoy el prompt de una escena (confirma el canal que Neo observa; premisa del `spec.md`), con evidencia archivo:línea. Dep: T1501 — REQ-IA11-003
- [ ] T1521 [GH:#73] Implementar: el prompt vive solo en memoria; retirar o blindar `echo`; ajustar `inputs_snapshot` según `D11-08`; regla `INV-IA11-002` en el puerto del generador y en la guía para futuros adaptadores LLM. Dep: T1517, T1519, T1520 — REQ-IA11-003, REQ-IA11-004, INV-IA11-002
- [ ] T1522 [LOCAL] [GH:#73] **Prueba local manual** (`npm run dev`): generar una escena en modo `fake` normal, abrir la imagen resultante y las vistas de `/admin`, y comprobar con las herramientas del navegador (pestaña Red) que ninguna respuesta contiene el prompt ni nombres de mascotas; revisar la fila del intento en la base local. Dep: T1521 — SC-011-015..020
- [ ] T1523 [GH:#73] **Cierre del Bloque C**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1521`; `/trinity` y `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1522 — SC-011-015..020

---

## Fase 3: Roles de plataforma en /admin (`#63`, P1)

### Bloque D — [GH:#63] Creación de roles en portal admin

**Goal**: el super-administrador raíz agrega delegados por correo de Google con un rol de plataforma; autorización en servidor; revocación inmediata; auditoría; sin contraseñas.
**Independent Test**: `SC-011-021..034`.
**Bloqueado por**: `D11-01`, `D11-03`, `D11-04` (T1501); `D11-02` solo condiciona una tarea adicional futura.

- [ ] T1524 [ARCH] [N2] [GH:#63] `/architect`: contratos de roles tras `D11-01`: `admin.openapi.yaml` 011 (`/api/admin/administrators*`), `admin-delegate.schema.json`, `STATE-ADM11-001` (`ACTIVE ↔ DISABLED`; el sentido DISABLED→ACTIVE está condicionado a `D11-04`, la opción B solo permite recrear), `error-catalog.json` 011, matriz operación→roles (cada operación de `/api/admin/*` vigente mapeada a roles), migración SQLite+Postgres de la tabla de delegados y acciones de auditoría nuevas (`additionalProperties: false`, límites explícitos). Dep: T1501, T1504 — REQ-ADM11-001, REQ-ADM11-002, REQ-ADM11-003, REQ-ADM11-007
- [ ] T1525 [GH:#63] Pruebas rojas (Memoria, SQLite y Postgres): delegado entra con Google y ancla `sub`; rol no autorizado → rechazo de servidor sin efectos; desactivar/rebajar rige en la siguiente petición; `ARGOS_ADMIN_EMAILS` no revocable ni degradable; último super-administrador protegido bajo transacción (`EDGE-011-002`); tabla vacía no impide el acceso raíz (`INV-ADM11-002`); auditoría sin correos en logs; prueba de arquitectura de separación de dominios de rol (ADR-011-02). Dep: T1524 — REQ-ADM11-001..007, INV-ADM11-001, INV-ADM11-002; SC-011-021..034
- [ ] T1526 [GOV] [GH:#63] `/trinity` + `/seraph` + `/sentinels`: escalada de privilegios entre roles, IDOR sobre `admin_id`, revocación en carrera, anclaje de `sub`, enumeración de correos y CSRF de las rutas nuevas. Dep: T1524 — REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-006
- [ ] T1527 [GH:#63] Implementar dominio (`PlatformRole`, matriz, reglas de bloqueo), repositorio de delegados en las tres implementaciones, casos de uso (alta, cambio de rol, desactivación/reactivación según `D11-04`), middleware que resuelve el rol por petición (ADR-011-01) y rutas `/api/admin/administrators*`. Dep: T1525, T1526 — REQ-ADM11-001..007
- [ ] T1528 [GH:#63] Implementar `AdministratorsPanel.tsx` en `presentation/admin` (alta por correo + rol, cambio de rol, desactivación, estado visible) y ocultar secciones no autorizadas por rol (comodidad, no control). Dep: T1527 — REQ-ADM11-002, REQ-ADM11-003; NFR-011-001
- [ ] T1529 [LOCAL] [GH:#63] **Prueba local manual** (`npm run dev`, Google simulado o `ARGOS_ADMIN_EMAILS` local): (1) como raíz agregar un correo con rol Soporte; (2) entrar en otra sesión como ese delegado y comprobar que solo ve lo autorizado; (3) llamar con `curl`/consola una operación no autorizada y ver el rechazo del servidor; (4) revocarlo desde el raíz y verificar el corte en la siguiente petición del delegado; (5) intentar revocar al correo raíz y al último super-administrador. Dep: T1528 — SC-011-021..034
- [ ] T1530 [GOV] [GH:#63] `/sati` (panel en 320/1024/1280, AA, mensajes sin jerga) y `/rama` (correos de delegados como dato personal: minimización y borrado). Dep: T1529 — NFR-011-001, NFR-011-002
- [ ] T1531 [GH:#63] **Cierre del Bloque D**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1527` → `bash scripts/compile-contracts.sh --feature 011` (si lo soporta); `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1530 — SC-011-021..034
- [ ] T1532 [HUM] [GH:#63] Neo decide `D11-02` (2FA) con el informe de `T1505`; si elige exigirlo, `/architect` abre tareas nuevas (no incluidas en esta lista); si no, se registra. Dep: T1505 — REQ-ADM11-008

---

## Fase 4: Informe clínico y foto del hogar (`#31`, `#59`, P2)

### Bloque E — [GH:#31] Mejorar presentación del enlace compartido al veterinario

**Goal**: la vista pública se lee como un informe ordenado, con secciones por mascota; foto de la mascota solo si Neo la aprueba.
**Independent Test**: `SC-011-035..040`.
**Bloqueado por**: `D11-09` solo para la foto (T1534); el reordenamiento no depende de ella.

- [ ] T1533 [GH:#31] Pruebas rojas del informe: una sección por mascota con encabezado semántico, mismo contenido de datos que hoy, ningún campo prohibido (`INV-VET11-001`), reflow sin scroll horizontal a 320 px, sin sesión (`credentials: 'omit'`). Dep: T1501 — REQ-VET11-001, REQ-VET11-003, INV-VET11-001; SC-011-035..040
- [ ] T1534 [ARCH] [N2] [GH:#31] Solo si `D11-09` ≠ C: enmienda del contrato de la vista pública (campo/endpoint de foto por token, MINOR de 005) y dictamen `/rama` + `/trinity` sobre la excepción al invariante de privacidad; si `D11-09` = C se registra «sin foto». Dep: T1501 — REQ-VET11-002
- [ ] T1535 [GH:#31] Implementar `SharedSummary.tsx`/`SharedPage.tsx` con la estructura de informe (y foto si `T1534` la autoriza). Dep: T1533, T1534 — REQ-VET11-001, REQ-VET11-002, REQ-VET11-003
- [ ] T1536 [LOCAL] [GH:#31] **Prueba local manual** (`npm run dev`): crear un enlace del hogar con 2 mascotas con registros, abrirlo en ventana privada y revisar secciones, separación entre mascotas, foto (si aplica), 320/1024/1280 px y teclado/lector de pantalla. Dep: T1535 — SC-011-035..040
- [ ] T1537 [GH:#31] **Cierre del Bloque E**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1535`; `/sati` y `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1536 — SC-011-035..040

### Bloque F — [GH:#59] Ajustar la foto de hogar cargada

**Goal**: la foto del hogar no ocupa el espacio actual ni se descarga completa en cada acceso (según decisión).
**Independent Test**: `SC-011-041..044`.
**Bloqueado por**: `D11-10`; conviene después del Bloque A (misma página).

- [ ] T1538 [GH:#59] Pruebas rojas: la foto se muestra en miniatura u oculta con «ya hay una imagen guardada» según `D11-10`; no se pide el objeto completo en la carga inicial cuando la opción lo permite (verificable por petición de red mockeada); subir, reemplazar y borrar siguen operando. Dep: T1501 — REQ-HOG11-003; SC-011-041..044
- [ ] T1539 [GH:#59] Implementar `HouseholdPhoto.tsx` según la opción de `D11-10`. Dep: T1538, T1508 — REQ-HOG11-003
- [ ] T1540 [LOCAL] [GH:#59] **Prueba local manual** (`npm run dev`): hogar con foto grande; comprobar tamaño visual, la pestaña Red (sin descarga completa si aplica), subir/reemplazar/borrar y 320/1024/1280 px. Dep: T1539 — SC-011-041..044
- [ ] T1541 [GH:#59] **Cierre del Bloque F**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1539`; `/sati`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1540 — SC-011-041..044

---

## Fase 5: Álbum del hogar, tope de hogares y foto de perfil (`#62`, `#74`, `#78`, P2)

### Bloque G — [GH:#62] Habilitar álbum de fotos del hogar

**Goal**: el hogar reúne en solo lectura las fotos de álbum de sus mascotas asignadas, respetando permisos.
**Independent Test**: `SC-011-045..052`.
**Bloqueado por**: `D11-11`; después del Bloque A. Alcance, orden y permisos del álbum (REQ-ALB11-001/002, SC-011-045) condicionados a `D11-11`.

- [ ] T1542 [ARCH] [N2] [GH:#62] Contrato de lectura del álbum del hogar (ruta de solo lectura, paginación con tope, forma de la respuesta sin claves de objeto, errores de catálogo); sin tablas nuevas (ADR-011-04). Dep: T1501, T1504 — REQ-ALB11-001, REQ-ALB11-003
- [ ] T1543 [GH:#62] Pruebas rojas (Memoria, SQLite y Postgres): agrega solo `PHOTO` de mascotas con asignación vigente al hogar; respeta permisos efectivos por mascota (`REQ-RBAC-001`); mascota en dos hogares aparece en ambos y desaparece al borrar (`EDGE-011-006`); salida de la mascota la retira; archivos clínicos fuera; tope y paginación. Dep: T1542 — REQ-ALB11-001, REQ-ALB11-002, REQ-ALB11-003; SC-011-045..052
- [ ] T1544 [GH:#62] Implementar `listHouseholdAlbum` (caso de uso + ruta) y `HouseholdAlbum.tsx` (reutiliza `PhotoAlbum`) dentro de la página de Hogares. Dep: T1543, T1508 — REQ-ALB11-001..003
- [ ] T1545 [LOCAL] [GH:#62] **Prueba local manual** (`npm run dev`): hogar con 2 mascotas con 3 fotos cada una; ver el álbum agrupado, con un segundo usuario de rol lector, mover una mascota fuera del hogar y recargar, borrar una foto y recargar; 320/1024/1280 px. Dep: T1544 — SC-011-045..052
- [ ] T1546 [GOV] [GH:#62] `/trinity` (IDOR entre hogares y mascotas, claves de objeto no expuestas) y `/sati`. Dep: T1545 — NFR-011-001, NFR-011-002
- [ ] T1547 [GH:#62] **Cierre del Bloque G**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1544`; `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1546 — SC-011-045..052

### Bloque H — [GH:#74] Validar máximo de hogares

**Goal**: dejar por escrito si hay tope (hoy no existe) y, si Neo lo fija, aplicarlo de forma determinista.
**Independent Test**: `SC-011-053..056`.
**Bloqueado por**: `D11-12`. `EDGE-011-008` y «crear y/o aceptar» solo aplican si `D11-12` fija tope.

- [ ] T1548 [ARCH] [GH:#74] Registrar en `spec.md` el resultado de la validación (hoy no existe tope) y la decisión de Neo `D11-12`; si hay tope: constante o parámetro, regla en `household-policies.ts`, código de error de catálogo y puntos de aplicación (crear, aceptar invitación, invitaciones pendientes). Si `D11-12` = A, las tareas `T1549..T1552` se cierran como «sin cambio». Dep: T1501 — REQ-HOG11-004
- [ ] T1549 [GH:#74] Pruebas rojas (solo si hay tope): crear y aceptar invitación respetan el tope; carrera de dos aceptaciones simultáneas no lo supera; quien ya lo supera conserva sus hogares (`EDGE-011-008`); error determinista. Dep: T1548 — REQ-HOG11-004; SC-011-053..056
- [ ] T1550 [GH:#74] Implementar la regla y el chequeo transaccional, y el aviso en la interfaz antes de intentar. Dep: T1549 — REQ-HOG11-004
- [ ] T1551 [LOCAL] [GH:#74] **Prueba local manual** (`npm run dev`): con el tope fijado (o confirmando su ausencia), crear hogares hasta el límite, invitar y aceptar desde un segundo usuario, ver el mensaje y el rechazo del servidor. Dep: T1550 (o T1548 si no hay tope) — SC-011-053..056
- [ ] T1552 [GH:#74] **Cierre del Bloque H**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1550`; `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1551 — SC-011-053..056

### Bloque I — [GH:#78] Agregar mi foto de perfil

**Goal**: foto de perfil propia (Google, subida o ambas según decisión), visible en encabezado y perfil, removible y borrada al eliminar la cuenta.
**Independent Test**: `SC-011-057..062`.
**Bloqueado por**: `D11-13`.

- [ ] T1553 [ARCH] [N2] [GH:#78] Contrato y datos del avatar de usuario según `D11-13` (migración SQLite+Postgres, endpoints `PUT/GET/DELETE`, clave de objeto con excepción documentada si aplica, límites de tamaño y MIME; lectura de `picture` solo si la opción incluye Google). Dep: T1501, T1504 — REQ-PRF11-001, REQ-PRF11-002
- [ ] T1554 [GH:#78] Pruebas rojas: foto visible en encabezado y `/cuenta`, quitar, reemplazar, fallback a iniciales si falla (`EDGE-011-007`), no visible a otros usuarios ni en la vista pública, y borrada con la eliminación de cuenta (`INV-PRF11-001`). Dep: T1553 — REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001; SC-011-057..062
- [ ] T1555 [GOV] [GH:#78] `/rama` (foto de Google copiada vs enlazada, consentimiento, retención) y `/trinity` (SSRF si se descarga `picture`, validación de firma de imagen, EXIF). Dep: T1553 — NFR-011-002
- [ ] T1556 [GH:#78] Implementar caso de uso, adaptadores, rutas y UI (`AccountPage.tsx`, `AppShell.tsx`, reutilizando `AvatarCropper`). Dep: T1554, T1555 — REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001
- [ ] T1557 [LOCAL] [GH:#78] **Prueba local manual** (`npm run dev`): subir y recortar una foto (y/o ver la de Google si aplica), verla en encabezado y perfil, quitarla, eliminar una cuenta de prueba y comprobar que no queda objeto; 320/1024/1280 px. Dep: T1556 — SC-011-057..062
- [ ] T1558 [GH:#78] **Cierre del Bloque I**: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 011 --task T1556`; `/sati` y `/oracle`. Luego `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. Dep: T1557 — SC-011-057..062

---

## Fase final: PR y cierre de la feature

- [ ] T1559 [GOV] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] `/oracle` cierre de Feature 011: trazabilidad completa (`bash scripts/verify-traceability.sh --feature 011`), `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`, sin deriva de contratos, sin `[x]` ajenos. Dep: T1511, T1516, T1523, T1531, T1537, T1541, T1547, T1552, T1558 — SC-011-001..062
- [ ] T1560 [HUM] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] **PR vinculado a cada Issue**: Neo (o `/morpheus` con su autorización) abre el PR de la rama de la feature con en el cuerpo `Closes #63`, `Closes #64`, `Closes #72`, `Closes #73`, `Closes #31`, `Closes #59`, `Closes #62`, `Closes #74`, `Closes #78` (o, para los bloques no entregados, una referencia `Refs #N`), de modo que cada Issue quede asociado al **Linked PR** en el Project #5; verificar la asociación en GitHub y ejecutar el último `node scripts/gh-project-sync.mjs sync --tasks specs/011-pulido-portal-hogares-admin/tasks.md`. El `git push` lo ejecuta solo Neo. Dep: T1559
- [ ] T1561 [HUM] [GH:#63, #64, #72, #73, #31, #59, #62, #74, #78] Neo marca las tareas `[x]` y cierra la feature (`COMPLETED`/`APPROVED`); `/morpheus` archiva bitácoras extensas de 011 al pasar a la siguiente feature. Dep: T1560
