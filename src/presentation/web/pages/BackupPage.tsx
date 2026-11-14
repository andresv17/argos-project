/**
 * Respaldo: descarga del sobre 2.0.0 del usuario y subida de un archivo para la importación atómica.
 * El resultado o el error (`finalState` incluido) llegan de la API (STATE-BACKUP-001).
 *
 * @implements REQ-UI-004, REQ-BACKUP-001, REQ-BACKUP-002, STATE-BACKUP-001, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-MALFORMED-JSON
 */
import { useState, type ChangeEvent } from 'react';
import { Button, FormError } from '../components/Field.tsx';
import { ApiProblem, attachmentFileName, type ApiClient, CSRF_PARAMS, catalogProblem, problemMessage, unwrap, type ProblemDetails } from '../api.ts';
import { useSession } from '../session.tsx';
import type { Schemas } from '../view-model.ts';

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

export function BackupPage(): JSX.Element {
  const { api } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async (): Promise<void> => {
    setError(null);
    try {
      const { blob, fileName } = await requestBackupExport(api);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(problemMessage(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED')));
    }
  };

  const upload = async (): Promise<void> => {
    if (file === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(importResultText(await importBackupFile(api, file)));
    } catch (e) {
      setError(importProblemText(e instanceof ApiProblem ? e.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">Respaldo</h1>
      <section aria-labelledby="export-title" className="grid gap-2 rounded border border-slate-300 bg-white p-4">
        <h2 id="export-title" className="text-lg font-semibold">
          Exportar
        </h2>
        <p className="text-sm text-slate-700">Descarga un archivo JSON con tus mascotas y sus registros. No incluye datos de otros usuarios ni de tus hogares.</p>
        <div>
          <Button onClick={() => void download()}>Descargar respaldo</Button>
        </div>
      </section>
      <section aria-labelledby="import-title" className="grid gap-2 rounded border border-slate-300 bg-white p-4">
        <h2 id="import-title" className="text-lg font-semibold">
          Importar
        </h2>
        <p className="text-sm text-slate-700">Reemplaza todos tus datos por los del archivo (máximo 10 MB). Si el archivo no es válido, no se cambia nada.</p>
        <label className="flex flex-col text-sm font-medium text-slate-800">
          Archivo de respaldo (.json)
          <input type="file" accept="application/json,.json" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full max-w-full text-sm" />
        </label>
        <div>
          <Button disabled={file === null || busy} onClick={() => void upload()}>
            Importar respaldo
          </Button>
        </div>
        {result === null ? null : (
          <p role="status" className="rounded border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {result}
          </p>
        )}
        <FormError message={error} />
      </section>
    </div>
  );
}
