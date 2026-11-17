# Repetición del recorrido manual de aceptación — quickstart §6 (T308)

- Fecha: 2026-11-14. Rama `002-plataforma-v21`. Ejecutan Zee (OWNER, `zee.duena`) y Kid (`kid.cuidador`) en dos contextos Playwright aislados.
- Entorno: API `127.0.0.1:3100` + Vite `127.0.0.1:5173`, SQLite temporal en el scratchpad (no se tocó `data/argos.sqlite`). Apps detenidas al terminar. Para arrancar la API hizo falta `ARGOS_AUDIT_HMAC_SECRET` (64 hex), que el quickstart no menciona.
- Método: todo desde la interfaz con clics y escritura. La API solo se usó para verificar rechazos (PATCH/DELETE del cuidador, login tras borrar), nunca para completar un paso.
- Capturas (no versionadas): `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/515ca0fd-4e96-4cc9-9f37-4bd18c1a2a1a/scratchpad/rep/` (`f1-rechazo.png` … `f7-hogar-transferido.png`).
- Alcance: sin commit, push ni cambios en `src/`, `tests/`, `specs/` ni `tasks.md`.

## Resultado por flujo

| # | Flujo | Resultado | Evidencia |
|---|---|---|---|
| 1 | Registro | PASA | `Abcdefgh1` se queda en `/register` con «La contraseña debe tener entre 10 y 128 caracteres e incluir al menos una mayúscula, un número y un símbolo.». `Abcdefgh1!` crea la cuenta y entra a `/`. |
| 2 | 8 especies y rango de peso | PASA | El formulario ofrece las 8 especies (Perro, Gato, Conejo, Hurón, Ave, Reptil, Pequeño mamífero, Otro), «Es una fecha estimada», «Esterilizado» y «Microchip». Se dieron de alta las 8 desde la UI. RABBIT con fecha estimada, esterilizado Sí y microchip 123456789012345: al reabrir Editar los valores persisten. OTHER muestra «¿Qué especie? *»; sin rellenarlo no guarda, con «Axolote» guarda y persiste. 0.030 kg en el ave: guardado («0.03 kg»). 0.030 kg en el perro: «El peso está fuera del rango de la especie…». |
| 3 | Hogar, rol, invitación, asignación | PASA | Zee crea «Casa Zee» (Administrador, Propietario) e invita a Kid como Cuidador. Kid, en otro contexto, ve «1 invitación pendiente» y acepta. Selector «Rol de Kid» (H-T308-2): Cuidador a Lector a Cuidador desde la UI, `PATCH …/members/{id}` 200 dos veces, y Kid ve «tu rol: Lector» y luego «Cuidador». Zee asigna P-FELINE con la casilla «Casa Zee» de Editar; Kid ve solo P-FELINE (`GET /api/pets` devuelve 1, `myRole: CAREGIVER`). |
| 4 | Cuidador | PASA | Kid registra 4.20 kg (visible en la tabla). La ficha no muestra Editar, Transferir ni Eliminar. Verificación por API: PATCH del nombre 403 `ERR-ACC-FORBIDDEN`, DELETE 403 `ERR-ACC-FORBIDDEN`. |
| 5 | SUPERSEDED | PASA | Dos vacunas «Rabia» (2026-01-10 y 2026-10-10) desde la UI. La nueva queda «Semáforo Verde: Al día · 330 días restantes». La primera pasa a «Registros anteriores (1)» con «Semáforo Gris: Reemplazada por registro posterior» y sin botones de edición. El rechazo 409 por API no se repitió esta vez (mi sonda no encontró el id); sigue respaldado por la corrida anterior (409 `ERR-REC-SUPERSEDED-IMMUTABLE`). |
| 6 | Respaldo con previsualización | PASA | Descarga `argos-backup-2026-11-14.json`. Al elegir el archivo aparece la previsualización: «versión 3.0.0: el archivo trae 8 mascotas. Pesos: 2 … Vacunas: 2 … Se reemplazarán 8 mascotas propias actuales; 8 coinciden por identificador. 1 mascota compartida perderá su asignación en 1 hogar.» Al pulsar «Importar respaldo»: «Importación completada (versión 3.0.0): 8 mascotas y 4 registros.» Kid pasa a ver «No hay mascotas en este contexto.» |
| 7 | Eliminación de cuenta con transferencias | PASA | Con respaldo descargado, frase y contraseña, la UI bloquea: «Eres propietario de un hogar con otros miembros activos. Transfiere la propiedad o elimina el hogar…». Desde la UI: «Transferir propiedad» en la ficha de P-FELINE, selector «Nuevo propietario», «Confirmar transferencia» (`POST /pets/{id}/ownership-transfer` 200, «Propiedad de P-FELINE transferida.»; Kid ve «Dueño: Kid» con Editar, Transferir y Eliminar). En `/households`, «Transferir propiedad» del miembro, «¿Transferir la propiedad del hogar Casa Zee a Kid? Conservarás el rol de Administrador.», «Confirmar transferencia» (`POST /households/{id}/ownership-transfer` 200). Luego, con respaldo, frase y contraseña: `POST /account/deletion` 204, redirige a `/login`, `GET /auth/me` 401, login 401 `ERR-AUTH-INVALID-CREDENTIALS`. Kid conserva P-FELINE con 4.20 kg y es único miembro y propietario de «Casa Zee». |

