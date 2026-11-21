/**
 * Pantalla «Elige tu usuario» (Feature 008, `[GH:#16]`, T1122; ruta provisional `/elige-usuario`). A ella llega el *callback* de Google cuando el `sub` no tiene cuenta: el formulario
 * envía `chooseGoogleUsername` (`POST /api/auth/google/username` con la cabecera anti-CSRF; el estado del flujo viaja en la cookie `HttpOnly argos_oauth`, que la SPA no lee).
 * Con sesión iniciada vuelve a `/` (la ruta de retorno del *callback*). Sin flujo activo la pantalla es idéntica y el envío falla con el mensaje neutro del catálogo: no revela
 * correo, `sub` ni estado del flujo. El foco entra en el encabezado al abrir la pantalla (WCAG 2.4.3); sin `localStorage`.
 *
 * @implements REQ-SSO8-003, REQ-SSO8-004, NFR-008-002, EDGE-008-006, ERR-AUTH-GOOGLE-FAILED, ERR-AUTH-USERNAME-TAKEN
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiProblem, catalogProblem } from '../api.ts';
import { Button, FormError, TextField } from '../components/Field.tsx';
import { chooseUsernameFeedback } from '../google-login.ts';
import { useSession } from '../session.tsx';
import { formValues, validateInput, type FieldErrors } from '../validation.ts';
import type { Schemas } from '../view-model.ts';
import { AuthLayout } from './AuthPages.tsx';

interface ChooseUsernameViewProps {
  readonly values: Readonly<Record<string, string>>;
  readonly errors: FieldErrors;
  readonly message: string | null;
  /** El flujo ya no es válido (error uniforme de Google): el aviso conduce de vuelta al acceso. */
  readonly restart: boolean;
  readonly busy: boolean;
  /** Texto de la live region puntual (H-FOCO-1): solo se llena cuando el envío fue con el foco ya dentro del campo; vacío en el resto. */
  readonly announcement?: string;
  readonly onChange: (name: string, value: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

/** Presentación pura de la pantalla (render estático en las pruebas). */
export function ChooseUsernameView({ values, errors, message, restart, busy, announcement = '', onChange, onSubmit, titleRef }: ChooseUsernameViewProps & { readonly titleRef?: React.Ref<HTMLHeadingElement> }): JSX.Element {
  return (
    <AuthLayout title="Elige tu usuario" titleId="choose-username-title" {...(titleRef === undefined ? {} : { titleRef })}>
      <p className="mb-3 text-sm text-slate-800">Es el nombre con el que te encontrarán en ARGOS. Podrás cambiar tu nombre visible más adelante.</p>
      <form noValidate aria-labelledby="choose-username-title" onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TextField id="choose-username" label="Usuario (letras, números, . _ -)" name="username" autoComplete="username" required value={values['username'] ?? ''} onChange={onChange} errors={errors} />
        <FormError message={message} />
        <p id="choose-username-announce" aria-live="assertive" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
        <Button type="submit" disabled={busy}>
          Continuar
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-800">
        {restart ? 'Empieza de nuevo desde la pantalla de acceso. ' : null}
        <Link to="/login" className="font-semibold text-primary underline">
          Volver al acceso
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ChooseUsernamePage(): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState<Readonly<Record<string, string>>>({ username: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Cuenta de peticiones de foco al campo con error (H-T1122-S1): el efecto actúa tras el render, cuando el campo ya muestra `aria-describedby`. */
  const [errorFocus, setErrorFocus] = useState(0);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const [announcement, setAnnouncement] = useState('');
  /** El envío ocurrió con el foco ya en el campo (Enter): `.focus()` no cambia nada y el lector no relee `aria-describedby`; solo entonces se usa la live region (evita la doble lectura). */
  const submittedInField = useRef(false);
  const usernameError = useRef<string | undefined>(undefined);
  usernameError.current = errors['username'];

  useEffect(() => {
    if (errorFocus === 0) return;
    const field = document.getElementById('choose-username');
    if (!submittedInField.current) {
      field?.focus();
      return;
    }
    // El envío ya vació la live region (primer render); aquí se repone en otro render, para que el mismo texto se anuncie de nuevo al repetir el error. Sin temporizadores (REQ-UI-002).
    setAnnouncement(usernameError.current ?? '');
  }, [errorFocus]);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submittedInField.current = document.activeElement?.id === 'choose-username';
    setAnnouncement('');
    const body = formValues(values, [], []);
    const clientErrors = validateInput('GoogleChooseUsernameInput', body);
    setErrors(clientErrors);
    setMessage(null);
    if (clientErrors['username'] !== undefined) setErrorFocus((n) => n + 1);
    if (Object.keys(clientErrors).length > 0) return;
    setBusy(true);
    session
      .chooseGoogleUsername(body as Schemas['GoogleChooseUsernameInput'])
      .then(() => navigate('/', { replace: true }))
      .catch((error: unknown) => {
        const feedback = chooseUsernameFeedback(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));
        setErrors(feedback.errors);
        setMessage(feedback.message);
        setRestart(feedback.restart);
        if (feedback.errors['username'] !== undefined) setErrorFocus((n) => n + 1);
      })
      .finally(() => setBusy(false));
  };

  return <ChooseUsernameView values={values} errors={errors} message={message} restart={restart} busy={busy} announcement={announcement} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} onSubmit={onSubmit} titleRef={titleRef} />;
}
