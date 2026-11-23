# Acta /architect — Feature 009: preguntas abiertas para Neo y verificación contra el código

**TO: Neo (Andrés Vallejo — Level 2)**
**Fecha**: 2026-11-23 | **Autor**: `/architect` | **Spec**: `specs/009-aprobacion-admin-correo/spec.md` (`DRAFT`) | **Entrada**: `claude/inbox-feature-009.md`
**Estado**: ninguna decisión tomada. `plan.md` y `tasks.md` no se generan hasta que respondas. Cada pregunta tiene opciones y una recomendación; la recomendación no es una decisión.

---

## Parte 1 — Lo que ya existe en el código y en las specs (verificado en disco)

| Ítem | Ya existe | No existe (trabajo nuevo) |
| --- | --- | --- |
| `#18` aprobación | Registro por usuario/contraseña y SSO con Google (008, `APPROVED`, desplegado): `src/infrastructure/http/routes/google-auth.routes.ts`, `google-oidc-verify.ts`. Auditoría de cuentas (`REQ-AUD-001`). | `account_status`, estado `PENDING`/`REJECTED`, pantalla «en revisión», lista de pendientes, `STATE-ACCT9-001`. 008 lo difirió (`D8-02`, `T1200`, `STATE-ACCT8-001`). |
| `#18` correo al administrador | Nada. | `EmailSenderPort`, adaptador, proveedor, `ARGOS_EMAIL_DRIVER`. Búsqueda `EmailSender|nodemailer|smtp|ARGOS_EMAIL` en `src/`: 0 resultados. `REQ-SSO8-006` sigue diferido. |
| `#19` `/admin` | Solo el rol de hogar `ADMIN` (`REQ-RBAC-001`), no relacionado. Cookies autorizadas en la constitución 3.8.0: `argos_session` (`Strict`) y `argos_oauth` (`Lax`). | Rutas `/admin` y `/api/admin/*`, cookie de administración (exige Enmienda MINOR), identidad del administrador, alta del primer administrador, bundle propio. |
| `#19` división A/B | La mitad A (SSO con Google y vinculación) **ya es 008, `APPROVED`**. | La 009 es la mitad B; no hay nada que dividir por ese motivo. |
| `#20` parámetros | Tabla `platform_parameters` (SQLite `0011`, Postgres `0007`) con `album.max_photos_per_pet = 10`; `PlatformParameterPort` con caché <= 60 s (`cached-platform-parameter.ts`); claves de escena `scene.global_quota_max`, `scene.provider_model`, `scene.provider_location`, `scene.global_quota_used.YYYY-MM` (`src/domain/scene/provider-parameters.ts`, `src/infrastructure/config/scene-provider-parameters.ts`, `scene-global-quota.ts`); lista cerrada de 15 regiones y regex de modelo que ya admite `gemini-2.5-flash-image`, `gemini-3.1-flash-image` y `gemini-3-pro-image`; relectura por llamada solo del tope global. | UI y API de edición; interruptor `scene.enabled` y mensaje «Función deshabilitada»; **relectura en caliente de modelo y región** (hoy se leen una sola vez en `server.ts:162` y el adaptador fija la URL en el constructor, `vertex-scene-image-generator.adapter.ts:68`); `global` en la lista cerrada y host sin prefijo; prompt en BD (hoy constantes de `build-image-prompt.ts`); operación de reinicio de cuota. |
| `#20` cuota por cuenta | `home_scenes.consumed_generations`/`quota_window` y `scene_quota_carry` (`scene-use-cases.ts`). | Operación de reinicio. |
| `#57` prompt | `buildImagePrompt` (`src/domain/scene/build-image-prompt.ts`, 76 líneas), `PIXEL_REDRAW_RULE`, `sceneSpecBlock`, `PET_COUNT_RULE`. Pruebas: `tests/unit/t1071-prompt-combinado-16bit-007.spec.ts`, `t1071-hogar-sin-consentimiento-escena-007.spec.ts`, `t841-prompt-payload-escena-006.spec.ts`, `t939-prompt-inspiracion-conteo-escena-006.spec.ts`. Las dos desviaciones del inbox están **confirmadas** (`Place` antes del JSON en `scratchBlocks`; no existe el literal «Translate the pet…»; con `N = 0` se emite `PET_COUNT_RULE` sin JSON). | Reorden, bloque de preservación y decisión de `N = 0`. |
| `#60` límites | Columna `provider_call_started_at` (PG `0009`, SQLite `0013`); `evaluateAttemptLimits` (`attempt-limits.ts`: 3 fallos/24 h, 12 intentos/actor/24 h, cooldown corto); el caso de uso ya marca la llamada antes de invocar a Vertex. Defectos **confirmados**: `countFailedAttemptsByScene` y `countAttemptsByActor` no filtran por la marca en los tres repositorios; `tryConsume` de cuota global (`scene-run-use-case.ts` ~línea 151) ocurre antes de comprobar vigencia del intento (~líneas 160-165) y no se devuelve si el intento está `CANCELLED`. | Filtro en 3 repositorios, reorden/atomicidad de la cuota global. Sin migración. |

