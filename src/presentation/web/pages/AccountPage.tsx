/**
 * Pantalla `/cuenta` (T290, blueprint §5.4): perfil editable, cambio de contraseña y zona de peligro con el flujo de
 * eliminación de la cuenta en dos pasos visibles (REQ-ACC-002): primero se descarga el respaldo, que entrega un token efímero
 * guardado solo en memoria, y después se confirma con la frase literal y la contraseña. Solo campos y acciones del contrato 002;
 * la verificación real (frase, contraseña, token, propiedad compartida) es del servidor y sus errores salen del catálogo.
 *
 * Vincular Google (T1131, REQ-VIN8-002): con contraseña y sin Google se pide la contraseña actual y la SPA navega a la URL de autorización; con Google vinculado se muestra el estado (de `authMethods`).
 *
 * @implements REQ-VIN8-001, REQ-VIN8-002, NFR-008-002, REQ-UI2-004, REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-AUTH2-001, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS, ERR-ACCOUNT-CONFIRMATION-MISMATCH
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, FormError, PasswordField, SelectField, TextField } from '../components/Field.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { GOOGLE_LINK_FIELD, googleLinkFeedback, startGoogleLink } from '../google-login.ts';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
import { formValues, validateInput, type FieldErrors } from '../validation.ts';
import type { Schemas } from '../view-model.ts';
import { downloadBlob, requestBackupExport } from './BackupPage.tsx';

const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
] as const;

const CARD = 'grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

function SavedNotice({ text }: { readonly text: string | null }): JSX.Element | null {
  if (text === null) return null;
  return (
    <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {text}
    </p>
  );
}

function ProfileSection(): JSX.Element {
  const { api, user, setUser } = useSession();
  const [saved, setSaved] = useState<string | null>(null);
  const form = useContractForm({
    schema: 'UpdateProfileInput',
    initial: {
      displayName: user?.displayName ?? '',
      email: user?.email ?? '',
      preferredLanguage: user?.preferredLanguage ?? 'es',
      timezone: user?.timezone ?? '',
    },
    send: async (body) => {
      setSaved(null);
      // Un correo vacío sobre un perfil que tenía correo lo borra (el contrato admite `null`).
      const payload = body.email === undefined && user?.email !== null && user?.email !== undefined ? { ...body, email: null } : body;
      setUser(await unwrap(api.PATCH('/account/profile', { params: CSRF_PARAMS, body: payload as Schemas['UpdateProfileInput'] })));
      setSaved('Perfil actualizado.');
    },
  });
  return (
    <section aria-labelledby="profile-title" className={CARD}>
      <h2 id="profile-title" className="text-lg font-semibold">
        Datos de perfil
      </h2>
      <form noValidate aria-label="Perfil" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3">
        <p className="text-sm text-text-muted">{`Usuario: ${user?.username ?? ''} (no editable)`}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="profile-displayName" label="Nombre visible" name="displayName" required value={form.values.displayName ?? ''} onChange={form.onChange} errors={form.errors} />
          <TextField id="profile-email" label="Correo (opcional)" name="email" type="email" autoComplete="email" value={form.values.email ?? ''} onChange={form.onChange} errors={form.errors} />
          <SelectField id="profile-preferredLanguage" label="Idioma" name="preferredLanguage" value={form.values.preferredLanguage ?? 'es'} options={LANGUAGES} onChange={form.onChange} errors={form.errors} />
          <TextField id="profile-timezone" label="Zona horaria" name="timezone" value={form.values.timezone ?? ''} onChange={form.onChange} errors={form.errors} />
        </div>
        <FormError errors={form.errors} message={form.message} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={form.busy}>
            Guardar
          </Button>
          <SavedNotice text={saved} />
        </div>
      </form>
    </section>
  );
}

function PasswordSection(): JSX.Element {
  const { api } = useSession();
  const [saved, setSaved] = useState<string | null>(null);
  const form = useContractForm({
    schema: 'ChangePasswordInput',
    initial: { currentPassword: '', newPassword: '' },
    resetOnSuccess: true,
    send: async (body) => {
      setSaved(null);
      await unwrap(api.POST('/account/password', { params: CSRF_PARAMS, body: body as Schemas['ChangePasswordInput'] }));
      setSaved('Contraseña cambiada.');
    },
  });
  return (
    <section aria-labelledby="password-title" className={CARD}>
      <h2 id="password-title" className="text-lg font-semibold">
        Cambiar contraseña
      </h2>
      <form noValidate aria-label="Cambiar contraseña" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <PasswordField id="password-currentPassword" label="Contraseña actual" name="currentPassword" autoComplete="current-password" required value={form.values.currentPassword ?? ''} onChange={form.onChange} errors={form.errors} />
          <PasswordField id="password-newPassword" label="Contraseña nueva (10 a 128, con mayúscula, número y símbolo)" name="newPassword" autoComplete="new-password" required value={form.values.newPassword ?? ''} onChange={form.onChange} errors={form.errors} />
        </div>
        <p className="text-sm text-text-muted">Las demás sesiones se cierran; esta se conserva.</p>
        <FormError errors={form.errors} message={form.message} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={form.busy}>
            Cambiar contraseña
          </Button>
          <SavedNotice text={saved} />
        </div>
      </form>
    </section>
  );
}

function DangerZone(): JSX.Element {
  const { api, dropSession } = useSession();
  const navigate = useNavigate();
  // El token efímero de la exportación vive solo en memoria: nunca en localStorage ni en la URL (REQ-ACC-002).
  const [token, setToken] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const form = useContractForm({
    schema: 'DeleteAccountInput',
    initial: { confirmationPhrase: '', password: '' },
    send: async (body) => {
      await unwrap(api.POST('/account/deletion', { params: CSRF_PARAMS, body: { ...body, ...(token === null ? {} : { backupConfirmationToken: token }) } as Schemas['DeleteAccountInput'] }));
      dropSession();
      navigate('/login', { replace: true });
    },
  });
  const download = async (): Promise<void> => {
    setExportError(null);
    try {
      const exported = await requestBackupExport(api);
      downloadBlob(exported.blob, exported.fileName);
      setToken(exported.token);
    } catch (e) {
      setExportError(problemMessage(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED')));
    }
  };
  return (
    <section aria-labelledby="danger-title" className="grid gap-3 rounded-2xl border-2 border-danger bg-red-50 p-4 text-red-900">
      <h2 id="danger-title" className="text-lg font-semibold">
        Zona de peligro: eliminar la cuenta
      </h2>
      <p className="max-w-prose text-sm">Se eliminan tu cuenta y tus datos. No se puede deshacer. Antes debes descargar un respaldo; el permiso dura 10 minutos y sirve una sola vez.</p>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Paso 1: descarga tu respaldo</p>
        <div>
          <Button variant="secondary" onClick={() => void download()}>
            Descargar respaldo
          </Button>
        </div>
        <FormError message={exportError} />
        {token === null ? null : (
          <p role="status" className="text-sm font-semibold">
            Respaldo descargado. Ya puedes confirmar la eliminación.
          </p>
        )}
      </div>
      <form noValidate aria-label="Eliminar cuenta" onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3">
        <p className="text-sm font-semibold">Paso 2: confirma</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="deletion-confirmationPhrase" label="Escribe ELIMINAR MI CUENTA" name="confirmationPhrase" required value={form.values.confirmationPhrase ?? ''} onChange={form.onChange} errors={form.errors} />
          <PasswordField id="deletion-password" label="Contraseña actual" name="password" autoComplete="current-password" required value={form.values.password ?? ''} onChange={form.onChange} errors={form.errors} />
        </div>
        <FormError errors={form.errors} message={form.message} />
        <div>
          <Button type="submit" variant="danger" disabled={form.busy || token === null}>
            Eliminar mi cuenta
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * Cuenta nacida con Google: no tiene contraseña en ARGOS, así que no se ofrecen el cambio de contraseña ni la eliminación con contraseña. Solo se informa (decisión 1 de Neo,
 * DEUDA-008-GOOGLE-ACCOUNT-DELETE): el borrado de la cuenta se gestiona por soporte mientras tanto. Sin plazos ni garantías legales.
 */
