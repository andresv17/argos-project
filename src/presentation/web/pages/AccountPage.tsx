/**
 * Pantalla `/cuenta` (T290, blueprint §5.4): perfil editable, cambio de contraseña y zona de peligro con el flujo de
 * eliminación de la cuenta en dos pasos visibles (REQ-ACC-002): primero se descarga el respaldo, que entrega un token efímero
 * guardado solo en memoria, y después se confirma con la frase literal y la contraseña. Solo campos y acciones del contrato 002;
 * la verificación real (frase, contraseña, token, propiedad compartida) es del servidor y sus errores salen del catálogo.
 *
 * Cuenta sin contraseña (009, T1220, REQ-DEL9-001/002): el aviso de T1122 se retira y se ofrece la eliminación con la prueba de titularidad (reautenticación con Google) y el listado de hogares bloqueantes del 409.
 *
 * Vincular Google (T1131, REQ-VIN8-002): con contraseña y sin Google se pide la contraseña actual y la SPA navega a la URL de autorización; con Google vinculado se muestra el estado (de `authMethods`).
 *
 * Foto de perfil (011, #78, T1556): panel «Foto de perfil» con el recortador de avatar reutilizado; solo subida propia, sin leer fotos de fuentes externas.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, REQ-DEL9-001, REQ-DEL9-002, INV-DEL9-001, EDGE-009-049, REQ-VIN8-001, REQ-VIN8-002, NFR-008-002, REQ-UI2-004, REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-AUTH2-001, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS, ERR-ACCOUNT-CONFIRMATION-MISMATCH
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAvatarEditor } from '../components/AvatarCropper.tsx';
import { Button, FormError, PasswordField, SelectField, TextField } from '../components/Field.tsx';
import { UserAvatar } from '../components/UserAvatar.tsx';
import { AccountPhoneSection } from '../components/AccountPhone.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { DeletionApiError, createAccountDeletionApi, deletionFeedback, type AffectedHousehold, type DeletionFeedback } from '../account-deletion-google.ts';
import { humanSchemaMessage } from '../schema-messages.ts';
import { createUserAvatarApi } from '../user-avatar-api.ts';
import { GOOGLE_LINK_FIELD, googleLinkFeedback, startGoogleLink } from '../google-login.ts';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
import { formValues, validateInput, type FieldErrors } from '../validation.ts';
import type { Schemas } from '../view-model.ts';
import { downloadBlob, requestBackupExport } from './BackupPage.tsx';
import { useUserAvatar } from './AppShell.tsx';

const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
] as const;

/** Frase literal de `DeleteAccountWithGoogleInput` (REQ-ACC-002 (3)); el servidor la vuelve a verificar. */
const DELETE_PHRASE = 'ELIMINAR MI CUENTA';

const CARD = 'grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

function SavedNotice({ text }: { readonly text: string | null }): JSX.Element | null {
  if (text === null) return null;
  return (
    <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {text}
    </p>
  );
}

