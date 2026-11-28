/**
 * Campo «Teléfono de contacto» de «Mi cuenta» (Feature 012, Bloque D, #32; T1676; REQ-QR12-001): E.164, opcional, con consentimiento aparte (se muestra en la ficha QR solo si el titular lo
 * marca por mascota). La validación y la normalización son del servidor (`ERR-QR12-PHONE-INVALID`, sin eco del valor); aquí no hay regex de negocio. El teléfono no se registra ni se repite en errores.
 *
 * @implements REQ-QR12-001, REQ-QR12-006
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from './Field.tsx';
import { EmergencyApiError, createEmergencyApi, emergencyProblemMessage, type AccountPhoneView, type EmergencyApi } from '../emergency-api.ts';
import { EMERGENCY_UI } from '../emergency-texts.ts';

export interface AccountPhoneViewProps {
  readonly value: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly saved: string | null;
  readonly onValue: (value: string) => void;
  readonly onSave: () => void;
  /** El teléfono vigente NO llegó del servidor (campo ausente, distinto de `null`): no hay campo ni guardado, para no borrar lo que no se pudo leer. */
  readonly unavailable?: boolean;
}

export function AccountPhoneSectionView({ value, busy, error, saved, onValue, onSave, unavailable = false }: AccountPhoneViewProps): JSX.Element {
  return (
    <section aria-labelledby="phone-title" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="phone-title" className="text-lg font-semibold">
        {EMERGENCY_UI.accountPhoneTitle}
      </h2>
      {unavailable ? (
        <p role="status" className="max-w-prose rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900">
          {EMERGENCY_UI.accountPhoneUnavailable}
        </p>
      ) : (
      <form
        noValidate
        aria-label="Teléfono de contacto"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        className="grid gap-3"
      >
        <p id="phone-help" className="max-w-prose text-sm text-text-muted">
          {EMERGENCY_UI.accountPhoneHelp}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="account-phone" className="text-sm font-medium text-slate-800">
            Teléfono (opcional)
          </label>
          <input
            id="account-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={value}
            aria-describedby="phone-help"
            onChange={(e) => onValue(e.target.value)}
            className="min-h-12 rounded-2xl border border-slate-400 px-3 text-base"
          />
        </div>
        {error === null ? null : (
          <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
          {saved === null ? null : (
            <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {saved}
            </p>
          )}
        </div>
      </form>
      )}
    </section>
  );
}

/** Guarda SOLO si el teléfono vigente llegó del servidor (`loaded`): con el campo ausente no hay PUT (devuelve `null`). Un texto vacío con el dato cargado borra el teléfono (`null` explícito). */
export async function updatePhoneIfLoaded(api: Pick<EmergencyApi, 'updatePhone'>, loaded: boolean, value: string): Promise<AccountPhoneView | null> {
  return loaded ? api.updatePhone(value.trim() === '' ? null : value.trim()) : null;
}

/** `initial` AUSENTE (`undefined`) = el servidor no entregó el teléfono: no se muestra campo ni se guarda nada; `null` explícito = sin teléfono (campo vacío y editable). */
export function AccountPhoneSection({ initial, api }: { readonly initial?: string | null | undefined; readonly api?: EmergencyApi }): JSX.Element {
  const client = useMemo(() => api ?? createEmergencyApi(), [api]);
  const loaded = initial !== undefined;
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => {
    if (initial !== undefined) setValue(initial ?? '');
  }, [initial]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const view = await updatePhoneIfLoaded(client, loaded, value);
      if (view === null) return;
      setValue(view.phone ?? '');
      setSaved(view.phone === null ? EMERGENCY_UI.accountPhoneRemoved : EMERGENCY_UI.accountPhoneSaved);
    } catch (e) {
      setError(emergencyProblemMessage(e instanceof EmergencyApiError ? e : new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0)));
    } finally {
      setBusy(false);
    }
  };
  return <AccountPhoneSectionView value={value} busy={busy} error={error} saved={saved} onValue={setValue} onSave={() => void save()} unavailable={!loaded} />;
}