---

## Parte 2 — Preguntas

### D9-01 — Correo al administrador (`#18`) — ¿entra o se aplaza?
El inbox dice «si no es complejo ni requiere integraciones SNMP o a proveedores; si no, aplazar sin fase definida». Hoy no existe ningún envío de correo y un proveedor externo es Nivel 2 (Principio VI: solo servicios gratuitos autorizados).
- **A**: se aplaza, sin fase. El administrador ve un contador de pendientes al entrar a `/admin`. Cero dependencias y cero Nivel 2 nuevo. `REQ-APR9-006` pasa a «Diferido».
- **B**: entra con `EmailSenderPort`, adaptador real y proveedor que tú autorices, `ARGOS_EMAIL_DRIVER` (`fake` para CI), plantilla cerrada y agrupación de avisos.
- **Recomendación: A.** El proveedor es una decisión de Nivel 2 que arrastra límites de reenvío, secretos y la enmienda constitucional; no es «no complejo». Se puede reabrir como feature propia con `REQ-SSO8-006`.

### D9-02 — Identidad de `/admin` (`#19`, `needs-decision`; retoma `D8-03` y `D8-07`)
- **A**: credenciales propias (usuario y contraseña de administración, sesión propia). Más código de autenticación; sin MFA propia salvo que la añadas (posible dependencia, Nivel 2).
- **B**: SSO con Google. Es administrador quien entra con un correo de Google verificado incluido en una lista de configuración (no editable desde la UI), con **cookie de sesión de administración distinta** de la de usuarios. Reutiliza `google-oidc-verify.ts`, hereda la MFA de Google y encaja con «mi email de ARGOS es mi cuenta de admin» (`#20`, reinicio de cuota).
- **C**: tabla separada de administradores con credenciales propias, sin relación con las cuentas de usuario (el reinicio de cuota de `#20` necesitaría un vínculo adicional).
- Sub-decisión (`D8-07`): ¿puede la misma persona ser usuario y administrador con dos sesiones distintas? **Recomendación: sí.**
- **Recomendación: B.** El inbox pide «logueo independiente»: lo garantiza la cookie y la ruta propias, y evita almacenar otra contraseña. Riesgo a aceptar: la cuenta de Google del administrador pasa a ser el único factor; si prefieres factor independiente de Google, elige A y define MFA (`D9-07`).

