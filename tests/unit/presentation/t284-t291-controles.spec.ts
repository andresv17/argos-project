import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { petFormBody, petFormInitial, PetForm, SPECIES_ORDER } from '../../../src/presentation/web/components/PetForm.tsx';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { petTransferCandidates, petTransferNotice } from '../../../src/presentation/web/components/TransferOwnership.tsx';
import { PreviewSummary } from '../../../src/presentation/web/pages/BackupPage.tsx';
import { HouseholdCard, transferHouseholdText } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { RECORD_MODULES } from '../../../src/presentation/web/records.ts';
import { formValues, validateInput } from '../../../src/presentation/web/validation.ts';
import { canChangeRole, canTransferHousehold, plural, SPECIES_LABEL } from '../../../src/presentation/web/view-model.ts';
import { dashboard, household, ME, OTHER, profile } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const BASE = { name: 'Kiwi', breed: 'Mestizo', birthDate: '2020-05-01', sex: 'MALE' };

describe('T284 PetForm: 8 especies y campos de REQ-PET2-001', () => {
  it('[REQ-PET2-001][SC-001] el selector ofrece exactamente las 8 especies del contrato, con su etiqueta', () => {
    const markup = html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }));
    const values = [...markup.matchAll(/<option value="([A-Z_]+)"/g)].map((m) => m[1]);
    expect(SPECIES_ORDER).toEqual(['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER']);
    expect(Object.keys(SPECIES_LABEL).sort()).toEqual([...SPECIES_ORDER].sort());
    expect(values.filter((v) => (SPECIES_ORDER as readonly (string | undefined)[]).includes(v))).toEqual([...SPECIES_ORDER]);
    expect(SPECIES_ORDER.every((s) => markup.includes(`>${SPECIES_LABEL[s]}<`))).toBe(true);
  });

  it('[REQ-PET2-001] el alta trae birthDateIsEstimate, neutered y microchipId con los nombres del contrato, y no muestra speciesOther con CANINE', () => {
    const markup = html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }));
    expect(['new-pet-birthDateIsEstimate', 'new-pet-neutered', 'new-pet-microchipId'].map((id) => markup.includes(`id="${id}"`))).toEqual([true, true, true]);
    expect(['name="birthDateIsEstimate"', 'name="neutered"', 'name="microchipId"'].map((n) => markup.includes(n))).toEqual([true, true, true]);
    expect(markup.includes('speciesOther')).toBe(false);
  });

  it('[INV-PET2-001] al editar una mascota OTHER aparece speciesOther con su valor; con otra especie no', () => {
    const other = html(h(PetForm, { profile: profile('p1', 'Puas', ME, 'OTHER'), onSubmit: asyncNoop, onCancel: noop }));
    const dog = html(h(PetForm, { profile: profile('p2', 'Argos'), onSubmit: asyncNoop, onCancel: noop }));
    expect([other.includes('name="speciesOther"'), other.includes('value="Erizo"'), dog.includes('name="speciesOther"')]).toEqual([true, true, false]);
  });

  it('[REQ-PET2-001] los valores iniciales de la edición reflejan el perfil (booleanos como texto, nulos como vacío)', () => {
    const p = { ...profile('p3', 'Luna'), birthDateIsEstimate: true, neutered: false, microchipId: '985112345678901' };
    expect(petFormInitial(p)).toMatchObject({ birthDateIsEstimate: 'true', neutered: 'false', microchipId: '985112345678901', speciesOther: '' });
    expect(petFormInitial(null)).toMatchObject({ species: 'CANINE', birthDateIsEstimate: 'false', neutered: '', microchipId: '', speciesOther: '' });
  });

  it('[REQ-PET2-001] formValues convierte booleans a boolean real y omite vacíos; el contrato acepta los nuevos campos y rechaza un microchip de 14 dígitos', () => {
    const body = formValues({ ...BASE, species: 'RABBIT', birthDateIsEstimate: 'true', neutered: 'false', microchipId: '985112345678901', speciesOther: '' }, [], ['birthDateIsEstimate', 'neutered']);
    expect(body).toMatchObject({ birthDateIsEstimate: true, neutered: false, microchipId: '985112345678901' });
    expect('speciesOther' in body).toBe(false);
    expect(validateInput('CreatePetInput', body)).toEqual({});
    expect(Object.keys(validateInput('CreatePetInput', { ...body, microchipId: '98511234567890' }))).toEqual(['microchipId']);
    expect(validateInput('CreatePetInput', { ...body, species: 'OTHER', speciesOther: 'Erizo' })).toEqual({});
  });

  it('[INV-PET2-001] petFormBody quita speciesOther si la especie no es OTHER y no inventa nulos en el alta', () => {
    expect(petFormBody(null, { ...BASE, species: 'FELINE', speciesOther: 'Erizo' })).toEqual({ ...BASE, species: 'FELINE' });
    expect(petFormBody(null, { ...BASE, species: 'OTHER', speciesOther: 'Erizo' })).toEqual({ ...BASE, species: 'OTHER', speciesOther: 'Erizo' });
  });

  it('[REQ-PET2-001] en la edición, vaciar un campo anulable que tenía valor envía null; si ya era nulo, no se envía', () => {
    const had = { ...profile('p4', 'Puas', ME, 'OTHER'), neutered: true, microchipId: '985112345678901' };
    expect(petFormBody(had, { ...BASE, species: 'CANINE' })).toEqual({ ...BASE, species: 'CANINE', speciesOther: null, neutered: null, microchipId: null });
    expect(petFormBody(profile('p5', 'Argos'), { ...BASE, species: 'CANINE' })).toEqual({ ...BASE, species: 'CANINE' });
    expect(petFormBody(had, { ...BASE, species: 'OTHER', speciesOther: 'Erizo', neutered: true, microchipId: '985112345678901' })).toEqual({ ...BASE, species: 'OTHER', speciesOther: 'Erizo', neutered: true, microchipId: '985112345678901' });
  });
});

