# Veredicto Oracle: cambios sin commit en tests/e2e (2026-11-14)

HEAD d8beed8. Auditoría de solo lectura; se ejecutó la suite Playwright sin escribir en el repo (test-results está ignorado por git).

## 1. Diff: APTO
`git diff tests/e2e` coincide exactamente con lo listado: wcag.spec.ts L29-31 (DOG/CAT a CANINE/FELINE), L44 (roleOnJoin 'READER' y 202 como estado esperado), L70 (8 a 10); pet-dashboard.spec.ts L10 (usuario). Nada más. Otros archivos modificados (CLAUDE.md, GUIA-SKILLS-MATRIX.md, SKILLS-PROPUESTAS.MD, logos.*) no son de tests/e2e.

| Cambio | Fundamento | Veredicto |
|---|---|---|
| DOG a CANINE (L29) | pet.schema.json:34-35,43 (migración 001 DOG a CANINE, CAT a FELINE, REQ-MIG-001). Autorizado por Neo | Corrección legítima |
| CAT a FELINE (L30-31) | pet.schema.json:35 (enum Species) | Corrección legítima, misma causa que DOG |
| roleOnJoin 'READER' + 202 (L44) | identity.schema.json:446 y :517 (campo requerido en la invitación), household-membership.machine.json:47. Nota: el 202 como estado esperado es un supuesto del helper apiPost; no lo verifiqué contra openapi línea a línea, pero la suite lo ejecuta y el seed pasa | Corrección legítima (contrato 002) |
| "entre 8 y 128" a "entre 10 y 128" (L70) | error-catalog.json:149 (ERR-AUTH-WEAK-PASSWORD, "entre 10 y 128"), src/generated/errors/error-codes.ts:86, y tests/unit/auth-policies.spec.ts:152 y session-client.spec.ts:25 ya esperan 10. El propio pet-dashboard.spec.ts:40 ya usaba "10 y 128" y pasa | Corrección legítima, no relaja nada. Coincide con B-10 de architecture_spec.md:416 |
| Usuario duena.e2e a duena.dashboard.e2e | Evita colisión de nombre de usuario con otro spec (sin fundamento contractual, pero no altera expectativas) | Aceptable (autorizado por Neo) |

Decisión sobre la ampliación de Keymaker: ACEPTABLE (APTO). Los tres extras alinean el test con contrato 002 o catálogo, no debilitan ninguna aserción. Sugerencia: que Keymaker lo registre en su bitácora como ampliación sobre lo autorizado por Neo.

## 2. wcag.spec.ts:83 (SUPERSEDED, 0 encontrados): APTO CONDICIONADO, caso (a) expectativa incorrecta, no regresión
Evidencia:
- El seed (L35-36) crea dos vacunas 'Rabia'; la más antigua queda SUPERSEDED según STATE-ALERT-001 (sanitary-alert.machine.json: guard `hasNewerRecordOfSameKey === true`; evaluador en src/domain/alerts/sanitary-alert-evaluator.ts:78-91). El dato y la máquina funcionan bien.
- La API de la ficha separa vigentes y reemplazados: src/application/use-cases/pet-use-cases.ts:178-182 (`vaccinations` filtra SUPERSEDED; `supersededVaccinations` los lleva aparte; REQ-REC2-002).
- La UI solo pinta `dashboard.vaccinations` (src/presentation/web/components/PetDashboard.tsx:69-82); `supersededVaccinations` no aparece en src/presentation. Esto está documentado como brecha B-8 (architecture_spec.md:414) y el ui_blueprint.md:585 dice "no se renderizan".
- Así no hay regresión: el comportamiento del dominio es correcto. El test espera una insignia gris que la UI actual no renderiza. Es mezcla de (a) y (c): la expectativa viene de la 001 y la UI 002 aún no pinta reemplazados. Opciones para Neo/Architect: renderizar el acordeón de reemplazados (cambio de UI) o ajustar el test a 3 insignias y cubrir SUPERSEDED en otro nivel. Nota: ui_blueprint.md:393 sigue listando SUPERSEDED como valor de `data-alert-status`, contradiciendo ui_blueprint.md:585; conviene que Architect lo aclare.

## 3. pet-dashboard.spec.ts:61 (peso fuera de rango): APTO CONDICIONADO, expectativa desactualizada
- Espera "El peso debe situarse entre 0.05 kg y 150.00 kg" (L61). B-10 (architecture_spec.md:416) ya documenta exactamente este texto como no coincidente (cita L61).
- La validación en cliente usa el catálogo: src/presentation/web/validation.ts:62 (`ERROR_CATALOG[code].detailTemplate`). El texto real es el detailTemplate de ERR-REC-WEIGHT-OUT-OF-RANGE (error-catalog.json:345): "El peso está fuera del rango de la especie: perros y gatos de 0.05 a 150.00 kg con máximo 2 decimales; las demás especies de 0.001 a 150.000 kg con máximo 3 decimales (cota máxima provisional, a validar por veterinario)."
- Es cambio de contrato (catálogo 3.0.0, INV-REC2-002, por especie), no regresión. El test debe esperar un fragmento del catálogo (p. ej. "El peso está fuera del rango de la especie"). No lo toqué (solo lectura; fuera de lo autorizado por Neo).

## 4. Suite completa (npx playwright test --reporter=list, con .env cargado solo en el proceso)
Total 38: 26 pasaron, 2 fallaron, 10 no ejecutados (modo serial tras fallo).
- Fallos: wcag.spec.ts:74 (L83, SUPERSEDED) y pet-dashboard.spec.ts:49 (L61, texto de peso).
- No ejecutados: wcag.spec.ts:90, :107, :116, :131 (4) y pet-dashboard.spec.ts:75, :99, :112, :136, :150, :171 (6).
- Pasaron: wcag:52 (login) y :63 (registro, ya con el texto de 10) y el resto de household.spec y demás.
- Tras la ejecución: git status sin cambios nuevos en tests/ ni src/; sin servidores de dev activos (pgrep sin vite/tsx/playwright; solo el MCP de Playwright ajeno).

## 5. Lo no verificado
- Pruebas axe sin ejecutar: wcag.spec.ts:90 (nueva mascota, edición y diálogo de eliminación), :107 (hogares con INVITED; B-10 anticipa que `[data-membership-status="INVITED"]` ya no existe y fallará), :116 (contexto de hogar), :131 (respaldo). Del :74 solo se ejecutó el seed y las pestañas hasta Vacunas; el axe de Desparasitación, Consultas y Parámetros tampoco corrió. Se ejecutaron axe de login y registro (:52, :63).
- No consta en disco que el axe externo haya validado esas pantallas: no hallé evidencia en claude/ en esta auditoría (no la busqué exhaustivamente); declárese pendiente hasta que Sati/Keymaker la cite con archivo.
- pet-dashboard:75 (semáforo con gris "reemplazada") fallará por la misma causa B-8 cuando se alcance.
- No verifiqué el 202 de la invitación contra openapi.

DE: Oracle
PARA: Neo (Andrés Vallejo — Nivel 2) vía Morpheus
ESTADO: Validación requerida
DETALLE: Cambios de tests/e2e = diff exacto y legítimos; 2 fallos por expectativas desactualizadas (B-8, B-10), no regresiones. Suite 26 pasan, 2 fallan, 10 sin ejecutar.
SIGUIENTE PASO RECOMENDADO: Neo decide si se renderiza el acordeón de reemplazados o se ajusta el test; autorizar a Keymaker corregir el texto de peso (pet-dashboard.spec.ts:61) y la expectativa INVITED (wcag.spec.ts:107).
