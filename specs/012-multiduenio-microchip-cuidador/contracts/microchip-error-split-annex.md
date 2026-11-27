# Anexo T1631 — `ENM-002-MINOR-012-CHIP`: split de error del microchip y comprobador único (Bloque B, #23)

Estado: `DRAFT` (redactó `/architect` el 2026-11-27; **la aprobación a `APPROVED` es de Neo — Nivel 2**). Documento **nuevo** de la 012: **no edita** ningún contrato ni texto de la 002, la 004 ni la 001 (`LOCKED`/`APPROVED`). Enmienda `E-04` de la 004 (`REQ-PET2-001`: «cuerpo idéntico y misma ruta para duplicado propio o ajeno») **solo** para admitir el split de error descrito aquí, sin cambio de índice, sin `chip_conflict` y sin migración de duplicados (`Neo-F+L`, `Neo-G+Q`, `REQ-CHP12-006`). Contratos hermanos: `openapi/chip-claim.openapi.yaml` (componente `MicrochipRegistered`), `schemas/chip-claim.schema.json`, `errors/error-catalog.json` 0.2.0. Trazabilidad: `REQ-CHP12-001`, `REQ-CHP12-004`, `REQ-CHP12-005`, `REQ-CHP12-006`, `REQ-OWN12-008`, `INV-CHP12-001`, `INV-CHP12-002`, `INV-CHP12-009`, `EDGE-012-044`, `EDGE-012-068`, `SC-012-013`, `SC-012-014`, `SC-012-097`, `SC-012-112`, `SC-012-117`.

## 1. Registro de enmiendas

| Enmienda | Qué cambia | Qué NO se toca | Aprobación |
| --- | --- | --- | --- |
| `ENM-002-MINOR-012-CHIP` | §2 (clases de error) y §3 (comprobador único y rutas) | Índice `pets_microchip_global` (SQLite 0008, PG 0004), precheck `SC-CAT-025`, `ERR-PET-MICROCHIP-DUPLICATE` (cuerpo vigente), `pet.schema.json` de 004 | `DRAFT`; Neo (pendiente) |
| **Propuesta de errata a la 001** (§5) | Orden de validación en `CHECKING_DOMAIN_INVARIANTS` de `STATE-BACKUP-001` | **No se aplica a la 001** (Nivel 2) | **Propuesta para Neo** |

## 2. Dos clases de respuesta, una regla

Dado un `microchipId` con formato válido `^[0-9]{15}$` (no `\d`) enviado a una ruta que **escribe** `pets.microchip_id`:

| Situación del chip | Respuesta | Cuerpo y cabeceras |
| --- | --- | --- |
| Libre y sin reserva | Éxito de la ruta | La de 004 |
| Lo tiene una mascota (viva o **fallecida**) de la que el usuario es **principal o co-propietario `ACTIVE`** | `409 ERR-PET-MICROCHIP-DUPLICATE` | Vigentes de 004; sin datos de terceros (la mascota es propia); es la **única** clase que puede nombrar la mascota propia del archivo en una importación |
| Lo tiene una mascota de **otra cuenta** (viva o fallecida; el usuario no es principal ni co-propietario `ACTIVE`, **incluido `INVITED`**) | `409 ERR-CHP12-MICROCHIP-REGISTERED` | **Idénticos siempre**: sin nombre, dueño, hogar, fecha, número de co-propietarios ni estado de la mascota |
| **Reservado** por una disputa `CHIP_APPROPRIATION` `UNDER_REVIEW` (con mascota, o sin mascota por supresión de la cuenta del único propietario; congelación caducada o no) | `409 ERR-CHP12-MICROCHIP-REGISTERED` | Los mismos de la fila anterior; **no** existe código que distinga la reserva |

Reglas:

