# Textos legales fuente — Feature 010 (`T1412`, `[GH:#67]`)

**Estado**: `DRAFT` (borrador del Architect; T1412 cerrado en texto con las decisiones de Neo 1..4 de 2026-11-24, el aviso de IA no cambia). Ningún agente lo pasa a `APPROVED` ni `LOCKED` (potestad de Neo, Nivel 2).
**Fecha**: 2026-11-24. **Sigue `DRAFT` hasta el dictamen de `/rama` (validación de privacidad/protección de datos), que se incorporará después; no se publica ni se pasa a `APPROVED` antes de la validación legal externa (D10-05).**
**Redactado por**: `/architect`, 2026-11-24. Decisiones aplicadas: `D10-05`, `D10-06`, `D10-07` (`APPROVED` 2026-11-24).
**Trazas**: REQ-LEG10-002, REQ-LEG10-005, REQ-MEN10-001; SC-010-010.

> **Constancia obligatoria (D10-05)**: este texto **no es asesoría legal** y **requiere validación legal externa antes de publicarse**. Ninguna frase debe leerse como declaración de conformidad con ley alguna. Todo lo que dependa de una norma, de una jurisdicción o de las condiciones de un proveedor está marcado **«pendiente de validación legal»** y no se afirma.

## 0. Uso de este documento (para `T1413`, no se publica)

- **Versión del texto 18+ (`adult_notice_version`, `H-ARCH-ADULT-VERSION`, 2026-11-25)**: SemVer `N.N.N`. Valor vigente mientras este documento sea `DRAFT`: **`0.1.0`** (constante única del servidor para `T1424`; el cliente no la envía). Reglas: patch = redacción sin cambio de efecto; minor = cambio de efecto o de datos de la cláusula 18+; major = cambio de edad mínima. Pasa a `1.0.0` solo cuando Neo apruebe la publicación tras la validación legal externa (potestad Nivel 2); `T1425` enmienda los textos sin cambiar el valor hasta esa aprobación. **Confirmado por Neo (2026-11-25): `0.1.0` se mantiene para `DRAFT`; `1.0.0` solo tras la validación legal externa (`T1437`).**

- Cada bloque `PRIVACIDAD` y `TÉRMINOS` de abajo es el contenido de `PrivacyPolicyPage.tsx` y `TermsPage.tsx`. Un `##` equivale a un `h2`; cada página lleva un solo `h1`.
- **Placeholders literales (D10-06)**, no se rellenan hasta que Neo entregue los valores definitivos en `T1437`. Deben aparecer **tal cual**, con corchetes y mayúsculas:
  1. `[NOMBRE DEL RESPONSABLE O PROYECTO]`
  2. `[CORREO DE CONTACTO / PRIVACIDAD]` (valor previsto: `contacto@tipi.pet` con Email Routing; **no** se escribe en el texto hasta `T1437`)
  3. `[PAÍS / JURISDICCIÓN]`
  4. `[FECHA DE ÚLTIMA ACTUALIZACIÓN]`
- Los marcadores `(pendiente de validación legal)` dentro del texto se publican **visibles** hasta que Neo los retire tras la validación externa.
- **`T1425` (2026-11-25)**: las cláusulas 18+ (Privacidad §3 y §11, Términos §3) ya no están condicionadas: la casilla «Soy mayor de edad (18+)», `adult_declared_at` y `adult_notice_version` existen desde `T1424`. Texto con versión `0.1.0` (`DRAFT`); procedimiento ante cuenta de menor = contacto `[CORREO DE CONTACTO / PRIVACIDAD]` (valor previsto `contacto@tipi.pet`, sin escribirlo hasta `T1437`) y eliminación desde `/cuenta`, sin acción de administración. Pendientes de `/rama` en `T1426`: suficiencia de la declaración sin verificación de edad, plazo de respuesta y supresión, conservación de la declaración, edad mínima por jurisdicción.
- Sin cifras de cuota ni de coste en el texto legal (instrucción de Neo). Tampoco se publican plazos de retención de proveedores ni cifras de copias internas (decisión de Neo 3): las copias internas se describen como «respaldos internos temporales con retención acotada que se purgan automáticamente», y la retención del proveedor se remite a sus condiciones.

