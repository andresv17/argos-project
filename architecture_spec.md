# ARGOS — Especificación técnica de la realidad funcional actual (insumo para rediseño UI/UX)

- **Fecha de inventario:** 2026-11-14. **Rama / commit de referencia:** `002-plataforma-v21` @ `7b6e576`.
- **Autor:** Architect. **Estado:** REVIEW (documento descriptivo; no modifica código, contratos ni especificaciones).
- **Fuentes leídas en disco:** `src/presentation/web/**`, `src/generated/**`, `src/domain/access/rbac.ts`, `src/application/use-cases/**`, `src/infrastructure/http/**`, `specs/002-plataforma-v21/contracts/**` y `tests/**`.
- **Convención de etiquetas:**
  - **[UI]** = existe hoy en la pantalla.
  - **[CONTRATO]** = existe en el contrato/API, pero la pantalla actual no lo muestra ni lo envía. No es una funcionalidad disponible para el usuario hoy; se lista solo para que el rediseño no la dé por existente en la interfaz.
  - **[BRECHA]** = discrepancia verificada entre la UI y el contrato. Detalle en 4.3.
- **Verificación:** los hechos de este documento se comprobaron por lectura de código. Las afirmaciones marcadas "verificado en vivo" se comprobaron contra la API en `127.0.0.1:3100`. Las pruebas E2E de Playwright no se ejecutaron en esta auditoría.

---

### 1. Stack Tecnológico Actual

**Frontend**

| Elemento | Realidad actual |
|---|---|
| Librería | React 18.3.1 y react-dom 18.3.1 (`StrictMode` activo en `main.tsx`) |
| Lenguaje | TypeScript ~5.6.3, módulos ES (`"type": "module"`) |
| Empaquetado | Vite 5.4.21 + `@vitejs/plugin-react` 4.7.0; `build.target` es2022; salida `dist` |
| Estilos | Tailwind CSS 3.4.19 con PostCSS 8.5.32 y Autoprefixer 10.6.2; archivos `tailwind.config.ts`, `postcss.config.js` y `src/presentation/web/styles.css`; las clases se escriben en línea (`className`) |
| Librerías de UI, iconos o fuentes | Ninguna. Las dependencias de ejecución del proyecto son solo: `react`, `react-dom`, `react-router-dom`, `openapi-fetch`, `ajv`, `ajv-formats`, `fastify`, `@fastify/cookie`, `better-sqlite3` |
| Documento base | `index.html`: `lang="es"`, `<title>` "Argos — Pet Health Tracker", viewport `width=device-width, initial-scale=1.0`, raíz `#root` |
| Colores con significado de dominio | Definidos en `view-model.ts`: semáforo sanitario (`UI_BADGE_STYLE`) y 8 colores de dueño (`OWNER_COLORS`, `OWNER_TEXT_COLOR` blanco) |

**Enrutamiento, estado y sesión**

| Elemento | Realidad actual |
|---|---|
| Enrutador | `react-router-dom` 7.18.5: `BrowserRouter`, `Routes`, `Route`, `NavLink`, `Link`, `Navigate`, `useNavigate`, `useLocation` |
| Guardia de rutas | Componente `Guard` en `App.tsx` + función pura `routeRedirect(authenticated, path)` en `view-model.ts` |
| Estado de sesión | Contexto React `SessionProvider` (`session.tsx`): `status` ∈ {`LOADING`, `ANONYMOUS`, `AUTHENTICATED`}, `user` (`UserSelfProfile` o nulo), `api`, y las funciones `register`, `login`, `logout` |
| Estado de pantalla | `useState`/`useCallback`/`useEffect` locales por página. No hay librería de estado global. Un segundo contexto, `InvitationsContext` (en `AppShell.tsx`), comparte `count` (invitaciones pendientes), `householdCount` y `refresh` |
| Persistencia en el navegador | Ninguna propia: la sesión vive en la cookie `argos_session` (HttpOnly, SameSite=Strict, Path=/), que la SPA no lee |
| Consulta de sesión | `GET /auth/me` una sola vez al arrancar. No hay sondeo, temporizadores ni renovación al recuperar el foco |
| Cliente HTTP | `openapi-fetch` 0.17.0 mediante el cliente generado `src/generated/api/client.ts` (`createApiClient`); tipos generados con `openapi-typescript` 7.13.0 en `src/generated/api/openapi-types.ts`; URL base `/api` |
| Proxy de desarrollo | Vite en `127.0.0.1:5173` (`strictPort`), `/api` hacia `127.0.0.1:3100` (variables `E2E_WEB_PORT` y `E2E_API_PORT`) |
| Protección CSRF | Cabecera `X-Argos-Request: 1` (constantes `CSRF_HEADER_NAME` y `CSRF_HEADER_VALUE`); el cliente generado la añade a toda petición y las llamadas mutantes la pasan además por `CSRF_PARAMS` |
| Validación de contratos en cliente | Ajv 8.20.0 con validadores compilados desde los contratos (`src/generated/schemas/validators.mjs`). `validateInput` (`validation.ts`) devuelve el primer error por campo; el texto sale del catálogo de errores (`ERROR_CATALOG[...].detailTemplate`); el código por campo sale de `x-sdd-error` (`FIELD_ERROR_CODES`). Sin esquemas escritos a mano |
| Hook de formularios | `useContractForm` (`use-contract-form.ts`): estado `values`, `errors`, `message`, `busy`; envía solo si el cliente valida; `formValues` omite los campos vacíos y convierte a número los campos declarados `numeric` |
| Manejo de errores de API | `unwrap` lanza `ApiProblem` con un `ProblemDetails` (RFC 9457). Si el cuerpo no trae un código del catálogo, o falla la red, se usa `ERR-INTERNAL-UNEXPECTED`. El texto visible es siempre el `detailTemplate` del catálogo |

**Pruebas y calidad (contexto del rediseño)**

