/**
 * Centro de Respaldos (T292, REQ-UI2-007): descarga del respaldo del usuario y subida de un archivo (con arrastre) con
 * previsualización y barra de fases «Validando, Previsualizando, Aplicando, Terminada» (o «Revertida»), sin porcentaje: el
 * servidor no informa progreso. El resultado o el error (`finalState` incluido) llegan de la API (STATE-BACKUP-001).
 *
 * @implements REQ-UI-004, REQ-UI2-007, REQ-BACKUP-001, REQ-BACKUP-002, REQ-BACKUP2-001, REQ-BACKUP2-002, STATE-BACKUP-001, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-MALFORMED-JSON
 */
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { Button, FormError } from '../components/Field.tsx';
import { ApiProblem, attachmentFileName, type ApiClient, CSRF_PARAMS, catalogProblem, problemMessage, unwrap, type ProblemDetails } from '../api.ts';
import { useSession } from '../session.tsx';
import { plural, type Schemas } from '../view-model.ts';

type ImportBackupResult = Schemas['ImportBackupResult'];

/** Texto del resultado de una importación completada. */
export function importResultText(result: ImportBackupResult): string {
  return `Importación completada (versión ${result.sourceSchemaVersion}): ${result.importedPetsCount} mascotas y ${result.importedRecordsCount} registros.`;
}

/** Texto de un error de importación: mensaje del catálogo y estado final de la máquina. */
export function importProblemText(problem: ProblemDetails): string {
  const state = problem.finalState === 'UNKNOWN' ? ' Estado final desconocido: revisa tus datos.' : problem.finalState === 'ROLLED_BACK' ? ' No se modificó ningún dato.' : '';
  return `${problemMessage(problem)}${state}`;
}

