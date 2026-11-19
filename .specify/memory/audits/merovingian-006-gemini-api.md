# Merovingian 006 — Adaptador GeminiApiSceneImageGenerator (Gemini Developer API)

Fecha: 2026-11-18. Rama 006-escena-hogar-pixel-art. Solo lectura de repo; sin red, sin claves.
Nota: no se escribió en claude/log-merovingian.md ni en el bus por la restricción de solo lectura del encargo; el orquestador debe registrarlo.

## Veredicto: BLOQUEADO para producción; PASS CON CONDICIONES solo como driver de desarrollo local acotado

El plan contradice decisiones firmadas por Neo (D6-01 = A Vertex; REQ-ESC6-028 excluye expresamente la Developer API). Como herramienta local de prueba manual (fuera de CI, fuera de producción) es viable con las condiciones de abajo.

## (a) Principio VI y excepción (constitution.md 3.6.0)
- Línea 192: solo servicios gratuitos; cualquier opción de pago requiere autorización nueva, salvo la excepción acotada 006 (línea 194).
- La excepción nombra únicamente "el adaptador de Google Vertex AI (Gemini Image)" y (d) dice: no cubre otro servicio, modelo ni proveedor de pago. `generativelanguage.googleapis.com` es otra superficie (research.md:26; REQ-ESC6-028: "la API pública de Gemini no equivale a Vertex"). Hoy el egreso a este proveedor NO está permitido.
- Enmienda necesaria (MINOR, Nivel 2, Neo): ampliar la excepción a un segundo proveedor/superficie (o sustituir D6-01), con tope propio dentro del mismo 5 USD/mes. Debe documentar además: `fetch` nativo (sin npm nuevo, sin autorización de dependencia), y la clave API como credencial nueva (REQ-ESC6-017: credencial en Secret Manager, REQ-IAC-005). Cambiar D6-01 exige decisión firmada de Neo; los términos de datos (retención, entrenamiento, borrado, región, SLA) de la Developer API deben documentarse con fuente en research.md (REQ-ESC6-028 / SC-ESC6-043), hoy "no verificado".
- Alternativa sin enmienda: uso local solo con datos sintéticos (sin PII ni fotos reales), llamada manual de Neo con su propia clave, no desplegable, no en CI. Aun así, el gasto de pago personal queda fuera de la excepción: Neo debe aceptarlo expresamente.

## (b) Egreso de PII
Condicionantes (todos aplican a cualquier proveedor externo, no solo a Vertex):
- REQ-ESC6-021: el envío de fotos a una IA externa es tratamiento de datos personales (C1..C11); exige consentimiento (023), consentimiento del propietario (024), retiro (025) y aviso (026) previos a la primera generación y tras cambio de proveedor.
- REQ-ESC6-023: `SceneConsent` ligado a `providerId` y `noticeVersion`; cambiar de proveedor reexige consentimiento. `SCENE_PROVIDER_ID = 'vertex-gemini-image'` (src/domain/scene/notice.ts:9) debe cambiar o añadirse un id nuevo, y el aviso debe nombrar al proveedor, región, retención (REQ-ESC6-026, SC-ESC6-040; texto firmado por Neo pendiente).
- INV-ESC6-014: sin consentimiento vigente, 0 llamadas al generador (SC-ESC6-035); imágenes ajenas solo con consentimiento de su propietario (REQ-ESC6-024).
- INV-ESC6-010 (mínimo necesario: sin nombres, microchip, correo, fecha de nacimiento, datos clínicos), INV-ESC6-015 + REQ-ESC6-027 (sin EXIF/GPS/ICC, redimensionado; N2-01 = A obligatorio antes del driver real, SC-ESC6-042 pendiente en T885), EDGE-ESC6-023 (personas fortuitas).
- REQ-ESC6-028 / SC-ESC6-043: contrato del proveedor con fuente; con Developer API gratuita/sin facturación suele haber uso de datos para mejora de producto: debe verificarse con fuente (no verificado aquí).
- REQ-ESC6-021 (C8): sin cuerpo de error del proveedor, sin prompt ni texto del filtro de seguridad en logs.
- D6-01 (Vertex, firmada) y D6-12 (5 USD/mes): cambiar proveedor modifica ambas decisiones.