| Elemento | Realidad actual |
|---|---|
| Unitarias e integración | Vitest 2.1.9, entorno `node`, specs bajo `tests/unit`, `tests/property`, `tests/integration`, `tests/security`. Los componentes se prueban con render estático (sin DOM de navegador) |
| E2E / visual / accesibilidad | Playwright 1.65.0, proyecto `chromium` (Desktop Chrome), `locale` es-CO, zona `America/Bogota`, 1 worker |
| Accesibilidad automática | `@axe-core/playwright` 4.14.0 con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` (`tests/e2e/visual/e2e-support.ts`) |

---

### 2. Mapa de Navegación y Rutas

Definidas en `src/presentation/web/App.tsx`. La mascota activa, la pestaña de módulo, el contexto (hogar) y los modos de formulario son **estado de componente**; ninguno cambia la URL. No existen rutas `/pets/:id`, `/cuenta` ni `/dashboard`.

| Ruta | Acceso / Auth | Propósito funcional | Origen / Destino |
|---|---|---|---|
| `/login` | Pública. Con sesión activa redirige a `/` | Iniciar sesión con usuario y contraseña | **Origen:** redirección desde cualquier ruta protegida sin sesión; enlace "Inicia sesión" de `/register`; cierre de sesión (`navigate('/login')`). **Destino:** `/` al iniciar sesión (`replace`); `/register` por el enlace "Regístrate" |
| `/register` | Pública. Con sesión activa redirige a `/` | Crear cuenta; la sesión queda iniciada | **Origen:** enlace "Regístrate" de `/login`. **Destino:** `/` al registrarse (`replace`); `/login` por el enlace "Inicia sesión" |
| `/` | Protegida: sin sesión redirige a `/login` | Ver y gestionar las mascotas por contexto ("Mis mascotas" o un hogar), su ficha y sus registros | **Origen:** destino tras login/registro; ruta comodín `*`; enlace "Mascotas" de la cabecera. **Destino:** `/households` y `/backup` por la cabecera |
| `/households` | Protegida | Crear hogares, invitar, aceptar o rechazar invitaciones, retirar miembros, abandonar y eliminar hogares | **Origen:** enlace "Hogares" de la cabecera. **Destino:** el resto de la cabecera |
| `/backup` | Protegida | Descargar el respaldo propio e importar un archivo de respaldo | **Origen:** enlace "Respaldo" de la cabecera. **Destino:** el resto de la cabecera |
| `*` (cualquier otra) | `Navigate` a `/`; después se aplica la guardia | Redirección | Cualquier URL desconocida → `/` (y a `/login` si no hay sesión) |

**Reglas de la guardia:**
- `LOADING` (consulta inicial de `GET /auth/me` en curso): muestra el texto "Cargando…" con `role="status"`.
- Sin sesión y ruta no pública → `/login` (sin parámetro de retorno).
- Con sesión y ruta pública (`/login`, `/register`) → `/`.
- Rutas públicas = `PUBLIC_PATHS` = `['/login', '/register']`.

**Marco compartido (`AppShell`) en `/`, `/households` y `/backup`:** cabecera con enlace de salto "Saltar al contenido", marca "Argos", navegación principal (`aria-label="Principal"`) con tres enlaces — "Mascotas", "Hogares" y "Respaldo" —, nombre visible del usuario y botón "Cerrar sesión". El contenido va en `<main id="main-content" tabIndex=-1>`. Las pantallas públicas usan su propio `<main id="main-content">` sin cabecera.

---

### 3. Inventario Detallado por Pantalla (Contratos de Datos)

#### 3.0 Convenciones comunes

- **Errores de API:** el contrato declara el cuerpo `ProblemDetails` con los campos `type`, `code`, `title`, `status`, `detail`, `invariantRef`, `instance`, `field` (opcional) y, en importaciones, `finalState`. La UI muestra solo el texto del catálogo para `code`. Si `field` es una cadena en un formulario, el texto se ubica bajo ese campo; en caso contrario, en el mensaje general del formulario (`role="alert"`).
- **Error de cliente sin campo visible:** `validateInput` coloca el error bajo el nombre del campo del contrato. Si ese campo no existe como control en el formulario, no se muestra ningún texto (ver brecha B-1).
- **Estado `busy`:** durante el envío de un formulario el botón de envío queda deshabilitado (`disabled`). No hay indicador de carga adicional.
- **Cabecera CSRF:** toda mutación envía `X-Argos-Request: 1`. Una petición sin ella recibe `403 ERR-AUTH-CSRF-REJECTED`.
- **Errores globales posibles en toda operación autenticada:** `401 ERR-AUTH-UNAUTHENTICATED` ("Debes iniciar sesión para continuar"; mismo mensaje para sesión inexistente, revocada, expirada por inactividad de 30 min o por tope absoluto de 24 h) y `500 ERR-INTERNAL-UNEXPECTED`. La UI no tiene tratamiento especial del 401: muestra el texto del catálogo en el área de error de la pantalla y no redirige a `/login` por sí misma.

#### 3.1 Pantalla `/login`

**Endpoints consumidos**
- `GET /auth/me` (al montar el proveedor de sesión): `401` → estado `ANONYMOUS`.
- `POST /auth/login` → `200 SessionView`. Errores del contrato: `401`, `403`, `422`, `429`, `500`.

**Payload de lectura** (`SessionView`, cerrado): `user` (`UserSelfProfile`), `createdAt`, `lastActivityAt`, `idleExpiresAt`, `absoluteExpiresAt` (todas las fechas son `date-time` en UTC con milisegundos, no nulas). **La UI solo conserva `user`.**
- `UserSelfProfile`: `id` (uuid), `username` (3–30, `^[a-z0-9._-]+$`), `displayName` (1–60, sin espacios en los extremos), `createdAt`, `email` (correo ≤254 o nulo), `preferredLanguage` (`es`|`en`|`pt`), `timezone` (texto 1–64). **La UI muestra únicamente `displayName`** (en la cabecera) y usa `id` para decisiones internas.

**Acciones y mutaciones**
- **Acción "Iniciar sesión"** — formulario en página (`<form aria-label="Iniciar sesión">`).
  - Permisos: ninguno (pública).
  - Campos de `LoginInput` (cerrado): `username` (obligatorio, 1–30), `password` (obligatorio, 1–128; no se aplica la política de contraseña nueva al iniciar sesión).
  - Validación: cliente con el validador `LoginInput`; servidor valida de nuevo.
  - Errores: `ERR-AUTH-INVALID-CREDENTIALS` 401 ("Usuario o contraseña incorrectos."); `ERR-AUTH-TOO-MANY-ATTEMPTS` 429 (5 intentos fallidos en una ventana de 15 minutos); `ERR-AUTH-CSRF-REJECTED` 403; `ERR-SCHEMA-VALIDATION-FAILED` 422 (campo `field` cuando aplica). Se muestran en el mensaje general del formulario.
  - Resultado: redirección a `/` con `replace`.
- **Interacción auxiliar:** el campo de contraseña tiene un botón "Mostrar contraseña" (`aria-pressed`).

**Estados requeridos:** verificando sesión inicial (`LOADING`); formulario en reposo; envío en curso (`busy`); error de campo; error general; redirección por éxito.

#### 3.2 Pantalla `/register`

**Endpoints:** `GET /auth/me` (inicial); `POST /auth/register` → `201 SessionView` (errores `403`, `409`, `422`, `500`). El payload de lectura es el mismo `SessionView` de 3.1.

**Acciones y mutaciones**
- **Acción "Crear cuenta"** — formulario en página (`<form aria-label="Crear cuenta">`).
  - Permisos: ninguno (pública).
  - Campos de `RegisterUserInput` (cerrado):

| Campo | Obligatorio | Regla del contrato |
|---|---|---|
| `username` | Sí | 3–30 caracteres, `^[a-z0-9._-]+$` |
| `displayName` | Sí | 1–60, sin espacios en los extremos |
| `password` | Sí | 10–128 caracteres; al menos 1 mayúscula (`\p{Lu}`), 1 dígito y 1 símbolo ASCII |
| `confirmPassword` | Sí | 1–128; la igualdad con `password` la comprueba el servidor |
| `email` | No | Correo válido ≤254, o nulo |

  - Validación: cliente con el validador `RegisterUserInput` (código `ERR-AUTH-WEAK-PASSWORD` para `password`); la igualdad de contraseñas y la unicidad de usuario son del servidor.
  - Errores: `ERR-AUTH-USERNAME-TAKEN` 409; `ERR-AUTH-WEAK-PASSWORD` 422 (campo `password`); `ERR-SCHEMA-VALIDATION-FAILED` 422; `ERR-AUTH-CSRF-REJECTED` 403.
  - Resultado: la sesión queda iniciada; redirección a `/`.
- Contenido auxiliar: campos de contraseña con "Mostrar contraseña"; enlace a `/login`.

**Estados requeridos:** igual que 3.1, más error de campo bajo `username`, `displayName`, `email`, `password`, `confirmPassword`.

#### 3.3 Marco compartido (cabecera `AppShell`)

**Endpoints consumidos:** `GET /invitations` (cuenta las invitaciones pendientes), `GET /households` (cuenta los hogares), `POST /auth/logout` → `204`.

**Payload de lectura usado:** solo la **longitud** de cada lista. Cualquier error en esas dos consultas deja el contador en 0 sin mostrar mensaje.

**Elementos y acciones**
- Contadores en el enlace "Hogares": `data-household-count` (número de hogares) y `data-pending-invitations` (invitaciones pendientes), con texto visible "hogares" e "invitaciones" y texto equivalente para lector de pantalla.
- **Acción "Cerrar sesión"** — botón directo; `POST /auth/logout`; ignora errores de API; limpia la sesión y navega a `/login`.
- Los contadores se refrescan al montar y cuando `HouseholdsPage` llama a `refresh()`.

#### 3.4 Pantalla `/` — Mascotas

**Endpoints consumidos**

| Método y ruta | Uso |
|---|---|
| `GET /households` | Pestañas de contexto (un hogar por pestaña) |
| `GET /pets` | Tarjetas del contexto "Mis mascotas". Resumen del contrato: mascotas propias y las visibles por asignación a hogares |
| `GET /households/{householdId}/pets` | Tarjetas de un hogar; la UI usa `.pets` del `HouseholdPetsView` |
| `GET /pets/{petId}/dashboard` | Ficha de la mascota activa |
| `POST /pets` | Alta de mascota |
| `PATCH /pets/{petId}` | Edición |
| `DELETE /pets/{petId}` | Eliminación |
| `POST /pets/{petId}/records/weights` · `measurements` · `vaccinations` · `dewormings` · `visits` · `custom-parameters` | Alta de registros por módulo |
| `GET /pets/{petId}/assignments`, `PUT` y `DELETE /pets/{petId}/assignments/{householdId}` | Casillas de hogares en la edición (panel `PetAssignments`) |

**Parámetros de consulta usados por la UI en los listados:** `q` (texto ≤50, solo si no está vacío) y `species` (solo `CANINE` o `FELINE`). El contrato declara `q` y `filter` (`ALL`|`CANINE`|`FELINE`|`OTHERS`|`WITH_ALERTS`), no `species`; la API acepta `species` como alias heredado (ver B-4).

**Payload de lectura — tarjeta (`PetCardView`, cerrado; todas las propiedades son obligatorias)**

| Propiedad | Tipo | Nulo | Origen | ¿La UI la muestra? |
|---|---|---|---|---|
| `profile` | `PetProfile` | No | Persistido | [UI] nombre, especie |
| `owner` | `OwnerTag` {`userId`, `displayName`, `colorToken`} | No (el `colorToken` sí puede ser nulo) | Servidor; el color solo viene en contexto de hogar | [UI] insignia "Dueño: nombre" y color |
| `myRole` | `OWNER`\|`ADMIN`\|`CAREGIVER`\|`READER` | No | Calculado por el servidor (rol efectivo) | No |
| `permissions` | `PetPermissions` | No | Calculado: matriz RBAC | [UI] solo `editPetBasics` (rotula "Solo lectura") |
| `computedAge` | {`years`, `months` (0–11), `totalDays`} | No | Calculado por el servidor | [UI] "N años, M meses" |
| `alertsSummary` | {`overdueCount`, `dueSoonCount`, `upToDateCount`, `totalActiveAlerts`} | No | Máquina STATE-ALERT-001 | [UI] "N vencidas · M próximas" |
| `globalAlertStatus` | `OVERDUE`\|`DUE_SOON`\|`UP_TO_DATE` | Sí | Calculado | No |
| `latestWeightKg` | número | Sí | Calculado | [UI] "X.XX kg" o "Sin peso" |

**Payload de lectura — ficha (`PetDashboardView`, cerrado; todas obligatorias):** `profile`, `owner`, `myRole`, `permissions`, `computedAge`, `alertsSummary` (iguales a la tarjeta) y los arreglos `weights`, `bodyMeasurements`, `vaccinations`, `supersededVaccinations`, `dewormings`, `supersededDewormings`, `medicalVisits`, `customParameters`. El servidor entrega los arreglos ordenados (INV-SORT-001) y la UI conserva ese orden.
- `PetProfile` (cerrado): `id`, `ownerUserId`, `name` (≤50), `species` (8 valores: `CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER`), `speciesOther` (≤60 o nulo; obligatorio solo con `OTHER`), `breed` (≤60), `birthDate` (`YYYY-MM-DD`), `birthDateIsEstimate` (booleano), `sex` (`MALE`|`FEMALE`), `neutered` (booleano o nulo), `microchipId` (15 dígitos o nulo), `avatarUrl` (≤2048; `http(s)://` o imagen `data:` png/jpeg/webp en base64; o nulo), `createdAt`, `updatedAt`.
  - **[UI] se muestran:** `name`, `species`, `breed`, `sex`, `birthDate`. **[CONTRATO], no se muestran en ninguna pantalla:** `speciesOther`, `birthDateIsEstimate`, `neutered`, `microchipId`, `avatarUrl`, `createdAt`, `updatedAt`, `ownerUserId`.
