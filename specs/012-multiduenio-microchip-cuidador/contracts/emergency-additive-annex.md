---
title: Anexo aditivo de cuenta y mascota (phone, criticalAllergies) y T1662 reubicada
feature: 012
task: T1670
block: D
github: "#32"
version: 0.3.0
status: APPROVED
supersedes: null
change_type: MINOR
traceability: [REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, REQ-QR12-007, REQ-QR12-008, REQ-QR12-009, REQ-QR12-010, INV-QR12-002, INV-QR12-003, SC-012-046, SC-012-048, SC-012-086, SC-012-107, SC-012-110, SC-012-121, SC-012-122, SC-012-123, SC-012-124, SC-012-125, SC-012-126, SC-012-127, SC-012-128, SC-012-129, T1662, T1675, T1685]
---

# Anexo aditivo de la 012: `phone`, `criticalAllergies` y auditoría de alergias (APPROVED 0.3.0)

Documento nuevo de la feature 012. **No edita** ningún contrato `LOCKED`/`APPROVED` de 001..011. Solo Neo (Nivel 2) lo aprueba.

## 1. Campos aditivos opcionales

| Campo | Dónde se agrega | Obligatoriedad | Forma | Quién lo lee |
| --- | --- | --- | --- | --- |
| `phone` | Vista de la cuenta propia (002) | **Opcional**: ausente o `null` = sin teléfono; el cliente existente no cambia | `^\+[1-9][0-9]{7,14}$` (E.164 normalizado) o `null` | Solo la cuenta titular; en la ficha pública únicamente con opt-in **por mascota** (`REQ-QR12-006`) |
| `criticalAllergies` | Vista de la mascota (004) | **Opcional**: ausente = lista vacía | 0 a 5 textos de 1 a 60, texto plano | Quien ya lee la mascota; en la ficha pública solo con la ficha `ON` |

- La forma operativa de lectura y escritura vive en `emergency.openapi.yaml` (`updateAccountPhone`, `updateCriticalAllergies`) y en `schemas/emergency-card.schema.json` (`AccountPhoneView`, `CriticalAllergiesView`, `AdditiveOptionalFields`). Este anexo solo declara que los campos son **aditivos y opcionales** y que ningún contrato previo cambia de forma.
- **Consentimiento por mascota**: el teléfono de cada propietario se muestra solo si **ese titular** dio opt-in para **esa** mascota (`setEmergencyPhoneConsent`); no existe opt-in global de cuenta. El consentimiento queda ligado al valor del teléfono (`phone_hmac`): cambiarlo o borrarlo lo invalida (borra la fila) hasta reconfirmar. **Toda transición a `OFF` (incluido `AUTO_PET_DECEASED`) borra en el acto los consentimientos de teléfono de la mascota**; reactivar exige opt-in nuevo (`rama P-01/D-R1`, decisión de Neo 2026-11-27 (c)).
- `phone` no va en el respaldo por defecto y se borra con la cuenta. Ningún otro endpoint, vista ni lista de miembros lo devuelve.
- Cualquier cambio que haga perder la guarda de `D12-14` con la ficha `ON` la pasa a `OFF` en la misma transacción (`REQ-QR12-010`); la respuesta lo indica (`cardAutoDeactivated`, `emergencyCardsAutoDeactivated`).

## 2. T1662 reubicada al Bloque D (resolución Nivel 2 `D-C (b)`, 2026-11-27)

