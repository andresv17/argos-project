# Veredicto del Oracle — Rebanada 6 (T284 a T293), árbol sin commit de Keymaker
Fecha: 2026-11-14 | Rama: 002-plataforma-v21 | HEAD: ff0fe62 | Modo: auditoría (solo se escribió este informe y las bitácoras)

## Veredicto: APTO CONDICIONADO
Todas las compuertas dan resultado igual a la línea base o mejor, sin fallo nuevo. Las condiciones son decisiones de Neo (H-K-3, H-K-4, H-K-5) y tres enmiendas documentales (blueprint, tasks.md T288, comentario obsoleto). Ningún hallazgo bloqueante. Ninguna tarea se marca COMPLETED (`- [ ]` intacto en tasks.md; el techo de los agentes es REVIEW).

## Compuertas (salidas literales ejecutadas por el Oracle)
| # | Compuerta | Resultado | Evidencia |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | CUMPLE | Sin salida, exit 0 |
| 2 | `npx vitest run` | CUMPLE contra la línea base | `Test Files 10 failed \| 75 passed (85)`; `Tests 26 failed \| 1660 passed (1686)`. 12 de presentación (components.spec 8, view-model.spec 2, validation.spec 1, web-client.spec.ts:53 1) = fixtures 001 heredados; 14 de contratos/API (pets-records.api 3, canonical-fixtures 4, codegen-drift 1, generated-contracts 3, openapi-conformance 2, infrastructure-adapters 1). Cero fallo nuevo. |
| 3 | `bash scripts/verify-oracles.sh` | CUMPLE | `Archivos analizados: 111; oráculos débiles: 0` / `Resultado: CUMPLE` |
| 4a | `verify-traceability.sh --feature 002` | FALLA por causa ajena | `IDs trazados: 117/118`; solo `INV-HOUSE-001` (tests/unit/household-policies.spec.ts:109, solo en título de describe). Preexistente, no atribuible a R6. Global 88/96 no re-ejecutado como atribución. |
| 4b | `--feature 002 --task T284..T293` (una por una) | CUMPLE x10 | Cada tarea: `Resultado: CUMPLE`. (Sin `--feature 002` el script busca en 001 y responde "no existe"; el comando correcto es el de T296.) |
| 5 | Playwright `tests/e2e` completo, `E2E_API_PORT=3180 E2E_WEB_PORT=5180`, .env cargado sin imprimir | CUMPLE | `52 passed (56.0s)`. Relanzada la suite completa una vez. Confirma el 52/52 de Keymaker. |
| 6a | Presentación sin lógica de dominio | CUMPLE | grep de `Date`/edad/alertas/aritmética: solo `toFixed` de formato (view-model.ts:195,200; PetDashboard.tsx:112-115) y geometría de gráfico (`round2`, view-model.ts:236-252, sin fechas ni reloj). Edad, delta y alertas vienen de la API. |
| 6b | Un único "Nueva mascota" en `/` | CUMPLE | Sonda propia: 1 en `/` a 320/639/640/1280; 0 en las demás rutas. Además rebanada6-recorridos.spec.ts:99 |
| 6c | backdrop-filter <640 px = 0, >=640 px = 1 | CUMPLE | Sonda propia en `/`, `/households`, `/backup`, `/cuenta` a 320, 639, 640, 1280: blur 0, 0, 1, 1 en las cuatro rutas. Código: AppShell.tsx:102 (`sm:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md`), AuthPages.tsx:18 (marco de login/registro, otra pantalla) |
| 6d | Sin ids duplicados | CUMPLE | Sonda propia: `dup:""` en las 16 combinaciones ruta x ancho; sin desbordamiento horizontal (`ovf:false`) |
Límites: `npm run test:gate` (compile-contracts + cobertura + Stryker) NO ejecutado por el Oracle; Keymaker tampoco. T296 queda abierta hasta que se corra. Sondas 6b-6d con un usuario nuevo sin mascotas (rutas reales, datos mínimos); los ids de la ficha con mascota los cubre axe de wcag.spec.ts (pasa).

