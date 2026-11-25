/**
 * Política de privacidad pública (`/privacidad`, T1413). Texto cerrado de `legal-texts.md` (T1412) con los 4 placeholders literales (D10-06). T1425 (REQ-MEN10-004):
 * incorpora la declaración de mayoría de edad (casilla «Soy mayor de edad (18+)», implementada en T1424; texto 0.1.0 DRAFT) y el procedimiento ante cuenta de menor. Sin props, sin sesión, sin API.
 *
 * @implements REQ-LEG10-001, REQ-LEG10-003, REQ-LEG10-005, INV-LEG10-001, EDGE-010-004, SC-010-011
 */
import { LegalLayout, LegalList, LegalSection } from '../components/LegalLayout.tsx';

const CONTACT = '[CORREO DE CONTACTO / PRIVACIDAD]';
const OWNER = '[NOMBRE DEL RESPONSABLE O PROYECTO]';
const JURISDICTION = '[PAÍS / JURISDICCIÓN]';

export function PrivacyPolicyPage(): JSX.Element {
  return (
    <LegalLayout title="Política de privacidad de Tipi" updated="[FECHA DE ÚLTIMA ACTUALIZACIÓN]">
      <LegalSection heading="1. Quién es el responsable">
        <p>
          El responsable del tratamiento de tus datos es {OWNER}. Para cualquier consulta sobre privacidad, escribe a {CONTACT}. Esta política se rige por la jurisdicción de {JURISDICTION} (pendiente de validación legal).
        </p>
      </LegalSection>
      <LegalSection heading="2. Qué es Tipi">
        <p>
          Tipi es una herramienta de registro personal para llevar la salud y los datos biométricos de tus mascotas: fichas, registros clínicos, archivos, fotos y, de forma opcional, una escena del hogar en pixel art generada con inteligencia artificial. Es informativa y no sustituye la consulta, el diagnóstico ni el tratamiento de un veterinario.
        </p>
      </LegalSection>
      <LegalSection heading="3. Qué datos tratamos">
        <LegalList>
          <li>
            <strong>Cuenta</strong>: nombre de usuario, contraseña (guardada solo de forma protegida, nunca en claro), nombre para mostrar, correo si lo indicas, idioma y zona horaria. Si te registras con Google, usamos tu identificador de cuenta de Google (no tu contraseña de Google) y el correo verificado para crear tu cuenta.
          </li>
          <li>
            <strong>Mascotas y hogar</strong>: fichas, registros de salud, archivos y fotos que subes tú, y la composición de tu hogar y de sus miembros.
          </li>
          <li>
            <strong>Registros técnicos y de auditoría</strong>: un registro de acciones de la cuenta (por ejemplo, la eliminación), identificado con un seudónimo y no con tus datos directos; un registro de las acciones de la administración del servicio, sin correo ni identificador de Google; y los intentos de generación de escena, con el modelo, la región y la cuenta que los inició. Plazo de conservación: pendiente de validación legal.
          </li>
          <li>
            <strong>Declaración de mayoría de edad</strong>: la fecha en que declaraste ser mayor de edad y la versión del texto vigente en ese momento. No pedimos fecha de nacimiento ni documento de identidad. La conservamos mientras exista tu cuenta y se elimina junto con ella; no se incluye en el respaldo que descargas. (Pendiente de validación legal.)
          </li>
          <li>
            <strong>Técnicos</strong>: cookies de sesión y de inicio de sesión (ver sección 8) y datos mínimos de funcionamiento y seguridad del servicio, como la dirección IP para limitar abusos (el periodo de conservación de estos registros: pendiente de validación legal).
          </li>
        </LegalList>
      </LegalSection>
      <LegalSection heading="4. Para qué los usamos">
        <p>
          Para crear y mantener tu cuenta, mostrarte tus mascotas y registros, permitir compartir información cuando tú lo decides y mantener el servicio seguro. No vendemos tus datos, no hacemos publicidad ni usamos analítica de terceros.
        </p>
      </LegalSection>
      <LegalSection heading="5. Cuentas en revisión">
        <p>
          Toda cuenta nueva queda en estado «pendiente» hasta que una persona administradora la aprueba. Mientras está pendiente no se abre sesión. Si se rechaza, la cuenta no obtiene acceso. Esta revisión la hace una persona administradora sobre los datos de la solicitud (nombre de usuario, fecha y método de registro).
        </p>
      </LegalSection>
      <LegalSection heading="6. Inteligencia artificial: la escena del hogar (opcional)">
        <p>
          La generación de la escena es opcional y <strong>solo funciona con tu consentimiento explícito</strong>, que se pide antes de la primera generación y cada vez que cambia el texto del aviso o el proveedor. Puedes retirarlo en cualquier momento; al retirarlo se borran de inmediato las imágenes de la escena de nuestro almacenamiento.
        </p>
        <p>Tipi puede usar <strong>dos proveedores</strong> de Google, y solo se usa uno por generación, el que tenga activo la administración del servicio:</p>
        <LegalList>
          <li>
            <strong>Google Cloud Vertex AI</strong> (modelo de imágenes Gemini), operado por Tipi desde su proyecto de Google Cloud.
          </li>
          <li>
            <strong>Gemini Developer API</strong> (API de desarrollador de Google, modelo de imágenes Gemini), operada por Tipi con la clave operativa del servicio, que Tipi gestiona en un gestor de secretos en la nube. Es una clave de Tipi: <strong>no necesitas aportar ninguna clave propia</strong> y nunca se te pide una.
          </li>
        </LegalList>
        <p>
          Cada proveedor tiene su propio aviso y su propio consentimiento. Si cambia el proveedor o el texto del aviso, se te pide consentir de nuevo antes de volver a generar.
        </p>
        <p>
          <strong>Qué se envía al proveedor activo, y cuándo:</strong> al generar o regenerar la escena, Tipi envía:
        </p>
        <ol className="grid list-decimal gap-2 pl-6">
          <li>
            la foto de tu hogar, si la subiste y consentiste, <strong>solo cuando la escena se genera desde cero</strong> (primera generación, cambio de la foto del hogar o regeneración completa); en los cambios parciales (incrementales) no se vuelve a enviar;
          </li>
          <li>la foto de cada mascota de la que eres Propietario Legal, si consentiste y cuando la escena incluye o conserva a la mascota;</li>
          <li>la imagen de la escena anterior, cuando solo se cambian algunas mascotas;</li>
          <li>
            un texto técnico con las instrucciones y la especie, la raza y el sexo de cada mascota; cuando la especie es «otra», también el nombre de especie que escribiste;
          </li>
          <li>
            <strong>la biografía de cada mascota</strong> (el texto libre de su ficha, depurado de caracteres especiales y limitado a 280 caracteres), tanto de las mascotas con foto como de las que no la tienen. Solo se envía si la persona propietaria de la mascota ha dado su consentimiento para las fotos de sus mascotas; si no lo ha dado, la biografía no sale. Esta condición aplica también a las mascotas sin foto. Lo que escribas en la biografía viaja al proveedor: no escribas ahí datos que no quieras compartir.
          </li>
        </ol>
        <p>
          <strong>Qué no se envía</strong>: nombres de mascotas ni de personas, número de microchip, correo, fechas de nacimiento ni datos clínicos de la ficha. Antes de enviar una foto, Tipi elimina sus metadatos (por ejemplo, la ubicación GPS), pero el contenido visual de la imagen llega tal cual al proveedor. La biografía se guarda en la ficha de la mascota, pero no se copia en los registros de escena ni en los intentos de escena: viaja de forma transitoria en la petición.
        </p>
        <p>
          <strong>No subas fotos con personas</strong>: Tipi no detecta personas, y las fotos pueden mostrar a alguien sin que lo notes, en especial menores. La imagen del hogar la ven todos los miembros activos del hogar.
        </p>
        <p>
          <strong>Dónde se procesa y cuánto se conserva</strong>: depende del proveedor y de su configuración. Con Vertex AI, la región depende del modelo activo: con gemini-2.5-flash-image, la región us-central1 (Iowa, EE. UU.); con gemini-3.1-flash-image, la región «global», en la que el procesamiento no queda fijado a una región ni a un país. En ambos casos supone una transferencia internacional de tus imágenes. Con Gemini Developer API, la región de procesamiento y el régimen de datos de ese proveedor están pendientes de confirmación y de validación legal; Tipi no afirma aquí una región. La retención por parte de Google, el uso de tus imágenes para entrenar modelos y las condiciones según el tipo de cuenta del proveedor se rigen por las condiciones de Google y están <strong>pendientes de validación legal</strong>; Tipi no controla la copia que recibe el proveedor.
        </p>
        <p>
          <strong>Sin respaldo</strong>: la foto del hogar y las escenas generadas no se incluyen en el respaldo de la cuenta ni se restauran al importarlo. Tampoco se incluyen las imágenes de las mascotas ni los archivos clínicos; el respaldo solo lleva, si la escribiste en la ficha, la dirección (URL) del avatar de cada mascota, no la imagen.
        </p>
      </LegalSection>
      <LegalSection heading="7. Enlaces compartidos">
        <p>
          Puedes generar un enlace público de solo lectura (<code>/shared/:token</code>) para enseñar un resumen clínico a un veterinario o a otra persona. Quien tenga el enlace puede verlo sin iniciar sesión. Compártelo solo con quien quieras. Un enlace caduca a los 1, 7 o 30 días que elijas, y quien lo creó puede revocarlo en cualquier momento. El número de microchip y los archivos clínicos solo se incluyen si marcas esas casillas al crear el enlace. (Tratamiento legal del contenido del resumen: pendiente de validación legal.)
        </p>
      </LegalSection>
      <LegalSection heading="8. Cookies">
        <p>Usamos solo cookies técnicas estrictamente necesarias:</p>
        <LegalList>
          <li>
            <code>argos_session</code>: mantiene tu sesión abierta.
          </li>
          <li>
            <code>argos_oauth</code>: acompaña el flujo de inicio de sesión con Google.
          </li>
          <li>
            <code>argos_admin_session</code>: mantiene la sesión de la administración del servicio. Solo la usa la administración.
          </li>
          <li>
            <code>argos_admin_oauth</code>: acompaña el inicio de sesión de la administración con Google (de un solo uso). Solo la usa la administración.
          </li>
        </LegalList>
        <p>No usamos cookies de publicidad ni de analítica de terceros (ni Google Analytics, ni Meta Pixel, ni similares).</p>
      </LegalSection>
      <LegalSection heading="9. Con quién compartimos datos">
        <LegalList>
          <li>Con el proveedor de inteligencia artificial activo, solo lo descrito en la sección 6 y solo con tu consentimiento.</li>
          <li>
            Con el proveedor de infraestructura en la nube en el que funciona Tipi (almacenamiento y base de datos) y con Google para el inicio de sesión con Google. Los nombres, las ubicaciones y los contratos de tratamiento de estos encargados: pendiente de validación legal.
          </li>
          <li>No vendemos ni cedemos tus datos con fines comerciales. No procesamos pagos ni suscripciones y no enviamos correos de marketing ni boletines.</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading="10. Tus derechos y cómo eliminar tus datos">
        <LegalList>
          <li>Puedes ver y corregir tus datos y los de tus mascotas desde la aplicación.</li>
          <li>
            Puedes <strong>eliminar tu cuenta y tus datos</strong> desde la sección «Cuenta» (<code>/cuenta</code>, zona de peligro). Si tu cuenta usa contraseña, debes confirmar con tu contraseña, escribir la frase de confirmación y haber descargado antes el respaldo de la cuenta. Si tu cuenta se creó con Google (sin contraseña), confirmas de nuevo con Google y escribes la frase de confirmación; descargar el respaldo es opcional. La eliminación borra tu cuenta, tus mascotas con sus registros, tus archivos, fotos y avatares y tus sesiones. Si eres propietario de un hogar y su único miembro activo, el hogar se elimina con la cuenta. La eliminación se bloquea mientras seas propietario de un hogar con otros miembros activos o tengas mascotas asignadas a un hogar con otros miembros activos: antes debes transferirlas o desasignarlas.
          </li>
          <li>
            Restos técnicos pueden permanecer en respaldos internos temporales con retención acotada que se purgan automáticamente (plazos concretos: pendiente de validación legal; no se publican cifras).
          </li>
          <li>También puedes pedir la eliminación o consultar tus datos escribiendo a {CONTACT}.</li>
          <li>Los derechos concretos que te asisten, y los plazos de respuesta, dependen de {JURISDICTION} (pendiente de validación legal).</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading="11. Mayoría de edad y supresión de cuentas de menores">
        <p>
          Tipi está dirigido a personas <strong>mayores de 18 años</strong>.
        </p>
        <p>
          Para registrarte, con usuario y contraseña o con Google, debes marcar la casilla «Soy mayor de edad (18+)». El servidor rechaza el registro si no la marcas, y guarda con tu cuenta la fecha de la declaración y la versión del texto. No pedimos ni verificamos fecha de nacimiento ni documento, de modo que la declaración se basa en tu palabra (pendiente de validación legal si es suficiente en {JURISDICTION}). Las cuentas creadas antes de que existiera esta casilla siguen funcionando y no se les exige una declaración retroactiva.
        </p>
        <p>
          Si crees que una cuenta pertenece a una persona menor de 18 años, escribe a {CONTACT} indicando la cuenta (nombre de usuario). El responsable del servicio revisará la solicitud y, si se confirma, procederá a la supresión de la cuenta y sus datos. Para revisar la solicitud no pediremos documentos de identidad de la persona menor ni de nadie más: usaremos solo los datos de la cuenta y de tu mensaje, que conservaremos únicamente el tiempo necesario para atenderla. Además, la propia persona titular puede eliminar su cuenta directamente desde <code>/cuenta</code> (sección 10). Plazo de respuesta y supresión: pendiente de validación legal.
        </p>
      </LegalSection>
      <LegalSection heading="12. Cambios en esta política">
        <p>
          Si cambiamos esta política, actualizaremos la fecha indicada al principio. Si el cambio afecta a la inteligencia artificial, se te pedirá un nuevo consentimiento antes de volver a generar.
        </p>
      </LegalSection>
      <LegalSection heading="13. Contacto">
        <p>
          {OWNER} — {CONTACT}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