- **Auditoría `PET_CRITICAL_ALLERGIES_UPDATED`**: se genera por **todo cambio efectivo** de `pets.critical_allergies`, también el hecho por un `ADMIN` de hogar. Campos: `petId`, `actorUserId`, `occurredAt` (solo entidad, actor, tipo y fecha; **sin `actorRole`**). Regla de entrega: `newStateHash = null` (sin cuerpo ni hash de metadatos; decisión de Neo 2026-11-27, H-D1 (b), coherente con la decisión 3a y NFR-012-002). El rol efectivo del actor no se registra en la auditoría. **Prohibido** registrar el contenido de las alergias (antes o después), su conteo, `ip` o `userAgent`. Definida en `x-sdd-constants.AUDIT_EVENTS` del esquema y asociada a `updateCriticalAllergies` por `x-sdd-audit`.
- **Texto del editor (`maggie m-6`, versión `0.1.0`, DRAFT)**: «Anota solo alergias confirmadas o con riesgo. Tipi no verifica esta información con un veterinario. No escribas nombres ni datos de otras personas.» (`x-sdd-constants.TEXTS.value.allergiesEditorHelp`). Su validación legal externa sigue en `DEUDA-012-LEGAL-DISPUTAS-QR` y entra en `legal-texts.md` en `T1682`.
- **Normalización**: NFC, `trim`, deduplicación **sin distinguir mayúsculas** después de NFC (se conserva la primera aparición y su grafía), **sin** normalización de tildes; más de 5 elementos, un elemento vacío o de más de 60 puntos de código, o cualquier carácter rechazado por `TEXT_POLICY` = `422 ERR-SCHEMA-VALIDATION-FAILED` **sin eco del valor** (`x-sdd-constants.TEXT_POLICY`, `trinity T-07` y `N-04`, `rama N-04`). La política ampliada (0.3.0) rechaza las categorías `Cc`, `Cf`, `Zl` (U+2028), `Zp` (U+2029), `Co`, `Cn`, `Cs`, los controles bidi, los invisibles que sobreviven al `trim` (U+3164, U+115F, U+1160, U+FFA0, U+2800 y afines), más de **3 marcas combinantes consecutivas** y los elementos **sin ningún carácter visible** (categoría `L`, `N`, `P` o `S`); la deduplicación pliega mayúsculas **sin depender de la configuración regional** (`toLowerCase()` sin `locale`, nunca `toLocaleLowerCase`). Limitación documentada: `Cf` incluye U+200D (ZWJ), así que las secuencias emoji con ZWJ se rechazan. `petName` se emite en la vista pública con la misma función (sin caracteres rechazados y con al menos un carácter visible; si no, `404` uniforme); se debe auditar que el validador de `004` rechace las mismas categorías.
- Dependencias de implementación: `T1673` (migración `pets.critical_allergies`) y `T1675` (casos de uso). El contrato no depende de ellas.

## 3. Foto, alergias y vista por hogar (#26 diferido, `REQ-CAR12-005 (b)`)

`GET /households/{id}/care/today` sigue en `care.openapi.yaml` marcada como diferida. **Este DRAFT no la modifica** ni agrega foto: la foto de la mascota ya la sirve el contrato de medios de 004/011 y la UI del Bloque D la consume sin cambio de contrato (a confirmar en `T1671`). Las alergias críticas se leen por `criticalAllergies` en la vista de la mascota (aditivo de §1).

## 4. Alcance de `ADMIN` en las alergias críticas (decisión de Neo, Nivel 2, 2026-11-27 (a); `rama P-02`)

- «`ADMIN` de hogar con la mascota en su hogar activo (rol efectivo de `REQ-RBAC-001`)» **puede editar** `criticalAllergies` (`updateCriticalAllergies`), con la auditoría `PET_CRITICAL_ALLERGIES_UPDATED` (sin contenido, sin `actorRole`; `newStateHash = null`).
- `SUPER_ADMIN` y `OPERATOR` de plataforma (cookie de `/admin`, `011`) quedan **excluidos** de lectura y escritura de alergias.
- Un `ADMIN` que no es titular **no** activa, regenera, desactiva ni opta por teléfono, y no lee `getEmergencyCardStatus`: recibe el `404` uniforme (igual que un `ADMIN` de otro hogar).
- Su edición cuenta para `QR_PRIVATE_WRITES_PER_USER_PER_HOUR = 60`.
- **Roles sin permiso de edición (aclaración 2026-11-28, `INFO-1` oracle, sin cambio de comportamiento)**: un miembro de hogar con rol efectivo `CAREGIVER` o `READER` que **sí puede leer** la mascota recibe **`403 ERR-ACC-FORBIDDEN`** en `PUT /pets/{petId}/critical-allergies` (la acción `EDIT_PET_BASICS` es solo `OWNER`/`ADMIN`); quien no puede leer la mascota recibe el `404 ERR-PET-NOT-FOUND` uniforme. Esa ruta es la **única** de la ficha privada cuyo `403` puede ser `ERR-ACC-FORBIDDEN`: en las demás rutas privadas (`getEmergencyCardStatus`, activar, regenerar, desactivar, consentimiento, teléfono de cuenta) el miembro no titular recibe `404` y el `403` es **solo** `ERR-AUTH-CSRF-REJECTED`. Por tanto la regla «`403` solo CSRF» **no** aplica a las alergias.

