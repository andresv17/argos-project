# Acta /mifune — Auditoría KISS del plan de Feature 009 (T1205, parte /mifune)

- **Fecha**: 2026-11-23
- **Autor**: Mifune (subagente, modelo haiku)
- **Objeto**: `specs/009-aprobacion-admin-correo/plan.md` (66 líneas, 16 ADR, 2 enmiendas `[N2]`), contrastado con `spec.md` (53 REQ, 49 EDGE, 50 SC, 15 INV) y `tasks.md` (99 tareas: F0 7, F1 15, F2 9, F3 19, F4 18, F5 26, cierre 5).
- **Referencia de nivel de detalle**: `specs/008-sso-portal-roles/plan.md` (15 ADR, `APPROVED`).
- **Restricciones respetadas**: no se revierten `D9-17 = A`, `D9-18` aprobado, `D9-19/20` confirmados ni el orden F1–F5. No se tocan `spec.md`, `plan.md` ni `tasks.md`. No hay `[x]`, commit ni push.

## Veredicto: **PASS CON CAMBIOS**

El plan es coherente con la spec y ninguno de los hallazgos exige rehacer la arquitectura. La complejidad se concentra en tres sitios: dos mecanismos de compensación para una misma invariante de cuota, tres puertos que leen la misma tabla de parámetros y una capa de dominio casi vacía. Con los cambios de MIF-01 a MIF-03 el plan baja de complejidad sin perder cobertura.

## Conteo por severidad

| Severidad | Número | Hallazgos |
| --- | --- | --- |
| ALTO | 2 | MIF-01, MIF-02 |
| MEDIO | 4 | MIF-03, MIF-04, MIF-05, MIF-06 |
| BAJO | 4 | MIF-07, MIF-08, MIF-09, MIF-10 |

---

## Hallazgos priorizados

### MIF-01 — ALTO — Tres mecanismos para la misma invariante de cuota
- **Dónde**: ADR-009-01 (compensación con `refund`), ADR-009-16 punto (1) (reconciliación periódica en mantenimiento) y ADR-009-16 punto (2) (plazo por `lease_expires_at` o 10 min).
- **Problema**: la regla «un intento sin llamada real no consume cuota» se implementa con tres vías distintas. El punto (1) de ADR-016 además admite la vía (a) con transacción cruzada, lo que deja el diseño abierto a dos caminos. Es el mayor coste de implementación de F1 y se ha ido acumulando en el acta de `/lock`.
- **Propuesta concreta**:
  1. Mantener el orden de ADR-009-01 tal cual: verificar, `tryConsume`, marcar y reverificar, y `refund` si la marca falla.
  2. Sustituir el plazo de `lease_expires_at` del punto (2) por un único plazo fijo de 10 min para intentos sin marca. Un solo número, sin dos fuentes de tiempo.
  3. Decidir el punto (1) con una sola regla. Si `T1210` confirma que `tryConsume` y la marca no comparten transacción, la reconciliación periódica es la única vía que cubre la caída entre pasos. Alternativa más simple: aceptar esa caída como sobreconteo conservador documentado, que ADR-016 punto (7) ya acepta.
- **Cobertura**: si se elimina la reconciliación, `EDGE-009-042` queda sin soporte. Para mantener la cobertura sin esa vía, Neo debe reformular `EDGE-009-042` como «sobreconteo aceptado y recuperable con `reinicio de cuota`». Esta reformulación es una decisión de Neo, no del Architect. Sin esa firma, se conserva la vía (b).
- **Prueba asociada**: `INV-LIM9-002` y `REQ-LIM9-003` no cambian.

### MIF-02 — ALTO — Tres piezas para leer la misma tabla de parámetros
- **Dónde**: `ScenePromptTextsPort`, `SceneProviderParametersPort` (relectura) y `cached-platform-parameter.ts` (caché de 60 s), en la tabla de ADR-009-11, ADR-009-12 y la fila `application` de la topología.
- **Problema**: `platform_parameters` se lee por tres caminos y cada uno tiene su propio puerto. Es una capa redundante, y `scene.enabled`, modelo, región, cuota y textos se leen desde puertos distintos con distinta caché.
- **Propuesta concreta**: un solo `PlatformParametersPort` con lectura en caché (≤ 60 s) que devuelve el bloque completo de escena: `scene.enabled`, modelo, región, `scene.global_quota_max` y textos del prompt. `RunSceneGenerationUseCase` y el adaptador Vertex consumen ese bloque. `GlobalSceneQuotaPort.refund` se mantiene porque es otra responsabilidad (cuota).
- **Cobertura**: `REQ-CFG9-002`, `INV-CFG9-001` y `INV-CFG9-003` se cumplen igual. La validación anti-SSRF se mantiene en el adaptador y en la lectura.

