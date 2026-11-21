/**
 * Alta y edición del perfil de una mascota propia (REQ-PET-001). La edición solo se ofrece si `canEdit`.
 *
 * Biografía (008, #21): solo en la edición (el alta no la admite, `CreatePetInput`), 0 a 280 caracteres en una sola línea con contador; texto plano. La edita quien edita los datos
 * básicos; el formulario ya solo se ofrece a ese rol (REQ-BIO8-001, REQ-RBAC-001).
 *
 * @implements REQ-BIO8-001, REQ-FAL7-003, REQ-UI-002, REQ-UI-004, REQ-UI-007, REQ-FRM-002, REQ-RAZ-001, REQ-RAZ-002, REQ-RAZ-003
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, FormError, SelectField, TextField } from './Field.tsx';
import { PetAssignments } from './PetAssignments.tsx';
import { BREEDS } from '../../../generated/catalogs/index.ts';
import { DECEASED_LINKS_NOTICE, LIFE_STATUS_LABEL, REVIVE_CONFIRMATION_TEXT, requiresReviveConfirmation, SEX_LABEL, SPECIES_LABEL, type PetProfile, type Species } from '../view-model.ts';
import { AvatarExternalLink } from './PetAvatar.tsx';
import { useContractForm } from '../use-contract-form.ts';
import type { FormBody } from '../validation.ts';

/** Cuerpo que sale del formulario: igual que `FormBody` pero con `null` para vaciar un campo anulable en la edición. */
export type PetFormBody = Record<string, string | number | boolean | null>;

/** Las 8 especies aprobadas (REQ-PET2-001, INV-PET2-001), en el orden del contrato. */
export const SPECIES_ORDER: readonly Species[] = ['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'];

const NULLABLE_FIELDS = ['speciesOther', 'neutered', 'microchipId', 'breedCode', 'deceasedAt', 'biography'] as const;

/** Tope de la biografía del contrato (`Biography.maxLength`, REQ-BIO8-001). */
export const BIOGRAPHY_MAX_LENGTH = 280;
/** Texto propio del exceso de longitud: el genérico del esquema dice «falta», que aquí es falso (H-T1183-S2). Es copy de presentación, no del catálogo. */
export const BIOGRAPHY_TOO_LONG = `La biografía admite hasta ${BIOGRAPHY_MAX_LENGTH} caracteres.`;

/** Solo perros y gatos tienen catálogo de razas (REQ-RAZ-003); las otras 6 especies llevan la raza como texto libre. */
const hasBreedCatalog = (species: string): boolean => species === 'CANINE' || species === 'FELINE';
const isOtherBreed = (breedCode: string): boolean => breedCode.endsWith('_OTHER');

/** Razas vigentes de la especie en el orden del catálogo: «Criolla» primero, alfabético sin tildes, «Otra» al final (REQ-RAZ-001). */
function breedChoices(species: string): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  return BREEDS.filter((b) => b.species === species && !b.deprecated)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((b) => ({ value: b.code, label: b.label }));
}

/** Raza inicial al elegir una especie: «Criolla» para perro y gato (primera opción); vacío para las demás. */
export function breedFieldsForSpecies(species: string): { readonly breedCode: string; readonly breed: string } {
  return { breedCode: hasBreedCatalog(species) ? (breedChoices(species)[0]?.value ?? '') : '', breed: '' };
}

/** Hogares del usuario que el alta puede usar como hogar base (REQ-HOUSE2-003). */
export interface HouseholdChoice {
  readonly id: string;
  readonly name: string;
}

export function petFormInitial(profile: PetProfile | null): Record<string, string> {
  return {
    name: profile?.name ?? '',
    species: profile?.species ?? 'CANINE',
    // Con un código de catálogo `breed` es derivado: solo «Otra» con texto libre lo muestra (y «Otra» sin texto queda vacío).
    breed: profile === null ? '' : profile.breedCode == null ? profile.breed : isOtherBreed(profile.breedCode) && profile.breed !== 'Otra' ? profile.breed : '',
    breedCode: profile === null ? breedFieldsForSpecies('CANINE').breedCode : (profile.breedCode ?? ''),
    birthDate: profile?.birthDate ?? '',
    sex: profile?.sex ?? 'MALE',
    avatarUrl: profile?.avatarUrl ?? '',
    speciesOther: profile?.speciesOther ?? '',
    birthDateIsEstimate: String(profile?.birthDateIsEstimate ?? false),
    neutered: profile?.neutered == null ? '' : String(profile.neutered),
    microchipId: profile?.microchipId ?? '',
    lifeStatus: profile?.lifeStatus ?? 'ALIVE',
    deceasedAt: profile?.deceasedAt ?? '',
    biography: profile?.biography ?? '',
  };
}