## 5. Shell `GET /e/{token}` (`trinity T-04`, `rama P-09`)

No es endpoint de datos (se registra en `app.ts`, `H-01`), pero el token viaja en su URL, así que sus cabeceras son un requisito del contrato:

| Cabecera | Valor |
| --- | --- |
| `Referrer-Policy` | `no-referrer` |
| `Cache-Control` | `no-store` |
| `X-Robots-Tag` | `noindex, nofollow` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `SHARED_PAGE_CSP`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |

- `200` **idéntico para cualquier valor de token** (válido, inexistente, mal formado o de longitud arbitraria hasta el límite del enrutador); sin datos en línea, sin `<script>` en línea, sin `Set-Cookie`, sin recursos de terceros ni metaetiquetas `og:`/`twitter:`.
- Todo otro método o subruta del prefijo `/e/` sigue el mismo mecanismo único de `404` que la ruta de datos (`T-03`): un solo `setNotFoundHandler` del prefijo, `HEAD`/`OPTIONS` incluidos y contados para el límite de tasa.
- **`HEAD`, `OPTIONS` y CORS (`trinity N-07`, `SC-012-126`)**: la ruta pública se registra con `exposeHeadRoutes: false` (Fastify expone por defecto un `HEAD` por cada `GET`, que con un token válido daría `200` en lugar del `404` uniforme) y sin plugin CORS global en el prefijo. **Criterio de aceptación de `T1675`**: `HEAD` (token válido e inválido) y `OPTIONS` dan el mismo `404` uniforme, cuentan para `QR_SCAN_MAX_PER_IP_PER_MINUTE` y no llevan ninguna cabecera `Access-Control-*`; un `GET` con `Origin` cruzado tampoco (`x-sdd-constants.PUBLIC_ROUTE_HARDENING`).
- Los `404` y `429` públicos llevan `instance = "/emergency"` constante (`T-01`).
- **Límite de tasa del shell (INFO, oráculo 0.3.0)**: `GET /e/{token}` (shell) **sí cuenta** para `QR_SCAN_MAX_PER_IP_PER_MINUTE` (la regla cuenta toda petición al prefijo público `/e/` y `/api/emergency/`, GET, HEAD u OPTIONS, antes de consultar la ficha); a confirmar como criterio de aceptación de `T1675`.

## 6. Criterios BLOQUEANTES para `T1685` y la activación en producción