## (c) Riesgo de la clave
- .gitignore líneas 7-9: `.env`, `.env.*`, `!.env.example`; verificado con `git check-ignore`: `.env` y `.env.local` ignorados, `.env` no versionado. `.env.example` ver comprobación al final del informe (no ignorado = correcto).
- Fuga posible:
  1. `cloud-logging.ts` `redactSecrets` solo cubre postgres URL, `X-Goog-*` (patrón `X-Goog-[A-Za-z0-9-]*\s*[=:]`), claves de objeto, microchip. `x-goog-api-key` coincide con el patrón `X-Goog-` (insensible a mayúsculas) en forma `cabecera: valor`, pero NO una clave pasada por query `?key=AIza...` ni la clave sola en un mensaje. Condición: añadir patrón `AIza[0-9A-Za-z_-]{35}` y redacción del valor exacto de la clave (como se hace con DATABASE_URL).
  2. Mensajes de error de `fetch` / objeto de error con `request headers` o `cause`; el adaptador no debe adjuntar request/headers/url a errores (REQ-ESC6-021 ya prohíbe el cuerpo de error).
  3. Volcados de config/env en arranque o en errores de validación de app-config.ts; `SensitiveFields` de logging no incluye `x-goog-api-key`, `authorization`; añadirlos.
  4. Usar SOLO header `x-goog-api-key`, nunca `?key=` (queda en URLs de logs, trazas, proxies).
  5. Trazas Playwright MCP (.playwright-mcp/ aparece sin seguimiento en git status): no pegar la clave en navegador/herramientas; revisar que no se versione.
  6. Producción: la clave solo en Secret Manager (REQ-IAC-005, terraform/secret_manager.tf; hoy no existe tal secreto, y no hay variable en .env.example); localmente solo en `.env` ignorado. Nunca en chat, commits, fixtures de prueba ni snapshots.
- Recomendado: prueba de seguridad que inyecte una clave sintética y verifique 0 apariciones en logs/auditoría/errores/AttemptErrorCode.

## (d) Cobro
- terraform/budget.tf: presupuesto 5 USD eq. (22500 COP) con alertas 50/90/100 %, filtrado por PROYECTO (`projects/<number>`). Solo AVISA, no detiene el gasto (comentario del propio archivo). Una clave de la Developer API ligada a un proyecto de ese mismo proyecto GCP sí sumaría; una clave creada en AI Studio con otra cuenta/proyecto de facturación NO está cubierta por ningún tope ni alerta.
- Topes en spec: ARGOS_SCENE_QUOTA_MAX (por hogar, REQ-ESC6-011) y N2-02 `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (cuota global) están diferidos a T885 (tasks.md:17); la cuota en consola Vertex (T885 cond. 4) no aplica a la Developer API. Pendiente T824 (moneda real) sin cerrar.
- Hueco: no existe corte duro de gasto para este proveedor. Condiciones: (1) cuota/tope duro configurado en la consola del proveedor o límite de gasto en el proyecto de la clave; (2) `ARGOS_SCENE_GLOBAL_QUOTA_MAX` implementado antes de usar el driver con clave de facturación; (3) clave restringida (solo la API Generative Language, restricción de aplicación si es posible); (4) alerta de presupuesto en la cuenta/proyecto de esa clave.

## (e) Bloqueos para que gemini-api no escale
Estado real en src/infrastructure/config/app-config.ts: `fake` se rechaza con NODE_ENV=production (l.346); `real` exige `SCENE_REAL_DRIVER_ACTIVATED` (false hasta T885, l.115) y modelo/proyecto/SA/URL del worker. T879 afirma que el adaptador real no existe como código seleccionable.
Condiciones:
1. No ampliar `ARGOS_SCENE_DRIVER` a un tercer valor sin que ese valor esté bloqueado en producción: preferible `gemini-api` como valor solo aceptado con `NODE_ENV !== 'production'` Y una variable de opt-in explícita local (p. ej. `ARGOS_SCENE_DEV_GEMINI_KEY` presente); con NODE_ENV=production debe invalidar el arranque (mismo mecanismo `invalid.add`).
2. `SCENE_REAL_DRIVER_ACTIVATED` debe seguir `false`; gemini-api no puede reutilizarla para sortear T885; prueba de arquitectura/estática: el adaptador solo se importa desde `scene-composition.ts` y solo bajo el guard anterior; fetch inyectable (REQ-ESC6-031).
3. CI: 0 llamadas reales (REQ-ESC6-017); sin la clave en secretos de GitHub ni en deploy-argos.yml / entorno `produccion`.
4. terraform/Cloud Run: no definir secreto ni variable de la clave en producción; T885 no puede marcarse cumplida con este driver (cond. 7 enmienda VI, REQ-ESC6-028, REQ-ESC6-026, N2-01 = A, N2-02, T824).
5. El driver solo con consentimiento INV-ESC6-014 igualmente (incluso en local con datos reales); con datos sintéticos para evitar egreso de PII.
6. Cualquier uso por Neo con fotos reales requiere antes el aviso/ consentimiento y la verificación de términos de datos de la Developer API.
7. Registrar la decisión en tasks (nuevo ID [N2]/[GOV]) y en spec (nueva decisión D6-xx o enmienda de D6-01); no marcar COMPLETED (potestad de Neo).

## Resumen de condiciones
C1 Enmienda Nivel 2 (Principio VI + D6-01/D6-12) o uso estrictamente local/sintético aceptado por Neo. C2 Términos de datos con fuente (REQ-ESC6-028). C3 Consentimiento/aviso/providerId (REQ-ESC6-023..026, INV-ESC6-014). C4 Redacción de clave en cloud-logging + prueba. C5 Solo header, nunca query. C6 Topes de gasto propios y GLOBAL_QUOTA. C7 Guards de producción (sección e). C8 Cero dependencias npm, CI sin red.
