# Aviso de consentimiento para la escena del hogar (Feature 006): BORRADOR

> **BORRADOR: texto legal pendiente de revisión de Neo.** Este archivo fija los elementos obligatorios de `REQ-ESC6-026` (los 6 de `C4`) y la clave de versión. No es texto legal final, no está firmado y no habilita el adaptador real. Estado: `DRAFT`. Los datos marcados `[verificar]` no tienen fuente en disco y deben confirmarse con la documentación oficial de Google Cloud antes de que Neo firme (`REQ-ESC6-028`, `research.md` §2).

**Clave de versión**: `noticeVersion = "draft-0.1"` (Neo la reemplaza por `v1` al firmar; cualquier cambio de texto, de proveedor o de región incrementa la versión y exige un nuevo consentimiento, `EDGE-ESC6-018`).
**Proveedor vigente (`providerId`)**: `google-vertex-gemini-image`.
**Alcances de consentimiento (`scope`)**: `HOUSEHOLD_PHOTO` (foto del hogar) y `PET_PHOTOS` (avatares de mascotas de las que eres Propietario Legal).

---

## Texto propuesto para mostrar antes de la primera generación

### Crear la imagen de tu hogar con inteligencia artificial

Para dibujar tu hogar y tus mascotas en pixel art, ARGOS envía imágenes a un servicio de inteligencia artificial de terceros. Antes de continuar, lee esto.

**1. Qué se envía.**
- La foto de tu hogar, si la subiste y consentiste.
- El avatar de cada mascota de la que eres Propietario Legal, si consentiste.
- La imagen de la escena anterior, cuando solo se cambian algunas mascotas.
- Un texto técnico con la especie, la raza y el sexo de cada mascota.
- **No se envían**: nombres de mascotas ni de personas, número de microchip, correo, fechas de nacimiento, datos clínicos, ni los metadatos de las fotos (ubicación GPS, fecha de la cámara). ARGOS elimina esos metadatos en el servidor antes de enviar [limitación `RR-06-10`: el tamaño de la imagen no se reduce].

**2. A quién se envía.**
Google LLC, mediante el servicio Vertex AI (modelo Gemini Image), desde nuestro proyecto de Google Cloud. [verificar: nombre exacto del modelo y entidad contratante.]

**3. Dónde se procesa.**
En la región `us-central1` (Iowa, Estados Unidos). Esto implica una transferencia internacional de tus imágenes. [verificar: que el modelo elegido procese solo en `us-central1` y no en una ubicación multirregional.]

**4. Cuánto tiempo las conserva el proveedor.**
[verificar con fuente: política de retención de entradas y salidas de Vertex AI para el modelo elegido, uso de las imágenes para entrenamiento (mínimo exigible: ninguno), y posible retención de abuso/seguridad.] Hasta confirmarlo, este apartado **no puede firmarse**.

**5. No subas fotos con personas.**
Las fotos del hogar y de las mascotas pueden mostrar personas sin que lo notes. ARGOS no detecta personas. **No subas fotos donde aparezca alguien**, en especial menores. La imagen de tu hogar la verán todos los miembros activos del hogar, incluidas las mascotas de otros dueños que hayan consentido su foto.

**6. Sin respaldo; cómo borrar.**
La foto del hogar y las escenas generadas **no se incluyen en el respaldo** ni se restauran al importarlo. Puedes borrarlas cuando quieras con «Retirar consentimiento y borrar imágenes de la escena»: las imágenes se borran de inmediato de nuestro almacenamiento. Restos técnicos pueden permanecer en copias de seguridad internas hasta su vencimiento (hasta 6 horas en la recuperación a un instante y 14 días en los volcados de la base de datos) [verificar contra `003`: ventana real documentada en `RR-06-07`]. La copia que tenga el proveedor se rige por el punto 4.

### Tu consentimiento

- [ ] Entiendo y consiento el envío de la foto de mi hogar y de los avatares de mis mascotas a Google Vertex AI para generar la imagen.

Botones: **«Consentir y continuar»** · **«Ahora no»** (la aplicación sigue funcionando sin la escena).

Puedes retirar el consentimiento en cualquier momento desde la pantalla de la escena. Al retirarlo, se borran las imágenes derivadas de tus datos y el botón «Actualizar imagen del hogar» queda deshabilitado para ti hasta que consientas de nuevo.

---

## Notas para Neo (no forman parte del texto al usuario)

1. Los puntos 1, 5 y 6 salen del diseño ya firmado (`D6-16`, `D6-17`, `D6-13`). Los puntos 3 y 4 dependen de la documentación del proveedor (`research.md`), sin red hoy.
2. `D6-16` = A: la mascota de un dueño que no consintió aparece sin foto (genérica); el aviso lo dice en el punto 5 solo de forma implícita. Valorar si añadir una frase explícita.
3. Falta decidir el idioma legal (¿es `es-CO`?), la base legal aplicable (consentimiento expreso) y el responsable del tratamiento, que no están definidos en el repositorio.
4. Trazas: `REQ-ESC6-023`, `REQ-ESC6-024`, `REQ-ESC6-025`, `REQ-ESC6-026`, `SC-ESC6-033`, `SC-ESC6-036`, `SC-ESC6-040`, `RR-06-07`, `RR-06-08`, `RR-06-09`, `RR-06-10`.