1. **`redactSecrets` cubre `/e/<token>` y `/api/emergency/<token>`** (`trinity T-02`): patrón por **forma y sin anclar** (`trinity N-01`): se redacta **todo el segmento** que sigue a `/e/` y a `/api/emergency/` hasta `/`, `?`, `#`, espacio o fin de cadena, **de cualquier longitud** (no solo 43 base64url), porque un token truncado, con sufijo, con barra final o con un typo es precisamente lo que más se registra en los `404`; incluye `req.url` del registro de petición y el mensaje de Fastify `Route GET:/... not found`. Prueba de no fuga `SC-012-086` con tokens de 43, 42, 44 y 200 caracteres, con sufijo y con barra final, en registro de aplicación, auditoría y cabeceras (patrón `INV-005-009`). **Es criterio bloqueante de `T1685` en código (`redactSecrets` en `cloud-logging.ts`) además de `terraform`.**
2. **Teléfono fuera de los registros** (`rama P-06`, `D-R3`): el cuerpo y los mensajes de error de `PUT /account/phone` y `PUT /pets/{petId}/emergency-card/phone-consent` no se registran; el teléfono no aparece en registros, auditoría, cabeceras ni mensajes de error.
3. **`DEUDA-012-TERRAFORM-LOGS-QR`** (`SC-012-107`): exclusión de `/e/` y `/api/emergency/` en `terraform/logging.tf`, aplicada y registrada por Neo tras `terraform plan`. Esta feature no toca `terraform/`.
4. **`DEUDA-012-LEGAL-DISPUTAS-QR`** cerrada con los textos aprobados (condición de producción, no del DRAFT).
5. Clave dedicada de `phone_hmac` (`PHONE_HMAC_KEY`, `T-05`) presente en producción y runbook de rotación (§9) documentado en `quickstart.md`.
6. Prueba de arranque de `ARGOS_TRUST_PROXY_HOPS` y prueba de no cache en proceso `token → ficha` (`T-06`, `T-09`); `SC-012-109` (respuesta del token fuera de idempotencia, registros y almacén de medios).

## 7. Retención y vigencia del aviso (decisiones de Neo, 2026-11-27 (b), (c))

