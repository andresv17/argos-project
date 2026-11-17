/**
 * Catálogo fijo de razas de perros y gatos (REQ-RAZ-001) y coherencia de `breedCode` / `breed` (INV-RAZ-001).
 * - Solo `CANINE` y `FELINE` tienen catálogo; las otras 6 especies usan `breed` como texto libre y `breedCode` nulo (REQ-RAZ-003).
 * - Con un código de catálogo, `breed` es el rótulo; con `DOG_OTHER` / `CAT_OTHER`, el texto libre (1 a 60) o «Otra» (REQ-RAZ-002).
 * - Una raza retirada pasa a `deprecated: true`: deja de ofrecerse pero sigue siendo válida en datos existentes.
 * - Ninguna función clínica (peso, edad, alertas) lee `breedCode` ni `breed` (INV-RAZ-002).
 * El catálogo sale de `src/generated/catalogs/` (compilado por `scripts/compile-contracts.sh --feature 004`).
 *
 * @implements REQ-RAZ-001, REQ-RAZ-002, REQ-RAZ-003, INV-RAZ-001, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001
 */

import { BREEDS } from '../../generated/catalogs/index.ts';
import { DomainError } from '../../generated/index.ts';

/** Entrada del catálogo; el tipo ancho permite probar con catálogos alternos (razas retiradas). */
export interface BreedEntry {
  readonly code: string;
  readonly species: string;
  readonly label: string;
  readonly order: number;
  readonly deprecated: boolean;
}
export type BreedCatalog = readonly BreedEntry[];

const BREED_MAX = 60;
const OTHER_LABEL = 'Otra';

/** `true` para `CANINE` y `FELINE` (las únicas con catálogo). @implements REQ-RAZ-003 */
export function hasBreedCatalog(species: string): boolean {
  return species === 'CANINE' || species === 'FELINE';
}

/** `true` para `DOG_OTHER` y `CAT_OTHER` (raza con texto libre opcional). @implements REQ-RAZ-002 */
export function isBreedOther(breedCode: string): boolean {
  return breedCode === 'DOG_OTHER' || breedCode === 'CAT_OTHER';
}

/** Razas vigentes de la especie, en el orden del catálogo: «Criolla» primero, «Otra» al final. @implements REQ-RAZ-001 */
export function breedOptions(species: string, catalog: BreedCatalog = BREEDS): readonly BreedEntry[] {
  if (!hasBreedCatalog(species)) return [];
  return catalog
    .filter((entry) => entry.species === species && !entry.deprecated)
    .slice()
    .sort((a, b) => a.order - b.order);
}

function failBreed(field: 'breed' | 'breedCode', detail: string): never {
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);
}

function assertFreeBreedText(text: string): void {
  if (text.length < 1 || text.length > BREED_MAX) failBreed('breed', `breed debe tener entre 1 y ${BREED_MAX} caracteres (INV-RAZ-001).`);
}

/**
 * Deriva `breed` desde un código de catálogo: el rótulo; con `*_OTHER`, el texto libre recortado o «Otra».
 * Un `breed` distinto del rótulo (con un código que no es `*_OTHER`) o un código fuera del catálogo se rechazan.
 * @implements REQ-RAZ-002, REQ-RAZ-003, INV-RAZ-001
 */
export function deriveBreed(breedCode: string, breed: string | null | undefined, catalog: BreedCatalog = BREEDS): string {
  const entry = catalog.find((candidate) => candidate.code === breedCode);
  if (entry === undefined) failBreed('breedCode', `breedCode ${breedCode} no pertenece al catálogo de razas (INV-RAZ-001).`);
  if (isBreedOther(breedCode)) {
    if (breed === undefined || breed === null) return OTHER_LABEL;
    const text = breed.trim();
    assertFreeBreedText(text);
    return text;
  }
  if (breed !== undefined && breed !== null && breed !== entry.label) failBreed('breed', `breed debe ser el rótulo del catálogo («${entry.label}») cuando hay breedCode (INV-RAZ-001).`);
  return entry.label;
}

/**
 * INV-RAZ-001: `breedCode` no nulo ⇒ especie con catálogo, código de esa especie y `breed` coherente con el rótulo (o el
 * texto libre de `*_OTHER`); `breedCode` nulo ⇒ `breed` es texto libre válido (1 a 60).
 * @implements INV-RAZ-001, REQ-RAZ-003
 */
export function assertBreedConsistency(species: string, breedCode: string | null | undefined, breed: string, catalog: BreedCatalog = BREEDS): void {
  if (breedCode === null || breedCode === undefined) {
    assertFreeBreedText(breed);
    return;
  }
  const entry = catalog.find((candidate) => candidate.code === breedCode);
  if (!hasBreedCatalog(species) || entry === undefined || entry.species !== species) {
    failBreed('breedCode', `breedCode ${breedCode} no corresponde a la especie ${species} (INV-RAZ-001).`);
  }
  if (isBreedOther(breedCode)) {
    assertFreeBreedText(breed);
    return;
  }
  if (breed !== entry.label) failBreed('breed', `breed debe ser el rótulo del catálogo («${entry.label}») cuando hay breedCode (INV-RAZ-001).`);
}
