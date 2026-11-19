# Implementation Plan: Escena visual del hogar en pixel art generada por IA (Feature 006, Fase Cloud)

**Estado**: `DRAFT` (Architect, 2026-11-18; para revisión de `/trinity`, `/lock`, `/mifune`, `/link`, `/merovingian`, luego `/oracle` y firma de Neo). Sin `APPROVED` ni `LOCKED`. Fuentes: `spec.md` (decisiones `D6-01..D6-17` firmadas el 2026-11-18), `data-model.md`, `research.md`, `contracts/`, y, solo lectura, los informes `rama-006-privacidad.md`, `merovingian-006-dependencia-ia.md`, `mouse-006-estructura.md` y el estado real de `terraform/` y `src/`.
**Revisión 2 (2026-11-18)**: incorpora los informes de `/mifune` (`mifune-006-diseno.md`), `/trinity` (`trinity-006-diseno.md`), `/lock` (`lock-006-diseno.md`), `/link` (`link-006-iac.md`) y `/merovingian` (`merovingian-006-diseno-impacto.md`) en lo que es diseño propio de la 006. Todo lo que exige enmendar un texto firmado, un contrato ajeno, la constitución, `terraform/`, `scripts/` o workflows quedó **firmado por Neo el 2026-11-18** (`spec.md` «Decisiones de Nivel 2 firmadas por Neo (2026-11-18)», `N2-01..N2-12`) y se ejecuta como tareas de `tasks.md`; este plan no aplica nada a `terraform/` ni a `main`.
**Alcance de este documento**: arquitectura, plan de ejecución asíncrona y descripción de cambios de IaC. **No** escribe `tasks.md`, no toca `src/`, `tests/` ni `terraform/`, no compila contratos.
**Regla de entrega por etapas (`REQ-ESC6-031`)**: todo lo implementable hoy usa el adaptador **simulado** (y, solo en desarrollo local privado de Neo, `gemini-api`, `REQ-ESC6-037`, `D6-18`, `N2-13`; nunca en producción). El adaptador real de Vertex existe como código inactivo hasta cumplir `REQ-ESC6-028` y aplicar la enmienda acotada al Principio VI (`.specify/memory/audits/enmienda-006-principio-VI.md`, aprobada por Neo en `N2-12`; su aplicación es una tarea [N2]). La activación del driver real y la fusión a `main` están bloqueadas por la compuerta de `N2-10` (§13).

## 1. Arquitectura (hexagonal; mismo sentido de dependencias que 004 y 005)

```mermaid
flowchart LR
  subgraph presentation["presentation/web (React)"]
    SV[Bloque Escena en vista Hogar / Mis mascotas]
    AV[Aviso de consentimiento]
    HP[Foto del hogar]
  end
  subgraph http["infrastructure/http (Fastify)"]
    R1[scene.routes: GET/POST scene, image]
    R2[household-photo.routes]
    R3[scene-consent.routes]
    R4[/internal/scene-worker OIDC/]
  end
  subgraph app["application"]
    UC1[GetScene / RequestSceneGeneration]
    UC2[RunSceneGeneration worker]
    UC3[Put/Delete HouseholdPhoto]
    UC4[Grant/RevokeSceneConsent]
    UC5[ganchos de privacidad y ciclo de vida - sin estado persistido]
    P1[[SceneImageGeneratorPort]]
    P2[[SceneJobDispatcherPort]]
    P3[stripImageMetadata - función inyectada]
    P4[[SceneRepository + SceneConsentRepository]]
    P5[[MediaStoragePort - 004]]
    P6[[ClockPort / IdGeneratorPort - existentes]]
  end
  subgraph dom["domain (puro)"]
    D1[scene/inputs-snapshot + fingerprint]
    D2[scene/select-visible-pets]
    D3[scene/decide-mode + pending-count]
    D4[scene/quota-window]
    D5[scene/build-image-prompt + sanitize]
    D6[scene/scene-state STATE-SCENE-001]
  end
  subgraph infra["infrastructure"]
    A1[FakeSceneImageGenerator]
    A2[VertexSceneImageGenerator fetch - inactivo]
    A3[InProcessDispatcher / CloudTasksDispatcher fetch]
    A4[stripImageMetadata lista blanca]
    A5[SqlSceneRepository sqlite y postgres]
    A6[config/app-config.ts ARGOS_SCENE_*]
  end
  presentation --> http --> app --> dom
  app --> P1 & P2 & P3 & P4 & P5
  A1 & A2 -. implementan .-> P1
  A3 -. implementa .-> P2
  A4 -. es .-> P3
  A5 -. implementa .-> P4
```

### 1.1 `domain/` (puro; sin `Date`, sin entropía, sin `node:*`, `INV-ARCH-001/002/004`)
Módulo nuevo `src/domain/scene/` (carpeta **nueva dentro de `domain/`**: es parte del árbol del dominio; la constitución exige autorización para carpetas *fuera* del árbol, y `domain/scene` está dentro de `src/domain/`; `/merovingian` confirmará):

| Módulo | Responsabilidad | Requisito |
|---|---|---|
| `inputs-snapshot.ts` | Construye el JSON canónico de entradas (`data-model.md` §2.6) y su huella con `sha256` puro de `domain/audit` | REQ-ESC6-004, INV-ESC6-001/008 |
| `select-visible-pets.ts` | Orden total: `assigned_at` asc, desempate `id` asc; devuelve `visible` (primeras `N`) y `total` | REQ-ESC6-008, D6-11 |
| `decide-mode.ts` | De `(snapshotVigente, snapshotActual, existeImagen, accionUsuario)` devuelve `mode`, las acciones por mascota y el **recuento de cambios** por entidad. Precedencia: `REGENERATE` > sin imagen > cambio de foto del hogar > incrementales (`INCREMENTAL_MIXED` con más de un tipo) | REQ-ESC6-004/006/007/010, D6-08 |
| `quota-window.ts` | restante y regla de reinicio mensual (`D6-03`); recibe la ventana `YYYY-MM` ya resuelta como dato (la conversión de zona vive detrás del reloj inyectado; sin `Date` ni `Intl` en `domain/`), la fija en T1 y T2 no la relee (`EDGE-ESC6-031`) | REQ-ESC6-011 |
| `build-image-prompt.ts` | `buildImagePrompt(payload) → string`; plantillas de §5.3 con el contenido variable entre delimitadores declarados como datos; nombre canónico por `breedCode` | REQ-ESC6-016, INV-ESC6-001/011/017 |
| `sanitize-free-text.ts` | Reglas de `INV-ESC6-011`: normaliza NFKC, colapsa espacios y exige **lista blanca** `^[\p{L}\p{N} .'\-]{1,60}$`; sin lista blanca superada se omite el valor y se usa el texto por defecto; la lista de marcadores de instrucción es defensa secundaria (`H-TRI-006-04`) | INV-ESC6-011 |
| `scene-state.ts` | `STATE-SCENE-001`: transición válida o `Result.err`; `deriveStatus` (reglas en `data-model.md` §4; el estado `idle|outdated|ready` no se persiste, `H-MIF-006-01`) | REQ-ESC6-003 |
| `scene-policy.ts` | `canGenerateScene(rolEnElHogar)` y `canReadScene(...)`: funciones puras de alcance **hogar** (`D6-10` = B); no amplían `PetAction` ni `RBAC_MATRIX` (`ADR-006-08`, `H-MERO-006-17`) | REQ-ESC6-020 |
| `attempt-limits.ts` | contadores de intentos iniciados y enfriamiento (`REQ-ESC6-034`); recibe cuentas y relojes como datos; puerto de datos: `SceneRepository.countFailedAttemptsByScene(sceneId, since): Promise<{ count: number; oldestAt: string \| null }>` (solo `result = FAILED`, `started_at >= since`; `oldestAt` = el `started_at` más antiguo de esos fallos, base de `Retry-After`; `Decisión de Fase 5, 2026-11-18`, `H-KEY-F5-3`) y `countAttemptsByScene` queda solo para el enfriamiento y el tope por actor | REQ-ESC6-034 |
| `scene-payload.ts` | Tipos del payload (generados de `scene-payload.schema.json`; el dominio solo importa el tipo generado) y construcción del payload desde snapshot, modo y asignación de ranuras `IMG_n` | REQ-ESC6-015 |

### 1.2 `application/`
Puertos nuevos en `src/application/ports/` (aplican `INV-ARCH-005`: todo `Promise`):

```text
SceneImageGeneratorPort.generate({ prompt: string, references: ReadonlyArray<{ ref: 'IMG_n', mime, bytes }>, signal: AbortSignal })
  -> Promise<{ ok: true, image: { mime: 'image/png'|'image/webp', bytes } } | { ok: false, code: SceneErrorCode }>
SceneJobDispatcherPort.enqueue({ sceneId, attemptId }) -> Promise<void>
SceneRepository / SceneConsentRepository  (transacciones por UnitOfWork existente; compare-and-set; candado de escena)
```

`stripImageMetadata(mime, bytes) -> { ok: true, mime, bytes } | { ok: false }` es una **función pura inyectada** (módulo de `infrastructure`), no un puerto: hoy hay un solo adaptador y ningún fake (`H-MIF-006-07`); `INV-ARCH-005` rige para puertos. `N2-01` = B ahora (lista blanca sin dependencia npm en el tramo fake) y **A obligatorio antes del driver real**: dependencia de imagen auditada por `/merovingian` con red; entonces la función se convierte en puerto si existe un segundo adaptador.

El puerto del generador **nunca** devuelve el cuerpo ni el mensaje del proveedor (`INV-ESC6-016`): solo `SceneErrorCode`.

Casos de uso (`src/application/use-cases/scene-use-cases.ts`):
- `getScene(actor, scope)`: **primero** autoriza y responde 404 sin escribir nada (no se crean filas para hogares ajenos ni inexistentes, `INV-ESC6-019`); después crea la fila perezosa, materializa el vencimiento del arrendamiento con un compare-and-set idempotente, deriva el estado (`data-model.md` §4) y calcula acciones y consentimiento (`REQ-ESC6-003/005/019/020`).
- `requestSceneGeneration(actor, scope, action, idempotencyKey)`: bajo el candado de la escena y en **T1**: rol (`D6-10`), consentimiento (`INV-ESC6-014`), cuota (restante, ventana y máximo fijados en el intento), contadores y enfriamiento (`REQ-ESC6-034`), condiciones del botón; resuelve la clave de idempotencia con alcance actor-escena-acción y **memoria de una sola clave por escena, la última** (`REQ-ESC6-012`, `EDGE-ESC6-016`); al insertar el intento nuevo pone a NULL el hash de los intentos anteriores de la escena; `decideMode`; compare-and-set a `generating` con `lease_expires_at = ahora + T_QUEUE`; inserta el intento con su `inputs_snapshot`, `result_object_id`, `quota_window` y `quota_max`; inserta `INTENT` de `scenes/{sceneId}/images/{result_object_id}` en la misma transacción. Tras el `COMMIT`, `dispatcher.enqueue` (nombre de tarea = `attemptId`). Un `ALREADY_EXISTS` de la cola cuenta como éxito; un error **ambiguo** (tiempo agotado) no marca `failed`: el arrendamiento de espera en cola resuelve (`EDGE-ESC6-032`); solo un rechazo determinista pasa el intento a `FAILED` con `ERR-SCENE-GENERATION-FAILED`, sin cuota (`REQ-ESC6-013`).
- `runSceneGeneration(sceneId, attemptId)` (worker, protocolo de `REQ-ESC6-036`): verifica identidad antes de leer el cuerpo (`REQ-ESC6-033`); comprueba que el `attemptId` pertenece al `sceneId` (si no, 204 sin efecto); **claim** `PENDING -> RUNNING` con compare-and-set y arrendamiento desde `claimed_at` (duplicado concurrente: 204, `EDGE-ESC6-024/027`); reverifica consentimiento y permisos de las fotos (`REQ-ESC6-024`); resuelve referencias a bytes con los límites de `REQ-ESC6-027`; normaliza; arma payload y prompt; revisa el arrendamiento; llama al generador con `AbortSignal` de `T_GEN`; valida la salida por firma (`REQ-ESC6-035`); comprueba la señal de aborto y el arrendamiento; `put` en `result_object_id`; publica en **T2** (`data-model.md` §7): `scene_image_sources` se compone de las fotos efectivamente enviadas (más las fuentes de la imagen previa si viajó como referencia), el consentimiento se recomprueba solo para el actor y esos dueños, y la cuota agotada en T2 cierra el intento `FAILED` con `ERR-SCENE-GENERATION-FAILED` y motivo interno `SCENE_QUOTA_AT_T2` solo en la auditoría (`H-KEY-F5-6/7`, Decisión de Fase 5 lote 2). `getScene` y el worker, al materializar el vencimiento del arrendamiento, escriben en la misma transacción la auditoría `SCENE_FAILED` (`ERR-SCENE-LEASE-EXPIRED`) con el actor del intento (`H-KEY-F5-5`).
- `put/deleteHouseholdPhoto`, `grant/revokeSceneConsent` y los ganchos de ciclo de vida de abajo.

**Ganchos de privacidad y ciclo de vida (requisito de la 006; `H-MERO-006-15`, `H-LCK-006-14`)**. Con el estado derivado en lectura (`ADR-006-09`) desaparece `recomputeSceneStatus` y la clase de defectos «proyección desfasada»; quedan **solo** las acciones que no son de estado y deben ocurrir en la transacción de la causa. Todos los casos de uso listados son de features `LOCKED` (002, 004, 005): **tocarlos es la enmienda MINOR (d) aprobada de `N2-06`, con tarea y suite propias en `tasks.md`**; este plan no los cambia, solo los declara:

| Caso de uso existente | Acción que añade la 006 en la misma transacción | Requisito |
|---|---|---|
| `pet-use-cases` (baja de mascota), `avatar-use-cases` (borrado) | retirar la imagen vigente si la mascota consta en `image_inputs_snapshot` y encolar su borrado; marcar `CANCELLED` el intento en vuelo | REQ-ESC6-029, 030 |
| `assignment-use-cases`, salida o expulsión (`household-use-cases`) | desasignación: retirar la imagen vigente y encolar (`D6-17`); marcar `CANCELLED` el intento en vuelo | REQ-ESC6-030 |
| `household-use-cases` (crear) | migración `D6-09` con orden fijo y fusión (`data-model.md` §5); arrastre de cuota | REQ-ESC6-032, EDGE-ESC6-030, 033 |
| `household-use-cases` y `account-use-cases` (`deleteWithMemberships`) | encolar objetos de escena **antes** del `DELETE`; `UPSERT` en `scene_quota_carry`; seudonimización | REQ-ESC6-029, EDGE-ESC6-033 |
| `ownership-use-cases` (**transferencia de propiedad**) | retirar las imágenes vigentes que incluyan la mascota transferida y fuentes del propietario anterior; el consentimiento efectivo pasa al nuevo Propietario Legal (precedente: revocación de enlaces de 005 en la misma transacción, `t798`) | REQ-ESC6-024, 025, 030 |
| `backup-use-cases` (**importación**) | la importación reemplaza mascotas y deja `avatar_object_id = NULL`: retirar la imagen vigente de las escenas que incluyan mascotas reemplazadas | REQ-ESC6-022 |
| `media-use-cases` (cuota de 1 GiB) | `countBytesOfOwner` suma `pet_media` + `household_photos` (4 implementaciones del puerto, `H-MERO-006-13`) | REQ-ESC6-018 |