- **Consentimientos de teléfono**: se **borran en el acto** al pasar a `OFF` por cualquier causa (`USER_DEACTIVATED`, `AUTO_GUARD_LOST`, `AUTO_PET_DECEASED`, `AUTO_NOTICE_CHANGED`); sin plazo.
- **Historial de la ficha**: `statusReason` y `status_changed_at` se conservan `EMERGENCY_HISTORY_RETENTION_DAYS = 90` días tras `OFF`. **Al cumplirse los 90 días** la fila vuelve a `OFF` sin historial: `status_reason`, `status_changed_at`, `consented_by_user_id`, `activated_at`, `token_rotated_at` y `consent_notice_version` pasan a `NULL` (`rama N-06`). `consented_by_user_id` además se limpia **en el acto** en toda transición a `OFF`.
- **`lastChange`** se deriva de la última fila de auditoría de una **lista blanca de 4 tipos de tarjeta** (`EMERGENCY_CARD_ACTIVATED` → `ACTIVATED`, `EMERGENCY_CARD_REGENERATED`, `EMERGENCY_CARD_DEACTIVATED`, `EMERGENCY_CARD_AUTO_DEACTIVATED`); **`EMERGENCY_PHONE_CONSENT_CHANGED` y `PET_CRITICAL_ALLERGIES_UPDATED` no producen `lastChange`** (`rama N-04`): el cambio de consentimiento de otro titular no se expone. Pasados 90 días sin evento nuevo es `null` (también con la ficha `ON`), porque la auditoría `EMERGENCY_*` se purga a 90 días.
- **Aviso de alergias** (`trinity N-03`): `EmergencyCardOwnerView.criticalAllergiesChange` (`{at, byMe}` o `null`) se deriva del último `PET_CRITICAL_ALLERGIES_UPDATED` de la mascota **dentro de 90 días**; sin contenido, conteo, identidad ni rol, de modo que los titulares se enteran de que cambió lo que ve el público incluso cuando lo edita un `ADMIN` de hogar no titular. La auditoría de alergias conserva la política estándar de auditoría de mascota; solo su lectura para el aviso se acota a 90 días.
- **Auditoría `EMERGENCY_*`**: 90 días desde `occurredAt` (decisión de Neo 2026-11-27 (3); purga del mantenimiento existente sobre `audit_log`). `PET_CRITICAL_ALLERGIES_UPDATED` **no** se acorta.
- **Cambio material del aviso** (`MINOR` o `MAJOR` de `noticeVersion`; `PATCH` editorial no exige nada): los teléfonos quedan **en espera** (no se publican; la fila se conserva) hasta reconfirmar con `setEmergencyPhoneConsent`, **como máximo `EMERGENCY_NOTICE_WAIT_DAYS = 90` días desde `EMERGENCY_NOTICE_EFFECTIVE_AT`** (decisión de Neo 2026-11-27 (1)); **vencido el plazo, la fila se BORRA** (evento de sistema `EMERGENCY_PHONE_CONSENT_CHANGED`, `visible = false`, `actorUserId = NULL`; el origen «vencimiento de la espera» no es campo de la auditoría) y se reconcilia la ficha. La ficha **no** se apaga mientras haya alergias u otro teléfono vigente; si no queda ninguno, cae a `OFF` con `statusReason = AUTO_NOTICE_CHANGED`. Nota: el paso de los textos de `0.1.0` a `1.0.0` tras la validación legal es un cambio `MAJOR` y dejará en espera todos los teléfonos con consentimiento previo, con el reloj de 90 días corriendo desde `EMERGENCY_NOTICE_EFFECTIVE_AT`.
- **Reconciliación perezosa ordenada** (`trinity N-02`, `rama N-03`; `x-sdd-constants.LAZY_RECONCILIATION`, `SC-012-123`): (1) **después de autorizar** (el `404` uniforme va primero y no escribe nada); (2) `UPDATE pet_emergency_cards … WHERE pet_id = ? AND status = 'ON'`: solo si afecta una fila se borran los consentimientos, se fija `status_reason` y se emite **un solo** `EMERGENCY_CARD_AUTO_DEACTIVATED` (dos lecturas concurrentes no duplican la auditoría); (3) en una mutación de reconfirmación (`setEmergencyPhoneConsent visible = true`) **se aplica primero la mutación y se reconcilia después**; (4) **disparadores enumerados**: `getEmergencyCardStatus`, `setEmergencyPhoneConsent`, `activate`/`regenerate` con la ficha `ON`, `updateCriticalAllergies`, `updateAccountPhone` (por cada mascota afectada) y el barrido de mantenimiento de la 012; las mutaciones de otros módulos **no** reconcilian, con **una sola excepción**: marcar `lifeStatus = DECEASED` (007) invoca el hook de §10 dentro de su propia transacción; (5) la ruta pública nunca escribe. `occurredAt` del evento es el instante de la reconciliación (no el del cambio del aviso) y `lastChange.at` lo refleja; el mantenimiento barre además los consentimientos en espera vencidos y las fichas `ON` sin requisitos para que no queden filas persistidas de cuentas inactivas.
- **Auditoría derivada** (`trinity` hueco 8; regla común H-D1 (b): todo evento `EMERGENCY_*` y `PET_CRITICAL_ALLERGIES_UPDATED` entrega `newStateHash = null` (sin cuerpo ni hash de metadatos; decisión de Neo 2026-11-27, H-D1 (b), coherente con la decisión 3a y NFR-012-002), sin `actorRole` ni `origin`): `forbidden` de todos los eventos incluye `ip`, `userAgent`, `phone_hmac`, token, hash, URL y el contenido de las alergias (cada evento lo nombra una sola vez); `EMERGENCY_PHONE_CONSENT_CHANGED` se emite en `setEmergencyPhoneConsent`, en `activate`/`regenerate` con `showMyPhone = true`, en `updateAccountPhone` al invalidar consentimientos y, como evento de **sistema** (`actorUserId = NULL`; sin `origin` ni hash en la auditoría), por la rotación de `PHONE_HMAC_KEY` y por el vencimiento de la espera del aviso. Al eliminar una cuenta se seudonimizan `actorUserId` y `details` de los eventos `EMERGENCY_*` y `PET_CRITICAL_ALLERGIES_UPDATED`.
- **Topes por usuario**: `deactivateEmergencyCard` comparte el cubo `QR_CARD_MUTATION` (20/h) con activar y regenerar (`trinity N-09`, juicio del Architect: separarlo reabriría la decisión (d) de Neo; el titular conserva la vía de apagar la ficha retirando el teléfono y vaciando las alergias con el cubo `QR_PRIVATE_WRITE`, y quien tiene la sesión podría hacer todo lo demás). Las filas `rate_limit_events` con `scope` `QR_*` se borran con la cuenta (`rama N-08`).