---

## PRIVACIDAD (`/privacidad`)

# Política de privacidad de Tipi

Última actualización: [FECHA DE ÚLTIMA ACTUALIZACIÓN]

Este texto está pendiente de validación legal externa y puede cambiar antes de su versión definitiva.

## 1. Quién es el responsable

El responsable del tratamiento de tus datos es [NOMBRE DEL RESPONSABLE O PROYECTO]. Para cualquier consulta sobre privacidad, escribe a [CORREO DE CONTACTO / PRIVACIDAD]. Esta política se rige por la jurisdicción de [PAÍS / JURISDICCIÓN] (pendiente de validación legal).

## 2. Qué es Tipi

Tipi es una herramienta de registro personal para llevar la salud y los datos biométricos de tus mascotas: fichas, registros clínicos, archivos, fotos y, de forma opcional, una escena del hogar en pixel art generada con inteligencia artificial. Es informativa y no sustituye la consulta, el diagnóstico ni el tratamiento de un veterinario.

## 3. Qué datos tratamos

- **Cuenta**: nombre de usuario, contraseña (guardada solo de forma protegida, nunca en claro), nombre para mostrar, correo si lo indicas, idioma y zona horaria. Si te registras con Google, usamos tu identificador de cuenta de Google (no tu contraseña de Google) y el correo verificado para crear tu cuenta.
- **Mascotas y hogar**: fichas, registros de salud, archivos y fotos que subes tú, y la composición de tu hogar y de sus miembros.
- **Registros técnicos y de auditoría**: un registro de acciones de la cuenta (por ejemplo, la eliminación), identificado con un seudónimo y no con tus datos directos; un registro de las acciones de la administración del servicio, sin correo ni identificador de Google; y los intentos de generación de escena, con el modelo, la región y la cuenta que los inició. Plazo de conservación: pendiente de validación legal.
- **Declaración de mayoría de edad**: la fecha en que declaraste ser mayor de edad y la versión del texto vigente en ese momento. No pedimos fecha de nacimiento ni documento de identidad. La conservamos mientras exista tu cuenta y se elimina junto con ella; no se incluye en el respaldo que descargas. (Pendiente de validación legal.)
- **Técnicos**: cookies de sesión y de inicio de sesión (ver sección 8) y datos mínimos de funcionamiento y seguridad del servicio, como la dirección IP para limitar abusos (el periodo de conservación de estos registros: pendiente de validación legal).

## 4. Para qué los usamos

Para crear y mantener tu cuenta, mostrarte tus mascotas y registros, permitir compartir información cuando tú lo decides y mantener el servicio seguro. No vendemos tus datos, no hacemos publicidad ni usamos analítica de terceros.

## 5. Cuentas en revisión

Toda cuenta nueva queda en estado «pendiente» hasta que una persona administradora la aprueba. Mientras está pendiente no se abre sesión. Si se rechaza, la cuenta no obtiene acceso. Esta revisión la hace una persona administradora sobre los datos de la solicitud (nombre de usuario, fecha y método de registro).

## 6. Inteligencia artificial: la escena del hogar (opcional)

La generación de la escena es opcional y **solo funciona con tu consentimiento explícito**, que se pide antes de la primera generación y cada vez que cambia el texto del aviso o el proveedor. Puedes retirarlo en cualquier momento; al retirarlo se borran de inmediato las imágenes de la escena de nuestro almacenamiento.

Tipi puede usar **dos proveedores** de Google, y solo se usa uno por generación, el que tenga activo la administración del servicio:

- **Google Cloud Vertex AI** (modelo de imágenes Gemini), operado por Tipi desde su proyecto de Google Cloud.
- **Gemini Developer API** (API de desarrollador de Google, modelo de imágenes Gemini), operada por Tipi con la clave operativa del servicio, que Tipi gestiona en un gestor de secretos en la nube. Es una clave de Tipi: **no necesitas aportar ninguna clave propia** y nunca se te pide una.

Cada proveedor tiene su propio aviso y su propio consentimiento. Si cambia el proveedor o el texto del aviso, se te pide consentir de nuevo antes de volver a generar.