### D9-03 — ¿`#57` y `#60` cambian contratos de 006?
Verificado: `ScenePayload` (esquema `scene-payload.schema.json` 1.0.0) no incluye el texto del prompt; `#60` no cambia rutas, códigos de error ni firmas de puertos. El cambio de `#57` toca texto normativo de `007` regla R4/`REQ-ESC7-003` y de `REQ-ESC6-016`.
- **A**: `#57` y `#60` son **solo implementación + enmienda de texto de spec** (sin bump de contrato; los contratos de 006 no se editan). Para `#20`, un indicador nuevo de «escena deshabilitada» en la respuesta de la escena sí exige **MINOR aditivo** de `home-scene.openapi.yaml` (006) y un contrato nuevo `/api/admin/*` (línea 009).
- **B**: tratar `#57` como PATCH del esquema por trazabilidad. No lo veo necesario.
- **Recomendación: A.** Nota: yo no edito `specs/00X/contracts/**` ni `src/generated/` en esta etapa; las enmiendas de contrato quedarían como tareas del plan una vez que respondas.

### D9-04 — Política de aprobación (`#18`, `needs-decision`; retoma `D8-02`)
¿Quién entra?
- **A**: toda cuenta nueva (usuario/contraseña o Google) nace `PENDING` y requiere aprobación manual; cuentas existentes `ACTIVE`.
- **B**: manual solo para registro con contraseña; Google verificado entra `ACTIVE`.
- **C**: lista de correos o dominios permitidos entra `ACTIVE`; el resto `PENDING`.
- **D**: cupo de N cuentas `ACTIVE`; después `PENDING` (N como parámetro de `/admin`).
- **E**: sin aprobación.
Sub-decisiones: (i) plazo comunicado al solicitante en «Tu solicitud está en revisión»; (ii) ¿un rechazado puede volver a solicitar y cuándo? (`EDGE-009-004`); (iii) ¿las `PENDING`/`REJECTED` caducan y se purgan? (propuesta de 008: 30 días); (iv) aprobar a un usuario ¿se le comunica? (sin correo, solo al volver a entrar).
- **Recomendación: A**, con (ii) rechazado no puede reintentar con el mismo usuario o `sub` durante 30 días, (iii) 30 días y (iv) sin aviso activo (coherente con `D9-01` = A). Es la opción que cumple el objetivo de `#18` («limitar el acceso público»).

### D9-05 — Orden de entrega y división de la 009
`#57` y `#60` son independientes de `/admin`; `#20` depende de `/admin` y de `#57` (el prompt inicial en BD debe ser el ya enmendado).
- **A**: una sola spec con entrega por fases: (1) `#60` y `#57`; (2) `#18` y `#19`; (3) `#20`.
- **B**: separar `#57` y `#60` en una feature pequeña (p. ej. 010) para salir antes.
- **Recomendación: A.** Mantiene un solo ciclo de especificación y permite que la fase 1 salga por su cuenta.

### D9-06 — Aislamiento de origen de `/admin` (`#19`, retoma `EDGE-008-026`)
Un XSS en la aplicación de usuarios, por compartir origen, podría alcanzar `/api/admin/*`.
- **A**: mismo origen, cookie propia `Strict` con `Path` acotado, CSP estricta y prueba de XSS cruzado de `/trinity`.
- **B**: origen separado (otro subdominio o dominio) para `/admin`. Más infraestructura (DNS, Cloud Run, certificado).
- **Recomendación: A** (costo 0 con un solo host `duckdns`); queda como riesgo residual aceptado y documentado.

### D9-07 — MFA, bloqueo y alta del primer administrador (`#19`)
- Alta: con `D9-02` = B, lista de correos en variable de entorno/Secret Manager (sin pasar por la interfaz); con A/C, *seed* por variable de entorno o script de `/link`.
- MFA propia: con B no (la aporta Google); con A/C, ¿obligatoria?
- Bloqueo: límite de intentos por IP efectiva (no por cuenta, para evitar denegar al único administrador). Umbrales numéricos a fijar en el plan.
- Duración de sesión: propuesta 30 min absolutos / 10 min de inactividad.
- **Recomendación**: con `D9-02` = B, alta por configuración, sin MFA propia, bloqueo por IP, 30/10 min. ¿Confirmas o cambias la duración?

