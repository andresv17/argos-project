# Acta Mouse: estructura SDD de la Feature 011 (2026-11-25)

FROM: Mouse (SDD Single Gate Auditor)
TO: Morpheus (Tech Lead)
STATUS: PASS CON OBS (no bloqueante; no se marca ningún `[x]` ni se cambia ningún estado)
Alcance: solo estructura (trazabilidad, huérfanos, completitud de contratos, plantilla, referencias). No se evalúa lógica de negocio ni las decisiones de Neo.

## 1. Compuerta de trazabilidad
- `bash scripts/verify-traceability.sh --feature 011; echo rc=$?` → `rc=0`.
- Resultado de la herramienta: `Resultado: CUMPLE`; spec→tasks 1:1 `120/120` IDs propios de la 011; pureza `0` violaciones; 84 IDs vigentes (6 retirados); `IDs trazados: 13/84` (informativo, evidencia de código).

## 2. Historias de usuario ↔ tareas (0 huérfanas)
| User Story (spec.md) | GH | Bloque en tasks.md | Tareas |
| --- | --- | --- | --- |
| US1 Compartir con veterinario | #64 | A | T1506–T1511 |
| US2 Contenido IA identificado | #72 | B | T1512–T1516 |
| US3 Prompts no visibles | #73 | C | T1517–T1523 |
| US4 Roles de plataforma | #63 | D | T1524–T1532 |
| US5 Informe clínico | #31 | E | T1533–T1537 |
| US6 Foto del hogar | #59 | F | T1538–T1541 |
| US7 Álbum del hogar | #62 | G | T1542–T1547 |
| US8 Tope de hogares | #74 | H | T1548–T1552 |
| US9 Foto de perfil | #78 | I | T1553–T1558 |

- 9/9 historias con tareas; 0 historias huérfanas.
- Sentido inverso: las 61 tareas T1501..T1561 (sin huecos) llevan `[GH:#N]`; las de Fase 0 (T1501–T1505) y Fase final (T1559–T1561) llevan la lista completa de los 9 Issues. Ninguna tarea sin historia.
- `[x]` encontrados: 0 (`grep -c '^- \[x\]'` = 0).
- Los 9 ítems del inbox (`#63, #64, #72, #73, #31, #59, #62, #74, #78`) tienen bloque propio.

## 3. Sección «Pendientes de Neo» (spec.md, líneas 161–175)
- Presente. Estructura: tabla de 7 filas que agrupan **11 identificadores**: `F-03`; `F-05`; `F-11`; `H-1`; `H-6`; `MIF-011-03`; `MIF-011-04`; `MIF-011-10`; `MER-11-01`; paginación de `D11-11`; decisión 2FA (`D11-02`).
- **Observación (OBS-1)**: el encargo habla de 9 puntos; el documento no reproduce esa cifra (7 filas / 11 identificadores). No encontré en disco un acta que enumere 9 puntos (`claude/decisiones-neo-011-2026-11-25.md` no tiene sección de pendientes). Conviene que `/architect` o Neo confirmen el recuento esperado. No es bloqueante.
- Ninguno aparece como decidido: todas las filas dicen `PENDIENTE DE NEO`; `D11-02` figura como **ABIERTA**. Coherente con la cabecera (12 de 13 cerradas).
- Reservas `EDGE-011-011` y `EDGE-011-014`: sin texto, marcadas como reservadas. Las referencias a ellas en tasks.md son referencias a esa reserva, no IDs huérfanos.

## 4. Contratos (contracts/README.md)
- Inventario presente con 6 filas de contratos previstos: `admin.openapi.yaml` + `admin-delegate.schema.json`; `admin-delegate.machine.json` (`STATE-ADM11-001`); `error-catalog.json`; enmienda de la vista pública; lectura del álbum; avatar de usuario; tope de hogares.
- `contracts/errors/error-catalog.json` **existe** y es JSON válido (`json ok`), con `additionalProperties`-free envelope por `$ref` a `common.schema.json#/$defs/ProblemDetails`, `change_type: MINOR`, `errors: {}` (vacío por diseño hasta las tareas `[ARCH]`).
- Los demás contratos previstos están **marcados como previstos** (con tarea `[ARCH]` asignada: T1524, T1534, T1542, T1553, T1548), **no como faltantes**. Correcto según el encargo.
- **OBS-2**: el catálogo declara `"status": "APPROVED"`. Es firma de Neo según el mensaje de `6d8ca54` («firmas Nivel 2 … catálogo de errores 011»); lo registro sin juzgarlo.
- **OBS-3**: `contracts/README.md` dice que el catálogo lo habitan los códigos `ERR-ADM11-*`, `ERR-HOG11-*`, `ERR-PRF11-*`; hoy no hay ningún código definido (catálogo vacío). Esperado para Fase 0.

## 5. Dependencias
- Todas las referencias en campos `Dep:` apuntan a IDs definidos (0 dangling). Las 61 tareas están definidas.
- Menciones no-dependencia fuera de `Dep:` (no son IDs rotos, son prosa): `T1401` y `T1437` (rango de 010, línea 5); `T1590` (límite del rango de numeración, línea 5).
- Referencias a archivos de auditoría citados en spec.md (`lock-011-T1502…`, `trinity-011-T1505…`, `mifune-011-T1504…`, `merovingian-011-T1504…`, `architect-011-T1505…`) y a `claude/decisiones-neo-011-2026-11-25.md` e `claude/inbox-feature-011.md`: **existen en disco**.

## 6. Plantilla (observaciones no bloqueantes)
- **OBS-4**: 29 de 61 tareas no llevan etiqueta de tipo `[N2|GOV|HUM|ARCH|LOCAL]`, aunque la línea de formato del encabezado la muestra como parte del patrón. La plantilla no declara explícitamente que sea obligatoria. Recomendación: que `/architect` aclare en el encabezado si la etiqueta es opcional o si debe añadirse a las tareas de implementación.
- **OBS-5**: los SC individuales no están enumerados uno por línea en `tasks.md`; solo aparecen rangos (`SC-011-001..009`, etc.). La propia nota de `spec.md` (línea 195) lo aplaza a «antes de `T1511`». La herramienta lo acepta (120/120), por lo que no es bloqueante, pero el compromiso sigue pendiente.

## Veredicto
PASS CON OBS. Trazabilidad rc=0; 0 historias huérfanas; 0 tareas `[x]`; 0 dependencias rotas; contratos previstos correctamente marcados; «Pendientes de Neo» presente y sin decisiones tomadas. Observaciones OBS-1 a OBS-5 no bloquean.

## Recomendación
Morpheus puede continuar la cadena de la 011 (Fase 0 y `/architect`). Antes de `T1511`, `/architect` debe cerrar OBS-5 (SC individuales) y aclarar OBS-1 (recuento de pendientes) con Neo. Nada de esto impide la siguiente etapa.

Sin commit, sin push, sin `[x]`, sin cambios de estado, sin modificar spec/plan/tasks/contracts.
