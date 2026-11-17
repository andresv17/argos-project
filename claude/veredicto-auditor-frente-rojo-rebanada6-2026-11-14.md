# Veredicto del Oráculo: frente rojo de la Rebanada 6 (T284, T285, T286), 2026-11-14

Veredicto: **APTO CONDICIONADO**. Hay 0 rojos por error de prueba que bloqueen. Quedan 5 condiciones menores (sección 9).

## 1. Alcance de los cambios (git)
- `git status --short src specs .specify` no muestra nada. No hay cambios en `src/`, `contracts/`, `src/generated/`, `specs/`, `tasks.md` ni tailwind.
- Los cambios en `tests/` son 3 archivos modificados (+137/-3 líneas): `wcag.spec.ts`, `e2e-support.ts` y `web-client.spec.ts`.
- Archivos nuevos: `rebanada6-fixtures.ts`, `rebanada6-permisos.spec.ts`, `rebanada6-directorio.spec.ts`, `rebanada6-mensajes.spec.ts` y `rebanada6-recorridos.spec.ts`.
- `e2e-support.ts` solo añade `VIEWPORT_WIDTHS_V21` y `accessibilityFindingsAt`; no toca lo existente. Queda una línea en blanco sobrante al final del archivo (cosmético).

## 2. Recuentos exactos
- `npx tsc --noEmit` termina con 0.
- `vitest run tests/unit/presentation tests/integration/presentation` da 78 pruebas: 56 verdes y 22 rojas.
  - 10 rojas son nuevas de la Rebanada 6: directorio 2, mensajes 3, permisos 3 y web-client 2.
  - 12 rojas son **antiguas y no tocadas por Keymaker**:
    - `components.spec.ts`: 8. Usan fixtures con `canEdit` y fallan con `Cannot read properties of undefined (reading 'editPetBasics')`.
    - `validation.spec.ts`: 1.
    - `view-model.spec.ts`: 2.
    - `web-client.spec.ts` «[REQ-UI-007] ... colorToken»: 1.
  - Esas 12 son deuda de pruebas de la 001 contra el contrato 002 (fixtures obsoletas). No puedo confirmar sin tocar el repo si ya estaban rojas en HEAD; es plausible que sí. Ver condición 5.
- Playwright (con `.env` solo en el proceso, nada impreso) ejecutó 52 pruebas: **46 verdes y 6 rojas**.
  - Las 38 previas siguen verdes: 46 - 8 nuevas verdes = 38.
  - Las nuevas son 14, no 13: el bucle `for` de `wcag.spec.ts` genera 3 pruebas, así que el «+6» de Keymaker es en realidad +7 (7 de wcag y 7 de recorridos).
  - De las 14 nuevas, 8 son verdes (6 de wcag y 2 de recorridos) y 6 son rojas.

## 3. Clasificación de cada prueba nueva