- `PetPermissions` (9 booleanos, todos obligatorios): `editPetBasics`, `deletePet`, `writeHealthEvents`, `deleteHealthEvents`, `writeWeightsAndMeasurements`, `writeAppointmentsAndParameters`, `deleteOtherRecords`, `transferPetOwnership`, `assignPetToHouseholds`.
- `OwnerTag.colorToken`: `OWNER_COLOR_1`..`OWNER_COLOR_8` o nulo (nulo fuera de hogares).

**Registros del dashboard (todas las entradas con `id`, `petId`, `createdAt`; los campos nulos se indican)**

| Colección | Estructura | [UI] muestra |
|---|---|---|
| `weights` → `WeightEntryView` | `record` {`recordedAt`, `weightKg` (0.001–150, múltiplo de 0.001), `notes` (≤1000 o nulo)} + `deltaKg` (número o nulo; calculado por el servidor) | Fecha, peso (2 decimales), variación en kg con signo; la columna "Variación (%)" muestra "—" siempre (el contrato 002 ya no trae `deltaPercent`) |
| `bodyMeasurements` → `BodyMeasurementRecord` | `recordedAt`, `neckCm`, `chestCm`, `backLengthCm`, `waistCm` (cada una 1–250, múltiplo de 0.01), `notes` | Fecha y 4 medidas con 2 decimales |
| `vaccinations` / `supersededVaccinations` → `VaccinationEntryView` | `record` {`category`, `vaccineName` (≤100), `appliedAt`, `nextBoosterAt` (fecha o nulo), `batchOrClinic` (≤120 o nulo), `veterinarianName` (≤120 o nulo), `veterinarianLicense` (≤60 o nulo), `notes`} + `alert` (`AlertStateMetadata` o nulo) | Nombre, fecha de aplicación, `nextBoosterAt` e insignia de alerta. **`supersededVaccinations` no se renderiza** |
| `dewormings` / `supersededDewormings` → `DewormingEntryView` | `record` {`category`, `productBrand` (≤100), `dewormingType` (`INTERNAL`|`EXTERNAL`), `appliedAt`, `nextSuggestedDoseAt` (fecha o nulo), `batchOrClinic`, `veterinarianName`, `veterinarianLicense`, `notes`} + `alert` | Producto, tipo (Interna/Externa), fecha, próxima dosis e insignia. **`supersededDewormings` no se renderiza** |
| `medicalVisits` → `MedicalVisitRecord` | `visitDate`, `reason` (≤200), `diagnosis` (≤500), `treatment` (≤500), `clinicOrVet` (≤120), `observations` (≤1000 o nulo) | Fecha, motivo, clínica, diagnóstico, tratamiento. `observations` no se muestra |
| `customParameters` → `CustomParameterRecord` | `recordedAt`, `category` (`DIET_CHANGE`|`ALLERGY`|`SURGERY`|`BEHAVIOR`|`OTHER`), `title` (≤120), `description` (≤1000), `notes` | Categoría, título y descripción |

