/**
 * Pantallas de registro e inicio de sesión con validación en cliente derivada de los contratos y mensajes
 * del catálogo. Tras registrarse, la sesión queda iniciada (REQ-AUTH2-001). El registro aplica la política de
 * contraseña nueva (INV-AUTH2-001) con confirmación y correo opcional; el inicio de sesión no la aplica (REQ-AUTH2-002).
 *
 * @implements REQ-UI-005, REQ-UI-004, REQ-AUTH2-001, INV-AUTH2-001, ERR-AUTH-INVALID-CREDENTIALS, ERR-AUTH-USERNAME-TAKEN, ERR-AUTH-TOO-MANY-ATTEMPTS, ERR-AUTH-WEAK-PASSWORD
 */
import { Link, useNavigate } from 'react-router-dom';
import { Button, FormError, PasswordField, TextField } from '../components/Field.tsx';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
import type { Schemas } from '../view-model.ts';

function AuthLayout({ title, children }: { readonly title: string; readonly children: JSX.Element[] }): JSX.Element {
  return (
    <main id="main-content" className="mx-auto mt-10 w-full max-w-md px-4">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Argos</h1>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </main>
  );
}

export function LoginPage(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const form = useContractForm({
    schema: 'LoginInput',
    initial: { username: '', password: '' },
    send: async (body) => {
      await session.login(body as Schemas['LoginInput']);
      navigate('/', { replace: true });
    },
  });
  return (
    <AuthLayout title="Iniciar sesión">
      <form noValidate aria-label="Iniciar sesión" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3 rounded border border-slate-300 bg-white p-4">
        <TextField id="login-username" label="Usuario" name="username" autoComplete="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="login-password" label="Contraseña" name="password" autoComplete="current-password" required value={form.values.password ?? ''} onChange={form.onChange} errors={form.errors} />
        <FormError errors={form.errors} message={form.message} />
        <Button type="submit" disabled={form.busy}>
          Entrar
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-800">
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="font-semibold text-blue-800 underline">
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
      await session.register(body as Schemas['RegisterUserInput']);
      navigate('/', { replace: true });
    },
  });
  return (
    <AuthLayout title="Crear cuenta">
      <form noValidate aria-label="Crear cuenta" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3 rounded border border-slate-300 bg-white p-4">
        <TextField id="register-username" label="Usuario (minúsculas, números, . _ -)" name="username" autoComplete="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
        <TextField id="register-displayName" label="Nombre visible" name="displayName" autoComplete="name" required value={form.values.displayName ?? ''} onChange={form.onChange} errors={form.errors} />
        <TextField id="register-email" label="Correo (opcional)" name="email" type="email" autoComplete="email" value={form.values.email ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="register-password" label="Contraseña (10 a 128, con mayúscula, número y símbolo)" name="password" autoComplete="new-password" required value={form.values.password ?? ''} onChange={form.onChange} errors={form.errors} />
        <PasswordField id="register-confirmPassword" label="Confirmar contraseña" name="confirmPassword" autoComplete="new-password" required value={form.values.confirmPassword ?? ''} onChange={form.onChange} errors={form.errors} />
        <FormError errors={form.errors} message={form.message} />
        <Button type="submit" disabled={form.busy}>
          Registrarme
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-800">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-blue-800 underline">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