function NoPasswordNotice(): JSX.Element {
  return (
    <section aria-labelledby="no-password-title" role="note" data-account-no-password className={CARD}>
      <h2 id="no-password-title" className="text-lg font-semibold">
        Tu cuenta no tiene contraseña
      </h2>
      <p className="max-w-prose text-sm">Tu cuenta se creó con Google, por eso entras con Google y no tienes una contraseña en ARGOS.</p>
      <p className="max-w-prose text-sm">Por ahora, si quieres eliminar tu cuenta, el borrado lo gestiona el equipo de soporte: no se hace desde esta pantalla.</p>
    </section>
  );
}

interface GoogleLinkViewProps {
  readonly values: Readonly<Record<string, string>>;
  readonly errors: FieldErrors;
  readonly message: string | null;
  readonly busy: boolean;
  readonly onChange: (name: string, value: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

/** Presentación pura del formulario «Vincular Google» (render estático en las pruebas). Mismos controles de 48 px y tarjeta neutra que el resto del perfil (T1122). */
export function GoogleLinkView({ values, errors, message, busy, onChange, onSubmit }: GoogleLinkViewProps): JSX.Element {
  return (
    <section aria-labelledby="google-link-title" data-google-link className={CARD}>
      <h2 id="google-link-title" className="text-lg font-semibold">
        Vincular Google
      </h2>
      <p className="max-w-prose text-sm">Vincula tu cuenta de Google para poder entrar también con ella. Te pedimos tu contraseña actual para confirmar que eres tú, y las demás sesiones se cierran al terminar.</p>
      <form noValidate aria-label="Vincular Google" onSubmit={onSubmit} className="grid gap-3">
        <PasswordField id="google-link-currentPassword" label="Contraseña actual" name={GOOGLE_LINK_FIELD} autoComplete="current-password" required value={values[GOOGLE_LINK_FIELD] ?? ''} onChange={onChange} errors={errors} />
        <FormError message={message} />
        <div>
          <Button type="submit" variant="secondary" disabled={busy}>
            Vincular Google
          </Button>
        </div>
      </form>
    </section>
  );
}

function GoogleLinkSection(): JSX.Element {
  const { api } = useSession();
  const [values, setValues] = useState<Readonly<Record<string, string>>>({ [GOOGLE_LINK_FIELD]: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Peticiones de foco al campo con error (H-T1122-S1): el efecto actúa tras el render, cuando el campo ya muestra `aria-describedby`. Sin temporizadores (REQ-UI-002). */
  const [errorFocus, setErrorFocus] = useState(0);
  useEffect(() => {
    if (errorFocus > 0) document.getElementById('google-link-currentPassword')?.focus();
  }, [errorFocus]);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const body = formValues(values, [], []);
    const clientErrors = validateInput('GoogleLinkStartInput', body);
    setErrors(clientErrors);
    setMessage(null);
    if (Object.keys(clientErrors).length > 0) {
      setErrorFocus((n) => n + 1);
      return;
    }
    setBusy(true);
    startGoogleLink(api, body as Schemas['GoogleLinkStartInput'])
      .then((view) => {
        // La contraseña ya cumplió su función: no se conserva en el estado mientras el navegador sale hacia Google.
        setValues({ [GOOGLE_LINK_FIELD]: '' });
        window.location.assign(view.authorizationUrl);
      })
      .catch((error: unknown) => {
        const feedback = googleLinkFeedback(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));
        setErrors(feedback.errors);
        setMessage(feedback.message);
        if (feedback.focusField) setErrorFocus((n) => n + 1);
      })
      .finally(() => setBusy(false));
  };

  return <GoogleLinkView values={values} errors={errors} message={message} busy={busy} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} onSubmit={onSubmit} />;
}

/** Estado derivado de `authMethods.google`: la cuenta ya tiene Google vinculado. Sin acciones (desvincular es DEUDA-008-DESVINCULAR). */
function GoogleLinkedStatus(): JSX.Element {
  return (
    <section aria-labelledby="google-linked-title" data-google-link className={CARD}>
      <h2 id="google-linked-title" className="text-lg font-semibold">
        Google vinculado
      </h2>
      <p className="max-w-prose text-sm">Tu cuenta está vinculada con Google: puedes entrar con ella desde la pantalla de acceso.</p>
    </section>
  );
}

export function AccountPage(): JSX.Element {
  const { user } = useSession();
  // Una respuesta sin `authMethods` (opcional en el contrato) se trata como cuenta con contraseña.
  const hasPassword = user?.authMethods?.password !== false;
  const hasGoogle = user?.authMethods?.google === true;
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <ProfileSection />
      {hasGoogle ? <GoogleLinkedStatus /> : hasPassword ? <GoogleLinkSection /> : null}
      {hasPassword ? (
        <>
          <PasswordSection />
          <DangerZone />
        </>
      ) : (
        <NoPasswordNotice />
      )}
    </div>
  );
}