### D9-08 — ¿Qué partes del prompt son editables desde `/admin`? (`#20`)
El inbox: «solo el prompt genérico (o prompts, si deben dividirse); el JSON de casos sin mascota no se modifica».
- **A**: bloques de texto genérico nombrados y editables por separado: `STYLE_BASE_TEXT`, textos de hogar (con y sin foto), bloque de preservación visual (`#57`), `PIXEL_REDRAW_RULE`, `STYLE_CLOSING`; la estructura (orden), el JSON, `IMG_n` y la frase de conteo exacto quedan en código. Validación: longitud máxima, sin marcadores de datos privados (`INV-CFG9-002`).
- **B**: un único texto base (`STYLE_BASE_TEXT`) editable; el resto fijo.
- **Recomendación: A**, porque el bloque de `#57` es la instrucción que más probablemente querrás afinar. Riesgo: editar el bloque de preservación puede romper el invariante «una vez y solo si hay foto» si se interpreta como parte del texto; por eso el invariante lo impone el código, no el texto.

### D9-09 — Modelos autorizados y costo (`#20`, Nivel 2)
La excepción de pago de Principio VI cubre «Vertex AI (Gemini Image)» con tope de 5 USD/mes y dice que no cubre otros modelos. `gemini-3-pro-image` suele costar más que `gemini-2.5-flash-image`; el cambio desde `/admin` podría superar el tope sin enmienda.
- **A**: lista cerrada de modelos autorizados por ti (p. ej. los tres nombrados en el inbox) + Enmienda constitucional MINOR que los nombre; `/admin` solo permite elegir de esa lista.
- **B**: cualquier modelo que cumpla la regex `gemini-*`.
- **Recomendación: A**, con el tope de 5 USD vigente y el tope global de `scene.global_quota_max` como freno de gasto. Confirma cuáles de los tres modelos autorizas (y si el tope de 5 USD cambia).

### D9-10 — Alcance del reinicio de cuota (`#20`)
«Resetear la cuota de imágenes generadas por todas las cuentas que sean admin»; el ejemplo es tu propio contador.
- **A**: reinicia solo el contador por propietario (`consumed_generations` de las escenas y `scene_quota_carry`) de las cuentas de usuario que corresponden a administradores (vinculadas por correo verificado, `D9-02`).
- **B**: además permite reiniciar el contador global mensual `scene.global_quota_used.YYYY-MM`.
- **Recomendación: A.** El contador global protege el gasto y el inbox no lo pide. Si necesitas probar con la cuota global agotada, usa el ajuste de `scene.global_quota_max`.

### D9-11 — `#60`: cooldown e intentos en vuelo
Verificado: el cooldown de `evaluateAttemptLimits` cuenta todo intento. El inbox lo deja a la spec.
- **Cooldown**: A mantener para todos los intentos (acota el abuso sin costo de Vertex, `EDGE-009-030`); B contar solo intentos con llamada.
- **Intentos en vuelo sin marca** (`outcome IS NULL`, `provider_call_started_at IS NULL`): A cuentan para `ACTOR_LIMIT` mientras estén activos (evitan concurrencia); B no cuentan.
- **Recomendación**: cooldown A, en vuelo A.

### D9-12 — «Campos adicionales» que podrían vivir en BD (`#20`)
El inbox permite sugerirlos sin saturar `/admin`. Candidatos que hoy son código: `scene.global_quota_max` (ya vive en BD, solo falta exponerlo), cuota por propietario `QUOTA_MAX`, `MAX_FAILED_ATTEMPTS_PER_SCENE`, `MAX_STARTED_ATTEMPTS_PER_ACTOR`, cooldown, máximo de mascotas por escena.
- **A**: solo los del inbox más `scene.global_quota_max` (ya está en BD, protege el gasto).
- **B**: añadir también los límites de intentos y la cuota por propietario.
- **Recomendación: A.** No agregué ningún campo extra a la spec.