- `AlertStateMetadata` (cerrado): `status` (`UP_TO_DATE`|`DUE_SOON`|`OVERDUE`|`SUPERSEDED`), `uiBadge` (`NEUTRAL_GRAY`|`DANGER_RED`|`WARNING_AMBER`|`SUCCESS_GREEN`), `label`, `isActiveAlert`, `daysRemaining` (entero). Máquina de estados STATE-ALERT-001, estados: `SUPERSEDED`, `OVERDUE`, `DUE_SOON`, `UP_TO_DATE`. La UI deriva el color con la tabla de `uiBadge` y compone el texto "etiqueta · N días restantes / de retraso / vence hoy / reemplazada por un registro posterior". Cuando `alert` es nulo muestra "Sin próxima fecha".

**Acciones y mutaciones de la pantalla `/`**

| Acción | Habilita / oculta | Interacción actual | Payload y validación | Errores relevantes |
|---|---|---|---|---|
| **Cambiar contexto** (Mis mascotas / hogar) | Siempre visible | Pestañas (`role="tablist"`, `aria-label="Contexto de mascotas"`) | Sin payload; recarga la lista | — |
| **Buscar / filtrar** | Siempre | Formulario `role="search"`: búsqueda por nombre (máx. 50) y selector de especie ("Todas", Perro, Gato) | Consulta `q` y `species` | `422` en parámetros inválidos |
| **Seleccionar mascota** | Siempre | Lista (`role="listbox"`; cada tarjeta `role="option"`), navegable con flechas, Inicio, Fin, Enter, Espacio | `GET dashboard` | `404 ERR-PET-NOT-FOUND` |
| **Nueva mascota** | Botón visible **solo** en el contexto "Mis mascotas" | Formulario en página sobre la ficha | `CreatePetInput` (ver abajo) | `409 ERR-PET-MICROCHIP-DUPLICATE`, `422 ERR-PET-FUTURE-BIRTHDATE`, `403 ERR-ACC-FORBIDDEN` (hogar base ajeno), `404`, `422 ERR-SCHEMA-VALIDATION-FAILED` |
| **Editar mascota** | Botón "Editar" visible si `permissions.editPetBasics` (roles `OWNER`, `ADMIN`) | Formulario en página sobre la ficha | `UpdatePetInput` (ver abajo) | `409 ERR-PET-MICROCHIP-DUPLICATE`, `422 ERR-PET-BIRTHDATE-AFTER-RECORDS` |
| **Asignar / desasignar a un hogar** | Panel visible dentro del formulario de edición solo si `permissions.assignPetToHouseholds` (rol `OWNER`) | Casillas por hogar (una por cada hogar del usuario) | `PUT`/`DELETE` sin cuerpo | `403 ERR-ACC-FORBIDDEN` (el dueño no es miembro ACTIVE del hogar) |
| **Eliminar mascota** | Botón "Eliminar" visible si `permissions.deletePet` (rol `OWNER`) | Diálogo en página (`role="alertdialog"`) | Hay que escribir el nombre exacto de la mascota para habilitar "Eliminar definitivamente"; comparación exacta (`typed === petName`) en el cliente | `404`, `403` |
| **Registrar peso / medidas / vacuna / desparasitación / consulta / parámetro** | El formulario del módulo activo se monta **solo** si `permissions.editPetBasics` es verdadero (ver B-3) | Formulario en página bajo la lista del módulo, uno por pestaña | Ver tabla de módulos | Ver tabla de módulos |
| **Cambiar de módulo de la ficha** | Siempre | Pestañas (`role="tablist"`, `aria-label="Módulos de la ficha"`) navegables con teclado | Sin payload | — |

**Campos del alta (`CreatePetInput`, cerrado) y lo que envía la UI hoy**

| Campo | Contrato | [UI] envía |
|---|---|---|
| `name` | Obligatorio, ≤50, sin espacios en los extremos | Sí, obligatorio |
| `species` | Obligatorio, 8 valores | Sí; el selector ofrece solo `CANINE` (Perro) y `FELINE` (Gato); valor inicial `CANINE` |
| `speciesOther` | Opcional (≤60 o nulo); obligatorio solo con `OTHER` | No |
| `breed` | Obligatorio, ≤60 | Sí, obligatorio |
| `birthDate` / `estimatedAge` | Debe venir exactamente uno de los dos (`oneOf`); `estimatedAge` = {`years` 0–60, `months` 0–11} | Solo `birthDate` (tipo fecha, obligatorio en la UI) |
| `birthDateIsEstimate`, `neutered`, `microchipId` | Opcionales | No |
| `sex` | Obligatorio (`MALE`|`FEMALE`) | Sí; valor inicial `MALE` |
| `avatarUrl` | Opcional | Sí, campo de texto tipo `url`, opcional |
| `baseHouseholdId` | Opcional, uuid; el dueño debe ser miembro ACTIVE de ese hogar | Sí, solo en el alta: selector "Hogar base (opcional)" con los hogares del usuario; vacío = no se envía |

- **Campos de la edición (`UpdatePetInput`, cerrado, ninguno obligatorio):** `name`, `species`, `speciesOther`, `breed`, `birthDate`, `birthDateIsEstimate`, `sex`, `neutered`, `microchipId`, `avatarUrl`, `estimatedAge`. No admite `baseHouseholdId`. La UI envía los 6 campos del alta (sin `baseHouseholdId`), precargados con el perfil actual.

**Módulos de registros: campos que envía la UI y reglas del contrato**

| Módulo (pestaña) | Endpoint | Campos UI (obligatorio / opcional) | Reglas del contrato | Errores por campo / código |
|---|---|---|---|---|
| Peso | `POST …/records/weights` | `recordedAt` fecha (obl.), `weightKg` número con paso 0.01 (obl.), `notes` texto (opc.) | `weightKg` 0.001–150, múltiplo de 0.001; `notes` ≤1000 | `ERR-REC-WEIGHT-OUT-OF-RANGE` 422 (campo `weightKg`); `ERR-REC-DATE-BEFORE-BIRTH`; `ERR-REC-FUTURE-EVENT-DATE` |
| Medidas | `POST …/records/measurements` | `recordedAt` (obl.), `neckCm`, `chestCm`, `backLengthCm`, `waistCm` números con paso 0.01 (obl.), `notes` (opc.) | Cada medida 1–250, múltiplo de 0.01 | `ERR-REC-MEASUREMENT-OUT-OF-RANGE` 422 |
| Vacunas | `POST …/records/vaccinations` | `vaccineName` (obl.), `appliedAt` (obl.), `nextBoosterAt` (obl. en la UI), `batchOrClinic` (opc.), `notes` (opc.) | `nextBoosterAt` es opcional en el contrato; si se informa debe ser posterior a `appliedAt`; `veterinarianName` (≤120) y `veterinarianLicense` (≤60) existen en el contrato y no tienen control en la UI | `ERR-REC-INVALID-BOOSTER-DATE` 422 |
| Desparasitación | `POST …/records/dewormings` | `productBrand` (obl.), `dewormingType` selector Interna/Externa (obl.), `appliedAt` (obl.), `nextSuggestedDoseAt` (obl. en la UI), `notes` (opc.) | `nextSuggestedDoseAt` opcional en el contrato; si se informa debe ser posterior a `appliedAt` | `ERR-REC-INVALID-NEXT-DOSE-DATE` 422 |
| Consultas | `POST …/records/visits` | `visitDate`, `reason`, `diagnosis`, `treatment`, `clinicOrVet` (todos obl.), `observations` (opc.) | Máximos: 200, 500, 500, 120, 1000 | `ERR-SCHEMA-VALIDATION-FAILED` |
| Parámetros | `POST …/records/custom-parameters` | `recordedAt` (obl.), `category` selector (obl.: Cambio de dieta, Alergia, Cirugía, Comportamiento, Otro), `title` (obl.), `description` (obl.), `notes` (opc.) | Máximos: 120, 1000, 1000 | `ERR-SCHEMA-VALIDATION-FAILED` |

