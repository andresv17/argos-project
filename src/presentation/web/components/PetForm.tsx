/**
 * Alta y edición del perfil de una mascota propia (REQ-PET-001). La edición solo se ofrece si `canEdit`.
 *
 * @implements REQ-UI-002, REQ-UI-004, REQ-UI-007
 */
import { Button, FormError, SelectField, TextField } from './Field.tsx';
import { PetAssignments } from './PetAssignments.tsx';
import { SEX_LABEL, SPECIES_LABEL, type PetProfile, type Species } from '../view-model.ts';
import { useContractForm } from '../use-contract-form.ts';
import type { FormBody } from '../validation.ts';

/** Cuerpo que sale del formulario: igual que `FormBody` pero con `null` para vaciar un campo anulable en la edición. */
export type PetFormBody = Record<string, string | number | boolean | null>;

/** Las 8 especies aprobadas (REQ-PET2-001, INV-PET2-001), en el orden del contrato. */
export const SPECIES_ORDER: readonly Species[] = ['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'];

const NULLABLE_FIELDS = ['speciesOther', 'neutered', 'microchipId'] as const;

/** Hogares del usuario que el alta puede usar como hogar base (REQ-HOUSE2-003). */
export interface HouseholdChoice {
  readonly id: string;
  readonly name: string;
}

export function petFormInitial(profile: PetProfile | null): Record<string, string> {
  return {
    name: profile?.name ?? '',
    species: profile?.species ?? 'CANINE',
    breed: profile?.breed ?? '',
    birthDate: profile?.birthDate ?? '',
    sex: profile?.sex ?? 'MALE',
    avatarUrl: profile?.avatarUrl ?? '',
    speciesOther: profile?.speciesOther ?? '',
    birthDateIsEstimate: String(profile?.birthDateIsEstimate ?? false),
    neutered: profile?.neutered == null ? '' : String(profile.neutered),
    microchipId: profile?.microchipId ?? '',
  };
}

/**
 * Cuerpo a enviar: `speciesOther` solo con OTHER (INV-PET2-001) y, en la edición, un campo anulable que la persona dejó
 * vacío y que antes tenía valor se envía `null` (UpdatePetInput lo admite), porque un campo ausente conservaría el anterior.
 */
export function petFormBody(profile: PetProfile | null, body: FormBody): PetFormBody {
  const out: PetFormBody = { ...body };
  if (out['species'] !== 'OTHER') delete out['speciesOther'];
  if (profile !== null) {
    for (const key of NULLABLE_FIELDS) {
      if (out[key] === undefined && profile[key] != null) out[key] = null;
    }
  }
  return out;
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
  const form = useContractForm({ schema: profile === null ? 'CreatePetInput' : 'UpdatePetInput', initial, booleans: ['birthDateIsEstimate', 'neutered'], send: (body) => onSubmit(petFormBody(profile, body)) });
  const onChange = (name: string, value: string): void => {
    form.onChange(name, value);
    if (name === 'species' && value !== 'OTHER') form.onChange('speciesOther', '');
  };
  const prefix = profile === null ? 'new-pet' : `edit-pet-${profile.id}`;
  return (
    <form noValidate aria-labelledby={`${prefix}-title`} onSubmit={(e) => void form.onSubmit(e)} className="grid gap-3 rounded border border-slate-300 bg-white p-4 sm:grid-cols-2">
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
      <TextField id={`${prefix}-breed`} label="Raza" name="breed" required value={form.values.breed ?? ''} onChange={form.onChange} errors={form.errors} />
      <TextField id={`${prefix}-birthDate`} label="Fecha de nacimiento" name="birthDate" type="date" required value={form.values.birthDate ?? ''} onChange={form.onChange} errors={form.errors} />
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
      <label htmlFor={`${prefix}-birthDateIsEstimate`} className="flex items-center gap-2 text-sm font-medium text-slate-800 sm:col-span-2">
        <input
          type="checkbox"
          id={`${prefix}-birthDateIsEstimate`}
          name="birthDateIsEstimate"
          checked={form.values.birthDateIsEstimate === 'true'}
          onChange={(e) => form.onChange('birthDateIsEstimate', String(e.currentTarget.checked))}
          className="h-4 w-4"
        />
        Es una fecha estimada
      </label>
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
      <TextField id={`${prefix}-microchipId`} label="Microchip (15 dígitos, opcional)" name="microchipId" value={form.values.microchipId ?? ''} onChange={form.onChange} errors={form.errors} />
      <TextField id={`${prefix}-avatarUrl`} label="URL del avatar (opcional)" name="avatarUrl" type="url" value={form.values.avatarUrl ?? ''} onChange={form.onChange} errors={form.errors} />
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
      <div className="sm:col-span-2">
        <FormError errors={form.errors} message={form.message} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={form.busy}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