**Qué se envía al proveedor activo, y cuándo:** al generar o regenerar la escena, Tipi envía:

1. la foto de tu hogar, si la subiste y consentiste, **solo cuando la escena se genera desde cero** (primera generación, cambio de la foto del hogar o regeneración completa); en los cambios parciales (incrementales) no se vuelve a enviar;
2. la foto de cada mascota de la que eres Propietario Legal, si consentiste y cuando la escena incluye o conserva a la mascota;
3. la imagen de la escena anterior, cuando solo se cambian algunas mascotas;
4. un texto técnico con las instrucciones y la especie, la raza y el sexo de cada mascota; cuando la especie es «otra», también el nombre de especie que escribiste;
5. **la biografía de cada mascota** (el texto libre de su ficha, depurado de caracteres especiales y limitado a 280 caracteres), tanto de las mascotas con foto como de las que no la tienen. Solo se envía si la persona propietaria de la mascota ha dado su consentimiento para las fotos de sus mascotas; si no lo ha dado, la biografía no sale. Esta condición aplica también a las mascotas sin foto. Lo que escribas en la biografía viaja al proveedor: no escribas ahí datos que no quieras compartir.

**Qué no se envía**: nombres de mascotas ni de personas, número de microchip, correo, fechas de nacimiento ni datos clínicos de la ficha. Antes de enviar una foto, Tipi elimina sus metadatos (por ejemplo, la ubicación GPS), pero el contenido visual de la imagen llega tal cual al proveedor. La biografía se guarda en la ficha de la mascota, pero no se copia en los registros de escena ni en los intentos de escena: viaja de forma transitoria en la petición.

**No subas fotos con personas**: Tipi no detecta personas, y las fotos pueden mostrar a alguien sin que lo notes, en especial menores. La imagen del hogar la ven todos los miembros activos del hogar.

**Dónde se procesa y cuánto se conserva**: depende del proveedor y de su configuración. Con Vertex AI, la región depende del modelo activo: con gemini-2.5-flash-image, la región us-central1 (Iowa, EE. UU.); con gemini-3.1-flash-image, la región «global», en la que el procesamiento no queda fijado a una región ni a un país. En ambos casos supone una transferencia internacional de tus imágenes. Con Gemini Developer API, la región de procesamiento y el régimen de datos de ese proveedor están pendientes de confirmación y de validación legal; Tipi no afirma aquí una región. La retención por parte de Google, el uso de tus imágenes para entrenar modelos y las condiciones según el tipo de cuenta del proveedor se rigen por las condiciones de Google y están **pendientes de validación legal**; Tipi no controla la copia que recibe el proveedor.

**Sin respaldo**: la foto del hogar y las escenas generadas no se incluyen en el respaldo de la cuenta ni se restauran al importarlo. Tampoco se incluyen las imágenes de las mascotas ni los archivos clínicos; el respaldo solo lleva, si la escribiste en la ficha, la dirección (URL) del avatar de cada mascota, no la imagen.

## 7. Enlaces compartidos

Puedes generar un enlace público de solo lectura (`/shared/:token`) para enseñar un resumen clínico a un veterinario o a otra persona. Quien tenga el enlace puede verlo sin iniciar sesión. Compártelo solo con quien quieras. Un enlace caduca a los 1, 7 o 30 días que elijas, y quien lo creó puede revocarlo en cualquier momento. El número de microchip y los archivos clínicos solo se incluyen si marcas esas casillas al crear el enlace. (Verificar contra la interfaz vigente que la revocación está expuesta antes de publicar; tratamiento legal del contenido del resumen: pendiente de validación legal.)

## 8. Cookies

Usamos solo cookies técnicas estrictamente necesarias:

- `argos_session`: mantiene tu sesión abierta.
- `argos_oauth`: acompaña el flujo de inicio de sesión con Google.
- `argos_admin_session`: mantiene la sesión de la administración del servicio. Solo la usa la administración.
- `argos_admin_oauth`: acompaña el inicio de sesión de la administración con Google (de un solo uso). Solo la usa la administración.

No usamos cookies de publicidad ni de analítica de terceros (ni Google Analytics, ni Meta Pixel, ni similares).

