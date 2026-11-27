# Quickstart: Multidueño, Microchip y Cuidador (Feature 012)

**Estado**: `DRAFT`. Decisiones `D12-*`, `Neo-A..Neo-Q` y `N2-R1..N2-R5` resueltas por Neo (2026-11-26); orden de bloques `D12-ORDEN = A` (A `#22` → B `#23` → C `#26` → D `#32` → E `#81`). Guía de verificación por bloque. **Regla de Neo (no negociable): todo se prueba primero en local, a mano, antes de cualquier test o compuerta de validación.** Los agentes no levantan `npm run dev` ni ejecutan `npm run test:gate`; lo hace Neo (o lo autoriza a `/morpheus`).

## 0. Preparación local (la hace Neo)
1. Rama de la feature `012-multiduenio-microchip-cuidador` (creada desde `origin/main`); sin `git push` desde agentes. En un entorno con varias instancias, **desactivar las rutas de transferencia de 002 antes de aplicar la migración del Bloque A** o usar una ventana de mantenimiento (`NFR-012-010`, `T1626`).
2. `.env` local sin `H-01`; base SQLite local limpia (`DATABASE_PATH` de desarrollo); driver de medios `memory` es suficiente salvo evidencias de disputa (usar `local` si se prueba subida).
3. Puertos: API `127.0.0.1:3100`, Vite `127.0.0.1:5173` (el `3000` suele estar ocupado por Grafana).
4. `npm run dev` (lo levanta Neo). Para dos personas distintas, usar **dos navegadores o un perfil privado** y dos cuentas (A y B).

## 1. Orden de verificación (por bloque)
1. **Prueba local manual** del recorrido del bloque (tablas de abajo). Es la tarea `[LOCAL]` y precede a todo lo demás.
2. Solo después: `npx tsc --noEmit` → `npm run test:gate` → `bash scripts/verify-oracles.sh` → `bash scripts/verify-traceability.sh --feature 012 --task T####` (requiere `T1609`).
3. `/sati` (WCAG 2.2 AA, 320/1024/1280) y `/oracle`; luego `node scripts/gh-project-sync.mjs sync --tasks specs/012-multiduenio-microchip-cuidador/tasks.md` y el comentario breve en el Issue.
4. Durante el TDD, las pruebas rojas se ejecutan con Vitest dirigido por archivo (`npx vitest run <archivo>`), **no** con la compuerta completa.

## 2. Recorridos manuales