## Tareas T284 a T293
| Tarea | Resultado | Evidencia |
|---|---|---|
| T284 pruebas de presentación | CUMPLE | rebanada6-permisos/-directorio/-mensajes.spec.ts y 3 pruebas en web-client.spec.ts; los 10 rojos legítimos pasan; traza CUMPLE |
| T285 axe a 320/768/1024/1280 con /cuenta | CUMPLE | wcag.spec.ts verde en la suite 52/52; traza CUMPLE |
| T286 recorridos E2E | CUMPLE | rebanada6-recorridos.spec.ts (7 recorridos) verde; con enmienda Opción A autorizada por Neo (riel flex, spec:81-86) |
| T287 app shell | CUMPLE | AppShell.tsx: 4 enlaces en nav "Principal", sin menú de avatar ni barra inferior; marco único. El texto de T287 en tasks.md ya fue reescrito (diff sin commit) para coincidir |
| T288 directorio | CUMPLE con reserva | Búsqueda 300 ms (use-debounced-value.ts:11-15), filtros de 5 valores, riel flex. Reserva H-R6-3: el texto de T288 aún dice "grilla de 1, 2 o 3 columnas" |
| T289 ficha y semáforo | CUMPLE | "Reemplazada por registro posterior", acordeón, hero; E2E verde. Ver H-R6-4 |
| T290 /cuenta | CUMPLE | AccountPage.tsx; sonda: /cuenta sin ids duplicados, sin desbordamiento, blur correcto |
| T291 hogares | CUMPLE | HouseholdsPage.tsx:78-79 rol + (Propietario); H-K-4 |
| T292 Centro de Respaldos | CUMPLE | previsualización + barra de fases; recorrido E2E verde |
| T293 mensajes humanos + aviso previo | CUMPLE | schema-messages.ts, idle-notice.ts, AppShell.tsx:104-108; H-K-5 |

## Puntos de atención H-K
**H-K-1 (guarda de temporizadores): VALIDADO.** La lista blanca es estrecha: dos archivos por `endsWith` (`use-debounced-value.ts`, `idle-notice.ts`) en presentation-architecture.spec.ts:35-37 y session-client.spec.ts:59-62. `grep` en `src/presentation/web`: `setTimeout/Date.now` solo en idle-notice.ts:22,25,29 y use-debounced-value.ts:14; ninguno en otros módulos. Además session-client.spec.ts:62 añade una guarda nueva que prohíbe `fetch|api|unwrap|.GET(...)` dentro de esos dos módulos (con comentarios eliminados): idle-notice.ts no hace peticiones ni sondeo (un único `setTimeout` de disparo único, reiniciado por `onActivity`); el debounce solo retrasa un valor de estado, no llama a la API. El resto de la presentación sigue protegido (la prueba filtra por archivo). Nota menor (H-R6-5): idle-notice.ts usa `Date.now`, que la guarda REQ-UI-002 también permite solo para ese archivo; aceptable, pero ata el aviso al reloj del navegador.

**H-K-2 («Solo lectura»): COHERENTE; el blueprint debe enmendarse.** spec.md:36 y architecture_spec.md (matriz RBAC; CAREGIVER con `writeHealthEvents` y `writeWeightsAndMeasurements`) establecen que el Cuidador registra pero no edita el perfil. Mostrarle "Solo lectura" sería falso. Keymaker usa `isReadOnly` = ninguna escritura permitida (view-model.ts:125-127), alineado con REQ-UI2-003. Enmienda a Architect/Sati en ui_blueprint.md: §4.3 línea 346 (celda Hero: `"Solo lectura" si !permissions.editPetBasics` -> "si no hay ningún permiso de escritura") y §4.6 línea 440 ("Mascota sin permiso de edición: Solo lectura visible; sin Editar..." -> separar "sin permiso de edición" de "sin ningún permiso de escritura"). Apéndice B D3 no necesita cambio.

**H-K-3 (auth-pet-forms.spec.ts:63): ACEPTABLE, REQUIERE RATIFICACIÓN DE NEO. Hallazgo MEDIO, no alto.** Original: dos clics en "Editar" y `editForms` = 1 (prueba que un segundo clic no apila formularios). Nuevo: un clic, `expect(editar).toHaveCount(0)` y se conserva `expect(editForms(page)).toHaveCount(1)` (L64), más Cancelar -> 0 formularios. El invariante "nunca hay dos formularios de edición" sigue afirmado por el conteo 1. Lo que cambia es el mecanismo: antes defendía por comportamiento (el segundo clic es inocuo), ahora por ausencia del disparador (blueprint §4.6 línea 428: EDIT sustituye al hero, así que "Editar" no existe). Es un cambio de contrato de UI legítimo y no un debilitamiento que oculte un defecto, pero la prueba ya no ejercita el intento de apilar. Opción para fortalecer, a criterio de Neo: añadir la aserción de que el hero (h2 de la ficha) también desaparece en EDIT. Decisión de Neo: ratificar la enmienda tal cual o pedir la aserción adicional.

**H-K-4 («tu rol: Administrador (Propietario)»): CUMPLE T286; blueprint a enmendar. REQUIERE RATIFICACIÓN DE NEO.** T286 exige "el hogar con su rol". El contrato (`HouseholdView.myRole` ∈ ADMIN|CAREGIVER|READER, architecture_spec.md:252) no tiene valor "Miembro" ni "Propietario" como rol: ser propietario es el booleano `isHouseholdOwner`. El blueprint §5.2 línea 481 ("tu rol: Propietario | Miembro") no se puede cumplir literalmente con datos reales sin inventar un mapeo. La implementación (HouseholdsPage.tsx:78-79, `HOUSEHOLD_ROLE_LABEL` view-model.ts:184) muestra el rol real y añade "(Propietario)", sin lógica de dominio. Enmienda propuesta a ui_blueprint.md §5.2 línea 481: "tu rol: {Administrador|Cuidador|Lector}" más " (Propietario)" si `isHouseholdOwner`. Nota: la tarjeta duplica visualmente el rol del propietario con la insignia "Propietario" de la fila de miembros (línea 482); es redundancia menor, no defecto.