## 9. Con quién compartimos datos

- Con el proveedor de inteligencia artificial activo, solo lo descrito en la sección 6 y solo con tu consentimiento.
- Con el proveedor de infraestructura en la nube en el que funciona Tipi (almacenamiento y base de datos) y con Google para el inicio de sesión con Google. Los nombres, las ubicaciones y los contratos de tratamiento de estos encargados: pendiente de validación legal.
- No vendemos ni cedemos tus datos con fines comerciales. No procesamos pagos ni suscripciones y no enviamos correos de marketing ni boletines.

## 10. Tus derechos y cómo eliminar tus datos

- Puedes ver y corregir tus datos y los de tus mascotas desde la aplicación.
- Puedes **eliminar tu cuenta y tus datos** desde la sección «Cuenta» (`/cuenta`, zona de peligro). Si tu cuenta usa contraseña, debes confirmar con tu contraseña, escribir la frase de confirmación y haber descargado antes el respaldo de la cuenta. Si tu cuenta se creó con Google (sin contraseña), confirmas de nuevo con Google y escribes la frase de confirmación; descargar el respaldo es opcional. La eliminación borra tu cuenta, tus mascotas con sus registros, tus archivos, fotos y avatares y tus sesiones. Si eres propietario de un hogar y su único miembro activo, el hogar se elimina con la cuenta. La eliminación se bloquea mientras seas propietario de un hogar con otros miembros activos o tengas mascotas asignadas a un hogar con otros miembros activos: antes debes transferirlas o desasignarlas.
- Restos técnicos pueden permanecer en respaldos internos temporales con retención acotada que se purgan automáticamente (plazos concretos: pendiente de validación legal; no se publican cifras).
- También puedes pedir la eliminación o consultar tus datos escribiendo a [CORREO DE CONTACTO / PRIVACIDAD].
- Los derechos concretos que te asisten, y los plazos de respuesta, dependen de [PAÍS / JURISDICCIÓN] (pendiente de validación legal).

## 11. Mayoría de edad y supresión de cuentas de menores

Tipi está dirigido a personas **mayores de 18 años**.

Para registrarte, con usuario y contraseña o con Google, debes marcar la casilla «Soy mayor de edad (18+)». El servidor rechaza el registro si no la marcas, y guarda con tu cuenta la fecha de la declaración y la versión del texto. No pedimos ni verificamos fecha de nacimiento ni documento, de modo que la declaración se basa en tu palabra (pendiente de validación legal si es suficiente en [PAÍS / JURISDICCIÓN]). Las cuentas creadas antes de que existiera esta casilla siguen funcionando y no se les exige una declaración retroactiva.

Si crees que una cuenta pertenece a una persona menor de 18 años, escribe a [CORREO DE CONTACTO / PRIVACIDAD] indicando la cuenta (nombre de usuario). El responsable del servicio revisará la solicitud y, si se confirma, procederá a la supresión de la cuenta y sus datos. Para revisar la solicitud no pediremos documentos de identidad de la persona menor ni de nadie más: usaremos solo los datos de la cuenta y de tu mensaje, que conservaremos únicamente el tiempo necesario para atenderla. Además, la propia persona titular puede eliminar su cuenta directamente desde `/cuenta` (sección 10). Plazo de respuesta y supresión: pendiente de validación legal. (Nota, no se publica; decisión de Neo 2: el canal es el contacto; no hay botón ni acción de administración para esto, y no se promete aviso por correo.)

## 12. Cambios en esta política

Si cambiamos esta política, actualizaremos la fecha indicada al principio. Si el cambio afecta a la inteligencia artificial, se te pedirá un nuevo consentimiento antes de volver a generar.

## 13. Contacto

[NOMBRE DEL RESPONSABLE O PROYECTO] — [CORREO DE CONTACTO / PRIVACIDAD].

---

## TÉRMINOS (`/terminos`)

# Términos de uso de Tipi

Última actualización: [FECHA DE ÚLTIMA ACTUALIZACIÓN]

Este texto está pendiente de validación legal externa y puede cambiar antes de su versión definitiva.

## 1. Quién ofrece el servicio