### Unitarias (vitest)
| Archivo:línea | Prueba | Clase | Evidencia |
|---|---|---|---|
| rebanada6-directorio.spec.ts:13 | Cinco filtros en orden | **ROJO LEGÍTIMO** | `PetCards.tsx:37-40` solo ofrece `Todas`, `CANINE` y `FELINE` (comentario «T284 PENDIENTE»). Recibe `[]`. |
| rebanada6-directorio.spec.ts:19 | Dueño: María, color y Solo lectura | **VERDE-GUARDA** | Pasa hoy. `PetCards.tsx:96` y `OwnerBadge.tsx` ya implementan el distintivo. Es regresión válida. |
| rebanada6-directorio.spec.ts:31 | Directorio mixto: Solo lectura solo en el Lector | **ROJO LEGÍTIMO** | `PetCards.tsx:96` pasa `canEdit={permissions.editPetBasics}`. El Cuidador tiene `editPetBasics=false` y recibe «Solo lectura». Recibe `['p1','p2']`. |
| rebanada6-permisos.spec.ts:34 (OWNER) | Acciones ocultas | **VERDE-GUARDA** | `PetDashboard.tsx:173-241` usa `editPetBasics` y `deletePet`. |
| rebanada6-permisos.spec.ts:34 (ADMIN) | Idem | **VERDE-GUARDA** | Idem. |
| rebanada6-permisos.spec.ts:34 (CAREGIVER) | Idem | **ROJO LEGÍTIMO** | `PetDashboard.tsx:241` monta `RecordForm` solo con `editPetBasics`. El Cuidador (`writeHealthEvents` y `writeWeightsAndMeasurements` en true) no ve formularios de pesos, medidas, vacunas ni desparasitaciones. |
| rebanada6-permisos.spec.ts:34 (READER) | Idem | **VERDE-GUARDA** | Sin permisos, sin formularios. |
| rebanada6-permisos.spec.ts:45 | Solo lectura solo para el Lector | **ROJO LEGÍTIMO** | Falla igual que la fila del directorio mixto: el Cuidador sale como «Solo lectura». |
| rebanada6-permisos.spec.ts:58 | SUPERSEDED: texto y acordeón | **ROJO LEGÍTIMO** | `view-model.ts:58` dice «reemplazada por un registro posterior», no «Reemplazada por registro posterior». No hay `<details>` «Registros anteriores» (grep sin resultados en `src/presentation/web`). Recibe `[false,false,false]`. El texto está respaldado por `sanitary-alert.machine.json:43`, `spec.md:100` y T289. |
| rebanada6-mensajes.spec.ts:13 | Errores por campo sin texto técnico | **ROJO LEGÍTIMO** | `validation.ts:62` asigna `ERROR_CATALOG[code].detailTemplate`, que dice «El payload incumple el esquema formal...». |
| rebanada6-mensajes.spec.ts:24 | Propiedad no autorizada en el error general | **ROJO LEGÍTIMO** | Mismo origen: `validation.ts:62`. |
| rebanada6-mensajes.spec.ts:29 | `problemMessage(catalogProblem(...))` | **ROJO LEGÍTIMO** | `api.ts:57` devuelve el `detailTemplate` del catálogo. |

### Integración (`web-client.spec.ts`)
| Línea | Prueba | Clase | Evidencia |
|---|---|---|---|
| ~106 | Cinco filtros en UI y `filter=OTHERS` en API | **ROJO LEGÍTIMO** | La UI recibe `offered: []`. La parte de la API ya cumple: `OTHERS` devuelve las 6 especies nuevas. |
| ~125 | Tarjetas reales del hogar con dueño, color y Solo lectura | **VERDE-GUARDA** | Pasa hoy. La definición `isReadOnly` con 4 permisos se alinea con la spec. |
| ~140 | El rechazo real de registro llega a la UI sin texto técnico | **ROJO LEGÍTIMO** | Recibe `['ERR-SCHEMA-VALIDATION-FAILED', true]` porque `problemMessage` muestra el `detailTemplate`. |

### Accesibilidad (`wcag.spec.ts`)
| Línea | Prueba | Clase | Evidencia |
|---|---|---|---|
| 159 (×3) | `/`, `/households`, `/backup` a los 4 anchos | **VERDE-GUARDA** | Pasan hoy; correcto como regresión de SC-005. |
| 166 | Ficha de la mascota a los 4 anchos | **VERDE-GUARDA** | Idem. |
| 173 | `/login` y `/register` a los 4 anchos | **VERDE-GUARDA** | Idem. |
| 184 | Sin desbordamiento a 320 px | **VERDE-GUARDA** | Idem. |
| 197 | `/cuenta` y zona de peligro | **ROJO LEGÍTIMO** | La URL queda en `http://127.0.0.1:5173/`: la ruta `/cuenta` no existe, y no hay página en `src/presentation/web/pages/`. Falla en `toHaveURL`, por funcionalidad ausente (T290). |