/** SHA-256 hexadecimal en minúsculas de los bytes (mismo `fileDigest` que calcula el servidor; Web Crypto, sin importar domain). */
export async function fileDigestOf(bytes: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Exportación: POST /backup/export con X-Argos-Request; el token de confirmación llega en X-Argos-Confirmation-Token (T271). */
export async function requestBackupExport(api: ApiClient): Promise<{ blob: Blob; fileName: string; token: string }> {
  const { data, error: problem, response } = await api.POST('/backup/export', { params: { header: CSRF_PARAMS.header }, parseAs: 'blob' });
  const token = response.headers.get('X-Argos-Confirmation-Token');
  if (problem !== undefined || data === undefined || !response.ok || token === null) throw new ApiProblem(catalogProblem('ERR-INTERNAL-UNEXPECTED'));
  return { blob: data as unknown as Blob, fileName: attachmentFileName(response.headers.get('Content-Disposition')), token };
}

/** Importación: bytes crudos con X-Argos-Import-Confirm = SHA-256 hexadecimal en minúsculas de esos bytes (T272). */
export async function importBackupFile(api: ApiClient, file: Blob): Promise<ImportBackupResult> {
  const bytes = await file.arrayBuffer();
  const digest = await fileDigestOf(bytes);
  return unwrap(
    api.POST('/backup/import', {
      params: { header: { ...CSRF_PARAMS.header, 'X-Argos-Import-Confirm': digest } },
      body: bytes as unknown as string,
      bodySerializer: (body: unknown) => body as BodyInit,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

type ImportPreviewResult = Schemas['ImportPreviewResult'];

/** Previsualización: bytes crudos a `POST /backup/import/preview`; no persiste nada (REQ-BACKUP2-002). */
export async function previewBackupFile(api: ApiClient, file: Blob): Promise<ImportPreviewResult> {
  const bytes = await file.arrayBuffer();
  return unwrap(
    api.POST('/backup/import/preview', {
      params: { header: CSRF_PARAMS.header },
      body: bytes as unknown as string,
      bodySerializer: (body: unknown) => body as BodyInit,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/** Descarga un blob como archivo (el nombre lo decide la API). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Fases de la importación en el orden en que la persona las ve; la última cambia a «Revertida» si el servidor revierte. */
type Phase = 'IDLE' | 'VALIDATING' | 'PREVIEWING' | 'APPLYING' | 'DONE' | 'ROLLED_BACK';
const PHASE_LABELS = ['Validando', 'Previsualizando', 'Aplicando', 'Terminada'] as const;
const CURRENT_STEP: Readonly<Record<Phase, number | null>> = { IDLE: null, VALIDATING: 0, PREVIEWING: 1, APPLYING: 2, DONE: 3, ROLLED_BACK: 3 };

function PhaseBar({ phase, stalled = false }: { readonly phase: Phase; readonly stalled?: boolean }): JSX.Element {
  const current = CURRENT_STEP[phase];
  return (
    <ol aria-label="Fases de la importación" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PHASE_LABELS.map((label, index) => {
        // Error sin reversión confirmada: «Aplicando» deja de marcarse como paso activo (el role="alert" comunica el fallo).
        const isCurrent = current === index && !stalled;
        const reached = current !== null && index <= current;
        const text = index === 3 && phase === 'ROLLED_BACK' ? 'Revertida' : label;
        const tone = isCurrent ? (phase === 'ROLLED_BACK' ? 'border-2 border-danger bg-red-50 text-red-900' : 'border-2 border-primary bg-accent text-primary') : reached ? 'border border-primary bg-white text-primary' : 'border border-border-strong bg-white text-text-muted';
        return (
          <li key={label} {...(isCurrent ? { 'aria-current': 'step' as const } : {})} className={`rounded-full px-3 py-2 text-center text-sm font-semibold ${tone}`}>
            {text}
          </li>
        );
      })}
    </ol>
  );
}

export function PreviewSummary({ preview }: { readonly preview: ImportPreviewResult }): JSX.Element {
  const { counts, collisions, affectedSharedPets } = preview;
  return (
    <div role="status" className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
      <p className="font-semibold">{`Previsualización (versión ${preview.sourceSchemaVersion}): el archivo trae ${plural(counts.pets, 'mascota', 'mascotas')}.`}</p>
      <p className="tabular-nums text-text-muted">{`Pesos: ${counts.weights} · Medidas: ${counts.bodyMeasurements} · Vacunas: ${counts.vaccinations} · Desparasitaciones: ${counts.dewormings} · Consultas: ${counts.medicalVisits} · Parámetros: ${counts.customParameters}`}</p>
      <p>{`Se reemplazarán ${plural(collisions.petsReplacedCount, 'mascota propia actual', 'mascotas propias actuales')}; ${collisions.sameIdPetsCount} ${collisions.sameIdPetsCount === 1 ? 'coincide' : 'coinciden'} por identificador.`}</p>
      {affectedSharedPets.petsCount > 0 ? <p>{`${plural(affectedSharedPets.petsCount, 'mascota compartida perderá', 'mascotas compartidas perderán')} su asignación en ${plural(affectedSharedPets.householdsCount, 'hogar', 'hogares')}.`}</p> : null}
    </div>
  );
}

export function BackupPage(): JSX.Element {
  const { api } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const download = async (): Promise<void> => {
    setError(null);
    try {
      const { blob, fileName } = await requestBackupExport(api);
      downloadBlob(blob, fileName);
    } catch (e) {
      setError(problemMessage(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED')));
    }
  };

  /** Elegir o soltar un archivo lo valida y previsualiza; la importación solo la dispara la persona. */
  const choose = async (next: File | null): Promise<void> => {
    setFile(next);
    setPreview(null);
    setResult(null);
    setError(null);
    if (next === null) {
      setPhase('IDLE');
      return;
    }
    setPhase('VALIDATING');
    try {
      setPreview(await previewBackupFile(api, next));
      setPhase('PREVIEWING');
    } catch (e) {
      setError(importProblemText(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED')));
    }
  };

  const upload = async (): Promise<void> => {
    if (file === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPhase('APPLYING');
    try {
      setResult(importResultText(await importBackupFile(api, file)));
      setPhase('DONE');
    } catch (e) {
      const problem = e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED');
      setError(importProblemText(problem));
      // «Revertida» solo si el servidor confirma la reversión; con UNKNOWN o sin finalState la barra se queda en «Aplicando».
      setPhase(problem.finalState === 'ROLLED_BACK' ? 'ROLLED_BACK' : 'APPLYING');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0] ?? null);
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <h1 className="text-2xl font-bold">Respaldo</h1>
      <section aria-labelledby="export-title" className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="export-title" className="text-lg font-semibold">
          Exportar
        </h2>
        <p className="max-w-prose text-sm text-text-muted">Descarga un archivo JSON con tus mascotas y sus registros. No incluye datos de otros usuarios ni de tus hogares.</p>
        <div>
          <Button onClick={() => void download()}>Descargar respaldo</Button>
        </div>
      </section>
      <section aria-labelledby="import-title" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="import-title" className="text-lg font-semibold">
          Importar
        </h2>
        <p className="max-w-prose text-sm text-text-muted">Reemplaza todos tus datos por los del archivo (máximo 10 MB). Si el archivo no es válido, no se cambia nada.</p>
        <PhaseBar phase={phase} stalled={phase === 'APPLYING' && error !== null} />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`grid gap-2 rounded-2xl border-2 border-dashed p-4 ${dragging ? 'border-primary bg-accent-soft' : 'border-border-strong bg-white'}`}
        >
          <p className="text-sm text-text-muted">Arrastra aquí el archivo de respaldo o elígelo con el botón.</p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800">
            Archivo de respaldo (.json)
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e: ChangeEvent<HTMLInputElement>) => void choose(e.target.files?.[0] ?? null)}
              className="w-full max-w-full text-sm text-slate-800 file:mr-3 file:min-h-12 file:rounded-full file:border file:border-primary file:bg-white file:px-5 file:font-semibold file:text-primary hover:file:bg-meadow"
            />
          </label>
          {file === null ? null : <p className="break-all text-sm text-slate-800">{`Archivo seleccionado: ${file.name}`}</p>}
        </div>
        {preview === null ? null : <PreviewSummary preview={preview} />}
        <div>
          <Button disabled={file === null || busy} onClick={() => void upload()}>
            Importar respaldo
          </Button>
        </div>
        {result === null ? null : (
          <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {result}
          </p>
        )}
        <FormError message={error} />
      </section>
    </div>
  );
}
