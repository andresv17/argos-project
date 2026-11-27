# DEUDA-012-LEGAL-DISPUTAS-QR

- **Registrada**: 2026-11-27, `/keymaker` (T1643, Feature 012, Bloque B, `[GH:#23]`). Estado: **ABIERTA**. Decide el cierre: Neo (Nivel 2). Ningún agente la da por cerrada.
- **Qué es**: revisión legal externa (no asesoría de agentes) de los textos de la 012 que tocan datos personales de terceros: avisos de disputa de microchip, aviso del QR y teléfono público de la ficha de emergencia.
- **Versión de los textos**: `0.1.0` (`DRAFT`). Pasa a `1.0.0` solo tras la validación externa y la aprobación de Neo.
- **Dónde están los textos**: `specs/010-tipi-identidad-legal-borde/legal-texts.md`, sección «Avisos de disputa de microchip — Feature 012» (D1..D6). Los textos del QR (`REQ-QR12-004/006`, incluida la frase de alergias de `R-A5`) se agregan en `T1682`.
- **Condición bloqueante de producción (junto con ClamAV)**: no se habilita la cola de disputas de `/admin` ni `openChipDispute` en producción mientras la deuda siga abierta. El antimalware ClamAV (sidecar) también es condición bloqueante: sin adaptador en producción, `openChipDispute` falla cerrado con `503 ERR-OWN12-RETRYABLE` (composición: solo el driver de medios en memoria registra el adaptador determinista).
- **Condición de `F-03` (`REQ-CHP12-008`, `rama N-I`)**: validación legal de la excepción de conservación de la evidencia tras el borrado de la cuenta, **antes de producción**.
- **Otros puntos a validar**: evidencia como dato personal en su contenido (`rama R-A2`); retención de 365 días desde `closed_at`; suficiencia del aviso derivado (sin correo ni tabla de notificaciones); consentimiento versionado y retención del teléfono público y del QR.
- **Implementado hoy (no sustituye la validación)**: saneo profundo de la evidencia, descarga solo a administradores no parte con URL firmada de ≤ 5 min, lectura auditada, retención con purga en orden y barrido de huérfanos.
- **Pendiente de Neo**: contratar o designar la revisión externa; entregar valores definitivos si cambian los plazos.