### E2E (`rebanada6-recorridos.spec.ts`)
| Línea | Recorrido | Clase | Evidencia |
|---|---|---|---|
| 33 | Mensaje de éxito al crear hogar | **ROJO LEGÍTIMO** | No existe ningún `role=status` con el nombre del hogar. El único `role=status` está en `App.tsx:23` y es de carga. |
| 39 | Tarjeta con rol «Administrador», sin recarga | **VERDE-GUARDA** | Pasa hoy. |
| 52 | Selector de contexto actualizado tras crear hogar | **VERDE-GUARDA** | Pasa hoy. |
| 63 | 30 mascotas por teclado y grilla 1, 2 y 3 | **ROJO LEGÍTIMO** | La navegación por teclado ya funciona. Falla solo en la grilla: recibe `[1,2,1]` en lugar de `[1,2,3]`. `PetCards.tsx:72` usa `lg:grid-cols-1`. |
| 89 | Aviso de expiración de sesión | **ROJO LEGÍTIMO** | No existe aviso. El grep de `inactiv` y `setTimeout` en `src/presentation/web` solo muestra un comentario en `session.tsx:7`. |
| 106 | Barra de fases del respaldo | **ROJO LEGÍTIMO** | No existe `list` con nombre «fases». |
| 125 | Archivo inválido en «Revertida» | **ROJO LEGÍTIMO** | Falla en `[aria-current="step"]`. |

**Resultado: 0 rojos por error de prueba.** Los 16 rojos nuevos (10 vitest + 6 Playwright) tienen su causa en funcionalidad ausente.

## 4. Respaldo de especificación para roles, textos y valores
**Con respaldo**
- **Filtros** (REQ-UI2-002, `REQ-PET2-002`, `spec.md:157`): Todos, Perros, Gatos, Otros y Con alertas sanitarias.
- **«Dueño: [Nombre]» con color y «Solo lectura» para el Lector** (REQ-UI2-003, `spec.md:157` y `265`). Que el Cuidador no vea «Solo lectura» es una inferencia razonable: la spec dice «el Lector además ve».
- **Matriz de formularios por rol** (REQ-RBAC-001, `spec.md:219-236`).
- **Acordeón «Registros anteriores / Reemplazados» y texto «Reemplazada por registro posterior»** (REQ-UI2-006, `spec.md:100` y `268`; `sanitary-alert.machine.json:43`). La spec dice «Registros anteriores / Reemplazados», y el test fija «Registros anteriores» dentro de `<summary>` (ok).
- **Barra de fases sin porcentaje** (REQ-UI2-007, `spec.md:158` y `269`). Las fases son Validando, Previsualizando, Aplicando, Terminada o Revertida.
- **Sin sondeo en segundo plano** (`plan.md:153`, P-04).
- **Aviso previo de expiración**: solo está respaldado por la redacción de T286 («aviso previo de expiración de sesión»). La expiración de 30 min está en D2.
- **Tras crear hogar: éxito, rol y selector actualizado**: respaldado por T286 y REQ-UI2-005 (rol ADMIN en `spec.md:239`).
- **Grilla de 1, 2 o 3 columnas** (REQ-UI2-002 y T288).
- **Anchos 320, 768, 1024 y 1280 px** (REQ-UI2-008, SC-005).
- **`/cuenta` con zona de peligro** (REQ-UI2-004).

