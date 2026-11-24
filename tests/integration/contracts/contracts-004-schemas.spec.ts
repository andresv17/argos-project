/**
 * T510: esquemas de la feature 004 (delta 3.1.0 sobre la 002). Los contratos de la 002 no se editan (INV-ARCH-003).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCHEMAS_DIR = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts/schemas');
const BASE = 'https://argos.local/contracts/schemas';

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, strictTypes: true, allowUnionTypes: true, allErrors: true, multipleOfPrecision: 10 });
  addFormats(ajv);
  for (const keyword of ['x-sdd-metadata', 'x-sdd-status', 'x-sdd-error', '$anchor']) ajv.addKeyword(keyword);
  for (const file of readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), 'utf8')) as { $id: string };
    ajv.addSchema(doc, doc.$id);
  }
  return ajv;
}

const ajv = buildAjv();
const check = (file: string, def: string): ValidateFunction => {
  const fn = ajv.getSchema(`${BASE}/${file}.schema.json#/$defs/${def}`);
  if (!fn) throw new Error(`def ausente ${file}#${def}`);
  return fn;
};
const meta = (file: string): { version: string; status: string } =>
  (JSON.parse(readFileSync(join(SCHEMAS_DIR, `${file}.schema.json`), 'utf8')) as { 'x-sdd-metadata': { version: string; status: string } })['x-sdd-metadata'];

const UUID = '0b6f3c2e-8a4d-4c1b-9e3f-1a2b3c4d5e6f';
const TS = '2026-11-17T10:00:00.000Z';
const petBase = { name: 'Luna', species: 'CANINE', sex: 'FEMALE', birthDate: '2020-01-01' };

describe('T510 pet: raza, avatar y microchip', () => {
  it('REQ-RAZ-003: CreatePetInput acepta breedCode del catálogo y breed pasa a opcional', () => {
    const create = check('pet', 'CreatePetInput');
    expect(create({ ...petBase, breedCode: 'DOG_AKITA' })).toBe(true);
    expect(create({ ...petBase, breed: 'Akita', breedCode: 'DOG_AKITA' })).toBe(true);
    expect(create({ ...petBase, breed: 'Mestizo' })).toBe(true);
    expect(create({ ...petBase })).toBe(false);
  });

  it('INV-RAZ-001: breedCode exige el patrón único y el prefijo de la especie', () => {
    const create = check('pet', 'CreatePetInput');
    expect(create({ ...petBase, breedCode: 'CAT_SIAMES' })).toBe(false);
    expect(create({ ...petBase, breedCode: 'dog_akita' })).toBe(false);
    expect(create({ ...petBase, breedCode: 'BIRD_LORO' })).toBe(false);
    expect(create({ ...petBase, species: 'FELINE', breedCode: 'CAT_SIAMES' })).toBe(true);
    expect(create({ ...petBase, species: 'RABBIT', breed: 'Enano', breedCode: 'DOG_AKITA' })).toBe(false);
  });

  it('REQ-RAZ-003: UpdatePetInput acepta breedCode', () => {
    const update = check('pet', 'UpdatePetInput');
    expect(update({ breedCode: 'DOG_AKITA' })).toBe(true);
    expect(update({ breedCode: 'XX_AKITA' })).toBe(false);
  });

  it('REQ-AVA-001: avatarVersion es solo lectura: se devuelve en PetProfile y no se acepta como entrada', () => {
    const create = check('pet', 'CreatePetInput');
    const update = check('pet', 'UpdatePetInput');
    expect(create({ ...petBase, breedCode: 'DOG_AKITA', avatarVersion: 1 })).toBe(false);
    expect(update({ avatarVersion: 2 })).toBe(false);
    const profile = {
      id: UUID, ownerUserId: UUID, name: 'Luna', species: 'CANINE', speciesOther: null, breed: 'Akita', breedCode: 'DOG_AKITA',
      birthDate: '2020-01-01', birthDateIsEstimate: false, sex: 'FEMALE', neutered: null, microchipId: null, avatarUrl: null,
      avatarVersion: 3, createdAt: TS, updatedAt: TS,
    };
    const valid = check('pet', 'PetProfile');
    expect(valid(profile)).toBe(true);
    expect(valid({ ...profile, avatarVersion: null })).toBe(true);
    expect(valid({ ...profile, avatarVersion: 0 })).toBe(false);
    expect(valid({ ...profile, breedCode: null })).toBe(true);
    const { avatarVersion: _omit, ...sinVersion } = profile;
    expect(valid(sinVersion)).toBe(false);
  });

  it('REQ-PET4-002: microchipId rechaza 15 dígitos iguales y secuencias consecutivas módulo 10', () => {
    const create = check('pet', 'CreatePetInput');
    const withChip = (microchipId: string | null): boolean => create({ ...petBase, breedCode: 'DOG_AKITA', microchipId }) as boolean;
    expect(withChip('985112345678901')).toBe(true);
    expect(withChip(null)).toBe(true);
    for (const trivial of ['000000000000000', '111111111111111', '123456789012345', '987654321098765', '456789012345678']) {
      expect(withChip(trivial), trivial).toBe(false);
    }
    expect(withChip('98511234567890')).toBe(false);
    expect(check('pet', 'UpdatePetInput')({ microchipId: '999999999999999' })).toBe(false);
  });
});

describe('T510 registros médicos', () => {
  it('REQ-MDC-001: medidas corporales de entrada en centímetros enteros; el registro conserva 0.01 para datos antiguos', () => {
    for (const def of ['CreateBodyMeasurementInput', 'UpdateBodyMeasurementInput']) {
      const fn = check('medical-records', def);
      const base = def.startsWith('Update') ? { collection: 'measurements' } : { recordedAt: '2026-11-01' };
      const full = { ...base, recordedAt: '2026-11-01', neckCm: 35, chestCm: 60, backLengthCm: 45, waistCm: 50 };
      expect(fn(full), def).toBe(true);
      expect(fn({ ...full, neckCm: 35.5 }), def).toBe(false);
      expect(fn({ ...full, waistCm: 50.01 }), def).toBe(false);
    }
    const record = {
      id: UUID, petId: UUID, recordedAt: '2026-11-01', neckCm: 35.55, chestCm: 60, backLengthCm: 45, waistCm: 50, notes: null,
      createdAt: TS, revision: 0,
    };
    expect(check('medical-records', 'BodyMeasurementRecord')(record)).toBe(true);
  });

  it('REQ-SIN-001: SYMPTOM exige symptomType y severity; otra categoría los exige nulos', () => {
    const create = check('medical-records', 'CreateCustomParameterInput');
    const base = { recordedAt: '2026-11-01', title: 'Vómito', description: 'Una vez tras comer' };
    expect(create({ ...base, category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MILD' })).toBe(true);
    expect(create({ ...base, category: 'SYMPTOM' })).toBe(false);
    expect(create({ ...base, category: 'SYMPTOM', symptomType: 'FEVER', severity: 'MILD' })).toBe(false);
    expect(create({ ...base, category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'CRITICAL' })).toBe(false);
    expect(create({ ...base, category: 'ALLERGY' })).toBe(true);
    expect(create({ ...base, category: 'ALLERGY', symptomType: null, severity: null })).toBe(true);
    expect(create({ ...base, category: 'ALLERGY', symptomType: 'VOMIT', severity: 'MILD' })).toBe(false);
  });

  it('INV-SIN-001: el registro y la edición de SYMPTOM mantienen el catálogo cerrado', () => {
    const record = {
      id: UUID, petId: UUID, recordedAt: '2026-11-01', category: 'SYMPTOM', symptomType: 'STOOL', severity: 'SEVERE',
      title: 'Heces', description: 'Líquidas', notes: null, createdAt: TS, revision: 2,
    };
    const valid = check('medical-records', 'CustomParameterRecord');
    expect(valid(record)).toBe(true);
    expect(valid({ ...record, symptomType: null })).toBe(false);
    expect(valid({ ...record, category: 'OTHER' })).toBe(false);
    expect(valid({ ...record, category: 'OTHER', symptomType: null, severity: null })).toBe(true);
    const update = check('medical-records', 'UpdateCustomParameterInput');
    expect(update({ collection: 'custom-parameters', symptomType: 'ENERGY' })).toBe(true);
    expect(update({ collection: 'custom-parameters', category: 'SYMPTOM', symptomType: 'ENERGY', severity: 'MILD' })).toBe(true);
    expect(update({ collection: 'custom-parameters', category: 'SYMPTOM' })).toBe(false);
  });

  it('REQ-BOR-005: revision es obligatoria y de solo lectura en los 6 registros y no se acepta como entrada', () => {
    const weight = { id: UUID, petId: UUID, recordedAt: '2026-11-01', weightKg: 12.5, notes: null, createdAt: TS };
    const record = check('medical-records', 'WeightRecord');
    expect(record({ ...weight, revision: 0 })).toBe(true);
    expect(record({ ...weight, revision: -1 })).toBe(false);
    expect(record(weight)).toBe(false);
    expect(check('medical-records', 'CreateWeightInput')({ recordedAt: '2026-11-01', weightKg: 12.5, revision: 1 })).toBe(false);
    expect(check('medical-records', 'UpdateWeightInput')({ collection: 'weights', weightKg: 12, revision: 1 })).toBe(false);
    for (const def of ['WeightRecord', 'BodyMeasurementRecord', 'VaccinationRecord', 'DewormingRecord', 'MedicalVisitRecord', 'CustomParameterRecord']) {
      const schema = ajv.getSchema(`${BASE}/medical-records.schema.json#/$defs/${def}`)?.schema as {
        required: string[];
        properties: { revision: { type: string; minimum: number; readOnly: boolean } };
      };
      expect(schema.required, def).toContain('revision');
      expect(schema.properties.revision, def).toEqual(expect.objectContaining({ type: 'integer', minimum: 0, readOnly: true }));
    }
  });
});

describe('T510 identidad y auditoría', () => {
  it('REQ-LOG-002: Username admite mayúsculas y conserva el rango 3-30', () => {
    const username = check('identity', 'Username');
    expect(username('Andres.Vallejo')).toBe(true);
    expect(username('ab')).toBe(false);
    expect(username('bad name')).toBe(false);
  });

  it('REQ-LOG-001: LoginInput acepta usuario o correo de hasta 254 caracteres', () => {
    const login = check('identity', 'LoginInput');
    const correo = `${'a'.repeat(242)}@ejemplo.com`;
    expect(correo).toHaveLength(254);
    expect(login({ username: correo, password: 'x' })).toBe(true);
    expect(login({ username: `${correo}z`, password: 'x' })).toBe(false);
  });

  it('REQ-GCS-005: AuditEntityType incluye PET_MEDIA', () => {
    const type = check('audit-entry', 'AuditEntityType');
    expect(type('PET_MEDIA')).toBe(true);
    expect(type('PET_GALLERY')).toBe(false);
  });
});

describe('T510 medios (esquema nuevo)', () => {
  const item = { id: UUID, petId: UUID, kind: 'PHOTO', mime: 'image/png', sizeBytes: 2048, originalName: 'foto.png', createdAt: TS };

  it('REQ-ARC-001: MediaItem es cerrado, sin objectKey ni autoría, con lista cerrada de tipos y tope de 10 MiB', () => {
    const valid = check('media', 'MediaItem');
    expect(valid(item)).toBe(true);
    expect(valid({ ...item, kind: 'FILE', mime: 'application/pdf' })).toBe(true);
    expect(valid({ ...item, objectKey: 'a/b' })).toBe(false);
    expect(valid({ ...item, uploadedByUserId: UUID })).toBe(false);
    expect(valid({ ...item, mime: 'image/svg+xml' })).toBe(false);
    expect(valid({ ...item, mime: 'text/plain' })).toBe(false);
    expect(valid({ ...item, sizeBytes: 0 })).toBe(false);
    expect(valid({ ...item, sizeBytes: 10_485_760 })).toBe(true);
    expect(valid({ ...item, sizeBytes: 10_485_761 })).toBe(false);
    expect(valid({ ...item, originalName: 'x'.repeat(121) })).toBe(false);
    expect(valid({ ...item, originalName: '' })).toBe(false);
  });

  it('REQ-ARC-003: MediaAccess no tiene disposition y la url es https', () => {
    const valid = check('media', 'MediaAccess');
    const access = { url: 'https://bucket.storage.googleapis.com/o?X-Goog-Signature=ab', expiresAt: TS, mime: 'image/jpeg' };
    expect(valid(access)).toBe(true);
    expect(valid({ ...access, disposition: 'ATTACHMENT' })).toBe(false);
    expect(valid({ ...access, url: 'http://insegura.example/x' })).toBe(false);
  });

  it('REQ-ALB-001: MediaPage pagina de 24 en 24', () => {
    const valid = check('media', 'MediaPage');
    expect(valid({ items: [item], page: 1, pageSize: 24, total: 1 })).toBe(true);
    expect(valid({ items: [item], page: 1, pageSize: 25, total: 1 })).toBe(false);
    expect(valid({ items: [item], page: 0, pageSize: 24, total: 1 })).toBe(false);
    expect(valid({ items: Array.from({ length: 25 }, () => item), page: 1, pageSize: 24, total: 25 })).toBe(false);
  });

  it('REQ-AVA-001: la respuesta de putAvatar trae avatarVersion >= 1', () => {
    const valid = check('media', 'AvatarVersionResult');
    expect(valid({ avatarVersion: 1 })).toBe(true);
    expect(valid({ avatarVersion: 0 })).toBe(false);
  });
});

describe('T510 respaldo 3.1.0', () => {
  const pet = {
    id: UUID, name: 'Luna', species: 'CANINE', speciesOther: null, breed: 'Akita', breedCode: 'DOG_AKITA', birthDate: '2020-01-01',
    birthDateIsEstimate: false, sex: 'FEMALE', neutered: null, microchipId: null, avatarUrl: null, createdAt: TS, updatedAt: TS,
  };
  const records = { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] };
  const envelope = { schemaVersion: '3.1.0', exportedAt: TS, pets: [pet], records };

  it('REQ-IMP-001: BackupEnvelopeV31 exige schemaVersion 3.1.0 y mascotas con breedCode sin avatarVersion', () => {
    const valid = check('backup-envelope', 'BackupEnvelopeV31');
    expect(valid(envelope)).toBe(true);
    expect(valid({ ...envelope, schemaVersion: '3.0.0' })).toBe(false);
    expect(valid({ ...envelope, pets: [{ ...pet, avatarVersion: 1 }] })).toBe(false);
    const { breedCode: _omit, ...sinRaza } = pet;
    expect(valid({ ...envelope, pets: [sinRaza] })).toBe(false);
  });

  it('REQ-BOR-005: los registros del respaldo 3.1.0 no llevan revision y aceptan SYMPTOM', () => {
    const valid = check('backup-envelope', 'BackupEnvelopeV31');
    const symptom = {
      id: UUID, petId: UUID, recordedAt: '2026-11-01', category: 'SYMPTOM', symptomType: 'APPETITE', severity: 'MODERATE',
      title: 'Apetito', description: 'Come poco', notes: null, createdAt: TS,
    };
    const withSymptom = { ...envelope, records: { ...records, customParameters: [symptom] } };
    expect(valid(withSymptom)).toBe(true);
    expect(valid({ ...withSymptom, records: { ...records, customParameters: [{ ...symptom, revision: 0 }] } })).toBe(false);
  });

  it('REQ-IMP-001: el respaldo 3.0.0 sigue aceptándose por el sobre raíz con sus registros sin symptom ni revision', () => {
    const legacyPet = { ...pet };
    delete (legacyPet as Partial<typeof pet>).breedCode;
    const root = ajv.getSchema(`${BASE}/backup-envelope.schema.json`) as ValidateFunction;
    expect(root({ ...envelope, schemaVersion: '3.0.0', pets: [legacyPet] })).toBe(true);
    expect(root(envelope)).toBe(true);
    expect(check('backup-envelope', 'BackupEnvelopeV3')({ ...envelope, schemaVersion: '3.0.0', pets: [pet] })).toBe(false);
  });

  it('REQ-IMP-001: ImportPreviewResult añade mediaToDeleteCount y acepta 3.1.0 como origen', () => {
    const valid = check('backup-envelope', 'ImportPreviewResult');
    const preview = {
      sourceSchemaVersion: '3.1.0', fileDigest: 'a'.repeat(64),
      counts: { pets: 1, weights: 0, bodyMeasurements: 0, vaccinations: 0, dewormings: 0, medicalVisits: 0, customParameters: 0 },
      collisions: { petsReplacedCount: 0, sameIdPetsCount: 0 }, affectedSharedPets: { petsCount: 0, householdsCount: 0 },
      mediaToDeleteCount: 4,
    };
    expect(valid(preview)).toBe(true);
    expect(valid({ ...preview, mediaToDeleteCount: -1 })).toBe(false);
    const { mediaToDeleteCount: _omit, ...sin } = preview;
    expect(valid(sin)).toBe(false);
  });
});

describe('T510 metadatos', () => {
  it('REQ-RAZ-003: los esquemas modificados pasan a 3.1.0 MINOR en DRAFT y media nace en 1.0.0', () => {
    for (const file of ['pet', 'medical-records', 'identity', 'audit-entry', 'backup-envelope']) {
      expect(meta(file), file).toEqual(expect.objectContaining({ status: 'DRAFT' }));
    }
    expect(meta('pet').version).toBe('3.2.0'); // 008 (#21, D8-12 = A): +biography, MINOR aditiva sobre 3.1.0
    expect(meta('backup-envelope').version).toBe('3.3.0'); // 008 (#21): +BackupEnvelopeV33, MINOR aditiva sobre 3.2.0 (007)
    expect(meta('identity').version).toBe('3.3.0'); // 009 (T1241, MINOR aditiva sobre 3.2.0 de 008): +AccountStatus, UserSelfProfile.accountStatus, +AccountStatusView
    expect(meta('media').version).toBe('1.0.0');
  });
});