### Bloque `#22` — Co-propiedad `[GH:#22]` (SC-012-001..012)
1. Con A: crear mascota «Luna». Con B (otro navegador, sin hogar común): verificar que no la ve.
2. A invita a B por `username` (co-propietario). B ve la invitación `INVITED`, no accede aún (`SC-012-002`); acepta.
3. Ambos editan peso y datos básicos; ambos la ven en «Mis mascotas» (`SC-012-001`).
4. A pulsa «Eliminar mascota»: aparece solicitud pendiente; B la rechaza → nada se elimina (`SC-012-006`). Repetir y aprobar → se elimina.
5. Intentar quitar al otro propietario: no existe la acción (`SC-012-007`). B sale por decisión propia (`SC-012-008`).
5b. Con A principal y B co-propietario `ACTIVE`: A pulsa «Salir» **designando a B como sucesor** (o sin designar); B pasa a principal en el acto y ve el aviso «Ahora eres propietario principal» (`SC-012-071`, `SC-012-094`). Repetir con tres propietarios y sin designar: hereda el de menor `joined_at`. Probar también la eliminación de cuenta de A (sucesión automática sin designación, la mascota no se borra; `SC-012-076`, `SC-012-099`).
5c. Invitar a un `username` inexistente y a uno existente: respuesta idéntica (`SC-012-075`).
5d. Ausencia (con el reloj de pruebas): A crea dos solicitudes críticas que expiran sin voto de B; A abre la disputa por ausencia contra B y queda `UNDER_REVIEW` (`SC-012-091`). Repetir con un rechazo de B en la ventana: no procede. Con la disputa abierta, A no puede eliminar ni transferir (`ERR-CHP12-CHIP-FROZEN`) y B ve el aviso, puede dejar una respuesta de 280 caracteres o salir, lo que cierra el caso sin cooldown (`SC-012-092`). Con el principal ausente, el desenlace es `REQUEST_CHANGE_PRINCIPAL` (`SC-012-093`).
5e. Carrera de salida (prueba automatizada, no manual): `LEAVE` del principal y del co-propietario simultáneos en los tres motores (`SC-012-095`).
6. Con tope alcanzado, invitar a un tercero: error del catálogo (`SC-012-004`).
7. Enlace de veterinario `PET` creado por B que luego sale: abrir → 404 uniforme (`SC-012-011`).
8. Regla H-K1 (`contracts/propuesta-UI-H-K1.md`, `APPROVED`, Opción A): con más de un propietario `ACTIVE`, la ficha de la mascota **no muestra** «Eliminar» ni «Transferir» (a ningún propietario) y sí la línea con enlace: «Con más de un propietario, eliminar o transferir necesita la aprobación de todos. Ir a Propietarios», que lleva al panel «Propietarios» (`REQ-OWN12-004`, `INV-OWN12-004`). Con un solo propietario `ACTIVE` ambos botones aparecen como siempre. Revisar el enlace con teclado y a 320/1024/1280 px. El `409 ERR-OWN12-APPROVAL-PENDING` se mantiene en servidor (defensa en profundidad) y su texto cubre solicitud en curso y rechazo directo (`errata-APPROVAL-PENDING-detail.md`).

### Bloque `#23` — Microchip duplicado `[GH:#23]` (SC-012-013..024)
1. A registra una mascota con chip `982000123456789`. B intenta registrar el mismo chip: mensaje uniforme sin datos de A (`SC-012-013`). A intenta registrar el mismo chip en otra mascota suya: error propio `ERR-PET-MICROCHIP-DUPLICATE` (`SC-012-079`). Marcar fallecida la mascota de A: el chip sigue bloqueado para B.
2. B corrige un dígito (tipeo) y crea la mascota sin rastro (`SC-012-015`).
3. B vuelve a usar el chip de A y pulsa «Solicitar co-propiedad»: queda `PENDING`; B no ve la mascota (`SC-012-016`). A aprueba → B es co-propietario.
4. Repetir con rechazo y reintento antes del enfriamiento (`SC-012-018`).
5. B abre «Alguien se apropió de mi mascota» y adjunta evidencia: disputa `UNDER_REVIEW`; A no puede transferir esa mascota (`SC-012-019`); el caso aparece en la cola de `/admin` solo para `SUPER_ADMIN`/`OPERATOR`; ninguna propiedad cambia sola (`SC-012-020`).
6. Sondear con 11 chips **distintos, libres u ocupados**: tras el décimo intento llega el mismo `429` en ambos casos (`SC-012-021`, `SC-012-078`, `SC-012-100`; cifra de `N2-R4`: 10 por usuario). Revisar el log de la API: sin chip completo (`SC-012-022`).
7. Disputa: B repite la disputa sobre el mismo chip (mismo `202` `RECEIVED`, sin fila duplicada, `V6`) y abre una cuarta simultánea: `ERR-CHP12-DISPUTE-LIMIT` (`SC-012-080`). Un propietario intenta eliminar la mascota en disputa: `ERR-CHP12-CHIP-FROZEN` (`SC-012-081`). Revisar los avisos: sin identidad del otro dueño (`SC-012-090`).
8. Reserva del chip: con la disputa abierta, el dueño actual (único propietario) elimina su cuenta; otra cuenta intenta registrar el chip y recibe el mismo `409` uniforme (`SC-012-096`); tras caducar la congelación el `409` persiste (`SC-012-097`). `/admin` concede una prórroga y rechaza la segunda (`SC-012-098`); tras un rechazo, reabrir antes de 90 días da `ERR-CHP12-DISPUTE-COOLDOWN`. En «mis solicitudes» el solicitante ve solo su fila real (`SC-012-101`).

