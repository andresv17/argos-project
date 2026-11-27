# Acta /oracle — Cierre de Fase 0 de la Feature 011 (enmienda por directiva de Neo, iter 208)

**Fecha**: 2026-11-25 | **Rama**: `011-pulido-portal-hogares-admin` | **Base**: `6d8ca54` | **Auditor**: `/oracle` (solo lectura; sin commit, push, `[x]` ni cambio de estados)
**Veredicto: PASS CON OBS** (0 FAIL; 3 observaciones, ninguna bloquea el cierre de Fase 0).

## 1. Los 9 puntos (spec / plan / tasks / README / acta)
| Punto | Resultado | Evidencia en disco |
| --- | --- | --- |
| F-03 / EDGE-011-011 | OK | `spec.md` REQ-ADM11-005(b)(c)(d) y EDGE-011-011: raíz cuenta como SUPER_ADMIN; total = raíz + delegados SUPER_ADMIN ACTIVE; prod rechaza lista vacía (dev/test permite); `SELECT … FOR UPDATE` / `BEGIN IMMEDIATE`, servicio único; prueba T1525; T1524/T1527 |
| F-05 / EDGE-011-014 | OK | `D11-06` = A sin reabrir; EDGE-011-014/005; aviso UI literal; prueba T1506, impl. T1508; T1507 fundida/sin cambio |
| F-11 | OK | US2.1 y REQ-IA11-002: etiqueta visible y accesible en superficies web, sin marca en bytes |
| H-1 | OK | REQ-ADM11-001/006/007, plan, T1524/T1527/T1528: INVITED 72 h (constante `app-config.ts`), DENIED uniforme, re-invitación explícita, confirmación de correo, alta y anclaje auditados |
| H-6 | OK | REQ-ADM11-002/005(a), D11-01 enmendada, T1524: solo la raíz concede/revoca SUPER_ADMIN; sin autopromoción |
| MIF-011-03 | OK | ADR-011-04, plan #62, T1542 N/A, T1544 sin ruta/contrato nuevos; README marca «No aplica» |
| MIF-011-04 | OK | REQ-IA11-003, ADR-011-03, T1517/T1521: sin `tEXt` del prompt en echo |
| MIF-011-10 = NO | OK | plan (Nivel 2) y README/T1524/T1553: migraciones separadas #63 (Bloque D) y #78 (Bloque I) |
| MER-11-01 | OK | `GET /api/shared/:token/pets/:petId/avatar`, enmienda MINOR de 005 en T1534, `t750/t770/t778` intactos, `credentials: 'omit'`, 404; /rama + /trinity |
| Paginación 24 por mascota | OK | D11-11, EDGE-011-017, T1543 sin condicionales |
| D11-02 = D | OK | REQ-ADM11-008, T1532 resuelta, plan riesgo 1, acta; sin 2FA técnico |

## 2. Pendientes retirados / decisiones abiertas
- «Pendientes de Neo» ya no existe en `spec.md` (grep sin resultados); `D11-02` figura «Cerrada = D» en spec, plan, tasks, README y acta; tasks.md checkpoint: «Ninguna decisión de Neo queda abierta».
- Residuo no decisional: el acta conserva «Hallazgo pendiente para T1503: PENDIENTE» (premisa NOMBRE-HOGAR/ContextSelector, verificación de prueba local, no decisión de producto). Ver ORA-3.

## 3. Coherencia y decisiones derivadas
Sin contradicción entre spec, plan, tasks y README en los 9 puntos. Pero las decisiones derivadas declaradas por architect **no están señaladas como derivadas** en ningún artefacto (grep «derivad» sin coincidencias pertinentes en plan/tasks/acta). Ver ORA-1 y ORA-2.

## 4. Compuertas (literales)
- `bash scripts/verify-traceability.sh --feature 011` → **rc=0** («CUMPLE»; Spec→tasks 1:1 120/120; 84 IDs vigentes; pureza 0 violaciones).
- `bash scripts/verify-oracles.sh` → **rc=0** («CUMPLE»; 568 archivos; 0 oráculos débiles).
- Casillas `[x]` en `specs/011/tasks.md`: **0** (`grep -cE '^\s*- \[[xX]\]'` = 0; las 5 coincidencias de `[x]` son texto en prosa).

## 5. Alcance de cambios (git status)
Dentro de la enmienda: `specs/011-…/{spec,plan,tasks}.md`, `contracts/README.md`, `claude/*` (bitácoras, bus, acta de decisiones), `.specify/memory/audits/*`. Ajenos preexistentes (solo listados, sin juicio): `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `playwright.config.ts`, `specs/005-album-archivos-clinicos/tasks.md` (T797 `[ ]`→`[x]`, firma de Neo de 005, fuera de 011), `.claude/hooks/logos-stop-guard.mjs`, `.claude/skills/superdesign/`, `.playwright-mcp/`, `Claude outputs/`, `fonttools-*.whl`, `gate-T296-output.txt`, `logos.json(.bk)`, `scripts/gh-project-sync.mjs`, `scripts/logos.py`. Ningún cambio en `src/` ni `tests/`.

## Hallazgos
- **ORA-1 (MEDIA, OBS)** — Decisiones derivadas sin marcar: (a) tope de 20 cuenta `ACTIVE` + `INVITED` no caducadas (REQ-ADM11-001) frente al acta D11-03 «20 delegados activos» y EDGE-011-009 («20 ACTIVE»); (b) «cancelar invitación = INVITED→DISABLED» no figura en ningún artefacto (ni spec, ni STATE-ADM11-001 descrita, ni T1524/T1528); (c) REQ-ADM11-005 en la Dep de T1524. Ninguna aparece rotulada «derivada, para revisión de Neo». Acción: `/architect` rotula (a) y (b) como derivadas en spec REQ-ADM11-001, acta y T1524, y declara (b) en la máquina de estados.
- **ORA-2 (BAJA, OBS)** — Divergencia textual del acta respecto de (a): el acta (fuente de la directiva de Neo) dice «activos»; spec dice «ACTIVE + INVITED vigentes». Alinear o declarar la extensión para evitar que un lector crea que Neo la dictó.
- **ORA-3 (BAJA, OBS)** — El acta sigue con «Hallazgo pendiente T1503 = PENDIENTE»; es verificación de prueba local, no decisión, pero contradice literalmente «ningún punto abierto». Aclarar «verificación, no decisión».

## RECOMMENDED NEXT STEP
`/architect` rotula derivadas (ORA-1/2/3, solo texto en specs/011 y acta); luego Neo revisa y firma `T1501` y el cierre.
