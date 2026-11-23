---
record_id: DECISIONES-NEO-008-2026-11-20
character: architect
date: 2026-11-20
feature: specs/008-sso-portal-roles
status: APROBADAS POR NEO (Nivel 2, Logos iter 75, 17 puntos); asentadas por /architect en spec/plan/tasks y contratos; sin APPROVED ni LOCKED
---

# Decisiones de Nivel 2 de Neo — Feature 008

Fuente: resolución de Neo en Logos (iter 75), transmitida por Morpheus en la misión de `/architect` del 2026-11-20. Este archivo solo asienta lo ya decidido; no decide nada nuevo.

1. **Alcance (D8-01):** 008 = `#16` (solo SSO Google), `#17` (vinculación), `#21` (biografía en perfil), `#24` (autocompletado por username), `#25` (permisos y aviso), `#53`, `#54`, `#55`. Pasan a la Feature 009: Bloques C (`#18`), D (`#19`), E (`#20`) y `T1200`.
2. **D8-02, D8-03/D8-07 y `REQ-PRM-003` de 005:** diferidos a 009. Sin `PENDING` ni cambio de `STATE-AUTH-SESSION-001` en 008.
3. **D8-04 = C:** correo real y registro con correo verificado pasan a 009; en 008 solo Google SSO.
4. **D8-05 = A:** `jose` 6.2.17 para `src/infrastructure/http/google-oidc-verify.ts`, con enmienda constitucional MINOR 3.7.0 -> 3.8.0 (commit `c8e59e7`).
5. **Cookie `argos_oauth`:** `SameSite=Lax`, `Max-Age` 900 s, aprobada, misma enmienda 3.8.0, acotada a `argos_oauth` (`argos_session` sigue `Strict`).
6. **Contratos:** enmiendas MINOR de 002 y 004 solo con lo necesario para 008 (Google SSO y vinculación, `pets.biography` en perfil y respaldo, autocompletado por username); nada de `/api/admin` ni `PENDING`. 006: MINOR con `Content-Disposition: attachment` en la descarga de escena (`#54`). Commit `86fad83`.
7. **D8-10 = A:** solo prefijo de `username` >= 3 caracteres; `REQ-HOUSE2-001` intacta.
8. **D8-11:** mensaje neutro «No se encontraron usuarios disponibles para invitar.».
9. **D8-12 = A:** biografía solo en perfil y persistencia/respaldo; no entra en payload ni prompt; `INV-ESC6-010/017` intactas.
10. **D8-13 y D8-09 aprobados:** textos de ayuda de rol y aviso de hogar como propuestos; «Generaciones restantes este mes: R. Se renuevan el [fecha].» y «Mi hogar».
11. **D8-14 aprobada:** la cuenta sin correo verificado no reclama el correo; Google verificado libera el correo de la cuenta no verificada.
12. **Recortes de `/mifune`:** M8-01 SÍ (correo a 009), M8-02 SÍ (vincular Google desde sesión activa con la contraseña actual), M8-03 SÍ (sin desvincular desde perfil en 008). M8-07/08/09 diferidos a 009.
13. **Restauraciones:** los respaldos no recrean vínculos de Google ni estados de aprobación; `pets.biography` anulable y retrocompatible.
14. **H-OR-F-2:** corregir; la cuota agotada muestra también la fecha de renovación (`REQ-UX8-001`, bloque F). Resuelto en código por `fb750b6`.

## Lecturas del Architect que Neo puede corregir

- `D8-06` (scope de Google) no fue mencionada: se mantiene la propuesta A (solo `openid email`).
- `D8-08` (rango del tope de fotos) viaja con `#20` a 009.
- «D8-13 y D8-09 aprobados: textos «Generaciones restantes…» y «Mi hogar»»: los textos citados son los de `D8-09`; `D8-13` (frases de rol Cuidador/Lector y aviso de hogar) se leyó como «aprobados tal como están propuestos».
- `M8-04` (no verificar firma), `M8-05` (callback `302`) y `M8-06` no fueron elegidas: se mantiene `ADR-008-03` con callback `200`.
