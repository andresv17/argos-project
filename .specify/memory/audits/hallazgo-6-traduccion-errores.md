# Hallazgo 6 — Traducción de errores de esquema a mensajes humanos (capa de presentación)

Autor: Architect · Fecha: 2026-11-10 · Estado: PROPUESTA (diseño, sin implementar) · Requiere aprobación de Neo (Nivel 2) para el punto de decisión D1.

## 1. Diagnóstico

Mensaje observado: "El payload incumple el esquema formal o contiene propiedades no autorizadas." (`detailTemplate` de `ERR-SCHEMA-VALIDATION-FAILED`, `error-catalog.json`, `invariantRef` INV-REC-006).

Flujo actual:
- `useContractForm.onSubmit` arma el cuerpo con `formValues` (omite los vacíos) y llama `validateInput(schema, body)`.
- `validateInput` (`src/presentation/web/validation.ts`) recorre `validate.errors` de Ajv. Por cada error calcula un campo (`instancePath`, o `missingProperty` si `keyword === 'required'`), resuelve el código con `resolveFieldErrorCode(schema, path)` (mapa generado desde `x-sdd-error`) y, si no hay código para ese campo, usa `ERR-SCHEMA-VALIDATION-FAILED`. El texto sale siempre de `ERROR_CATALOG[code].detailTemplate`.
- Solo los campos con `x-sdd-error` (p. ej. `password` → ERR-AUTH-WEAK-PASSWORD, pesos y medidas) tienen mensaje específico. Todo lo demás cae en el mensaje técnico.

Cuándo aparece:
1. Campo obligatorio vacío (`keyword: required`): p. ej. `CreatePetInput` exige name, species, breed, birthDate, sex; `formValues` omite el vacío y Ajv reporta `required` con `missingProperty`. Es el caso más común y se muestra en el campo, con el texto técnico.
2. Formato/longitud/enum/patrón (`pattern`, `minLength`, `maxLength`, `enum`, `format`, `type`, `minimum`, `maximum`, `$ref` a NonEmptyTrimmedString/IsoDate): campo con texto técnico.
3. Propiedades no autorizadas (`keyword: additionalProperties`, `instancePath` vacío, `params.additionalProperty`): se asigna a la clave `_form` (`FORM_ERROR_KEY`). Con los formularios actuales no debería ocurrir por UI (los campos son fijos); indica un error de programación del formulario, no del usuario.
4. `UpdatePetInput` con `minProperties: 1` (`keyword: minProperties`, `instancePath` vacío): también cae en `_form`.
5. Respuestas 422 del servidor con `code = ERR-SCHEMA-VALIDATION-FAILED`: `problemMessage` devuelve el mismo `detailTemplate`; solo se asigna a un campo si `problem.field` viene informado.

Datos de Ajv disponibles en presentación (por cada error): `keyword`, `instancePath`, `params` (`missingProperty`, `additionalProperty`, `limit`, `allowedValues`, `pattern`, `format`, `type`), `schemaPath`, `message`. Además, el nombre del esquema (`InputSchema`) y el valor enviado. Es información suficiente para decidir un mensaje por campo y tipo de falla. No hay allErrors garantizado: hoy se muestra el primer error de cada campo (verificar en implementación si el validador generado reporta todos).

Conclusión del diagnóstico: el mensaje técnico es una consecuencia de que el catálogo solo tiene un texto para toda violación de esquema; la información fina ya está en el error de Ajv del cliente.

## 2. Diseño (solo capa de presentación)

Nuevo módulo `src/presentation/web/schema-messages.ts` (puro, sin dependencias de dominio/aplicación):

- `FIELD_LABELS: Record<InputSchema, Record<string, string>>`: etiqueta humana por campo, p. ej. `CreatePetInput.name → "el nombre de la mascota"`, `species → "la especie"`, `breed → "la raza"`, `birthDate → "la fecha de nacimiento"`, `sex → "el sexo"`, `RegisterUserInput.username → "el usuario"`, `displayName → "el nombre visible"`, `LoginInput.password → "la contraseña"`, y así para pesos, medidas, vacunas, desparasitaciones, visitas, parámetros, hogar e invitación.
- `humanizeSchemaError(schema, ajvError): string`: elige el mensaje por `keyword`:
  - `required` → "Falta {etiqueta}." (p. ej. "Falta el nombre de la mascota.")
  - `minLength`/NonEmptyTrimmedString (patrón de no vacío) → "{Etiqueta} no puede estar vacío."
  - `maxLength` → "{Etiqueta} admite como máximo {limit} caracteres."
  - `enum` → "Elige un valor válido para {etiqueta}."
  - `pattern`/`format` de fecha → "Escribe {etiqueta} con el formato AAAA-MM-DD." (fecha); resto → "El formato de {etiqueta} no es válido."
  - `type` → "El valor de {etiqueta} no es válido."
  - `minimum`/`maximum` → "{Etiqueta} debe estar entre {min} y {max}." cuando ambos límites se conocen; si no, "…debe ser como mínimo/máximo {limit}."
  - `additionalProperties` → mensaje de formulario genérico: "No se pudo enviar el formulario. Recarga la página e inténtalo de nuevo." y se registra la propiedad en consola de desarrollo (`params.additionalProperty`); no se muestra el nombre técnico al usuario.
  - `minProperties` (edición sin cambios) → "No hay cambios que guardar."
  - cualquier otro keyword → "Revisa {etiqueta}." y, sin etiqueta, "Revisa los datos del formulario."
