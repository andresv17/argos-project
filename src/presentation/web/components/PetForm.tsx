/**
 * Alta y edición del perfil de una mascota propia (REQ-PET-001). La edición solo se ofrece si `canEdit`.
 *
 * @implements REQ-UI-002, REQ-UI-004, REQ-UI-007
 */
import { Button, FormError, SelectField, TextField } from './Field.tsx';
import { SEX_LABEL, SPECIES_LABEL, type PetProfile } from '../view-model.ts';
import { useContractForm } from '../use-contract-form.ts';

export function petFormInitial(profile: PetProfile | null): Record<string, string> {
  return {
    name: profile?.name ?? '',
    species: profile?.species ?? 'DOG',
    breed: profile?.breed ?? '',
    birthDate: profile?.birthDate ?? '',
    sex: profile?.sex ?? 'MALE',
    avatarUrl: profile?.avatarUrl ?? '',
  };
}

export function PetForm({ profile, onSubmit, onCancel }: {
  readonly profile: PetProfile | null;
  readonly onSubmit: (body: Record<string, string | number>) => Promise<void>;
  readonly onCancel: () => void;
}): JSX.Element {
  const form = useContractForm({ schema: profile === null ? 'CreatePetInput' : 'UpdatePetInput', initial: petFormInitial(profile), send: onSubmit });
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
        options={[
          // T284 PENDIENTE: las 8 especies de la 002 (y speciesOther) llegan con la pantalla nueva.
          { value: 'CANINE', label: SPECIES_LABEL.CANINE },
          { value: 'FELINE', label: SPECIES_LABEL.FELINE },
        ]}
        onChange={form.onChange}
        errors={form.errors}
      />
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
      <TextField id={`${prefix}-avatarUrl`} label="URL del avatar (opcional)" name="avatarUrl" type="url" value={form.values.avatarUrl ?? ''} onChange={form.onChange} errors={form.errors} />
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