**H-K-5 (aviso sin botón «Mantener sesión»): CUMPLE T293, sin UI muerta. REQUIERE RATIFICACIÓN DE NEO.** El aviso es un `<p role="status">` sin controles (AppShell.tsx:104-108), por lo que no hay botón inerte. T293/decisión 6-A pide aviso previo sin sondeo; un botón "Mantener" tendría que hacer una petición para renovar, lo que contradice "sin sondeo en segundo plano" y REQ-AUTH-004/INV-AUTH2-002. La acción del usuario renueva porque cada respuesta correcta de la API llama a `notifyActivity` (api.ts:78) y reinicia el temporizador (idle-notice.ts:28-32). Riesgo bajo (H-R6-2): el texto dice "Realiza cualquier acción", pero solo una acción que genere una petición autenticada renueva; escribir en un campo o navegar por pestañas locales no. Sugerencia: redactar "...realiza una acción que guarde o consulte datos" o asumir el matiz. Decisión de Neo: aceptar el aviso informativo o autorizar un botón que llame a un endpoint ya existente (p. ej. `GET /auth/me`) como excepción acotada.

**H-K-7 (exposición de IP con D1): ACEPTADO por Neo, bien acotado.** PetAvatar.tsx:2-5 documenta la decisión; `http(s)` solo con `referrerPolicy="no-referrer"` (l.44), `loading="lazy"` y caída a iniciales en `onError`; `data:` directo. Sin cookies de terceros ni cabecera Referer; la IP del visitante sigue visible para el host remoto (riesgo residual aceptado). Rama (Rama) puede confirmar CSP `img-src` si se desea; no bloqueante.

**H-K-8 (formularios con Perro/Gato, Apéndice A): CUMPLE.** view-model.ts:163-164,174-175 (`CANINE` Perro, `FELINE` Gato), blueprint §4.6 línea 431 (select: Perro, Gato). Los valores enviados al contrato son `CANINE`/`FELINE`; E2E pet-dashboard.spec.ts:115 ya usa `FELINE`. "Otros" aparece solo en el filtro (sin especie del contrato en el alta).

## Hallazgos por severidad
| ID | Severidad | Descripción | Acción propuesta |
|---|---|---|---|
| (ninguno) | Alto/Bloqueante | Sin hallazgos | — |
| H-R6-1 (H-K-3) | Medio | auth-pet-forms.spec.ts:63 cambia de comportamiento a ausencia de disparador; el invariante sigue afirmado (L64) pero ya no se ejercita el doble clic | Neo ratifica; opcional: Keymaker añade aserción de que el hero desaparece en EDIT |
| H-R6-2 (H-K-5) | Bajo | Texto del aviso "cualquier acción" es impreciso: solo renuevan las acciones con petición autenticada | Sati/Keymaker ajustan el texto; Neo ratifica el aviso sin botón |
| H-R6-3 | Bajo | specs/002-plataforma-v21/tasks.md T288 sigue diciendo "grilla de 1, 2 o 3 columnas" aunque Neo autorizó riel flex (Opción A) | Architect enmienda T288 (Keymaker no toca specs) |
| H-R6-4 | Bajo | Columna "Variación (%)" de la tabla de peso muestra "—" fijo (view-model.ts:223, WeightChart.tsx:51,60) y su comentario "T284 PENDIENTE" está obsoleto; el contrato 002 retiró `deltaPercent`. Es una columna sin dato (casi UI muerta), ratificada por Neo como "—" en sesión previa | Neo/Architect deciden retirar la columna; si se retira, Keymaker actualiza WeightChart, view-model y su prueba |
| H-R6-5 | Bajo | idle-notice.ts depende de `Date.now` del navegador (reloj del cliente) para el aviso | Aceptable; anotar en spec o dejar como está |
| H-R6-6 | Informativo | blueprint §4.3 l.346, §4.6 l.440 (H-K-2) y §5.2 l.481 (H-K-4) requieren enmienda para quedar alineados con el código | Architect/Sati, tras ratificación de Neo |
| H-R6-7 | Informativo | `npm run test:gate` no ejecutado; `INV-HOUSE-001` sin título it/test (117/118, ajeno); 26 fallos heredados de vitest | Mantener en deuda; correr test:gate antes de cerrar T296 |

## Integridad
Rama 002-plataforma-v21 @ ff0fe62; 40 archivos modificados y los nuevos listados en `git status`. Sin commit ni push por el Oracle. src/, tests/, specs/, contratos y logos.json no se tocaron. Sondas temporales solo en el directorio de scratchpad (fuera del repo). Servidores de E2E terminados por Playwright.