**Sin respaldo explícito (invención de Keymaker, no corregida)**
1. `role="status"` para el éxito de crear hogar y el texto «creado|creaste». La spec y el plan no fijan rol ARIA ni redacción.
2. Que el aviso de expiración sea `alertdialog`, `alert` o `status`, con el texto `/sesi[oó]n.*(expira|caduca|vence)/`.
3. Los umbrales temporales: nada a los 10 min y aviso visible a los ~29:30 min. La spec no fija cuándo avisa.
4. `list` con nombre `/fases/i`, ítems en orden fijo, `aria-current="step"` y el literal «Revertida» como ítem activo. La spec solo dice «barra de fases». El orden y la forma de lista son interpretación.
5. Los puntos de quiebre de la grilla (1 columna a 320 px, 2 a 768 y 3 a 1280) y que la grilla sea el propio `listbox` «Mascotas». La spec solo dice «1, 2 o 3 columnas». Con la maquetación actual, que pone la lista en una columna lateral de 22rem a 1280 px (`PetsPage.tsx:140`), tres columnas podrían chocar con ese diseño. No pude contrastarlo con `ui_blueprint`, que no hallé en disco.
6. El selector del hogar como `role=tab` (`getByRole('tab', {name:'Casa Selector'})`). Coincide con el código actual (`PetsPage.tsx:140`), así que es contrato de hecho. La spec no fija el rol, pero la prueba pasa hoy.
7. El texto del botón «Importar respaldo» y el selector `input[type="file"]` (la vista actual `BackupPage` los define; `REQ-UI2-007` dice «selección por arrastre»).

## 5. Filtros (punto 4)
El contrato 002 define `filter` con `enum: [ALL, CANINE, FELINE, OTHERS, WITH_ALERTS]` (`openapi.yaml:290` y `:913`). La prueba de integración usa exactamente esos 5 valores en `names(filter)` y comprueba `OTHERS` contra las 6 especies nuevas (RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL y OTHER). Las 8 especies no se usan como valores de filtro. **Conforme.**

## 6. Solo lectura para el Lector (punto 5)
Sí está exigido. `spec.md:157` dice «el Lector además ve “Solo lectura”. Las acciones que su rol no permite no existen en la interfaz». REQ-UI2-003 (`spec.md:265`) reemplaza a REQ-UI-007 con el mismo texto. En REQ-RBAC-001 (`spec.md:219-236`) el Lector tiene N en todas las escrituras. La prueba lo cubre. La afirmación de que el Cuidador no lo ve es inferencia razonable, no mandato literal.

## 7. Oráculos débiles (punto 6)
- `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull`, `skip`, `todo`, `: any`, `as any`, `@ts-ignore` y `@ts-expect`: **sin hallazgos** en los archivos nuevos y en las líneas añadidas. El único acierto del patrón es la palabra «todos» dentro de un título, en `web-client.spec.ts`.
- `as unknown as` y `as never`: **aceptables**.
  - `rebanada6-fixtures.ts:78,92,107,127` y `web-client.spec.ts:116` son fixtures de forma de API.
  - `rebanada6-recorridos.spec.ts:43,49,56,60,68,80` son banderas `window.__sinRecarga`.
  - Ninguno oculta una aserción.
- Hallazgo menor, **`rebanada6-recorridos.spec.ts:135`**: `user.username.length > 0` es un elemento tautológico dentro del `toEqual`. Siempre es true y solo sirve para usar la variable `user`. No debilita la aserción útil (`pets` igual a `['Intacta']`) pero es ruido.
- Hallazgo menor, **`rebanada6-recorridos.spec.ts:101`**: `expect(requests).toEqual([])` es un oráculo de ausencia. Fuerte solo porque el listener se registra después del `fastForward('10:00')`. Es correcto, pero depende de que la API no sea llamada tras la espera.

## 8. Hallazgo de seguridad: exposición de detalle interno en el 422
**Confirmado con petición real.** Levanté la API con una base temporal en el directorio de trabajo temporal de la sesión, sin tocar el repo, y envié:
- `POST /api/auth/login` con `{"username":"probe"}` devuelve 422 con `"detail":"LoginInput: password must have required property 'password'."`.
- `POST /api/auth/register` con `username` «Mayus» devuelve 422 con `"detail":"RegisterUserInput: username must match pattern \"^[a-z0-9._-]+$\"."`.

El `detail` filtra el nombre interno del esquema (`LoginInput`, `RegisterUserInput`) y la salida cruda del validador (propiedad requerida, expresión regular). No filtra valores de usuario ni secretos.