- Códigos de error comunes a los registros: `404 ERR-PET-NOT-FOUND`, `403 ERR-ACC-FORBIDDEN`.
- **[CONTRATO], sin pantalla:** editar (`PATCH`) y eliminar (`DELETE`) un registro (`/pets/{petId}/records/{collection}/{recordId}`), con `409 ERR-REC-SUPERSEDED-IMMUTABLE` para registros reemplazados; `POST /pets/{petId}/ownership-transfer` (transferir la propiedad legal de una mascota).

**Estados de interfaz y dominio requeridos en `/`**
- Lista de mascotas: vacía ("No hay mascotas en este contexto."), con resultados, con una tarjeta activa.
- Ficha: sin selección ("Selecciona una mascota para ver su ficha."), con mascota; módulo vacío ("Sin registros." / "Sin mediciones de peso."); el gráfico de peso es un SVG (`role="img"`, 600×220, relleno 32) con tabla equivalente.
- Modos de la ficha: `VIEW`, `CREATE`, `EDIT`, `DELETE`.
- Mascota ajena o sin permiso de edición: etiqueta "Solo lectura" y sin botones de edición, eliminación ni formularios de alta de registros.
- Contexto de hogar: insignia de dueño con color (`colorToken`); en "Mis mascotas": solo texto "Dueño: …".
- Errores: área de error de la ficha (`role="alert"`) para fallos de carga y de eliminación; errores de campo bajo cada control; fallo de red → `ERR-INTERNAL-UNEXPECTED`.
- Semáforo sanitario: 4 estados con `data-alert-status` y `data-ui-badge`.
- No hay indicador de carga en las listas ni en la ficha (la UI espera sin mostrar un estado intermedio).

#### 3.5 Pantalla `/households` — Hogares

**Endpoints consumidos:** `GET /households`, `GET /invitations`, `POST /households`, `POST /households/{householdId}/invitations`, `POST /invitations/{householdId}/accept`, `POST /invitations/{householdId}/decline`, `DELETE /households/{householdId}/members/{userId}`, `DELETE /households/{householdId}`.

**Payload de lectura**
- `HouseholdView` (cerrado, todas obligatorias): `household` {`id`, `name` (≤60), `ownerUserId`, `createdAt`}, `myRole` (`ADMIN`|`CAREGIVER`|`READER`), `isHouseholdOwner` (booleano), `members` (arreglo de `HouseholdMemberView`), `pendingInvitations` (arreglo de `HouseholdInvitation`). Solo se listan hogares donde el usuario es miembro ACTIVE.
- `HouseholdMemberView`: `membership` {`membershipId`, `householdId`, `userId`, `username`, `displayName`, `role` (`ADMIN`|`CAREGIVER`|`READER`), `isHouseholdOwner`, `status` (`ACTIVE`|`LEFT`|`REMOVED`), `joinedAt`, `firstJoinedAt`, `updatedAt`} y `colorToken` (opcional, nulo posible).
- `HouseholdInvitation` (en `pendingInvitations`): `invitationId`, `householdId`, `inviteeUsername`, `roleOnJoin`, `invitedByUserId`, `status` (`INVITED`|`DECLINED`|`CANCELLED`|`ACCEPTED`), `createdAt`, `respondedAt` (nulo si pendiente).
- `InvitationView` (de `GET /invitations`): `household`, `invitedBy` (`UserPublicProfile`: `id`, `username`, `displayName`, `createdAt`), `roleOnJoin`, `invitedAt`.
- **[UI] muestra:** nombre del hogar; "tu rol: Propietario | Miembro" (según `isHouseholdOwner`); por miembro: nombre visible (con color si hay `colorToken`), `@username`, etiqueta de estado (Activo / Abandonó / Retirado; atributo `data-membership-status`) y "Propietario" si `isHouseholdOwner`; por invitación: nombre del hogar y quién invita (nombre visible y `@username`).
- **[CONTRATO], no se muestran:** `myRole` del hogar, `role` de cada miembro, `roleOnJoin`, `pendingInvitations` del hogar (las invitaciones enviadas por el propietario), fechas de membresía.

**Acciones y mutaciones**

| Acción | Quién la ve | Interacción | Payload / validación | Errores |
|---|---|---|---|---|
| **Crear hogar** | Todo usuario con sesión | Formulario en página (`aria-label="Crear hogar"`) | `CreateHouseholdInput` (cerrado): `name` obligatorio, ≤60, sin espacios en los extremos | `422 ERR-SCHEMA-VALIDATION-FAILED` |
| **Invitar miembro** | Solo si `isHouseholdOwner` | Formulario en la tarjeta del hogar (`aria-label="Invitar miembro"`) | `InviteMemberInput` (cerrado): **`username` obligatorio** (3–30, `^[a-z0-9._-]+$`) y **`roleOnJoin` obligatorio** (`ADMIN`|`CAREGIVER`|`READER`). **La UI solo tiene el control `username`** (ver B-1) | `403`, `404`, `422`, `429 ERR-RATE-LIMITED` (20 por 15 min); la API responde igual exista o no el usuario (`InviteAccepted` = {`received`}) |
| **Aceptar / Rechazar invitación** | El invitado, desde la lista "Invitaciones" | Botones directos "Aceptar" y "Rechazar" | Sin cuerpo | `404 ERR-HOUSE-INVITATION-NOT-FOUND`, `403` |
| **Retirar miembro** | Solo si `isHouseholdOwner`, sobre otro miembro con estado ACTIVE | Botón directo "Retirar" | `DELETE …/members/{userId}` | `404 ERR-HOUSE-MEMBERSHIP-NOT-FOUND`, `409` |
| **Abandonar hogar** | Un miembro no propietario sobre sí mismo (estado ACTIVE) | Botón directo "Abandonar hogar" | `DELETE …/members/{userId}` con su propio `userId` | `409 ERR-HOUSE-OWNER-CANNOT-LEAVE` si es propietario |
| **Eliminar hogar** | Solo si `isHouseholdOwner` | Botón "Eliminar hogar" → diálogo (`role="alertdialog"`) con "Confirmar eliminación" y "Cancelar" | `DELETE /households/{householdId}`; las mascotas no se borran, dejan de compartirse | `403`, `404 ERR-HOUSE-NOT-FOUND` |

- **[CONTRATO], sin pantalla:** `PATCH /households/{id}/members/{userId}` (cambiar el rol: `ChangeRoleInput` = {`role`}), `DELETE /households/{id}/invitations/{invitationId}` (cancelar invitación; el tipo `CANCEL_INVITATION` existe en el código pero la UI nunca lo produce), `POST /households/{id}/ownership-transfer` (`TransferHouseholdOwnershipInput` = {`targetUserId`}) y `GET /households/{id}`.
- **Regla del contrato:** "invitar, expulsar y cambiar rol de miembros" (`MANAGE_HOUSEHOLD_MEMBERS`) lo permiten los roles `OWNER` y `ADMIN`; la UI hoy lo condiciona solo a `isHouseholdOwner`.

