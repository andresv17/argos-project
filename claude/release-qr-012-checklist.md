# Criterio de release bloqueante del QR en producción — Feature 012, Bloque D (`[GH:#32]`, T1685)

Registrado 2026-11-27 por `/keymaker`. **Ninguna casilla la marca un agente**: las marca Neo (Nivel 2) tras verificar la evidencia. La activación de la ficha QR en producción **no procede** hasta que todas estén marcadas. Las casillas de código se verifican con las compuertas del repositorio; las de plataforma y legales, con evidencia que aporta Neo.

## Casillas bloqueantes

- [ ] **`DEUDA-012-TERRAFORM-LOGS-QR` cerrada** (`SC-012-107`): exclusión de `/e/` y `/api/emergency/` en `terraform/logging.tf` aplicada por Neo tras `terraform plan`. Ver `claude/deuda-012-terraform-logs-qr.md`.
- [ ] **`DEUDA-012-LEGAL-DISPUTAS-QR` cerrada** con los textos aprobados (versión `1.0.0` en `legal-texts.md` y en `x-sdd-constants.TEXTS`). Ver `claude/deuda-012-legal-disputas-qr.md`. Al pasar `0.1.0` a `1.0.0` (cambio `MAJOR`) los teléfonos con consentimiento previo quedan en espera hasta 90 días (`EMERGENCY_NOTICE_EFFECTIVE_AT`).
- [ ] **`PHONE_HMAC_KEY` aprovisionada** en Secret Manager (clave dedicada, distinta de la de sesión y de la de IP) y presente en el entorno de producción (`T-05`). El aprovisionamiento en `terraform` es deuda de infraestructura fuera de la 012.
- [ ] **`ARGOS_PUBLIC_BASE_URL` definida** en producción (HTTPS, obligatoria; la URL del QR se forma solo con ella y `/e/{token}`, nunca con `Host` ni `X-Forwarded-*`; longitud total ≤ `QR_URL_MAX_BYTES = 106`).
- [ ] **Runbook de rotación de `PHONE_HMAC_KEY`** documentado en `quickstart.md` (annex §9; `SC-012-122`) y ensayado en un entorno no productivo.
- [ ] **`SC-012-086`** (no fuga del token en registros de aplicación, auditoría y cabeceras; `redactSecrets` por forma, sin anclar, de cualquier longitud; `T1680`) con evidencia en disco.
- [ ] **`SC-012-107`** (este mismo criterio de release evaluado y registrado por Neo).

## Condiciones de producción adicionales (annex §6 y `T1685`)

- [ ] Ficha `OFF` al fallecer la mascota (`AUTO_PET_DECEASED`), borrado del consentimiento al `LEFT`/`ENDED` y vínculo con `phone_hmac` (`SC-012-106`).
- [ ] Respuesta del token con `Cache-Control: no-store`, fuera del almacén de idempotencia, de los registros y del almacén de medios (`SC-012-109`).
- [ ] El teléfono no aparece en registros, auditoría, cabeceras ni mensajes de error (annex §6.2).
- [ ] Prueba de arranque de `ARGOS_TRUST_PROXY_HOPS` y de no caché en proceso `token → ficha` (annex §6.6).
- [ ] Prueba local manual del Bloque #32 (`T1677`) y revisiones de `/sati`, `/sentinels`, `/seraph` (`T1678`) y re-auditoría de `/trinity` y `/rama` (`T1683`).
- [ ] Verificación manual de escaneo físico del QR por Neo (`Neo-O`, `SC-012-049`, `SC-012-070`) y QR de al menos 30 mm en A6 (`SC-012-051`).

## Notas de producción

- Límite de escaneo en memoria: con N instancias activas el tope es de hasta N × 30 por minuto por IP (declarado, `SC-012-109`, `lock R-10`).
- Riesgo aceptado (INFO, `trinity N-06`): el teléfono no se verifica por OTP.
