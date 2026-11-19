# Merovingian 006 — Dependencia de IA de imágenes (Exiled Program), 2026-11-18

Objeto: specs/006-escena-hogar-pixel-art/spec.md (DRAFT), D6-01, D6-12, REQ-ESC6-017, INV-ESC6-002. Solo lectura; sin red; nada instalado ni editado fuera de bitácoras e informe.

## 1. Constitución
- Principio VI: toda dependencia nueva exige Nivel 2 previo; solo servicios y dependencias gratuitos; lo de pago requiere autorización nueva.
- Principio II.4 / INV-ARCH-004: infrastructure/ implementa puertos; domain/application sin SDK. II.6 / INV-ARCH-006: process.env solo en src/infrastructure/config/.
- Precedente: jose 6.2.17 (T486) y @google-cloud/storage 9.0.0 (T612) se autorizaron como enmienda MINOR, versión exacta, acotados a un directorio, con prueba de arquitectura que falla si se importan desde domain/application.
- Dictamen: el SDK es admisible SOLO por enmienda MINOR de Nivel 2 con ese molde. Un cliente HTTP con fetch nativo (Node 22) en src/infrastructure/ NO añade dependencia y no requiere enmienda de dependencias (sí sigue requiriendo Nivel 2 por costo y por cambios de IAM/Terraform/CI).

## 2. Dependencias actuales (package.json / lock)
- Sin SDK de IA: no hay openai, @google/genai, @google-cloud/vertexai, @google-cloud/aiplatform, langchain ni anthropic (grep sobre el lock: cero coincidencias).
- Spec 006 no asume ningún paquete concreto: REQ-ESC6-017 dice "el proveedor/SDK lo fija D6-01" y define el puerto SceneImageGeneratorPort. Consistente.
- HALLAZGO útil: google-auth-library 11.3.4 (Apache-2.0) ya está instalado como transitiva de @google-cloud/storage 9.0.0 (ADC, tokens de la cuenta de servicio de Cloud Run). Vertex AI por REST se puede llamar con fetch + token ADC sin paquete nuevo; pero importarla directamente sería usar una transitiva no declarada en package.json (mala práctica; exigiría declararla, o sea una dependencia nueva de facto, o delegar el token al servidor de metadatos de Cloud Run con fetch a metadata.google.internal, que no requiere librería).

## 3. Proveedores candidatos (sin red: [verificar] = no confirmable en disco)
| Aspecto | A) Google (Vertex AI / Gemini image) | B) OpenAI |
|---|---|---|
| SDK | @google/genai (soporta Gemini API y Vertex) o @google-cloud/vertexai [verificar cuál es vigente; el segundo estaba en deprecación] | openai (npm) |
| Licencia | Apache-2.0 [verificar] | Apache-2.0 [verificar] |
| Mantenimiento | Google, activo [verificar] | OpenAI, activo [verificar] |
| Vulnerabilidades | [verificar con npm audit/OSV al fijar versión; no ejecutado] | [verificar con npm audit/OSV; no ejecutado] |
| Transitivas | Hereda google-auth-library (ya presente); peso adicional bajo [verificar] | Cliente propio, pocas transitivas [verificar] |
| Credenciales | Cuenta de servicio de Cloud Run (ADC) + rol roles/aiplatform.user y API aiplatform.googleapis.com habilitada en terraform/services.tf; sin llave nueva. Con Gemini Developer API (no Vertex) habría API key en Secret Manager | API key nueva en Secret Manager (REQ-IAC-005), rotación manual, proveedor fuera de GCP |
| Superficie de seguridad | Cambia IAM (nuevo rol en terraform/iam.tf) pero sin secreto; datos dentro del proyecto GCP [verificar términos de uso de datos] | Nuevo secreto, nueva salida a internet, política de datos de terceros, transferencia de fotos del hogar y mascotas (insumo para /rama) |
| Límites de imágenes de entrada (spec pide hasta 10) | [verificar] | [verificar] |
| Nivel gratuito | Vertex no tiene nivel gratuito de imágenes confirmado [verificar]; Gemini Developer API puede tener cuota gratuita limitada que no sirve de base para producción [verificar] | Sin nivel gratuito para imágenes [verificar] |

## 4. Costo y autorización Nivel 2
- Principio VI choca de frente: la generación de imágenes por API es de pago salvo un posible nivel gratuito [verificar]. NFR-ESC6-001 y RR-06-04 reconocen el costo unitario sin verificar.
- Requiere autorización de Neo (Nivel 2) en este orden: (1) D6-12 A/B/C con tope mensual numérico en USD (hoy el presupuesto de 003 es objetivo 0 USD con alarma de 1 USD, terraform/budget.tf: habría que subirlo, cambio de IaC = Nivel 2); (2) enmienda de constitución si el proveedor/servicio de pago se admite (la constitución lo dice: "autorización nueva"); (3) D6-01 proveedor; (4) dependencia npm (solo opción A del SDK); (5) cambios de Terraform (servicio aiplatform, rol IAM, secreto si B), que ningún agente aplica (terraform apply es de Neo).
- Sin D6-12 firmada, no debe existir plan ejecutable con llamadas reales; solo adaptador fake.