1. **Clasificación por titularidad, no por existencia.** «Mismo dueño» se decide por `pets.owner_user_id = usuario` o fila `pet_co_owners` `ACTIVE` del usuario sobre la mascota que tiene el chip. Un `INVITED`, un `LEFT`, un miembro de hogar sin condición de propietario y un reclamante con solicitud `PENDING` reciben `ERR-CHP12-MICROCHIP-REGISTERED`.
2. **Uniformidad por clase (`INV-CHP12-001`).** Dentro de cada clase, cuerpo y cabeceras son idénticos y las **llamadas al repositorio son estructuralmente las mismas** (espías, `SC-012-014`, `SC-012-097`); la latencia es solo informativa y no bloqueante (`Neo-P` P-15). **Entre clases** el cuerpo difiere por diseño (mismo dueño vs otro dueño): es el único canal que 012 acepta, y solo revela al usuario algo que ya sabe (que **él mismo** tiene ese chip).
3. **Cobertura total (`INV-CHP12-002`).** La consulta recorre **todas** las mascotas con ese chip, fallecidas incluidas, sin apoyarse en el predicado del índice. El índice sigue siendo la red de seguridad (violación `23505`/`UNIQUE` en carrera: se traduce a la **misma clase** que habría dado la consulta; ver §4).
4. **Fallecida.** El chip de una mascota fallecida **sigue bloqueado** (`Neo-F+L`); si es de otra cuenta, `ERR-CHP12-MICROCHIP-REGISTERED` sin distinguir fallecida.
5. **Intento contado.** Todo intento con chip de formato válido cuenta en los tres contadores antes de resolverse (`REQ-CHP12-005`); un `429` uniforme **sustituye** a ambas clases cuando se supera cualquier tope.
6. **Registro y auditoría.** Solo los últimos 4 dígitos; nunca el chip completo (`SC-012-022`).

## 3. Comprobador único de unicidad y reserva (`INV-CHP12-009`)

**Toda** ruta que escriba `pets.microchip_id` invoca el **mismo** comprobador (un único módulo de aplicación; implementación en `T1646`), que ejecuta **siempre** las dos consultas, sin cortocircuito: (i) mascotas con ese chip (todas las filas) y (ii) reserva vigente por `chip_hmac` en `owner_requests` (`CHIP_DISPUTE`, `CHIP_APPROPRIATION`, `UNDER_REVIEW`). Así chip libre, ocupado, reservado con mascota y reservado sin mascota producen la misma secuencia de llamadas.

| Ruta que escribe el chip | Clase propia (mismo dueño) | Chip de otra cuenta o reservado | Contador |
| --- | --- | --- | --- |
| Alta de mascota (004) | `ERR-PET-MICROCHIP-DUPLICATE` | `ERR-CHP12-MICROCHIP-REGISTERED` | 1 intento |
| Edición (004), solo si el valor **difiere** del vigente | ídem | ídem | 1 intento |
| **Importación de respaldo** (`importBackup`) | ídem; el duplicado **dentro del propio archivo** sigue siendo `ERR-PET-MICROCHIP-DUPLICATE` | `ERR-CHP12-MICROCHIP-REGISTERED`, **sin** indicar posición, nombre ni chip, `finalState = ROLLED_BACK`, **ninguna** mascota importada | N intentos (uno por chip), tope `MICROCHIP_IMPORT_MAX_PETS`; lote entero o rechazado entero (`EDGE-012-068`, `SC-012-117`) |
| **Restauración** (reimporte por reemplazo) | Las mascotas propias que la restauración va a reemplazar **se descuentan**: reimportar un respaldo propio no choca | ídem importación | N intentos |
| Herramienta de `/admin` que fije un chip | ídem | ídem (sin distinguir reserva) | 1 intento por chip |
| Semilla / fixtures de sistema | n/a (sin usuario) | Falla cerrada con el mismo código | no cuenta (sin sujeto) |

Se **retiran** de la superficie pública: cualquier mensaje que nombre «la mascota n.º k del archivo» cuando la colisión es con **otra cuenta** (hoy lo hace `ERR-PET-MICROCHIP-DUPLICATE` en la importación) y cualquier ruta que escriba el chip sin pasar por el comprobador.

## 4. Corrección sobre el código actual (insumo de `keymaker`, sin editar `src/`)