### Bloque `#26` — Cuidador `[GH:#26]` (SC-012-025..040)
1. Con A (propietario): crear rutina «Amoxicilina 250 mg, 08:00 y 20:00, 7 días» y «Comida 07:00». A invita a C como `CAREGIVER` del hogar de la mascota y le concede `BASIC_LOG`.
2. Con C: abrir «Modo Cuidador»; ver pendientes del día; marcar la toma de 08:00 (`SC-012-029`). Intentar editar la rutina → rechazo (`SC-012-026`).
3. Con A desde otra sesión: intentar registrar la misma toma → conflicto con autor y hora (`SC-012-031`).
4. Cambiar a C a `VIEW_ONLY`: el siguiente intento de registro falla en el servidor (`SC-012-030`, `EDGE-012-015`).
5. Revertir un registro en 10 min; probar fuera de ventana con motivo (`SC-012-033`). Probar teclado y 320 px (`SC-012-035`).
6. Con C en `VIEW_ONLY`: registrar un peso o evento sanitario funciona (`SC-012-030`, `SC-012-077`); registrar una toma no. Crear una rutina `TABLET` con 0,125 (se rechaza), con `UNIT` (se rechaza) y con 500 `MG` (pide confirmación) (`SC-012-088`).

### Bloque `#32` — Ficha QR `[GH:#32]` (SC-012-041..052)
1. En «Mi cuenta» guardar teléfono `+573001234567` y marcar «Mostrar mi teléfono»; en la mascota cargar alergias críticas.
2. Intentar activar la ficha QR con otra mascota sin teléfono visible ni alergias: se rechaza (`D12-14`). Con teléfono visible (opt-in **por esa mascota**) o alergias, activar (aviso y confirmación). El token aparece **una sola vez**: descargar SVG, PNG (generado en el navegador) y hoja A6; escanear el PNG con el celular y contrastar con los fixtures externos (`SC-012-049`): abre `/e/{token}` y muestra solo nombre, alergias y teléfono (`SC-012-042`).
3. Inspeccionar pestaña Red: sin cookies ni IDs; cabeceras `no-store`, `noindex`, `no-referrer` (`SC-012-043`).
4. Regenerar el código: el anterior da el mismo 404 que un token inexistente (`SC-012-044`). Desactivar: 404 inmediato (`SC-012-045`).
5. Vista previa de impresión A6: QR ≥ 30 mm (`SC-012-051`).
6. Con la ficha `ON` y solo un teléfono visible, desmarcar el opt-in (o borrar el teléfono): la ficha pasa sola a `OFF`, el código impreso da 404 y la interfaz avisa (`SC-012-083`). Regenerar desde `OFF` exige consentimiento y entrega token nuevo.
7. Revisar los logs de la API tras escanear: el token no aparece (`SC-012-086`). **Antes de activar el QR en producción** (criterio de release bloqueante, `SC-012-107`): `DEUDA-012-TERRAFORM-LOGS-QR` (exclusión en `terraform/logging.tf`, rama de infraestructura, autorización de Neo). Marcar fallecida una mascota con la ficha `ON`: pasa a `OFF` y el código da 404 (`SC-012-106`).

