# Recorrido manual de aceptación — quickstart §6 (T308)

- Fecha: 2026-11-14. Rama `002-plataforma-v21`. Ejecutan: Zee (OWNER, usuario `zee.duena`) y Kid (CAREGIVER, usuario `kid.cuidador`) en dos contextos de navegador aislados (Playwright).
- Entorno: API `127.0.0.1:3100` + Vite `127.0.0.1:5173`, base SQLite vacía y temporal (no se tocó `data/argos.sqlite`). Apps detenidas al terminar.
- Alcance: solo lectura sobre `src/`, `tests/` y `specs/`. Nada de commit, push ni marcas en `tasks.md`.
- Método: lo visible se hizo con clics en la interfaz. Donde la interfaz no ofrece el control, se llamó a la API con `fetch` desde la sesión del navegador (cabecera `X-Argos-Request: 1`) y se anota como «vía API».
- Capturas (carpeta de trabajo, no versionadas): `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/515ca0fd-4e96-4cc9-9f37-4bd18c1a2a1a/scratchpad/` con `f1-rechazo.png`, `f2-ave.png`, `f2-perro-peso.png`, `f3-kid.png`, `f4-cuidador.png`, `f5-vacunas.png`, `f6-preview.png`, `f6-aplicado.png`, `f7-bloqueada.png`, `f7-eliminada.png`.

## Resultado por flujo

| # | Flujo | Resultado | Evidencia |
|---|---|---|---|
| 1 | Registro | PASA | `Abcdefgh1` (sin símbolo): se queda en `/register` con «La contraseña debe tener entre 10 y 128 caracteres e incluir al menos una mayúscula, un número y un símbolo.». `Abcdefgh1!` (10 caracteres): crea la cuenta y entra a `/`. |
| 2 | 8 especies y rango de peso | FALLA parcial (H-T308-1) | Interfaz: el formulario «Nueva mascota» solo ofrece Perro y Gato. Vía API: se crean las 8 (CANINE, FELINE, RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER con `speciesOther`) y el directorio las muestra con etiqueta correcta (Ave, Hurón, Conejo, Reptil, Pequeño mamífero, Otro). Peso 0.030 kg en el ave: guardado y visible («0.03 kg»). 0.030 kg en el perro, desde la interfaz: «El peso está fuera del rango de la especie: perros y gatos de 0.05 a 150.00 kg…» (API: 422 `ERR-REC-WEIGHT-OUT-OF-RANGE`). |
| 3 | Hogar con rol, invitación y asignación | PASA | Zee crea «Casa Zee» (rol Administrador, Propietario) e invita a `kid.cuidador` como Cuidador. Kid, en otro contexto, ve «1 invitación pendiente» y acepta. Zee asigna P-FELINE desde Editar > «Hogares de la mascota». Kid ve en la pestaña «Casa Zee» solo P-FELINE; «Mis mascotas» está vacío; `GET /pets/{otra}` da 404. |
| 4 | Cuidador | PASA | Kid registra 4.20 kg (permitido, se ve en la tabla). La ficha no muestra Editar ni Eliminar. Vía API: PATCH del nombre y DELETE de la mascota dan 403 `ERR-ACC-FORBIDDEN`. |
| 5 | SUPERSEDED | PASA (con observación O-3) | Dos vacunas «Rabia» (2026-01-10 y 2026-10-10): la nueva queda «Verde, Al día · 330 días restantes»; la primera pasa al acordeón «Registros anteriores (1)» con «Reemplazada por registro posterior» y sin botones de edición. Vía API: PATCH al registro reemplazado da 409 `ERR-REC-SUPERSEDED-IMMUTABLE`. |
| 6 | Respaldo con previsualización | PASA (con observaciones O-4, O-5) | Exportar: respuesta 200 con cabecera `x-argos-confirmation-token` y archivo `argos-backup-2026-11-14.json`. Importar: previsualización «versión 3.0.0: 8 mascotas; Pesos 2, Vacunas 1; Se reemplazarán 8 mascotas propias; 8 coinciden» y el aviso «1 mascotas compartidas perderán su asignación en 1 hogares». Tras aplicar: «Importación completada (versión 3.0.0): 8 mascotas y 3 registros»; la asignación del hogar se perdió, como avisó. |
| 7 | Eliminación de cuenta | FALLA parcial (H-T308-2) | La interfaz bloquea con mensaje claro: «Eres propietario de un hogar con otros miembros activos. Transfiere la propiedad o elimina el hogar…». «Eliminar mi cuenta» está deshabilitado hasta descargar el respaldo (paso 1). Pero la interfaz no tiene ningún control para transferir la mascota ni el hogar: se hizo vía API (`POST /pets/{id}/ownership-transfer` y `/households/{id}/ownership-transfer`, ambas 200). Después, con frase, contraseña y token vigente desde la interfaz: sesión cerrada, `/login`, `GET /auth/me` 401 y el login de `zee.duena` da 401 `ERR-AUTH-INVALID-CREDENTIALS`. Kid queda dueño de P-FELINE (4.20 kg conservado) y del hogar. |

