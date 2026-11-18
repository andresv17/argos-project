/**
 * Vista del resumen clínico de solo lectura (S5 de `/sati`, T775, T777, T779; REQ-SUM-004, REQ-SUM-005, REQ-SUM-007, REQ-SUM-008, REQ-VET-009; SC-005-031, SC-005-032,
 * SC-005-035, SC-005-047): UNA pieza con dos puertas, la página pública `/shared/{token}` (`mode = PUBLIC`) y la vista previa autenticada del propietario
 * (`mode = PREVIEW`, D5-15). Cero formularios y cero campos editables: el único control es «Imprimir / Guardar como PDF». Cada módulo siempre aparece (vacío dice
 * «Sin registros.»). Sin gráficos, miniaturas, `<img>`, `<iframe>`, scripts ni recursos de terceros (CSP `default-src 'none'`, `style-src 'self'`): no hay estilos en línea.
 * El nombre original del archivo (`fileLabels`) es contenido del cuidador SIN verificar: se muestra SIEMPRE como nodo de texto (React lo escapa), con `translate="no"`,
 * nunca en el título ni en la URL, y se oculta en papel. El resumen no trae interpretación automática (REQ-SUM-008).
 *
 * `SharedSummaryDocument` es presentacional; el contenedor que pide los datos es `SharedPage`/`SummaryPreviewPage`.
 *
 * @implements REQ-SUM-004, REQ-SUM-005, REQ-SUM-007, REQ-SUM-008, REQ-VET-009, INV-005-009, SC-005-031, SC-005-032, SC-005-035, SC-005-047
 */
import type { ClinicalPetView, SharedSummaryViewModel } from '../share-api.ts';
import { SEVERITY_LABEL, SYMPTOM_TYPE_LABEL } from '../symptoms.ts';
import { decimalEs, DEWORMING_TYPE_LABEL, formatCalendarDate, formatUtcStamp, labelOf, PARAMETER_CATEGORY_LABEL, SEX_LABEL, SPECIES_LABEL } from '../share-view.ts';

export type { SharedSummaryViewModel };
export { formatUtcStamp };

export interface SharedSummaryDocumentProps {
  readonly view: SharedSummaryViewModel;
  readonly mode: 'PUBLIC' | 'PREVIEW';
  /** Ruta de descarga de un archivo clínico (solo la página pública; la vista previa no descarga). */
  readonly downloadHref: ((fileId: string) => string) | null;
  readonly onPrint: () => void;
}

const NONE = <p className="text-sm text-slate-700">Sin registros.</p>;
const ROW = 'grid min-w-0 gap-1 border-b border-slate-200 py-2 text-sm text-slate-900 break-inside-avoid';
const H3 = 'mt-3 border-b border-slate-300 pb-1 text-base font-semibold text-slate-900 break-after-avoid';

const extra = (label: string, value: string | null): JSX.Element | null =>
  value === null || value === '' ? null : (
    <span className="min-w-0 break-words text-slate-800">
      {label}: {value}
    </span>
  );

function Rows({ children }: { readonly children: JSX.Element[] }): JSX.Element {
  return children.length === 0 ? NONE : <ul className="grid min-w-0">{children}</ul>;
}