## 8. Cierre de hallazgos de `T1671` en `0.2.0` y `0.3.0`

| Hallazgo | Dónde queda cerrado |
| --- | --- |
| `T-01`, `T-03`, `T-06`, `T-09`, `T-10` | `emergency.openapi.yaml` (descripción y respuestas públicas), `PUBLIC_PROBLEM_INSTANCE`, `QR_SCAN_MAX_PER_IP_PER_MINUTE.rule` |
| `T-02` | §6 de este anexo, `x-sdd-constants.LOG_REDACTION`, `REQ-QR12-008` |
| `T-04`, `P-09` | §5 |
| `T-05`, `P-18` (`phone_hmac`) | `x-sdd-constants.PHONE_HMAC_KEY` (clave dedicada, versión única; rotación por recálculo o borrado, §9); el aprovisionamiento en Secret Manager/terraform queda como deuda de infraestructura (fuera de la 012) |
| `T-07` | `TEXT_POLICY`, §2 |
| `T-08`, hueco 4 | `QR_CARD_MUTATIONS_PER_USER_PER_HOUR`, `QR_PRIVATE_WRITES_PER_USER_PER_HOUR`, respuestas `429` |
| `P-01`, `P-08` | §1 y §7, `EMERGENCY_HISTORY_RETENTION_DAYS`, `data-model.md` |
| `P-02` | §4 |
| `P-03`, `P-04` | `emergency-card.schema.json` `EmergencyCardStatusReason`, `data-model.md` |
| `P-05`, hueco 8 | `AUDIT_EVENTS`, §7 |
| `P-06` | `REQ-QR12-008`, §6 |
| `P-07` | §7 |
| `P-11`, `P-12` | `EmergencyCardLastChange.description`, `AUDIT_EVENTS.rule`, `data-model.md` |
| `P-13`, `P-14` | `error-catalog.json` |
| Hueco 5 | `SVG_DELIVERY`, `emergency.openapi.yaml` |
| `N-01` trinity, `N-01` rama r2 | §9, `PHONE_HMAC_KEY` (rama N-01 = rotación); `LOG_REDACTION` y §6.1 (trinity N-01 = redacción por forma) |
| `N-02` trinity, `N-03` rama | §7, `LAZY_RECONCILIATION`, `EMERGENCY_NOTICE_WAIT_DAYS` |
| `N-02` rama | §7, `EMERGENCY_NOTICE_WAIT_DAYS` (90 días, Neo (1)) |
| `N-03` trinity | §7 (aviso de alergias), `EmergencyCardOwnerView.criticalAllergiesChange` |
| `N-04` trinity y rama | §2, `TEXT_POLICY`, §7 (lista blanca de `lastChange`) |
| `N-05` trinity | `QR_SCAN_MAX_PER_IP_PER_MINUTE.rule` |
| `N-05`, `N-06` rama | `EMERGENCY_HISTORY_RETENTION_DAYS.rule`, §7 |
| `N-07` rama | `AUDIT_EVENTS.rule`, §7 (auditoría `EMERGENCY_*` 90 días, Neo (3)) |
| `N-07` trinity | §5, `PUBLIC_ROUTE_HARDENING`, `SC-012-126` |
| `N-08` trinity | versión del `openapi` alineada (0.3.0), `forbidden` sin duplicados, `SC-012-121..129` en `spec.md`; `T1685` pide `redactSecrets` en código (§6.1; edición de `tasks.md` a cargo de `/morpheus`) |
| `N-08` rama, `N-09` trinity | §7 (borrado de `rate_limit_events QR_*` con la cuenta; `deactivate` comparte cubo) |

## 9. Rotación de `PHONE_HMAC_KEY` y runbook (decisión de Neo 2026-11-27 (2); `rama N-01`, `trinity N-06`)