La purga diaria de avatares, el cambio de `ARGOS_SCENE_MAX_PETS` por despliegue y cualquier otro escritor de entradas se reflejan en la derivación **sin gancho** (`SC-ESC6-086`).

**Decisión de arquitectura: `UnitOfWork` y orden de candados (`ADR-006-07`, `H-MERO-006-16`)**. `SceneRepository` y `SceneConsentRepository` se añaden al `UnitOfWork` existente y se implementan en memoria, SQLite, PostgreSQL y `pg-fake-client.ts`; `tests/fixtures/application-harness.ts` (`createDeps`), `record-engines` y `sqlite-harness` se actualizan con ellas. Orden de candados en toda transacción de la 006: propietario → mascota → hogar → escena. **La primera tarea de la cadena** (cuando exista `tasks.md`) es introducir los puertos y los arneses con implementación nula, en verde (`npx tsc --noEmit` y la suite existente) antes de cualquier lógica: sin ella casi toda la suite de casos de uso falla a la vez por tipos.

**Decisión de arquitectura: alcance de `GENERATE_SCENE` y `READ_SCENE` (`ADR-006-08`, `H-MERO-006-17`)**. Son acciones de **hogar**, no de mascota: no se añaden a `PetAction` ni a `RBAC_MATRIX` (así `rbac-export-permission`, `access-policy`, `roles.api` y los 9 `PetPermissions` de 002 no cambian). Se deciden con el rol del usuario **en el hogar** mediante `scene-policy.ts` (precedente: `CREATE_SHARE_LINK` de alcance `HOUSEHOLD` en `rbac.ts`); sin hogar explícito decide la propiedad de la escena. «ADMIN» es el rol de hogar de 002, no un administrador de plataforma (`H-TRI-006-15`); el propietario del hogar puede borrar la foto subida por un `ADMIN`.

**Códigos `SCENE_STATE` (`H-MERO-006-24`)**. Los cuatro códigos con `surface = SCENE_STATE` (`ERR-SCENE-GENERATION-FAILED`, `ERR-SCENE-GENERATION-TIMEOUT`, `ERR-SCENE-INVALID-IMAGE`, `ERR-SCENE-LEASE-EXPIRED`) viajan solo en `SceneView.lastError` y **no son respuestas HTTP**: el mapeador de errores HTTP no los traduce y la suite de errores de la 006 distingue ambas superficies (`SC-ESC6-090`). `SceneErrorCode` de `scene.schema.json` y el catálogo repiten esos cuatro valores: `/keymaker` genera el tipo desde el catálogo y no desde dos fuentes (`H-MIF-006-12`). Las seis operaciones `/me/*` espejan las de `/households/{id}/*` y comparten un solo manejador parametrizado por ámbito, sin casos de uso duplicados.

#### Puerto `ScenePrivacyHooksPort` (ratificado por `/architect` el 2026-11-18; origen `H-KEY-F2-1`, enmienda `N2-06` (d))

Archivo: `src/application/ports/scene-privacy-hooks.port.ts` (T827). Los ganchos son el **único** punto por donde los casos de uso `LOCKED` de 002/004/005 tocan la escena; ninguno importa `scene-use-cases` ni el dominio de escena (`INV-ARCH-001/002`).

```ts
export interface ScenePrivacyHooksPort {
  onPetRemoved(repositories: RepositorySet, event: { petId: string; cause: 'PET_DELETED' | 'AVATAR_DELETED'; now: string }): Promise<void>;
  onPetUnassigned(repositories: RepositorySet, event: { petId: string; householdId: string; now: string }): Promise<void>;
  onMemberRemoved(repositories: RepositorySet, event: { householdId: string; userId: string; cause: 'LEFT' | 'REMOVED'; now: string }): Promise<void>;
  onHouseholdCreated(repositories: RepositorySet, event: { householdId: string; ownerUserId: string; now: string }): Promise<void>;
  onHouseholdDeleting(repositories: RepositorySet, event: { householdId: string; now: string }): Promise<void>;
  onAccountDeleting(repositories: RepositorySet, event: { userId: string; pseudonym: string; householdIds: readonly string[]; now: string }): Promise<void>;
  onPetOwnershipTransferred(repositories: RepositorySet, event: { petId: string; previousOwnerUserId: string; newOwnerUserId: string; now: string }): Promise<void>;
  onBackupImported(repositories: RepositorySet, event: { ownerUserId: string; replacedPetIds: readonly string[]; now: string }): Promise<void>;
}
```

Reglas del contrato (cada una es una aserción de las suites de T815 y de T827):
1. **Misma transacción (atomicidad).** El caso de uso invoca el gancho dentro del `uow.run` de la operación original, con el `RepositorySet` de esa transacción; el gancho no abre ni cierra transacción, no usa otro `UnitOfWork` y no hace E/S externa (ni almacenamiento ni cola de tareas ni red): solo escribe filas, incluida la fila `INTENT` en `media_deletion_queue`; el borrado físico ocurre después del `COMMIT` por la conciliación de 004. Si el gancho lanza, la causa entera se revierte (ROLLBACK completo, sin efectos parciales de escena).
2. **Orden respecto de la mutación.** Los ganchos de retiro (`onPetRemoved`, `onPetUnassigned`, `onMemberRemoved`, `onHouseholdDeleting`, `onAccountDeleting`, `onPetOwnershipTransferred`, `onBackupImported`) se invocan **antes** de la mutación de la causa, para que el gancho aún lea mascotas, asignaciones y membresías; `onHouseholdCreated` se invoca **después** de insertar el hogar. Dentro de una operación, el gancho respeta el orden de candados propietario → mascota → hogar → escena (`ADR-006-07`): el caso de uso toma los suyos primero y el gancho toma el de escena al final.
3. **Eventos opacos.** Solo identificadores (`petId`, `householdId`, `userId`, `ownerUserId`, `previousOwnerUserId`, `newOwnerUserId`, `replacedPetIds`, `householdIds`), un valor de `cause` de lista cerrada, el seudónimo HMAC que 002 ya persiste en auditoría (`pseudonym`) y `now` (UTC canónico de `ClockPort.nowIsoTimestamp()`, inyectado por el caso de uso: los ganchos no leen reloj). Prohibido en un evento: nombres, fotos, claves de objeto, textos libres, correos (`INV-ESC6-016`, `REQ-ESC6-021`). Cada gancho recibe el evento como valor inmutable y devuelve `Promise<void>` (`INV-ARCH-005`).
4. **Sin escena, sin efecto.** Si la escena afectada no existe, el gancho no escribe nada y no crea filas (`INV-ESC6-019`); es idempotente ante repetición del mismo evento (reintento de la causa).
5. **Un evento por causa.** `onMemberRemoved` subsume la desasignación de las mascotas de ese miembro dentro de la misma operación: el caso de uso **no** invoca además `onPetUnassigned` por cada mascota (evita doble retiro). `onHouseholdDeleting` y `onAccountDeleting` subsumen la baja de asignaciones del hogar. `onPetUnassigned` solo lo invoca `assignment-use-cases` (desasignación explícita, `D6-17`).
6. **Opcionalidad.** `ApplicationDeps.sceneHooks?: ScenePrivacyHooksPort` (campo opcional, como `media?` y `sharing?`); ausente = comportamiento actual de 001..005 sin cambio. T827 entrega la **implementación nula** (los 8 ganchos devuelven `Promise.resolve()`); la lógica real llega en T862..T868. La purga diaria de avatares, `ARGOS_SCENE_MAX_PETS` y los demás escritores de entradas no tienen gancho (`SC-ESC6-086`).

Cobertura de los 7 casos de uso de `N2-06` (d) (T815 / T862..T868):

| Caso de uso | Gancho(s) | Tarea de implementación |
|---|---|---|
| `pet-use-cases` (baja) | `onPetRemoved` `cause = PET_DELETED` | T862 |
| `avatar-use-cases` (borrado) | `onPetRemoved` `cause = AVATAR_DELETED` | T862 |
| `assignment-use-cases` (desasignación) | `onPetUnassigned` | T863 |
| `household-use-cases` | `onMemberRemoved` (salida/expulsión), `onHouseholdCreated`, `onHouseholdDeleting` | T863, T864, T865 |
| `account-use-cases` (`deleteWithMemberships`) | `onAccountDeleting` | T865 |
| `ownership-use-cases` (transferencia) | `onPetOwnershipTransferred` | T866 |
| `backup-use-cases` (importación) | `onBackupImported` | T867 |

`media-use-cases` (cuota de 1 GiB) **no** usa este puerto: cambia `countBytesOfOwner` (T813/T814, T868 cierra la suite). `/keymaker` aplica en `tests/fixtures/scene-privacy-hooks-spy.ts` el cambio listado por `/architect` en el handback (ver `claude/log-architect.md`).

