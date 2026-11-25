/**
 * Términos de uso públicos (`/terminos`, T1413). Texto cerrado de `legal-texts.md` (T1412) con los placeholders literales (D10-06) y SIN la declaración en el registro
 * (condicionada a T1424: no se describen funciones inexistentes, REQ-LEG10-002). Sin props, sin sesión, sin API.
 *
 * @implements REQ-LEG10-001, REQ-LEG10-003, REQ-LEG10-005, INV-LEG10-001, EDGE-010-004
 */
import { LegalLayout, LegalList, LegalSection } from '../components/LegalLayout.tsx';

const CONTACT = '[CORREO DE CONTACTO / PRIVACIDAD]';
const OWNER = '[NOMBRE DEL RESPONSABLE O PROYECTO]';
const JURISDICTION = '[PAÍS / JURISDICCIÓN]';

export function TermsPage(): JSX.Element {
  return (
    <LegalLayout title="Términos de uso de Tipi" updated="[FECHA DE ÚLTIMA ACTUALIZACIÓN]">
      <LegalSection heading="1. Quién ofrece el servicio">
        <p>
          Tipi lo ofrece {OWNER}. Contacto: {CONTACT}. Estos términos se rigen por la jurisdicción de {JURISDICTION} (pendiente de validación legal).
        </p>
      </LegalSection>
      <LegalSection heading="2. Qué es y qué no es Tipi">
        <p>
          Tipi es una herramienta informativa y de registro personal para mascotas. <strong>No sustituye</strong> la consulta, el diagnóstico ni el tratamiento de un veterinario profesional. Las alertas, curvas y cálculos son orientativos. Ante cualquier duda sobre la salud de tu mascota, consulta a un veterinario.
        </p>
      </LegalSection>
      <LegalSection heading="3. Mayoría de edad (18+)">
        <p>
          Para usar Tipi debes ser <strong>mayor de 18 años</strong>.
        </p>
      </LegalSection>
      <LegalSection heading="4. Tu cuenta">
        <LegalList>
          <li>Eres responsable de la actividad de tu cuenta y de custodiar tu contraseña.</li>
          <li>
            Toda cuenta nueva queda <strong>pendiente</strong> hasta que la persona administradora la aprueba; podemos aprobar o rechazar solicitudes y no garantizamos que se apruebe una cuenta.
          </li>
          <li>
            Puedes eliminar tu cuenta cuando quieras desde <code>/cuenta</code>, con las condiciones de la política de privacidad.
          </li>
          <li>Podemos suspender o eliminar cuentas que incumplan estos términos o pongan en riesgo el servicio.</li>
        </LegalList>
      </LegalSection>
      <LegalSection heading="5. Contenido que subes">
        <p>
          Eres responsable de los datos, fotos y archivos que subes. Sube solo contenido que tengas derecho a usar. No subas fotos en las que aparezcan otras personas, en especial menores. Nos otorgas únicamente el permiso necesario para almacenar y mostrar tu contenido dentro del servicio. Alcance y redacción de esta licencia: pendiente de validación legal.
        </p>
      </LegalSection>
      <LegalSection heading="6. Hogares compartidos">
        <p>Si compartes un hogar, los demás miembros pueden ver lo que su rol permite, incluida la imagen del hogar. Eres responsable de a quién invitas.</p>
      </LegalSection>
      <LegalSection heading="7. Escena con inteligencia artificial">
        <p>
          Es opcional y requiere tu consentimiento explícito, descrito en la política de privacidad (proveedores, datos enviados y cuándo). Los dos proveedores (Vertex AI y Gemini Developer API) los opera Tipi con sus propias credenciales; no necesitas aportar una clave. La imagen generada es una representación artística y puede contener errores o no parecerse a tu mascota. La disponibilidad de la función depende de la configuración del servicio y puede cambiar o suspenderse. Titularidad y uso de la imagen generada: pendiente de validación legal.
        </p>
      </LegalSection>
      <LegalSection heading="8. Enlaces compartidos">
        <p>Si generas un enlace público, cualquier persona que lo tenga puede ver su contenido. Eres responsable de decidir con quién lo compartes.</p>
      </LegalSection>
      <LegalSection heading="9. Uso aceptable">
        <p>No uses Tipi para actividad ilícita, para intentar acceder a cuentas ajenas, para sobrecargar el servicio ni para eludir sus límites o controles de seguridad.</p>
      </LegalSection>
      <LegalSection heading="10. Pagos">
        <p>Tipi no procesa pagos ni suscripciones.</p>
      </LegalSection>
      <LegalSection heading="11. Disponibilidad y responsabilidad">
        <p>
          El servicio se ofrece «tal cual», sin garantía de disponibilidad continua. Haz respaldos de tus datos con la función de exportación de la cuenta (las fotos y archivos no van en el respaldo). Límites de responsabilidad y garantías aplicables en {JURISDICTION}: pendiente de validación legal.
        </p>
      </LegalSection>
      <LegalSection heading="12. Cambios y terminación">
        <p>Podemos actualizar estos términos; la fecha de arriba indica la última versión. Puedes dejar de usar Tipi y eliminar tu cuenta en cualquier momento.</p>
      </LegalSection>
      <LegalSection heading="13. Ley aplicable y contacto">
        <p>
          Ley y foro aplicables: {JURISDICTION} (pendiente de validación legal). Contacto: {CONTACT}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
