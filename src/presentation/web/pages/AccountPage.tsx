/**
 * Pantalla `/cuenta` (T290, blueprint §5.4): perfil editable, cambio de contraseña y zona de peligro con el flujo de
 * eliminación de la cuenta en dos pasos visibles (REQ-ACC-002): primero se descarga el respaldo, que entrega un token efímero
 * guardado solo en memoria, y después se confirma con la frase literal y la contraseña. Solo campos y acciones del contrato 002;
 * la verificación real (frase, contraseña, token, propiedad compartida) es del servidor y sus errores salen del catálogo.
 *
 * @implements REQ-UI2-004, REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-AUTH2-001, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS, ERR-ACCOUNT-CONFIRMATION-MISMATCH
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, FormError, PasswordField, SelectField, TextField } from '../components/Field.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
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

export function AccountPage(): JSX.Element {
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <ProfileSection />
      <PasswordSection />
      <DangerZone />
    </div>
  );
}
