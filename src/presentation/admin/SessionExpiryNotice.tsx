/**
 * Aviso de caducidad de la sesión de administración a los 25 min (LCK-25, T1269): se programa 5 min antes de `expiresAt` (tope de 30 min) y se anuncia en una región `status`
 * siempre presente. No renueva la sesión ni llama a la API.
 *
 * @implements REQ-ADM9-003, NFR-009-001; LCK-25
 */
import { useEffect, useState } from 'react';
import { SESSION_WARNING_TEXT, sessionWarningDelayMs } from './parameters-view.ts';

export function SessionExpiryNotice({ expiresAt }: { readonly expiresAt: string | null }): JSX.Element {
  const [due, setDue] = useState(false);
  useEffect(() => {
    setDue(false);
    if (expiresAt === null) return undefined;
    // nosemgrep: tests.security.sast-rules.argos-no-entropy-outside-adapters — reloj del navegador solo para armar el aviso de expiración (sin entropía ni dato persistido)
    const delay = sessionWarningDelayMs(expiresAt, Date.now());
    if (delay === null) return undefined;
    const timer = window.setTimeout(() => setDue(true), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return (
    <div role="status" className="mt-4 max-w-3xl">
      {due ? (
        <p data-testid="session-expiry-warning" className="rounded-lg border border-danger bg-red-50 px-3 py-2 text-sm font-medium text-danger">
          {SESSION_WARNING_TEXT}
        </p>
      ) : null}
    </div>
  );
}
