# Rama — OBS-2 (Vertex: «el proveedor no la usa para entrenar» sobre la biografía) — 2026-11-24

**FROM**: Rama (subagente /rama, Morpheus)
**Origen**: acta `.specify/memory/audits/oracle-006-T968-revalidacion-2026-11-24.md` (OBS-2)
**Alcance**: `src/presentation/web/scene-notice.ts` §4 (Vertex) y §6; `src/domain/scene/notice.ts`. Sin cambios de código, specs ni `tasks.md`. Sin `[x]`, sin commit.

## Pregunta
¿La cláusula «el proveedor no la usa para entrenar modelos» (aplicada a la biografía de la mascota enviada en el prompt) está respaldada por la documentación de datos de Vertex AI / Google Cloud?

## Búsqueda en disco
- `specs/006-escena-hogar-pixel-art/research.md` §2.3-bis: Neo registró (2026-11-19) como fuentes el *Data Processing Addendum* (`https://cloud.google.com/terms/data-processing-addendum`) y los *Service Specific Terms* (`https://cloud.google.com/terms/service-terms`). Los agentes **no** las verificaron en red.
- `research.md` §2.3-bis, nota T1301 (Link, 2026-11-23): lectura por WebFetch de la página *Data governance* de Vertex AI. Esa nota es la única verificación en disco de la cláusula de no entrenamiento.
- `.specify/memory/audits/rama-006-fase14-privacidad.md` punto 3: la cláusula figura como «fuente registrada por Neo, no verificada por agentes».
- No hay ninguna fuente en disco que diga si los prompts o el texto de entrada están incluidos en «tus datos» a efectos de entrenamiento.

## Búsqueda en red (WebSearch standard + WebFetch, consultas genéricas, sin datos de usuario)
1. Página oficial *Data governance* de Vertex AI: `https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance`
   - Cita verificada: «Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction.»
   - La página **no define** «your data» ni «Customer Data». Su único contenido descriptivo es el paréntesis de caché: «Implicit caching stores Customer Data (inputs, outputs, and derived data) in memory.», que se refiere a la caché, no a la cláusula de entrenamiento.
   - Dato relevante para retención (pendiente en el aviso): la misma página contiene «Google Cloud logs prompts, file inputs, and responses for up to 30 days» y «Google may log prompts to detect potential abuse». No es entrenamiento, pero contradice que la retención del proveedor sea desconocida en general; hay que decidir si se cita (es un hecho de la página, no aplicado al caso de ARGOS).
2. Página *AI Trust & Transparency* (`https://cloud.google.com/security/compliance/ai-trust-and-transparency`): la lectura devolvió solo el título, sin texto. **No verificada.** El resultado de búsqueda que la menciona («customers retain ownership of prompts… not used for public model training») es un fragmento sin leer; no se usa como fuente.
3. Los *Service Specific Terms* y el *Data Processing Addendum* citados en `research.md` no se han leído en esta sesión (sin fuente verificada en disco ni en red).

## Dictamen: **PARCIAL**

| Afirmación del aviso v3 (§4) | Estado | Fuente |
|---|---|---|
| «tus imágenes no se usan para entrenar los modelos fundacionales» | Cubierta en lo general: la cláusula de no entrenamiento de datos del cliente con modelos de IA/ML es verificada | Data governance de Vertex AI (URL arriba) |
| «la biografía… el proveedor no la usa para entrenar modelos» | **NO cubierta de forma explícita.** La cláusula se verifica sobre «your data»; la página no dice que los prompts o el texto de entrada estén incluidos | Ninguna verificada |
| Citar «Cloud Data Processing Addendum y Service Specific Terms» como base | No verificado (figura como registrado por Neo, sin lectura) | Pendiente |

Conclusión: la afirmación sobre la biografía es una extensión de la cláusula general, tal como señaló el oráculo (OBS-2). No está respaldada por una fuente leída en disco ni en red.

## Redacción mínima honesta (propuesta, NO aplicada)
Sustituir el último párrafo de la §4 de `src/presentation/web/scene-notice.ts` (texto de Vertex) por:

> «La biografía de tus mascotas se lee únicamente al generar y viaja de forma transitoria en la petición al proveedor: ARGOS no la almacena en los intentos de escena, en las instantáneas ni en los registros del servidor. Que el proveedor no la use para entrenar modelos no está confirmado en la documentación de Google que hemos revisado: queda pendiente de confirmar.»

Además, para la §4 de Vertex conviene citar la URL verificada (`https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance`) junto a los términos registrados por Neo, indicando cuál se ha leído y cuál no. La redacción es también la misma que ya usa la versión `gemini-api` para este punto («Su uso para entrenamiento… sigue pendiente de confirmar»), lo que mantiene coherencia entre ambos drivers.

Nota: cambiar ese texto cambia el contenido del aviso y exige decidir si sube la versión `noticeVersion` (hoy '3', EDGE-ESC6-018). Esa decisión y la firma del texto son de Neo (Nivel 2). No se ha aplicado nada.

## Fuentes
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance (leída, WebFetch)
- https://cloud.google.com/security/compliance/ai-trust-and-transparency (no legible)
- https://cloud.google.com/terms/service-terms y https://cloud.google.com/terms/data-processing-addendum (registradas por Neo, no leídas)
