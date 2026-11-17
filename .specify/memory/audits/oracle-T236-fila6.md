# Auditoría Oracle: T236 fila 6 (pruebas 002 de rol efectivo y matriz)

Fecha: 2026-11-11. Rama: 002-plataforma-v21. Auditor: Oracle. Sin modificar src/, tests/, specs/, contracts/, tasks.md. Sin git stash, checkout, reset ni commit.

## Veredicto: PASS CON OBSERVACIONES

Las 15 pruebas 002 nuevas son adiciones limpias, sin oráculos débiles, con valores coherentes con la spec y con el fixture 002. Fallan por módulo ausente (esperado en fase roja). Quedan observaciones que requieren decisión de Neo antes de avanzar a T244.

## Tabla de verificaciones

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1 | Solo adiciones en los dos archivos | CUMPLE | `git diff --stat`: 318 inserciones, 0 borrados en ambos. Hunks `@@ -73,3 +73,170` (property) y `@@ -102,3 +102,154` (unit) solo conservan líneas de contexto. |
| 2 | Oráculos débiles | CUMPLE | `bash scripts/verify-oracles.sh`: "Archivos analizados: 77; oráculos débiles: 0; Resultado: CUMPLE". Grep manual de `expect(true)`, `toBeDefined`, `toBeTruthy()`, `.skip`, `.todo`, `.only`, `xit`, `xdescribe`, `it.each`, `test.each`, `.fails` en ambos archivos: 0 coincidencias. |
| 3 | Cobertura frente a título y fuentes | CUMPLE CON OBSERVACIONES | Ver sección "Cobertura" abajo. |
| 4 | vitest en los dos archivos | 17 fallidas / 8 pasadas de 25 | 15 nuevas fallan: 11 de unit y 4 de property. 14 llegan a `Failed to load url ../../src/domain/access/effective-role.ts`; 1 (escalera, property) llega a `rbac.ts`. Ningún fallo de sintaxis. Los 2 fallos restantes son de la 001 (EDGE-008/009), ver verificación 5. |
| 5 | Afirmación de Keymaker sobre EDGE-008/009 | CIERTA | Ver sección "EDGE-008/009". |
| 6 | Firma de `effectiveRole` | SUPOSICIÓN NO FIJADA | Ver sección "Firma". |
| 7 | `tsc --noEmit` | CUMPLE | 5 errores, todos TS2307 de módulos ausentes: `access.property.spec.ts(184,17)` y `(185,62)`; `access-policy.spec.ts(161,17)` y `(162,59)`; `permissions-matrix.spec.ts(49,34)` (rbac.ts). Ningún error de otro tipo. |

### Salidas reales

- `bash scripts/verify-oracles.sh`:
  ```
  [SDD Oracle Gate] Analizando suites en tests/ contra Weak Oracles...
  [SDD Oracle Gate] Archivos analizados: 77; oráculos débiles: 0
  [SDD Oracle Gate] Resultado: CUMPLE
  ```
- `npx vitest run tests/property/access.property.spec.ts tests/unit/access-policy.spec.ts`: `Test Files 2 failed (2)`, `Tests 17 failed | 8 passed (25)`.
- `node_modules/.bin/tsc --noEmit`: 5 errores TS2307 (listados arriba).

### Recuento

- `tests/unit/access-policy.spec.ts`: 19 pruebas en total = 8 de la 001 + 11 nuevas de la 002. Coincide.
- `tests/property/access.property.spec.ts`: 6 pruebas en total = 2 de la 001 + 4 nuevas de la 002. Coincide.

## Cobertura (verificación 3)

Fuentes consultadas: `specs/002-plataforma-v21/spec.md` (REQ-RBAC-001 en línea 219; INV-ACC2-001 en línea 279; INV-ACC2-002 en línea 280; SC-003 en línea 341; SC-008 en línea 346) y `specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json` (clave `rbacMatrix`).