const sizeText = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${decimalEs(Math.round(bytes / 102.4) / 10)} KB` : `${decimalEs(Math.round(bytes / 104_857.6) / 10)} MB`);

function PetSection({ pet, index, only, props, names }: { readonly pet: ClinicalPetView; readonly index: number; readonly only: boolean; readonly props: SharedSummaryDocumentProps; readonly names: ReadonlyMap<string, string> }): JSX.Element {
  const { profile } = pet;
  const disclosure = props.view.summary.disclosure;
  const Heading = only ? 'h2' : 'h2';
  return (
    <section id={`pet-${index + 1}`} aria-labelledby={`pet-${index + 1}-title`} className={`grid min-w-0 gap-1 ${index === 0 ? '' : 'pet-break'}`}>
      <Heading id={`pet-${index + 1}-title`} className="text-lg font-semibold text-slate-900 break-after-avoid">
        {profile.name}
      </Heading>
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-slate-900">
        <dt className="font-semibold">Especie</dt>
        <dd>{profile.species === 'OTHER' && profile.speciesOther !== null ? profile.speciesOther : (SPECIES_LABEL[profile.species] ?? profile.species)}</dd>
        <dt className="font-semibold">Raza</dt>
        <dd className="min-w-0 break-words">{profile.breed}</dd>
        <dt className="font-semibold">Sexo</dt>
        <dd>{SEX_LABEL[profile.sex] ?? profile.sex}</dd>
        <dt className="font-semibold">Nacimiento</dt>
        <dd>{`${formatCalendarDate(profile.birthDate)}${profile.birthDateIsEstimate ? ' (estimada)' : ''}`}</dd>
        <dt className="font-semibold">Edad</dt>
        <dd>{`${profile.age.years} años y ${profile.age.months} meses al ${formatCalendarDate(props.view.summary.generatedAt)}`}</dd>
        <dt className="font-semibold">Microchip</dt>
        <dd>{disclosure.microchipIncluded && profile.microchipId !== undefined ? profile.microchipId : 'Microchip no compartido por el cuidador'}</dd>
      </dl>

      <h3 className={H3}>Peso</h3>
      <Rows>
        {pet.weights.map((w, i) => (
          <li key={`w-${i}`} className={ROW}>
            <span className="font-semibold tabular-nums">{`${formatCalendarDate(w.recordedAt)} · ${decimalEs(w.weightKg)} kg`}</span>
            {extra('Notas', w.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Medidas</h3>
      <Rows>
        {pet.bodyMeasurements.map((m, i) => (
          <li key={`m-${i}`} className={ROW}>
            <span className="font-semibold tabular-nums">{formatCalendarDate(m.recordedAt)}</span>
            <span className="tabular-nums">{`Cuello ${decimalEs(m.neckCm)} cm · Pecho ${decimalEs(m.chestCm)} cm · Largo de espalda ${decimalEs(m.backLengthCm)} cm · Cintura ${decimalEs(m.waistCm)} cm`}</span>
            {extra('Notas', m.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Vacunas</h3>
      <Rows>
        {pet.vaccinations.map((v, i) => (
          <li key={`v-${i}`} className={ROW}>
            <span className="font-semibold">{`${v.vaccineName} · aplicada el ${formatCalendarDate(v.appliedAt)}`}</span>
            {v.nextBoosterAt === null ? null : <span className="tabular-nums">{`Próximo refuerzo: ${formatCalendarDate(v.nextBoosterAt)}`}</span>}
            {extra('Lote o clínica', v.batchOrClinic)}
            {extra('Veterinario', v.veterinarianName)}
            {extra('Notas', v.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Desparasitaciones</h3>
      <Rows>
        {pet.dewormings.map((d, i) => (
          <li key={`d-${i}`} className={ROW}>
            <span className="font-semibold">{`${d.productBrand} (${DEWORMING_TYPE_LABEL[d.dewormingType]}) · aplicada el ${formatCalendarDate(d.appliedAt)}`}</span>
            {d.nextSuggestedDoseAt === null ? null : <span className="tabular-nums">{`Próxima dosis sugerida: ${formatCalendarDate(d.nextSuggestedDoseAt)}`}</span>}
            {extra('Lote o clínica', d.batchOrClinic)}
            {extra('Veterinario', d.veterinarianName)}
            {extra('Notas', d.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Consultas</h3>
      <Rows>
        {pet.medicalVisits.map((v, i) => (
          <li key={`c-${i}`} className={ROW}>
            <span className="font-semibold tabular-nums">{`${formatCalendarDate(v.visitDate)} · ${v.reason}`}</span>
            {extra('Diagnóstico', v.diagnosis)}
            {extra('Tratamiento', v.treatment)}
            {extra('Clínica o veterinario', v.clinicOrVet)}
            {extra('Observaciones', v.observations)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Síntomas</h3>
      <Rows>
        {pet.symptoms.map((s, i) => (
          <li key={`s-${i}`} className={ROW}>
            <span className="font-semibold">{`${formatCalendarDate(s.recordedAt)} · ${s.title}`}</span>
            {extra('Tipo', labelOf(SYMPTOM_TYPE_LABEL, s.symptomType))}
            {extra('Intensidad reportada', labelOf(SEVERITY_LABEL, s.severity))}
            {extra('Descripción', s.description)}
            {extra('Notas', s.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Otros parámetros</h3>
      <Rows>
        {pet.otherParameters.map((p, i) => (
          <li key={`o-${i}`} className={ROW}>
            <span className="font-semibold">{`${formatCalendarDate(p.recordedAt)} · ${PARAMETER_CATEGORY_LABEL[p.category]} · ${p.title}`}</span>
            {extra('Descripción', p.description)}
            {extra('Notas', p.notes)}
          </li>
        ))}
      </Rows>

      <h3 className={H3}>Archivos clínicos</h3>
      <Rows>
        {pet.clinicalFiles.map((f) => {
          const name = names.get(f.id) ?? 'Archivo';
          const href = props.downloadHref === null ? null : props.downloadHref(f.id);
          return (
            <li key={f.id} className={ROW}>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{f.mime === 'application/pdf' ? 'PDF' : 'Imagen'}</span>
                <span translate="no" className="file-name min-w-0 [overflow-wrap:anywhere]">
                  {name}
                </span>
              </span>
              <span className="tabular-nums text-slate-800">{`Subido el ${formatCalendarDate(f.createdAt)} · ${sizeText(f.sizeBytes)}`}</span>
              {href === null ? null : (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${name}`} className="print-hide w-fit min-h-11 font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  Descargar
                </a>
              )}
            </li>
          );
        })}
      </Rows>
    </section>
  );
}