describe('T291 transferencias y cambio de rol', () => {
  it('[REQ-OWN-001] «Transferir propiedad» de la mascota solo aparece con permissions.transferPetOwnership y con el manejador de la página', () => {
    const owner = dashboard('OWNER');
    const props = { activeTab: 'weights' as const, onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop };
    const withIt = html(h(PetDashboard, { ...props, dashboard: owner, onTransfer: noop }));
    const noHandler = html(h(PetDashboard, { ...props, dashboard: owner }));
    const admin = html(h(PetDashboard, { ...props, dashboard: dashboard('ADMIN', 'OWNER_COLOR_2'), onTransfer: noop }));
    expect([withIt.includes('>Transferir propiedad<'), noHandler.includes('>Transferir propiedad<'), admin.includes('>Transferir propiedad<')]).toEqual([true, false, false]);
  });

  it('[REQ-OWN-001][SC-016] los candidatos son miembros ACTIVE de hogares con la mascota, sin el dueño ni repetidos; el aviso pluraliza las podas', () => {
    const casa = household('OWNER');
    const other = { ...household('OWNER'), household: { ...casa.household, id: 'h-otro' } };
    expect(petTransferCandidates([casa, other], new Set([casa.household.id, 'h-otro']), ME)).toEqual([{ userId: OTHER, label: 'María (@maria)' }]);
    expect(petTransferCandidates([casa], new Set(), ME)).toEqual([]);
    expect([petTransferNotice('Argos', 0), petTransferNotice('Argos', 1), petTransferNotice('Argos', 2)]).toEqual([
      'Propiedad de Argos transferida.',
      'Propiedad de Argos transferida. Se retiró 1 asignación a hogares donde el nuevo dueño no es miembro.',
      'Propiedad de Argos transferida. Se retiró 2 asignaciones a hogares donde el nuevo dueño no es miembro.',
    ]);
  });

  it('[REQ-HOUSE2-002][STATE-HOUSE-MEMBERSHIP-001] reglas de visibilidad: propietario cambia rol y transfiere; ADMIN cambia roles ajenos, no transfiere; Cuidador y Lector nada; nadie toca al propietario', () => {
    const [owner, admin, caregiver] = [household('OWNER'), household('ADMIN'), household('CAREGIVER')];
    const [ownerRow, mariaRow] = [owner.members[0]!, owner.members[1]!];
    expect([
      canChangeRole(owner, mariaRow, ME), canChangeRole(owner, ownerRow, ME), canTransferHousehold(owner, mariaRow, ME), canTransferHousehold(owner, ownerRow, ME),
      canChangeRole(admin, admin.members[0]!, OTHER), canChangeRole(admin, admin.members[1]!, OTHER), canTransferHousehold(admin, admin.members[0]!, OTHER),
      canChangeRole(caregiver, caregiver.members[0]!, OTHER), canTransferHousehold(caregiver, caregiver.members[0]!, OTHER),
    ]).toEqual([true, false, true, false, false, false, false, false, false]);
    const left = { ...mariaRow, membership: { ...mariaRow.membership, status: 'LEFT' as const } };
    expect([canChangeRole(owner, left, ME), canTransferHousehold(owner, left, ME)]).toEqual([false, false]);
  });

  it('[REQ-HOUSE2-002] la tarjeta del hogar muestra el selector de rol (con los 3 roles) y «Transferir propiedad» al propietario solo si la página pasa los manejadores', () => {
    const view = household('OWNER');
    const full = html(h(HouseholdCard, { view, myUserId: ME, onMemberAction: noop, onDelete: noop, inviteForm: null, onChangeRole: noop, onTransferOwnership: noop }));
    const bare = html(h(HouseholdCard, { view, myUserId: ME, onMemberAction: noop, onDelete: noop, inviteForm: null }));
    const reader = html(h(HouseholdCard, { view: household('READER'), myUserId: OTHER, onMemberAction: noop, onDelete: noop, inviteForm: null, onChangeRole: noop, onTransferOwnership: noop }));
    expect([full.includes('aria-label="Rol de María"'), full.includes('<option value="CAREGIVER" selected="">Cuidador</option>'), ['Administrador', 'Lector'].every((r) => full.includes(`>${r}</option>`)), full.includes('aria-label="Rol de Andrés"'), (full.match(/>Transferir propiedad</g) ?? []).length]).toEqual([true, true, true, false, 1]);
    expect([bare.includes('aria-label="Rol de'), bare.includes('>Transferir propiedad<'), reader.includes('aria-label="Rol de'), reader.includes('>Transferir propiedad<')]).toEqual([false, false, false, false]);
  });

  it('[INV-HOUSE2-001] el aviso de transferencia nombra al destino y recuerda que el anterior conserva ADMIN', () => {
    const view = household('OWNER');
    expect(transferHouseholdText(view, OTHER)).toBe('¿Transferir la propiedad del hogar Casa a María? Conservarás el rol de Administrador.');
    expect(transferHouseholdText(view, 'desconocido')).toContain('el miembro elegido');
  });
});