- **Matriz canónica**: `rbacMatrix` tiene 44 filas (11 acciones x 4 roles). Comparada celda por celda con la tabla de REQ-RBAC-001: 0 discrepancias.
- **Expectativas de las pruebas nuevas**: los valores que fijan (OWNER sin hogares, ADMIN de hogar sin asignación = null, Cuidador que escribe eventos sanitarios pero no edita ni elimina, ladder READER ≤ CAREGIVER ≤ ADMIN ≤ OWNER, EDIT_PET_BASICS solo ADMIN, DELETE_PET nunca para roles de hogar) coinciden con la tabla de la spec. No se copian de implementación (no existe).
- **Fixture usado**: las pruebas nuevas NO usan `canonical-fixtures.json` de la 002. Reutilizan los datos de la 001 (`andres`, `maria.v`, `carlos_88`, `lucia.r`) y construyen membresías y asignaciones dentro de cada caso. Es aceptable, pero no vincula las pruebas con los escenarios canónicos 002 (`ana.duena`, `bruno.admin`, `carla.cuida`, `diego.lector`, `elena.solo`).

Correspondencia título-cobertura:

| Prueba (archivo:línea) | Cubre lo que dice |
|---|---|
| unit:172-176 OWNER sin hogares | Sí |
| unit:178-182 dueño con READER no pierde OWNER | Sí |
| unit:184-193 CAREGIVER en un hogar + READER en otro, ambos órdenes | Sí |
| unit:195-204 ADMIN gana con tres hogares | Sí |
| unit:206-210 ADMIN sin asignación = null | Sí |
| unit:212-218 INVITED/DECLINED/CANCELLED/LEFT/REMOVED sin rol | Sí |
| unit:220-224 ACTIVE en hogar sin asignación | Sí |
| unit:226-229 sin membresía | Sí |
| unit:231-235 asignación de otra mascota | Sí |
| unit:237-245 Cuidador: registra eventos, no edita ni elimina | Sí |
| unit:247-254 sin rol, ninguna acción permitida | Sí |
| property:188-199 effectiveRole = oráculo, sin depender del orden | Sí |
| property:201-211 visible sii rol no nulo (SC-003) | Sí |
| property:213-229 rol de hogar no edita más allá de su fila | Sí |
| property:231-241 escalera de la matriz | Sí, con observación (ver O-3) |

Huecos de cobertura frente a la descripción de T236 y la fila 5 de la sección C:

- **SC-008** (44 casos de matriz, 100 % coincidencia) no está en estos dos archivos. Está en `tests/unit/permissions-matrix.spec.ts`, que es un archivo sin seguimiento (`??`) fuera de esta entrega. Ver O-1.
- **Escritura 002 denegada o no encontrada** (INV-ACC2-002: lee pero la matriz niega → ERR-ACC-FORBIDDEN; no lee → ERR-PET-NOT-FOUND) no tiene prueba 002 propia. Las pruebas 001 de escritura (unit:83-96, property:60-74) siguen con la regla 001 "solo el dueño escribe". Ver O-4.

## EDGE-008/009 (verificación 5): afirmación de Keymaker CIERTA

Afirmación (claude/log-keymaker.md:189): "2 de la 001 (EDGE-008/009) ya estaban rojas en HEAD: esperan INV-ACC-00x y el catálogo generado usa INV-ACC2-00x".

Evidencia, en modo lectura (`git show HEAD:...`, sin tocar el árbol):

- `git show HEAD:tests/unit/access-policy.spec.ts`: línea 57 `expect(error.invariantRef).toBe('INV-ACC-001')` (EDGE-008); línea 88 `expect(error.invariantRef).toBe('INV-ACC-002')` (EDGE-009).
- `git show HEAD:src/generated/errors/error-codes.ts`: `ERR-ACC-FORBIDDEN` tiene `"invariantRef": "INV-ACC2-002"`; `ERR-PET-NOT-FOUND` tiene `"invariantRef": "INV-ACC2-001"`.
- `src/generated/errors/error-codes.ts:326` (`this.invariantRef = entry.invariantRef`): el `DomainError` toma `invariantRef` del catálogo, no de un valor escrito en el código.
- `src/domain/access/access-policy.ts` no aparece como modificado en `git status`, así que su versión de HEAD y la del árbol son iguales. Sus `@implements INV-ACC-001/002` son comentarios, no fuente del `invariantRef`.

Conclusión: en HEAD, `access-policy.spec.ts` líneas 57 y 88 esperan `INV-ACC-00x`, pero el catálogo generado devuelve `INV-ACC2-00x`. Esas dos aserciones fallan en HEAD. Es una deducción por lectura de código; no se ejecutó vitest sobre HEAD porque eso exigiría cambiar el árbol.