### D9-13 — `#57`: frase con `N = 0`
- **A**: frase directa «Draw no animals in this room.» sin referencia al JSON.
- **B**: incluir `{"renderedPetsCount":0,"pets":[]}`.
- **Recomendación: A**: respeta la regla R1 de 007 (el JSON solo existe si hay mascotas sin foto). `PET_COUNT_RULE` queda para modos incrementales, que sí llevan JSON.

### D9-14 — `#57`/`#20`: posición del bloque en modos incrementales y rango del tope de fotos (`D8-08`)
- Bloque de preservación en incrementales: **A** inmediatamente antes de `PIXEL_REDRAW_RULE`; **B** después de la lista de cambios. Recomendación: A (misma posición relativa que en `FROM_SCRATCH`, punto 4 antes del 8).
- Rango del tope de fotos: **A** 1..50 (catálogo de 005 y propuesta de 008); **B** otro rango. Recomendación: A.

### D9-15 — Deudas de 008 que dependen de la 009
`DEUDA-008-GOOGLE-ACCOUNT-DELETE` (eliminar la cuenta nacida con Google, sin contraseña, `T1130`): 008 declaró que su **cierre es obligatorio en la 009 antes de abrirla a usuarios reales**. No está en el inbox, por eso no lo agregué como requisito.
- **A**: se incorpora a la 009 como requisito explícito (y se retira el aviso del perfil).
- **B**: se gestiona por fuera, con soporte manual (Ley 1581 de 2012), y la 009 no se abre a usuarios reales hasta cerrarlo.
- **Recomendación: A.** También siguen diferidos, sin cambio: registro con correo verificado (`REQ-SSO8-002/006`), desvincular (`REQ-VIN8-005`) y vinculación en dos pasos.

### D9-16 — Comportamiento al deshabilitar la escena con una generación en curso (`#20`)
- **A**: la generación ya iniciada termina y publica su imagen; solo se bloquean las nuevas.
- **B**: la generación en curso se cancela sin consumir cuota.
- **Recomendación: A** (menos estados y coherente con `REQ-ESC6-012`). El inbox pide «bloquear durante la salida a público». Confirma también si el mensaje «Función deshabilitada» aparece en el panel de escena actual o en otro lugar.

---

## Parte 3 — Observaciones del Architect (no son preguntas)
1. **`#20` «en caliente»** no es solo UI: modelo y región se leen una vez al arrancar; hay que hacer relectura por solicitud (techo de 60 s).
2. **`#20` y `#57`**: la semilla del prompt en BD debe ser el texto posterior a `#57`; por eso `#57` va primero (`D9-05`).
3. **`#60` cuota global**: la unidad se descuenta antes de comprobar la vigencia del intento; la spec exige el resultado (`INV-LIM9-002`) y deja el mecanismo al plan (verificar antes, atomizar consumo+marca, o devolver la unidad).
4. **Constitución**: la 009 exige enmienda MINOR (cookie de administración; modelos autorizados `D9-09`; proveedor de correo si `D9-01` = B). Ninguna se firma sin ti.
5. **`needs-decision`** de `#18` y `#19`: cubierto por `D9-04` y `D9-02`/`D9-06`/`D9-07`.

## Parte 4 — Preguntas nuevas tras el acta `/lock` (T1204, 2026-11-23)

Contexto: `D9-17` = A, `D9-18` (aprobado), `D9-19` y `D9-20` ya están decididas y reflejadas en `spec.md`, `plan.md` y `tasks.md`. Las siguientes salen de `.specify/memory/audits/lock-009-edge.md`; ninguna se da por aprobada. Las tareas `[HUM]` correspondientes son `T1278` (todas) y `T1255`/`T1225` (enmiendas).

