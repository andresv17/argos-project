# Despliegue rolling del Bloque A (012) — procedimiento

- **Estado:** `DRAFT` — pendiente de aprobación de Neo (Level 2). No se ejecuta ningún despliegue con este documento hasta su aprobación.
- **Tarea:** `T1626` (`lock R-08`, `NFR-012-010`, `SC-012-105`, `EDGE-012-062`).
- **Ejecutor previsto:** `/link`, con autorización de Neo.
- **Alcance:** procedimiento de despliegue de la migración del Bloque A (`0034` SQLite / `0030` PostgreSQL, tabla `audit_log` y `owner_requests`, `pet_co_owners`, `pets.ownership_version`). La 012 no despliega, no modifica `terraform/`, `.github/workflows/` ni los archivos de H-01.
- **Fuera de alcance:** cualquier cambio en `src/` o `scripts/`. Las acciones que requieren código se listan como dependencias a Keymaker, no se implementan aquí.

## 1. Criterio normativo

| Fuente | Texto resumido |
|---|---|
| `NFR-012-010` (spec.md:415) | Antes de aplicar la migración del Bloque A se desactivan las rutas de transferencia de 002 (`REQ-OWN-001`) o se programa una ventana de mantenimiento. Una instancia de la versión anterior no debe escribir `owner_requests`, `pet_co_owners` ni cambiar `pets.owner_user_id` sin `ownership_version`. |
| `SC-012-105` (spec.md:320) | Dado un despliegue rolling, cuando coexisten instancias de la versión anterior, entonces las rutas de transferencia están desactivadas (o hay ventana) antes de la migración y ninguna instancia anterior escribe `owner_requests` ni cambia `owner_user_id` sin `ownership_version`. |
| `EDGE-012-062` (spec.md:396) | Instancia anterior activa durante el despliegue que recibe una transferencia por las rutas de 002: las rutas están desactivadas antes de la migración (o hay ventana) y la instancia antigua no escribe `owner_requests` ni cambia `owner_user_id`. |
| `plan.md` §59 (riesgo 12) | Mitigación: desactivar las rutas de transferencia antes de la migración o programar ventana; verificar ausencia de escrituras antiguas. |
| `quickstart.md` línea 6 | Prerrequisito de entorno: desactivar rutas de transferencia de 002 antes de la migración del Bloque A, o usar ventana. |
| `co-ownership-rbac-annex.md` línea 76 | Antes de aplicar la migración, desactivar las rutas de transferencia de 002 o abrir ventana (`R-08`, `NFR-012-010`). |

## 2. Superficie afectada (solo lectura, verificada)

- Ruta de transferencia de 002: `POST /api/pets/:petId/ownership-transfer` (`src/infrastructure/http/routes/ownership.routes.ts:17`, caso de uso `transferPetOwnership`). Es la ruta que escribe `pets.owner_user_id`.
- Migraciones del Bloque A: `src/infrastructure/persistence/sqlite/migrations/0034_co_ownership_audit.sql` y `src/infrastructure/persistence/postgres/migrations/0030_co_ownership_audit.sql`. Son esquema de Nivel 2 pendientes de firma de Neo (B-1 del acta `oracle-012-dominio-2026-11-26.md`).
- Orden de despliegue actual (`.github/workflows/deploy-argos.yml`, solo lectura): el job `migrate` (`scripts/migrate-postgres.ts`, contra Neon) corre antes que `deploy` (`needs: migrate`).

## 3. Hallazgo sobre el orden actual

El pipeline aplica la migración en el job `migrate` antes de desplegar la nueva revisión. Mientras Cloud Run hace el rollout, la revisión anterior sigue recibiendo tráfico. Por tanto, el orden actual **no cumple** `NFR-012-010` por defecto. Hace falta una de estas dos medidas, a decidir por Neo:

