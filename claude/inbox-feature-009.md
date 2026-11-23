# Inbox de Requerimientos — Feature 009 (Aprobación, /admin y correo)

> **Origen:** GitHub Project #5 (`andresv17`) | **Total ítems:** 5 | **Generado:** 2026-11-23T14:31:15.592Z
> **Instrucción para Architect / Morpheus:** Lee cada requerimiento de este archivo como entrada funcional equivalente al prompt de Neo. Al redactar `tasks.md`, conserva la etiqueta `[GH:#N]` en el encabezado de cada bloque o User Story (o en las tareas `Txxx`) para habilitar la sincronización automática con GitHub Projects.

## Resumen

| ID | Prioridad | Área | Estado | Título |
| --- | --- | --- | --- | --- |
| [GH:#18] | P0 | - | Todo | [009] Mecanismo de aprobación de registro de nuevos usuarios |
| [GH:#19] | P1 | - | Todo | [009] Portal aislado de administración (/admin) sin afectar UX de usuarios |
| [GH:#20] | P2 | - | Todo | [009] UI Admin para modificar campos del portal principal |
| [GH:#57] | - | - | Todo | [009] Enmienda al prompt de escena de hogar: orden lógico de bloques y restauración de preservación visual de mascotas con foto |
| [GH:#60] | - | - | Todo | [009] Escena de hogar: no contar intentos ni consumir cuota si no hubo llamada real a Vertex AI |

---

## Detalle de Requerimientos

### [GH:#18] [009] Mecanismo de aprobación de registro de nuevos usuarios
- **Prioridad:** P0 | **Área:** - | **Estado:** Todo | **Labels:** fase:4e, area:auth-admin, needs-decision
- **URL:** https://github.com/andresv17/argos-project/issues/18

### Objetivo
Limitar el acceso público mediante un flujo de **solicitud de unión / aprobación** para controlar capacidad, funcionalidad y seguridad de datos.

### Alcance propuesto
- El usuario solicita registro y queda en estado `Pendiente`.
- Notificación por correo al administrador (Si no es complejo ni requiere integraciones SNMP de momento o a proveedores, si no, aplazar sin definición de fase exacta aun).
- Permitir desde `/admin` ver el listado de usuarios pendientes por aprobar o rechazar.

---

### [GH:#19] [009] Portal aislado de administración (/admin) sin afectar UX de usuarios
- **Prioridad:** P1 | **Área:** - | **Estado:** Todo | **Labels:** fase:4e, area:auth-admin, area:security, needs-decision
- **URL:** https://github.com/andresv17/argos-project/issues/19

### Objetivo
Crear un portal dedicado de administración (ej. `argos-avallejo.duckdns.org/admin`) con credenciales/logueo independiente.

### Restricción clave
- La experiencia del usuario normal **no debe cambiar** (nunca preguntarle si se registra como Administrador).
- Validar si se divide en dos specs: A (SSO + vinculación) y B (aprobación + `/admin`).

---

### [GH:#20] [009] UI Admin para modificar campos del portal principal
- **Prioridad:** P2 | **Área:** - | **Estado:** Todo | **Labels:** fase:4e, area:auth-admin
- **URL:** https://github.com/andresv17/argos-project/issues/20

### Objetivo
- Permitir desde `/admin` modificar el tope de fotos de álbum permitidas por mascota.
- Permitir desde `/admin` modificar el prompt a enviar al generador de imágenes (Teniendo en cuenta que para casos sin mascotas se incluye un JSON, este solo debe modificar el prompt (o prompts si son varios y deben dividirse) genérico para todos los casos). El prompt (o prompts) inicial en el portal debe ser el actual.
- Permitir desde `/admin` deshabilitar/habilitar la funcionalidad de generación de escenas de hogar (Para bloquearla durante la salida a público) e incluir algun texto en alguna caja que muestre el mensaje "Función deshabilitada" en una caja gris, cuando haya sido apagada
- Permitir desde `/admin` configurar el modelo (`scene.provider_model`, ej. `gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`) y la región (`scene.provider_location`) de Vertex AI para la generación de escenas de hogar, habilitando el soporte del endpoint `global` (`aiplatform.googleapis.com`) en el adaptador y manteniendo la validación anti-SSRF por lista cerrada y regex.
- Permitir desde `/admin` resetear la cuota de imágenes generadas por todos las cuentas que sean admin en /admin. Es decir, si tengo cuenta en argos con mi email y con ese tengo mi cuenta de /admin, debo poder resetear mi contador de imágenes desde /admin

Tener en cuenta que todos los campos deberían pasar a ser de DB y no código. También se pueden sugerir campos adicionales que puedan vivir en DB en vez de código sin saturar portal /admin. Todo debe ser en caliente (sin reiniciar el servicio) 

### Contexto técnico
`specs/005-album-archivos-clinicos` (`REQ-PRM-003`) ya dejó preparada la tabla de parámetros en BD sin UI de administración.

---

### [GH:#57] [009] Enmienda al prompt de escena de hogar: orden lógico de bloques y restauración de preservación visual de mascotas con foto
- **Prioridad:** - | **Área:** - | **Estado:** Todo | **Labels:** -
- **URL:** https://github.com/andresv17/argos-project/issues/57

## Contexto                                                                                                                                                                                                                                                              
    Durante la implementación del Bloque G de la Feature 007 (`buildImagePrompt` en `src/domain/scene/build-image-prompt.ts`), se introdujeron dos desviaciones respecto a la intención funcional del prompt de generación de escena de hogar en 16-bit:                     
                                                                                                                                                                                                                                                                             
    1. **Orden ilógico en casos mixtos (`FROM_SCRATCH` / `REGENERATE`):** actualmente la instrucción `Place all N pets naturally and separately in different cozy spots of the room.` se emite **antes** del bloque `Scene specification (JSON)` que describe a las mascotas 
    sin foto. Esto indica al modelo distribuir `N` mascotas antes de haberle descrito todas las mascotas de la escena.                                                                                                                                                       
    2. **Pérdida de la instrucción de fidelidad visual para mascotas con foto:** al sustituir el texto largo de la Feature 006 por la línea corta `Pet k (species): Use IMG_n as the exact visual reference for this <species>.`, se eliminó la instrucción explícita que    
    exige preservar rasgos reconocibles de las mascotas a partir de sus fotos de referencia (`PIXEL_REDRAW_RULE` solo cubre el estilo pixel art, no la identidad visual de cada mascota).                                                                                    
                                                                                                                                                                                                                                                                             
    ---                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                             
    ## Cambios requeridos                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                             
    ### 1. Reordenar bloques en `FROM_SCRATCH` / `REGENERATE`                                                                                                                                                                                                                
    El bloque `Scene specification (JSON)` (cuando existan mascotas sin foto) debe emitirse **antes** de la instrucción `Place all N pets...`, de modo que el modelo reciba la lista completa de mascotas (con foto y sin foto) antes de las reglas de distribución y conteo.
                                                                                                                                                                                                                                                                             
    ### 2. Restaurar bloque obligatorio de preservación visual cuando haya mascotas con foto                                                                                                                                                                                 
    Siempre que al menos una mascota visible en la escena lleve foto de referencia (`hasReferencePhoto && photoRef !== null`), incluir exactamente una vez el siguiente bloque literal:                                                                                      
                                                                                                                                                                                                                                                                             
    > `Translate the pet from the reference photos into a single cohesive 16-bit isometric pixel art illustration. Faithfully preserve each pet species, fur colors, coat patterns, ear shapes, body proportions, and unique markings from the photos so each one is clearly 
    recognizable.`                                                                                                                                                                                                                                                           
                                                                                                                                                                                                                                                                             
    - **En `FROM_SCRATCH` / `REGENERATE`:** emitirlo si al menos una mascota `RENDER` lleva foto (ubicado inmediatamente después de las líneas `Pet k (...): Use IMG_n ...`, o antes de `PIXEL_REDRAW_RULE` — fijar posición exacta en spec 009).                            
    - **En modos incrementales (`INCREMENTAL_ADD` / `INCREMENTAL_REPLACE`):** emitirlo cuando al menos una mascota `ADD` o `REPLACE` lleve foto.                                                                                                                             
    - **Cuando ninguna mascota lleva foto** (aunque el hogar sí tenga foto): **no** emitir este bloque.                                                                                                                                                                      
                                                                                                                                                                                                                                                                             
    ### 3. Orden final objetivo en `FROM_SCRATCH` / `REGENERATE`                                                                                                                                                                                                             
    1. `STYLE_BASE_TEXT`                                                                                                                                                                                                                                                     
    2. Bloque de hogar (`HOUSEHOLD_WITH_PHOTO` o `HOUSEHOLD_GENERIC`)                                                                                                                                                                                                        
    3. Líneas `Pet k (species): Use IMG_n ...` *(solo mascotas con foto; omitido si no hay)*                                                                                                                                                                                 
    4. Bloque de preservación visual (`Translate the pet from the reference photos...`) *(solo si hay al menos 1 mascota con foto)*                                                                                                                                          
    5. `Scene specification (JSON):` *(solo mascotas sin foto, conservando ordinal global 1-based; omitido si todas tienen foto o `N = 0`)*                                                                                                                                  
    6. `Place all N pets naturally and separately in different cozy spots of the room.` *(solo si `N >= 2`)*                                                                                                                                                                 
    7. Frase de conteo exacto `Exact animal count: ...` *(si `N >= 1`)* o regla de cero animales *(si `N = 0`)*                                                                                                                                                              
    8. `PIXEL_REDRAW_RULE` *(solo si el hogar o alguna mascota visible lleva foto)*                                                                                                                                                                                          
                                                                                                                                                                                                                                                                             
    ### 4. Limpieza menor recomendada en el mismo cambio (`N = 0`)                                                                                                                                                                                                           
    Actualmente con `N = 0` se omite `Scene specification (JSON)` pero se emite `PET_COUNT_RULE` citando `renderedPetsCount` (un campo inexistente en ese prompt). Evaluar y definir en spec 009 si con `N = 0` se emite una frase directa sin referencia al JSON (ej. `Draw 
    no animals in this room.`) o se incluye `{"renderedPetsCount":0,"pets":[]}`.                                                                                                                                                                                             
                                                                                                                                                                                                                                                                             
    ---                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                             
    ## Archivos impactados                                                                                                                                                                                                                                                   
    - `src/domain/scene/build-image-prompt.ts`                                                                                                                                                                                                                               
    - Pruebas unitarias del prompt de escena (`tests/unit/t1071-*` y suites asociadas)                                                                                                                                                                                       
    - Especificación de la enmienda en Feature 009 (actualizando lo fijado en `specs/007-ux-ficha-mascota-fallecimiento/spec.md`, regla R4)                                                                                                                                  
                                                                                                                                                                                                                                                                             
    ---                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                             
    ## Criterios de aceptación                                                                                                                                                                                                                                               
    - [ ] En escenarios mixtos (mascotas con y sin foto), `Scene specification (JSON)` aparece **antes** de `Place all N pets naturally and separately in different cozy spots of the room.`.                                                                                
    - [ ] Cuando existe al menos una mascota con foto (con o sin foto de hogar), el prompt incluye literalmente el bloque `Translate the pet from the reference photos...` exactamente una vez.                                                                              
    - [ ] Cuando ninguna mascota tiene foto (incluidos `N = 0` y solo foto de hogar), el bloque `Translate the pet from the reference photos...` **no** se emite.                                                                                                            
    - [ ] Se mantienen intactas las invariantes de privacidad y determinismo (`INV-ESC6-001`, `INV-ESC6-010`, `INV-ESC6-011`, `INV-ESC6-017`: cero IDs, nombres, biografías ni texto libre de raza).                                                                         
    - [ ] Pruebas unitarias actualizadas cubriendo los 4 casos base: sin foto de hogar ni mascotas, sin foto de hogar + mix de mascotas, foto de hogar + `N = 0`, foto de hogar + mix de mascotas, además de modos incrementales con foto.

---

### [GH:#60] [009] Escena de hogar: no contar intentos ni consumir cuota si no hubo llamada real a Vertex AI
- **Prioridad:** - | **Área:** - | **Estado:** Todo | **Labels:** -
- **URL:** https://github.com/andresv17/argos-project/issues/60

## Contexto                                                                                                                 
    En producción se detectó que cuando la generación de escena falla **antes** de invocar a Vertex AI (por ejemplo, al         
    rechazarse por cuota global mensual agotada, fallo de lectura en GCS o cancelación previa), el intento se cierra con        
    `outcome = 'FAILED'` y **sí computa** contra los límites de `evaluateAttemptLimits`:                                        
    - `MAX_FAILED_ATTEMPTS_PER_SCENE = 3` en 24 horas (`FAILED_LIMIT` → `429`), bloqueando la escena por 24 horas aunque Vertex 
    AI nunca fue invocado.                                                                                                      
    - `MAX_STARTED_ATTEMPTS_PER_ACTOR = 12` en 24 horas (`ACTOR_LIMIT`).                                                        
                                                                                                                                
    Además, en `RunSceneGenerationUseCase`, `svc.globalQuota.tryConsume(...)` se ejecuta **antes** de verificar en transacción  
    que la escena sigue activa (`runState === 'generating' && currentAttemptId === attempt.id`) y marcar                        
    `provider_call_started_at`, lo que puede descontar cuota global aun si el intento ya estaba cancelado y nunca llega a Vertex
    AI.                                                                                                                         
                                                                                                                                
    ---                                                                                                                         
                                                                                                                                
    ## Regla / Invariante requerida                                                                                             
    **Si no hay consumo real de Vertex AI (`provider_call_started_at IS NULL`), el intento no debe contar** contra              
    `FAILED_LIMIT`, `ACTOR_LIMIT` ni contra la cuota global mensual.                                                            
                                                                                                                                
    ---                                                                                                                         
                                                                                                                                
    ## Cambios requeridos                                                                                                       
                                                                                                                                
    ### 1. Filtrar contadores de intentos por `provider_call_started_at IS NOT NULL`                                            
    La columna `scene_attempts.provider_call_started_at` ya existe en PostgreSQL (`0009_home_scenes.sql`) y SQLite              
    (`0013_home_scenes.sql`), por lo que **no requiere migración de esquema**.                                                  
                                                                                                                                
    Actualizar las consultas de conteo en los tres repositorios:                                                                
    - `countFailedAttemptsByScene(sceneId, since)`: contar únicamente filas con `outcome = 'FAILED'` **y**                      
    `provider_call_started_at IS NOT NULL`.                                                                                     
    - `countAttemptsByActor(actorUserId, since)` (y `oldestActorStartedAt` / `lastStartedAt` si aplica al límite por actor):    
    contar únicamente intentos con `provider_call_started_at IS NOT NULL` (o activos en ejecución si corresponde evitar         
    concurrencia, sin penalizar fallos previos sin llamada a Vertex).                                                           
                                                                                                                                
    *(El cooldown corto de 60 s entre solicitudes puede mantenerse o evaluarse en spec 009, pero `FAILED_LIMIT` de 24 h y       
    `ACTOR_LIMIT` de 24 h nunca deben contar intentos que no llegaron al proveedor).*                                           
                                                                                                                                
    ### 2. Blindar el descuento de cuota global (`scene.global_quota_used.YYYY-MM`)                                             
    En `src/application/use-cases/scene-run-use-case.ts`:                                                                       
    - Confirmar que la escena y el intento siguen vigentes (`runState === 'generating' && currentAttemptId === attempt.id`)     
    **antes** de ejecutar `svc.globalQuota.tryConsume(...)` y marcar `provider_call_started_at`.                                
    - Garantizar que un intento cancelado o cerrado antes de llamar al generador jamás descuente cuota global.                  
                                                                                                                                
    ---                                                                                                                         
                                                                                                                                
    ## Archivos impactados                                                                                                      
    - `src/infrastructure/persistence/postgres/postgres-scene-repositories.ts`                                                  
    - `src/infrastructure/persistence/sqlite/sqlite-scene-repositories.ts`                                                      
    - `src/infrastructure/persistence/memory/in-memory-scene-repositories.ts`                                                   
    - `src/application/use-cases/scene-run-use-case.ts`                                                                         
    - `src/application/ports/scene-repositories.port.ts` (documentación del contrato si aplica)                                 
    - Pruebas unitarias y de integración de límites de intentos y cuota global                                                  
                                                                                                                                
    ---                                                                                                                         
                                                                                                                                
    ## Criterios de aceptación                                                                                                  
    - [ ] Tres o más intentos fallidos **antes** de invocar a Vertex AI (`provider_call_started_at IS NULL`, ej. cuota global   
    agotada o error previo de storage) **no** disparan `FAILED_LIMIT` (bloqueo de 24 h) ni incrementan `startedByActor`         
    (`ACTOR_LIMIT`).                                                                                                            
    - [ ] Un intento que **sí** invocó a Vertex AI (`provider_call_started_at IS NOT NULL`) y falló continúa computando         
    normalmente contra `FAILED_LIMIT` y `ACTOR_LIMIT`.                                                                          
    - [ ] Un intento cancelado antes de llamar a Vertex AI **no** descuenta la cuota global mensual                             
    (`scene.global_quota_used.YYYY-MM`).                                                                                        
    - [ ] Comportamiento idéntico verificado en los tres repositorios: PostgreSQL, SQLite y Memory.                             
    - [ ] Sin migraciones de BD requeridas.

---