### D9-21 — Tope de 5 USD/mes con varios modelos (LCK-02, ALTO; `EDGE-009-036`) — **resuelta por Neo: A corregida**
`scene.global_quota_max` cuenta imágenes, no dólares; `gemini-3-pro-image` suele costar más. **Corrección aplicada tras el acta `/merovingian` (MER-02, MER-04, MER-05)**: la regla «`max × coste del modelo nuevo` ≤ 5 USD» no garantiza el tope con varios modelos (contraejemplo: 20 imágenes Pro = 4,80 USD, luego modelo rápido con `max = 125` pasa la regla y el gasto posible es ≈ 9,00 USD; cifras `[verificar]` de 006). Opciones: **A** regla de **gasto acumulado del mes** `gastoAcumuladoMes + (max − usadas) × coste(modelo, región nuevos) ≤ 5 USD`, coste indexado por **modelo × región** en `app-config.ts` y techo de `scene.global_quota_max` derivado de la tabla (`floor(5 / coste mínimo)`; hoy el techo de código es 1000, ≈ 40 USD con el modelo rápido) y rechazo en `/admin` con resultado previo al guardado (`EDGE-009-036` reescrita, `SC-009-051`); **B** solo aviso sin rechazo; **C** fijar un único modelo. **Recomendación: A corregida.** Los valores unitarios los toma Neo de la tarifa oficial al firmar la Enmienda 009-B (`T1301`; no se inventan). Bloquea `T1292`, `T1296`, `T1300` y la Fase 5.

### D9-22 — Trazabilidad de modelo y región por intento (LCK-11; `EDGE-009-045`) — **resuelta por Neo: A**
**A** columna nueva por intento (modelo y ubicación; migración de Nivel 2, fuera de `SC-009-041`); **B** registrar modelo y región en `admin_audit_entries` al cambiar la configuración, sin migración (cota conservadora por intervalos); **C** no trazar. **Recomendación revisada: A.** Con la corrección de MER-02 la regla de gasto acumulado de `D9-21` necesita el modelo y la región de cada llamada; el registro de auditoría registra acciones de administración, no llamadas al proveedor, y por intervalos de configuración solo se obtiene una cota conservadora (la recomendación anterior era B). Si Neo elige B, `EDGE-009-036` usa el coste máximo de los pares usados en el mes. Bloquea `T1295` y `T1298`.

### D9-23 — Dictamen de `/rama` para `global` (LCK-12; `EDGE-009-046`) — **resuelta por Neo: A**
Con `global` las fotos pueden procesarse fuera de la región elegida. **A** `global` no aparece en la lista hasta que `/rama` registre dictamen (`T1294`); **B** aparece con aviso previo y sin dictamen. **Recomendación: A** (Principio VI y Ley 1581; el costo es posponer `global` sin afectar las otras regiones). Bloquea `T1294`/`T1296`.

### D9-24 — Eliminar la cuenta propietaria de un hogar con miembros `ACTIVE` (LCK-15; `EDGE-009-049`) — **resuelta por Neo: A**
**A** rechazar el borrado con mensaje que lista los hogares afectados (el propietario debe transferir o salir antes); **B** transferir la propiedad automáticamente según la regla de 008. **Recomendación: A** (no decide por otros usuarios ni inventa una regla de propiedad que 008 no define para el borrado). Debe verificarse la cascada real de `REQ-ACC-002` (`T1284`). Bloquea `T1284` y `T1130`.

### D9-25 — Firma de los números de límites (LCK-01 ALTO, LCK-06, LCK-09; `ADR-009-15`) — **resuelta por Neo: aprobado tal cual**
Propuesta de `/lock`, no del acta de Neo: **10 fallos / 15 min por IP efectiva** en el flujo de Google de `/admin`; **5 registros nuevos / 24 h por IP efectiva** y aviso del contador a 50 pendientes; **20 intentos sin llamada / 24 h por escena**. Para el tercero, alternativa: solo cooldown de 60 s, firmado como riesgo aceptado. **Recomendación: aprobar los tres tal cual** (valores solo en `app-config.ts`, cambiables sin tocar pruebas). Bloquea `T1285`, `T1288`, `T1279`.