**Estados requeridos:** sin hogares ("Aún no perteneces a ningún hogar."); sin invitaciones ("No tienes invitaciones pendientes."); lista de invitaciones con contador; error general (`role="alert"`); diálogo de eliminación abierto; envío en curso por formulario. Tras cada acción se vuelven a pedir las listas de hogares e invitaciones.

#### 3.6 Pantalla `/backup` — Respaldo

**Endpoints consumidos:** `POST /backup/export`, `POST /backup/import`.

**Lectura / respuestas**
- Exportación: `200` con el sobre `BackupEnvelopeV3` como archivo adjunto (la UI lo trata como `blob`; el nombre sale de `Content-Disposition`, con respaldo `argos-backup.json`) y la cabecera `X-Argos-Confirmation-Token`. Si falta la cabecera o la respuesta no es correcta, la UI muestra `ERR-INTERNAL-UNEXPECTED`.
- Importación: `200 ImportBackupResult` (cerrado): `finalState`, `sourceSchemaVersion` (`1.0.0`|`2.0.0`|`3.0.0`), `importedPetsCount`, `importedRecordsCount`.
- Error de importación: `ProblemDetails` con `finalState` (`ROLLED_BACK` → texto "No se modificó ningún dato."; `UNKNOWN` → "Estado final desconocido: revisa tus datos.").

**Acciones y mutaciones**
- **Descargar respaldo** — botón directo. Permisos: cualquier rol (`EXPORT_IMPORT_BACKUP`: `OWNER`, `ADMIN`, `CAREGIVER`, `READER`). Errores: `429 ERR-RATE-LIMITED` (5 por 15 min), `401`, `403`.
- **Importar respaldo** — selector de archivo (`accept="application/json,.json"`) y botón "Importar respaldo", deshabilitado sin archivo o con envío en curso. La UI calcula el SHA-256 del archivo con Web Crypto y lo envía en `X-Argos-Import-Confirm` con el cuerpo crudo del archivo.
  - Reglas: tamaño máximo 10 MB (texto de la UI: "máximo 10 MB"); reemplaza todos los datos propios; si el archivo no es válido, no se cambia nada.
  - Errores: `400 ERR-BACKUP-MALFORMED-JSON`, `413 ERR-BACKUP-PAYLOAD-TOO-LARGE`, `422 ERR-BACKUP-SCHEMA-INVALID`, `422 ERR-BACKUP-VERSION-UNSUPPORTED`, `409 ERR-BACKUP-REFERENTIAL-INTEGRITY`, `409 ERR-ACCOUNT-CONFIRMATION-MISMATCH`, `500 ERR-BACKUP-ATOMIC-ROLLBACK`.
- **[CONTRATO], sin pantalla:** `POST /backup/import/preview` (devuelve `ImportPreviewResult`: `sourceSchemaVersion`, `fileDigest`, `counts`, `collisions`, `affectedSharedPets`).
- Máquina de estados STATE-BACKUP-001 (estados: `IDLE`, `CHECKING_PAYLOAD_SIZE`, `PARSING_JSON`, `VALIDATING_VERSION_AND_SCHEMA`, `MIGRATING_LEGACY_ENVELOPE`, `CHECKING_DOMAIN_INVARIANTS`, `COMMITTING_SNAPSHOT`, `COMPLETED`, `ROLLED_BACK`, `PREVIEW_READY`): la UI solo expone el resultado final.

**Estados requeridos:** reposo; archivo seleccionado; importando (`busy`); éxito (`role="status"`: "Importación completada (versión X): N mascotas y M registros."); error (`role="alert"`).

#### 3.7 Operaciones del contrato que ninguna pantalla consume hoy

Existen en la API y están cubiertas por pruebas de backend, pero **no hay interfaz**:
- Cuenta: `POST /account/password` (`ChangePasswordInput`: `currentPassword`, `newPassword`), `PATCH /account/profile` (`UpdateProfileInput`: `displayName`, `email`, `preferredLanguage`, `timezone`), `POST /account/deletion` (`DeleteAccountInput`: `confirmationPhrase` = "ELIMINAR MI CUENTA", `password`, `backupConfirmationToken`; máquina STATE-ACCOUNT-DELETE-001, token de respaldo con vigencia de 10 minutos; errores `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD` y `ERR-ACCOUNT-OWNS-SHARED-PETS`).
- Mascotas: transferencia de propiedad; edición y eliminación de registros.
- Hogares: cambio de rol de un miembro; cancelación de invitaciones enviadas; transferencia de propiedad del hogar; `GET /households/{id}`.
- Respaldo: vista previa de importación.

---

### 4. Restricciones y Reglas de Negocio

#### 4.1 Restricciones técnicas y de dominio

**Sesión y autenticación**
- Cookie `argos_session`: HttpOnly, SameSite=Strict, Path=/. La SPA no la lee.
- Inactividad máxima: 30 minutos; cada petición autenticada la renueva. Tope absoluto: 24 horas.
- Intentos fallidos de inicio de sesión: 5, con bloqueo en una ventana de 15 minutos (`ERR-AUTH-TOO-MANY-ATTEMPTS`, 429).
- Máquina STATE-AUTH-SESSION-001: `ANONYMOUS`, `AUTHENTICATED`, `EXPIRED_IDLE`, `EXPIRED`, `LOGGED_OUT`, `REVOKED`.
- Mensaje `ERR-AUTH-UNAUTHENTICATED` idéntico para sesión inexistente, revocada o expirada; la UI no distingue.
- Límites de frecuencia por persona: exportación 5 por 15 min; invitaciones 20 por 15 min (`ERR-RATE-LIMITED`, 429).

**Formatos y límites (contrato)**
- Identificadores: UUID v4 en minúsculas. Fechas de calendario: `YYYY-MM-DD`. Marcas de tiempo: `date-time` UTC con milisegundos.
- Usuario: 3–30, `^[a-z0-9._-]+$`. Nombre visible: 1–60. Correo: ≤254. Contraseña nueva: 10–128 con mayúscula, dígito y símbolo.
- Hogar: nombre ≤60. Mascota: nombre ≤50, raza ≤60, `speciesOther` ≤60, microchip exactamente 15 dígitos, `avatarUrl` ≤2048.
- Peso: 0.001–150 kg, múltiplo de 0.001 (mensaje de catálogo: perros y gatos 0.05–150.00 con máximo 2 decimales). Medidas: 1–250 cm, múltiplo de 0.01.
- Notas ≤1000; búsqueda de mascota `q` ≤50. Respaldo: máximo 10 MB; versiones aceptadas 3.0.0 (y 2.0.0 o 1.0.0 con migración).
- Fechas: no futuras (`ERR-PET-FUTURE-BIRTHDATE`, `ERR-REC-FUTURE-EVENT-DATE`); un registro no puede ser anterior al nacimiento (`ERR-REC-DATE-BEFORE-BIRTH`); `nextBoosterAt` y `nextSuggestedDoseAt` posteriores a `appliedAt`.
- Todas las entradas y vistas del contrato son objetos cerrados (`additionalProperties: false`): enviar un campo no declarado produce `422 ERR-SCHEMA-VALIDATION-FAILED`.

**Reglas RBAC (matriz `RBAC_MATRIX`, `src/domain/access/rbac.ts`)**

