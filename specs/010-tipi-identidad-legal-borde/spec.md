# Feature Specification: Identidad Tipi, páginas legales, protección en el borde, registro de menores y «Acerca de» (Feature 010)

**Feature Branch**: `010-tipi-identidad-legal-borde` (creada por Morpheus desde `origin/main` b4067b7)
**Created**: 2026-11-24
**Status**: `APPROVED` (2026-11-24, Nivel 2 Neo tras `/lock` T1402 y `/mouse` T1403 PASS). Techo de los agentes: `REVIEW`.
**Input**: `claude/inbox-feature-010.md` (GitHub Project #5; 5 ítems: `[GH:#65]`, `[GH:#66]`, `[GH:#67]`, `[GH:#75]`, `[GH:#33]`), tratado como el prompt funcional de Neo. Paquete de marca `tipi-marca.zip` (raíz del repo; SVG, PNG, fuentes, `BRAND-TIPI.md`).

> Regla de redacción: no se inventan requisitos que el inbox no pida. Lo que el inbox deja abierto se registra como decisión `D10-xx` para Neo (Nivel 2) con propuesta del Architect; ninguna se da por resuelta. Los IDs son `REQ|INV|SC|EDGE-<área>10-NNN` (áreas: `TIP10` identidad, `EDG10` borde, `LEG10` legal, `MEN10` menores, `ACE10` Acerca de) y `D10-NN` para decisiones (no REQ, para que la compuerta de trazabilidad no exija evidencia de código a una decisión).

## Verificación de premisas (lectura del estado real en disco, 2026-11-24)

| Premisa del inbox | Hallazgo en disco | Consecuencia |
| --- | --- | --- |
| `#65`: «no hay "Argos" visible» es el criterio | `index.html` tiene `<title>Argos — Pet Health Tracker</title>`; `AuthPages.tsx:26` pinta `Argos` en un `<h1>`; 17 archivos de `src/presentation/web` y `admin.html` mencionan Argos | El nombre de marca debe salir de **un solo lugar** (constante/tokens) y la búsqueda de cierre excluye identificadores internos (`argos_session`, `argos_oauth`, rutas, specs, repo) |
| `#65`: paleta centralizada | `tailwind.config.ts` ya centraliza tokens (`primary #1d4f3a`, `accent #c5f35a`, `cream #f4f8ef`…) distintos de la paleta Tipi (Bosque `#1F3D36`, Crema `#EFE8D8`, Terracota `#C4552D`) | Reemplazar los valores de los tokens; no escribir colores a mano. La paleta es tentativa |
| `#65`: «ajustable por /admin» | `/admin` y `platform_parameters` existen (009) pero su catálogo es **cerrado** (`REQ-CFG9-001`: «no permite crear claves nuevas desde la interfaz») | Editar nombre/logo/paleta desde `/admin` exige claves nuevas = contrato OpenAPI admin + migración = **N2** (`D10-02`) |
| `#66`: «hoy se confía en 1 salto» | `server.ts:240` `trustProxy: config.host === '0.0.0.0' ? 1 : false`; `app.ts:63` convierte el número en `hop < trustProxy`; los límites por IP usan `request.ip` (`registration-rate-limit.ts`) | Con Cloudflare la cadena pasa a 2 saltos; si no se cambia, todos los usuarios comparten la IP de Cloudflare y el límite 5/24 h bloquea a todos |
| `#66`: Cloudflare Free, Email Routing, Access | **No existe** nada de Cloudflare en `terraform/` ni en CI; el proveedor Terraform de Cloudflare sería dependencia nueva | Configuración manual en el panel de Cloudflare por Neo o proveedor Terraform = **N2** (`D10-04`); Cloud Run `*.run.app` sigue accesible directo salvo que se restrinja (`D10-03`) |
| `#67`: rutas públicas fuera de sesión como `/shared/:token` | `App.tsx:63` define `/shared/:token` fuera del `Guard`; `/privacidad` y `/terminos` no existen | Ruta pública sin llamar a `/auth/me` |
| `#67`: cookies `argos_session` y `argos_oauth` | Nombres internos vigentes | Se mencionan literalmente en el texto legal (son identificadores técnicos, no marca) |
| `#75`: «validar restricciones para menores» | **No existe** campo de edad ni declaración de mayoría de edad en `RegisterPage` ni en el registro con Google | Pregunta de producto/legal: decisión `D10-05` |
| `#33`: «dependencia de Feature 008» | La dependencia real es la 009: el portal `/admin` y su sesión aislada son de la 009 (cerrada) | Se construye sobre `/admin` 009; fotos con las mismas validaciones y EXIF de 004/005 |

## Alcance y no alcance

**Alcance (los 5 ítems del inbox):** `#65` identidad; `#66` borde Cloudflare y ajuste de IP real; `#67` `/privacidad` y `/terminos`; `#75` registro de menores; `#33` Acerca de.
**Fuera de alcance:** renombrar identificadores internos (rutas de archivo, specs, IDs, repo, cookies `argos_*`, variables `ARGOS_*`) salvo decisión aparte (`D10-01`); rediseño de pantallas más allá de color, tipografía y logo; pagos, analítica de terceros, correo de marketing; WAF de pago de Cloudflare; migrar `ARGOS_SCENE_WORKER_URL` (sigue en `*.run.app`, `INV-ESC6-018`).

## Decisiones de Neo (Nivel 2)

Aprobadas por Neo en Logos el 2026-11-24 (asentadas por `/architect`; no constituyen aprobación de la spec, que sigue `DRAFT`).

| ID | Decisión | Estado |
| --- | --- | --- |
| `D10-01` | No renombrar identificadores internos (cookies `argos_*`, variables `ARGOS_*`, rutas, specs, repo). Solo cambia la marca visible «Tipi». | `APPROVED` (2026-11-24) |
| `D10-02` | Fase base estática: módulo `brand` + tokens centralizados en `tailwind.config.ts`/`styles.css` + activos locales de `tipi-marca.zip`. Sin clave nueva en `/admin` ni contrato admin 1.8.0 para marca. `T1409` se cierra como N/A tras `T1403` (no se marca aún). `REQ-TIP10-005` queda sin implementar. | `APPROVED` (2026-11-24) |
| `D10-03` | `ARGOS_TRUST_PROXY_HOPS` (defecto `1`; `2` detrás de Cloudflare; entero validado 0..3; `trustProxy: true` prohibido). Riesgo residual aceptado: acceso directo a `*.run.app` (costo $0, `INV-ESC6-018`). Nota de despliegue obligatoria sobre `EDGE-010-002`: no fijar `HOPS=2` antes de activar el proxy naranja. | `APPROVED` (2026-11-24) |
| `D10-04` | Cloudflare por panel manual con runbook de `/link` (`T1419`), ejecutado por Neo (`T1420`). Cero dependencias nuevas; sin proveedor Terraform de Cloudflare. | `APPROVED` (2026-11-24) |
| `D10-05` | Declaración obligatoria «Soy mayor de edad (18+)» validada en servidor, en el registro con usuario/contraseña y en el registro con Google (`/elige-usuario`, antes de crear la cuenta `PENDING`). Guarda `adult_declared_at` y `adult_notice_version`. Sin fecha de nacimiento ni documento. Cuentas anteriores intactas. Cláusula en `/terminos` y `/privacidad` con procedimiento de supresión. Requiere validación legal externa (constancia explícita; no se da por conforme a ley alguna). | `APPROVED` (2026-11-24) |
| `D10-06` | Se mantienen los 4 placeholders literales hasta que Neo entregue valores definitivos en `T1437` (`contacto@tipi.pet` previsto con Email Routing). En `T1412` (`legal-texts.md`) el texto refleja la realidad: ambos proveedores de IA (Vertex AI y Gemini Developer API) y consentimiento explícito de biografía (009-C). | `APPROVED` (2026-11-24) |
| `D10-07` | `/acerca-de` pública (fuera de `Guard`, sin llamadas a `/auth/me`), enlazada en el pie de login/registro y en el menú. Escritura exclusiva en `/admin` (`404` uniforme sin sesión); foto sin EXIF; Markdown sanitizado en servidor y cliente. | `APPROVED` (2026-11-24) |

## User Scenarios & Testing

### User Story 1 — Veo Tipi, no Argos `[GH:#65]` (P0)
**Independent Test**: `SC-010-001..006`.
1. **Given** cualquier pantalla pública o de sesión, **When** la abro, **Then** veo el nombre Tipi y el logo; el `<title>`, los metadatos, los correos y los textos de interfaz no dicen Argos.
2. **Given** modo claro y oscuro y tamaños de 16 a 512 px, **Then** logo y favicon se ven correctamente (versión simple bajo 32 px).
3. **Given** un cambio de color en un token, **Then** toda la app lo refleja sin tocar componentes.
4. **Given** `https://tipi.pet`, **Then** la app responde y los enlaces generados (correos, enlace público, OAuth) usan ese dominio.

### User Story 2 — Páginas legales públicas `[GH:#67]` (P1)
**Independent Test**: `SC-010-007, SC-010-008, SC-010-009, SC-010-010, SC-010-011, SC-010-012, SC-010-013`.
1. **Given** una persona sin sesión, **When** abre `/privacidad` o `/terminos`, **Then** ve el texto sin consulta a `/auth/me` ni redirección a login.
2. **Given** `LoginPage` o `RegisterPage`, **Then** el pie enlaza ambas páginas.
3. **Given** el texto, **Then** cubre cada punto del contexto del inbox (servicio, descargo veterinario, cuentas `PENDING`, datos y eliminación desde `/cuenta`, IA con consentimiento, enlaces `/shared/:token`, cookies, sin pagos ni correos de marketing) y deja visibles los 4 placeholders.

### User Story 3 — Protección en el borde sin perder la IP real `[GH:#66]` (P1)
**Independent Test**: `SC-010-014..021`.
1. **Given** tráfico por Cloudflare, **Then** `request.ip` es la IP del cliente real y los límites (registro 5/24 h, login admin 10/15 min) cuentan por cliente, no por Cloudflare.
2. **Given** una petición con `X-Forwarded-For` falsificado, **Then** la IP efectiva no cambia a la falsificada.
3. **Given** una ráfaga a `/api/auth/*` o `/api/admin/*`, **Then** el borde responde `429` sin invocar Cloud Run.
4. **Given** `contacto@tipi.pet`, **Then** el correo se reenvía por Email Routing sin pasar por el proxy web.
5. **Given** OAuth Google (usuarios y `/admin`), sesiones y escenas, **Then** operan sin regresiones.

### User Story 4 — Menores de edad `[GH:#75]` (P2)
**Independent Test**: `SC-010-022, SC-010-023, SC-010-024, SC-010-025, SC-010-026`.
1. **Given** el registro, **When** no declaro ser mayor de edad, **Then** no puedo registrarme y el mensaje no revela datos de otras cuentas.
2. **Given** `/terminos`, **Then** indica la edad mínima y qué ocurre si se detecta una cuenta de menor.

### User Story 5 — Acerca de administrable `[GH:#33]` (P3)
**Independent Test**: `SC-010-027..035`.
1. **Given** `/acerca-de`, **Then** veo foto centrada con texto alternativo y el texto debajo; sin contenido cargado veo un estado vacío limpio.
2. **Given** `/admin`, **When** subo la foto y guardo el texto, **Then** la vista pública lo refleja de inmediato.
3. **Given** texto con HTML o script, **Then** se renderiza sanitizado; solo una sesión `/admin` puede escribir; la vista pública no expone rutas de almacenamiento.

## Requirements

### `[GH:#65]` Identidad Tipi
- **REQ-TIP10-001** (Nombre de marca único): una constante/módulo de marca (`brand`) es la única fuente del nombre visible; ningún componente, `<title>`, metadato de `index.html` y `admin.html`, correo o texto legal escribe el nombre a mano. Búsqueda de cierre: cero apariciones de `Argos` visibles; se excluyen identificadores internos (`D10-01`).
- **REQ-TIP10-002** (Logo y favicon): logo SVG junto al nombre, `favicon.svg`/PNG 16/32/48/180 y ícono de app 512/1024 del paquete; versión simple (`tipi-simbolo-simple*.svg`) bajo 32 px; variantes crema para modo oscuro.
- **REQ-TIP10-003** (Tokens): los valores de `tailwind.config.ts`/`styles.css` pasan a la paleta Tipi (Bosque `#1F3D36`, Crema `#EFE8D8`, Terracota `#C4552D` como acento) y a Nunito ExtraBold (título) e Inter (texto) con las fuentes `woff2` locales del paquete (sin CDN). Contraste WCAG AA verificado por `/sati`; si Terracota sobre Crema no llega a AA en texto pequeño, se restringe a elementos grandes o se oscurece (propuesta de `/sati`, decisión de Neo).
- **REQ-TIP10-004** (Dominio): `tipi.pet` como dominio de la app: URL base, enlaces de enlace público y OAuth, cookies (`Domain` no se fija: host-only), CORS y redirecciones salen de configuración de entorno, no de literales; los callbacks OAuth de Google se registran en la consola de Google (acción de Neo).
- **REQ-TIP10-005** (Edición desde `/admin`; **no se implementa** por `D10-02`, `T1409` N/A): `brand.display_name` editable en caliente en `/admin`, con la misma sensibilidad a CAS/auditoría que el catálogo de 009.
- **INV-TIP10-001**: ningún identificador interno cambia en esta feature (`D10-01`).

### `[GH:#66]` Borde Cloudflare
- **REQ-EDG10-001** (Salto de proxy configurable): el número de saltos de confianza se lee de configuración de entorno (`ARGOS_TRUST_PROXY_HOPS`, `D10-03`: defecto `1` = comportamiento actual, entero validado 0..3); con Cloudflare se fija en `2` solo después de activar el proxy naranja. `trustProxy: true` sigue prohibido.
- **REQ-EDG10-002** (Anti-spoofing): con N saltos, el `X-Forwarded-For` aportado por el cliente nunca determina `request.ip`; pruebas con cadenas de 1, 2 y 3 elementos y valores malformados/IPv6. **Excepción (`H-01` APPROVED): salvo acceso directo a `*.run.app`** (`ingress = INGRESS_TRAFFIC_ALL`), donde el cliente controla `request.ip` con `HOPS=2`; riesgo residual aceptado (`D10-03`, costo $0, `INV-ESC6-018`), mitigado por la aprobación manual de cuentas `PENDING` en `/admin`. Ese camino anula `REQ-EDG10-003`.
- **REQ-EDG10-003** (Límites por IP intactos): `REGISTRATION_LIMIT` (5/24 h) y el límite de login de `/admin` (10/15 min) cuentan por IP real y **por instancia** (`H-02` APPROVED, herencia `TRI-03` de 009: contador en memoria; hasta 10 cuentas por IP en 24 h con `max_instance_count = 2` y reinicio al escalar a cero; mitigado por rate limiting de Cloudflare y aprobación manual de `PENDING`); dos clientes distintos detrás de Cloudflare no comparten contador. No aplica al acceso directo a `*.run.app` (`H-01`).
  **Enmienda `H-T1418-01/02` (APPROVED, Neo, 2026-11-25):** la clave de cada contador es `ipLimitKey(ip)`, función única usada por los 5 limitadores en memoria (`registration`, `admin`, `google`, `invitee-search`, `scene`): IPv4 sin puerto; IPv6 agregada por prefijo **/64** (`v6:<4 grupos canónicos>`); se despoja `[ ]` y `%zona`; `::ffff:a.b.c.d` se normaliza a IPv4; forma canónica en minúsculas; entradas inválidas o no parseables van al cubo único `invalid`. Cada `Map` tiene **tope duro** con descarte de la entrada más antigua (no solo barrido de expiradas). Dos direcciones del mismo /64 comparten contador; una clave controlada por el cliente nunca se retiene tal cual.
- **REQ-EDG10-004** (Configuración de borde, operativa): proxy naranja con SSL *Full (strict)*; mitigación DDoS automática sin *Under Attack Mode* permanente; una regla de rate limiting Free para `/api/auth/*` y `/api/admin/*` en una expresión; caché de `/assets/*`; Email Routing `contacto@tipi.pet` con SPF/TXT en Cloudflare; Access opcional para beta. Entregable: runbook (`/link`) ejecutado por Neo; **no verificable en CI**.
- **REQ-EDG10-005** (Sin regresiones): cookies `Secure`/`SameSite`, callbacks `/api/auth/google/callback` y `/api/admin/auth/google/callback`, y `ARGOS_SCENE_WORKER_URL` (`*.run.app`, `INV-ESC6-018`) operan igual; costo adicional $0.
- **INV-EDG10-001**: ninguna ruta de `/api/admin/*` queda cacheada por el borde.

### `[GH:#67]` Páginas legales
- **REQ-LEG10-001** (Rutas públicas): `/privacidad` (`PrivacyPolicyPage.tsx`) y `/terminos` (`TermsPage.tsx`) fuera de `Guard` y de la consulta de sesión, como `/shared/:token`.
- **REQ-LEG10-002** (Contenido): español claro; cubre los 7 puntos de contexto del inbox sin cláusulas de e-commerce, reembolsos ni newsletters; descargo veterinario visible; placeholders literales `[NOMBRE DEL RESPONSABLE O PROYECTO]`, `[CORREO DE CONTACTO / PRIVACIDAD]`, `[PAÍS / JURISDICCIÓN]`, `[FECHA DE ÚLTIMA ACTUALIZACIÓN]`. El texto describe solo funciones que existen en disco; el Architect verifica cada afirmación contra la spec/código antes de cerrar.
- **REQ-LEG10-003** (Accesibilidad): jerarquía `h1`/`h2`, contraste AA, enlace de regreso a `/login` o `/`, foco visible, 320 px sin scroll horizontal.
- **REQ-LEG10-004** (Enlaces): pie discreto en `LoginPage` y `RegisterPage` (`AuthPages.tsx`) hacia ambas páginas.
- **REQ-LEG10-005** (Consistencia con IA y datos): el texto coincide con los avisos vigentes de escena (consentimiento por proveedor, `noticeVersion`, `INV-ESC6-014`) y con la eliminación desde `/cuenta`. Dictamen de `/rama`.
- **INV-LEG10-001**: las rutas legales no hacen ninguna llamada de red a la API.

### `[GH:#75]` Menores de edad
- **REQ-MEN10-001** (Declaración de mayoría de edad, `D10-05` APPROVED; error `ERR-MEN10-ADULT-DECLARATION-REQUIRED`): el registro por usuario/contraseña y por Google exige marcar «Soy mayor de edad»; el servidor rechaza el registro sin declaración (no solo la interfaz) con error del catálogo; el valor aceptado y la versión del texto se guardan con la cuenta (columna nueva, migración, **N2**). **Orden (`H-03` APPROVED):** `adultDeclaration` se valida antes de consumir el estado OAuth `USERNAME`; el `422` no consume el estado y el reintento con declaración crea la cuenta. **Versión del texto (`H-ARCH-ADULT-VERSION`, fijada por `/architect` 2026-11-25):** `adult_notice_version` es SemVer `N.N.N` (patrón del contrato `AdultNoticeVersion`), la fija el servidor y nunca el cliente. Constante única `ADULT_NOTICE_VERSION = "0.1.0"` mientras `legal-texts.md` esté `DRAFT` (hasta la firma de `T1425`); cambia solo por decisión de `/architect` con la enmienda de los textos 18+ (patch: redacción sin cambio de efecto; minor: cambio de efecto o de datos; major: cambio de la edad mínima) y pasa a `1.0.0` únicamente cuando Neo apruebe la publicación (Nivel 2).
- **REQ-MEN10-002** (Cuentas anteriores): las cuentas existentes siguen entrando sin cambios; no se les exige declaración retroactiva (requisito vigente por `D10-05` APPROVED, «cuentas anteriores intactas»; `/rama` lo confirma en `T1426`, sin cambiar el requisito).
- **REQ-MEN10-003** (Mínimo dato): no se pide fecha de nacimiento ni documento.
- **REQ-MEN10-004** (Texto): `/terminos` y `/privacidad` declaran la edad mínima y el procedimiento ante una cuenta de menor detectada (supresión a petición, canal `[CORREO DE CONTACTO / PRIVACIDAD]`).
- **INV-MEN10-001**: el rechazo no revela si el usuario o el correo ya existen.

### `[GH:#33]` Acerca de
- **REQ-ACE10-001** (Vista pública): ruta `/acerca-de` (`D10-07`) con foto responsiva y `alt` accesible y texto narrativo debajo; Markdown básico sanitizado (sin HTML arbitrario); estado vacío limpio.
- **REQ-ACE10-002** (Gestión en `/admin`): sección «Acerca de» para subir/reemplazar foto (GCS, formato/peso y EXIF como 004/005) y editar el texto; publicación inmediata. Una foto de formato o peso inválido se rechaza con `ERR-ACE10-PHOTO-INVALID` (422).
- **REQ-ACE10-003** (Seguridad): solo sesión `/admin` escribe (`404` uniforme sin sesión de administración, patrón 009); CAS/versionado (una escritura con versión obsoleta se rechaza con `ERR-ACE10-PRECONDITION-FAILED`, 412); texto sanitizado en servidor y cliente; la vista pública no expone rutas de almacenamiento (URL firmada o ruta de media del servidor).
- **REQ-ACE10-004** (Persistencia): tabla `about_content` (singleton) y objeto de foto; migración SQLite y Postgres, **N2**; ver `data-model.md`.
- **INV-ACE10-001**: la foto pública no conserva EXIF.

## Success Criteria
- **SC-010-001..006** (`#65`): búsqueda de `Argos` visible = 0; logo/favicon claro y oscuro 16..512 px; tokens únicos; `tipi.pet` genera enlaces; compuertas verdes.
- **SC-010-007, SC-010-008, SC-010-009, SC-010-010, SC-010-011, SC-010-012, SC-010-013** (`#67`): rutas públicas sin `/auth/me`; pie en login y registro; 7 puntos cubiertos; placeholders presentes; axe sin violaciones AA; 320 px.
- **SC-010-014..021** (`#66`): IP real con 2 saltos (`SC-010-014`); spoofing de XFF sin efecto **salvo acceso directo a `*.run.app`** (`SC-010-015`, `H-01`); límites «por instancia y por clave normalizada `ipLimitKey(ip)`» (IPv6 por /64; IPv4 sin puerto; inválidas al cubo `invalid`; tope duro con descarte por antigüedad en los 5 mapas) por cliente (`SC-010-016`, `H-02`, `H-T1418-01/02`; pruebas `SEN-IP-04..09`); `429` en el borde (verificación manual en producción por Neo); Email Routing operativo; OAuth y escenas sin regresión; costo $0; `/api/admin/*` no cacheado.
- **SC-010-022, SC-010-023, SC-010-024, SC-010-025, SC-010-026** (`#75`): registro sin declaración rechazado por API; mensaje sin enumeración; cuentas previas intactas; texto legal con edad mínima.
- **SC-010-027..035** (`#33`): vista con foto/texto; estado vacío; publicación inmediata; XSS neutralizado; `404` sin sesión admin; EXIF eliminado; límites de formato/peso; sin rutas internas expuestas; auditoría de cambio.

## Edge cases (ampliados tras `T1402` de `/lock`, acta `.specify/memory/audits/lock-010-T1402-edge-2026-11-24.md`)
- **EDGE-010-001** (`#66`): XFF con IP IPv6, con puertos o más de N elementos; cabecera duplicada. Tarea: `T1416`, `T1418`.
- **EDGE-010-002** (`#66`): despliegue con `ARGOS_TRUST_PROXY_HOPS` mal fijado en 1 detrás de Cloudflare: todos comparten IP y el límite de registro bloquea al sexto usuario de ese conjunto. Debe haber prueba de detección y nota de despliegue. Tareas: `T1416` (simulación de `HOPS=1` con cadena de 2 elementos), `T1420` (dos clientes reales con contadores independientes). El alcance del contador es «por instancia y por IP real» (`H-02` APPROVED); el bloqueo al sexto usuario aplica dentro de una misma instancia.
- **EDGE-010-003** (`#65`): correos y enlaces generados antes del cambio de dominio siguen resolviendo o fallan con mensaje claro; sesiones host-only tras migrar a `tipi.pet` (se pierde la sesión, sin bucle de redirección) y callback OAuth antiguo (falla con mensaje claro). Tarea propia: `T1443`.
- **EDGE-010-004** (`#67`): `/shared/:token`, `/privacidad`, `/terminos` y `/acerca-de` con cookie de sesión caducada no redirigen a login, y el bootstrap global de `App.tsx` no llama a `/auth/me` antes del enrutado en rutas públicas. Tarea: `T1411` (ampliada).
- **EDGE-010-005** (`#75`): registro con Google sin pasar por el formulario: la declaración debe pedirse en `/elige-usuario` o antes de crear la cuenta `PENDING`; la declaración se valida antes de consumir el estado OAuth (`H-03` APPROVED); carrera de dos pestañas (con y sin casilla). Tarea: `T1422`.
- **EDGE-010-006** (`#33`): foto subida y texto guardado en dos pasos: si falla el segundo, el público no ve un estado mixto; además red caída durante la subida a GCS, objeto huérfano (limpieza) y carrera de foto con versión obsoleta frente a texto con CAS (la foto incrementa `version`: regla propuesta, `T1429` la fija en el contrato). Tarea: `T1428` (ampliada).
- **EDGE-010-007** (`#33`): Markdown con enlace `javascript:` o imagen remota; payloads SVG/HTML/polyglot como «foto» (rechazo por firma, `INV-ARC-002`) y metadatos de PNG/WebP (XMP, tEXt, EXIF embebido) eliminados, no solo EXIF JPEG. Tareas: `T1428`, `T1432`.
- **EDGE-010-008** (`#66`): acceso directo a `https://<servicio>.run.app` sin Cloudflare con `X-Forwarded-For` rotado y `HOPS=2`: `request.ip` queda controlado por el atacante y el tope de registro (`REQ-EDG10-003`) se elude a costo $0. `H-01` APPROVED (riesgo aceptado, documentado). Tareas: `T1416` (prueba del caso directo, documentada, no verde por defecto), `T1418` (criterio de aceptación).
- **EDGE-010-009** (`#66`/`#75`): contador de registro en memoria por instancia (`registration-rate-limit.ts`; `max_instance_count = 2`, `min_instance_count = 0`): hasta 10 cuentas por IP en 24 h con dos instancias y reinicio del contador al escalar a cero. `H-02` APPROVED. Tarea: `T1416` (prueba de dos instancias simuladas y de reinicio que documente el comportamiento real).
- **EDGE-010-010** (`#75`): un `422 ERR-MEN10-ADULT-DECLARATION-REQUIRED` emitido después de consumir el estado OAuth obligaría a repetir todo el flujo de Google; `H-03` APPROVED: el `422` no consume el estado. Tarea: `T1422`.
- **EDGE-010-011** (`#33`): `body_markdown` sin tope en `PUT /api/admin/about` (payload de 50 MB). Tope **APPROVED** (2026-11-24): **20 000 caracteres** (~80 KB en UTF-8) validados en servidor con rechazo `413`/error del catálogo, y `maxLength=20000` en el editor de `/admin`. Tareas: `T1428` (prueba de rechazo en el tope y en tope+1), `T1429` (valor en contrato y `data-model.md`).
- **EDGE-010-012** (`#65`/`#66`): la URL del enlace público se arma con protocolo y host de la petición (`share-links.routes.ts:8`); con `trustProxy` activo, `X-Forwarded-Host`/`Host` reenviados pueden influir en la URL. La base debe salir solo de configuración (`REQ-TIP10-004`) y ignorar `X-Forwarded-Host`. Tareas: `T1404` (prueba roja), `T1408`.

## Decisiones de Neo (Nivel 2) — H-01, H-02, H-03, EDGE-010-011 — `APPROVED` (2026-11-24)

Resueltas por Neo en Logos el 2026-11-24 (acta `T1402` de `/lock`); asentadas por `/architect`. La spec sigue `DRAFT`.

| ID | Resolución | Estado |
| --- | --- | --- |
| `H-01` | Opción A: se acepta el acceso directo a `*.run.app` y se documenta el riesgo residual (costo $0, `INV-ESC6-018`; mitigado por la aprobación manual de cuentas `PENDING` en `/admin`). `REQ-EDG10-002` y `SC-010-015` llevan la excepción «salvo acceso directo a `*.run.app`»; ese camino anula `REQ-EDG10-003`. Reflejado en `T1416`, `T1418` y el runbook `T1419`. Sin cambio de Terraform. | `APPROVED` (2026-11-24) |
| `H-02` | Opción A: el límite de registro es «por instancia y por IP real» (herencia `TRI-03` de 009): hasta 10 cuentas por IP en 24 h con `max_instance_count = 2` y reinicio del contador al escalar a cero; mitigado por rate limiting de Cloudflare en el borde y aprobación manual de `PENDING`. Sin tabla ni migración. `EDGE-010-002`, `REQ-EDG10-003`, `SC-010-016` enmendados; `T1416` documenta dos instancias simuladas y reinicio. | `APPROVED` (2026-11-24) |
| `H-03` | Opción A: `adultDeclaration` se valida ANTES de consumir el estado OAuth `USERNAME`; el `422 ERR-MEN10-ADULT-DECLARATION-REQUIRED` NO consume el estado. `REQ-MEN10-001` enmendado; `T1422` incluye reintento tras `422` y carrera de dos pestañas (con y sin casilla). | `APPROVED` (2026-11-24) |
| `EDGE-010-011` | Tope de `body_markdown`: **20 000 caracteres** (~80 KB UTF-8), validado en servidor (`413` o error del catálogo) y `maxLength=20000` en el editor de `/admin`. Asentado en `data-model.md`, `T1428` y `T1429`. | `APPROVED` (2026-11-24) |
| `H-04` (nota operativa) | Correcto: `server.ts:240` fija `trustProxy=false` si `host !== '0.0.0.0'`; `ARGOS_HOST=0.0.0.0` en `T1417` y `quickstart.md`. | Confirmado |
| `H-T1418-01` | Dictamen `/trinity` T1418: IPv6 sin agregación evade `REQ-EDG10-003` sin spoofing. Resolución: agregar por prefijo **/64** vía `ipLimitKey(ip)`. | `APPROVED` (Neo, 2026-11-25) |
| `H-T1418-02` | Claves de limitadores controladas por el cliente y `Map` sin tope real (`MAX_TRACKED_IPS` solo barre expiradas). Resuelto en código por `ipLimitKey` + tope duro con descarte por antigüedad en los 5 mapas (`REQ-EDG10-003`, `SC-010-016`); sin Terraform. | Resuelto en spec (2026-11-25); verificación por Keymaker/Oracle |
| `H-T1418-03` | Denegación dirigida del login de `/admin` suplantando la IP de un administrador por acceso directo a `*.run.app` (10 fallos → `429` 15 min). Riesgo residual **BAJO** (requiere camino directo y conocer la IP; la autorización es OAuth + lista de correos, sin contraseña). Aceptado por Neo, extensión de `H-01`; se documenta en el runbook `T1419`. | `APPROVED` riesgo aceptado (Neo, 2026-11-25) |
| Referencia | Dictamen `.specify/memory/audits/trinity-010-T1418-ip-xff-2026-11-24.md`. | — |
| `DEUDA-010-NOTICE` | La actualización de `scene-notice.ts` (v3 → v4) queda como deuda técnica explícita, para una tarea dedicada posterior. Motivos: evitar reabrir suites y contratos de 006/009 y el reconsentimiento masivo fuera del alcance de `#67`. Hasta entonces, `/privacidad` y `/terminos` reflejan la realidad vigente; el aviso de consentimiento de escena conserva su texto (incluida la descripción de clave y de entrenamiento que el dictamen de `/rama` marcó: `scene-notice.ts:52`, `:54`, `:68`, `:87`, `:101`). | `APPROVED` (2026-11-24) |
| `DEUDA-010-MENOR-SUPRESION` | Acción futura de supresión de cuenta de menor en `/admin` (el texto de `/privacidad` §11 y `/terminos` §3 promete la supresión al detectar un menor). **Regla operativa vigente: NUNCA ejecutar `DELETE` manual en SQL**; la supresión usa siempre el caso de uso transaccional de `/cuenta` (cascada atómica de archivos, fotos, sesiones, hogares y fila de auditoría con seudónimo HMAC). Sin código nuevo en 010. Referencia: `RAMA-T1426-01` (`.specify/memory/audits/rama-010-T1426-menores-2026-11-25.md`). Debe quedar documentada en el runbook antes de publicar (`T1437`). | `APPROVED` (Neo, 2026-11-25) |
| `DEUDA-010-LOCK-GOOGLE-MINOR` | Dos hallazgos de severidad **BAJA** del flujo Google 18+, fuera de 010: `H-01` (dos pestañas con la misma cookie de registro: la segunda recibe un `400` engañoso tras la creación de la primera; sin cuenta duplicada) y `H-02` (cuerpo vacío o sin objeto responde `ERR-SCHEMA` en vez del error de declaración 18+). Referencia: `.specify/memory/audits/lock-010-T1426-google-2026-11-25.md`. | `APPROVED` deuda aceptada (Neo, 2026-11-25) |

## Compuertas de riesgo convocadas
`/rama` (menores, privacidad, texto legal, EXIF y datos de `#33`), `/trinity` (`#66` IP/rate limit y `#33` sanitización/autorización), `/lock` (edge cases de `#66`, `#75`, `#33`), `/sati` (tokens, contraste, páginas legales), `/mouse` **una sola vez** al cerrar la spec (`T1403`). `/sentinels` solo para spoofing de XFF (`T1414`).