### D9-26 — Enmienda documental de 007 (LCK-16; `REQ-PRO9-007`) — **resuelta por Neo: A**
`007` está `APPROVED` (firma de Neo 2026-11-19); `T1212` pide cambiar su regla R4 y `REQ-ESC7-003`. **A** firmar la enmienda versionada de 007 (nota de versión + referencia a 009); **B** no tocar 007 y documentar la diferencia como excepción en 009. **Recomendación: A.** La spec 009 no aplica el cambio; solo registra la nota. Bloquea únicamente `T1212`.

## Parte 5 — Preguntas tras las actas `/mifune` y `/merovingian` (T1205, 2026-11-23)

Contexto: ya están aplicados en `spec.md`, `plan.md` y `tasks.md` los cambios sin decisión de Neo (MIF-02, 03, 05, 06, 08, 09, 10; MER-01, 03, 04, 05, 06, 08, 09, 10 como declaración o propuesta). `D9-21` y `D9-22` siguen abiertas con la corrección de MER-02/MER-04 aplicada (Parte 4). Lo siguiente queda sin decidir, con recomendación del Architect (no es una decisión). `MER-11` (árbol git con cambios ajenos a 009) solo se reporta a Morpheus.

### P5-01 — MIF-01 / `EDGE-009-042`: una sola vía de cuota o reconciliación (Neo) — **resuelta por Neo: B**
Hoy el plan conserva la vía (b), reconciliación periódica (`T1282`), y el plazo `lease_expires_at` o 10 min de `EDGE-009-041`. `/mifune` propone: mantener el orden `tryConsume` → marca → `refund`, plazo fijo único de 10 min y aceptar la caída entre pasos como **sobreconteo conservador**; eso exige reformular `EDGE-009-042` como «sobreconteo aceptado». **A** mantener (b) y el doble plazo; **B** simplificar. **Recomendación: B**, con una precisión que el acta de `/mifune` omite: el reinicio de cuota de `REQ-CFG9-006` solo toca los contadores de cuentas administradoras y **no** el global, de modo que el sobreconteo del contador global solo se recupera subiendo `scene.global_quota_max`; el sobreconteo es seguro para el coste (conservador) y acotado a una caída entre dos pasos. `T1210` debe confirmar antes en `src/` si `tryConsume` y la marca comparten transacción (si la comparten, no hay problema que reconciliar).

### P5-02 — MIF-04 / `REQ-CFG9-004`: lista de 3 modelos en `app-config.ts` o en enmienda constitucional (Neo) — **resuelta por Neo: A**
**A** mantener `REQ-CFG9-004` y la Enmienda 009-B; **B** la lista vive en `app-config.ts` y la Constitución solo cambia si cambia el tope de 5 USD. **Recomendación: A**: la excepción 006 (d) dice que no cubre «ningún otro modelo» y `/merovingian` (§4.4) confirma que 009-B es necesaria; además la enmienda es el sitio natural para firmar los costes con fuente (MER-03). Con B se pierde esa firma. En ambos casos 5a no depende de la decisión; solo 5b.

### P5-03 — MER-07 / `D9-26`: enmienda versionada de 007 (Neo) — **resuelta por Neo: A**
`REQ-PRO9-007` rompe `SC-007-043`, `SC-007-035` y cuatro pruebas (R4 de 007 es normativo byte a byte). `T1212` queda **bloqueada hasta la firma** (también `T1213` y `T1215` por dependencia, y con ellas el cierre de `#57` en la Fase 1). **A** enmienda versionada de 007 con actualización de las pruebas en la misma tarea (nunca relajarlas); **B** excepción documentada, que deja pruebas de 007 en rojo permanente y `verify-traceability.sh --feature 007` sin pasar. **Recomendación: A.**