### MIF-03 — MEDIO — Capas de dominio casi vacías
- **Dónde**: topología, filas `domain/account (nuevo)` y `domain/admin (nuevo)`.
- **Problema**: `domain/account` contiene una máquina de 3 estados con 2 transiciones, y `domain/admin` contiene una lista cerrada de correos y reglas de sesión que son de configuración. Crear dos módulos de dominio para eso supera lo necesario.
- **Propuesta concreta**: un único archivo `src/domain/account/account-status.ts` con el tipo `ACTIVE | PENDING | REJECTED` y la función de transición `PENDING → ACTIVE | REJECTED`. La lista de administradores se lee de `app-config.ts` dentro del caso de uso `adminGoogleLogin`, sin tipo de valor propio. `STATE-ACCT9-001` se conserva en `contracts/state-machines/`.
- **Cobertura**: `REQ-APR9-001`, `REQ-APR9-003` e `INV-ADM9-001` siguen con soporte. No se pierde ningún REQ, EDGE ni SC.

### MIF-04 — MEDIO — Enmienda 009-B con la lista de modelos dentro de la Constitución
- **Dónde**: Constitution Check, enmienda 009-B (`T1254`), y `REQ-CFG9-004` («nombrados en una Enmienda constitucional MINOR de Principio VI»).
- **Problema**: la lista cerrada de tres modelos es un valor de configuración, no un principio. Meterla en la Constitución crea una enmienda de Nivel 2 que bloquea la modelo y región de F5 (`T1254`).
- **Propuesta concreta**: la lista de tres modelos y la lista de regiones viven en `app-config.ts` junto con la regex existente. La Constitución solo debe cambiar si se modifica el tope de gasto de 5 USD/mes. **Pregunta para Neo**: ¿se mantiene `REQ-CFG9-004` tal cual o se reformula «nombrados en configuración y validados en tres puntos»? Esta es una decisión de Neo (`D9-09` = A), no una reversión que haga Mifune.
- **Cobertura**: si Neo acepta la reformulación, `REQ-CFG9-004` y `INV-CFG9-001` siguen con soporte; se pierde solo la enmienda constitucional de 009-B. Sin firma de Neo, se mantiene la enmienda.

### MIF-05 — MEDIO — Editor del prompt con validación más pesada de la necesaria
- **Dónde**: ADR-009-12 (bloques nombrados sembrados, lista cerrada de marcadores, validación de ids, nombres y biografía, e invariante de una aparición del bloque de preservación).
- **Problema**: la lista cerrada de marcadores y la validación de ids y biografía añaden reglas que el código ya impone al construir el prompt (`buildImagePrompt` es pura y determinista). Duplicar esas reglas en validación de entrada es redundante.
- **Propuesta concreta**: guardar los bloques como un único valor JSON en una fila (`scene.prompt.blocks`), con longitud máxima por bloque y rechazo de cualquier marcador que `buildImagePrompt` no reconozca. La validación de estructura queda en `buildImagePrompt`, que ya es la fuente de verdad. `T1261` solo enumera la lista de marcadores permitidos.
- **Cobertura**: `REQ-CFG9-005`, `INV-CFG9-002`, `INV-PRO9-001` y `EDGE-009-020` se cubren con la misma validación más la del código.

### MIF-06 — MEDIO — Contratos y scripts de 009 más amplios de lo que exige el verificador
- **Dónde**: «Estructura de archivos previstos» (`contracts/{openapi,schemas,state-machines,errors}/` y cambios en `scripts/compile-contracts.sh` y `scripts/verify-traceability.sh`), que son cambios de Nivel 2.
- **Problema**: se crean cuatro subcarpetas y se modifican dos scripts de verificación para un paquete que, según la spec, tiene pocos contratos nuevos (`/api/admin/*`, la máquina de estados y el catálogo de errores). Eso multiplica los cambios de Principio VI sin beneficio.
- **Propuesta concreta**: crear en `contracts/` solo lo que el verificador exige (`error-catalog.json` y `state-machines/`) más un único `openapi/admin.openapi.yaml` para `/api/admin/*`. No crear `schemas/` hasta que haya un schema reutilizado. Añadir la entrada `--feature 009` al script solo una vez y con el mínimo de cambios.
- **Cobertura**: ningún REQ ni SC pierde soporte, porque el verificador sigue encontrando los mismos artefactos.

### MIF-07 — BAJO — Indicador MINOR en el contrato 006 para `scene.enabled`
- **Dónde**: ADR-009-14 y `D9-03` (indicador aditivo de `home-scene.openapi.yaml`, MINOR).
- **Problema**: antes de subir la versión del contrato 006, conviene comprobar si ya existe un estado de escena no disponible que cubra «Función deshabilitada» sin cambio de esquema.
- **Propuesta concreta**: `T1254` o el `[ARCH]` de F5 verifica primero el contrato 006 vigente. Si ya existe un estado o código de error que sirva, no hace falta MINOR. Si no existe, se mantiene el MINOR aditivo de `D9-03`.
- **Cobertura**: `REQ-CFG9-003` se cubre en ambos casos.

