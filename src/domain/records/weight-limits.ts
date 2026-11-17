/**
 * Límites de peso por especie en gramos enteros (INV-REC2-002, ADR-002-09, SC-013).
 * - CANINE y FELINE: 0.05 a 150.00 kg, máx. 2 decimales (50 a 150000 g, múltiplos de 10 g).
 * - RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL y OTHER: 0.001 a 150.000 kg, máx. 3 decimales (1 a 150000 g).
 * El mínimo de 0.001 kg y los decimales están decididos (7B); la cota superior de 150 kg de las seis especies
 * pequeñas es PROVISIONAL, a validar por un veterinario (M1): es una cota de plausibilidad de captura, no un límite
 * clínico. Sin alertas automáticas de peso ni de edad para ninguna especie (STATE-ALERT-001).
 * La conversión kg → gramos usa la representación decimal (toFixed), nunca multiplicar flotantes (EDGE-034).
 * La tabla replica `SpeciesWeightLimits` de medical-records.schema.json; los tests la comparan con el contrato.
 *
 * @implements INV-REC2-002, REQ-REC2-001, ERR-REC-WEIGHT-OUT-OF-RANGE, INV-ARCH-001
 */

import { DomainError, type Species } from '../../generated/index.ts';

export interface SpeciesWeightLimit {
  readonly minGrams: number;
  readonly maxGrams: number;
  /** Decimales máximos del peso en kg (2 → múltiplos de 10 g; 3 → gramos). */
  readonly decimals: 2 | 3;
  /** true cuando la cota máxima está pendiente de validar por un veterinario (M1). */
  readonly maxIsProvisional: boolean;
}

const CANINE_FELINE: SpeciesWeightLimit = { minGrams: 50, maxGrams: 150000, decimals: 2, maxIsProvisional: false };
// T231 PENDIENTE: el máximo de 150 kg de las especies pequeñas es provisional hasta que lo valide un veterinario (M1).
const SMALL_SPECIES: SpeciesWeightLimit = { minGrams: 1, maxGrams: 150000, decimals: 3, maxIsProvisional: true };

export const SPECIES_WEIGHT_LIMITS: Readonly<Record<Species, SpeciesWeightLimit>> = {
  CANINE: CANINE_FELINE,
  FELINE: CANINE_FELINE,
  RABBIT: SMALL_SPECIES,
  FERRET: SMALL_SPECIES,
  BIRD: SMALL_SPECIES,
  REPTILE: SMALL_SPECIES,
  SMALL_MAMMAL: SMALL_SPECIES,
  OTHER: SMALL_SPECIES,
};

/**
 * Peso en gramos enteros a partir de kg con a lo sumo 3 decimales, sin multiplicar flotantes. Un valor con más de 3
 * decimales no es convertible exactamente: el llamador debe validar antes (assertWeightWithinSpeciesLimits).
 * @implements REQ-REC2-001, INV-REC2-002
 */
export function weightKgToGrams(weightKg: number): number {
  return Number(weightKg.toFixed(3).replace('.', ''));
}

/** kg desde gramos enteros: un solo paso de coma flotante, exacto en el redondeo a 3 decimales. @implements REQ-REC2-001 */
export function gramsToKg(grams: number): number {
  return grams / 1000;
}

/**
 * Valida el peso con la tabla de la especie y devuelve los gramos. Fuera de rango, con más decimales de los que admite la
 * especie o no finito → ERR-REC-WEIGHT-OUT-OF-RANGE (campo weightKg).
 * @implements INV-REC2-002, SC-013, ERR-REC-WEIGHT-OUT-OF-RANGE
 */
export function assertWeightWithinSpeciesLimits(species: Species, weightKg: number, field = 'weightKg'): number {
  const limit = SPECIES_WEIGHT_LIMITS[species];
  const grams = Number.isFinite(weightKg) ? weightKgToGrams(weightKg) : Number.NaN;
  const exact = Number.isFinite(grams) && gramsToKg(grams) === weightKg;
  const unit = 10 ** (3 - limit.decimals);
  if (!exact || grams < limit.minGrams || grams > limit.maxGrams || grams % unit !== 0) {
    throw new DomainError(
      'ERR-REC-WEIGHT-OUT-OF-RANGE',
      `${field} debe estar entre ${gramsToKg(limit.minGrams)} y ${gramsToKg(limit.maxGrams)} kg con a lo sumo ${limit.decimals} decimales para ${species}.`,
      field,
    );
  }
  return grams;
}