- Precedencia en `validateInput`: (1) si `resolveFieldErrorCode` devuelve un código específico (≠ ERR-SCHEMA-VALIDATION-FAILED), se mantiene el `detailTemplate` del catálogo (no se pierde REQ-UI-005 para contraseña débil, peso y medidas); (2) solo cuando el código sería `ERR-SCHEMA-VALIDATION-FAILED` se usa `humanizeSchemaError`; (3) si falta etiqueta, se usa el nombre del campo sin traducir solo como último recurso, y una prueba impide que ocurra para los esquemas de formularios existentes.
- Servidor (`api.ts` / `problemMessage`): si llega `ERR-SCHEMA-VALIDATION-FAILED` y el formulario tiene validación cliente que ya habría atrapado el caso, el mensaje técnico casi nunca llega a verse. Si llega, se mantiene la función actual salvo que se pueda reutilizar `problem.field`; si no hay campo, mostrar "Revisa los datos del formulario." en lugar del texto técnico. Esto es una elección de presentación (no cambia el código del error ni el catálogo).
- `error.message` de Ajv no se muestra nunca (está en inglés).
- Accesibilidad: el mensaje sigue yendo al `errors[field]` existente (mismo `aria-describedby`/`role` de `Field.tsx`); no cambia la estructura del DOM.

Qué NO se toca: `error-catalog.json`, `contracts/**`, `src/generated/**`, dominio y aplicación, ni spec 001.

## 3. ¿Cabe en la capa de presentación?

Sí para el 100% de los errores detectados en cliente (que son los que ve el usuario en los formularios): Ajv entrega `keyword` y `params` suficientes y los nombres de campo son estables.

Limitaciones que requerirían contrato (decisión D1 para Neo, no bloqueante):
- Los 422 del servidor solo traen el `detailTemplate` técnico y, a lo sumo, `problem.field`. Para traducir con precisión errores originados solo en el servidor habría que cambiar el contrato (p. ej. añadir `errors[]` con campo y regla en el problema RFC 9457, o un `detailTemplate` más amable en el catálogo). Mientras la validación cliente use los mismos esquemas generados, esta brecha es teórica.
- Redacción del catálogo: la alternativa más barata sería reescribir `detailTemplate` de ERR-SCHEMA-VALIDATION-FAILED, pero eso modifica un contrato (REVIEW) y afecta oráculos; no se recomienda.

Decisión D1 (Neo): aceptar la solución solo en presentación (recomendada) o autorizar un cambio de contrato posterior para los 422 de servidor.

Decisión D2 (Neo, spec LOCKED): `REQ-UI-005` dice "mensajes de error del catálogo". Los mensajes humanos por campo son una capa de redacción sobre el código del catálogo (el código sigue siendo `ERR-SCHEMA-VALIDATION-FAILED`). Se propone interpretarlo así sin enmendar la spec; si Neo prefiere literalidad, habría que enmendar REQ-UI-005 (cambio de Nivel 2) antes de implementar.

## 4. Archivos a tocar (cuando Neo apruebe)

- NUEVO `src/presentation/web/schema-messages.ts`.
- `src/presentation/web/validation.ts` (usar `humanizeSchemaError` cuando el código resuelto sea ERR-SCHEMA-VALIDATION-FAILED; tratar `additionalProperties` y `minProperties` en `_form`).
- `src/presentation/web/api.ts` y `use-contract-form.ts` (fallback legible para 422 sin campo).
- Pruebas: NUEVO `tests/unit/presentation/schema-messages.spec.ts`; ampliar `tests/unit/presentation/` de validación existente; E2E `tests/e2e/visual/auth-pet-forms.spec.ts` (caso de campo vacío en alta de mascota).
- Responsable de implementación: Keymaker; validación: Oracle. Requiere tarea nueva en `tasks.md` (la agrega Architect/Morpheus con aprobación de Neo; no la crea este documento).

## 5. Identificadores a trazar

REQ-UI-005 (mensajes de formularios de registro/login), REQ-UI-002 (formularios de alta de módulos), REQ-UI-001 (alta de mascota/lista), REQ-UI-004 (accesibilidad: mensajes asociados al campo, sin violaciones axe), REQ-UI-006 (formulario de hogar/invitación), ERR-SCHEMA-VALIDATION-FAILED, INV-REC-006, INV-ARCH-003 (los esquemas siguen siendo los generados, sin copias manuales).

## 6. Criterios de aceptación verificables

1. Dejar vacío el nombre en "Agregar mascota" muestra exactamente "Falta el nombre de la mascota." junto al campo (E2E Playwright) y el texto "El payload incumple el esquema formal" no aparece en el DOM.
2. Para cada esquema de `VALIDATORS` en validation.ts y cada propiedad `required`, una prueba unitaria genera el input sin esa propiedad y comprueba que el mensaje existe en español, empieza con "Falta " y no contiene "payload" ni "esquema".
3. `validateInput` con contraseña débil sigue devolviendo el `detailTemplate` de ERR-AUTH-WEAK-PASSWORD; con peso fuera de rango, el de ERR-REC-WEIGHT-OUT-OF-RANGE (no regresión).
4. Input con propiedad extra devuelve `_form` con el mensaje genérico y sin el nombre técnico de la propiedad; `UpdatePetInput` `{}` devuelve "No hay cambios que guardar.".
5. Prueba de cobertura de etiquetas: ningún campo de ningún esquema de formulario cae al último recurso (nombre técnico).
6. `git diff --stat` no muestra cambios en `contracts/**`, `src/generated/**`, `error-catalog.json`, `src/domain/**`, `src/application/**` ni `specs/**`.
7. Compuertas: `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate` en verde; axe sin violaciones critical/serious a 320/1024/1280 px en las pantallas de formularios.
