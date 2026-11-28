# Oracle 012 Bloque C: revalidación ec4573b (hogar lista mascotas con acceso, T1655 tramo 2)
Fecha 2026-11-27. Solo lectura. Veredicto: CUMPLE CON RESERVAS (R1 menor, sin decisión de Neo).

1. Producción: el diff de src es una sola línea eliminada (`listByPet(...).length === 0 -> continue` en GetHouseholdCareTodayUseCase). CUMPLE.
2. Criterio: solo `ctx.access.canViewRoutines`. Contrato getHouseholdCareToday (care.openapi.yaml l.230): "Solo las mascotas asignadas ... con acceso de cuidado (titular, o CAREGIVER VIEW_ONLY/BASIC_LOG vigente)". CareHouseholdToday.pets[].items admite []. CUMPLE.
3. Aserciones: SC-012-030 (filter petId, 1) y SC-012-026/T-C5 ("ARGOS no aparece", "todos items vacíos") coherentes. CUMPLE.
   Semántica ADMIN/MEMBER/READER: careAccess devuelve NONE a no titulares y no cuidadores, así que NO ven la mascota ajena (ni LUNA de MARIA); solo ven mascotas de las que son titulares, con items []. Contrato: "grupos vacíos, sin 403". Clasificación: ya decidida por contrato/T-C5, NO requiere Neo. Reserva R1: la frase "200 con grupos vacíos" es ambigua (pets [] vs grupo con items []); la implementación toma pets sin esa mascota. Sugerencia: aclarar redacción en la próxima revisión del contrato (Architect).
4. Nueva prueba [SC-012-026][R-8]: VIEW_ONLY con mascota sin rutinas aparece con items []; corre en los 3 motores (63 tests PG, 42 + 21 skipped sin PG). CUMPLE.
Gates (rc): vitest sin PG 0 (42 ok/21 skipped); con PG 0 (63/63); tsc 0; verify-oracles 0 (débiles 0); verify-traceability --feature 012 0 (pureza 0).