| Acción | OWNER | ADMIN | CAREGIVER | READER | Campo en `PetPermissions` |
|---|---|---|---|---|---|
| Editar datos básicos | Sí | Sí | No | No | `editPetBasics` |
| Eliminar mascota | Sí | No | No | No | `deletePet` |
| Escribir vacunas y desparasitaciones | Sí | Sí | Sí | No | `writeHealthEvents` |
| Eliminar vacunas y desparasitaciones | Sí | Sí | No | No | `deleteHealthEvents` |
| Escribir pesos y medidas | Sí | Sí | Sí | No | `writeWeightsAndMeasurements` |
| Escribir consultas y parámetros | Sí | Sí | No | No | `writeAppointmentsAndParameters` |
| Eliminar otros registros | Sí | Sí | No | No | `deleteOtherRecords` |
| Gestionar miembros del hogar | Sí | Sí | No | No | (no es de mascota) |
| Transferir propiedad de mascota | Sí | No | No | No | `transferPetOwnership` |
| Asignar mascota a hogares | Sí | No | No | No | `assignPetToHouseholds` |
| Exportar / importar respaldo | Sí | Sí | Sí | Sí | (no es de mascota) |

- El rol efectivo (`myRole`) y los permisos los calcula el servidor; el cliente solo los lee. Una mascota que el usuario no puede ver responde `404 ERR-PET-NOT-FOUND`; una que ve sin poder ejecutar la acción responde `403 ERR-ACC-FORBIDDEN`.
- Hogar: roles de membresía `ADMIN`, `CAREGIVER`, `READER`; el propietario del hogar se marca con `isHouseholdOwner` y no puede abandonar el hogar (`ERR-HOUSE-OWNER-CANNOT-LEAVE`, 409). Estados de membresía en la máquina STATE-HOUSE-MEMBERSHIP-001: `INVITED`, `ACTIVE`, `DECLINED`, `CANCELLED`, `LEFT`, `REMOVED`.
- Asignación mascota–hogar: solo el propietario legal; el hogar destino debe tener al dueño como miembro ACTIVE; asignar es idempotente; al expulsar o abandonar se retiran las asignaciones de las mascotas de esa persona en ese hogar.
- Un miembro de hogar ve únicamente las mascotas asignadas a ese hogar.

**Cálculos del frontend frente a los resueltos por el backend**

| Lo calcula el frontend | Lo entrega resuelto el backend |
|---|---|
| Formato de edad ("N años, M meses") y de peso (2 decimales) | `computedAge`, `latestWeightKg` |
| Formato de variación con signo en kg | `deltaKg` (la variación en % ya no existe en el contrato; la UI muestra "—") |
| Texto y color del semáforo a partir de `status` y `uiBadge` | `AlertStateMetadata` completo, `alertsSummary`, `globalAlertStatus` |
| Geometría del gráfico de peso (puntos equiespaciados, escala lineal en kg, orden cronológico invertido respecto del orden de la API) | El orden de las listas (INV-SORT-001) |
| Color del dueño a partir de `colorToken` (`OWNER_COLORS`) | El `colorToken` (nulo fuera de hogar) |
| Visibilidad de botones según `permissions.*` e `isHouseholdOwner` | Los permisos y el rol efectivo |
| Comparación exacta del nombre al eliminar una mascota | El borrado en cascada |
| Validación de formularios con los esquemas del contrato (primer error por campo) | La validación definitiva y las reglas de negocio |
| Cálculo del SHA-256 del archivo de respaldo (Web Crypto) | Comprobación del `fileDigest` y del token |

#### 4.2 Selectores y contratos que el rediseño no debe romper

**A. Atributos `data-*` y estructura que consumen pruebas o el modelo de vista** (no existe ningún `data-testid`; las pruebas E2E localizan por rol, nombre accesible y texto)

| Atributo | Dónde | Valor |
|---|---|---|
| `data-pet-id` | Tarjeta (`role="option"`) y ficha (`<article>`) | `PetProfile.id` |
| `data-owner-badge` | Insignia del dueño | `colorToken` o `none` |
| `data-read-only="true"` | Etiqueta "Solo lectura" | — |
| `data-alert-status`, `data-ui-badge` | Insignia del semáforo | `status` y `uiBadge` |
| `data-household-count` | Contador de hogares en la cabecera | número |
| `data-pending-invitations` | Contador de invitaciones en la cabecera | número |
| `data-household-id` | Tarjeta de hogar | `Household.id` |
| `data-membership-status` | Estado del miembro | `ACTIVE`, `LEFT`, `REMOVED` |

**B. Roles ARIA e identificadores estructurales**
- Pestañas de contexto: `role="tablist"` con `aria-label="Contexto de mascotas"`, cada pestaña `role="tab"` con `id="context-tab-<id>"` y `aria-controls` del panel `PET_PANEL_ID`; el panel es `role="tabpanel"`.
- Lista de mascotas: `role="listbox"` con `aria-label="Mascotas"`; tarjetas `role="option"` con `aria-selected`; navegación por teclado: flechas, Inicio, Fin, Enter, Espacio.
- Pestañas de módulo: `role="tablist"` con `aria-label="Módulos de la ficha"`; `id="module-tab-<id>"`, `aria-controls="module-panel-<id>"`; panel con `id="module-panel-<id>"` y `role="tabpanel"`. Identificadores de módulo: `weights`, `measurements`, `vaccinations`, `dewormings`, `visits`, `customParameters`. Etiquetas: Peso, Medidas, Vacunas, Desparasitación, Consultas, Parámetros.
- Formularios con nombre accesible: "Iniciar sesión", "Crear cuenta", "Crear hogar", "Invitar miembro", "Filtrar mascotas" (`role="search"`).
- Campos: etiqueta asociada con `htmlFor`; error con `aria-invalid` y `aria-describedby`; mensajes generales con `role="alert"`; resultado de importación con `role="status"`.
- Diálogos: `role="alertdialog"` para eliminar mascota (`delete-pet-title`, `delete-pet-desc`) y eliminar hogar.
- Tablas de peso y medidas: `<caption>` solo para lectores de pantalla, `<th scope="col">`, contenedor `role="region"` desplazable con `tabIndex=0`; gráfico SVG con `role="img"` y `aria-label` descriptivo.
- Enlace de salto "Saltar al contenido" hacia `#main-content`; `<main id="main-content">`.
- Identificadores y selectores CSS que usan las pruebas E2E (derivados de `id` de los controles; el prefijo de cada campo es `new-pet` en el alta o `edit-pet-<petId>` en la edición, y `<módulo>-<campo>` en los registros): `#new-pet-name`, `#new-pet-species`, `#weights-recordedAt`, `#weights-weightKg`, `#vaccinations-vaccineName`, `#vaccinations-appliedAt`, `#vaccinations-nextBoosterAt`, `input[type="file"]` (importación), `form[aria-labelledby] input[name="name"]`, `form[aria-labelledby^="edit-pet-"]`, `svg[role="img"] circle` (puntos del gráfico de peso), `table tbody tr` (filas de la tabla de peso), `[data-alert-status]`, `[data-household-count]`, `[data-pending-invitations]` y `[data-membership-status="INVITED"]`. El atributo `name` de cada control coincide con el nombre del campo del contrato.
- Layout adaptable desde 320 px (requisito REQ-UI-004, documentado en `AppShell.tsx`).