### Bloque `#81` — Subconjunto `[GH:#81]` (SC-012-053..066)
1. Hogar «Apartamento» con 4 mascotas. **Mascotas → Apartamento → Compartir**: elegir 2 → crear enlace.
2. **Hogares → Apartamento → Compartir**: el selector es idéntico (`SC-012-054`). Elegir «Todas» → enlace `HOUSEHOLD`.
3. Abrir `/shared/{token}` del subconjunto en ventana privada: solo 2 mascotas; en Red no hay IDs ni datos de las otras 2 (`SC-012-056`).
4. Desasignar una de las 2 del hogar: reabrir; queda 1; desasignar la otra: 404 (`SC-012-057`, `SC-012-058`).
5. Abrir enlaces `PET` y `HOUSEHOLD` antiguos: sin cambios (`SC-012-060`). Ficha → Compartir: sin selector (`SC-012-055`).

### Operación inicial de `/admin` para la cola de disputas (`T1637`, resolución `H-02` opción (b), Neo, Nivel 2, 2026-11-27)

La cola de disputas exige que cada administrador que resuelva o confirme tenga `admin_identities.person_id` (identificador opaco de persona física, 8–64 caracteres `[A-Za-z0-9_-]`, único entre administradores; `admin-disputes-annex.md` §7.1). **No existe ruta ni interfaz para asignarlo** (decisión de Neo): la asignación es **manual por SQL** y la hace Neo en local. Sin `person_id` la cola falla cerrada (`403 ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`: nadie puede resolver ni confirmar), lo cual es el comportamiento correcto.

1. **Operación inicial de `SUPER_ADMIN` (raíz).** Poner el correo de Neo en `ARGOS_ADMIN_EMAILS` del `.env` local (no se toca `.env.example` ni `app-config.ts`, `H-01`) y entrar una vez a `/admin` con Google: el correo de `ARGOS_ADMIN_EMAILS` se resuelve como `SUPER_ADMIN` raíz y crea su fila en `admin_identities`. Un segundo administrador (control dual, `OPERATOR` o `SUPER_ADMIN` delegado) se invita desde «Administradores» de `/admin` con la raíz (`inviteAdminDelegate`, 011) y entra una vez con su Google para anclar su fila.
2. **Asignar `person_id` (una vez por persona, SQLite local; el valor es opaco y distinto por persona, nunca el mismo para dos cuentas del mismo humano):**
   ```sql
   -- Ver las filas existentes (admin_id, correo):
   SELECT admin_id, email, person_id FROM admin_identities;
   -- Asignar (reemplazar el correo y el valor opaco; mínimo 8 caracteres):
   UPDATE admin_identities SET person_id = 'persona-neo-01' WHERE email = 'correo-del-administrador@ejemplo.com' AND person_id IS NULL;
   UPDATE admin_identities SET person_id = 'persona-op-01'  WHERE email = 'correo-del-segundo-admin@ejemplo.com' AND person_id IS NULL;
   ```
   El índice único parcial rechaza dos administradores con el mismo `person_id`. Para el control dual de `CHIP_APPROPRIATION` hacen falta **dos personas distintas** con `person_id` y distinto `admin_id`; el segundo administrador no puede ser parte del caso (ni vinculado por correo a una cuenta de usuario implicada).
3. **Comprobar:** `SELECT email, person_id FROM admin_identities WHERE person_id IS NOT NULL;` debe listar a ambos. La prueba de `T1637` abre la cola `/admin` con cada uno (la reautenticación del step-up en local es nominal; la real es `DEUDA-012-ADMIN-STEPUP-PROD`, `claude/deuda-012-admin-stepup-prod.md`).
4. **Producción:** el mismo `UPDATE` sobre PostgreSQL lo ejecuta Neo con acceso a la base; no es una operación de agentes ni de la aplicación. Una ruta o interfaz de asignación para `SUPER_ADMIN` queda **fuera de la 012** y solo se abre si Neo lo decide.

## 3. Bitácora de la prueba local
Cada bloque deja en `claude/` una nota con fecha, cuentas usadas, resultado por paso y capturas opcionales (sin datos personales reales); el hallazgo se registra como `H-*` si falla. **Ninguna** tarea de compuerta de un bloque comienza sin esa nota.