**Regla incumplida.** El catálogo `error-catalog.json:349-355` (ERR-SCHEMA-VALIDATION-FAILED, 422) fija un `detailTemplate` estático: «El payload incumple el esquema formal, contiene propiedades no autorizadas, un username con mayúsculas...». El catálogo es determinista, y la API debería emitir esa plantilla (cliente `api.ts:40` y `problemMessage` en `api.ts:57` ya lo suponen). La API la sustituye por texto dinámico del validador. Esto expone detalle interno y rompe el determinismo del catálogo.

**Clasificación.** Severidad baja a media: es exposición de información interna (nombres de esquema y reglas), no de datos de usuario. Es defecto de `src/` (infraestructura HTTP), no de la prueba. Pertenece al flujo de /keymaker con revisión de /trinity, y no bloquea este frente rojo. **No se corrigió.**

Nota: la UI hoy muestra el `detailTemplate` técnico del catálogo (rojo legítimo de T284). El texto filtrado por la API (con nombres de esquema) llega al cliente pero la UI lo ignora y usa el del catálogo.

## 9. Condiciones del APTO CONDICIONADO
1. **Respaldo de especificación faltante** (sección 4, puntos 1 a 5). Morpheus o Architect debe confirmar o fijar: rol y texto de éxito, rol y texto del aviso de expiración con su umbral, estructura de la barra de fases y puntos de quiebre de la grilla. De lo contrario, T287 a T293 se implementarán contra expectativas inventadas.
2. **Oráculo tautológico** en `rebanada6-recorridos.spec.ts:135` (retirar `user.username.length > 0`).
3. **Rojo del E2E de grilla** (`:63`): confirmar con Sati que 3 columnas a 1280 px es compatible con la maquetación de 22rem lateral; si no, la prueba está mal calibrada.
4. **Deuda detectada**: el `detail` interno del 422 (sección 8) debe abrirse como hallazgo propio.
5. **12 rojas antiguas** en `components.spec.ts`, `validation.spec.ts`, `view-model.spec.ts` y `web-client.spec.ts` (fixtures con `canEdit`, 001). No se pueden mezclar con el frente rojo. Alguien debe decidir quién las reescribe (pruebas obsoletas contra el contrato 002) y si ya estaban rojas en HEAD.

## 10. Lo no verificado
- Si las 12 rojas antiguas ya fallaban en HEAD: no ejecuté `git stash` ni cambios de rama (prohibido).
- La existencia de `ui_blueprint v1.1`; no apareció en `specs/002-plataforma-v21` ni en `docs`.
- El comportamiento del aviso de expiración con `page.clock` frente a un reloj de servidor real. El test usa solo el reloj del navegador.
- Mutación o cobertura de los oráculos nuevos (no se ejecutó Stryker).
- La matriz completa de 44 casos de SC-008 (esta rebanada no la cubre por completo).
- Que las pruebas verdes de wcag no sean falsas por rutas sin contenido (el contenido de `/backup` etc. se asume del main visible).

## 11. Procesos
Tras la verificación se ejecutaron `pkill` para `tsx watch`, `concurrently -n api,web`, `vite` y el servidor de la sonda; `pgrep -fl "tsx|vite|concurrently|server.ts"` devolvió «none». No hay dev servers activos.

---
FROM: The Oracle (SDD Auditor & On-Disk Truth Filter)
TO: The Keymaker (SDD Developer) y /morpheus
STATUS: Validation Required
DETAILS: Veredicto CONDICIONAL del frente rojo T284/T285/T286: 16 rojos nuevos legítimos, 0 por error de prueba, 8 nuevas verdes de regresión, 38 previas intactas (46/52 Playwright; vitest 56/78 con 12 rojas antiguas ajenas). Escritura única: este informe.
NEXT RECOMMENDED STEP: /morpheus decide los 5 respaldos de spec faltantes y quién reescribe las 12 pruebas antiguas; luego /keymaker pasa a la fase verde (T287) y abre H-nuevo por el `detail` interno del 422.
