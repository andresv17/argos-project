# Dictamen /architect — 012 EDGE-012-044: orden de validación de la importación (2026-11-27)

Solicitante: /morpheus. Sin cambios de código. Define el trabajo de keymaker en el Bloque B (B-2 de Neo: las 2 pruebas siguen ROJAS con asertos intactos hasta entonces).

## Veredicto
**(a) El código está mal; la prueba está bien.** Con un chip ya registrado por otra cuenta, la importación debe responder `409 ERR-CHP12-MICROCHIP-REGISTERED`, no `ERR-BACKUP-REFERENTIAL-INTEGRITY`.

## Evidencia normativa
- spec 012 `spec.md:82` (REQ-OWN12-008 (b)): si el chip importado ya existe o está reservado por disputa, la importación "falla cerrada con el mismo `409 ERR-CHP12-MICROCHIP-REGISTERED`", usa "el mismo comprobador de unicidad y reserva que el alta" y cuenta cada chip como intento.
- `spec.md:378` (EDGE-012-044): idéntico; sin indicar qué chip chocó.
- `spec.md:327` (SC-012-112): importación de respaldo, restauración, /admin y semilla "pasan por el mismo comprobador y devuelven el mismo 409 ERR-CHP12-MICROCHIP-REGISTERED".
- `spec.md:402` (EDGE-012-068) y `spec.md:89`/tasks T1646 (comprobador único).
- `contracts/errors/error-catalog.json:176-183`: el catálogo lista `EDGE-012-044` en `requirementRef` de ERR-CHP12-MICROCHIP-REGISTERED; no lo lista ERR-BACKUP-REFERENTIAL-INTEGRITY (`specs/001.../error-catalog.json:216-221`, solo IDs duplicados/huérfanos/ajenos).
- 001 `spec.md:251` (STATE-BACKUP-001): en `CHECKING_DOMAIN_INVARIANTS`, "IDs huérfanos, duplicados o ajenos -> REFERENTIAL; otras violaciones -> código específico propagado". `spec.md:162`: ante varias reglas incumplidas se devuelve el primer fallo en orden, pero ese orden no lista el chip frente a los IDs ajenos: **laguna de especificación**, no contradicción.

## Por qué la prueba es correcta
En la prueba Carlos importa el respaldo exportado por Andrés: incumple a la vez (1) IDs de mascota ajenos y (2) chip ya registrado. La spec 012 (posterior, específica y con regla "toda ruta pasa por el mismo comprobador") manda que el chip registrado produzca ERR-CHP12-MICROCHIP-REGISTERED. Además es lo seguro: el chip es un valor de baja entropía enumerable, el 409 uniforme es el canal anti-oráculo (N2-R4); si los IDs ajenos ganaran, el mensaje distinto delataría y dejaría fuera del contador/uniformidad al intento de chip. La ruta actual (`backup-use-cases.ts:~548` `assertNoForeignIds` antes de `pets.save`; y `~594-598` que traduce la violación del índice a ERR-PET-MICROCHIP-DUPLICATE) además está mal en un segundo punto: un chip de OTRA cuenta con IDs nuevos devuelve hoy ERR-PET-MICROCHIP-DUPLICATE, pero REQ-CHP12-001 (`spec.md:88`) reserva ese código para "mismo dueño".

## Qué hace keymaker en el Bloque B (T1646/T1631)
1. Antes de `assertNoForeignIds` (dentro de CHECKING_DOMAIN_INVARIANTS), ejecutar el comprobador único de unicidad y reserva para todos los `microchipId` del sobre, descontando las mascotas propias del importador que la importación por reemplazo va a borrar (el reimporte de un respaldo propio NO debe chocar).
2. Si hay chip ocupado por otra cuenta o reservado por disputa: `ERR-CHP12-MICROCHIP-REGISTERED` (409, cuerpo y cabeceras uniformes, sin nombre de mascota ni posición ni chip), `finalState: "ROLLED_BACK"`, N intentos contados (EDGE-012-068), mismas llamadas al repositorio que el alta.
3. Reemplazar la traducción de `~594-598`: mismo dueño -> ERR-PET-MICROCHIP-DUPLICATE; otra cuenta -> ERR-CHP12-MICROCHIP-REGISTERED. El duplicado dentro del propio archivo (`~365-377`) permanece como ERR-PET-MICROCHIP-DUPLICATE (mismo dueño).
4. Cubrir motores PostgreSQL 17, SQLite y memoria; añadir un caso con IDs nuevos + chip ajeno (hoy no cubierto).

## Laguna a cerrar (architect, Bloque B, T1631)
Registrar en el anexo del split de error una errata: "en `CHECKING_DOMAIN_INVARIANTS` de STATE-BACKUP-001 la unicidad/reserva del chip (REQ-OWN12-008 (b)) precede a la comprobación de IDs ajenos". Toca un documento 001 normativo: la fusión a APPROVED/LOCKED es potestad de Neo (Nivel 2).

NO se relaja ni se cambia el aserto de `tests/integration/co-ownership-parity-012.spec.ts:343-353`.