Nota: la 001 no pasó a rojo por esta entrega. Esa entrega solo añadió 0 líneas en esas aserciones (confirmado por el diff).

## Firma de effectiveRole (verificación 6)

- La spec no fija la firma. Define la función pura `can(rol, acción)` (REQ-RBAC-001, línea 219) y el rol efectivo como "Propietario Legal, o el mayor rol de membresía ACTIVE entre los hogares donde la mascota está asignada". INV-ACC2-001 (línea 279) define la lectura en términos de hogar asignado y membresía ACTIVE.
- La firma `effectiveRole(usuario, mascota, membresías con rol, asignaciones mascota-hogar) -> RbacRole | null` aparece en un comentario de las pruebas ("Firma supuesta", unit:107-111 y property:77-82). Es una suposición de Keymaker, no un dato de la spec.
- `tasks.md` T244 (línea 143) dice "Implementar `can(rol, acción)` y el rol efectivo en `rbac.ts` y `effective-role.ts`", sin fijar la firma.
- Riesgo: los tipos de las funciones cargadas se forzan con `as EffectiveRoleFn` / `as CanFn` (unit:161-162, 184-185 de property). El compilador no detecta una firma distinta; el desajuste aparecería solo en ejecución cuando T244 esté implementado.

Conclusión: la firma es suposición que T244 debe confirmar o fijar antes de implementar.

## Observaciones

- **O-1 (cobertura de la fila 6)**: T236 incluye `tests/unit/permissions-matrix.spec.ts` (SC-008, 44 casos). Ese archivo está sin seguimiento en git, fuera de la entrega auditada. Su informe previo está en `.specify/memory/audits/oracle-T236-permissions-matrix.md`. Esta fila no queda completa hasta cerrar la parte 1 con Neo.
- **O-2 (discrepancia de cifras)**: la sección C (`hoja-de-ruta-feature-002.md`, fila de `access-policy`) dice "32 celdas"; la spec (SC-008, línea 346) y T236 dicen 44. Hay que corregir la hoja o confirmar la cifra.
- **O-3 (oráculo condicional)**: property:231-241 ejecuta `if (can(lower, action)) expect(can(upper, action)).toBe(true)`. Es una propiedad de monotonía válida (la matriz de la spec la cumple, verificado), pero la aserción solo se evalúa cuando el rol menor puede. Sustituir por `expect(!can(lower,a) || can(upper,a))` no cambia el resultado; se puede dejar como está.
- **O-4 (pruebas 001 que contradicen la 002)**: unit:98-103 (`solo el dueño escribe`) y property:60-74 (`canWrite` solo para dueño) fallarán cuando T244 implemente la matriz. Es lo que prevé la sección C (sustitución). No deben borrarse sin su sustituta.
- **O-5 (estado de tasks.md, fuera de esta fila)**: `specs/002-plataforma-v21/tasks.md` tiene T226 a T235 en `[x]` sin commit (`git diff --stat`: 10 líneas cambiadas). Solo Neo puede marcar COMPLETED (CLAUDE.md §1). Esto ya se escaló en `claude/log-oracle.md`; no se modificó nada aquí.
- **O-6 (uso de datos 001)**: las pruebas nuevas no consumen el fixture 002 (ver Cobertura). Aceptable, pero reduce el vínculo con los escenarios canónicos 002.

## Pendientes

- Decisión de Neo (a): EDGE-008/009 de la 001. Opciones: (1) actualizar las dos aserciones a `INV-ACC2-001` / `INV-ACC2-002` (son correctas según la spec 002 y el catálogo); (2) sustituir las dos pruebas por sus equivalentes 002. Hasta decidir, quedan en rojo con causa conocida.
- Decisión de Neo (b): confirmar la firma de `effectiveRole` (o fijarla antes de T244).
- Cerrar la parte 1 (`permissions-matrix.spec.ts`) con Neo antes de declarar T236 completa.
- No hay defecto concreto en las pruebas nuevas que exija devolver a Keymaker. MAX_RETRY no se consume.

## Veredicto final

PASS CON OBSERVACIONES. ESTADO: Validación requerida (espera decisión de Neo sobre (a) y (b)). T236 no se marca como completada.