### MIF-08 — BAJO — ADR-009-16 es un cajón de decisiones de tareas
- **Dónde**: ADR-009-16, con diez puntos de decisiones técnicas que no son decisiones de arquitectura.
- **Problema**: ADR-016 mezcla decisiones que afectan a la topología (puntos 1 y 2) con notas de implementación (puntos 5, 9 y 10). Esto dificulta encontrar las ADR que sostienen la arquitectura.
- **Propuesta concreta**: dejar en ADR-016 solo los puntos 1, 2 y 7. Trasladar los puntos 5, 9 y 10 como notas a `T1261`, `T1269` y `T1239` (ya existen en `tasks.md`).
- **Cobertura**: sin pérdida de REQ, EDGE ni SC. Solo cambia dónde vive cada nota.

### MIF-09 — BAJO — Una tarea de arnés codificada como ADR y dos ADR del mismo asunto
- **Dónde**: ADR-009-10 (migración del arnés de pruebas, ≈18 archivos) y ADR-009-01 con ADR-009-02 (ambas sobre el conteo de intentos de `#60`).
- **Problema**: ADR-010 describe una tarea, no una decisión. ADR-01 y ADR-02 son dos caras de la misma regla de conteo de `#60`.
- **Propuesta concreta**: trasladar ADR-010 a una tarea previa de F4 (ya cubierta por `H-8-02` en la spec). Fusionar ADR-01 y ADR-02 en una sola ADR de «conteo de `#60`». Resultado: 14 ADR en lugar de 16, cifra cercana a las 15 de 008.
- **Cobertura**: `REQ-LIM9-001/002/003`, `EDGE-009-029` y `SC-009-041` siguen soportados.

### MIF-10 — BAJO — Fase 5 con 26 tareas y dos bloqueos externos mezclados
- **Dónde**: `tasks.md`, Fase 5 (26 tareas), que depende de la Enmienda 009-B y del contrato 006 (MIF-04 y MIF-07).
- **Problema**: la Enmienda 009-B bloquea la lectura de modelo y región, aunque el tope de fotos, `scene.enabled` y la cuota global no dependen de ella. Un único bloque bloquea todo F5.
- **Propuesta concreta**: subdividir F5 en 5a (tope de fotos, `scene.enabled`, `scene.global_quota_max`, reinicio de cuota) y 5b (modelo, región y editor de prompt, con la enmienda 009-B). El orden F1–F5 no cambia; 5a y 5b quedan dentro de F5, en ese orden.
- **Cobertura**: sin pérdida de REQ, EDGE ni SC. Solo cambia la granularidad de entrega dentro de F5.

---

## No recortar (decisiones que Mifune confirma como necesarias)

- **ADR-009-05 y ADR-009-06** (OIDC de administración propio, cookie `argos_admin_session` con `Path=/api/admin`, flujo `argos_admin_oauth` y tabla `admin_oauth_flow_states`): la separación es el objetivo de `#19` (`INV-ADM9-002`). Reutilizar `argos_oauth` obligaría a alterar el `CHECK` de 008 y viola la regla de no tocar lo ya desplegado.
- **ADR-009-07** (`404` uniforme de `/api/admin/*`): cierra `EDGE-009-008` y no admite alternativa más simple.
- **ADR-009-08** (`admin_audit_entries` propia): evita cambiar `AuditEntityType`, que es contrato de 002/004.
- **ADR-009-04** (reautenticación con Google para el borrado): `D9-17 = A`, ya firmado.
- **ADR-009-09** (estados explícitos `PENDING`/`ACTIVE`/`REJECTED`): `D9-04 = A`.
- **ADR-009-13** (reinicio de cuota sin tocar `scene.global_quota_used`): `D9-10` y `REQ-CFG9-006`.
- **ADR-009-14** (`scene.enabled` no cancela la generación en curso): `D9-16 = A`.
- **Bundle `/admin` con entrada Vite propia y CSP estricta**: `D9-06 = A` y `REQ-ADM9-005`. Un segundo `html` de entrada en Vite es coste bajo.
- **Cuatro tablas nuevas de administración** (`admin_identities`, `admin_sessions`, `admin_oauth_flow_states`, `admin_audit_entries`): cada una responde a un REQ distinto. Se conservan.

## Resumen de cobertura

Ningún cambio propuesto elimina REQ, EDGE ni SC. Hay una excepción condicionada: si Neo no firma la reformulación de `EDGE-009-042` (MIF-01), la vía (b) de reconciliación debe conservarse; y si Neo no acepta reformular `REQ-CFG9-004` (MIF-04), la enmienda 009-B se mantiene. Ambas son decisiones de Neo, no reversiones de Mifune.

## Pasos recomendados (en orden)

1. Morpheus pide a `/architect` que aplique MIF-02, MIF-03, MIF-05, MIF-06, MIF-08 y MIF-09 (cambios de plan sin decisión de Neo).
2. Neo decide MIF-01 (reformulación de `EDGE-009-042`) y MIF-04 (reformulación de `REQ-CFG9-004`).
3. `/architect` aplica MIF-10 en `tasks.md` tras la decisión de Neo sobre MIF-04.
4. `/keymaker` no empieza F1 hasta que `/architect` cierre los puntos 1 y 2 de MIF-01.