describe('O-6 y O-4', () => {
  it('[REQ-REC2-002] «Próximo refuerzo» es opcional: sin asterisco ni required, el contrato acepta la vacuna sin él y la ficha no imprime «null»', () => {
    const spec = RECORD_MODULES.find((m) => m.id === 'vaccinations')!;
    expect(spec.fields.find((f) => f.name === 'nextBoosterAt')?.required).toBe(false);
    const markup = html(h(RecordForm, { spec, onSubmit: asyncNoop }));
    // 007: las fechas son un `fieldset` (id del campo) con su `legend`; el asterisco decorativo va dentro de la leyenda.
    const labelOf = (name: string): string => markup.slice(markup.indexOf(`id="vaccinations-${name}"`), markup.indexOf('</legend>', markup.indexOf(`id="vaccinations-${name}"`)));
    expect([labelOf('nextBoosterAt').includes('*'), labelOf('appliedAt').includes('*')]).toEqual([false, true]);
    expect(validateInput('CreateVaccinationInput', formValues({ vaccineName: 'Rabia', appliedAt: '2026-01-01', nextBoosterAt: '' }))).toEqual({});
    const base = dashboard('OWNER');
    const withNull = { ...base, vaccinations: [{ ...base.vaccinations[0]!, record: { ...base.vaccinations[0]!.record, nextBoosterAt: null } }] };
    const shown = html(h(PetDashboard, { dashboard: withNull, activeTab: 'vaccinations', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect([shown.includes('refuerzo null'), shown.includes('aplicada 2025-01-01')]).toEqual([false, true]);
  });

  it('[REQ-BACKUP2-002] la previsualización usa singular con 1 y plural con otra cantidad', () => {
    const preview = (pets: number, replaced: number, same: number, sharedPets: number, houses: number) =>
      ({ sourceSchemaVersion: '3.0.0', counts: { pets, weights: 0, bodyMeasurements: 0, vaccinations: 0, dewormings: 0, medicalVisits: 0, customParameters: 0 }, collisions: { petsReplacedCount: replaced, sameIdPetsCount: same }, affectedSharedPets: { petsCount: sharedPets, householdsCount: houses }, fileDigest: 'x' }) as never;
    const one = html(h(PreviewSummary, { preview: preview(1, 1, 1, 1, 1) }));
    const many = html(h(PreviewSummary, { preview: preview(3, 2, 2, 2, 2) }));
    expect([plural(1, 'mascota', 'mascotas'), plural(0, 'mascota', 'mascotas')]).toEqual(['1 mascota', '0 mascotas']);
    expect(one).toContain('el archivo trae 1 mascota.');
    expect(one).toContain('Se reemplazarán 1 mascota propia actual; 1 coincide por identificador.');
    expect(one).toContain('1 mascota compartida perderá su asignación en 1 hogar.');
    expect(many).toContain('el archivo trae 3 mascotas.');
    expect(many).toContain('Se reemplazarán 2 mascotas propias actuales; 2 coinciden por identificador.');
    expect(many).toContain('2 mascotas compartidas perderán su asignación en 2 hogares.');
  });
});