/**
 * Cuerpo a enviar: `speciesOther` solo con OTHER (INV-PET2-001) y, en la edición, un campo anulable que la persona dejó
 * vacío y que antes tenía valor se envía `null` (UpdatePetInput lo admite), porque un campo ausente conservaría el anterior.
 */
export function petFormBody(profile: PetProfile | null, body: FormBody): PetFormBody {
  const out: PetFormBody = { ...body };
  if (out['species'] !== 'OTHER') delete out['speciesOther'];
  if (profile === null) delete out['biography']; // el alta no admite la biografía (CreatePetInput): solo se edita
  if (out['lifeStatus'] !== 'DECEASED') delete out['deceasedAt']; // REQ-FAL7-002: ALIVE exige la fecha nula; en la edición con fecha previa se envía null más abajo.
  const species = String(out['species']);
  const code = out['breedCode'];
  if (!hasBreedCatalog(species)) delete out['breedCode'];
  else if (typeof code === 'string') {
    // El servidor deriva `breed` del rótulo; solo «Otra» envía el texto libre (en la edición, vacío se envía como «Otra» para no conservar el anterior).
    if (!isOtherBreed(code)) delete out['breed'];
    else if (out['breed'] === undefined && profile !== null) out['breed'] = 'Otra';
  }
  if (profile !== null) {
    for (const key of NULLABLE_FIELDS) {
      if (out[key] === undefined && profile[key] != null) out[key] = null;
    }
  }
  return out;
}

/**
 * Confirmación explícita al volver de Fallecido a Vivo (T1068, REQ-FAL7-003, EDGE-007-004, EDGE-007-016). El texto lo fijó Neo; la auditoría con la fecha anterior la hace el servidor.
 * @implements REQ-FAL7-003
 */
export function ReviveConfirmation({ petName, onConfirm, onCancel }: {
  readonly petName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  return (
    <div role="alert" className="grid gap-2 rounded-2xl border border-amber-700 bg-amber-50 p-4 text-amber-950 sm:col-span-2">
      <p className="font-semibold">{`${REVIVE_CONFIRMATION_TEXT}.`}</p>
      <p className="text-sm">{`${petName} dejará de figurar como fallecida y se borrará su fecha de fallecimiento.`}</p>
      <div className="flex flex-wrap gap-2">
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className="min-h-12 rounded-xl bg-primary px-4 py-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Confirmar y volver a Vivo
        </button>
        <Button variant="secondary" onClick={onCancel}>
          Mantener Fallecido
        </Button>
      </div>
    </div>
  );
}

/** Campo de biografía: una línea de hasta 280 caracteres con contador asociado por `aria-describedby` (REQ-BIO8-001, NFR-008-002). */
export function BiographyField({ id, value, onChange, errors }: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: Readonly<Record<string, string>>;
}): JSX.Element {
  const error = errors['biography'];
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const count = [...value].length; // puntos de código Unicode (como maxLength de JSON Schema), no unidades UTF-16 (O-2)
  const over = count > BIOGRAPHY_MAX_LENGTH;
  const errorText = error === undefined || !over ? error : BIOGRAPHY_TOO_LONG;
  // H-T1183-S2 (patrón H-T1122-S1): al enviar con error, el foco va al campo. Depende de `errors` (objeto nuevo en cada envío), no del texto: teclear no roba el foco.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (error !== undefined) inputRef.current?.focus();
  }, [errors]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        Biografía (opcional)
      </label>
      <input
        ref={inputRef}
        id={id}
        name="biography"
        type="text"
        value={value}
        autoComplete="off"
        aria-invalid={error === undefined && !over ? undefined : true}
        aria-describedby={error === undefined ? helpId : `${helpId} ${errorId}`}
        onChange={(e) => onChange('biography', e.target.value)}
        className="min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <p id={helpId} {...(over ? { role: 'status' } : {})} className={`text-sm ${over ? 'font-semibold text-red-800' : 'text-text-muted'}`}>
        {`${count} de ${BIOGRAPHY_MAX_LENGTH} caracteres. Solo texto, sin saltos de línea.`}
      </p>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm text-red-800">
          {errorText}
        </p>
      )}
    </div>
  );
}

