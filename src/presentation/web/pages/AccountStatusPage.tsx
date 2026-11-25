/**
 * Pantallas de estado de la solicitud (Feature 009, `[GH:#18]`, T1249): `/solicitud-en-revision` («Tu solicitud está en revisión») y `/solicitud-no-aprobada` («Tu solicitud no fue aprobada.»;
 * textos aprobados `D9-18`). Son públicas, sin sesión y sin marco de aplicación: no consultan mascotas, hogares ni escena. Sin formulario, botón ni campo: solo avisa de la purga automática a los 30 días.
 * El foco entra en el encabezado al abrir (WCAG 2.4.3).
 *
 * @implements REQ-APR9-001, REQ-APR9-002, NFR-009-001; SC-009-001, SC-009-002
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_STATUS_TITLE, type PendingAccountStatus } from '../account-status.ts';
import { AuthLayout } from './AuthPages.tsx';

const LEAD: Readonly<Record<PendingAccountStatus, string>> = {
  PENDING: 'Cuando se revise tu solicitud, podrás entrar con el mismo usuario y la misma contraseña, o con Google. Mientras tanto no tienes acceso a Tipi. No te enviaremos correo: vuelve a entrar más tarde para ver el resultado.',
  REJECTED: 'Con esta cuenta no puedes entrar a Tipi.',
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
          Esta solicitud se suprime sola a los 30 días.
        </p>
      </section>
      <p className="mt-4 text-sm text-slate-800">
        <Link to="/login" className="inline-flex min-h-12 items-center rounded font-semibold text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2">
          Volver al acceso
        </Link>
      </p>
    </AuthLayout>
  );
}
