# Handover Morpheus — 2026-11-14 (cierre de sesión)

## HEAD y rama
- Rama `002-plataforma-v21`, HEAD `ff0fe62`. Commits locales sin push: `7b6e576` (arranque local y asignación a hogar), `d8beed8` (rediseño visual y T283), `ff0fe62` (suite E2E 38/38). **Ahead 0 respecto de origin**: los tres commits ya están en el remoto. Verificado: `git rev-list --count origin/002-plataforma-v21..HEAD` = 0.

## Mapa de progreso
- Rebanada 5: cerrada (T280-T282, commit anterior).
- T283 (Sati, diseño v2.1): marcado [x] por orden de Neo. Discrepancias abiertas: la descripción pide `/cuenta` y Centro de Respaldos (T290 y T292 los cubren), y el blueprint está en la raíz y no en `claude/` ni `.specify/memory/audits/`.
- Rediseño visual según `ui_blueprint.md` v1.1: implementado y auditado (Oracle APTO CONDICIONADO, veredicto en claude/).
- Rebanada 6, frente rojo (T284, T285, T286): pruebas escritas y auditadas por Oracle (APTO CONDICIONADO). **Sin commit.** Archivos: `tests/unit/presentation/rebanada6-*.spec.ts`, `tests/unit/presentation/rebanada6-fixtures.ts`, `tests/e2e/visual/rebanada6-recorridos.spec.ts`, ampliaciones en `wcag.spec.ts`, `web-client.spec.ts` y `e2e-support.ts`.
- Rebanada 6, frente verde (T287 a T293): **no iniciado**. Sin código de las pantallas nuevas.

## Pendientes de decisión de Neo (Logos, sin respuesta; turno neo, estado EN_PROGRESO)
1. Respaldos de spec para el frente rojo: texto y rol del aviso de expiración, forma de la barra de fases, texto de hogar creado, puntos de quiebre de la grilla.
2. Grilla de 3 columnas a 1280 px: confirmar con Sati.
3. Las 12 pruebas antiguas obsoletas (fixtures `canEdit`, contrato 001): reescribir en commit aparte o dejar como deuda B-11.
4. Hallazgo de seguridad: el 422 expone texto interno del validador en `detail` (`error-catalog.json:349-355`). Abrir tarea de corrección en `src/` o dejarlo como deuda.
5. Reorganización estructural del portal: Neo considera que el encargo a Sati no pidió cambios de posición. Pendiente de nuevo encargo explícito.

## Estado de procesos
- Dev servers (`tsx watch` y `vite`) siguen en marcha, lanzados para pruebas de Neo. No se detuvieron al cerrar.

## Próximo paso
Responder en el canal Logos a las decisiones 1-4, y definir el encargo de reorganización (5). No hay despliegues pendientes ni órdenes en curso.

## Uncommitted
- Frente rojo R6 (tests) y bitácoras de agentes. Sin commit por decisión pendiente de Neo.