### 1.3 `infrastructure/`
| Componente | Detalle |
|---|---|
| `FakeSceneImageGenerator` | Determinista: devuelve un PNG fijo de 1x1 ampliado en memoria o un binario de fixture; modos de fallo/lento/respuesta inválida/eco de prompt para `SC-ESC6-017/018/046/062`; registra llamadas (0 llamadas en los SC de «no llama»). Es el **único adaptador activo** (`REQ-ESC6-031`, `SC-ESC6-050`) |
| `GeminiApiSceneImageGenerator` (**solo desarrollo local privado, `D6-18`, `REQ-ESC6-037`**) | `fetch` nativo inyectable, sin dependencia npm; host y ruta constantes `https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` (modelo validado con el patrón de lista cerrada); clave **solo** en la cabecera `x-goog-api-key` (nunca `?key=`); `redirect: 'error'`; `request.signal` ligado a `T_GEN`; sin reintento interno; sin eco del cuerpo de error ni del prompt; salida aceptada solo por firma PNG/WebP y normalizada después por `stripGeneratedImageMetadata` (`REQ-ESC6-035`). Se compone con `realDriver: true`, despachador en proceso, `providerId = 'gemini-api'` y `noticeVersion` propia, para que `INV-ESC6-014` exija consentimiento. Nunca arranca con `NODE_ENV=production` (`INV-ESC6-020`). Diseño detallado en `audits-gemini-api-diseno.md` |
| `VertexSceneImageGenerator` | `fetch` nativo inyectable; host constante `{location}-aiplatform.googleapis.com` con `location` constante `us-central1` (`D6-01`); `ARGOS_SCENE_MODEL` y el proyecto se validan con regex de lista cerrada antes de formar la URL (sin `/`, `?`, `..`); `redirect: 'error'`; `AbortSignal.timeout(T_GEN)`; token del servidor de metadatos con caché de ~55 min que **nunca** pasa por un serializador de registros; sin importar `google-auth-library`; sin registrar cuerpo de petición ni respuesta; **captura, mapea a `SceneErrorCode` y descarta** toda excepción de red o de aborto (sin `err`, `cause` ni `stack` con URL, `H-TRI-006-14`). **Código inactivo**: no seleccionable con `NODE_ENV=production` hasta cumplir `REQ-ESC6-028` y la enmienda (bandera de configuración `ARGOS_SCENE_DRIVER=real` rechazada al arranque mientras no exista la constante de activación en el código, que fija `/keymaker` tras la firma de Neo). Se entrega como esqueleto con contrato de errores y pruebas con `fetch` falso hasta verificar con red los datos de `research.md` §2.2 |
| `InProcessSceneDispatcher` / `CloudTasksSceneDispatcher` | El primero ejecuta `runSceneGeneration` con `setImmediate` (desarrollo y CI); el segundo hace `POST https://cloudtasks.googleapis.com/v2/projects/{p}/locations/{l}/queues/{q}/tasks` con token de metadatos, nombre de tarea = `attemptId` (deduplicación), `dispatchDeadline` de 130 s y cuerpo `SceneWorkerTask`. **La URL de destino y la audiencia salen solo de `ARGOS_SCENE_WORKER_URL`** (validada al arranque), nunca de `Host`, `X-Forwarded-*` ni de ningún dato de la petición (`INV-ESC6-018`). Se selecciona por `NODE_ENV` (producción = cola; desarrollo y pruebas inyectan el adaptador en proceso) |
| `stripImageMetadata` (función inyectada) | §5.4 |
| `SqlSceneRepository` | Adaptadores SQLite y Postgres con paridad; migración M-1 de `data-model.md` |
| Rutas | `scene.routes.ts`, `household-photo.routes.ts`, `scene-consent.routes.ts`, `scene-worker.routes.ts` (OIDC con audiencia propia y correo exacto, §6.3; extensión del ámbito de `jose` a `/internal/scene-worker` con audiencia y correo propios por ruta, autorizada en `N2-07` = A). Un componente de cabeceras común (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`) para todas las respuestas 302 y de escena (`H-TRI-006-13`) |
| `config/app-config.ts` | **Único** lugar que lee `ARGOS_SCENE_*` (`INV-ARCH-006`; regla Semgrep `argos-no-process-env`); validación al arranque (`INV-ESC6-013`) |

**Variables de configuración reducidas (`H-MIF-006-06`)**. Se pasa de 13 a 9; todas con rango validado (fuera de rango impide arrancar). Las que no son ajustes sino invariantes del release pasan a **constantes de código**:

| Variable | Defecto | Rango o regla |
|---|---|---|
| `ARGOS_SCENE_DRIVER` | `fake` | `fake` \| `real` \| `gemini-api`; con `NODE_ENV=production` se exige `real` y `real` exige la constante de activación y el modelo (`SC-ESC6-025`); `gemini-api` y `fake` se rechazan en producción (`SC-ESC6-097`, `INV-ESC6-020`) |
| `GEMINI_API_KEY` (solo `gemini-api`, `REQ-ESC6-037`) | sin valor | obligatoria con `gemini-api`, 20..256 caracteres sin espacios ni saltos de línea; se ignora con `fake` y `real`; vive solo en el `.env` local, nunca en Terraform, Secret Manager ni GitHub Actions (`REQ-ESC6-038`) |
| `ARGOS_SCENE_GEMINI_MODEL` (solo `gemini-api`) | sin valor | obligatoria con `gemini-api`; mismo patrón de lista cerrada que `ARGOS_SCENE_MODEL`; se ignora con `fake` y `real` |
| `ARGOS_SCENE_MAX_PETS` | 8 | 1-32 (`D6-02`) |
| `ARGOS_SCENE_QUOTA_MAX` | 10 | 1-50 (`D6-03`; tope bajado de 1000 a 50, `H-TRI-006-02`) |
| `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` | 90 | 10-105 (`T_GEN`; el máximo deja 15 s de margen bajo el `timeout` de 120 s de Cloud Run, `H-LCK-006-16`) |
| `ARGOS_SCENE_MODEL` | vacío | obligatoria con `real`; lista cerrada/regex (§research 2.2) |
| `ARGOS_SCENE_QUEUE` | `argos-scene` | nombre de cola, regex de identificador (con producción) |
| `ARGOS_SCENE_TASKS_SA_EMAIL` | sin valor | obligatoria en producción; correo **exacto** de la cuenta `argos-scene-tasks` (`REQ-ESC6-033`) |
| `ARGOS_SCENE_WORKER_URL` | sin valor | obligatoria en producción; `https`, host `*.run.app` o dominio propio configurado, ruta exacta `/internal/scene-worker`, sin consulta ni credenciales; es destino **y** audiencia (`INV-ESC6-018`) |
| `ARGOS_SCENE_PROJECT_ID` | sin valor | obligatoria con `real` o con la cola; regex de identificador de proyecto |

El tope global mensual `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (`N2-02` = A) **no es una variable de entorno**: es una fila de `platform_parameters` (patrón de 005) que se introduce con la compuerta del driver real y **no se implementa en el tramo fake**; por eso las variables siguen siendo 9.

Constantes de código (no son variables de entorno): `NOTICE_VERSION` y `PROVIDER_ID` (viven junto al aviso empaquetado en el cliente; si divergieran por entorno el consentimiento quedaría inválido, `H-MIF-006-06`); `T_LEASE = T_GEN + 60` (150 s con `T_GEN` = 90, `D6-03`; cumple `T_LEASE ≥ T_GEN + 30`); `T_QUEUE = 600 s` (espera máxima en cola antes del claim); `SCENE_POLL_SECONDS = 3` del cliente (`REQ-ESC6-019` conserva el nombre documentado `ARGOS_SCENE_POLL_SECONDS` como constante del cliente, no como variable del servidor); `LOCATION = us-central1`; límites de `REQ-ESC6-034` (enfriamiento 60 s, 3 fallidos por escena en 24 h, 12 intentos por actor en 24 h) y de tasa por usuario (`generate` 6/h, `PUT` de foto 10/h, consentimiento 10/h; valores propuestos por el Architect a partir de `trinity-006-diseno.md`, `/oracle` y Neo pueden ajustarlos). `ARGOS_SCENE_REF_MAX_PX` **no se declara** hasta resolver `N2-01`; `REQ-ESC6-027` la nombra y basta esa mención. `ARGOS_SCENE_GLOBAL_QUOTA_MAX` y el interruptor de corte siguen **sin decidir** (`N2-02`). Las variables **no** van en `cloud_run.tf` (su `env` está en `ignore_changes`): las añade `deploy-argos.yml` con `--set-env-vars`, que reemplaza todo el entorno (`link-006-iac.md` §6.2; es cambio de CI de Nivel 2, `N2-08`).

## 2. Flujos

### 2.1 Pulsar «Actualizar imagen del hogar»
```mermaid
sequenceDiagram
  participant U as Usuario (propietario/ADMIN)
  participant API as Fastify (Cloud Run)
  participant DB as Base de datos
  participant Q as Cloud Tasks / dispatcher
  participant W as /internal/scene-worker
  participant G as SceneImageGeneratorPort
  participant S as Cloud Storage
  U->>API: POST /households/{id}/scene/generate (Idempotency-Key, X-Argos-Request)
  API->>DB: T1 candado escena; rol; consentimiento; cuota y contadores; decideMode; CAS a generating; intento con result_object_id; INTENT
  API->>Q: enqueue({sceneId, attemptId}) tras COMMIT
  API-->>U: 202 SceneView(status=generating)  (<= 1 s)
  Q->>W: POST (OIDC: audiencia propia + correo exacto)
  W->>W: verifica identidad ANTES de parsear el cuerpo (<= 1 KiB)
  W->>DB: claim PENDING->RUNNING (CAS); lease desde claimed_at (si 0 filas: 204)
  W->>S: lee referencias (avatares efectivos, foto del hogar, escena previa) con límites de MP y bytes
  W->>G: generate(prompt, references, signal T_GEN)
  G-->>W: imagen o SceneErrorCode
  W->>W: valida salida por firma y tamaño; revisa señal de aborto y lease
  W->>S: put imagen en result_object_id
  W->>DB: T2 candado; recomprueba dueños de datos; publica imagen + cuota + borra INTENT
  U->>API: GET scene (sondeo cada 3 s) -> estado derivado
```

### 2.2 Fallos y recuperación
`FAILED` (proveedor, timeout, imagen inválida, almacenamiento) → intento `FAILED`, `run_state = 'failed'`, imagen anterior intacta, 0 cuota (`INV-ESC6-005`). Tarea que nunca llega (cola caída, instancia terminada, cola saturada): si no hay claim antes de `T_QUEUE` (600 s) o el arrendamiento desde el claim (150 s) vence, la lectura siguiente o el mantenimiento diario materializa `failed` con `ERR-SCENE-LEASE-EXPIRED`, convierte el `INTENT` huérfano en `DELETE` y cierra el intento (`EDGE-ESC6-003/021/026`). Un `enqueue` ambiguo no marca `failed` (`EDGE-ESC6-032`). Un reintento tras un fallo está sujeto a enfriamiento y a los contadores de `REQ-ESC6-034` (429 `ERR-RATE-LIMITED`); una clave de idempotencia ya consumida por un intento terminal no bloquea un intento nuevo con clave nueva. Reintentos automáticos: 0 (`maxAttempts = 1` de la cola).

### 2.3 Regenerar desde cero
`REGENERATE` pasa por el estado `outdated` **de la derivación**: no hace falta escribir `outdated` (no se persiste); el compare-and-set a `generating` acepta `run_state` nulo o `failed` con la acción `REGENERATE`, sin exigir cambios pendientes. Si la transacción T1 falla no queda ningún rastro (no existe un `outdated` persistido que limpiar). Se mantiene la máquina cerrada: la pareja lógica `ready → generating` sigue rechazada; `REGENERATE` desde `ready` se expresa como `ready → outdated` (por la acción) y `outdated → generating` en la misma transacción (`ADR-006-05`).

## 3. Reglas de decisión del modo (`REQ-ESC6-006`, `D6-08`)
| Condición (en este orden) | `mode` | Acciones por mascota |
|---|---|---|
| Acción del usuario = REGENERATE | `REGENERATE` | todas `RENDER` |
| No existe imagen vigente | `FROM_SCRATCH` | todas `RENDER` |
| Cambió la foto del hogar efectiva (alta, reemplazo, baja, o cambió el consentimiento sobre ella) | `FROM_SCRATCH` | todas `RENDER` |
| Solo hay mascotas nuevas | `INCREMENTAL_ADD` | nuevas `ADD`; resto `KEEP` |
| Solo hay mascotas retiradas | `INCREMENTAL_REMOVE` | retiradas `REMOVE`; resto `KEEP` |
| Solo cambió la foto efectiva de algunas | `INCREMENTAL_REPLACE` | cambiadas `REPLACE`; resto `KEEP` |
| Más de un tipo de los tres anteriores | `INCREMENTAL_MIXED` | `ADD`, `REMOVE`, `REPLACE`, `KEEP` |
Una mascota que entra por la eliminación de otra (`B7`) cuenta como `ADD`; una que sale por tope cuenta como `REMOVE`. Cambios en entradas no visibles no generan acción (`EDGE-ESC6-002`).
**Referencias de las `KEEP` (enmienda 2026-11-19, `T924`, `D6-20`)**: en `INCREMENTAL_ADD`, `INCREMENTAL_REPLACE` e `INCREMENTAL_MIXED` las `KEEP` con foto vigente y consentimiento reciben ranura `IMG_n` (`PetPlan.ref` no nulo, hoy `null` para toda `KEEP`), además de las `ADD` y `REPLACE`; `INCREMENTAL_REMOVE`, `FROM_SCRATCH` y `REGENERATE` no cambian. `IMG_1` sigue siendo la escena previa. **Orden de las ranuras `KEEP` y desempate de bytes: `N2-16` (pendiente)**: opción A (orden de selección, el código actual de `fit` conserva el mayor prefijo) o B recomendada (primero las ranuras de `ADD` y `REPLACE`, luego las `KEEP`; `fitReferencesWithinBudget` no cambia: el prefijo ya descarta las últimas). Cota de imágenes por llamada: `1 + N` en incrementales (escena previa más una por mascota visible con foto), igual a la cota `N + 1` desde cero; `research.md` §2.2 se corrige en consecuencia. `scene-spec.ts` y `scene-payload.ts` no cambian de código: derivan `hasReferencePhoto` y `photoRef` de la ranura. Ensayo de privacidad: el conjunto de dueños de `scene_image_sources` no gana usuarios nuevos (las `KEEP` ya figuraban en la imagen previa).

## 4. Cumplimiento de la constitución y de los INV-ARCH

| Regla | Cómo se cumple en la 006 | Verificación |
|---|---|---|
| `INV-ARCH-001` sin reloj en `domain/` y `application/` | `now` solo por `ClockPort`; la ventana `YYYY-MM` entra ya resuelta; `Date.now` y `new Date()` ausentes en `domain/scene` y casos de uso; `AbortSignal.timeout`, `setImmediate` y temporizadores viven **solo en `infrastructure`**, y `runSceneGeneration` recibe la señal por el puerto (regla `argos-no-entropy-outside-adapters`, `H-MERO-006-21`) | `layer-dependencies.spec.ts` **ya** cubre `src/domain/scene` (recorre `src/domain` recursivamente: no hay nada que ampliar para capas); lo nuevo es la prueba de entropía y reloj sobre `scene` (`SC-ESC6-023`) |
| `INV-ARCH-002` sin entropía | `IdGeneratorPort` para `sceneId`, `attemptId`, `result_object_id`, claves de objeto; la clave de idempotencia entra del cliente y solo se hashea | idem |
| `INV-ARCH-003` `src/generated/` inmutable | Los tipos de `scene-payload`, `scene` y los códigos de error vienen de `compile-contracts.sh` (rama de la 006 a `src/generated/v34/`, `N2-08`); el dominio solo puede importar el tipo `scene-payload` si `src/generated/index.ts` exporta `v34` (hay que prever la barrel); ninguna edición manual | `git diff --stat src/generated` solo tras compilar por orden de `/keymaker` |
| `INV-ARCH-004` capas concéntricas | `domain/scene` sin imports de `application`, `infrastructure` ni `node:*`; el `fetch` y los tokens de metadatos solo en `infrastructure`; `presentation/` no contiene reglas de cuota ni de huella (`INV-ESC6-002`) | `layer-dependencies.spec.ts` |
| `INV-ARCH-005` puertos asíncronos y listos para Cloud | `SceneRepository` en SQLite y Postgres con prueba de contrato y paridad; `runInTransaction`; `stripImageMetadata` es función, no puerto | suites de contrato de repositorio |
| `INV-ARCH-006` configuración aislada | `process.env` solo en `config/app-config.ts`; validación al arranque (`SC-ESC6-034`, `SC-ESC6-092`) | prueba existente de configuración |
| Principio VI (stack) | **Sin dependencia npm nueva** (`SC-ESC6-050`); `gemini-api` solo en desarrollo local privado bajo la enmienda 3.7.0 (`N2-13`, tope de referencia 5 USD/mes en consola); nueva carpeta `src/domain/scene` dentro del árbol; extensión del ámbito de `jose` a `/internal/scene-worker` con segunda identidad (autorizada, `N2-07` = A); pago de Vertex bajo la excepción acotada (aprobada, `N2-12`, condicionada a `REQ-ESC6-028`) | `package.json` y lock sin cambios |
| Principio V.4 (404 sin revelar) | `INV-ESC6-007`, `SC-ESC6-026` | tests de seguridad |

## 5. Decisiones de diseño detalladas

### 5.1 Selección, huella y estado
La huella siempre se **calcula** desde el estado vivo (nunca se persiste derivada). **El estado `idle|outdated|ready` tampoco se persiste**: se deriva en lectura con `deriveStatus` (`data-model.md` §4, `ADR-006-09`); lo persistido es solo `run_state` (`generating|failed`), las columnas `image_*` con el `inputs_snapshot` de la última imagen y el intento con el suyo. No existe `recomputeSceneStatus` ni ganchos de estado en los casos de uso de 002, 004 y 005 (`H-MIF-006-01`); sí existen los ganchos de privacidad de §1.2. Foto efectiva: `avatar_object_id` de la mascota **si** su Propietario Legal tiene consentimiento vigente (driver real; con el simulado se trata como consentido para el flujo de pruebas, `REQ-ESC6-023`) y la foto del hogar **si** el propietario del hogar u `ADMIN` que la subió conserva consentimiento (`D6-16` = A).

### 5.2 Consentimiento (`REQ-ESC6-023..026`)
Tabla `scene_consents`; el consentimiento es del **usuario**, por alcance, versión del aviso y proveedor. La llamada real exige el consentimiento vigente del usuario que pulsa **y** la inclusión de cada foto ajena exige el de su dueño; el worker y **T2** lo recomprueban (`REQ-ESC6-036`, `EDGE-ESC6-025`). El aviso vive en el paquete del cliente (`aviso-consentimiento-borrador.md`); el servidor solo conoce `noticeVersion` y `providerId` (constantes de código). Riesgo residual declarado: el retiro de consentimiento a mitad de una llamada no puede recuperar datos ya enviados al proveedor (`RR-06-11`, `REQ-ESC6-025`).

### 5.3 `buildImagePrompt(payload)`: plantillas deterministas
Orden de bloques y separador: `"\n\n"`. Todo texto fijo en inglés; el único contenido variable son enums del dominio, `breed`/`speciesOther` sanitizados y las etiquetas `IMG_n`. Nunca se emiten `id`, nombres ni `biography`/`fallbackContext` (`INV-ESC6-010/017`). **El contenido variable se inserta entre delimitadores que la propia plantilla declara como datos** y ya saneado por la lista blanca de `INV-ESC6-011` (sin `[ ] { } < > : ;`, sin comillas ni caracteres `\p{C}`); no se usan corchetes de estructura para contenido variable (`H-TRI-006-04`). **Regla de raza (Decisión de Fase 5, 2026-11-18, `H-KEY-F5-2`)**: si `breedCode` está en la tabla del Anexo A se usa el **nombre canónico en inglés** y se ignora el texto libre; en cualquier otro caso se usa «friendly mixed-breed {species} ({sex})» y **el texto libre `breed` nunca entra al prompt** (cierra la brecha `EDGE-ESC6-015` / `REQ-ESC6-009`). Solo `speciesOther` (sanitizado, entre comillas) entra como texto libre.
1. **Base de estilo** (siempre; Decisión de Fase 5, 2026-11-18, `H-KEY-F5-2`): constante normativa `STYLE_BASE_TEXT`, byte a byte la «Base de estilo» de `claude/requerimiento-escena-hogar-pixel-art.md` («Plantilla de referencia», bloque 1): «Create a single cohesive high-detail 32-bit isometric pixel art cutaway illustration of a cozy, sunlit home living room. Crisp pixel edges, clean indie game aesthetic, harmonious palette of forest green (#1d4f3a), soft pastel mint (#e6f2ea), warm cream (#f4f8ef), and sky blue (#eaf6ff). Include warm pet-care details like ceramic food and water bowls, potted houseplants, and soft natural morning light. No text, no blur, no anti-aliasing.» `DEFAULT_SCENE_STYLE` (bloque `style` del payload) debe ser coherente con ella: `palette = ["#1D4F3A","#E6F2EA","#F4F8EF","#EAF6FF"]`, `lighting` = «soft natural morning light», `constraints` = [«No text», «no blur», «no anti-aliasing»]; el texto emitido es siempre `STYLE_BASE_TEXT` (no se recompone desde las ranuras). Alternativa rechazada: texto de estilo propio del implementador (paleta distinta de la firmada en el requerimiento).
2. **Hogar** (solo `FROM_SCRATCH` y `REGENERATE`): con foto → «Use IMG_n as the exact visual reference for the room's layout, furniture, wall colors, and atmosphere, translating it into this 32-bit isometric pixel art style.»; sin foto → «Design a warm, generic modern living room interior with wooden floors, a cozy armchair, pet beds, and a large sunny window.»
3. **Mascotas** (en `RENDER`, `ADD`, `REPLACE`): con foto → «Use IMG_n as the exact visual reference for this pet, faithfully preserving its species, fur colors, coat patterns, ear shapes, proportions, and unique markings.»; sin foto y con nombre canónico → «Include a {species} (breed {CanonicalName}, sex {sex}) resting naturally in the room»; con `breedCode` ∈ {`DOG_CRIOLLA`, `CAT_CRIOLLA`, `*_OTHER`}, `breedCode` fuera del Anexo A o `breed` libre → «Include a friendly mixed-breed {species} ({sex}) resting naturally in the room» (`D6-14`; sin el texto libre); `species = OTHER` usa `speciesOther` (saneado, entre comillas como etiqueta) como `{species}`. Cierre solo con N ≥ 1 mascotas renderizadas (las `REMOVE` no cuentan en N): «Place all {N} pets naturally and separately in different cozy spots of the room without merging or omitting any of them.» **Enmienda 2026-11-19 (`T901`, aprobada por Neo)**: en modos desde cero cada línea de mascota `RENDER` se emite como `Pet {k}: {frase de mascota}` con `k` ordinal 1-based en el orden del payload (orden de selección de `decide-mode`); no es id ni nombre (`INV-ESC6-010/017`); las frases y el cierre «Place all {N} pets…» no cambian; el bloque incremental conserva «- Add: …» sin numerar.
4. **Incremental** (modos incrementales): `ADD`, `REMOVE`, `REPLACE` con las frases del requerimiento; `INCREMENTAL_MIXED` se **compone con las tres plantillas ya existentes** (no es una cuarta plantilla propia, `H-MIF-006-05`): «Use IMG_1 as the exact base scene. Keep the room, furniture, and all other pets in their exact positions and appearance without altering them. Apply only these changes, one per line:» seguido de las líneas fijas «- Add: …», «- Remove only: …» y «- Replace only: …» (solo las que apliquen), y cierra «Match the exact 32-bit isometric pixel art style, lighting, and palette.». **Enmienda 2026-11-19**: cuando una mascota `ADD` o `REPLACE` lleva foto, el bloque `PIXEL_REDRAW_RULE` (ver abajo) se inserta, separado por línea en blanco, antes de ese cierre. La descripción de una mascota retirada (`TARGET_PET_DESCRIPTION`) se compone con `species` y el nombre de raza saneado, y `sex`, sin nombre; dos mascotas retiradas indistinguibles son una limitación declarada (`RR-06-02`).
**Payload incremental (Decisión de Fase 5, 2026-11-18, `H-KEY-F5-1`)**: en `INCREMENTAL_REMOVE`/`MIXED` el payload lleva una entrada `REMOVE` por mascota retirada de la imagen previa, tomadas del snapshot anterior y colocadas al final de `pets`; con 0 mascotas visibles y modo incremental, `pets` contiene solo las `REMOVE` (nunca `[]`, porque entonces no habría cambio que pedir). `pets = []` solo en `FROM_SCRATCH`/`REGENERATE` con 0 mascotas.
**Redibujado en pixel art (enmienda 2026-11-19, `T901`)**: constante de dominio `PIXEL_REDRAW_RULE`, texto fijo en inglés sin contenido variable: «Treat every photographic reference image strictly as a visual guide: redraw the room and every pet entirely in the 32-bit isometric pixel art style, and leave no photographic pixels, textures, or realistic regions anywhere in the image.» Se emite como bloque propio (separador `"\n\n"`) **solo si algún bloque emitido lleva `photoRef` no nulo**; en modos desde cero va tras el bloque de mascotas y su cierre «Place all {N} pets…»; en modos incrementales, antes de `STYLE_CLOSING`. Los casos sin foto no cambian de byte; `STYLE_BASE_TEXT` y las frases existentes no se modifican. **Regresión 4a**: `decide-mode.ts` no cambia; alta, reemplazo o borrado de la foto del hogar con imagen vigente ya produce `FROM_SCRATCH` (precedencia de §3) y se fija con `SC-ESC6-107`. **Cableado (`REQ-ESC6-037`)**: `buildGeminiBody` antepone a cada `inlineData` una parte `{text: "IMG_n:"}` con `r.ref` del puerto; sin referencias `parts = [{text: prompt}]` (`SC-ESC6-104`). **Presentación (§5.7, `REQ-ESC6-007`, `REQ-ESC6-019`)**: sin `imageTag` no se renderiza «Regenerar escena desde cero» (`SC-ESC6-108`); el bloque `OWNER` se oculta solo con `pets.total = 0`, `imageTag = null` y ambos consentimientos en `false`, y se recarga al cambiar la lista de mascotas (`SC-ESC6-109`).
Asignación de ranuras: `IMG_1` = escena previa (incremental) o foto del hogar (si existe, en modos desde cero); luego las mascotas con foto en orden de selección. Las fixtures canónicas (una por modo y por combinación) fijan el texto byte a byte (`SC-ESC6-023`).

### 5.3.1 Especificación JSON saneada y regla de conteo (enmienda 2026-11-19, `T911`, `D6-19`)
Módulo de dominio nuevo `src/domain/scene/scene-spec.ts` con `buildSceneSpec(payload): SceneSpec` (pura, `INV-ARCH-001/002`, sin `process.env`) y las constantes `SCENE_SPEC_INTRO` y `PET_COUNT_RULE`; `build-image-prompt.ts` solo las compone. Reutiliza `canonicalBreedName` y `sanitizeFreeText`; `decide-mode.ts`, `pet-phrases.ts` y el payload no cambian. **Esquema exacto** (todo `object` con estas claves y ninguna otra; el orden de las claves es el de esta tabla):

| Ruta | Tipo | Valores |
|---|---|---|
| `mode` | string | enum `SceneMode` del payload (`FROM_SCRATCH`, `INCREMENTAL_ADD`, `INCREMENTAL_REMOVE`, `INCREMENTAL_REPLACE`, `INCREMENTAL_MIXED`, `REGENERATE`) |
| `household.hasReferencePhoto` | boolean | `payload.household.hasReferencePhoto` |
| `household.photoRef` | string o null | `^IMG_[1-9][0-9]?$` o `null` |
| `renderedPetsCount` | integer ≥ 0 | `pets.length` de este objeto (calculado, nunca literal) |
| `pets` | array | mascotas visibles en la imagen resultante: desde cero todas (`RENDER`); incremental `KEEP`, `ADD`, `REPLACE` (se excluyen las `REMOVE`); orden del payload |
| `pets[].index` | integer | 1..N, ordinal (coincide con `k` de `Pet k:` en modos desde cero) |
| `pets[].action` | string | `RENDER`, `KEEP`, `ADD`, `REPLACE` |
| `pets[].species` | string | enum `Species` (`CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER`) |
| `pets[].speciesOther` | string | solo si `species = OTHER` y `sanitizeFreeText` devuelve valor (1..60, lista blanca de `INV-ESC6-011`); si no, la clave se omite |
| `pets[].breed` | string | nombre canónico en inglés del Anexo A según `breedCode`, o el literal `mixed-breed` (D6-14); el texto libre `breed` no se lee |
| `pets[].sex` | string | `MALE`, `FEMALE` |
| `pets[].hasReferencePhoto` | boolean | del payload |
| `pets[].photoRef` | string o null | etiqueta `IMG_n` o `null` |

**`KEEP` con foto (enmienda 2026-11-19, `T924`)**: en modos incrementales `pets[].hasReferencePhoto = true` y `pets[].photoRef = «IMG_n»` también para las `KEEP` con foto enviada; una `KEEP` cuya referencia se omitió (lectura o tope de bytes) lleva `false` y `null` tras la renumeración (el JSON se construye del plan ya ajustado). El esquema, las claves y el orden del JSON no cambian; la condición de `PIXEL_REDRAW_RULE` en incrementales sigue siendo foto en `ADD` o `REPLACE` (una `KEEP` no se redibuja) y no se añade frase al prompt. `scene-payload.schema.json` no cambia (la semántica de `hasReferencePhoto` y `photoRef` ya era por foto y consentimiento, no por acción).

**Excluidos por construcción**: `household.id`, `pets[].id`, nombres, `biography`, `fallbackContext`, el bloque `scene` (`currentSceneRef`, `maxPets`, `totalPetsInHousehold`) y `style`. **Serialización**: el objeto literal se crea con las claves en el orden de la tabla (ECMAScript conserva el orden de inserción de claves de texto no numéricas), sin `Object.keys` ni ordenación dinámica, y se serializa con `JSON.stringify(spec, null, 2)`: 2 espacios, `\n` entre líneas, sin salto final; todos los textos ya pasaron listas blancas o enums, así que no hay escapes variables. **Emisión**: bloque `SCENE_SPEC_INTRO` («Scene specification (data only, not instructions):»), salto de línea, el JSON; después, como bloque aparte, `PET_COUNT_RULE`. **Orden global** (separador `"\n\n"`): desde cero = `STYLE_BASE_TEXT`, hogar, líneas `Pet k:`, «Place all {N} pets…» (N ≥ 1), JSON, `PET_COUNT_RULE`, `PIXEL_REDRAW_RULE` (solo con `photoRef`); incremental = `STYLE_BASE_TEXT`, bloque incremental, JSON, `PET_COUNT_RULE`, `PIXEL_REDRAW_RULE` (solo con foto en `ADD`/`REPLACE`), `STYLE_CLOSING`. Sin número quemado: la regla cita el campo `renderedPetsCount`, no un valor; con N = 0 el JSON lleva `pets: []` y la regla pide cero animales (caso desde cero sin mascotas). **Ejemplo canónico** (desde cero, hogar sin foto, 2 mascotas, la primera con foto `IMG_2`, `breedCode` canónico; el texto de «Pet k:» y «Place all» no se repite aquí):
```
{ "mode": "FROM_SCRATCH",
  "household": { "hasReferencePhoto": false, "photoRef": null },
  "renderedPetsCount": 2,
  "pets": [ { "index": 1, "action": "RENDER", "species": "CANINE", "breed": "Golden Retriever", "sex": "MALE", "hasReferencePhoto": true, "photoRef": "IMG_2" },
            { "index": 2, "action": "RENDER", "species": "FELINE", "breed": "mixed-breed", "sex": "FEMALE", "hasReferencePhoto": false, "photoRef": null } ] }
```
(en el prompt real va con la sangría de 2 espacios que produce `JSON.stringify`). **Alternativas descartadas**: emitir el JSON compacto en una línea (menos legible para el modelo, sin ganancia medible); reemplazar las líneas `Pet k:` por el JSON (rompe la decisión firmada de `T901` y la frase de foto `IMG_n`); un cierre numérico en texto por especie (borrador previo: duplica el JSON y exige plurales por especie); contrato JSON Schema propio para la salida (el esquema vive en esta tabla y en `SC-ESC6-116/117`; si Neo lo pide se añade `scene-prompt-spec.schema.json` como contrato nuevo). **Impacto en pruebas existentes**: cambian todas las fixtures canónicas de `t841` (cada modo ahora lleva JSON y regla), y se revisan `t848b`, `t849`, `t855` y las pruebas de no-fuga (`INV-ESC6-010`).

### 5.4 Normalización de imágenes (`REQ-ESC6-027`, `H-ARCH-006-01`, `H-TRI-006-03/09`)
Función inyectada `stripImageMetadata` que **reescribe el contenedor con lista blanca** (no lista negra) sin tocar los píxeles: JPEG conserva solo `SOI, DQT, DHT, SOF*, DRI, SOS` con sus datos y `EOI` (y `APP14 Adobe` solo si hace falta el color); PNG solo `IHDR, PLTE, tRNS, IDAT, IEND` (y `sRGB`/`gAMA` si se justifica en el SC); WebP solo `VP8 `, `VP8L`, `VP8X` (con los indicadores EXIF/XMP/ICC en cero) y `ALPH`. Todo byte posterior al marcador final se trunca, se verifica el CRC de PNG y que las longitudes cierren **exactamente** el archivo; se rechazan PNG animado (`acTL`) y WebP animado (`ANIM`/`ANMF`); el recorrido tiene tope de iteraciones y de memoria y cualquier fallo → «ausente» (`EDGE-ESC6-009`). **Límites de tamaño** (lectura barata de `IHDR`/`SOF`/`VP8X`): ancho × alto ≤ 25 MP y lado ≤ 8192 px, tanto en la subida de la foto del hogar (ruta de la 006) como en el normalizador (un avatar de 004 que los supere se trata como ausente); y un tope agregado de **32 MiB** de referencias por llamada: si se supera, se omiten las referencias de menor prioridad (orden: escena previa o foto del hogar, luego mascotas por orden de selección de la última a la primera), se registra el hecho sin datos personales y el intento queda `degraded` (`EDGE-ESC6-028`); nunca se carga todo en memoria antes de validar tamaños. **No** redimensiona ni recodifica (no hay códec autorizado): sigue siendo una brecha frente a `C5` de `/rama`, aceptada por Neo para el tramo fake (`N2-01` = B); el aviso declara que la normalización es parcial y no se declara `ARGOS_SCENE_REF_MAX_PX`. **Antes del driver real es obligatoria** la dependencia de imagen (`N2-01` = A: versión exacta, ámbito `infrastructure/`, auditoría `/merovingian` con red) para recodificar y redimensionar. Los bytes viven solo en memoria. Pruebas de propiedades y fuzz en `tests/security/` (archivos truncados, longitudes enormes, polyglot JPEG+ZIP, GPS en `APP1` y en trozo desconocido, trozos privados como `caBX`/`iDOT`; `SC-ESC6-083/084`). Riesgos y opciones: `research.md` §5, `RR-06-10`.

**Normalización de salida (Decisión de Fase 6, 2026-11-18, `H-ORA-F6-A`, `REQ-ESC6-035`, `N2-03`, `INV-ESC6-010`, `REQ-ESC6-021`)**: `validateGeneratedImage` pasa a ser `validateAndStripGeneratedImage`, función pura inyectada que, tras validar firma, dimensiones y ausencia de animación, **reescribe el contenedor con lista blanca** y devuelve los bytes que se publican. PNG: conserva `IHDR`, `PLTE`, `IDAT`, `IEND`, `tRNS`, `caBX` y solo el `iTXt` de keyword `XML:com.adobe.xmp` (≤ 64 KiB); descarta `tEXt`, `zTXt`, los demás `iTXt`, `eXIf`, `tIME`, `iCCP`, `sRGB`, `gAMA`, `cHRM`, `pHYs` y todo trozo desconocido. WebP: conserva `VP8 `, `VP8L`, `VP8X`, `ALPH`, `XMP `, `C2PA`; descarta `EXIF`, `ICCP` y el resto, con indicadores de `VP8X` reescritos. Mismos topes que la entrada (CRC, longitudes exactas, truncado, tope de iteraciones y memoria); fallo → `ERR-SCENE-INVALID-IMAGE`. Se ejecuta antes de `put` (§1.2 `runSceneGeneration`) y sobre los bytes que luego se calculan tamaño y huella. Prueba obligatoria: salida eco con `tEXt` + `caBX` + XMP. Alternativa rechazada: lista negra de `tEXt`/`zTXt` (deja pasar `iTXt` y trozos privados). Sin cambio de contrato ni de esquema de datos (`data-model.md` no se toca: no se persiste ningún metadato).
**Código 404 de imagen (Decisión de Fase 6, `H-ORA-F6-B`)**: `GET .../scene/image` sin imagen vigente responde `ERR-HOUSE-NOT-FOUND` (404), idéntico al de «sin acceso» (`INV-ESC6-007`); el contrato se ajusta al código.

### 5.5 Almacenamiento, claves y entrega
Claves UUID sin nombre de usuario (`INV-ESC6-009`): `scenes/{sceneId}/images/{result_object_id}` y `households/{householdId}/photo/{objectId}`; **la clave sale siempre del registro de la escena, nunca de parámetros** de la petición (`INV-ESC6-019`). Todo `put` va precedido de su fila `INTENT` (fijada en T1) y todo borrado se encola dentro de la transacción causante (`data-model.md` §6). Las imágenes se sirven con URL firmada V4 (TTL 300 s, techo 900 s) tras comprobar el permiso, con `response-content-type` fijado desde el registro (`image/png|webp`; `image/jpeg|png|webp` para la foto del hogar), `response-content-disposition: inline` y `X-Content-Type-Options: nosniff` (`REQ-ESC6-019`, `INV-ESC6-007`). El parámetro `v` es una **etiqueta de caché**: el servidor resuelve siempre la imagen vigente de la escena autorizada y un `v` distinto de la vigente se ignora o da 404, nunca selecciona otro objeto (`INV-ESC6-019`, `SC-ESC6-081`).

### 5.6 Registros y auditoría
Serializadores de registros sin prompt, bytes, nombres, `photoRef` resueltos, URL firmadas, `X-Goog-*`, claves de objeto, cuerpos de error del proveedor ni clave de idempotencia (`INV-ESC6-016`); las excepciones de red, `AbortError` y del cliente de metadatos se capturan, se mapean a `SceneErrorCode` y se descartan sin `err`, `cause` ni `stack` con URL (`SC-ESC6-094`); eventos y campos en `data-model.md` §8.

### 5.7 Interfaz (`presentation/web`)
Bloque «Escena del hogar» en el encabezado de la vista «Hogar» (`D6-04`; enmienda 2026-11-19 `T911`: es el **único** lugar de gestión; «Mascotas» solo muestra la imagen vigente del hogar del contexto activo, en solo visualización, sin controles, y no monta `HomeScene` ni la escena `OWNER`; `/me/scene` queda sin uso en la UI, contrato y servidor intactos; la vista solo-lectura es un componente nuevo `HomeSceneImage` que lee la escena del hogar elegido en el selector existente, 1 lectura por cambio de contexto con descarte de respuestas antiguas, y no pinta nada con 0 hogares, contexto «Mis mascotas», `imageTag = null` o error). La escena `OWNER` (`N2-15` = opción B, aprobada por Neo el 2026-11-19): imagen con texto alternativo (número de mascotas), estado en región `aria-live`, «cambios pendientes: P · generaciones restantes: R», «Se muestran N de M mascotas», aviso «desactualizada» (`D6-05`), «Reintentar», «Regenerar escena desde cero» (secundaria) y «Retirar consentimiento y borrar imágenes de la escena». Sondeo único de 3 s (constante del cliente `ARGOS_SCENE_POLL_SECONDS` = 3, no variable del servidor). Con cuota agotada se muestra la fecha de reinicio (`quota.resetsAt`); durante un enfriamiento o un tope de intentos ambos botones («Actualizar imagen del hogar» y «Regenerar escena desde cero») quedan deshabilitados con el mensaje «Espera {t} para volver a intentarlo» (`t` = `actions.retryAfterSeconds`: segundos si < 60, minutos hacia arriba si < 3600, horas hacia arriba en otro caso; `SC-ESC6-114`), el cliente vuelve a leer la escena una vez a los `retryAfterSeconds + 1` s con un temporizador cancelado al desmontar (`SC-ESC6-115`) y el texto «Hubo demasiados intentos seguidos» deja de existir; `canRegenerate` del servidor ya incluye los límites (`SC-ESC6-112`; `scene-use-cases.ts`: `canRegenerate = roleOk && remaining >= 1 && !consentRequired && status !== 'generating' && limits.allowed`) y `actions.retryAfterSeconds` sale de `evaluateAttemptLimits` (`SC-ESC6-113`, `N2-14`) y el cliente genera una `Idempotency-Key` nueva por clic. **Hogar principal y textos de ayuda (enmienda 2026-11-19, `T924`, `D6-20`)**: (1) en «Mis mascotas» `PetsPage` pasa a `HomeSceneImage` el hogar principal, que resuelve la función pura `principalHouseholdId(households)` de `scene-view.ts` (hogares `ACTIVE` de `GET /households`, ordenados por `household.createdAt` ascendente y desempate por `id` ascendente; `null` con 0 hogares); en un contexto de hogar se pasa el hogar elegido; `HomeSceneImage` sigue leyendo por cambio del `householdId` resuelto con descarte de respuestas antiguas y sin pintar nada con `imageTag = null` o error; sin llamadas nuevas ni a `/me/scene`. (2) `SceneBlock` envuelve cada botón de acción en un grupo (`div`, `grid gap-1 min-w-0 max-w-full`) con su texto de ayuda debajo (`p`, `text-sm text-slate-800`, 14 px, contraste ≥ 4.5:1 sobre blanco), asociado por `aria-describedby` (ids únicos con `useId`; el botón de actualizar combina el id del motivo y el de la ayuda, separados por espacio, vía `describedBy` de `Button`), sin `role="alert"` ni `aria-live`; el contenedor de acciones conserva `flex flex-wrap items-start gap-3`: a 320 px los grupos se apilan, a 1024 y 1280 px van en fila con salto de línea. La ayuda de actualizar se omite con el botón en «Reintentar» y la de regenerar con el botón no renderizado. Revisión de `/sati` pendiente (`NFR-ESC6-004`).

## 6. Ejecución en segundo plano: Cloud Tasks o Cloud Run Job (`D6-15` = B)

### 6.1 Evaluación
Ver la tabla de `research.md` §4. **Recomendación del Architect, confirmada por `/link`: Cloud Tasks hacia `POST /internal/scene-worker`** del mismo servicio (es la opción más simple y compatible con `cpu_idle = true`; un Cloud Run Job exige otra imagen, otro pipeline y más IAM sin ganancia para este volumen), con `maxAttempts = 1`, `maxConcurrentDispatches = 2` (igual que `max_instance_count = 2`), nombre de tarea = `attemptId`, y **`dispatchDeadline = 130 s`** (corrección de `/link`: con el `timeout` de Cloud Run de 120 s, cualquier valor mayor no tiene efecto práctico y el número del código debe coincidir con el del servicio; el valor se fija al crear la tarea desde la aplicación, no en Terraform; `research.md` §4.3 todavía dice «≥ 150 s» y queda superado por este plan). Si Neo prefiere aislar el trabajo largo, se sustituye solo `CloudTasksSceneDispatcher` por un `CloudRunJobSceneDispatcher` (mismo puerto, mismo `runSceneGeneration`).

### 6.2 Cómo resuelve `H-MERO-006-02`
El worker es una **solicitud real** con CPU asignada: el estrangulamiento de `cpu_idle = true` no aplica porque el trabajo ocurre mientras la solicitud está abierta; el worker debe **esperar** la generación antes de responder (nunca `setImmediate` tras responder en producción). Esa solicitud necesita un `timeout` mayor que los 60 s actuales: se propone 120 s para todo el servicio (el `timeout` es por servicio, no por ruta; cambio de Nivel 2, `N2-05`/`N2-11`) y `memory = 1Gi` (nueve imágenes de hasta 10 MiB y su copia en base64 superan 512 MiB con dos generaciones en la misma instancia). Cuadre de tiempos: `T_GEN` (90 s, máximo 105) < `timeout` (120 s); `T_GEN` + 15 s ≤ `timeout`; `T_LEASE` (150 s) **se cuenta desde el claim del worker** y es mayor que el `timeout`, de modo que si Cloud Run corta la solicitud el arrendamiento vence y la escena pasa a `failed` sin cuota; la espera en cola antes del claim tiene su propio tope (`T_QUEUE` = 600 s, `EDGE-ESC6-026`). Una prueba verifica que el `timeout` de `cloud_run.tf` sea ≥ máximo de `T_GEN` + 15 s (`SC-ESC6-092`).

### 6.3 Seguridad del worker (`REQ-ESC6-033`, `INV-ESC6-018`)
El `payload` de la tarea solo lleva `sceneId` y `attemptId` (UUID opacos; sin PII). Cuenta de servicio propia `argos-scene-tasks` con solo `roles/run.invoker` sobre el servicio. Como Cloud Run es público (lo exige la API web), **la verificación en la aplicación es la única barrera**: la ruta (1) exige token OIDC con `iss`, `exp`, `email_verified` y **audiencia propia** (`ARGOS_SCENE_WORKER_URL`, distinta de la de `/internal/maintenance`) y **correo exactamente igual** a `ARGOS_SCENE_TASKS_SA_EMAIL` (la igualdad exacta hoy vive en `maintenance-routes.ts`, no en `createOidcVerifier`); (2) verifica **antes** de parsear el cuerpo y con tope de cuerpo ≤ 1 KiB; (3) 401 sin token, token inválido o audiencia equivocada; 403 con audiencia correcta y correo distinto (incluida la identidad de Scheduler), sin cuerpo ni detalle; (4) comprueba que el `attemptId` pertenece al `sceneId` y, si no, o si la escena o el intento no existen, responde 204 sin efecto ni mensaje distinto (sin oráculo, y sin 5xx que ensucie las alertas); (5) no usa cookie ni CSRF. La URL de destino y la audiencia de la tarea salen **solo** de configuración validada, jamás de `Host` o `X-Forwarded-*` (`INV-ESC6-018`, `SC-ESC6-087`). Pruebas cruzadas: `SC-ESC6-077`.

### 6.4 Autorizaciones de Nivel 2 firmadas (2026-11-18)
(1) **`N2-07` = A**: extender el ámbito de `jose` 6.2.17 (hoy solo `/internal/maintenance`) **solo** a `/internal/scene-worker`, con **audiencia y correo OIDC propios por ruta** (`app-config.ts` define hoy un único `ARGOS_SCHEDULER_EMAIL` y un único `ARGOS_OIDC_AUDIENCE`; se parametriza la verificación por ruta, `H-MERO-006-19`); cambia el texto de la constitución. (2) **`N2-12`**: enmienda acotada del Principio VI aprobada; su aplicación se condiciona a `REQ-ESC6-028`. (3) Cambios de `terraform/`, `scripts/` y workflows de §7 (`N2-04`, `N2-05`, `N2-08`, `N2-11`), cada uno como tarea [N2]. Suites afectadas por (1): `oidc-verify.spec`, `maintenance-route.spec`, `ops-surface*.security`, `app-config.spec` y una suite nueva del worker con prueba cruzada de identidades.

### 6.5 Tope global de gasto (`H-ARCH-006-02`, `N2-02` = A firmada)
El presupuesto de 5 USD **solo avisa**, no detiene nada, y con el filtro actual por etiqueta probablemente no ve el gasto de Vertex; la cuota de 10 por hogar **no acota el total** (`research.md` §2.4; con el modelo Pro el peor caso de 130 generaciones al mes cuesta 17 a 31 USD según `link-006-iac.md` §2.5). **Decisión (`N2-02` = A)**: contador global mensual `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (una fila `platform_parameters`, patrón de 005, con `UPDATE … WHERE restante > 0`) más la cuota de la API de Vertex fijada en la consola. Es **obligatorio como condición de activación del driver real** (§13) y **no se implementa en el tramo fake** (`/mifune` lo juzgó prematuro antes; `/trinity` lo exige antes del real; ambas posturas se respetan). No se añade interruptor de corte (la opción C apaga todo el proyecto y no fue elegida). Mientras tanto la cuota por hogar queda acotada a 50 como máximo (`ARGOS_SCENE_QUOTA_MAX`, 1-50) y los contadores de `REQ-ESC6-034` limitan el costo de los fallos.

## 7. Cambios de Terraform previstos (SOLO descripción; `terraform/` no se toca)

Revisados por `/link` contra el estado real de `terraform/` (`link-006-iac.md`). Cada fila es un **cambio de Nivel 2 ya firmado por Neo** (2026-11-18) que se ejecuta como tarea [N2] propia; **este plan no aplica nada a `terraform/`**, y cada archivo Terraform se cambia con su prueba actualizada en la misma tarea (`H-MERO-006-18`). Moneda y monto: `N2-04` = 22500 COP si la cuenta sigue en COP, o 5 USD si es USD; la verificación de la moneda real es un paso humano de Neo antes del `apply`.

| Archivo | Cambio previsto | Motivo | Nivel / decisión |
|---|---|---|---|
| `budget.tf` / `variables.tf` | Tope de **5 USD/mes** (`D6-12`). **Corrección de la revisión 1**: el plan decía «`budget_units` de 1 a 5 USD», pero en disco `budget_currency` = `COP` y `budget_units` = `4500` (≈ 1 USD); escribir `"5"` daría **5 COP**. Decisión (`N2-04`): `"22500"` con `COP` si la cuenta sigue en COP, o moneda `USD` y `"5"` si es USD; Neo verifica la moneda real (`gcloud billing accounts describe`) antes del `apply`. Filtro por proyecto en lugar de la etiqueta `app=argos` (el gasto de Vertex no lleva etiquetas); umbral de gasto previsto al 100 %; `display_name` sin «1-usd»; el presupuesto **solo avisa** | `D6-12` = A | 2 (`N2-04`, `N2-05`, `N2-12`) |
| `services.tf` | Añadir `aiplatform.googleapis.com` y `cloudtasks.googleapis.com`; contradice REQ-IAC-009 («solo estas 12») | Vertex y cola | 2 (`N2-05`) |
| `iam.tf` | `roles/aiplatform.user` a la cuenta `run` (proyecto; **excepción** a REQ-IAC-006, o rol personalizado, o cuenta dedicada al trabajo de IA acotada por impersonación, `H-TRI-006-10`); nueva cuenta `argos-scene-tasks`; `roles/run.invoker` de esa cuenta sobre el servicio; `roles/cloudtasks.enqueuer` de `run` sobre la **cola** (no de proyecto); `roles/iam.serviceAccountUser` de `run` sobre `argos-scene-tasks` | mínimo privilegio, sin llave nueva | 2 (`N2-05`) |
| nuevo `cloud_tasks.tf` | `google_cloud_tasks_queue` `argos-scene` en `us-central1`: `max_attempts = 1`, `max_concurrent_dispatches = 2`, `max_dispatches_per_second` bajo (propuesta 1), `depends_on` de la API | `D6-15` | 2 (`N2-05`) |
| `cloud_run.tf` | `timeout` de `60s` a `120s` y `memory` de `512Mi` a `1Gi`; **sin** variables de entorno aquí (`env` está en `ignore_changes`); sin cambio de `cpu_idle` ni de instancias. El cambio crea una revisión nueva que puede recibir tráfico sin pasar el smoke test de `deploy-argos.yml` (`traffic` ignorado): aplicar fuera de un despliegue `--no-traffic` en curso | `T_GEN`, memoria | 2 (`N2-05`, `N2-11`) |
| `.github/workflows/deploy-argos.yml` | Añadir las variables `ARGOS_SCENE_*` no secretas de §1.3 a `--set-env-vars` (reemplaza todo el entorno); sin secretos nuevos | configuración | 2 (`N2-08`) |
| `terraform/bootstrap.sh` (manual de Neo) | `roles/cloudtasks.admin` para la cuenta de apply y `roles/cloudtasks.viewer` para la de plan; sin ellos el `plan` de PR y el `apply` fallan con 403 | CI | 2 (`N2-08`) |
| `secret_manager.tf` | **Sin cambios**: Vertex usa la identidad de la cuenta de servicio (sin llave) | `D6-01` | — |
| `scripts/` y workflows de compuerta | `compile-contracts.sh` (rama 004+005+006 con `v34`; `v34` en las tres listas de directorios ajenos `ops catalogs v31 v33`), `verify-traceability.sh` (rama FEAT6 con listas propias), `test:gate` y `test-gate.yml` incorporan `specs/006-*` (`H-MERO-006-20`) | compuertas | 2 (`N2-08`) |

Pruebas que fijan valores antiguos y se rompen hasta actualizarlas (las edita `/keymaker` con orden de Neo): `terraform-cloud-run` (60 s, 512Mi), `terraform-root` (12 APIs), `terraform-budget` (`4500`), `terraform-iam*`, `terraform-bootstrap`, `terraform-scheduler`, `terraform-hygiene`, `terraform-labels`.

Mientras no se apliquen, el despliegue de la 006 es seguro con `ARGOS_SCENE_DRIVER=fake` fuera de producción y **no se despliega a producción** con el simulador (el arranque lo rechaza). Riesgo de CI (`R-LINK-006-3`): `deploy-argos.yml` se dispara con `src/**` en `main`; si el código de la 006 llega a `main` antes de la compuerta del driver real, el arranque de producción con el simulador falla (queda un fallo de despliegue aunque el rollback conserve la revisión anterior): **decisión de Neo (`N2-10`)**: no se fusiona a `main` ni se activa `ARGOS_SCENE_DRIVER=real` hasta cerrar la compuerta del driver real (§13).

## 8. ADR
| ADR | Decisión | Alternativas descartadas |
|---|---|---|
| ADR-006-01 | Puerto `SceneImageGeneratorPort` + adaptador simulado primero; Vertex por `fetch` sin SDK (`D6-01`) | SDK `@google/genai`; OpenAI |
| ADR-006-02 | Persistir `inputs_snapshot` (JSON canónico) además del hash: permite recuento por entidad y modo | solo hash (no se sabe qué cambió); reconstruir desde registros vivos (no refleja el pasado) |
| ADR-006-03 | Cloud Tasks hacia worker interno (`D6-15` = B); `T_LEASE` desde el claim como red de seguridad y `T_QUEUE` para la espera | misma instancia tras responder; Cloud Run Job (equivalente tras el puerto) |
| ADR-006-04 | Avatar como foto de referencia: sin tabla, vista lógica (`D6-07`) | tabla de referencias por mascota |
| ADR-006-05 | `REGENERATE` se resuelve en T1 sin escribir un `outdated` persistido (la derivación lo admite) | añadir `ready → generating` (rompería la máquina cerrada de `REQ-ESC6-003`) |
| ADR-006-06 | Normalización solo de metadatos de contenedor por **lista blanca**, sin códec, como **función** inyectada (no puerto: un solo adaptador, `H-MIF-006-07`) | `sharp` (Nivel 2, binarios nativos; `N2-01`); cliente solo; lista negra de segmentos |
| ADR-006-07 | `SceneRepository` y `SceneConsentRepository` en el `UnitOfWork` existente; orden de candados propietario → mascota → hogar → escena; primera tarea = puertos y arneses nulos en verde (`H-MERO-006-16`) | repositorios fuera del `UnitOfWork` (rompe la atomicidad de T1/T2 y de las cascadas) |
| ADR-006-08 | `GENERATE_SCENE` y `READ_SCENE` son acciones de **hogar** con función propia `scene-policy.ts`; no amplían `PetAction` (`H-MERO-006-17`) | ampliar `RBAC_MATRIX` por mascota (rompe `D6-10` y 3 suites) |
| ADR-006-09 | Estado `idle|outdated|ready` **derivado en lectura**; se persiste solo `generating|failed` (`H-MIF-006-01`); se retiran `recomputeSceneStatus` y sus 7+ ganchos en código `LOCKED` | proyección persistida con ganchos en 002/004/005 (acopla y regresa) |
| ADR-006-10 | Imagen vigente como columnas de `home_scenes`, sin tabla `scene_images` ni FK circular (`H-MIF-006-02`); `scene_attempts` se conserva como tabla (`H-MIF-006-03` acotado por Neo: solo la última clave de idempotencia; intentos 30 días) | tabla `scene_images` con ≤ 1 fila; intentos en columnas de la escena |
| ADR-006-11 | Worker con identidad y audiencia propias, claim `PENDING → RUNNING` por compare-and-set y T2 que recomprueba dueños de datos (`H-TRI-006-01/07`, `H-LCK-006-01/04`) | reutilizar la audiencia de mantenimiento; publicar sin reverificar consentimiento |
| ADR-006-12 | Especificación JSON saneada derivada del payload por una función pura aparte (`scene-spec.ts`), compuesta en `buildImagePrompt` junto a las líneas `Pet k:` y una regla de conteo que cita `renderedPetsCount` (sin número quemado) (`D6-19`) | JSON compacto; JSON que reemplaza las líneas `Pet k:`; cierre numérico en texto por especie; contrato JSON Schema nuevo para la salida |
| ADR-006-13 | «Mascotas» solo visualiza la imagen vigente del hogar (componente de solo lectura) y toda la gestión vive en «Hogar» (`D6-19`); el tiempo de espera viaja en `SceneActions.retryAfterSeconds` (aditivo, `N2-14`) y no se infiere en el cliente | temporizador de 60 s del cliente (no sobrevive a recargas ni cubre topes de 24 h); leer la cabecera `Retry-After` solo tras un `429` (el botón ya estaría habilitado); retirar `/me/scene` (decisión de Neo) |

| ADR-006-14 | Las `KEEP` con foto vigente viajan como referencia `IMG_n` en `INCREMENTAL_ADD`, `INCREMENTAL_REPLACE` e `INCREMENTAL_MIXED`, con cambio solo en `decide-mode.ts` y `scene-run-use-case.ts` (`D6-20`); el orden y el desempate de bytes los fija `N2-16` (pendiente) | enviar solo la escena previa (estado anterior: se pierde la apariencia de las `KEEP`); incluir `INCREMENTAL_REMOVE` (no dibuja nada, `INV-ESC6-010`); frase nueva de prompt para las `KEEP` (texto, decisión de Neo si se necesita) |
| ADR-006-15 | Hogar principal = hogar `ACTIVE` más antiguo por `createdAt` (desempate `id`), resuelto en el cliente con función pura sobre la lista que `PetsPage` ya carga (`D6-20`) | campo o endpoint de «hogar principal» (contrato nuevo); membresía más antigua (no está en la vista); último hogar usado (estado sin fuente de verdad); cargar la escena `OWNER` (`/me/scene`, descartado por `D6-19`) |
| ADR-006-16 | Textos de ayuda como párrafos visibles bajo cada botón, asociados con `aria-describedby` (`D6-20`) | atributo `title` o tooltip (no accesible en táctil ni con teclado); texto dentro del botón (cambia el nombre accesible); `aria-live` (re-anuncia el texto en cada render) |

## 9. Riesgos del plan
| ID | Riesgo | Mitigación |
|---|---|---|
| H-ARCH-006-01 | No hay códec: la normalización de `C5` queda parcial (sin redimensionar, aunque ahora por lista blanca) | `RR-06-10`; `N2-01` = B ahora, A obligatorio antes del driver real |
| H-ARCH-006-02 | Ni la cuota por hogar ni la alerta acotan el gasto total | §6.5; `N2-02` = A, obligatorio antes del driver real |
| R-06-A | El modelo elegido puede aceptar menos de `N + 1` imágenes (`N` = 8 inviable; `N` = 8 con escena previa y foto del hogar son 9 entradas) | `N` por configuración; `SC-ESC6-060`; `research.md` §2.2 |
| R-06-B | Mascotas sin asignar a ningún hogar de un usuario con hogar no aparecen en ninguna escena; al migrar la escena (`D6-09`) las mascotas no asignadas salen de la huella | `INT-06-04`; verificar contra 002 si crear el hogar asigna las mascotas |
| R-06-C | `timeout` de 120 s afecta a todas las rutas del servicio (es por servicio) | `/link`; alternativa: segundo servicio solo-worker o Job (`N2-11`) |
| R-06-D | Respuesta del modelo en JPEG (el contrato solo admite PNG/WebP; el `CHECK` de `image_mime` también) | validación por firma (`REQ-ESC6-035`); `N2-03` = A: solo PNG/WebP, JPEG es fallo; sin cambio de contrato |
| R-06-E | **PN-06** de 005 (rotación de la clave HMAC de IP e `ip_key_version`, diferida a «006» en `specs/005*/contracts/README.md`) no tiene dueño en esta feature: ningún REQ, SC ni tarea la cubre (`H-MERO-006-22`) | `N2-09` = B: devuelta fuera de la 006 (feature futura o 005); sin tarea en este plan |
| R-06-F | Los ganchos de privacidad (§1.2) obligan a tocar 7 casos de uso de features `LOCKED`; sin enmienda no se pueden implementar | enmienda (d) aprobada en `N2-06`; el orden de `tasks.md` es compuertas, enmiendas, puertos y arneses nulos |
| R-06-G | `H-MIF-006-03` se acota por decisión de Neo: solo se recuerda la **última** clave de idempotencia (24 h) y los intentos siguen en `scene_attempts` | `EDGE-ESC6-016` actualizado; cerrada |

## 10. Superficie afectada en suites y runbooks existentes (`H-MERO-006-14/16/18/19/20/23`, solo lectura)
Para que `tasks.md` no sorprenda: **se rompen o deben ampliarse** `schema-parity.spec.ts` (23 tablas e índices), `sqlite-migration-marker`, `postgres-pool`, `postgres-maintenance`, `t542-retencion-cero`; `tests/fixtures/application-harness.ts`, `in-memory-unit-of-work`, `sqlite-harness`, `pg-fake-client` y por arrastre las suites de casos de uso de mascota, hogar, cuenta, avatar, asignación y propiedad; `t570-media-storage-port`, `t606-intencion-conciliacion`, `t579-borrado-fisico`, `t571-dev-media-route` (dominio de claves, `N2-06`); `t578-medios`, `t600-concurrencia-medios` (cuota); `contracts-004-schemas`, `codegen-drift`, `audit-log-adapter` (auditoría, `N2-06`); `oidc-verify`, `maintenance-route`, `ops-surface*` (segunda identidad); `verify-gates.spec`; `backup-restore-runbook-docs.spec.ts` y `backup-runbook-hardening.spec.ts` (comparan el texto del **runbook de respaldo**, que debe declarar que la foto del hogar y las escenas no viajan: el runbook y la ayuda quedan **afectados**); `backup-31-roundtrip` debe afirmar que no aparecen tablas de escena; la documentación de operación y los runbooks de borrado, de mantenimiento y de CI/CD deben recoger la conciliación de los prefijos `scenes/` y `households/` y la ventana residual de PITR (`RR-06-07`). **No se rompen**: `layer-dependencies.spec.ts`, `openapi-conformance.spec.ts`, lo generado v31 y v33, las máquinas existentes ni los 9 `PetPermissions`. **Suites a añadir**: compuerta de la 006 (`t8xx-compuerta-006`, patrón `t796`), compilación fusionada 004+005+006 con prueba de duplicados y herencia, paridad de las 6 tablas, conformidad OpenAPI 006 (13 operaciones, 202 en ≤ 1 s, 404 sin revelar), worker con identidad cruzada, máquina `STATE-SCENE-001` y `deriveStatus`, pureza de entropía y reloj, privacidad y borrado (incluidos transferencia e importación), concurrencia (compare-and-set, claim, arrendamiento, frontera mensual), configuración `ARGOS_SCENE_*` con rangos. Orden causal (fijado en `tasks.md`): compuertas (`N2-08`) → enmiendas MINOR y de 003 (`N2-06`, `N2-05`) → puertos y arneses nulos → migraciones con paridad → dominio puro → casos de uso con simulado → rutas → interfaz → Terraform y adaptador real solo tras `REQ-ESC6-028` y la enmienda del Principio VI.

## 11. Matriz de trazabilidad (spec → plan o contratos)

| ID | Dónde se cumple |
|---|---|
| REQ-ESC6-001 | `putHouseholdPhoto`, `deleteHouseholdPhoto`, `getHouseholdPhoto` (OpenAPI); `household_photos` (§2.4 de `data-model.md`) |
| REQ-ESC6-002 | `data-model.md` §1 (avatar), plan §5.1, ADR-006-04 |
| REQ-ESC6-003 | `home-scene.machine.json`; plan §1.1 `scene-state.ts`; `data-model.md` §4 (estado derivado, solo `generating|failed` persistido) |
| REQ-ESC6-004 | plan §5.1, `inputs_snapshot` (`data-model.md` §2.6), `SceneView.pending` |
| REQ-ESC6-005 | `SceneActions` (`scene.schema.json`), `generateHouseholdScene`; plan §1.2 |
| REQ-ESC6-006 | plan §3 (incluye referencias de las `KEEP`, `D6-20`, `N2-16`); `scene-payload.schema.json` (`mode`, `action`); `decide-mode.ts` |
| REQ-ESC6-007 | `GenerateSceneInput.action = REGENERATE`; plan §2.3, §5.3 (presentación sin imagen), §5.7 (`canRegenerate` con límites; `SC-ESC6-112`) |
| REQ-ESC6-008 | plan §1.1 `select-visible-pets.ts`; `ScenePets`; `scene.maxPets`; plan §3 (cota `1 + N` incremental) |
| REQ-ESC6-009 | plan §5.3 (bloque 3); `PetBlock.breedCode` |
| REQ-ESC6-010 | plan §5.3 (cierre con N ≥ 1); `pets` vacío válido |
| REQ-ESC6-011 | `SceneQuota`; `data-model.md` §3; `ERR-SCENE-QUOTA-EXCEEDED` |
| REQ-ESC6-012 | plan §1.2 `requestSceneGeneration`; `Idempotency-Key` con alcance y vigencia; `data-model.md` §2.5 y §7 |
| REQ-ESC6-013 | plan §2.2; `ERR-SCENE-GENERATION-FAILED/TIMEOUT`, `ERR-SCENE-INVALID-IMAGE` |
| REQ-ESC6-014 | `data-model.md` §7 (publicación T2); máquina `generating → outdated` |
| REQ-ESC6-015 | `scene-payload.schema.json` 1.0.0 |
| REQ-ESC6-016 | plan §5.3 (numeración `Pet k:`, `PIXEL_REDRAW_RULE`), §5.3.1 (especificación JSON y `PET_COUNT_RULE`); `build-image-prompt.ts`, `scene-spec.ts`; plan §5.3.1 (`KEEP` con foto) |
| REQ-ESC6-017 | plan §1.2/§1.3; `SceneImageGeneratorPort` |
| REQ-ESC6-018 | `data-model.md` §6; plan §5.5 |
| REQ-ESC6-019 | `SceneView`, `getHouseholdSceneImage`; plan §5.7 («Hogar» único lugar de gestión, `HomeSceneImage` en «Mascotas», espera y relectura, hogar principal y textos de ayuda `D6-20`), §5.3 (regla `OWNER`) |
| REQ-ESC6-020 | OpenAPI (`x-sdd-rbac-action`, 403/404) |
| REQ-ESC6-021 | plan §5.6; `data-model.md` §8 |
| REQ-ESC6-022 | `data-model.md` §6 (sin respaldo); sin tabla en el sobre `3.x` |
| REQ-ESC6-023 | `scene_consents`; `grantSceneConsent`; `ERR-SCENE-CONSENT-REQUIRED`, `ERR-SCENE-NOTICE-OUTDATED` |
| REQ-ESC6-024 | plan §5.1 y §5.2; `hasReferencePhoto` efectivo |
| REQ-ESC6-025 | `revokeSceneConsent`; `data-model.md` §6 |
| REQ-ESC6-026 | `aviso-consentimiento-borrador.md`; `getSceneNotice` |
| REQ-ESC6-027 | plan §5.4; `stripImageMetadata` (lista blanca, límites de MP y bytes); plan §3 (`KEEP` y tope de bytes, `N2-16`) |
| REQ-ESC6-028 | `research.md` §2.3; enmienda del Principio VI |
| REQ-ESC6-029 | `data-model.md` §6 |
| REQ-ESC6-030 | `data-model.md` §6 (desasignación); máquina `retiredImage` |
| REQ-ESC6-031 | plan §1.3, §4, §7 |
| REQ-ESC6-032 | `data-model.md` §5 (migración `D6-09`); `getOwnerScene`, `generateOwnerScene` |
| REQ-ESC6-037 | §1.3 (`GeminiApiSceneImageGenerator`), tabla de variables; §5.3 (etiquetas `IMG_n:`); `audits-gemini-api-diseno.md` |
| REQ-ESC6-038 | §1.3; `cloud-logging.ts` (`redactSecrets`); `audits-gemini-api-diseno.md` §4 |
| INV-ESC6-001 | plan §4 (`INV-ARCH-001/002`) |
| INV-ESC6-002 | plan §4 (`INV-ARCH-004`) |
| INV-ESC6-003 | compare-and-set (`data-model.md` §7); máquina |
| INV-ESC6-004 | `data-model.md` §3 y §7 |
| INV-ESC6-005 | máquina (`failed`); plan §2.2 |
| INV-ESC6-006 | `scene-payload.schema.json` (`additionalProperties: false`) |
| INV-ESC6-007 | OpenAPI (404); plan §5.5 |
| INV-ESC6-008 | plan §1.1 `select-visible-pets.ts` |
| INV-ESC6-009 | plan §5.5; `household_photos` sin nombre |
| INV-ESC6-010 | `inputs_snapshot`; `scene-payload.schema.json` |
| INV-ESC6-011 | `FreeText60`; `sanitize-free-text.ts` |
| INV-ESC6-012 | `data-model.md` §7 (solo escribe tablas de escena) |
| INV-ESC6-013 | plan §1.3 (tabla de configuración) |
| INV-ESC6-014 | `ERR-SCENE-CONSENT-REQUIRED`; plan §5.2 |
| INV-ESC6-015 | plan §5.4 (parcial, `H-ARCH-006-01`, `N2-01`) |
| REQ-ESC6-033 | plan §6.3; OpenAPI `runSceneWorker`; `ARGOS_SCENE_TASKS_SA_EMAIL`, `ARGOS_SCENE_WORKER_URL` (§1.3) |
| REQ-ESC6-034 | plan §1.1 `attempt-limits.ts`; §1.3 constantes; `data-model.md` §2.5 y §7; OpenAPI 429; `SceneActions.retryAfterSeconds` (§5.7, `N2-14`) |
| REQ-ESC6-035 | plan §1.2 `runSceneGeneration`; `ERR-SCENE-INVALID-IMAGE` |
| REQ-ESC6-036 | plan §1.2; `data-model.md` §7 (claim y T2) |
| INV-ESC6-018 | plan §1.3 (despachador), §6.3 |
| INV-ESC6-019 | plan §5.5; OpenAPI `getHouseholdSceneImage`, `getHouseholdScene` |
| EDGE-ESC6-025, 028 | `data-model.md` §7 (T2 y referencia degradada) |
| EDGE-ESC6-026, 027 | `data-model.md` §7 (claim); plan §2.2, §6.2 |
| EDGE-ESC6-029 | plan §1.2 (validación de salida), `REQ-ESC6-034` |
| EDGE-ESC6-030, 033 | `data-model.md` §2.8 y §5 |
| EDGE-ESC6-031 | `data-model.md` §3 |
| EDGE-ESC6-032 | plan §1.2 (`requestSceneGeneration`), §2.2 |
| INV-ESC6-016 | plan §5.6; `SceneErrorCode`; `scene_attempts.error_code` |
| INV-ESC6-017 | `scene-payload.schema.json` (`biography`, `fallbackContext` siempre nulos); plan §5.3 |
| NFR-ESC6-001 | `research.md` §2.4; plan §6.5 y §7 |
| NFR-ESC6-002 | plan §6 |
| NFR-ESC6-003 | 202 en ≤ 1 s; sondeo de 3 s (plan §5.7) |
| NFR-ESC6-004 | plan §5.7 |
| EDGE-ESC6-001, 002, 012 | plan §3; `decide-mode.ts` |
| EDGE-ESC6-003, 017 | plan §2.2; `data-model.md` §7 |
| EDGE-ESC6-004 | `ERR-SCENE-INVALID-IMAGE` |
| EDGE-ESC6-005, 006, 021 | `data-model.md` §6; plan §1.2 |
| EDGE-ESC6-007 | `data-model.md` §3 |
| EDGE-ESC6-008 | plan §3 (`INCREMENTAL_MIXED`) |
| EDGE-ESC6-009, 023 | plan §5.4 |
| EDGE-ESC6-010 | plan §5.3 |
| EDGE-ESC6-011 | un `home_scenes` por hogar (`data-model.md` §2.1) |
| EDGE-ESC6-013 | sin cambio a los topes de 005 |
| EDGE-ESC6-014 | máquina `failed → generating/outdated` |
| EDGE-ESC6-015 | `PetBlock.speciesOther`, plan §5.3 |
| EDGE-ESC6-016 | `Idempotency-Key`; `scene_attempts` índice único |
| EDGE-ESC6-018, 019, 020, 022 | `data-model.md` §6; plan §5.1/§5.2 |
| EDGE-ESC6-024 | `/internal/scene-worker`; plan §2.2 |

## 12. Matriz SC → componente del plan (para que `tasks.md` derive pruebas)

| SC | Componente que lo cumple |
|---|---|
| SC-ESC6-001, 002, 005, 012, 066 | `buildImagePrompt` y `decide-mode` (plan §5.3, §3) con `FakeSceneImageGenerator` |
| SC-ESC6-003, 004, 031 | `inputs-snapshot` y `deriveStatus` (plan §5.1; `data-model.md` §4) |
| SC-ESC6-006, 007, 060 | `select-visible-pets` y configuración `N` (plan §1.1, §1.3) |
| SC-ESC6-008, 009, 010, 011, 013, 056 | `decide-mode` y fixtures canónicas (plan §3, §5.3) |
| SC-ESC6-019, 028, 044, 045, 051, 063 | validación de subida de 004, cascadas e `INTENT` (`data-model.md` §6) |
| SC-ESC6-021, 065 | `REGENERATE` (plan §2.3) y reintento (máquina) |
| SC-ESC6-027, 046 | serializadores de registros (plan §5.6) |
| SC-ESC6-029, 030 | interfaz y 202 en ≤ 1 s (plan §5.7, §2.1) |
| SC-ESC6-032 | referencia ausente (plan §5.4) |
| SC-ESC6-033, 035, 036, 037, 038, 039, 040 | consentimiento, aviso y retiro (plan §5.2; `aviso-consentimiento-borrador.md`) |
| SC-ESC6-041, 042, 067, 083, 084 | `stripImageMetadata` (plan §5.4; `RR-06-10`; `SC-ESC6-042` condicionada a `N2-01`) |
| SC-ESC6-047, 048 | desasignación y retiro de imagen (`data-model.md` §6) |
| SC-ESC6-049 | rol propietario/ADMIN (`D6-10`) y `INV-ESC6-017` |
| SC-ESC6-053 | `INV-ESC6-012` (`data-model.md` §7) |
| SC-ESC6-054, 057, 061 | cuota mensual y costo (`data-model.md` §3; plan §6.5, §7) |
| SC-ESC6-055, 059 | worker y cola (plan §6) |
| SC-ESC6-058 | migración `D6-09` (`data-model.md` §5) |
| SC-ESC6-064 | una escena por hogar y topes de 005 |
| SC-ESC6-014, 015 | `SceneActions` y `ERR-SCENE-QUOTA-EXCEEDED` (contratos); `requestSceneGeneration` sin llamada al generador |
| SC-ESC6-016, 018, 020 | compare-and-set, arrendamiento y publicación T2 (`data-model.md` §7; máquina `STATE-SCENE-001`) |
| SC-ESC6-022, 024 | `scene-payload.schema.json` y `sanitize-free-text.ts` |
| SC-ESC6-043 | `research.md` §2.3 y enmienda del Principio VI |
| SC-ESC6-052 | claves UUID (plan §5.5; `household_photos` sin nombre) |
| SC-ESC6-062 | `ERR-SCENE-INVALID-IMAGE` y validación de salida en `runSceneGeneration` |
| SC-ESC6-068, 070, 071, 075 | T2, claim y referencia degradada (`data-model.md` §7; plan §1.2) |
| SC-ESC6-069, 074 | arrendamiento desde el claim y ventana de T1 (`data-model.md` §3 y §7; plan §6.2) |
| SC-ESC6-072, 078, 079, 085 | `REQ-ESC6-034` y `REQ-ESC6-035` (contadores, 429, validación de salida) |
| SC-ESC6-073, 076 | migración `D6-09` y arrastre de cuota (`data-model.md` §2.8, §5) |
| SC-ESC6-077, 087 | identidad del worker y URL de destino (plan §6.3; `INV-ESC6-018`) |
| SC-ESC6-080, 081, 093 | `Idempotency-Key` con alcance, `v` como etiqueta y orden autorizar-antes-de-escribir (plan §5.5; OpenAPI) |
| SC-ESC6-082 | `sanitize-free-text.ts` con lista blanca (plan §1.1, §5.3) |
| SC-ESC6-086, 088 | estado derivado y ganchos de transferencia e importación (`data-model.md` §4; plan §1.2) |
| SC-ESC6-089, 090 | `scene-policy.ts` y códigos `SCENE_STATE` (plan §1.2) |
| SC-ESC6-091, 092, 094, 095 | migraciones y paridad, configuración y tiempos, excepciones de red, retención (`data-model.md` §5, §2.5; plan §1.3, §5.6) |

| SC-ESC6-104 | `gemini-api-wire.ts` (`buildGeminiBody`, plan §5.3) con `fetch` simulado |
| SC-ESC6-105, 106 | `buildImagePrompt` (plan §5.3: `Pet k:` y `PIXEL_REDRAW_RULE`) |
| SC-ESC6-107 | `decide-mode` sin cambio de código y huella `inputs-snapshot` (plan §3, §5.3) |
| SC-ESC6-108, 109 | `SceneBlockView`, `HomeScene`/`SceneBlock` y `PetsPage` (plan §5.3, §5.7) |
| SC-ESC6-110, 111 | `PetsPage` y `HomeSceneImage` solo visualización (plan §5.7) |
| SC-ESC6-112, 113 | `getScene` en `scene-use-cases.ts` (`canRegenerate`, `retryAfterSeconds`), `SceneActions` (plan §5.7, `N2-14`) |
| SC-ESC6-114, 115 | `scene-view.ts` (texto de espera) y `SceneBlock` (relectura al vencer) (plan §5.7) |
| SC-ESC6-116, 117, 118 | `scene-spec.ts` y `build-image-prompt.ts` (plan §5.3.1) |
| SC-ESC6-119, 120, 121 | `PetsPage`, `HomeSceneImage` y `principalHouseholdId` en `scene-view.ts` (plan §5.7, `ADR-006-15`) |
| SC-ESC6-122, 127 | `decide-mode.ts` (plan §3, `ADR-006-14`) |
| SC-ESC6-123 | `scene-spec.ts` y `build-image-prompt.ts` con `KEEP` con foto (plan §5.3.1) |
| SC-ESC6-124, 125, 126 | `scene-run-use-case.ts`, `fitReferencesWithinBudget` y `scene_image_sources` (plan §3, `N2-16`) |
| SC-ESC6-128, 129, 130 | `SceneBlock.tsx` y `SceneBlockView` (plan §5.7, `ADR-006-16`) |

## 13. Compuerta del driver real y fases de ejecución (`N2-10`, `tasks.md`)

**Fases de `tasks.md`**: (1) compuertas y scripts (`N2-08`); (2) enmiendas MINOR `N2-06` y de 003 `N2-05`, cada una con su suite; (3) puertos y arneses nulos; (4) migraciones SQLite `0013` y Postgres `0009` con paridad (incluye la reconstrucción del `CHECK` de `audit_log`, ya no condicional); (5) dominio y casos de uso con adaptador fake; (6) API y worker con identidad cruzada (`N2-07`); (7) interfaz mínima; (8) compuertas de cierre sin driver real.

**Fuera de este plan**: activar `ARGOS_SCENE_DRIVER=real` y fusionar a `main`. Una tarea `[GOV]` bloqueada las agrupa y se desbloquea solo cuando se cumplen **todas** las condiciones de `N2-10`: `REQ-ESC6-028` (datos del proveedor con fuente), `REQ-ESC6-026` (texto legal firmado), `N2-01` = A (dependencia de imagen auditada con red por `/merovingian`), `N2-02` = A (contador global y cuota de consola), `N2-04` (moneda real verificada y presupuesto aplicado), revisores del entorno `produccion` y enmienda del Principio VI aplicada (`N2-12`). `N2-09` = B: PN-06 sale de la 006.

## Decisión de Fase 5 (lote 2), 2026-11-18

Tres decisiones de `/architect` sobre los hallazgos de `/keymaker` en T851..T861 (`H-KEY-F5-5`, `H-KEY-F5-6`, `H-KEY-F5-7`). Ninguna cambia un requisito firmado por Neo (`D6-*`, `N2-*`): ninguna queda PENDIENTE DE NEO. **El catálogo de errores no cambia** (`contracts/errors/error-catalog.json` intacto; `SceneErrorCode` sigue con cuatro valores).

**`H-KEY-F5-5` Expiración de arrendamiento al leer: se audita (opción a).** Regla: cuando `getScene` (o el worker, en el caso de «arrendamiento vencido en cola antes del claim») materializa el vencimiento, la **misma transacción** del compare-and-set `expireLease` escribe la fila de auditoría `SCENE_FAILED` con `result = ERR-SCENE-LEASE-EXPIRED`, usando como actor al **`actor_user_id` del intento que se expira** (columna de `scene_attempts`, no el lector), con el HMAC del hogar y del actor de `REQ-ESC6-021`. La fila se emite **una sola vez**: solo si el CAS transiciona (`expireLease` devuelve «transicionó» y el intento); un CAS que no transiciona (otra lectura, el worker o el mantenimiento ya lo cerró) no escribe auditoría. El orden de `INV-ESC6-019`/`H-TRI-006-12` no cambia: autorización y `404` van **antes** de cualquier escritura; la auditoría es parte de la escritura de expiración que ya existía, no una escritura nueva en la lectura. Motivo: sin la fila, un intento `FAILED` (que el proveedor pudo cobrar, `REQ-ESC6-034`) quedaría sin rastro en `REQ-AUD-001` si ninguna lectura previa al mantenimiento lo ve, y el atacante o el fallo real serían invisibles; el actor sí se conoce (está en el intento). Alternativa rechazada (b): dejarla al mantenimiento diario sin fila: pierde el evento cuando la lectura gana la carrera al mantenimiento (el CAS ya no transiciona para este) y deja huecos en la bitácora de consumo.
*Cambios de texto*: `data-model.md` §7 fila «Vencimiento del arrendamiento» (añadir la auditoría `SCENE_FAILED` con actor del intento, una sola vez, misma transacción); `plan.md` §2.2 `getScene` (mención del mismo efecto); puerto: `SceneRepository.expireLease` debe devolver el intento transicionado (o `null`) para que el caso de uso audite solo cuando hubo transición; `scene-run-use-case` (rama de vencimiento ya audita) y `getScene` reutilizan el mismo método de auditoría.

**`H-KEY-F5-6` Alcance de `scene_image_sources`: solo dueños de fotos efectivamente enviadas (opción b).** Regla: `scene_image_sources` registra a los usuarios cuya **foto** viajó al proveedor en la generación que produjo la imagen vigente. «Incluida» = referencia **efectivamente enviada** tras los filtros del worker (consentimiento vigente del dueño `D6-16`, límites de `REQ-ESC6-027`, degradación y renumeración `EDGE-ESC6-028`): (1) la foto del hogar, si viajó, aporta a quien la subió; (2) cada foto de referencia de mascota que viajó aporta a su Propietario Legal. **No cuentan**: mascotas enviadas sin foto (modo `species`/`breed`/`sex`), fotos omitidas o degradadas, mascotas de dueños sin consentimiento, ni el actor que pulsa si ninguna foto suya viajó (su consentimiento sigue siendo precondición de la llamada en T1, en el worker y en T2). Consecuencia: retirar el consentimiento de un dueño cuya foto no viajó **no retira la imagen** (sigue purgando sus referencias propias y cancelando sus intentos en vuelo, `REQ-ESC6-025` (2)(6)); es coherente con el texto firmado: `REQ-ESC6-025` purga «la imagen que las contenga» (las referencias derivadas de sus datos) y `D6-16` limita el consentimiento a las fotos. Los eventos **estructurales** (eliminar mascota, desasignar, importar) siguen decidiendo por `image_inputs_snapshot` (la mascota aparece dibujada aunque no viajara su foto), sin depender de `scene_image_sources`; la **transferencia de propiedad** retira solo si la mascota consta en el snapshot **y** su dueño anterior consta en las fuentes (su foto viajó). En T2, la recomprobación de **existencia de cuenta y asignación** sigue cubriendo a todos los dueños de mascotas del snapshot; la de **consentimiento vigente** se limita al actor y a los dueños de fotos enviadas. Alternativa rechazada (a), conservadora: cualquier dueño cuyo dato participa retira la imagen: borra imágenes por consentimientos que no gobernaban ningún dato enviado, contra la proporcionalidad de `C2` y de `D6-16`, y penaliza al hogar compartido sin ganancia de privacidad (un dato textual `species/breed/sex` no es la foto que `D6-16` protege).
*Cambios de texto*: `data-model.md` §2.3 (definición «foto efectivamente enviada»); `data-model.md` §6 filas «Retirar consentimiento» y «Transferencia de propiedad» y §7 «Publicación atómica» (2): consentimiento solo de actor y dueños de fotos enviadas, existencia/asignación de todos; `spec.md` `REQ-ESC6-025` (2) añadir «imagen cuya generación incluyó una foto derivada de sus datos» y `EDGE-ESC6-025`; `/keymaker`: la publicación T2 compone las fuentes desde las referencias enviadas (no desde todas las mascotas del snapshot) y añade prueba SC-ESC6-039 «dueño sin foto enviada retira, imagen se conserva».

**`H-KEY-F5-7` Cuota agotada en T2: se mantiene `ERR-SCENE-GENERATION-FAILED` con motivo interno (opción b).** Regla: si en T2 `consumed_generations >= attempt.quota_max` sobre `attempt.quota_window`, el intento se cierra `FAILED` con `error_code = ERR-SCENE-GENERATION-FAILED`, sin descontar cuota, imagen anterior intacta (`INV-ESC6-004/005`), y el **motivo interno** `SCENE_QUOTA_AT_T2` se registra solo en el resultado de auditoría/log (cadena interna, no es un `ERR-*`, no entra al catálogo ni a `SceneView.lastError`). Motivo: T1 bajo el candado de la escena admite un solo intento en vuelo (`INV-ESC6-003`) y fija ventana y máximo, así que el caso solo es alcanzable por fusión o arrastre de cuota (`D6-09`, eliminación de hogar) entre T1 y T2: es residual; `D6-03` descuenta únicamente al publicar y ya está cumplido. El reintento posterior es rechazado en T1 con `ERR-SCENE-QUOTA-EXCEEDED` (409) y el botón deshabilitado por `SceneActions`, que es el mensaje correcto y ya existe. Alternativa rechazada (a): un quinto código `SCENE_STATE` `QUOTA-EXCEEDED`: obligaría a subir `scene.schema.json` (`SceneErrorCode`) y el catálogo, regenerar tipos, tocar `SC-ESC6-090` («cuatro códigos») y duplicar el significado de `ERR-SCENE-QUOTA-EXCEEDED`, por un caso casi inalcanzable.
*Cambios de texto*: `data-model.md` §3 (T2) y §7 «Publicación atómica» (3): añadir «si falla, intento `FAILED` con `ERR-SCENE-GENERATION-FAILED` y motivo interno `SCENE_QUOTA_AT_T2` solo en auditoría»; `plan.md` §2.2 `runSceneGeneration` (misma frase). Sin cambios en contratos ni en `SC-ESC6-090`.

## Anexo A. Nombres canónicos de razas en inglés (Decisión de Fase 5, 2026-11-18, `H-KEY-F5-2`, normativo)

Una raza de catálogo no mestiza se nombra en el prompt **solo** con el nombre de esta lista; todo `breedCode` que no figure aquí (incluidos `DOG_CRIOLLA`, `CAT_CRIOLLA` y los `*_OTHER`) se trata como mestizo amigable. La lista tiene 64 nombres (el catálogo 004 guarda etiquetas en español para la interfaz, no para el proveedor); añadir o cambiar un nombre es una enmienda de este plan.

- `DOG_AKITA`: Akita
- `DOG_BASSET_HOUND`: Basset Hound
- `DOG_BEAGLE`: Beagle
- `DOG_BICHON_FRISE`: Bichon Frise
- `DOG_BORDER_COLLIE`: Border Collie
- `DOG_BOXER`: Boxer
- `DOG_BULLDOG_FRANCES`: French Bulldog
- `DOG_BULLDOG_INGLES`: English Bulldog
- `DOG_CANE_CORSO`: Cane Corso
- `DOG_CANICHE_POODLE`: Poodle
- `DOG_CHIHUAHUA`: Chihuahua
- `DOG_CHOW_CHOW`: Chow Chow
- `DOG_COCKER_SPANIEL`: Cocker Spaniel
- `DOG_DALMATA`: Dalmatian
- `DOG_DOBERMAN`: Doberman
- `DOG_FOX_TERRIER`: Fox Terrier
- `DOG_GALGO`: Greyhound
- `DOG_GOLDEN_RETRIEVER`: Golden Retriever
- `DOG_GRAN_DANES`: Great Dane
- `DOG_HUSKY_SIBERIANO`: Siberian Husky
- `DOG_JACK_RUSSELL_TERRIER`: Jack Russell Terrier
- `DOG_LABRADOR_RETRIEVER`: Labrador Retriever
- `DOG_LHASA_APSO`: Lhasa Apso
- `DOG_MALTES`: Maltese
- `DOG_MASTIN`: Mastiff
- `DOG_PASTOR_ALEMAN`: German Shepherd
- `DOG_PASTOR_AUSTRALIANO`: Australian Shepherd
- `DOG_PASTOR_BELGA`: Belgian Shepherd
- `DOG_PINSCHER_MINIATURA`: Miniature Pinscher
- `DOG_PITBULL`: American Pit Bull Terrier
- `DOG_POMERANIA`: Pomeranian
- `DOG_PUG`: Pug
- `DOG_ROTTWEILER`: Rottweiler
- `DOG_SALCHICHA_DACHSHUND`: Dachshund
- `DOG_SAMOYEDO`: Samoyed
- `DOG_SAN_BERNARDO`: Saint Bernard
- `DOG_SCHNAUZER`: Schnauzer
- `DOG_SETTER_IRLANDES`: Irish Setter
- `DOG_SHAR_PEI`: Shar Pei
- `DOG_SHIH_TZU`: Shih Tzu
- `DOG_WEIMARANER`: Weimaraner
- `DOG_YORKSHIRE_TERRIER`: Yorkshire Terrier
- `CAT_ABISINIO`: Abyssinian
- `CAT_ANGORA`: Turkish Angora
- `CAT_AZUL_RUSO`: Russian Blue
- `CAT_BENGALI`: Bengal
- `CAT_BIRMANO`: Birman
- `CAT_BOSQUE_DE_NORUEGA`: Norwegian Forest Cat
- `CAT_BRITANICO_DE_PELO_CORTO`: British Shorthair
- `CAT_BURMES`: Burmese
- `CAT_CORNISH_REX`: Cornish Rex
- `CAT_DEVON_REX`: Devon Rex
- `CAT_EXOTICO_DE_PELO_CORTO`: Exotic Shorthair
- `CAT_HIMALAYO`: Himalayan
- `CAT_MAINE_COON`: Maine Coon
- `CAT_ORIENTAL`: Oriental Shorthair
- `CAT_PERSA`: Persian
- `CAT_RAGDOLL`: Ragdoll
- `CAT_SCOTTISH_FOLD`: Scottish Fold
- `CAT_SIAMES`: Siamese
- `CAT_SIBERIANO`: Siberian
- `CAT_SOMALI`: Somali
- `CAT_SPHYNX`: Sphynx
- `CAT_TONQUINES`: Tonkinese