- **Opción A (preferida):** desactivar las rutas de transferencia de 002 en la revisión anterior antes de `migrate`, y que la nueva revisión no las reactive hasta que la migración termine.
- **Opción B:** ventana de mantenimiento. Se detiene el tráfico de escritura (o se fija el servicio a cero instancias de escritura) durante migración y rollout.

Ninguna de las dos está implementada hoy. Se requieren cambios de workflow o de código, que quedan fuera de esta tarea y son dependencias de Neo y Keymaker. Según `CLAUDE.md` §1, el workflow y `terraform/` son Nivel 2 o H-01, y este documento no los modifica.

## 4. Procedimiento propuesto (orden obligatorio)

**Paso 0 — Autorización.** Neo aprueba este documento (cambia el estado a `APPROVED` él mismo) y elige opción A o B. Sin esto no se avanza.

**Paso 1 — Congelar transferencias de 002.**
- Opción A: desplegar o fijar una revisión en la que `POST /api/pets/:petId/ownership-transfer` devuelva un error controlado (sin escribir). Mecanismo a definir por Keymaker (no existe en el código verificado para esta tarea).
- Opción B: anunciar la ventana, detener escrituras de usuarios y registrar hora de inicio.
- Registrar la hora de corte (`T_corte`) en el registro de despliegue.

**Paso 2 — Verificar que ninguna instancia anterior escribe.** Comprobaciones de solo lectura sobre las revisiones activas (`gcloud run revisions list` y tráfico por revisión; comando exacto a confirmar por /link):
1. Solo hay tráfico en revisiones que no tienen la ruta de transferencia activa.
2. En los registros de Cloud Logging de la ruta de transferencia desde `T_corte` no hay peticiones `2xx` (filtro a confirmar).
3. Tras `T_corte`, no hay filas nuevas en `owner_requests` atribuibles a la revisión anterior (consulta de solo lectura).

**Paso 3 — Aplicar la migración** (job `migrate`) solo si los puntos 1 a 3 del paso 2 se cumplen.

**Paso 4 — Desplegar la nueva revisión** y reactivar las rutas de 002 solo si la 012 lo permite. Con la 012 desplegada, las transferencias de 002 se resuelven según la spec de 012 (`ownership_version`), no por la vía antigua.

**Paso 5 — Verificación posterior.**
- Ninguna escritura de la revisión anterior en `owner_requests` ni `pet_co_owners` después de `T_corte`.
- Ningún cambio de `pets.owner_user_id` sin incremento de `pets.ownership_version` posterior a `T_corte`.
- Consulta de solo lectura: ``SELECT count(*) FROM pets WHERE owner_user_id IS DISTINCT FROM <valor esperado>`` según el registro previo (a confirmar).

**Paso 6 — Registro.** Anotar en `claude/log-link.md` y `claude/registro-proceso-argos.md`: hora de corte, revisiones implicadas, resultado de cada verificación y decisión de Neo. `T1626` se queda en `[ ]` hasta que Neo la marque (§5 de `CLAUDE.md`).

## 5. Rollback

- Si la migración falla: no se despliega la nueva revisión; la revisión anterior sigue con las rutas desactivadas (opción A) o la ventana se cierra (opción B). Revertir la migración la decide Neo.
- Si aparece una escritura de la revisión anterior tras `T_corte`: detener tráfico a esa revisión y escalar a `/link` y `/oracle` (`TO: Neo (Andrés Vallejo — Level 2)`).

## 6. Riesgos residuales

- Sin una medida de opción A o B implementada, el orden actual del pipeline deja abierta la ventana de escritura antigua durante el rollout.
- Los comandos de Cloud Run y la consulta de logs están sin verificar en esta tarea. /link los confirma en solo lectura antes de ejecutar nada.
- La migración de Nivel 2 (`0034/0030`) sigue sin firma de Neo (B-1). Este procedimiento no la sustituye.

## 7. Aprobación

- [ ] Neo aprueba el procedimiento y elige opción A o B. Fecha: ____ Firma: ____ (pendiente)
