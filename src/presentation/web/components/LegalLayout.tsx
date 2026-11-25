/**
 * Marco de las páginas legales públicas (`/privacidad`, `/terminos`; T1413, REQ-LEG10-003). Sin sesión ni API: un solo `h1`, secciones con `h2`, enlace de regreso
 * y `id="main-content"`. El terracota no se usa en texto ni enlaces (solo el anillo de foco).
 *
 * @implements REQ-LEG10-003, INV-LEG10-001
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LegalLayout({ title, updated, children }: { readonly title: string; readonly updated: string; readonly children: ReactNode }): JSX.Element {
  return (
    <div lang="es" className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/40 bg-white/90 p-6 shadow-glass sm:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md">
        <main id="main-content" className="legal-text break-words text-text-primary">
          <p className="mb-4 text-sm">
            <Link to="/login" className="font-semibold text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2">
              Volver a Tipi
            </Link>
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary">{title}</h1>
          <p className="mt-2 text-sm text-text-muted">Última actualización: {updated}</p>
          <p className="mt-2 text-sm text-text-muted">Este texto está pendiente de validación legal externa y puede cambiar antes de su versión definitiva.</p>
          {children}
        </main>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { readonly heading: string; readonly children: ReactNode }): JSX.Element {
  return (
    <section className="mt-6 grid gap-3 text-base leading-relaxed">
      <h2 className="text-xl font-semibold text-text-primary">{heading}</h2>
      {children}
    </section>
  );
}

export function LegalList({ children }: { readonly children: ReactNode }): JSX.Element {
  return <ul className="grid list-disc gap-2 pl-6">{children}</ul>;
}
