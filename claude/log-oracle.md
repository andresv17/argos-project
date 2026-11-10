# Bitácora Incremental — The Oracle (`/oracle` — Auditor SDD en Disco)

> **Regla Write-Ahead Log:** Cada vez que `/oracle` inspeccione el disco, compruebe hashes, ejecute compuertas o emita un veredicto (`CONFORME`, `CONFORME CON OBSERVACIONES`, `NO CONFORME`), debe añadir una entrada fechada al final de este archivo antes de responder en el chat.
> **Rol de Portavoz:** `/oracle` es el filtro forense obligatorio antes de pedir cualquier firma de Nivel 2 a **Neo (`Andrés Vallejo`)**.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Últimas Auditorías Consolidadas en Disco:**
  - `.specify/memory/audits/pet-health-tracker-audit-2026-11-05.md` (`LOCKED`).
  - `.specify/memory/audits/spec-review-v2.2.0-auditor-r2.md`.
  - `.specify/memory/audits/checklist-signature-mapping-2026-11-09.md` (mapeo de firmas previas a ítems `CHK###` en `code-review.md` y `oracle-validation.md`).
- **Estado de Checklists de Compuerta:**
  - `specs/001-pet-health-tracker/checklists/code-review.md`: Re-firmado por Arquitecto en formato `CHK001..CHK010`.
  - `specs/001-pet-health-tracker/checklists/oracle-validation.md`: Firmado por **Neo** en `76a31bf` y re-firmado en formato `CHK001..CHK008`.
  - `.specify/memory/audits/spec-review.md`: Re-ubicado en el árbol de trabajo; pendiente de validación final en disco y firma de Nivel 2 de **Neo**.
- **Siguiente Acción para `/oracle`:**
  - Verificar en disco los cambios pendientes de commit en la rama `001-pet-health-tracker` y presentar a **Neo** el veredicto consolidado para cerrar la migración Spec Kit y `TASK-115` (`T016`).

## 2026-11-10 Oracle: auditoria bugs 1/3/4 (Keymaker)
- Veredicto: PASS CON OBSERVACIONES. Solo cambian los 3 archivos de src y 2 pruebas listadas (mas logs/docs de skills). Sin commits nuevos ni stash. playwright.config.ts intacto.
- Compuertas: tsc OK; auth-password.spec 2/2; vitest 581/582 (falla infrastructure-adapters scrypt por timeout, archivo fuera del diff: preexistente/entorno); traceability 96/96 CUMPLE; oracles 0 debiles CUMPLE.
- Observaciones: e2e 28/28 no reproducido por Oracle (config temporal borrada); texto "Agregar" inexistente en src/presentation/web (boton es "Guardar").

## 2026-11-10 Oracle - auditoria filtro "Buscar mascota" (hallazgo 3)
- Alcance: solo PetCards.tsx (etiquetas/placeholder/aria-label) y e2e nueva; filtrado y PetForm sin cambios.
- Compuertas: tsc OK; vitest 581/582 (scrypt preexistente); trazabilidad 96/96; oraculos 0 debiles.
- E2E PENDIENTE: puerto 3000 ocupado (PID 73667) y 5173 (73666); no se ejecuto Playwright.
- Veredicto: PASS CON OBSERVACIONES.

## 2026-11-10 Oracle: auditoria de cambios sin commit (puertos E2E, selectores, 3 regresiones)
- Verificado en disco: defaults 3000/5173 identicos; proxy usa E2E_API_PORT; selector 'Entrar' coincide con AuthPages.tsx:41; 3 pruebas nuevas solo adiciones, con ID en titulo, sin oraculos debiles.
- Compuertas: tsc OK; vitest api+presentation 113/113 (12 archivos); trazabilidad 96/96 CUMPLE; oraculos 68 archivos, 0 debiles. E2E por lectura de codigo (5/5 reportado por Keymaker en 3200/5273).
- Observacion: aparecio tests/e2e/visual/household-counter.spec.ts (sin rastrear, fuera de la lista); referencia data-household-count que aun no existe en src/ (fallaria hasta implementar el contador).
- Veredicto: PASS CON OBSERVACIONES.

## 2026-11-10 — Auditoría T056 + puerto 3100 + contador de hogares (6-B)
- T056: PASS (firma intacta, sin `!` en normalizeToCanonicalUtc; 37 `it` igual que HEAD, títulos iguales, sin `any`).
- Puerto 3100: PASS CON OBSERVACIONES (5173 intacto; .env.example = defaults; specs/.specify/README sin editar por este cambio).
- Contador 6-B: PASS (insignia ámbar igual; e2e con [REQ-HOUSE-001][REQ-UI-006]); e2e verificado solo por lectura.
- Compuertas: tsc 0 errores; vitest 215/215 en 16 archivos; traceability 96/96 CUMPLE; oracles 0 débiles CUMPLE.
- Ajenos sin auditar: package.json/lock (T057), tasks.md (solo T058 + dependencias), tests auth-pet-forms/auth.api/pets-records/presentation api.spec.

## 2026-11-10 Checkpoint Oracle: auditoría T057 (react-router-dom 6.30.6 -> ^7.18.5)
- package.json: diff solo react-router-dom (pin exacto 6.30.6 pasó a rango ^7.18.5). node_modules = 7.18.5.
- package-lock.json: +40/-24; solo react-router, react-router-dom, retira @remix-run/router, añade cookie 1.1.1 y set-cookie-parser 2.7.3 (deps de v7). Sin reinstalación masiva.
- src/: cambios ajenos (backup-migration.ts, app-config.ts, AppShell.tsx) sin referencias a router; no son de T057.
- npm audit --omit=dev: 0 vulnerabilidades. tsc limpio; vitest presentation 49/49; trazabilidad 96/96 CUMPLE. E2E no ejecutado (por lectura; Keymaker reportó 5/5).
- Veredicto: PASS CON OBSERVACIONES (rango ^ rompe la política de pins exactos).
