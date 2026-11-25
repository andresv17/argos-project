/**
 * Pantallas de registro e inicio de sesión con validación en cliente derivada de los contratos y mensajes
 * del catálogo. Tras registrarse, la sesión queda iniciada (REQ-AUTH2-001). El registro aplica la política de
 * contraseña nueva (INV-AUTH2-001) con confirmación y correo opcional; el inicio de sesión no la aplica (REQ-AUTH2-002). El campo de
 * inicio de sesión acepta usuario o correo (REQ-LOG-001); el usuario del registro admite mayúsculas y no exige dígitos (REQ-LOG-002).
 *
 * @implements REQ-UI-005, REQ-UI-004, REQ-SSO8-003, NFR-008-002, REQ-AUTH2-001, REQ-LOG-001, REQ-LOG-002, INV-AUTH2-001, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-TOO-MANY-ATTEMPTS, ERR-AUTH-WEAK-PASSWORD
 */
import type { Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACCOUNT_STATUS_ROUTE } from '../account-status.ts';
import { Button, FormError, PasswordField, TextField } from '../components/Field.tsx';
import { GOOGLE_START_PATH } from '../google-login.ts';
import { BRAND_NAME } from '../brand.ts';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
import type { Schemas } from '../view-model.ts';

/** Marco de autenticación. Con `titleId` el encabezado es enfocable por programa (`tabIndex=-1`): las pantallas que llegan por navegación del servidor llevan allí el foco. */
export function AuthLayout({ title, titleId, titleRef, children }: { readonly title: string; readonly titleId?: string; readonly titleRef?: Ref<HTMLHeadingElement>; readonly children: JSX.Element[] }): JSX.Element {
  // Marco L1 único de autenticación (blueprint §5.1): dos columnas desde 1024 px, apilado debajo; blur solo desde 640 px.
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/40 bg-white/90 p-6 shadow-glass sm:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md">
        <main id="main-content" className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">{BRAND_NAME}</h1>
            <p className="mt-1 text-sm text-text-muted">Pet Health Tracker</p>
          </div>
          <div>
            <h2 {...(titleId === undefined ? {} : { id: titleId, tabIndex: -1 })} {...(titleRef === undefined ? {} : { ref: titleRef })} className="mb-4 text-lg font-semibold text-text-primary focus:outline-none">
              {title}
            </h2>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * «Continuar con Google»: es una navegación (`startGoogleLogin` responde 302 a Google), por eso es un enlace con aspecto de botón de 48 px y no un `button` con script. No guarda
 * nada en el cliente: el estado del flujo vive en el servidor (cookie `HttpOnly`).
 */
function GoogleAccess({ lead }: { readonly lead: string }): JSX.Element {
  return (
    <div className="mt-4 grid gap-2">
      <p className="text-sm text-slate-800">{lead}</p>
      <a
        href={GOOGLE_START_PATH}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-primary bg-white px-5 text-sm font-semibold text-primary hover:bg-meadow focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2"
      >
        Continuar con Google
      </a>
    </div>
  );
}

export function LoginPage(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const form = useContractForm({
    schema: 'LoginInput',
    initial: { username: '', password: '' },
    send: async (body) => {
      const pending = await session.login(body as Schemas['LoginInput']);
      navigate(pending === null ? '/' : ACCOUNT_STATUS_ROUTE[pending], { replace: true });
    },
  });
  return (
    <AuthLayout title="Iniciar sesión">
      <form noValidate aria-label="Iniciar sesión" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TextField id="login-username" label="Usuario o correo" name="username" autoComplete="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="login-password" label="Contraseña" name="password" autoComplete="current-password" required value={form.values.password ?? ''} onChange={form.onChange} errors={form.errors} />
        <FormError errors={form.errors} message={form.message} />
        <Button type="submit" disabled={form.busy}>
          Entrar
        </Button>
        <p className="text-sm text-text-muted">Si no puedes entrar con tu correo, usa tu usuario.</p>
      </form>
      <GoogleAccess lead="O entra con tu cuenta de Google, sin contraseña." />
      <p className="mt-4 text-sm text-slate-800">
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="font-semibold text-primary underline">
          Regístrate
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const form = useContractForm({
    schema: 'RegisterUserInput',
    initial: { username: '', displayName: '', email: '', password: '', confirmPassword: '' },
    send: async (body) => {
      const pending = await session.register(body as Schemas['RegisterUserInput']);
      navigate(pending === null ? '/' : ACCOUNT_STATUS_ROUTE[pending], { replace: true });
    },
  });
  return (
    <AuthLayout title="Crear cuenta">
      <form noValidate aria-label="Crear cuenta" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TextField id="register-username" label="Usuario (letras, números, . _ -)" name="username" autoComplete="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
        <TextField id="register-displayName" label="Nombre visible" name="displayName" autoComplete="name" required value={form.values.displayName ?? ''} onChange={form.onChange} errors={form.errors} />
        <TextField id="register-email" label="Correo (opcional)" name="email" type="email" autoComplete="email" value={form.values.email ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="register-password" label="Contraseña (10 a 128, con mayúscula, número y símbolo)" name="password" autoComplete="new-password" required value={form.values.password ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="register-confirmPassword" label="Confirmar contraseña" name="confirmPassword" autoComplete="new-password" required value={form.values.confirmPassword ?? ''} onChange={form.onChange} errors={form.errors} />
        <FormError errors={form.errors} message={form.message} />
        <Button type="submit" disabled={form.busy}>
          Registrarme
        </Button>
      </form>
      <GoogleAccess lead="O crea tu cuenta con Google, sin contraseña." />
      <p className="mt-4 text-sm text-slate-800">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-primary underline">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
