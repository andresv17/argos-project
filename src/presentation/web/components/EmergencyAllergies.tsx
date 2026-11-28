/**
 * Editor de alergias críticas de la ficha (Feature 012, Bloque D, #32; T1676; REQ-QR12-002, REQ-QR12-009): una alergia por línea, con el texto de ayuda LITERAL del contrato (`allergiesEditorHelp`,
 * `maggie m-6`). Las alergias son texto plano: se muestran como texto de React (nunca como HTML). El servidor normaliza, deduplica y rechaza caracteres no permitidos (422 sin eco del valor).
 *
 * @implements REQ-QR12-002, REQ-QR12-009, REQ-QR12-010
 */
import { useMemo, useState } from 'react';
import { Button } from './Field.tsx';
import { EmergencyApiError, createEmergencyApi, emergencyProblemMessage, type EmergencyApi } from '../emergency-api.ts';
import { EMERGENCY_TEXTS, EMERGENCY_UI } from '../emergency-texts.ts';
import { allergiesFromText, allergiesToText } from '../emergency-view.ts';

export interface CriticalAllergiesEditorViewProps {
  readonly text: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly saved: string | null;
  readonly onText: (value: string) => void;
  readonly onSave: () => void;
}

export function CriticalAllergiesEditorView({ text, busy, error, saved, onText, onSave }: CriticalAllergiesEditorViewProps): JSX.Element {
  return (
    <section aria-labelledby="allergies-title" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="allergies-title" className="text-lg font-semibold">
        {EMERGENCY_UI.allergiesTitle}
      </h2>
      <form
        noValidate
        aria-label="Alergias críticas"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        className="grid gap-3"
      >
        <p id="allergies-help" className="max-w-prose text-sm text-slate-900">
          {EMERGENCY_TEXTS.allergiesEditorHelp}
        </p>
        <label htmlFor="allergies-input" className="text-sm font-medium text-slate-800">
          {EMERGENCY_UI.allergiesLabel}
        </label>
        <textarea
          id="allergies-input"
          name="criticalAllergies"
          rows={5}
          value={text}
          aria-describedby="allergies-help"
          onChange={(e) => onText(e.target.value)}
          className="min-h-12 rounded-2xl border border-slate-400 p-3 text-base"
        />
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
    </section>
  );
}

/** Contenedor: parte de la lista conocida (si la vista de la mascota la trae) y reemplaza la lista completa al guardar. */
export function CriticalAllergiesEditor({ petId, initial = [], onSaved, api }: { readonly petId: string; readonly initial?: readonly string[]; readonly onSaved?: () => void; readonly api?: EmergencyApi }): JSX.Element {
  const client = useMemo(() => api ?? createEmergencyApi(), [api]);
  const [text, setText] = useState(allergiesToText(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const view = await client.updateAllergies(petId, allergiesFromText(text));
      setText(allergiesToText(view.criticalAllergies));
      setSaved(view.cardAutoDeactivated === true ? `${EMERGENCY_UI.allergiesSaved} ${EMERGENCY_UI.allergiesAutoOff}` : EMERGENCY_UI.allergiesSaved);
      onSaved?.();
    } catch (e) {
      setError(emergencyProblemMessage(e instanceof EmergencyApiError ? e : new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0)));
    } finally {
      setBusy(false);
    }
  };
  return <CriticalAllergiesEditorView text={text} busy={busy} error={error} saved={saved} onText={setText} onSave={() => void save()} />;
}