/** Panel «Foto de perfil»: la foto actual (o iniciales), elegir y recortar una foto nueva, reemplazar y quitar. Quitar la foto devuelve las iniciales; no hay fotos de fuentes externas. */
function AvatarSection(): JSX.Element {
  const { user } = useSession();
  const { avatarVersion, setAvatarVersion } = useUserAvatar();
  const api = useMemo(() => createUserAvatarApi(), []);
  return (
    <section aria-labelledby="avatar-title" className={`${CARD} min-w-0 grid-cols-[minmax(0,1fr)]`}>
      <h2 id="avatar-title" tabIndex={-1} className="text-lg font-semibold focus-visible:outline-none">
        Foto de perfil
      </h2>
      <div className="flex items-center gap-4">
        <UserAvatar displayName={user?.displayName ?? ''} avatarVersion={avatarVersion} size={96} />
        <span className="sr-only">{avatarVersion === null ? 'Sin foto: se muestran tus iniciales.' : 'Tienes una foto de perfil.'}</span>
        <p className="max-w-prose text-sm text-text-muted">Solo tú ves esta foto. Sube una imagen y recórtala; con «Quitar foto» vuelven tus iniciales.</p>
      </div>
      <UserAvatarEditor api={api} avatarVersion={avatarVersion} onChanged={setAvatarVersion} />
    </section>
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

export interface DeleteGoogleViewProps {
  readonly phrase: string;
  readonly errors: FieldErrors;
  /** Mensaje global (hogares activos u otro error del catálogo). */
  readonly message: string | null;
  /** Falta la prueba de titularidad (EDGE-009-031): se muestra junto al botón de Google. */
  readonly reauthMessage: string | null;
  /** Hogares bloqueantes del 409 (EDGE-009-049). */
  readonly households: readonly AffectedHousehold[];
  /** El respaldo ya se descargó y su token está en memoria. */
  readonly backupReady: boolean;
  readonly backupError: string | null;
  readonly busy: boolean;
  readonly reauthBusy: boolean;
  readonly onChange: (name: string, value: string) => void;
  readonly onReauth: () => void;
  readonly onDownload: () => void;
  readonly onSubmit: (event: FormEvent) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Eliminación de una cuenta sin contraseña (REQ-DEL9-001, REQ-DEL9-002; sustituye al aviso informativo de T1122). Tres pasos: confirmar con Google (prueba de titularidad, D9-17 = A;
 * la SPA navega a Google y vuelve a este perfil), descargar el respaldo y escribir la frase literal. No hay campo de contraseña. Presentación pura (render estático en las pruebas).
 */
export function DeleteGoogleView(props: DeleteGoogleViewProps): JSX.Element {
  const { phrase, errors, message, reauthMessage, households, backupReady, backupError, busy, reauthBusy, onChange, onReauth, onDownload, onSubmit } = props;
  const showResult = message !== null || households.length > 0;
  return (
    <section aria-labelledby="delete-google-title" data-account-delete-google className="grid gap-3 rounded-2xl border-2 border-danger bg-red-50 p-4 text-red-900">
      <h2 id="delete-google-title" tabIndex={-1} className="text-lg font-semibold">
        Zona de peligro: eliminar la cuenta
      </h2>
      <p className="max-w-prose text-sm">Tu cuenta se creó con Google, por eso entras con Google y no tienes una contraseña en Tipi.</p>
      <p className="max-w-prose text-sm">Se eliminan tu cuenta y tus datos. No se puede deshacer. Antes debes descargar un respaldo; el permiso dura 10 minutos y sirve una sola vez.</p>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Paso 1: confirma que eres tú con Google</p>
        <p id="delete-google-reauth-help" className="max-w-prose text-sm">
          Google te pedirá volver a confirmar tu identidad y regresarás a esta pantalla.
        </p>
        <div>
          <Button variant="secondary" onClick={onReauth} disabled={reauthBusy} describedBy="delete-google-reauth-help">
            Confirmar con Google
          </Button>
        </div>
        {reauthMessage === null ? null : (
          <p role="alert" className="rounded-2xl border border-danger bg-white px-4 py-3 text-sm text-red-900">
            {reauthMessage}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Paso 2: descarga tu respaldo</p>
        <div>
          <Button variant="secondary" onClick={onDownload}>
            Descargar respaldo
          </Button>
        </div>
        <FormError message={backupError} />
        {backupReady ? (
          <p role="status" className="text-sm font-semibold">
            Respaldo descargado. Ya puedes confirmar la eliminación.
          </p>
        ) : null}
      </div>
      <form noValidate aria-label="Eliminar cuenta con Google" onSubmit={onSubmit} className="grid gap-3">
        <p className="text-sm font-semibold">Paso 3: escribe la frase para eliminar</p>
        <TextField id="delete-google-confirmationPhrase" label="Escribe ELIMINAR MI CUENTA" name="confirmationPhrase" required value={phrase} onChange={onChange} errors={errors} />
        {showResult ? (
          <div id="delete-google-result" tabIndex={-1} className="grid gap-3">
            <FormError message={message} />
            {households.length === 0 ? null : (
              <div data-delete-households className="grid gap-2 rounded-2xl border border-danger bg-white p-4">
                <h3 id="delete-google-households-title" className="text-base font-semibold">
                  Hogares afectados
                </h3>
                <ul aria-labelledby="delete-google-households-title" className="grid gap-2">
                  {households.map((household) => (
                    <li key={household.householdId} className="min-w-0 break-words text-sm">
                      <span className="font-semibold">{household.name}</span>
                      {`: ${plural(household.activeMembers, 'miembro activo', 'miembros activos')} y ${plural(household.sharedPets, 'mascota compartida', 'mascotas compartidas')}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
        <p id="delete-google-submit-help" className="max-w-prose text-sm">
          {backupReady ? 'La eliminación es definitiva.' : 'Para eliminar, primero descarga el respaldo del paso 2.'}
        </p>
        <div>
          <Button type="submit" variant="danger" disabled={busy || !backupReady} describedBy="delete-google-submit-help">
            Eliminar mi cuenta
          </Button>
        </div>
      </form>
    </section>
  );
}

function DeleteGoogleSection(): JSX.Element {
  const { api, dropSession } = useSession();
  const navigate = useNavigate();
  const deletion = useMemo(() => createAccountDeletionApi(), []);
  // El token efímero del respaldo vive solo en memoria: nunca en localStorage ni en la URL (REQ-ACC-002).
  const [token, setToken] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<DeletionFeedback>({ message: null, reauthMessage: null, households: [] });
  const [busy, setBusy] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  /** Peticiones de foco al resultado o al campo con error (WCAG 3.3.1): el efecto actúa tras el render. Sin temporizadores (REQ-UI-002). */
  const [focusTarget, setFocusTarget] = useState<{ readonly id: string; readonly n: number } | null>(null);
  useEffect(() => {
    if (focusTarget !== null) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);
  const focus = (id: string): void => setFocusTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));

  const fail = (error: unknown): DeletionFeedback => (error instanceof DeletionApiError ? deletionFeedback(error) : deletionFeedback(new DeletionApiError('ERR-INTERNAL-UNEXPECTED', 0)));

  const reauth = (): void => {
    setReauthBusy(true);
    setFeedback({ message: null, reauthMessage: null, households: [] });
    deletion
      .startReauth()
      .then((url) => window.location.assign(url))
      .catch((error: unknown) => {
        const failed = fail(error);
        setFeedback({ message: null, reauthMessage: failed.message ?? failed.reauthMessage, households: [] });
        setReauthBusy(false);
      });
  };
  const download = (): void => {
    setBackupError(null);
    requestBackupExport(api)
      .then((exported) => {
        downloadBlob(exported.blob, exported.fileName);
        setToken(exported.token);
      })
      .catch((e: unknown) => setBackupError(problemMessage(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'))));
  };
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setFeedback({ message: null, reauthMessage: null, households: [] });
    if (phrase !== DELETE_PHRASE) {
      setErrors({ confirmationPhrase: humanSchemaMessage('confirmationPhrase') });
      focus('delete-google-confirmationPhrase');
      return;
    }
    setErrors({});
    setBusy(true);
    deletion
      .deleteAccount({ confirmationPhrase: phrase, ...(token === null ? {} : { backupConfirmationToken: token }) })
      .then(() => {
        dropSession();
        navigate('/login', { replace: true });
      })
      .catch((error: unknown) => {
        const next = fail(error);
        setFeedback(next);
        focus(next.reauthMessage === null ? 'delete-google-result' : 'delete-google-title');
        setBusy(false);
      });
  };

  return (
    <DeleteGoogleView
      phrase={phrase}
      errors={errors}
      message={feedback.message}
      reauthMessage={feedback.reauthMessage}
      households={feedback.households}
      backupReady={token !== null}
      backupError={backupError}
      busy={busy}
      reauthBusy={reauthBusy}
      onChange={(_name, value) => setPhrase(value)}
      onReauth={reauth}
      onDownload={download}
      onSubmit={onSubmit}
    />
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
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <AvatarSection />
      <ProfileSection />
      <AccountPhoneSection initial={(user as { readonly phone?: string | null } | null)?.phone} />
      {hasGoogle ? <GoogleLinkedStatus /> : hasPassword ? <GoogleLinkSection /> : null}
      {hasPassword ? (
        <>
          <PasswordSection />
          <DangerZone />
        </>
      ) : (
        <DeleteGoogleSection />
      )}
    </div>
  );
}