Totales: 7 PASA, 0 FALLA, 0 NO VERIFICADO.

## Estado de los hallazgos anteriores

- **H-T308-1: cerrado.** Las 8 especies, `speciesOther`, `birthDateIsEstimate`, `neutered` y `microchipId` están en el formulario y persisten.
- **H-T308-2: cerrado.** Hay controles en la interfaz para transferir mascota, transferir hogar y cambiar el rol de un miembro; ninguno se completó por API.
- Cerradas de paso: O-4 (plural: «1 mascota compartida perderá… en 1 hogar») y O-6 («Próximo refuerzo» ya es opcional).

## Observaciones nuevas o vigentes (menores; ninguna bloquea)

- **N-1 (nueva).** Para una mascota OTHER con `speciesOther` «Axolote», el directorio y la ficha muestran solo «Otro». El texto libre solo se ve en Editar. Conviene mostrarlo, o decidir que no se muestre.
- **N-2 (nueva).** «Mis mascotas» de Kid ahora lista la mascota compartida (con «Dueño: Zee»), mientras que en la corrida anterior estaba vacía. Parece intencional (lista accesible); confirmar con Zee.
- **N-3 (nueva).** Tras transferir la mascota, Zee (ya Administradora del hogar) sigue viendo «Editar» pero no «Transferir» ni «Eliminar». Es coherente con su rol, pero revisar que sea lo diseñado.
- **N-4 (nueva).** El selector de rol y «Transferir propiedad» del hogar solo aparecen cuando hay otro miembro activo; con el hogar recién creado no hay ninguno. Esperable.
- **O-1 (vigente).** Al invitar no hay mensaje de éxito ni se lista la invitación pendiente en la pantalla de Zee.
- **O-2 (vigente).** En `/backup` la descarga no muestra confirmación (en `/cuenta` sí: «Respaldo descargado. Ya puedes confirmar la eliminación.»).
- **O-3 (vigente).** El acordeón se llama «Registros anteriores (N)» y no «Reemplazados» como dice el quickstart §6.
- **O-5 (vigente).** La barra de fases (Validando, Previsualizando, Aplicando, Terminada) se ve como lista; la fase intermedia no fue observable.
- **O-8 (vigente).** 401 de `/api/auth/me` en consola en cada carga sin sesión (esperado).
- **Nota de método.** En un primer intento mi script importó sin leer la previsualización porque filtré mal el texto; la repetí capturando la previsualización antes de aplicar. No es un defecto de la app.

## Qué no se cubrió

Rol Lector y Administrador no propietario sobre mascotas, importación de versiones 1.0.0 y 2.0.0, ancho 320 px y alerta geriátrica quedan fuera de §6.