**Una sola regla**: la clave no tiene versión ni se verifica con una clave anterior. La rotación **re-calcula** `phone_hmac` de cada fila de `pet_emergency_phone_consents` desde `users.phone` con la clave nueva (el teléfono no cambió, así que el consentimiento se mantiene; una fila viva siempre corresponde al teléfono vigente porque cambiar o borrar `users.phone` la borra en la misma transacción). Si el recálculo falla o el usuario no tiene teléfono, la fila se **borra** (nunca queda en espera) con un `EMERGENCY_PHONE_CONSENT_CHANGED` de **sistema** (`actorUserId = NULL`, `visible = false`; el origen «rotación de `PHONE_HMAC_KEY`» se documenta en este runbook, no como campo de la auditoría) y se reconcilia la ficha con la misma lógica de §7 (`AUTO_GUARD_LOST` si queda sin requisitos). **La rotación nunca deja filas en espera.** Mientras el barrido no termine, una fila cuyo `phone_hmac` no coincide con la clave vigente no se publica (falla cerrada).

**Consentimiento STALE y guarda durante la ventana de rotación** (aclaración 2026-11-28, `RAMA-T1683-03`, sin cambio de comportamiento): un consentimiento `STALE` (`phone_hmac` distinto del recálculo con la clave vigente) **nunca** entra en `contactPhones` ni en `visiblePhonesCount`, pero **sí cuenta como teléfono vigente para la guarda de `ON`** (`loadCardState`: `guardSatisfied` suma los `STALE`) y **no** hace caer la ficha a `OFF` por sí solo. Motivo: la rotación no debe apagar fichas por un estado transitorio que el barrido resuelve (recalcula la fila o la borra y reconcilia con `AUTO_GUARD_LOST`, regla de arriba). Consecuencia aceptada: durante la ventana puede existir una ficha `ON` cuya vista pública muestre solo `petName` (sin teléfono ni alergias); no hay fuga porque la fila `STALE` jamás se publica. La ventana termina cuando el barrido recalcula o borra la fila; el runbook (paso 2) exige ejecutarlo antes de reabrir tráfico a la ficha o inmediatamente tras el despliegue.

Runbook (se copia a `quickstart.md`; criterio de `T1685`, prueba `SC-012-122`):
1. Aprovisionar la clave nueva en Secret Manager (clave dedicada, distinta de la de sesión y de IP).
2. Desplegar con la clave nueva y ejecutar el barrido de rotación (idempotente; puede repetirse) **antes de reabrir tráfico a la ficha o inmediatamente tras el despliegue** (rotación en ventana de mantenimiento, runbook annex §9).
3. Verificar que no queda ninguna fila con `phone_hmac` distinto del recálculo y que no hay filas en espera atribuibles a la rotación.
4. Retirar la clave anterior **solo** tras el barrido.
5. Registrar en `claude/` la fecha, cuántos consentimientos se borraron y cuántas fichas cayeron a `OFF`.

Coste documentado: las fichas `ON` cuyo único requisito era un teléfono no recalculable caen a `OFF`. Riesgo aceptado (INFO, `trinity N-06`): el teléfono **no se verifica por OTP**, así que un titular podría publicar el número de un tercero; el aviso de activación lo cubre solo en parte.

## 10. Fallecimiento: reconciliación inmediata de la ficha (`RAMA-T1683-02`, opción A aprobada por Neo, Nivel 2, 2026-11-28)

Aclaración MINOR **sin cambio de forma pública** (ningún campo, ruta, código de error ni vista cambia; `status APPROVED` y `version 0.3.0` de este anexo se conservan). Cierra la brecha entre «la transición a `OFF` borra en el acto los consentimientos» (§1, §7, `REQ-QR12-010`) y la implementación perezosa, que dejaba hasta 24 h de consentimientos persistidos y la ficha `ON` visible para el titular tras el fallecimiento.

