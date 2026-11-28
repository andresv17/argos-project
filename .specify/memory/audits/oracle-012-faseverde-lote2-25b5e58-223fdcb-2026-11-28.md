# Acta Oracle — Revalidación lote de corrección fase verde Bloque E (#81), 25b5e58..223fdcb (2026-11-28)

Solo lectura. Fuente de verdad: annex 0.2.2 APPROVED. MAX_RETRY = 1: esta es la revalidación.

## Veredicto: CUMPLE CON RESERVAS (0 ALTA, 1 MEDIA, 3 BAJA, 4 INFO)

## Gates
- npx tsc --noEmit: rc=0
- verify-oracles.sh: 707 archivos, 0 débiles, CUMPLE
- verify-traceability.sh --feature 012: rc=0, CUMPLE (317/317 IDs propios mapeados; purity 0 violaciones)
- vitest dirigido (9 archivos): 99 verdes, 3 omitidos (PG), 0 rojos

## Hallazgos
- MEDIA-1 (ALTA-1 cerrada solo en parte). El aviso de «ceder el principal» se cableó en CHANGE_PRINCIPAL (createRequest) y en salir de la co-propiedad, pero NO en el flujo de TRANSFER (PetTransferPanel / TransferOwnership.tsx), que es el que de verdad hace perder los enlaces PETS al creador (annex §5.1 fila 2: TRANSFER/CHANGE/sucesión; el creador deja de ser principal y co-propietario). §5.1 y §9(q) exigen el aviso al ceder el principal. Sin aviso en TRANSFER. La prueba de cableado no lo cubre. Corrección pequeña (guardPetsRevocation con listPetPets en el panel de transferencia). No requiere cambio de contrato.
- BAJA-1 CHANGE_PRINCIPAL: el aviso se muestra aunque el principal que cede quede como co-propietario ACTIVE y conserve sus enlaces (annex §5.1 último párrafo), y además dispara al CREAR la solicitud (no al ejecutarse). Es exceso de cautela, NO desviación de contrato (no oculta revocación ni bloquea); pero el texto afirma «revoca» cuando ahí no ocurre: ruido inocuo. Aceptable; ideal ajustar.
- BAJA-2 Fail-open (lookup falla => la acción procede sin aviso). Juicio: aceptable frente al contrato. §5.1 exige avisar al actor cuando hay enlaces afectados, no condiciona la acción a que la consulta funcione; bloquear salir/desasignar por un fallo de red o un 404/403 de rol sin enlaces sería peor (atrapa al actor) y el backend sigue siendo la autoridad. Queda como residuo documentado, no es desviación ALTA/MEDIA.
- BAJA-3 Prueba t1517 P-3: la aserción por nombre (`find(n => n === MIGRATION)`) es casi tautológica y el título conserva «la última de SQLite»; ya no prueba que sea la última. Aceptable (el objetivo era no depender de posición); 0026 y migraciones sin cambios.
- INFO-1 Alcance del aviso: consulta enlaces visibles para el actor (listPets/listPetPets). Para acciones sobre terceros (expulsar/degradar a otro) el actor puede ver enlaces ajenos al afectado: sobre-aviso conservador; coherente con EDGE-012-077 (terceros sin aviso).
- INFO-2 Pruebas de cableado de ALTA-1 son inspección de texto fuente (indexOf), no render/interacción; la decisión pura y el texto sí tienen prueba funcional.
- INFO-3 Selector: N+1 getOwnership por mascota no propia en el hogar; aceptable sin cambio de contrato (el servidor responde 422 uniforme si algo no es elegible).
- INFO-4 Staging limpio: solo se consultan commits propios.

## Verificación por punto
1. ALTA-1: aviso solo si hay enlace ACTIVE (REVOKED/EXPIRED no avisan); texto neutro, «revoca entero», «todas las mascotas que contiene, también las de otras personas», «enlace nuevo» (PN-08 a, D-1 a). Cubre desasignar, salir/expulsar, degradar (solo si rol != ADMIN) y co-propiedad. Falta TRANSFER (MEDIA-1).
2. CHANGE_PRINCIPAL: exceso de cautela inocuo (BAJA-1).
3. MEDIA-1 previa CERRADA: eligibleSharePets = principal o co-propietario ACTIVE (principal.userId distinto, coOwners ACTIVE), fallo/404 deja fuera; PetsPage y HouseholdsPage cableados; servidor sigue como autoridad.
4. BAJA-1 previa CERRADA: precheck listMembershipsOfUsers antes de findOwnershipForUpdate/lockScope; prueba confirma 404 ERR-HOUSE-NOT-FOUND y 0 bloqueos; miembro válido pets -> hogar (§6).
5. t1517 P-3: búsqueda por nombre en SQLite (MIGRATION) y PG (PG_VERSION.sql), misma lógica; 0026 no cambia.
6. Staging: los 4 commits no tocan app-config.ts, app.ts, server.ts, origin-verify, logos.*, specs/005/tasks.md ni tasks.md (git show --stat). Los hunks H-01 siguen sin commitear en el árbol.
7. Gates: ver arriba.

## Siguiente paso
Decisión de Morpheus/Neo: corregir MEDIA-1 (aviso en TRANSFER) con un mini-lote de keymaker + revalidación acotada, o aceptar como deuda. MAX_RETRY agotado para este lote: cualquier nuevo ciclo lo autoriza Neo.