## 5. Grafo de impacto
Nodo raíz: REQ-ESC6-017 -> INV-ESC6-002 (capas) -> SceneImageGeneratorPort.
- Constitución: nueva enmienda MINOR (stack/dependencias y servicio de pago; condición de ámbito src/infrastructure/adapters/ o directorio dedicado), con prueba de arquitectura análoga a T612.
- 001..002: contratos/OpenAPI nuevos (payload, escena, errores como cuota agotada); ningún contrato previo cambia (INV-ESC6-012 solo lectura). Catálogo de errores 002 se incrementa (SC-ESC6-015). compile-contracts.sh y test:gate hoy listan features 002/003: hay que añadir 006 (precedente H-MERO-003 de 003).
- 003 Terraform: services.tf (API aiplatform si A), iam.tf (rol aiplatform.user a la SA run), secret_manager.tf (solo B), budget.tf (tope D6-12), cloud_run.tf (cpu_idle=true y timeout 60s chocan con NFR-ESC6-002/D6-15: trabajo en segundo plano sin CPU asignada se estrangula; probable Cloud Run Job/cola = más IaC y Nivel 2). Variables ARGOS_SCENE_* en app-config.ts (INV-ARCH-006, INV-ESC6-013).
- 004 repositorios y medios: reutiliza MediaStoragePort/gcs-media-storage.adapter.ts (REQ-ESC6-018); nuevas tablas/migraciones (HomeScene, cuota, REQ-ESC6-003/004/011) = Nivel 2 de persistencia; adaptadores sqlite/postgres/memoria con suite de conformidad.
- 005 álbum: tope de 10 PHOTO sigue vigente (EDGE-ESC6-013); D6-07 decide avatar vs PHOTO.
- Respaldo (004 sobre 3.x): REQ-ESC6-022/D6-13: escenas y foto del hogar fuera del sobre; si D6-13 las incluye, cambia el esquema de respaldo (MAJOR/MINOR del sobre).
- Privacidad: INV-ESC6-010, REQ-ESC6-021, SC-ESC6-033 (consentimiento) dependen del veredicto de /rama; el proveedor B agrava (tercero fuera de GCP).
- Tests: arquitectura (SDK solo en infrastructure, SC-ESC6-025), adaptador fake determinista, conformidad de puerto, CI sin llamadas reales; Stryker no cubre el adaptador real.
- Mutación/cobertura: SDK dificulta cobertura del adaptador real (excluir o envolver tras interfaz mínima); fetch es mockeable con un fetch inyectado.

## 6. Opciones y recomendación
- A) Aceptar SDK con condiciones: versión exacta sin ^/~, enmienda MINOR Nivel 2 acotada a infrastructure, prueba de arquitectura, npm audit/OSV y licencia verificados al fijar versión, tope de costo firmado (D6-12), sin llave JSON. Coste: transitivas y superficie de CVE; ganancia: tipado y reintentos.
- B) Cliente HTTP con fetch nativo en src/infrastructure/ (token por metadata server o ADC; fetch inyectable para pruebas; AbortSignal para T_GEN): cero dependencias nuevas, cero cadena de suministro, coherente con INV-ESC6-002 y NFR (timeout T_GEN). Coste: mantener el contrato REST del proveedor y su formato multimodal a mano [verificar estabilidad del endpoint].
- C) Diferir: proceder solo con SceneImageGeneratorPort + adaptador fake hasta que D6-12 y /rama estén resueltas.
- RECOMENDACIÓN: C en lo real, B como diseño objetivo: avanzar plan/tareas únicamente con puerto + adaptador fake (no requiere autorización); cuando Neo firme D6-12 y D6-01=Google, implementar el adaptador real con fetch nativo (B). Escalar a A solo si la superficie REST de Vertex resulta inmanejable. Evitar proveedor OpenAI salvo decisión explícita de Neo (secreto nuevo y tercero fuera de GCP).

## Hallazgos
- H-MERO-006-01 (alto): D6-12 choca con el Principio VI; sin tope numérico firmado no hay camino a producción.
- H-MERO-006-02 (alto): NFR-ESC6-002 vs cloud_run.tf (cpu_idle=true, timeout 60s): trabajo en segundo plano inviable sin cambio de IaC.
- H-MERO-006-03 (medio): google-auth-library es transitiva; no importarla directamente sin declararla.
- H-MERO-006-04 (medio): licencias, CVE, límites de imágenes y nivel gratuito [verificar] con red al fijar versión.
- H-MERO-006-05 (bajo): añadir 006 a compile-contracts.sh/verify-traceability/test:gate (precedente 003).

No se instaló nada, no se ejecutó npm audit, no se editaron specs/src/tests.