### P5-04 — MER-08: región `global` y la 006 (Neo) — **resuelta por Neo: A**
`global` cambia la lista cerrada de `REQ-ESC6-017/031` de la 006. **A** enmienda versionada de 006 (`T1299`) coordinada con 009-B; **B** cambio de configuración aprobado por 009-B sin tocar el texto de 006. Se suma a `D9-23` (dictamen de `/rama`) y a la tarifa propia de `global` (MER-04). **Recomendación: A**, porque la lista cerrada es texto normativo de 006 y B deja la 006 desactualizada.

### P5-05 — MIF-06 contra `REQ-DEL9-001`: ubicación de las dos operaciones de usuario del borrado (Neo) — **resuelta por Neo: A**
`/mifune` limita los contratos de 009 a `error-catalog.json`, `state-machines/` y `openapi/admin.openapi.yaml` de `/api/admin`. Las operaciones de reautenticación y de borrado de `T1217` son de la **API de usuarios**, no de `/api/admin`, y `REQ-DEL9-001` dice que no se edita `deleteAccount` de 004. **A** incluirlas como un segundo grupo de rutas en el mismo único archivo OpenAPI de 009 (sin crear otro); **B** añadirlas como operaciones nuevas dentro de la enmienda MINOR de 004 (`T1241`), lo que obliga a reformular esa frase de `REQ-DEL9-001`. **Recomendación: A.** `T1217` queda redactado para A hasta que respondas.

### P5-06 — MIF-10 contra MER-05: `scene.global_quota_max` dentro de 5a (Neo) — **resuelta por Neo: B**
`/mifune` incluye `scene.global_quota_max` en 5a y `/merovingian` muestra que su techo actual (1000) permite ≈ 40 USD con el modelo rápido. **A** mantenerlo en 5a **condicionado** a `T1300`, `T1301` y `T1296` (regla de coste y techo derivado antes de exponer el campo; es lo aplicado en `tasks.md`); **B** moverlo a 5b y dejar 5a solo con tope de fotos, `scene.enabled` y reinicio de cuota. **Recomendación: A** si `T1301` obtiene al menos el coste del modelo sembrado; si no, B.

## Resoluciones de Neo (2026-11-23) asentadas por `/architect`
`D9-21` = A corregida, `D9-22` = A, `D9-23` = A, `D9-24` = A, `D9-25` aprobado, `D9-26` = A, `P5-01` = B, `P5-02` = A, `P5-03` = A, `P5-04` = A, `P5-05` = A, `P5-06` = B (vinculantes). Quedan reflejadas en `spec.md` (tabla «Decisiones firmadas por Neo»), `plan.md` (`ADR-009-01`, `ADR-009-15`, `ADR-009-16`, Enmienda 009-B) y `tasks.md` (`T1212` desbloqueada; `scene.global_quota_max`, `T1300`, `T1301`, `T1292` y `T1296` pasan a 5b). Ninguna cifra de coste se inventó: la tabla con fuente oficial llega con `T1301` y se firma anexa a 009-B. `MER-11` (cambios ajenos en el árbol): no se tocan ni se commitean.

FROM: Architect
TO: Neo (Andrés Vallejo — Level 2)
STATUS: Validation Required
DETAILS: 16 preguntas abiertas (`D9-01..D9-16`) en este archivo; spec `DRAFT` en `specs/009-aprobacion-admin-correo/spec.md`.
RECOMMENDED NEXT STEP: Responder `D9-01..D9-16` (basta «recomendaciones del Architect» o la letra por pregunta; las de Nivel 2 son D9-01, D9-02, D9-04, D9-09 y D9-15); después se genera `plan.md` y `tasks.md`.

Actualización 2026-11-23 (acta /lock T1204): añadida la Parte 4 con `D9-21..D9-26`.

Actualización 2026-11-23 (actas /mifune y /merovingian, T1205): corregidas `D9-21` y `D9-22` (MER-02/04/05) y añadida la Parte 5 (`P5-01..P5-06`).

Actualización 2026-11-23 (resoluciones de Neo): Partes 4 y 5 marcadas «resuelta por Neo»; spec, plan y tasks reconciliados.