**C. Textos y nombres accesibles que las pruebas E2E usan hoy** (extraídos de `tests/e2e/**`)
- Botones: "Entrar", "Registrarme", "Cerrar sesión", "Nueva mascota", "Guardar", "Editar" (exacto), "Eliminar" (exacto), "Eliminar definitivamente", "Aceptar", "Crear hogar", "Importar respaldo".
- Enlaces: "Mascotas".
- Etiquetas de campo: "Usuario", "Contraseña", "Usuario (minúsculas, números, . _ -)", "Nombre visible", "Contraseña (10 a 128, con mayúscula, número y símbolo)", "Confirmar contraseña", "Raza", "Fecha de nacimiento", "Nombre del nuevo hogar", "Filtrar por especie".
- Encabezados: nivel 2 con el nombre de la mascota (en las pruebas la mascota se llama "Argos", por lo que `getByRole('heading', { name: 'Argos', level: 2 })` localiza la ficha, no una pantalla pública). Las pantallas públicas tienen `<h1>` "Argos" y `<h2>` con el título ("Iniciar sesión" o "Crear cuenta").
- Pestañas por nombre: "Vacunas" y los nombres de los hogares; opciones de la lista por nombre de mascota.
- Textos: "Aún no perteneces a ningún hogar.", "Usuario o contraseña incorrectos.", "Solo lectura", "Dueño: Ana", `getByRole('searchbox')`, `getByRole('status')`.
- Las pruebas unitarias y de integración importan estos símbolos de `src/presentation/web`: `PetCardList`, `PetForm`, `PetDashboard`, `DeletePetDialog`, `ContextSelector`, `AlertBadge`, `PasswordField` (en `Field.tsx`), `ShellHeader`, `HouseholdCard`, `InvitationList`, `RegisterPage`, `SessionProvider`, `importResultText`, `importProblemText`, `fileDigestOf`, `importBackupFile`, `requestBackupExport`, `createWebApi`, `CSRF_PARAMS`, `ApiProblem`, `attachmentFileName`, `catalogProblem`, `problemMessage`, `toProblem`, `unwrap`, `addRecord`, `RECORD_MODULES`, `validateInput`, `formValues`, `FORM_ERROR_KEY`, `ownerBadge`, `contextOptions` y varias funciones puras de `view-model.ts`. Conservar sus nombres y firmas evita romper esas pruebas.
- Accesibilidad automática: axe-core con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; la UI actual documenta contraste mínimo 4.5:1 en los pares de color de dueño y del semáforo (texto siempre presente además del color).

**D. Integración con el backend que el rediseño debe conservar**
- Todas las llamadas HTTP pasan por el cliente generado (`createWebApi` / `openapi-fetch`) y envían `X-Argos-Request: 1`; no se escriben esquemas de validación a mano (INV-ARCH-003, INV-ARCH-004).
- Los textos de error salen del catálogo (`ERROR_CATALOG`); el rediseño no puede inventar mensajes para códigos que el catálogo ya define.
- Cuerpos de petición: solo propiedades declaradas en el contrato (objetos cerrados); los campos vacíos opcionales se omiten.
- La importación de respaldo envía el cuerpo como bytes crudos con `Content-Type: application/json` y la cabecera `X-Argos-Import-Confirm` (SHA-256 hexadecimal en minúsculas del mismo contenido). La exportación lee `X-Argos-Confirmation-Token` y `Content-Disposition`.

#### 4.3 Brechas verificadas entre la UI actual y el contrato

| ID | Hecho verificado | Evidencia |
|---|---|---|
| **B-1** | **El formulario "Invitar miembro" no puede completarse.** `InviteMemberInput` exige `roleOnJoin`; la UI solo tiene el control `username`. El validador del cliente rechaza el envío con el error `required` de `roleOnJoin`, que no tiene control visible, por lo que no aparece ningún texto. Verificado en vivo: `POST /households/{id}/invitations` sin `roleOnJoin` → `422` | `HouseholdsPage.tsx` (`InviteForm`), `validateInviteMemberInput`, API real |
| **B-2** | La UI no tiene control para elegir rol de los miembros ni para ver `myRole` o el rol de cada miembro; todo se resuelve con `isHouseholdOwner` | `HouseholdsPage.tsx`, `view-model.ts` (`memberActions`) |
| **B-3** | Los formularios de alta de registros se montan solo con `permissions.editPetBasics` (roles `OWNER` y `ADMIN`). El contrato concede además `writeHealthEvents` y `writeWeightsAndMeasurements` a `CAREGIVER`, que hoy no ve esos formularios; `writeAppointmentsAndParameters` y los permisos de borrado no se usan | `PetDashboard.tsx` línea 241 (`actions.canEdit`) |
| **B-4** | El listado envía `species` (solo `CANINE`/`FELINE`); el contrato declara `filter` (`ALL`, `CANINE`, `FELINE`, `OTHERS`, `WITH_ALERTS`). La API acepta `species` como alias heredado (verificado en vivo) mientras llega T284 | `PetsPage.tsx`, `PetCards.tsx`, `pet-use-cases.ts` (`PetListQuery.species`) |
| **B-5** | La UI limita especie a 2 de las 8 del contrato, no envía `speciesOther`, `estimatedAge`, `birthDateIsEstimate`, `neutered` ni `microchipId`, y no muestra `avatarUrl`. El código lo marca `T284 PENDIENTE` | `PetForm.tsx`, `PetCards.tsx` |
| **B-6** | `nextBoosterAt` y `nextSuggestedDoseAt` son opcionales y admiten nulo en el contrato; la UI los pide como obligatorios y los imprime sin tratar el caso nulo | `records.ts`, `PetDashboard.tsx` |
| **B-7** | La UI no trata el `401` de sesión expirada: no redirige a `/login`; el usuario ve el texto del catálogo en el área de error | `session.tsx`, `api.ts` (sin referencias a 401) |
| **B-8** | `supersededVaccinations` y `supersededDewormings` llegan en la ficha y no se muestran; `globalAlertStatus`, `myRole`, `totalDays`, `upToDateCount` y `observations` tampoco | búsqueda en `src/presentation/web` |
| **B-9** | El `Eliminar` de mascota usa `permissions.editPetBasics` para mostrar el diálogo y `permissions.deletePet` para el botón; hoy ambos coinciden con el rol `OWNER`, pero son permisos distintos en el contrato | `PetsPage.tsx`, `PetDashboard.tsx` |
| **B-10** | Dos pruebas E2E esperan textos que no coinciden con el catálogo actual: `tests/e2e/accessibility/wcag.spec.ts:70` espera "entre 8 y 128 caracteres" (el catálogo dice "entre 10 y 128") y `tests/e2e/visual/pet-dashboard.spec.ts:61` espera "El peso debe situarse entre 0.05 kg y 150.00 kg" (el catálogo dice "El peso está fuera del rango de la especie…"). Además, una prueba usa `[data-membership-status="INVITED"]`, valor que ya no existe en el estado de miembro del contrato (`ACTIVE`, `LEFT`, `REMOVED`; las invitaciones pendientes viven en `pendingInvitations`). Verificado por lectura; no se ejecutaron | archivos citados y `error-catalog.json` |
| **B-11** | 15 pruebas de presentación (en 5 archivos) fallan en el estado actual por fixtures de la feature 001 (`dashboard()` y `card()` sin `permissions`; `profile()` con especies `DOG`/`CAT`). Es deuda heredada (Decisión J), previa a este inventario | `tests/unit/presentation/presentation-fixtures.ts` |
| **B-12** | `playwright.config.ts` no define `ARGOS_AUDIT_HMAC_SECRET` para el servidor de la API, variable obligatoria fuera de `NODE_ENV=test`. Si el entorno que ejecuta Playwright no la aporta, el servidor de E2E no arranca. No se verificó ejecutándolo | `playwright.config.ts`, `src/infrastructure/config/app-config.ts` |

---

*Fin del documento. Este inventario no propone cambios de diseño, colores ni funcionalidades nuevas. Las pantallas, campos y acciones marcados [CONTRATO] o [BRECHA] describen únicamente lo que el backend ya expone o lo que la UI hoy no cubre.*