export function PetForm({ profile, households = [], canAssign = false, onSubmit, onCancel }: {
  readonly profile: PetProfile | null;
  readonly households?: readonly HouseholdChoice[];
  readonly canAssign?: boolean;
  readonly onSubmit: (body: PetFormBody) => Promise<void>;
  readonly onCancel: () => void;
}): JSX.Element {
  // En el alta, `baseHouseholdId` vacío no se envía (formValues omite los vacíos). En edición no existe ese campo (UpdatePetInput).
  const initial = profile === null ? { ...petFormInitial(null), baseHouseholdId: '' } : petFormInitial(profile);
  // T1068: volver a Vivo pide confirmación; mientras no se confirme, `send` no llega a la API.
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const form = useContractForm({
    schema: profile === null ? 'CreatePetInput' : 'UpdatePetInput',
    initial,
    booleans: ['birthDateIsEstimate', 'neutered'],
    send: async (body) => {
      if (requiresReviveConfirmation(profile, String(body['lifeStatus'])) && !confirmed.current) {
        setAsking(true);
        return;
      }
      try {
        await onSubmit(petFormBody(profile, body));
      } finally {
        confirmed.current = false;
      }
    },
  });
  const onFormSubmit = (event: FormEvent): void => {
    if (asking && !confirmed.current) {
      event.preventDefault();
      return;
    }
    void form.onSubmit(event);
  };
  const confirmRevive = (): void => {
    confirmed.current = true;
    setAsking(false);
    formRef.current?.requestSubmit();
  };
  const onChange = (name: string, value: string): void => {
    form.onChange(name, value);
    if (name === 'lifeStatus') {
      setAsking(false);
      // El esquema exige `deceasedAt` nulo con ALIVE: al volver a Vivo la fecha se vacía en el formulario (el servidor la borra, REQ-FAL7-002).
      if (value === 'ALIVE') form.onChange('deceasedAt', '');
    }
    if (name === 'species' && value !== 'OTHER') form.onChange('speciesOther', '');
    if (name === 'species') {
      const fields = breedFieldsForSpecies(value);
      form.onChange('breedCode', fields.breedCode);
      form.onChange('breed', fields.breed);
    }
  };
  const prefix = profile === null ? 'new-pet' : `edit-pet-${profile.id}`;
  const species = form.values.species ?? 'CANINE';
  // REQ-RAZ-003: una mascota anterior (sin breedCode) de perro o gato conserva su texto como «Raza actual» mientras no cambie raza ni especie.
  const legacyBreed = profile !== null && profile.breedCode == null && hasBreedCatalog(species) && species === profile.species ? profile.breed : null;
  return (
    <form ref={formRef} noValidate aria-labelledby={`${prefix}-title`} onSubmit={onFormSubmit} className="grid gap-3 rounded border border-slate-300 bg-white p-4 sm:grid-cols-2">
      <h2 id={`${prefix}-title`} className="text-lg font-semibold sm:col-span-2">
        {profile === null ? 'Nueva mascota' : `Editar a ${profile.name}`}
      </h2>
      <TextField id={`${prefix}-name`} label="Nombre" name="name" required value={form.values.name ?? ''} onChange={form.onChange} errors={form.errors} />
      <SelectField
        id={`${prefix}-species`}
        label="Especie"
        name="species"
        value={form.values.species ?? 'CANINE'}
        options={SPECIES_ORDER.map((value) => ({ value, label: SPECIES_LABEL[value] }))}
        onChange={onChange}
        errors={form.errors}
      />
      {form.values.species === 'OTHER' ? (
        <TextField id={`${prefix}-speciesOther`} label="¿Qué especie?" name="speciesOther" required value={form.values.speciesOther ?? ''} onChange={form.onChange} errors={form.errors} />
      ) : null}
      {hasBreedCatalog(species) ? (
        <SelectField
          id={`${prefix}-breedCode`}
          label="Raza"
          name="breedCode"
          value={form.values.breedCode ?? ''}
          options={[...(legacyBreed === null ? [] : [{ value: '', label: `Raza actual: ${legacyBreed}` }]), ...breedChoices(species)]}
          onChange={form.onChange}
          errors={form.errors}
        />
      ) : null}
      {hasBreedCatalog(species) && !isOtherBreed(form.values.breedCode ?? '') ? null : (
        <TextField
          id={`${prefix}-breed`}
          label={hasBreedCatalog(species) ? 'Otra raza (opcional)' : 'Raza'}
          name="breed"
          required={!hasBreedCatalog(species)}
          value={form.values.breed ?? ''}
          onChange={form.onChange}
          errors={form.errors}
        />
      )}
      <TextField id={`${prefix}-birthDate`} label="Fecha de nacimiento" name="birthDate" type="date" required value={form.values.birthDate ?? ''} onChange={form.onChange} errors={form.errors} />
      <label htmlFor={`${prefix}-birthDateIsEstimate`} className="flex items-center gap-2 text-sm font-medium text-slate-800 sm:col-span-2">
        <input
          type="checkbox"
          id={`${prefix}-birthDateIsEstimate`}
          name="birthDateIsEstimate"
          checked={form.values.birthDateIsEstimate === 'true'}
          onChange={(e) => form.onChange('birthDateIsEstimate', String(e.currentTarget.checked))}
          className="h-4 w-4"
        />
        Fecha de nacimiento aproximada (estimada)
      </label>
      <SelectField
        id={`${prefix}-sex`}
        label="Sexo"
        name="sex"
        value={form.values.sex ?? 'MALE'}
        options={[
          { value: 'MALE', label: SEX_LABEL.MALE },
          { value: 'FEMALE', label: SEX_LABEL.FEMALE },
        ]}
        onChange={form.onChange}
        errors={form.errors}
      />
      <SelectField
        id={`${prefix}-neutered`}
        label="Esterilizado"
        name="neutered"
        value={form.values.neutered ?? ''}
        options={[
          { value: '', label: 'Sin dato' },
          { value: 'true', label: 'Sí' },
          { value: 'false', label: 'No' },
        ]}
        onChange={form.onChange}
        errors={form.errors}
      />
      <SelectField
        id={`${prefix}-lifeStatus`}
        label="Estado"
        name="lifeStatus"
        value={form.values.lifeStatus ?? 'ALIVE'}
        options={[
          { value: 'ALIVE', label: LIFE_STATUS_LABEL.ALIVE },
          { value: 'DECEASED', label: LIFE_STATUS_LABEL.DECEASED },
        ]}
        onChange={onChange}
        errors={form.errors}
      />
      {form.values.lifeStatus === 'DECEASED' ? (
        <TextField id={`${prefix}-deceasedAt`} label="Fecha de fallecimiento" name="deceasedAt" type="date" required value={form.values.deceasedAt ?? ''} onChange={form.onChange} errors={form.errors} />
      ) : null}
      {form.values.lifeStatus === 'DECEASED' && profile !== null ? (
        <p role="status" className="rounded-2xl border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950 sm:col-span-2">
          {DECEASED_LINKS_NOTICE}
        </p>
      ) : null}
      {profile === null ? null : <BiographyField id={`${prefix}-biography`} value={form.values.biography ?? ''} onChange={form.onChange} errors={form.errors} />}
      <TextField id={`${prefix}-microchipId`} label="Microchip (15 dígitos, opcional)" name="microchipId" value={form.values.microchipId ?? ''} onChange={form.onChange} errors={form.errors} />
      <TextField id={`${prefix}-avatarUrl`} label="URL del avatar (opcional)" name="avatarUrl" type="url" value={form.values.avatarUrl ?? ''} onChange={form.onChange} errors={form.errors} />
      <p id={`${prefix}-avatarUrl-help`} className="-mt-2 text-sm text-text-muted">
        La imagen de este enlace no se muestra como imagen en ARGOS: se abre como enlace en una pestaña nueva.
      </p>
      <AvatarExternalLink avatarUrl={form.values.avatarUrl} />
      {profile === null ? (
        <SelectField
          id={`${prefix}-baseHouseholdId`}
          label="Hogar base (opcional)"
          name="baseHouseholdId"
          value={form.values.baseHouseholdId ?? ''}
          options={[{ value: '', label: 'Sin hogar base' }, ...households.map((h) => ({ value: h.id, label: h.name }))]}
          onChange={form.onChange}
          errors={form.errors}
        />
      ) : null}
      {profile !== null && canAssign ? (
        <div className="sm:col-span-2">
          <PetAssignments petId={profile.id} />
        </div>
      ) : null}
      {asking && profile !== null ? <ReviveConfirmation petName={profile.name} onConfirm={confirmRevive} onCancel={() => {
          setAsking(false);
          form.onChange('lifeStatus', 'DECEASED');
          form.onChange('deceasedAt', profile.deceasedAt ?? '');
        }} /> : null}
      <div className="sm:col-span-2">
        <FormError errors={form.errors} message={form.message} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={form.busy || asking}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