Totales: 5 PASA, 2 FALLA parcial (el comportamiento del servidor cumple; falta o es incompleta la interfaz). Ningún flujo quedó NO VERIFICADO.

## Hallazgos

Caso A (defecto de `src/`; no se corrigió):

- **H-T308-1 (alto).** `src/presentation/web/components/PetForm.tsx` (líneas 44-55) solo ofrece Perro y Gato en «Especie», con el comentario «T284 PENDIENTE: las 8 especies de la 002 (y speciesOther) llegan con la pantalla nueva». Tampoco hay campo `speciesOther`, `birthDateIsEstimate`, `neutered` ni `microchipId`. El paso 2 del quickstart («crear una mascota de cada una de las 8 especies») no se puede hacer desde la interfaz. Afecta SC-001 y REQ-PET2-001. T284 figura `[x]` en `tasks.md`.
- **H-T308-2 (alto).** No existe en `src/presentation/` ningún control de transferencia de propiedad de mascota ni de hogar, ni de cambio de rol de un miembro existente (en `HouseholdsPage.tsx` solo hay Crear, Eliminar hogar, Retirar e Invitar). El bloqueo de la eliminación de cuenta dice «Transfiere la propiedad», pero no hay dónde hacerlo. T291 dice «asignación y transferencia». Afecta REQ-OWN-001, REQ-HOUSE2-002 y el paso 7 del quickstart.

Observaciones menores (no bloquean; decide Neo o Zee en producto):

- **O-1.** Al invitar, la pantalla de Zee no mostró ningún mensaje de éxito (el texto quedó igual que antes). Con el mismo cuerpo para usuario existente o no (R3) es comprensible, pero un cuidador real no sabe si se envió.
- **O-2.** Al descargar el respaldo en `/backup` no hay mensaje de confirmación (en `/cuenta` sí: «Respaldo descargado. Ya puedes confirmar la eliminación.»).
- **O-3.** El acordeón se llama «Registros anteriores (N)». El quickstart y la spec (US «Reemplazados») lo nombran «Reemplazados». Revisar si el rótulo del diseño aprobado cambió.
- **O-4.** Plural: «1 mascotas compartidas perderán su asignación en 1 hogares».
- **O-5.** La barra de fases (Validando, Previsualizando, Aplicando, Terminada) se muestra como lista; no se observó la fase intermedia porque la importación terminó en menos de 2 s.
- **O-6.** El formulario de vacuna marca «Próximo refuerzo *» como obligatorio, pero el contrato (`CreateVaccinationInput`) lo declara opcional («nulo = no requiere próxima dosis»). Revisar con Maggie y Sati.
- **O-7.** Durante mi prueba de SUPERSEDED, un `DELETE` vía API sobre el registro reemplazado devolvió 204 y lo eliminó. La spec solo prohíbe editarlo, así que no es un defecto, pero queda anotado porque cambia lo que Zee vería en el historial.
- **O-8.** La consola del navegador registra errores 401 de `/api/auth/me` en cada carga sin sesión (esperado, sin impacto visible).

## Qué no se cubrió

Rol Lector y Administrador no propietario, importación de versiones 1.0.0 y 2.0.0, ancho 320 px y la alerta geriátrica quedan fuera de §6 y no se probaron aquí.
