/**
 * Pantallas de estado de la solicitud (Feature 009, `[GH:#18]`, T1249): `/solicitud-en-revision` («Tu solicitud está en revisión») y `/solicitud-no-aprobada` («Tu solicitud no fue aprobada.»;
 * textos aprobados `D9-18`). Son públicas, sin sesión y sin marco de aplicación: no consultan mascotas, hogares ni escena. La supresión anticipada (Ley 1581 de 2012) NO tiene botón de
 * autoservicio: la pantalla solo describe el canal de contacto y la verificación de titularidad (EDGE-009-037). El foco entra en el encabezado al abrir (WCAG 2.4.3).
 *
 * @implements REQ-APR9-001, REQ-APR9-002, REQ-APR9-008, NFR-009-001, EDGE-009-037; SC-009-001, SC-009-002
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_STATUS_TITLE, type PendingAccountStatus } from '../account-status.ts';
import { AuthLayout } from './AuthPages.tsx';

const LEAD: Readonly<Record<PendingAccountStatus, string>> = {
  PENDING: 'Cuando se revise tu solicitud, podrás entrar con el mismo usuario y la misma contraseña, o con Google. Mientras tanto no tienes acceso a ARGOS. No te enviaremos correo: vuelve a entrar más tarde para ver el resultado.',
  REJECTED: 'Con esta cuenta no puedes entrar a ARGOS.',
};

export function AccountStatusPage({ status }: { readonly status: PendingAccountStatus }): JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <AuthLayout title={ACCOUNT_STATUS_TITLE[status]} titleId="account-status-title" titleRef={titleRef}>
      <p className="text-sm text-slate-800">{LEAD[status]}</p>
      <section aria-labelledby="account-status-privacy" className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 id="account-status-privacy" className="text-base font-semibold text-text-primary">
          Tus datos
        </h3>
        <p className="text-sm text-slate-800">
          Esta solicitud se suprime sola a los 30 días. Si quieres que se suprima antes, en ejercicio de tus derechos de la Ley 1581 de 2012, pídelo por el canal de contacto de ARGOS desde el correo con el que te registraste. No se hace desde esta pantalla: una persona de ARGOS verifica primero que la cuenta es tuya, por ejemplo pidiéndote que entres de nuevo con tu cuenta de Google, y luego la suprime.
        </p>
      </section>
      <p className="mt-4 text-sm text-slate-800">
        <Link to="/login" className="inline-flex min-h-12 items-center rounded font-semibold text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          Volver al acceso
        </Link>
      </p>
    </AuthLayout>
  );
}