`src/application/use-cases/backup-use-cases.ts` hoy traduce la violación del índice `pets_microchip_global` al guardar (≈ líneas 594–598) siempre a `ERR-PET-MICROCHIP-DUPLICATE`. Con la enmienda: **mismo dueño → `ERR-PET-MICROCHIP-DUPLICATE`; otra cuenta → `ERR-CHP12-MICROCHIP-REGISTERED`** (cuerpo uniforme, sin `Mascota n.º`, sin `pet.name`). El comprobador se ejecuta **antes** de `pets.save` y de `assertNoForeignIds` (§5); la traducción de la violación del índice queda solo como red de seguridad ante carrera, con la misma clasificación (releer titularidad dentro de la transacción). Declaración de errores permitidos: `backup-import.machine.json` (002) enumera `ERR-PET-MICROCHIP-DUPLICATE`; la 012 **añade** `ERR-CHP12-MICROCHIP-REGISTERED` a los errores admisibles de la importación por **este anexo** (referencia, sin editar la máquina de 002; `T1635`/`T1646`).

## 5. Propuesta de errata — orden en `CHECKING_DOMAIN_INVARIANTS` (**para Neo, Nivel 2; NO aplicada a la 001**)

**Laguna** (dictamen `/architect` 2026-11-27, `.specify/memory/audits/architect-012-EDGE-044-orden-2026-11-27.md`): `specs/001-pet-health-tracker/spec.md:251` (`STATE-BACKUP-001`) asigna `ERR-BACKUP-REFERENTIAL-INTEGRITY` a «IDs huérfanos, duplicados o ajenos» y propaga «otro código específico» para el resto, y `spec.md:162` devuelve «el primer fallo en orden», pero **no ordena el chip frente a los IDs ajenos**. Un respaldo ajeno con chip ya registrado incumple ambos a la vez.

**Texto propuesto** (una frase a añadir en `CHECKING_DOMAIN_INVARIANTS`): «En `CHECKING_DOMAIN_INVARIANTS`, la comprobación de unicidad y reserva de `microchipId` (`REQ-OWN12-008` (b), `REQ-CHP12-001`) **precede** a la de IDs huérfanos, duplicados o ajenos: ante ambos incumplimientos prevalece `ERR-CHP12-MICROCHIP-REGISTERED`». Efecto: el `409` uniforme es el único canal de ese chip (no queda un mensaje distinto que delate el chip, `N2-R4`) y el intento cuenta en los contadores.

**Alternativa descartada (b):** dejar ganar `ERR-BACKUP-REFERENTIAL-INTEGRITY` y relajar la prueba `co-ownership-parity-012.spec.ts:343-353`: el mensaje de IDs ajenos permitiría a un atacante, con un respaldo fabricado, distinguir «mi chip choca» de «mis IDs chocan» y dejaría al intento fuera del contador uniforme. Se descarta (`architect` dictamen).

**Estado**: propuesta. **Hasta que Neo la firme, la 001 queda intacta**; el orden se rige por la 012 (posterior y específica; `REQ-OWN12-008` (b), `EDGE-012-044`) y la prueba `EDGE-012-044` sigue roja hasta `T1646`.

## 6. Pruebas exigidas (cierran en `T1634`/`T1646`)

`SC-012-013` y `SC-012-014` (clases y espías), `SC-012-097` (4 casos con la misma secuencia de llamadas), `SC-012-112` (todas las rutas), `SC-012-117` (importación de N chips), `EDGE-012-044` (tres motores: PostgreSQL 17, SQLite, memoria; caso con IDs nuevos + chip ajeno, hoy no cubierto), reimporte de un respaldo propio (no choca) y carrera (`23505`) con clasificación correcta.

## 7. Decisiones para Neo

1. **Aprobar** `DRAFT → APPROVED` de este anexo (`ENM-002-MINOR-012-CHIP`).
2. **Firmar o rechazar** la errata de orden de §5 sobre la 001 (Nivel 2; la 001 solo la edita Neo).
3. Confirmar que el invitado `INVITED` cuenta como «otra cuenta» para el split (§2, regla 1; decisión derivada de `REQ-CHP12-001`, que solo exime a principal y co-propietario `ACTIVE`).