export function SharedSummaryDocument(props: SharedSummaryDocumentProps): JSX.Element {
  const { view, mode } = props;
  const { summary } = view;
  const names = new Map(view.fileLabels.map((l) => [l.fileId, l.displayName] as const));
  const household = summary.scope === 'HOUSEHOLD';
  const title = household ? `Resumen clínico · Hogar compartido · ${summary.pets.length} mascotas` : `Resumen clínico de ${summary.pets[0]?.profile.name ?? ''}`;
  return (
    <article aria-labelledby="summary-title" className="mx-auto grid w-full min-w-0 max-w-3xl gap-3 bg-white p-4 text-slate-900 sm:p-6 print-sheet">
      {mode === 'PREVIEW' ? (
        <p role="note" className="print-hide rounded-xl border border-primary bg-meadow px-4 py-3 text-sm font-semibold text-slate-900">
          Vista previa — así lo verá tu veterinario. Aún no se ha compartido nada.
        </p>
      ) : null}
      <header className="grid min-w-0 gap-1">
        <p className="print-hide text-xs font-semibold tracking-widest text-text-muted">ARGOS</p>
        <h1 id="summary-title" className="text-xl font-semibold text-slate-900 break-after-avoid">
          {title}
        </h1>
        <p className="text-sm tabular-nums text-slate-800">{`Generado el ${formatUtcStamp(summary.generatedAt)}`}</p>
        {view.validUntil === null ? null : <p className="text-sm tabular-nums text-slate-800">{`Enlace vigente hasta ${formatUtcStamp(view.validUntil)}`}</p>}
        <p className="text-sm font-semibold text-slate-900">Este resumen no sustituye la consulta veterinaria.</p>
        <p className="text-sm text-slate-800">Datos registrados por el cuidador; no verificados por un profesional.</p>
        <p className="print-only text-sm text-slate-900">Datos al momento de esta consulta; pueden cambiar</p>
        <div>
          <button type="button" onClick={props.onPrint} className="print-hide min-h-12 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            Imprimir / Guardar como PDF
          </button>
        </div>
        {household ? (
          <nav aria-label="Mascotas del resumen" className="print-hide text-sm text-slate-900">
            Mascotas:{' '}
            {summary.pets.map((pet, i) => (
              <span key={`nav-${i}`}>
                {i === 0 ? '' : ' · '}
                <a href={`#pet-${i + 1}`} className="font-semibold text-primary underline">
                  {pet.profile.name}
                </a>
              </span>
            ))}
          </nav>
        ) : null}
      </header>
      {summary.pets.map((pet, index) => (
        <PetSection key={`pet-${index}`} pet={pet} index={index} only={summary.pets.length === 1} props={props} names={names} />
      ))}
    </article>
  );
}

/** Página S7: un único mensaje para inexistente, vencido, revocado, creador sin autoridad y mascota inaccesible (no diagnostica la causa), o el límite de tasa. */
export function SharedUnavailable({ reason }: { readonly reason: 'NOT_FOUND' | 'RATE_LIMITED' }): JSX.Element {
  return (
    <main className="mx-auto grid max-w-xl gap-3 bg-white p-6 text-slate-900">
      <h1 id="shared-unavailable-title" tabIndex={-1} className="text-xl font-semibold">
        {reason === 'NOT_FOUND' ? 'Este enlace no está disponible' : 'Demasiados intentos'}
      </h1>
      <p className="text-sm text-slate-800">
        {reason === 'NOT_FOUND' ? 'El enlace no existe, venció o fue revocado. Pide a quien te lo compartió que genere uno nuevo.' : 'Espera unos minutos y vuelve a abrir el enlace.'}
      </p>
    </main>
  );
}