Tipi lo ofrece [NOMBRE DEL RESPONSABLE O PROYECTO]. Contacto: [CORREO DE CONTACTO / PRIVACIDAD]. Estos términos se rigen por la jurisdicción de [PAÍS / JURISDICCIÓN] (pendiente de validación legal).

## 2. Qué es y qué no es Tipi

Tipi es una herramienta informativa y de registro personal para mascotas. **No sustituye** la consulta, el diagnóstico ni el tratamiento de un veterinario profesional. Las alertas, curvas y cálculos son orientativos. Ante cualquier duda sobre la salud de tu mascota, consulta a un veterinario.

## 3. Mayoría de edad (18+)

Para usar Tipi debes ser **mayor de 18 años**.

Debes declararlo al registrarte, con usuario y contraseña o con Google: al marcar «Soy mayor de edad (18+)» declaras que eres mayor de edad. Si esta declaración no es cierta, podemos suprimir la cuenta y sus datos, como se explica en la política de privacidad. Si crees que una cuenta pertenece a una persona menor de 18 años, escribe a [CORREO DE CONTACTO / PRIVACIDAD]; la persona titular también puede eliminar su cuenta desde `/cuenta`, con las condiciones descritas en la sección 10 de la política de privacidad. (Edad mínima y efectos de la declaración en [PAÍS / JURISDICCIÓN]: pendiente de validación legal.)

## 4. Tu cuenta

- Eres responsable de la actividad de tu cuenta y de custodiar tu contraseña.
- Toda cuenta nueva queda **pendiente** hasta que la persona administradora la aprueba; podemos aprobar o rechazar solicitudes y no garantizamos que se apruebe una cuenta.
- Puedes eliminar tu cuenta cuando quieras desde `/cuenta`, con las condiciones de la política de privacidad.
- Podemos suspender o eliminar cuentas que incumplan estos términos o pongan en riesgo el servicio.

## 5. Contenido que subes

Eres responsable de los datos, fotos y archivos que subes. Sube solo contenido que tengas derecho a usar. No subas fotos en las que aparezcan otras personas, en especial menores. Nos otorgas únicamente el permiso necesario para almacenar y mostrar tu contenido dentro del servicio. Alcance y redacción de esta licencia: pendiente de validación legal.

## 6. Hogares compartidos

Si compartes un hogar, los demás miembros pueden ver lo que su rol permite, incluida la imagen del hogar. Eres responsable de a quién invitas.

## 7. Escena con inteligencia artificial

Es opcional y requiere tu consentimiento explícito, descrito en la política de privacidad (proveedores, datos enviados y cuándo). Los dos proveedores (Vertex AI y Gemini Developer API) los opera Tipi con sus propias credenciales; no necesitas aportar una clave. La imagen generada es una representación artística y puede contener errores o no parecerse a tu mascota. La disponibilidad de la función depende de la configuración del servicio y puede cambiar o suspenderse. Titularidad y uso de la imagen generada: pendiente de validación legal.

## 8. Enlaces compartidos

Si generas un enlace público, cualquier persona que lo tenga puede ver su contenido. Eres responsable de decidir con quién lo compartes.

## 9. Uso aceptable

No uses Tipi para actividad ilícita, para intentar acceder a cuentas ajenas, para sobrecargar el servicio ni para eludir sus límites o controles de seguridad.

## 10. Pagos

Tipi no procesa pagos ni suscripciones.

## 11. Disponibilidad y responsabilidad

El servicio se ofrece «tal cual», sin garantía de disponibilidad continua. Haz respaldos de tus datos con la función de exportación de la cuenta (las fotos y archivos no van en el respaldo; de cada mascota solo viaja la dirección del avatar si la escribiste, no la imagen). Límites de responsabilidad y garantías aplicables en [PAÍS / JURISDICCIÓN]: pendiente de validación legal.

## 12. Cambios y terminación

Podemos actualizar estos términos; la fecha de arriba indica la última versión. Puedes dejar de usar Tipi y eliminar tu cuenta en cualquier momento.

## 13. Ley aplicable y contacto

Ley y foro aplicables: [PAÍS / JURISDICCIÓN] (pendiente de validación legal). Contacto: [CORREO DE CONTACTO / PRIVACIDAD].