1. **Disparador**: la operación de `007` que cambia `pets.life_status` de un valor distinto de `DECEASED` a `DECEASED` (`updatePet` con `lifeStatus = DECEASED` y cualquier otra vía que lo fije). Transiciones que no entran a `DECEASED` no invocan nada.
2. **Puerto**: el caso de uso de mascota depende de un puerto de aplicación mínimo `EmergencyCardLifecycle.onPetDeceased(petId, tx, actorUserId)` (inyectado; `actorUserId` es quien marcó el fallecimiento y alimenta el evento de §10.4(b); la capa de aplicación de mascota **no** importa el módulo de ficha). Su implementación es la misma rutina interna que usan `reconcileCard` y `DeactivateEmergencyCard` (`switchOffIfOn` + `deleteByPet`), sin duplicar reglas.
3. **Atomicidad**: el hook se ejecuta **dentro de la transacción** que persiste `life_status = DECEASED` (misma unidad de trabajo, tras validar `If-Match`/versión y congelación). Si la transacción revierte, no queda ningún efecto de ficha; si el hook falla, revierte también el fallecimiento (fallar cerrado; no se persiste `DECEASED` con la ficha `ON`).
4. **Efecto**, en este orden: (a) `UPDATE pet_emergency_cards SET status='OFF', status_reason='AUTO_PET_DECEASED', status_changed_at=now, token_hash=NULL, consented_by_user_id=NULL … WHERE pet_id = ? AND status = 'ON'`; (b) **solo si (a) afectó una fila**, un único evento `EMERGENCY_CARD_AUTO_DEACTIVATED` (motivo `AUTO_PET_DECEASED`; `actorUserId` = quien marcó el fallecimiento; `newStateHash = null`, regla de §8/H-D1 (b)); (c) **siempre** `DELETE FROM pet_emergency_phone_consents WHERE pet_id = ?` (incluye consentimientos en espera por aviso y `STALE`; es idempotente y no emite evento adicional si (a) no afectó fila). Una ficha ya `OFF` o inexistente solo ejecuta (c) y no crea fila de ficha.
5. **Vista y ruta pública**: desde el commit, `GET /api/emergency/{token}` responde `404` por `token_hash = NULL` y no solo por la comprobación `deceased` (la comprobación de fallecida de la lectura pública se **conserva** como segunda defensa); `getEmergencyCardStatus` ya devuelve `OFF` con `statusReason = AUTO_PET_DECEASED` y `lastChange` correspondiente.
6. **Reversión del estado vital** (si `007` permitiera volver a `ALIVE`): **no** reactiva la ficha; regenerar desde `OFF` exige guarda + consentimiento + token nuevo (`REQ-QR12-010`). Los consentimientos borrados no se restauran (nuevo opt-in).
7. **Fuera de alcance**: el barrido de mantenimiento y la reconciliación perezosa siguen cubriendo cualquier fila `ON` heredada de antes del hook; no se requiere migración de datos. **Importación de respaldo (decisión de Neo, 2026-11-28)**: la importación de respaldo **no invoca** el hook. Si una mascota importada ya viene `DECEASED`, el `CASCADE` de la importación deja a la mascota **sin ficha** (no existe fila de `pet_emergency_cards` ni de consentimientos que reconciliar) y por tanto **no hay exposición** de ficha; no se requiere acción adicional. Las demás mutaciones de otros módulos siguen **sin** reconciliar (§7).
8. **Pruebas** (para `/keymaker`, extienden `SC-012-123`, sin ID nuevo): marcar `DECEASED` con ficha `ON` → en la misma respuesta la ficha es `OFF/AUTO_PET_DECEASED`, `token_hash NULL`, consentimientos cero, un solo evento; con ficha `OFF` y consentimiento en espera → consentimiento borrado sin evento; fallo del hook → `life_status` intacto; ruta pública `404` inmediato; PostgreSQL, SQLite y memoria con el mismo resultado.

Trazabilidad: `REQ-QR12-010`, `INV-QR12-004`, `SC-012-123`, `RAMA-T1683-02`; `data-model.md` (`pet_emergency_cards`, `pet_emergency_phone_consents`, «Reconciliación perezosa»).