---

## Verificación de afirmaciones contra disco (para `T1414` /rama)

| Afirmación | Fuente |
|---|---|
| Cuentas `PENDING`, sin sesión hasta aprobar; rechazo sin acceso | spec 009: REQ-APR9-002, EDGE-009-005 |
| No hay correo de notificación ni de marketing en el sistema | spec 009: REQ-APR9-006 (DIFERIDO, sin `EmailSenderPort`); inbox #67 punto 7 |
| Eliminación desde `/cuenta`: confirmación literal, contraseña, token de respaldo, cascada, bloqueos, medios borrados | spec 002: REQ-ACC-002, REQ-UI2-004, Enmienda 004 E-07 |
| Clave de Gemini API operativa de Tipi (Secret Manager); sin uso local ni clave propia | decisión de Neo 1 (2026-11-24); spec 009: D9-30; Enmienda 009-C |
| Menores: canal de contacto y eliminación directa; sin REQ ni acción de administración en 010 | decisión de Neo 2 (2026-11-24); spec 009: REQ-APR9-006 diferido |
| Dos proveedores (Vertex y Gemini Developer API), consentimiento y `noticeVersion` propios por proveedor, reconsentimiento al cambiar | spec 009: D9-30; spec 006: REQ-ESC6-026, EDGE-ESC6-018; constitución 3.11.0 (Enmienda 009-C) |
| Datos que viajan (fotos, escena previa, especie/raza/sexo, biografía de 280 caracteres saneada, EXIF eliminado) y los que no | `scene-notice.ts` (aviso v3); spec 006: INV-ESC6-010, INV-ESC6-017, REQ-ESC6-027; spec 009: REQ-PRO9-006 (enmendado, ver nota 006 2026-11-24) |
| Biografía con consentimiento `PET_PHOTOS` (también mascotas sin foto); no se copia en los registros de escena | spec 006 nota 2026-11-24 (C-1, C-2) |
| Región fija o `global` sin residencia fija en Vertex | spec 009: D9-27 (4)(5); `scene-notice.ts` variante `3-global` |
| Sin respaldo de foto del hogar ni escenas | spec 006: REQ-ESC6-022; `scene-notice.ts` sección 6 |
| Cookies `argos_session` y `argos_oauth`; sin analítica ni publicidad | spec 010: tabla de realidad `#67`; inbox #67 punto 6 |
| Declaración 18+, `adult_declared_at`, `adult_notice_version`, sin fecha de nacimiento, cuentas anteriores intactas | spec 010: D10-05, REQ-MEN10-001, REQ-MEN10-002; data-model |
| Placeholders literales, ausencia de cláusulas de e-commerce | spec 010: D10-06, REQ-LEG10-002 |

## Puntos pendientes de validación legal (resumen para Neo y el abogado)

1. Responsable, jurisdicción y ley aplicable (placeholders, `D10-06`).
2. Suficiencia de la declaración 18+ sin verificación de edad; tratamiento de datos de menores y plazo de supresión (`D10-05`).
3. Derechos del titular y plazos según jurisdicción; base legal del tratamiento; encargados y transferencias internacionales (Google, nube).
4. Condiciones de datos de cada proveedor de IA (retención, entrenamiento, región) según tipo de cuenta; el texto remite a Google y no afirma garantías.
5. Contenido y vigencia del enlace compartido (qué incluye, revocación, caducidad): verificar contra la función vigente en `T1414`.
6. Conservación de registros técnicos y de respaldos internos temporales (sin cifras públicas).
7. Licencia sobre el contenido del usuario, titularidad de la imagen generada y limitación de responsabilidad en los términos.

## Fuera de alcance de `T1412`

- Valores definitivos de los placeholders (`T1437`, Neo).
- Implementación de páginas y rutas (`T1413`); dictamen `/rama` (`T1414`).
- Enmienda por edad mínima: hecha en `T1425` (`REQ-MEN10-004`, estado `REVIEW`). El procedimiento ante cuenta de menor queda como canal de contacto (decisión de Neo 2), sin REQ nueva; validación legal en `T1426`.
